import {z} from 'zod';
import {proAccountRateLimit,proActor,proBoundedJson,proFail,proInternalFinanceDenied,proQuery,proRequestOrigin,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {sendTransactionalEmail,settleTransactionalEmail,transactionalBusinessName,transactionalEmailLocaleOf} from '@/lib/pro/transactional-email';
import {einvoicePipelineMutationSchema,einvoicePipelineReadSchema,einvoiceReceiverReadSchema} from '@/lib/pro/integrations/hacienda/api';
import {buildFromDraft} from '@/lib/pro/integrations/hacienda/document';
import {EinvoiceError,creditNote,debitNote,documentFull,emitFromDraft,haciendaMode,loadDraft,pipelineInfo,pollDocument,readForDraft,receiverList,receiverMessage,receiverPoll} from '@/lib/pro/integrations/hacienda/service';
import {prefijoDeIdioma} from '@/lib/prefijo-de-idioma';
import {getTranslations} from 'next-intl/server';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Ronda F2-A: electronic-invoice pipeline behind the provider adapter (src/lib/pro/einvoice). Owner, Administrador and
// Gerente only (finance.write in the team gate + proInternalFinanceDenied). GET ?draftId= (documents, validation,
// provider, mode) · GET ?view=received (receiver messages). POST emit | poll | credit_note | debit_note |
// receiver_message | receiver_poll. Mock by default: the response always states the mode; nothing reaches Hacienda
// or GTI unless the server env configures a real provider (it does not today).
const light=(doc:Record<string,unknown>)=>Object.fromEntries(Object.entries(doc).filter(([key])=>!['xml','signedXml','responseXml','snapshot'].includes(key)));
const draftQuery=z.object({draftId:z.string().uuid()}).strict(),receivedQuery=z.object({view:z.literal('received')}).strict();
const MESSAGES:Record<string,string>={pro_einvoice_emitted:'Este borrador ya tiene un comprobante emitido. Para corregirlo emita una nota de crédito.',pro_einvoice_settings:'Complete los datos del emisor en Empresa › Facturación electrónica.',
 pro_einvoice_archived:'Restaure el borrador antes de emitir.',pro_einvoice_reference_state:'Solo se acredita o debita una factura o tiquete ACEPTADO por Hacienda.',pro_einvoice_credit_exceeds:'La nota supera lo que queda por acreditar del original.',
 pro_einvoice_reference_cancelled:'El original fue anulado con una nota de crédito: no admite notas de débito.',pro_einvoice_debit_amount:'La nota de débito debe ser mayor que cero.',
 pro_einvoice_totals:'El total cambió. Vuelva a abrir el borrador.',pro_einvoice_receiver_answered:'Ese comprobante recibido ya tiene una respuesta vigente.',pro_einvoice_receiver_clave:'La clave no corresponde a la identificación del emisor.',
 pro_einvoice_receiver_own:'No se responde un comprobante emitido por su propia empresa.',missing_keys:'Faltan las claves de Hacienda en el servidor para el modo elegido.',production_refused:'Producción no está habilitada en este servidor.',
 disabled:'La integración con Hacienda está desactivada en Empresa › Integraciones.',mode_changed:'El modo de Hacienda cambió desde que se reservó este comprobante.',provider_refused:'El proveedor elegido no está disponible en este servidor. Se sigue en modo de prueba.'};
function failure(error:unknown){
 if(error instanceof EinvoiceError){
  const status=error.status;
  return Response.json({error:MESSAGES[error.reason]??(status===409?'El borrador o el comprobante cambiaron. Actualice y vuelva a intentarlo.':error.reason==='validation'?error.message:'No se pudo completar la operación.'),reason:error.reason,issues:error.issues},{status,headers});
 }
 return proFail(503,'No se pudo comprobar la emisión. Reintente la misma operación: no se duplicará.');
}
const devOnly=()=>!PRO_ENABLED?new Response(null,{status:404,headers}):null;
export async function GET(req:Request){
 const off=devOnly();if(off)return off;
 try{
  const a=await proActor(req);if(a.error)return a.error;const denied=await proInternalFinanceDenied();if(denied)return denied;
  const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  if(receivedQuery.safeParse(raw).success){
   const settings=(await a.db.rpc('pro_einvoice_read',{p_actor:a.user.id,p_draft:null}));if(settings.error)return failure(new EinvoiceError(settings.error.code==='42501'?403:503,settings.error.code||'db','db'));
   const emisor=(settings.data as {settings:null|Parameters<typeof pipelineInfo>[2]}).settings;
   return Response.json(einvoiceReceiverReadSchema.parse({messages:await receiverList(a.db,a.user.id),pipeline:await pipelineInfo(a.db,a.user.id,emisor),settingsReady:!!emisor}),{headers});
  }
  const q=draftQuery.safeParse(raw);if(!q.success)return proFail(400,'Consulta inválida.');
  const [draft,read,mode]=await Promise.all([loadDraft(a.db,a.user.id,q.data.draftId),readForDraft(a.db,a.user.id,q.data.draftId),haciendaMode(a.db,a.user.id)]);
  const check=(type:'01'|'04')=>{const built=buildFromDraft(draft,read.settings,type);return built.ok?[]:built.issues;};
  const originalLines:Record<string,{number:number;detail:string;lineTotal:string}[]>={};
  for(const doc of read.documents.filter(row=>(row.docType==='01'||row.docType==='04')&&row.status==='aceptado')){const full=await documentFull(a.db,a.user.id,doc.id);originalLines[doc.id]=full.snapshot.lines.map(line=>({number:line.number,detail:line.detail,lineTotal:line.lineTotal}));}
  return Response.json(einvoicePipelineReadSchema.parse({...read,mode:mode.mode,modeStatus:mode.status,issues:{'01':check('01'),'04':check('04')},originalLines,pipeline:await pipelineInfo(a.db,a.user.id,read.settings)}),{headers});
 }catch(error){return failure(error);}
}
export async function POST(req:Request){
 const off=devOnly();if(off)return off;
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const denied=await proInternalFinanceDenied();if(denied)return denied;
  const limited=await proAccountRateLimit('invoice-einvoice',a.user.id,30,60000);if(limited)return limited;
  let raw:unknown;try{raw=await proBoundedJson(req,16384);}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos.');}
  const input=einvoicePipelineMutationSchema.safeParse(raw);if(!input.success)return Response.json({error:input.error.issues[0]?.message||'Revise los datos.',reason:'invalid'},{status:400,headers});
  const body=input.data;
  if(body.action==='emit'){
   const doc=await emitFromDraft(a.db,a.user.id,body);
   // Same receiver notice as /api/pro/einvoice (mock outbox by default, idempotent per document, never blocks).
   const issued=['enviado','recibido','procesando','aceptado'].includes(doc.status),locale=transactionalEmailLocaleOf(req);
   const tx=await getTranslations({locale,namespace:'ProRouteCopy'});
   const email=issued?await settleTransactionalEmail(async()=>sendTransactionalEmail({kind:'invoice_issued',eventId:doc.id,to:doc.snapshot?.receptor?.email,locale,actorId:a.user.id,revealRecipient:true,
    data:{actorName:await transactionalBusinessName(a.db,a.user.id),subjectName:(doc.docType==='04'?tx('electronicTicket'):tx('electronicInvoice'))+' '+doc.consecutivo,link:proRequestOrigin(req)+prefijoDeIdioma(locale)+'/dashboard/profesional?tab=sent_projects&mode=use'}})):null;
   return Response.json({document:light(doc),...(email?{email}:{})},{headers});
  }
  if(body.action==='poll')return Response.json({document:light(await pollDocument(a.db,a.user.id,body))},{headers});
  if(body.action==='credit_note')return Response.json({document:light(await creditNote(a.db,a.user.id,body))},{headers});
  if(body.action==='debit_note')return Response.json({document:light(await debitNote(a.db,a.user.id,body))},{headers});
  if(body.action==='receiver_message')return Response.json({message:light(await receiverMessage(a.db,a.user.id,body))},{headers});
  return Response.json({message:light(await receiverPoll(a.db,a.user.id,body))},{headers});
 }catch(error){return failure(error);}
}
