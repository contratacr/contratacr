import 'server-only';
import {readFileSync} from 'node:fs';
import type {createAdminClient} from '@/lib/supabase/admin';
import type {InvoiceDraft} from '@/lib/pro/invoice-drafts';
import {logOutbound,providerSecrets,resolveMode,storedMode} from '../server';
import {derivedId} from '../ids';
import {MockAtv} from './atv';
import {RemoteAtv} from './atv-remote';
import {buildClave,crIsoTimestamp,securityCodeFor} from './clave';
import {buildCreditNote,buildDebitNote,buildFromDraft,emisorSettingsSchema,type EinvoiceModel,type EmisorSettings,type ValidationIssue} from './document';
import {readPkcs12} from './pkcs12';
import {MockSigner,XadesSigner,type EinvoiceSigner} from './signer';
import {buildEinvoiceXml,wellFormed} from './xml';
import type {EinvoiceDocument,EinvoicePipelineInfo,EinvoiceReceiverMessage} from './api';
import {EinvoiceProviderRefused,einvoiceProviderFor,resolveEinvoiceProvider,type DocumentSubmission,type EinvoiceProvider,type EinvoiceProviderId,type IssueResult,type ReceiverSubmission,type StatusResult} from '@/lib/pro/einvoice';
import {buildReceiverMessageXml,receiverMessageInputSchema} from '@/lib/pro/einvoice/receiver-message';

/**
 * Round 6A + Ronda F2-A: e-invoice orchestration behind the PROVIDER adapter (src/lib/pro/einvoice).
 * validate → reserve (SQL composes consecutivo/clave) → XML → sign → provider.issue → recibido; «poll» asks
 * provider.getStatus (procesando → aceptado | rechazado) and retries a failed submission (backoff in SQL). Every step
 * is idempotent (derived action ids); every adapter call is recorded (pro_einvoice_provider_responses) and logged
 * redacted. Mode resolved on every call: mock unless the owner chose sandbox/production AND the server env allows the
 * chosen provider. A mock document always uses the local simulator; nothing reaches Hacienda or GTI from mock.
 */
type Db=ReturnType<typeof createAdminClient>;
export class EinvoiceError extends Error{constructor(readonly status:number,readonly reason:string,message:string,readonly issues:ValidationIssue[]=[]){super(message);this.name='EinvoiceError';}}
type FullDocument=EinvoiceDocument&{xml:string|null;signedXml:string|null;responseXml:string|null;snapshot:EinvoiceModel};
type FullReceiver=EinvoiceReceiverMessage&{xml:string|null;signedXml:string|null;responseXml:string|null};
async function rpc<T>(db:Db,name:string,args:Record<string,unknown>):Promise<T>{
 const result=await db.rpc(name,args);
 if(result.error){const e=result.error as {code?:string;hint?:string;message?:string};throw new EinvoiceError(e.code==='40001'?409:e.code==='42501'?403:e.code==='22023'||e.code==='23514'?400:503,e.hint||e.code||'db',e.message||'db');}
 return result.data as T;
}
export async function haciendaMode(db:Db,owner:string){return resolveMode('hacienda',await storedMode(db,owner,'hacienda'));}
function requireReady(mode:Awaited<ReturnType<typeof haciendaMode>>){
 if(mode.status==='production_refused')throw new EinvoiceError(403,'production_refused','La producción no está habilitada en este servidor.');
 if(mode.status==='missing_keys')throw new EinvoiceError(409,'missing_keys','Faltan las claves de Hacienda para este modo en el servidor.');
 if(mode.status==='disabled')throw new EinvoiceError(409,'disabled','La integración con Hacienda está desactivada.');
}
function signerFor(mode:'mock'|'sandbox'|'production'):EinvoiceSigner{
 if(mode==='mock')return new MockSigner();
 const secrets=providerSecrets('hacienda',mode);if(!secrets)throw new EinvoiceError(409,'missing_keys','Faltan las claves de Hacienda.');
 const prefix=mode==='production'?'PRO_HACIENDA_PROD_':'PRO_HACIENDA_SANDBOX_';
 const material=readPkcs12(readFileSync(secrets[prefix+'P12_PATH']!),secrets[prefix+'P12_PIN']!);
 return new XadesSigner(material.key,material.certificate,material.certificateDer);
}
/** The provider a NEW document will use: mock ⇔ mock mode; otherwise the emisor's provider (Hacienda directly by default). */
function providerIdFor(mode:'mock'|'sandbox'|'production',settings:EmisorSettings|null):EinvoiceProviderId{
 if(mode==='mock')return 'mock';
 return settings?.provider&&settings.provider!=='mock'?settings.provider:'hacienda-sandbox';
}
function adapter(doc:{mode:'mock'|'sandbox'|'production';provider:EinvoiceProviderId}):EinvoiceProvider{
 try{return einvoiceProviderFor(doc.mode,doc.provider);}catch(error){throw refused(error);}
}
function refused(error:unknown){
 if(error instanceof EinvoiceProviderRefused)return new EinvoiceError(409,'provider_refused',error.reason==='not_implemented'?'El proveedor elegido todavía no está disponible.':'El proveedor elegido no está configurado en este servidor.');
 return error;
}
async function call<T>(work:()=>Promise<T>){try{return await work();}catch(error){throw refused(error);}}
/** Same document mode as when reserved, and still allowed on this server (sandbox/production only). */
async function stillAllowed(db:Db,owner:string,mode:'mock'|'sandbox'|'production'){
 if(mode==='mock')return;
 const current=await haciendaMode(db,owner);if(current.mode!==mode)throw new EinvoiceError(409,'mode_changed','El modo de Hacienda cambió desde que se reservó este comprobante.');requireReady(current);
}
export async function loadDraft(db:Db,owner:string,draftId:string){
 const draft=await rpc<InvoiceDraft|null>(db,'pro_invoice_extras_read',{p_user:owner,p_id:draftId,p_after:null});
 if(!draft)throw new EinvoiceError(404,'not_found','Borrador no encontrado.');
 return draft;
}
type Read={settings:EmisorSettings|null;settingsRevision:number;draftRevision:number;draftTotalCents:number;documents:EinvoiceDocument[];credited:Record<string,number>;debited?:Record<string,number>};
export async function readForDraft(db:Db,owner:string,draftId:string){
 const read=await rpc<Read|null>(db,'pro_einvoice_read',{p_actor:owner,p_draft:draftId});
 if(!read)throw new EinvoiceError(404,'not_found','Borrador no encontrado.');
 return read;
}
export async function documentFull(db:Db,owner:string,id:string){
 const doc=await rpc<FullDocument|null>(db,'pro_einvoice_document_read',{p_actor:owner,p_id:id});
 if(!doc)throw new EinvoiceError(404,'not_found','Comprobante no encontrado.');
 return {...doc,provider:doc.provider??'mock'} as FullDocument;
}
/** Provider, mode and server env (names only) for the screens. */
export async function pipelineInfo(db:Db,owner:string,settings:EmisorSettings|null):Promise<EinvoicePipelineInfo>{
 const mode=await haciendaMode(db,owner),env=resolveEinvoiceProvider();
 return {provider:settings?.provider??'mock',mode:mode.mode,test:mode.mode!=='production',env:{provider:env.id,mode:env.mode,status:env.status,missing:env.missing}};
}
const processingError=(events:{from:string|null;to:string}[])=>events.some(event=>event.to==='error'&&(event.from==='recibido'||event.from==='procesando'));
const reachedProvider=(events:{to:string}[])=>events.some(event=>['enviado','recibido','procesando'].includes(event.to));
function submissionOf(doc:FullDocument):DocumentSubmission{
 const m=doc.snapshot;
 return {kind:'document',docType:doc.docType,clave:doc.clave,consecutivo:doc.consecutivo,issuedAt:crIsoTimestamp(new Date(doc.issuedAt)),emisor:{type:m.emisor.idType,number:m.emisor.idNumber,name:m.emisor.name},
  receptor:m.receptor&&m.receptor.idType&&m.receptor.idNumber?{type:m.receptor.idType,number:m.receptor.idNumber,name:m.receptor.name}:null,
  signedXml:doc.signedXml??'',totalComprobante:m.summary.total,totalImpuesto:m.summary.tax,attempt:doc.attempts+1,currentStatus:doc.status,priorProcessingError:processingError(doc.events)};
}
const issueResponse=(provider:EinvoiceProvider,operation:'issue'|'receiver_message',attempt:number,out:IssueResult)=>({provider:provider.id,mode:provider.mode==='live'?'production':provider.mode,operation,attempt,httpStatus:out.httpStatus,
 outcome:out.outcome==='error'&&out.timedOut?'timeout':out.outcome,message:out.message.slice(0,500),bodySha256:out.bodySha256??''});
const statusResponse=(provider:EinvoiceProvider,operation:'status'|'receiver_status',attempt:number,out:StatusResult)=>({provider:provider.id,mode:provider.mode==='live'?'production':provider.mode,operation,attempt,httpStatus:out.httpStatus,
 outcome:'state',state:out.state,message:out.message.slice(0,500),bodySha256:out.bodySha256??''});
async function logCall(db:Db,owner:string,provider:EinvoiceProvider,operation:string,correlation:string,httpStatus:number,ok:boolean,started:number,attempt:number,summary:Record<string,unknown>){
 await logOutbound(db,owner,{provider:'hacienda',mode:provider.mode==='live'?'production':provider.mode,operation:provider.id+':'+operation,url:provider.mode==='mock'?'https://atv.mock.local/recepcion'+(operation.includes('estado')?'/{clave}':''):'https://'+provider.id+'.provider/recepcion',
  statusCode:httpStatus,outcome:ok?'ok':httpStatus===0?'timeout':'error',durationMs:Date.now()-started,attempt,correlation,summary});
}
const submittedOutcome=(out:IssueResult)=>out.outcome==='received'?'sent':out.outcome;
/** Sign (if still reserved), submit and record «recibido». Shared by FE/TE, ND and NC. */
async function continueDocument(db:Db,owner:string,actionId:string,docId:string){
 let doc=await documentFull(db,owner,docId);
 await stillAllowed(db,owner,doc.mode);
 if(doc.status==='borrador'){
  const xml=buildEinvoiceXml(doc.snapshot,{clave:doc.clave,consecutivo:doc.consecutivo,issuedAt:crIsoTimestamp(new Date(doc.issuedAt))});
  if(!wellFormed(xml))throw new EinvoiceError(500,'xml','El XML generado no es válido.');
  const signed=await signerFor(doc.mode).sign(xml,doc.docType,new Date());
  await rpc(db,'pro_einvoice_mutate',{p_actor:owner,p_input:{action:'sign',actionId:derivedId(actionId,'sign:'+docId),documentId:docId,xml,xmlSha256:signed.xmlSha256,signedXml:signed.signedXml,signedSha256:signed.signedSha256,signer:signed.signer}});
  doc=await documentFull(db,owner,docId);
 }
 if(doc.status==='firmado'||doc.status==='error'&&!reachedProvider(doc.events)){
  const provider=adapter(doc),input=submissionOf(doc),started=Date.now();
  const out=await call(()=>doc.docType==='03'?provider.cancel(input):provider.issue(input));
  await logCall(db,owner,provider,'recepcion',doc.clave,out.httpStatus,out.outcome!=='error',started,input.attempt,{docType:doc.docType,consecutivo:doc.consecutivo,outcome:out.outcome});
  await rpc(db,'pro_einvoice_mutate',{p_actor:owner,p_input:{action:'submitted',actionId:derivedId(actionId,`submit:${docId}:${doc.attempts}`),documentId:docId,outcome:submittedOutcome(out),message:out.message,
   response:issueResponse(provider,'issue',input.attempt,out)}});
  doc=await documentFull(db,owner,docId);
  if(doc.status==='enviado')await rpc(db,'pro_einvoice_mutate',{p_actor:owner,p_input:{action:'status',actionId:derivedId(actionId,'received:'+docId),documentId:docId,state:'recibido',message:out.message}});
 }
 return documentFull(db,owner,docId);
}
export async function emitFromDraft(db:Db,owner:string,input:{actionId:string;draftId:string;docType:'01'|'04'}){
 const mode=await haciendaMode(db,owner);requireReady(mode);
 const [draft,read]=await Promise.all([loadDraft(db,owner,input.draftId),readForDraft(db,owner,input.draftId)]);
 // Idempotent retry of the same action: continue the document it reserved.
 const existing=read.documents.find(doc=>doc.id===input.actionId);
 if(!existing){
  const built=buildFromDraft(draft,read.settings,input.docType);
  if(!built.ok)throw new EinvoiceError(400,'validation','Revise los datos antes de emitir.',built.issues);
  await rpc(db,'pro_einvoice_mutate',{p_actor:owner,p_input:{action:'reserve',actionId:input.actionId,draftId:input.draftId,draftRevision:draft.revision,settingsRevision:read.settingsRevision,docType:input.docType,
   mode:mode.mode,provider:providerIdFor(mode.mode,read.settings),securityCode:await securityCodeFor(input.actionId,owner),snapshot:built.model,totalCents:built.totalCents,taxCents:built.taxCents,
   receiverName:built.model.receptor?.name??'',receiverIdType:built.model.receptor?.idType??'',receiverId:built.model.receptor?.idNumber??''}});
 }
 return continueDocument(db,owner,input.actionId,input.actionId);
}
async function noteOriginal(db:Db,owner:string,draftId:string,originalId:string){
 const original=await documentFull(db,owner,originalId);
 if(original.draftId!==draftId||original.docType==='03'||original.docType==='02')throw new EinvoiceError(400,'reference','Elija la factura o el tiquete de este borrador.');
 return original;
}
async function reserveNote(db:Db,owner:string,mode:'mock'|'sandbox'|'production',read:Read,input:{actionId:string;draftId:string;originalId:string},docType:'02'|'03',built:{model:EinvoiceModel;totalCents:number;taxCents:number},reference:{code:string;reason:string}){
 const draft=await loadDraft(db,owner,input.draftId);
 await rpc(db,'pro_einvoice_mutate',{p_actor:owner,p_input:{action:'reserve',actionId:input.actionId,draftId:input.draftId,draftRevision:draft.revision,settingsRevision:read.settingsRevision,docType,
  mode,provider:providerIdFor(mode,read.settings),securityCode:await securityCodeFor(input.actionId,owner),snapshot:built.model,totalCents:built.totalCents,taxCents:built.taxCents,
  receiverName:built.model.receptor?.name??'',receiverIdType:built.model.receptor?.idType??'',receiverId:built.model.receptor?.idNumber??'',
  referenceDocumentId:input.originalId,referenceCode:reference.code,referenceReason:reference.reason}});
}
export async function creditNote(db:Db,owner:string,input:{actionId:string;draftId:string;originalId:string;code:'01'|'02';reason:string;lines:number[]}){
 const mode=await haciendaMode(db,owner);requireReady(mode);
 const read=await readForDraft(db,owner,input.draftId);
 if(!read.documents.some(doc=>doc.id===input.actionId)){
  const original=await noteOriginal(db,owner,input.draftId,input.originalId);
  const built=buildCreditNote(original.snapshot,{clave:original.clave,issuedAt:crIsoTimestamp(new Date(original.issuedAt)),docType:original.docType as '01'|'04'},input);
  if(!built.ok)throw new EinvoiceError(400,'validation','Revise la nota de crédito.',built.issues);
  await reserveNote(db,owner,mode.mode,read,input,'03',built,{code:input.code,reason:input.reason});
 }
 return continueDocument(db,owner,input.actionId,input.actionId);
}
/** Ronda F2-A: debit note (02) against an accepted FE/TE of the draft. */
export async function debitNote(db:Db,owner:string,input:{actionId:string;draftId:string;originalId:string;reason:string;lineNumber:number;amount:string;detail?:string}){
 const mode=await haciendaMode(db,owner);requireReady(mode);
 const read=await readForDraft(db,owner,input.draftId);
 if(!read.documents.some(doc=>doc.id===input.actionId)){
  const original=await noteOriginal(db,owner,input.draftId,input.originalId);
  const built=buildDebitNote(original.snapshot,{clave:original.clave,issuedAt:crIsoTimestamp(new Date(original.issuedAt)),docType:original.docType as '01'|'04'},input);
  if(!built.ok)throw new EinvoiceError(400,'validation','Revise la nota de débito.',built.issues);
  await reserveNote(db,owner,mode.mode,read,input,'02',built,{code:'02',reason:input.reason});
 }
 return continueDocument(db,owner,input.actionId,input.actionId);
}
/** «Consultar estado»: retries a failed submission, then asks the provider for the answer (procesando → final). */
export async function pollDocument(db:Db,owner:string,input:{actionId:string;documentId:string}){
 let doc=await documentFull(db,owner,input.documentId);
 if(doc.status==='aceptado'||doc.status==='rechazado')return doc;
 if(doc.status==='borrador'||doc.status==='firmado'||doc.status==='error'&&!reachedProvider(doc.events))doc=await continueDocument(db,owner,input.actionId,doc.id);
 if(!['enviado','recibido','procesando','error'].includes(doc.status)||doc.status==='error'&&!reachedProvider(doc.events))return doc;
 await stillAllowed(db,owner,doc.mode);
 const provider=adapter(doc),submission=submissionOf(doc),started=Date.now(),state=await call(()=>provider.getStatus(submission)),attempt=Math.max(1,doc.attempts);
 await logCall(db,owner,provider,'estado',doc.clave,state.httpStatus,state.state!=='error',started,attempt,{state:state.state});
 await rpc(db,'pro_einvoice_mutate',{p_actor:owner,p_input:{action:'status',actionId:derivedId(input.actionId,'status:'+doc.id),documentId:doc.id,state:state.state,responseXml:state.responseXml,responseCode:state.responseCode,message:state.message,
  response:statusResponse(provider,'status',attempt,state)}});
 return documentFull(db,owner,doc.id);
}

// ---- Receiver messages (aceptación / rechazo of documents received from suppliers) ----
export async function receiverList(db:Db,owner:string){return (await rpc<{messages:EinvoiceReceiverMessage[]}>(db,'pro_einvoice_receiver_read',{p_actor:owner,p_id:null})).messages;}
export async function receiverFull(db:Db,owner:string,id:string){
 const message=await rpc<FullReceiver|null>(db,'pro_einvoice_receiver_read',{p_actor:owner,p_id:id});
 if(!message)throw new EinvoiceError(404,'not_found','Mensaje no encontrado.');
 return message;
}
async function emisorSettings(db:Db,owner:string){
 const read=await rpc<{settings:EmisorSettings|null}>(db,'pro_einvoice_read',{p_actor:owner,p_draft:null});
 if(!read.settings)throw new EinvoiceError(400,'pro_einvoice_settings','Complete los datos del emisor.');
 return read.settings;
}
function receiverSubmission(m:FullReceiver,settings:EmisorSettings):ReceiverSubmission{
 return {kind:'receiver',receivedClave:m.receivedClave,consecutivoReceptor:m.consecutivo,issuedAt:m.receivedIssuedAt,emisor:{type:m.emisorIdType,number:m.emisorId,name:m.emisorName},
  receptor:{type:settings.idType,number:settings.idNumber,name:settings.name},messageCode:m.messageCode,signedXml:m.signedXml??'',attempt:m.attempts+1,currentStatus:m.status,priorProcessingError:processingError(m.events)};
}
async function continueReceiver(db:Db,owner:string,actionId:string,id:string,settings:EmisorSettings){
 let m=await receiverFull(db,owner,id);
 await stillAllowed(db,owner,m.mode);
 if(m.status==='borrador'){
  const xml=buildReceiverMessageXml({receivedClave:m.receivedClave,emisorIdType:m.emisorIdType as '01',emisorId:m.emisorId,emisorName:m.emisorName,receivedIssuedAt:m.receivedIssuedAt,receivedTotalCents:m.receivedTotalCents,
   receivedTaxCents:m.receivedTaxCents,messageCode:m.messageCode,detail:m.detail??'',taxCondition:(m.taxCondition??'') as '',creditTaxCents:m.creditTaxCents,expenseCents:m.expenseCents,receptorId:settings.idNumber,activityCode:m.activityCode,consecutivo:m.consecutivo});
  if(!wellFormed(xml))throw new EinvoiceError(500,'xml','El XML generado no es válido.');
  const signed=await signerFor(m.mode).sign(xml,'MensajeReceptor',new Date());
  await rpc(db,'pro_einvoice_receiver_mutate',{p_actor:owner,p_input:{action:'sign',actionId:derivedId(actionId,'sign:'+id),messageId:id,xml,xmlSha256:signed.xmlSha256,signedXml:signed.signedXml,signedSha256:signed.signedSha256,signer:signed.signer}});
  m=await receiverFull(db,owner,id);
 }
 if(m.status==='firmado'||m.status==='error'&&!reachedProvider(m.events)){
  const provider=adapter(m),input=receiverSubmission(m,settings),started=Date.now(),out=await call(()=>provider.receiverMessage(input));
  await logCall(db,owner,provider,'mensaje-receptor',m.receivedClave,out.httpStatus,out.outcome!=='error',started,input.attempt,{docType:m.docType,consecutivo:m.consecutivo,outcome:out.outcome});
  await rpc(db,'pro_einvoice_receiver_mutate',{p_actor:owner,p_input:{action:'submitted',actionId:derivedId(actionId,`submit:${id}:${m.attempts}`),messageId:id,outcome:submittedOutcome(out),message:out.message,response:issueResponse(provider,'receiver_message',input.attempt,out)}});
  m=await receiverFull(db,owner,id);
  if(m.status==='enviado')await rpc(db,'pro_einvoice_receiver_mutate',{p_actor:owner,p_input:{action:'status',actionId:derivedId(actionId,'received:'+id),messageId:id,state:'recibido',message:out.message}});
 }
 return receiverFull(db,owner,id);
}
export async function receiverMessage(db:Db,owner:string,input:{actionId:string}&Record<string,unknown>){
 const mode=await haciendaMode(db,owner);requireReady(mode);
 const settings=await emisorSettings(db,owner);
 const existing=(await receiverList(db,owner)).some(row=>row.id===input.actionId);
 if(!existing){
  const parsed=receiverMessageInputSchema.safeParse(Object.fromEntries(Object.entries(input).filter(([key])=>key!=='actionId'&&key!=='action')));
  if(!parsed.success)throw new EinvoiceError(400,'validation','Revise el mensaje.',parsed.error.issues.map(row=>({field:row.path.join('.'),es:row.message,en:row.message})));
  const v=parsed.data;
  await rpc(db,'pro_einvoice_receiver_mutate',{p_actor:owner,p_input:{action:'reserve',actionId:input.actionId,mode:mode.mode,provider:providerIdFor(mode.mode,settings),receivedClave:v.receivedClave,emisorIdType:v.emisorIdType,emisorId:v.emisorId,
   emisorName:v.emisorName,receivedIssuedAt:v.receivedIssuedAt,receivedTotalCents:v.receivedTotalCents,receivedTaxCents:v.receivedTaxCents,messageCode:v.messageCode,detail:v.detail,taxCondition:v.taxCondition,
   creditTaxCents:v.creditTaxCents,expenseCents:v.expenseCents,activityCode:settings.activityCode}});
 }
 return continueReceiver(db,owner,input.actionId,input.actionId,settings);
}
export async function receiverPoll(db:Db,owner:string,input:{actionId:string;messageId:string}){
 const settings=await emisorSettings(db,owner);
 let m=await receiverFull(db,owner,input.messageId);
 if(m.status==='aceptado'||m.status==='rechazado')return m;
 if(m.status==='borrador'||m.status==='firmado'||m.status==='error'&&!reachedProvider(m.events))m=await continueReceiver(db,owner,input.actionId,m.id,settings);
 if(!['enviado','recibido','procesando','error'].includes(m.status)||m.status==='error'&&!reachedProvider(m.events))return m;
 await stillAllowed(db,owner,m.mode);
 const provider=adapter(m),started=Date.now(),state=await call(()=>provider.receiverStatus(receiverSubmission(m,settings))),attempt=Math.max(1,m.attempts);
 await logCall(db,owner,provider,'mensaje-receptor-estado',m.receivedClave,state.httpStatus,state.state!=='error',started,attempt,{state:state.state});
 await rpc(db,'pro_einvoice_receiver_mutate',{p_actor:owner,p_input:{action:'status',actionId:derivedId(input.actionId,'status:'+m.id),messageId:m.id,state:state.state,responseXml:state.responseXml,responseCode:state.responseCode,message:state.message,response:statusResponse(provider,'receiver_status',attempt,state)}});
 return receiverFull(db,owner,m.id);
}
export async function saveSettings(db:Db,owner:string,input:{actionId:string;revision:number;settings:EmisorSettings}){
 const settings=emisorSettingsSchema.parse(input.settings);
 return rpc<{settings:EmisorSettings;settingsRevision:number}>(db,'pro_einvoice_mutate',{p_actor:owner,p_input:{action:'save_settings',actionId:input.actionId,revision:input.revision,settings}});
}
/** «Probar conexión» for Hacienda: build, sign and submit a fixture document through the resolved adapter. */
export async function testHacienda(db:Db,owner:string,mode:'mock'|'sandbox'|'production'){
 const started=Date.now();
 if(mode!=='mock'){
  // Real modes only authenticate (no document is sent by a connection test).
  const secrets=providerSecrets('hacienda',mode);if(!secrets)throw new EinvoiceError(409,'missing_keys','Faltan las claves de Hacienda.');
  const atv=new RemoteAtv(mode,secrets);
  const state=await atv.status({clave:'50601010100000000000000100001010000000001100000001',issuedAt:'',emisor:{type:'',number:'',name:''},receptor:null,signedXml:'',totalComprobante:'0',totalImpuesto:'0',attempt:1}).catch(()=>({state:'error' as const,status:0,message:'Sin respuesta'}));
  for(const call of atv.calls.splice(0))await logOutbound(db,owner,{provider:'hacienda',mode,operation:'prueba:'+call.operation,url:call.url,statusCode:call.status,outcome:call.outcome,durationMs:call.durationMs});
  return {ok:state.status===200||state.status===404,message:state.status===200||state.status===404?'Autenticación con Hacienda correcta.':'Hacienda no respondió como se esperaba ('+state.status+').',en:state.status===200||state.status===404?'Authentication with Hacienda passed.':'Hacienda did not answer as expected ('+state.status+').'};
 }
 const sample:EinvoiceModel={docType:'04',providerSystems:'3101000000',activityCode:'000000',receiverActivity:'',emisor:{idType:'02',idNumber:'3101000000',name:'Prueba de conexión',commercialName:'',activityCode:'000000',province:'1',canton:'01',district:'01',barrio:'',otherSigns:'Prueba local sin validez',phone:'',email:'prueba@example.invalid',branch:'001',terminal:'00001',providerSystems:'3101000000'},
  receptor:null,saleCondition:'01',creditDays:0,paymentMethod:'01',lines:[{number:1,cabys:'8399000000000',sku:'',quantity:'1.000',unit:'Sp',detail:'Prueba',unitPrice:'1.00000',total:'1.00000',subtotal:'1.00000',base:'1.00000',taxes:[{code:'01',vatCode:'08',rate:'13.00',amount:'0.13000'}],assumed:'0.00000',netTax:'0.13000',lineTotal:'1.13000',service:true}],
  charges:[],summary:{currency:'CRC',exchangeRate:'1.00000',servTaxed:'1.00000',servExempt:'0.00000',servExonerated:'0.00000',servNotSubject:'0.00000',mercTaxed:'0.00000',mercExempt:'0.00000',mercExonerated:'0.00000',mercNotSubject:'0.00000',taxed:'1.00000',exempt:'0.00000',exonerated:'0.00000',notSubject:'0.00000',sale:'1.00000',discounts:'0.00000',netSale:'1.00000',breakdown:[{code:'01',vatCode:'08',amount:'0.13000'}],tax:'0.13000',assumed:'0.00000',ivaReturned:'0.00000',otherCharges:'0.00000',paymentMethods:[{code:'01',other:'',amount:'1.13000'}],total:'1.13000'},
  reference:null,notes:'',draftTitle:'Prueba'};
 const at=new Date(),consecutivo='0010000104'+'0000000001',clave=buildClave(at,'3101000000',consecutivo,'00000001');
 const xml=buildEinvoiceXml(sample,{clave,consecutivo,issuedAt:crIsoTimestamp(at)}),signed=new MockSigner().sign(xml,'04',at),atv=new MockAtv();
 const submission={clave,issuedAt:crIsoTimestamp(at),emisor:{type:'02',number:'3101000000',name:'Prueba'},receptor:null,signedXml:signed.signedXml,totalComprobante:'1.13000',totalImpuesto:'0.13000',attempt:1};
 const sent=await atv.submit(submission),state=await atv.status(submission);
 await logOutbound(db,owner,{provider:'hacienda',mode:'mock',operation:'prueba',url:'https://atv.mock.local/recepcion',statusCode:sent.status,outcome:sent.outcome==='sent'&&state.state==='aceptado'?'ok':'error',durationMs:Date.now()-started,correlation:clave,summary:{xmlBytes:xml.length,signed:signed.signer,state:state.state}});
 return {ok:wellFormed(xml)&&sent.outcome==='sent'&&state.state==='aceptado',message:'Simulación correcta: XML v4.4 generado, firmado (simulado) y aceptado por el ATV simulado. Nada se envió a Hacienda.',en:'Simulation passed: v4.4 XML generated, signed (simulated) and accepted by the simulated ATV. Nothing was sent to Hacienda.'};
}
