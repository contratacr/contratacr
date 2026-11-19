import {MESSAGE_NAMESPACE} from './codes';
import {xmlText} from './xml';

/**
 * Round 6A: ATV «Recepción de comprobantes» adapter (Anexo 3 v4.4 + ComprobantesElectronicosAPI).
 * POST /recepcion {clave, fecha, emisor, receptor?, comprobanteXml(base64)} → 201/202 received;
 * GET /recepcion/{clave} → {ind-estado: recibido|procesando|aceptado|rechazado|error, respuesta-xml}.
 *
 * MockAtv — deterministic fixtures by RECEPTOR identification (documented for the owner):
 *   999999999  → rechazado (Mensaje 3, «receptor no inscrito», simulated)
 *   888888888  → first submission fails with a transient 503 (then retry succeeds) → aceptado
 *   anything else, or a ticket without receptor → recibido, then aceptado (Mensaje 1)
 * Sandbox/production clients live in atv-remote.ts (server only) and are used only with env keys.
 */
export const MOCK_REJECT_ID='999999999',MOCK_TRANSIENT_ID='888888888';
export type AtvSubmission={clave:string;issuedAt:string;emisor:{type:string;number:string;name:string};receptor:{type:string;number:string;name:string}|null;signedXml:string;totalComprobante:string;totalImpuesto:string;attempt:number};
export type AtvSubmitResult={outcome:'sent';status:number;message:string}|{outcome:'error';status:number;message:string;transient:boolean};
export type AtvState={state:'recibido'|'procesando'|'aceptado'|'rechazado'|'error';status:number;responseXml?:string;responseCode?:1|2|3;message:string};
export interface AtvClient{readonly mode:'mock'|'sandbox'|'production';submit(input:AtvSubmission):Promise<AtvSubmitResult>;status(input:AtvSubmission):Promise<AtvState>;}
export function mensajeHaciendaXml(input:AtvSubmission,code:1|3,detail:string){
 const el=(name:string,value:string)=>value?`<${name}>${xmlText(value)}</${name}>`:'';
 return `<?xml version="1.0" encoding="utf-8"?><MensajeHacienda xmlns="${MESSAGE_NAMESPACE}">`+el('Clave',input.clave)+el('NombreEmisor',input.emisor.name)+el('TipoIdentificacionEmisor',input.emisor.type)+el('NumeroCedulaEmisor',input.emisor.number)
  +(input.receptor?el('NombreReceptor',input.receptor.name)+el('TipoIdentificacionReceptor',input.receptor.type)+el('NumeroCedulaReceptor',input.receptor.number):'')
  +el('Mensaje',String(code))+el('EstadoMensaje',code===1?'Aceptado':'Rechazado')+el('DetalleMensaje',detail)+el('MontoTotalImpuesto',input.totalImpuesto)+el('TotalFactura',input.totalComprobante)+'</MensajeHacienda>';
}
export class MockAtv implements AtvClient{
 readonly mode='mock' as const;
 async submit(input:AtvSubmission):Promise<AtvSubmitResult>{
  if(!input.signedXml.includes('<ds:Signature'))return {outcome:'error',status:400,message:'Simulación: el comprobante no está firmado.',transient:false};
  if(input.receptor?.number===MOCK_TRANSIENT_ID&&input.attempt<=1)return {outcome:'error',status:503,message:'Simulación: el servicio de Hacienda no respondió (503). Se reintentará.',transient:true};
  return {outcome:'sent',status:202,message:'Simulación: comprobante recibido.'};
 }
 async status(input:AtvSubmission):Promise<AtvState>{
  if(input.receptor?.number===MOCK_REJECT_ID)return {state:'rechazado',status:200,responseCode:3,message:'Simulación: el receptor no está inscrito en el padrón de contribuyentes.',responseXml:mensajeHaciendaXml(input,3,'SIMULACIÓN LOCAL — sin validez fiscal. Receptor no inscrito.')};
  return {state:'aceptado',status:200,responseCode:1,message:'Simulación: comprobante aceptado.',responseXml:mensajeHaciendaXml(input,1,'SIMULACIÓN LOCAL — sin validez fiscal. Aceptado.')};
 }
}
