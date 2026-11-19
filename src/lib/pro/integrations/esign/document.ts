import {createHash} from 'node:crypto';
import {textPdf,type PdfLine} from './pdf';

/**
 * Round 6B: PDFs of a signature request, rendered from the FROZEN snapshot (pro_esign_requests.snapshot).
 * · original: the document sent to sign (contains the DocuSign anchor «/firma1/» in white text);
 * · signed (mock only — real providers return their own signed PDF): original + signature page;
 * · certificate: audit trail (hashes, events in Costa Rica time, provider, mode).
 */
export type Snapshot={kind:'contract'|'quote'|'work_change';documentId:string;label:string;title:string;version:number;clientName:string;clientEmail:string;language:'es'|'en';currency:string;totalCents:number|null;content:Record<string,unknown>;contentHash:string};
export type AuditEvent={status:string;source:string;at:string;detail?:Record<string,unknown>};
export const SIGN_ANCHOR='/firma1/';
const sha=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
export function moneyText(cents:number|null|undefined,currency='CRC'){
 if(typeof cents!=='number'||!Number.isFinite(cents))return '-';
 const negative=cents<0,abs=Math.abs(Math.round(cents)),int=String(Math.floor(abs/100)).replace(/\B(?=(\d{3})+(?!\d))/g,','),dec=String(abs%100).padStart(2,'0');
 return `${negative?'-':''}${currency==='USD'?'USD':'CRC'} ${int}.${dec}`;
}
export const crTime=(iso:string,en:boolean)=>new Date(iso).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'medium'}).replace(/\s/g,' ')+(en?' (Costa Rica time)':' (hora de Costa Rica)');
const str=(value:unknown)=>typeof value==='string'?value:typeof value==='number'?String(value):'';
function body(s:Snapshot,en:boolean):PdfLine[]{
 const t=(es:string,english:string)=>en?english:es,c=s.content,out:PdfLine[]=[];
 const kind=s.kind==='contract'?t('Contrato','Contract'):s.kind==='quote'?t('Cotización','Quote'):t('Orden de cambio','Change order');
 out.push({text:kind+' · '+s.label,bold:true,size:15},{text:t('Cliente: ','Customer: ')+s.clientName,gap:6});
 if(s.kind==='contract'){
  const company=c.company as Record<string,unknown>|undefined,project=c.project as Record<string,unknown>|undefined,estimate=c.estimate as Record<string,unknown>|null|undefined;
  if(company)out.push({text:t('Empresa: ','Company: ')+str(company.name)+(company.identification?' · '+str(company.identification):'')});
  if(project)out.push({text:t('Proyecto: ','Project: ')+str(project.name)+(project.address?' · '+str(project.address):'')});
  if(estimate)out.push({text:t('Cotización vinculada: ','Linked quote: ')+str(estimate.code)+' · '+moneyText(Number(estimate.totalCents),str(estimate.currency))});
  if(c.depositPercent!==null&&c.depositPercent!==undefined)out.push({text:t('Anticipo: ','Deposit: ')+str(c.depositPercent)+' %'});
  for(const clause of (c.clauses as {position:number;title:string;body:string}[]|undefined)??[])out.push({text:`${clause.position}. ${clause.title}`,bold:true,gap:8},{text:clause.body});
 }else if(s.kind==='quote'){
  for(const line of (c.lines as Record<string,unknown>[]|undefined)??[])out.push({text:`· ${str(line.description||line.name||line.title)}  ${line.quantity?'x'+str(line.quantity):''}  ${moneyText(Number(line.totalCents??line.lineTotalCents??line.amountCents),s.currency)}`});
  out.push({text:t('Subtotal: ','Subtotal: ')+moneyText(Number(c.subtotalCents),s.currency),gap:6},{text:t('Descuento: ','Discount: ')+moneyText(Number(c.discountCents),s.currency)},{text:t('Impuestos: ','Taxes: ')+moneyText(Number(c.taxCents),s.currency)});
  if(c.validUntil)out.push({text:t('Válida hasta: ','Valid until: ')+str(c.validUntil)});
  if(c.notes)out.push({text:str(c.notes),gap:6});
 }else{
  out.push({text:t('Motivo: ','Reason: ')+str(c.reason)},{text:t('Proyecto: ','Project: ')+str(c.project)});
  for(const line of (c.lines as {description:string;amountCents:number}[]|undefined)??[])out.push({text:`· ${line.description}  ${moneyText(line.amountCents,'CRC')}`});
  out.push({text:t('Acuerdo anterior: ','Previous agreement: ')+moneyText(Number(c.baseCents)),gap:6},{text:t('Nuevo total: ','New total: ')+moneyText(Number(c.totalCents)),bold:true});
 }
 out.push({text:t('Total: ','Total: ')+moneyText(s.totalCents,s.currency),bold:true,gap:8});
 out.push({text:t('Huella del documento (SHA-256): ','Document fingerprint (SHA-256): ')+s.contentHash,size:8,color:'gray',gap:10});
 return out;
}
export function originalPdf(s:Snapshot,mode:string){
 const en=s.language==='en',t=(es:string,english:string)=>en?english:es;
 return textPdf([...body(s,en),{text:t('Firma del cliente:','Customer signature:'),bold:true,gap:24},{text:SIGN_ANCHOR,color:'white',size:8},{text:'______________________________'},{text:s.clientName}],
  (mode==='mock'?t('SIMULACIÓN · ','SIMULATION · '):'')+s.label);
}
export function signedPdf(s:Snapshot,input:{envelopeId:string;typedName:string;signedAt:string;mode:string}){
 const en=s.language==='en',t=(es:string,english:string)=>en?english:es,original=originalPdf(s,input.mode);
 return textPdf([...body(s,en),
  {text:t('Firmado electrónicamente','Electronically signed'),bold:true,size:13,gap:24},
  {text:t('Nombre escrito por quien firma: ','Name typed by the signer: ')+input.typedName},{text:t('Correo: ','Email: ')+s.clientEmail},
  {text:t('Fecha y hora: ','Date and time: ')+crTime(input.signedAt,en)},{text:t('Sobre: ','Envelope: ')+input.envelopeId},
  {text:t('SHA-256 del documento enviado: ','SHA-256 of the document sent: ')+sha(original),size:8,color:'gray'},
  ...(input.mode==='mock'?[{text:t('SIMULACIÓN LOCAL: esta firma no tiene validez legal. No se envió nada a ningún proveedor de firma.','LOCAL SIMULATION: this signature has no legal value. Nothing was sent to any signature provider.'),bold:true,gap:10} as PdfLine]:[])],
  (input.mode==='mock'?t('SIMULACIÓN · ','SIMULATION · '):'')+s.label+' · '+t('firmado','signed'));
}
export function certificatePdf(s:Snapshot,input:{envelopeId:string;mode:string;provider:string;signerName:string;signerEmail:string;events:AuditEvent[];signedSha256:string;originalSha256:string}){
 const en=s.language==='en',t=(es:string,english:string)=>en?english:es;
 const label:Record<string,string>=en?{created:'Request created',sent:'Sent to the signer',viewed:'Opened by the signer',signed:'Signed',declined:'Declined',expired:'Expired',cancelled:'Cancelled',error:'Sending error'}:{created:'Solicitud creada',sent:'Enviada a quien firma',viewed:'Abierta por quien firma',signed:'Firmada',declined:'Rechazada',expired:'Vencida',cancelled:'Anulada',error:'Error de envío'};
 return textPdf([
  {text:t('Certificado de auditoría de firma electrónica','Electronic signature audit certificate'),bold:true,size:15},
  {text:s.label,gap:6},{text:t('Proveedor: ','Provider: ')+input.provider+' · '+t('modo ','mode ')+input.mode},{text:t('Sobre: ','Envelope: ')+input.envelopeId},
  {text:t('Quien firma: ','Signer: ')+input.signerName+' <'+input.signerEmail+'>'},
  {text:t('Huella del contenido congelado (SHA-256): ','Frozen content fingerprint (SHA-256): ')+s.contentHash,size:8,gap:6},
  {text:t('SHA-256 del PDF enviado: ','SHA-256 of the PDF sent: ')+input.originalSha256,size:8},{text:t('SHA-256 del PDF firmado: ','SHA-256 of the signed PDF: ')+input.signedSha256,size:8},
  {text:t('Historial','History'),bold:true,gap:10},
  ...input.events.map(event=>({text:`${crTime(event.at,en)} · ${label[event.status]??event.status} · ${event.source==='provider'?t('proveedor','provider'):event.source==='owner'?t('profesional','professional'):t('sistema','system')}`} as PdfLine)),
  {text:t('Este certificado se guarda sin cambios junto al PDF firmado. La validez legal de una firma electrónica en Costa Rica debe confirmarla un abogado (Ley 8454).','This certificate is stored unchanged with the signed PDF. The legal validity of an electronic signature in Costa Rica must be confirmed by a lawyer (Law 8454).'),size:9,color:'gray',gap:10},
  ...(input.mode==='mock'?[{text:t('SIMULACIÓN LOCAL: sin validez legal.','LOCAL SIMULATION: no legal value.'),bold:true} as PdfLine]:[]),
 ],(input.mode==='mock'?t('SIMULACIÓN · ','SIMULATION · '):'')+t('Certificado · ','Certificate · ')+input.envelopeId);
}
export const pdfSha256=sha;
