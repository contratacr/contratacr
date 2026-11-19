import {z} from 'zod';
import {RECEIVER_MESSAGE_DOC_TYPES,RECEIVER_MESSAGE_NAMESPACE,idNumberValid,type ReceiverMessageCode} from '../integrations/hacienda/codes';
import {money5} from '../integrations/hacienda/document';
import {xmlText} from '../integrations/hacienda/xml';

/**
 * Ronda F2-A: MensajeReceptor v4.4 — the professional's answer to an electronic document RECEIVED from a supplier:
 * 1 aceptación (05), 2 aceptación parcial (06), 3 rechazo (07). Element order per «Anexos y Estructuras v4.4»;
 * CondicionImpuesto / MontoTotalImpuestoAcreditar / MontoTotalDeGastoAplicable are marked «validar con XSD oficial»
 * in docs/pro/einvoice-pipeline-local.md. Amounts are integer cents in, 5-decimal strings out.
 */
const clave=z.string().regex(/^506\d{6}[A-Za-z0-9]{12}\d{20}[123]\d{8}$/,'La clave tiene 50 caracteres y empieza con 506.');
export const receiverMessageInputSchema=z.object({
 receivedClave:clave,emisorIdType:z.enum(['01','02','03','04','05']),emisorId:z.string().trim().regex(/^[A-Za-z0-9]{9,20}$/),emisorName:z.string().trim().min(3).max(100),
 receivedIssuedAt:z.string().datetime({offset:true}),receivedTotalCents:z.number().int().min(0).max(10000000000),receivedTaxCents:z.number().int().min(0).max(10000000000),
 messageCode:z.enum(['1','2','3']),detail:z.union([z.literal(''),z.string().trim().min(5).max(160)]),taxCondition:z.union([z.literal(''),z.enum(['01','02','03','04','05'])]),
 creditTaxCents:z.number().int().min(0).nullable(),expenseCents:z.number().int().min(0).nullable(),
}).strict().superRefine((value,ctx)=>{
 if(!idNumberValid(value.emisorIdType,value.emisorId))ctx.addIssue({code:'custom',path:['emisorId'],message:'La identificación del emisor no coincide con su tipo.'});
 if(value.messageCode!=='1'&&!value.detail)ctx.addIssue({code:'custom',path:['detail'],message:'Explique el motivo (5 a 160 caracteres).'});
 if(value.messageCode==='2'&&(value.creditTaxCents===null||value.creditTaxCents>value.receivedTaxCents))ctx.addIssue({code:'custom',path:['creditTaxCents'],message:'En aceptación parcial indique el IVA a acreditar (no mayor que el del comprobante).'});
 if(value.receivedTaxCents>value.receivedTotalCents)ctx.addIssue({code:'custom',path:['receivedTaxCents'],message:'El impuesto no puede superar el total.'});
 if(value.receivedClave.slice(9,21)!==value.emisorId.padStart(12,'0'))ctx.addIssue({code:'custom',path:['receivedClave'],message:'La clave no corresponde a la identificación del emisor.'});
});
export type ReceiverMessageInput=z.infer<typeof receiverMessageInputSchema>;
const cents5=(cents:number)=>money5(BigInt(cents)*BigInt(1000));
export function buildReceiverMessageXml(input:ReceiverMessageInput&{receptorId:string;activityCode:string;consecutivo:string}){
 const el=(name:string,value:string|null|undefined)=>value===null||value===undefined||value===''?'':`<${name}>${xmlText(value)}</${name}>`;
 if(!/^\d{8}(05|06|07)\d{10}$/.test(input.consecutivo)||input.consecutivo.slice(8,10)!==RECEIVER_MESSAGE_DOC_TYPES[input.messageCode as ReceiverMessageCode])throw RangeError('consecutivo');
 return `<MensajeReceptor xmlns="${RECEIVER_MESSAGE_NAMESPACE}">`+el('Clave',input.receivedClave)+el('NumeroCedulaEmisor',input.emisorId)+el('FechaEmisionDoc',input.receivedIssuedAt)
  +el('Mensaje',input.messageCode)+el('DetalleMensaje',input.detail)+el('MontoTotalImpuesto',cents5(input.receivedTaxCents))+el('CodigoActividad',input.activityCode)
  +el('CondicionImpuesto',input.taxCondition)+(input.creditTaxCents!==null?el('MontoTotalImpuestoAcreditar',cents5(input.creditTaxCents)):'')+(input.expenseCents!==null?el('MontoTotalDeGastoAplicable',cents5(input.expenseCents)):'')
  +el('TotalFactura',cents5(input.receivedTotalCents))+el('NumeroCedulaReceptor',input.receptorId)+el('NumeroConsecutivoReceptor',input.consecutivo)+'</MensajeReceptor>';
}
