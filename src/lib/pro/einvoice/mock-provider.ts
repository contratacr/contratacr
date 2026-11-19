import {createHash} from 'node:crypto';
import {MESSAGE_NAMESPACE} from '../integrations/hacienda/codes';
import {xmlText} from '../integrations/hacienda/xml';
import type {DocumentSubmission,EinvoiceProvider,IssueResult,ReceiverSubmission,StatusResult} from './provider';

/**
 * Ronda F2-A: deterministic LOCAL simulator of Hacienda's asynchronous reception (no network, no clock, no state of its
 * own: the answer depends only on the submission and on what the pipeline already recorded for it).
 *
 *   issue      → 202 «recibido»; resubmitting a known clave → 400 «ya fue recibido» (duplicate, never a 2nd document)
 *   getStatus  → 1st query «procesando»; next query the final answer: «aceptado» (Mensaje 1) or «rechazado» (Mensaje 3)
 *
 * Fixtures (documented for the owner, docs/pro/einvoice-pipeline-local.md):
 *   receptor 999999999      → rechazado: receptor no inscrito
 *   receptor 888888888      → 1st submission 503 (transient), retry → received
 *   receptor 777777777      → 1st submission times out although Hacienda got it; the retry answers «ya recibido»
 *   receptor 666666666      → 2nd status query returns «error» (processing error at Hacienda); the next one answers
 *   CAByS 9999999999999     → rechazado: código CAByS inexistente
 *   activity 999999         → rechazado: actividad económica no inscrita
 *   arithmetic of the XML   → rechazado when TotalComprobante ≠ TotalVentaNeta + TotalImpuesto + TotalOtrosCargos − TotalIVADevuelto,
 *                             or when the clave does not match NumeroConsecutivo / FechaEmision
 *   unsigned XML            → 400 at reception (not transient)
 *   receiver message whose received clave has supplier 000999999999 → rechazado: comprobante referido inexistente
 * Every answer says «SIMULACIÓN LOCAL — sin validez fiscal».
 */
export const MOCK_EINVOICE_FIXTURES={reject:'999999999',transient:'888888888',timeout:'777777777',processingError:'666666666',rejectCabys:'9999999999999',rejectActivity:'999999',missingSupplier:'000999999999'} as const;
const SIM='SIMULACIÓN LOCAL — sin validez fiscal.';
const sha=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex');
const KNOWN=['enviado','recibido','procesando','aceptado','rechazado'];
const tag=(xml:string,name:string)=>new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1]??null;
const tags=(xml:string,name:string)=>[...xml.matchAll(new RegExp(`<${name}>([^<]*)</${name}>`,'g'))].map(match=>match[1]!);
const units=(value:string|null)=>{if(value===null)return BigInt(0);const match=/^(-?)(\d+)(?:\.(\d{1,5}))?$/.exec(value);if(!match)return null;const out=BigInt(match[2]!)*BigInt(100000)+BigInt((match[3]??'').padEnd(5,'0')||'0');return match[1]?-out:out;};

/** Reasons Hacienda would give for this XML (empty = valid for the simulator). Exported for unit tests. */
export function mockRejections(input:DocumentSubmission):string[]{
 const xml=input.signedXml,out:string[]=[];
 if(input.receptor?.number===MOCK_EINVOICE_FIXTURES.reject)out.push('El receptor no se encuentra inscrito en el padrón de contribuyentes.');
 if(tags(xml,'CodigoCABYS').includes(MOCK_EINVOICE_FIXTURES.rejectCabys))out.push('El código CAByS '+MOCK_EINVOICE_FIXTURES.rejectCabys+' no existe en el catálogo vigente.');
 if(tag(xml,'CodigoActividadEmisor')===MOCK_EINVOICE_FIXTURES.rejectActivity)out.push('La actividad económica '+MOCK_EINVOICE_FIXTURES.rejectActivity+' no está inscrita para el emisor.');
 const [net,tax,charges,returned,total]=['TotalVentaNeta','TotalImpuesto','TotalOtrosCargos','TotalIVADevuelto','TotalComprobante'].map(name=>units(tag(xml,name)));
 if(net===null||tax===null||charges===null||returned===null||total===null||tag(xml,'TotalComprobante')===null||net+tax+charges-returned!==total)out.push('Los totales del resumen no cuadran (TotalComprobante).');
 const consecutivo=tag(xml,'NumeroConsecutivo'),fecha=tag(xml,'FechaEmision');
 if(consecutivo!==input.consecutivo||input.clave.slice(21,41)!==consecutivo)out.push('La clave no corresponde al número consecutivo.');
 const date=fecha?/^(\d{4})-(\d{2})-(\d{2})T/.exec(fecha):null;
 if(!date||input.clave.slice(3,9)!==date[3]!+date[2]!+date[1]!.slice(2))out.push('La clave no corresponde a la fecha de emisión.');
 return out;
}
function mensajeHacienda(clave:string,emisor:{type:string;number:string;name:string},receptor:{type:string;number:string;name:string}|null,code:1|3,detail:string,totalImpuesto:string,total:string){
 const el=(name:string,value:string)=>value?`<${name}>${xmlText(value)}</${name}>`:'';
 return `<?xml version="1.0" encoding="utf-8"?><MensajeHacienda xmlns="${MESSAGE_NAMESPACE}">`+el('Clave',clave)+el('NombreEmisor',emisor.name)+el('TipoIdentificacionEmisor',emisor.type)+el('NumeroCedulaEmisor',emisor.number)
  +(receptor?el('NombreReceptor',receptor.name)+el('TipoIdentificacionReceptor',receptor.type)+el('NumeroCedulaReceptor',receptor.number):'')
  +el('Mensaje',String(code))+el('EstadoMensaje',code===1?'Aceptado':'Rechazado')+el('DetalleMensaje',SIM+' '+detail)+el('MontoTotalImpuesto',totalImpuesto)+el('TotalFactura',total)+'</MensajeHacienda>';
}
function received(input:{signedXml:string;attempt:number;currentStatus:string;receptor:{number:string}|null}):IssueResult{
 if(!input.signedXml.includes('<ds:Signature'))return {outcome:'error',httpStatus:400,message:'Simulación: el comprobante no está firmado (X-Error-Cause: firma ausente).',transient:false,timedOut:false};
 if(KNOWN.includes(input.currentStatus))return {outcome:'duplicate',httpStatus:400,message:'Simulación: el comprobante ya fue recibido anteriormente; se consulta su estado.',transient:false,timedOut:false};
 const receptor=input.receptor?.number;
 if(receptor===MOCK_EINVOICE_FIXTURES.timeout)return input.attempt<=1
  ?{outcome:'error',httpStatus:0,message:'Simulación: Hacienda no respondió a tiempo (15 s). Se reintentará sin duplicar.',transient:true,timedOut:true}
  :{outcome:'duplicate',httpStatus:400,message:'Simulación: el comprobante ya fue recibido anteriormente (el primer envío sí llegó).',transient:false,timedOut:false};
 if(receptor===MOCK_EINVOICE_FIXTURES.transient&&input.attempt<=1)return {outcome:'error',httpStatus:503,message:'Simulación: el servicio de Hacienda no está disponible (503). Se reintentará.',transient:true,timedOut:false};
 return {outcome:'received',httpStatus:202,message:'Simulación: comprobante recibido por Hacienda.',transient:false,timedOut:false};
}
export class MockEinvoiceProvider implements EinvoiceProvider{
 readonly id='mock' as const;readonly mode='mock' as const;
 async issue(input:DocumentSubmission){const out=received(input);return {...out,bodySha256:sha(out.message)};}
 async cancel(input:DocumentSubmission){return this.issue(input);}
 async getStatus(input:DocumentSubmission):Promise<StatusResult>{
  if(input.currentStatus==='enviado'||input.currentStatus==='recibido')return {state:'procesando',httpStatus:200,message:'Simulación: Hacienda está procesando el comprobante.',reasons:[]};
  if(input.receptor?.number===MOCK_EINVOICE_FIXTURES.processingError&&input.currentStatus==='procesando'&&!input.priorProcessingError)
   return {state:'error',httpStatus:200,message:'Simulación: Hacienda informó un error de procesamiento. Consulte de nuevo.',reasons:[]};
  const reasons=mockRejections(input);
  const party=input.receptor&&input.receptor.number?input.receptor:null;
  const responseXml=mensajeHacienda(input.clave,input.emisor,party,reasons.length?3:1,reasons.length?reasons.join(' '):'Aceptado.',input.totalImpuesto,input.totalComprobante);
  return reasons.length
   ?{state:'rechazado',httpStatus:200,responseCode:3,message:'Simulación: rechazado. '+reasons.join(' '),responseXml,reasons,bodySha256:sha(responseXml)}
   :{state:'aceptado',httpStatus:200,responseCode:1,message:'Simulación: comprobante aceptado.',responseXml,reasons,bodySha256:sha(responseXml)};
 }
 async receiverMessage(input:ReceiverSubmission){const out=received({...input,receptor:null});return {...out,bodySha256:sha(out.message)};}
 async receiverStatus(input:ReceiverSubmission):Promise<StatusResult>{
  if(input.currentStatus==='enviado'||input.currentStatus==='recibido')return {state:'procesando',httpStatus:200,message:'Simulación: Hacienda está procesando el mensaje.',reasons:[]};
  const reasons=input.receivedClave.slice(9,21)===MOCK_EINVOICE_FIXTURES.missingSupplier?['El comprobante referido no existe en Hacienda.']:[];
  const responseXml=mensajeHacienda(input.receivedClave,input.emisor,input.receptor,reasons.length?3:1,reasons.length?reasons.join(' '):'Mensaje del receptor aceptado.','0.00000','0.00000');
  return reasons.length?{state:'rechazado',httpStatus:200,responseCode:3,message:'Simulación: mensaje rechazado. '+reasons.join(' '),responseXml,reasons,bodySha256:sha(responseXml)}
   :{state:'aceptado',httpStatus:200,responseCode:1,message:'Simulación: mensaje del receptor aceptado.',responseXml,reasons,bodySha256:sha(responseXml)};
 }
}
