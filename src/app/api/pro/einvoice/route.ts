import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proFail,proQuery,proRequestOrigin,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {sendTransactionalEmail,settleTransactionalEmail,transactionalBusinessName,transactionalEmailLocaleOf} from '@/lib/pro/transactional-email';
import {einvoiceMutationSchema,einvoiceReadSchema} from '@/lib/pro/integrations/hacienda/api';
import {buildFromDraft,blankEmisor,type EmisorSettings} from '@/lib/pro/integrations/hacienda/document';
import {EinvoiceError,creditNote,documentFull,emitFromDraft,haciendaMode,loadDraft,pollDocument,readForDraft,saveSettings} from '@/lib/pro/integrations/hacienda/service';
import {prefijoDeIdioma} from '@/lib/prefijo-de-idioma';
import {getTranslations} from 'next-intl/server';

// Round 6A: Hacienda electronic invoices from a draft. GET ?draftId= (documents, validation per type, mode)
// · GET ?view=settings (emisor data). POST emit | poll | credit_note | save_settings. Mock by default; the
// response always states the mode. Nothing reaches Hacienda unless sandbox/production keys exist.
/** Responses never carry the XML (download it from /api/pro/einvoice-file). */
const light=(doc:Record<string,unknown>)=>Object.fromEntries(Object.entries(doc).filter(([key])=>!['xml','signedXml','responseXml','snapshot'].includes(key)));
const draftQuery=z.object({draftId:z.string().uuid()}).strict(),settingsQuery=z.object({view:z.literal('settings')}).strict();
function failure(error:unknown){
 if(error instanceof EinvoiceError){
  const messages:Record<string,string>={pro_einvoice_emitted:'Este borrador ya tiene un comprobante emitido. Para corregirlo emita una nota de crédito.',pro_einvoice_settings:'Complete los datos del emisor en Empresa › Integraciones.',
   pro_einvoice_archived:'Restaure el borrador antes de emitir.',pro_einvoice_reference_state:'Solo se acredita una factura o tiquete ACEPTADO por Hacienda.',pro_einvoice_credit_exceeds:'La nota supera lo que queda por acreditar del original.',
   pro_einvoice_totals:'El total cambió. Vuelva a abrir el borrador.',missing_keys:'Faltan las claves de Hacienda en el servidor para el modo elegido. Siga la guía de configuración.',production_refused:'Producción no está habilitada en este servidor.',
   disabled:'La integración con Hacienda está desactivada en Empresa › Integraciones.',mode_changed:'El modo de Hacienda cambió desde que se reservó este comprobante.'};
  const status=error.status===409&&error.reason==='40001'?409:error.status;
  return Response.json({error:messages[error.reason]??(status===409?'El borrador o el comprobante cambiaron. Actualice y vuelva a intentarlo.':error.reason==='validation'?error.message:'No se pudo completar la operación.'),reason:error.reason,issues:error.issues},{status,headers});
 }
 return proFail(503,'No se pudo comprobar la emisión. Reintente la misma operación: no se duplicará.');
}
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  if(settingsQuery.safeParse(raw).success){
   const read=await a.db.rpc('pro_einvoice_read',{p_actor:a.user.id,p_draft:null});if(read.error)return failure(new EinvoiceError(read.error.code==='42501'?403:503,read.error.code||'db','db'));
   // Suggested values from the invoice issuer settings (Round 4B) and the business; nothing saved until the owner saves.
   const issuer=await a.db.rpc('pro_invoice_issuer_read',{p_user:a.user.id});
   const i=(issuer.data as {issuer?:Record<string,string>}|null)?.issuer??{};
   const idType=({individual:'01',company:'02',dimex:'03',nite:'04'} as Record<string,EmisorSettings['idType']>)[i.issuerIdType??'']??blankEmisor().idType;
   const idNumber=(i.issuerId??'').replace(/[\s-]/g,'');
   const defaults:Partial<EmisorSettings>={idType,idNumber,name:(i.issuerName??'').slice(0,100),email:i.issuerEmail??'',phone:(i.issuerPhone??'').replace(/\D/g,'').replace(/^506(?=\d{8}$)/,''),activityCode:/^\d{6}$/.test((i.issuerActivity??'').replace(/\D/g,''))?(i.issuerActivity??'').replace(/\D/g,''):'',otherSigns:(i.issuerAddress??'').slice(0,250),providerSystems:idNumber};
   return Response.json({...(read.data as object),defaults},{headers});
  }
  const q=draftQuery.safeParse(raw);if(!q.success)return proFail(400,'Consulta inválida.');
  const [draft,read,mode]=await Promise.all([loadDraft(a.db,a.user.id,q.data.draftId),readForDraft(a.db,a.user.id,q.data.draftId),haciendaMode(a.db,a.user.id)]);
  const check=(type:'01'|'04')=>{const built=buildFromDraft(draft,read.settings,type);return built.ok?[]:built.issues;};
  const originalLines:Record<string,{number:number;detail:string;lineTotal:string}[]>={};
  for(const doc of read.documents.filter(row=>row.docType!=='03'&&row.status==='aceptado')){const full=await documentFull(a.db,a.user.id,doc.id);originalLines[doc.id]=full.snapshot.lines.map(line=>({number:line.number,detail:line.detail,lineTotal:line.lineTotal}));}
  return Response.json(einvoiceReadSchema.parse({...read,mode:mode.mode,modeStatus:mode.status,issues:{'01':check('01'),'04':check('04')},originalLines}),{headers});
 }catch(error){return failure(error);}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'einvoice-'+a.user.id,30,60000);if(limited)return limited;
  let raw:unknown;try{raw=await proBoundedJson(req,16384);}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos.');}
  const input=einvoiceMutationSchema.safeParse(raw);if(!input.success)return Response.json({error:input.error.issues[0]?.message||'Revise los datos.',reason:'invalid'},{status:400,headers});
  const body=input.data;
  if(body.action==='save_settings')return Response.json(await saveSettings(a.db,a.user.id,body),{headers});
  if(body.action==='emit'){
   const doc=await emitFromDraft(a.db,a.user.id,body);
   // Launch fix I5: tell the receiver (e-mail typed on the draft) that the invoice was issued — mock outbox by
   // default, idempotent per document, never blocks or fails the emission. No XML or attachment is sent.
   const issued=['enviado','recibido','aceptado'].includes(doc.status),locale=transactionalEmailLocaleOf(req);
   const tx=await getTranslations({locale,namespace:'ProRouteCopy'});
   const email=issued?await settleTransactionalEmail(async()=>sendTransactionalEmail({kind:'invoice_issued',eventId:doc.id,to:doc.snapshot?.receptor?.email,locale,actorId:a.user.id,revealRecipient:true,
    data:{actorName:await transactionalBusinessName(a.db,a.user.id),subjectName:(doc.docType==='04'?tx('electronicTicket'):tx('electronicInvoice'))+' '+doc.consecutivo,link:proRequestOrigin(req)+prefijoDeIdioma(locale)+'/dashboard/profesional?tab=sent_projects&mode=use'}})):null;
   return Response.json({document:light(doc),...(email?{email}:{})},{headers});
  }
  if(body.action==='poll')return Response.json({document:light(await pollDocument(a.db,a.user.id,body))},{headers});
  return Response.json({document:light(await creditNote(a.db,a.user.id,body))},{headers});
 }catch(error){return failure(error);}
}
