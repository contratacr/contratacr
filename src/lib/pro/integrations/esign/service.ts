import 'server-only';
import {createHash} from 'node:crypto';
import type {createAdminClient} from '@/lib/supabase/admin';
import {BidPortalConfigError,bidPortalHash} from '@/lib/pro/bid-portal-server';
import {logOutbound,providerSecrets,resolveMode,storedMode} from '../server';
import {providerConfig} from '../registry';
import {redact} from '../redact';
import {verifyWebhook} from '../webhook';
import {letterDigest,MOCK_ESIGN_SECRET,mockEvent,type EsignEvent} from './events';
export {MOCK_ESIGN_SECRET,mockEvent,type EsignEvent};
import {certificatePdf,originalPdf,pdfSha256,signedPdf,type AuditEvent,type Snapshot} from './document';
import {DocusignClient} from './docusign';

/**
 * Round 6B: electronic signature flow. create (frozen snapshot) → send (provider) → provider events through
 * the 6A webhook inbox (idempotent by event id) → pro_esign_event_apply. On «completed» the signed PDF and the
 * audit certificate are stored in the same transaction. The mock provider emits HMAC-signed events from the
 * local signer page; DocuSign (sandbox) is only used with every env var present.
 */
type Db=ReturnType<typeof createAdminClient>;
export class EsignError extends Error{constructor(readonly status:number,readonly reason:string,message:string){super(message);this.name='EsignError';}}
export async function esignRpc<T>(db:Db,name:string,args:Record<string,unknown>):Promise<T>{
 const result=await db.rpc(name,args);
 if(result.error){const e=result.error as {code?:string;hint?:string;message?:string};throw new EsignError(e.code==='40001'||e.code==='23505'?409:e.code==='42501'?403:e.code==='P0002'?404:e.code==='22023'||e.code==='23514'?400:503,e.hint||e.code||'db',e.message||'db');}
 return result.data as T;
}
export type EsignRequest={id:string;documentKind:string;documentId:string;documentLabel:string;documentHash:string;signerName:string;signerEmail:string;language:'es'|'en';mode:'mock'|'sandbox'|'production';envelopeId:string|null;status:string;expiresAt:string;sentAt:string|null;viewedAt:string|null;completedAt:string|null;revision:number;events:{seq:number;status:string;source:string;at:string;detail:Record<string,unknown>}[];artifacts:{kind:string;sha256:string;bytes:number}[];snapshot?:Snapshot};
export const mockEnvelopeId=(requestId:string)=>'env_'+letterDigest('ccr-esign-envelope:'+requestId);
export const signerTokenHash=(token:string)=>createHash('sha256').update('ccr-esign-signer:v1:'+token,'utf8').digest('hex');
/** Mock signer link token, derived from the server secret: the owner can reopen it while the request is live. */
export function mockSignerToken(owner:string,requestId:string){
 try{return Buffer.from(bidPortalHash(`esign-signer:${owner}:${requestId}`,'link'),'hex').toString('base64url');}
 catch(error){if(error instanceof BidPortalConfigError)throw new EsignError(503,'unavailable','La firma simulada no está disponible en este servidor.');throw error;}
}
export const mockSignerUrl=(origin:string,token:string)=>`${origin}/api/pro/esign/mock-sign?t=${token}`;
export async function esignMode(db:Db,owner:string){return resolveMode('esign',await storedMode(db,owner,'esign'));}
async function esignConfig(db:Db,owner:string){
 const read=await db.rpc('pro_integration_read',{p_actor:owner});
 const row=(read.data as {connections?:{provider:string;config:Record<string,unknown>}[]}|null)?.connections?.find(c=>c.provider==='esign');
 return providerConfig('esign',row?.config) as {expiryDays:number;reminderDays:number};
}

export async function createAndSend(db:Db,owner:string,input:{actionId:string;documentKind:'contract'|'quote'|'work_change';documentId:string;signerName:string;signerEmail:string;language:'es'|'en';expiryDays?:number},origin:string){
 const resolved=await esignMode(db,owner);
 if(resolved.status!=='ready')throw new EsignError(409,resolved.status,resolved.status==='missing_keys'?'Faltan las claves del proveedor de firma en el servidor.':resolved.status==='production_refused'?'Producción no está permitida en este servidor.':'La firma electrónica está desactivada.');
 const config=await esignConfig(db,owner);
 const created=await esignRpc<{id:string}>(db,'pro_esign_create',{p_actor:owner,p_mode:resolved.mode,p_input:{action:'create',actionId:input.actionId,documentKind:input.documentKind,documentId:input.documentId,signerName:input.signerName,signerEmail:input.signerEmail,language:input.language,expiryDays:input.expiryDays??config.expiryDays}});
 const request=await requestById(db,owner,created.id);
 if(request.status!=='created'&&request.status!=='error')return request;
 return send(db,owner,request,origin,config);
}
async function requestById(db:Db,owner:string,id:string):Promise<EsignRequest&{snapshot:Snapshot}>{
 const row=await db.from('pro_esign_requests').select('id,document_kind,snapshot').eq('owner_id',owner).eq('id',id).maybeSingle();
 if(row.error||!row.data)throw new EsignError(404,'not_found','Solicitud no encontrada.');
 const read=await esignRpc<{requests:EsignRequest[]}>(db,'pro_esign_read',{p_actor:owner,p_kind:row.data.document_kind,p_id:(row.data.snapshot as Snapshot).documentId});
 const request=read.requests.find(r=>r.id===id);if(!request)throw new EsignError(404,'not_found','Solicitud no encontrada.');
 return {...request,snapshot:row.data.snapshot as Snapshot};
}
async function send(db:Db,owner:string,request:EsignRequest&{snapshot:Snapshot},origin:string,config:{expiryDays:number;reminderDays:number}){
 const pdf=originalPdf({...request.snapshot,language:request.language},request.mode),started=Date.now();
 if(request.mode==='mock'){
  const envelopeId=mockEnvelopeId(request.id),token=mockSignerToken(owner,request.id);
  await logOutbound(db,owner,{provider:'esign',mode:'mock',operation:'envelope_create',url:'https://esign.mock.local/envelopes',statusCode:201,outcome:'ok',durationMs:Date.now()-started,correlation:envelopeId,summary:{document:request.documentKind,bytes:pdf.length}});
  await esignRpc(db,'pro_esign_mark_sent',{p_actor:owner,p_id:request.id,p_ok:true,p_envelope:envelopeId,p_token_hash:signerTokenHash(token),p_error:null});
  return requestById(db,owner,request.id);
 }
 const secrets=providerSecrets('esign',request.mode);
 if(!secrets)throw new EsignError(409,'missing_keys','Faltan las claves del proveedor de firma en el servidor.');
 const client=new DocusignClient(request.mode,secrets);
 try{
  const sent=await client.send({pdf,name:request.documentLabel+'.pdf',subject:request.documentLabel,signerName:request.signerName,signerEmail:request.signerEmail,expiryDays:Math.max(1,Math.round((new Date(request.expiresAt).getTime()-Date.now())/86400000)),reminderDays:config.reminderDays,webhookUrl:origin+'/api/pro/integrations/webhooks/esign',requestId:request.id});
  await esignRpc(db,'pro_esign_mark_sent',{p_actor:owner,p_id:request.id,p_ok:true,p_envelope:sent.envelopeId,p_token_hash:null,p_error:null});
 }catch{await esignRpc(db,'pro_esign_mark_sent',{p_actor:owner,p_id:request.id,p_ok:false,p_envelope:null,p_token_hash:null,p_error:'No se pudo enviar al proveedor'});}
 finally{for(const call of client.calls.splice(0))await logOutbound(db,owner,{provider:'esign',mode:request.mode,operation:call.operation,url:call.url,statusCode:call.status,outcome:call.outcome,durationMs:call.durationMs,correlation:request.id});}
 return requestById(db,owner,request.id);
}
export async function retrySend(db:Db,owner:string,id:string,origin:string){
 const request=await requestById(db,owner,id);
 if(request.status!=='error'&&request.status!=='created')return request;
 return send(db,owner,request,origin,await esignConfig(db,owner));
}
export async function cancelRequest(db:Db,owner:string,input:{actionId:string;id:string;revision:number}){
 const before=await requestById(db,owner,input.id);
 await esignRpc(db,'pro_esign_cancel',{p_actor:owner,p_input:{action:'cancel',actionId:input.actionId,id:input.id,revision:input.revision}});
 if(before.envelopeId&&before.mode!=='mock'){
  const secrets=providerSecrets('esign',before.mode);
  if(secrets){const client=new DocusignClient(before.mode,secrets);try{await client.void(before.envelopeId,'Anulada por el profesional');}catch{/* the local request is already cancelled */}
   for(const call of client.calls.splice(0))await logOutbound(db,owner,{provider:'esign',mode:before.mode,operation:call.operation,url:call.url,statusCode:call.status,outcome:call.outcome,durationMs:call.durationMs,correlation:input.id});}
 }else if(before.envelopeId)await logOutbound(db,owner,{provider:'esign',mode:'mock',operation:'envelope_void',url:'https://esign.mock.local/envelopes/void',statusCode:200,outcome:'ok',durationMs:0,correlation:before.envelopeId});
 return requestById(db,owner,input.id);
}

// ---------- events (mock and real share the inbox + apply) ----------
type Routed={ownerId:string;id:string;status:string;mode:'mock'|'sandbox'|'production';snapshot:Snapshot;signerName:string;signerEmail:string;language:'es'|'en';envelopeId:string};
export type EsignOutcome={status:number;body:{status:string;duplicate?:boolean;review?:string|null;reason?:string;requestStatus?:string}};
/** Inbox + apply for one event. documents() is called only for «completed» (mock renders; DocuSign downloads). */
export async function receiveEvent(db:Db,mode:'mock'|'sandbox'|'production',event:EsignEvent,documents:(routed:Routed,event:EsignEvent)=>Promise<{pdf:Buffer;certificate:Buffer}>):Promise<EsignOutcome>{
 const routed=await esignRpc<Routed|null>(db,'pro_esign_by_envelope',{p_mode:mode,p_envelope:event.envelopeId});
 let inbox:{id:string;duplicate:boolean;status:string};
 try{inbox=await esignRpc(db,'pro_integration_webhook_receive',{p_provider:'esign',p_mode:mode,p_event_id:event.id,p_event_type:'envelope.'+event.status,p_owner:routed?.ownerId??null,p_payload:redact(event)});}
 catch(error){if(error instanceof EsignError&&error.reason==='pro_integration_webhook_conflict')return {status:409,body:{status:'rejected',reason:'event_id_conflict'}};throw error;}
 if(inbox.duplicate&&(inbox.status==='processed'||inbox.status==='ignored'))return {status:200,body:{status:inbox.status,duplicate:true}};
 let pdf:Buffer|null=null,certificate:Buffer|null=null;
 try{
  if(routed&&event.status==='completed'&&(routed.status==='sent'||routed.status==='viewed')){const docs=await documents(routed,event);pdf=docs.pdf;certificate=docs.certificate;}
  const applied=await db.rpc('pro_esign_event_apply',{p_webhook:inbox.id,p_pdf:pdf?'\\x'+pdf.toString('hex'):null,p_certificate:certificate?'\\x'+certificate.toString('hex'):null});
  if(applied.error)throw Error(applied.error.message);
  const data=applied.data as {status:string;duplicate:boolean;review:string|null;requestStatus?:string};
  return {status:200,body:{status:data.status,duplicate:inbox.duplicate||data.duplicate,review:data.review,requestStatus:data.requestStatus}};
 }catch(error){
  await db.rpc('pro_integration_webhook_fail',{p_id:inbox.id,p_error:(error instanceof Error?error.message:'error').slice(0,300)});
  return {status:500,body:{status:'failed',reason:'retry'}};
 }
}
/** Mock documents: signed PDF + certificate rendered from the frozen snapshot and the event history. */
export async function mockDocuments(db:Db,routed:Routed,event:EsignEvent){
 const events=await db.from('pro_esign_events').select('status,source,at,detail').eq('owner_id',routed.ownerId).eq('request_id',routed.id).order('seq');
 const snapshot={...routed.snapshot,language:routed.language},original=originalPdf(snapshot,'mock');
 const pdf=signedPdf(snapshot,{envelopeId:routed.envelopeId,typedName:event.typedName??routed.signerName,signedAt:event.at,mode:'mock'});
 const history:AuditEvent[]=[...((events.data??[]) as AuditEvent[]),{status:'signed',source:'provider',at:event.at}];
 const certificate=certificatePdf(snapshot,{envelopeId:routed.envelopeId,mode:'mock',provider:'Simulación local',signerName:routed.signerName,signerEmail:routed.signerEmail,events:history,signedSha256:pdfSha256(pdf),originalSha256:pdfSha256(original)});
 return {pdf,certificate};
}
export async function receiveMockEvent(db:Db,body:string,signature:string|null):Promise<EsignOutcome>{
 const check=verifyWebhook(MOCK_ESIGN_SECRET,body,signature);
 if(!check.ok){await db.rpc('pro_integration_webhook_reject',{p_provider:'esign',p_reason:'signature_'+check.reason});return {status:401,body:{status:'rejected',reason:check.reason}};}
 let event:EsignEvent;
 try{event=JSON.parse(body) as EsignEvent;if(!/^evt_[a-p]{24}$/.test(event.id)||!/^env_[a-p]{24}$/.test(event.envelopeId)||!['sent','delivered','completed','declined','voided','expired'].includes(event.status)||Number.isNaN(Date.parse(event.at)))throw Error();}
 catch{await db.rpc('pro_integration_webhook_reject',{p_provider:'esign',p_reason:'malformed'});return {status:400,body:{status:'rejected',reason:'malformed'}};}
 return receiveEvent(db,'mock',event,(routed,ev)=>mockDocuments(db,routed,ev));
}
/** Mock signer page actions → signed events through the same inbox path as the HTTP webhook. */
export async function mockSignerAction(db:Db,token:string,action:'view'|'sign'|'decline',extra:{typedName?:string;reason?:string}){
 const view=await esignRpc<{envelopeId:string;status:string}|null>(db,'pro_esign_signer_view',{p_token_hash:signerTokenHash(token)});
 if(!view)throw new EsignError(404,'not_found','Enlace de firma no válido.');
 const status=action==='view'?'delivered':action==='sign'?'completed':'declined';
 const signed=mockEvent(view.envelopeId,status,action==='sign'?{typedName:extra.typedName}:action==='decline'?{reason:extra.reason}:{});
 return receiveMockEvent(db,signed.body,signed.signature);
}
