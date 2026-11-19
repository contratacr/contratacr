import 'server-only';
import {readFileSync} from 'node:fs';
import type {createAdminClient} from '@/lib/supabase/admin';
import type {InvoiceDraft} from '@/lib/pro/invoice-drafts';
import {logOutbound,providerSecrets,resolveMode,storedMode} from '../server';
import {derivedId} from '../ids';
import {MockAtv,type AtvClient,type AtvSubmission} from './atv';
import {RemoteAtv} from './atv-remote';
import {buildClave,crIsoTimestamp,securityCodeFor} from './clave';
import {buildCreditNote,buildFromDraft,emisorSettingsSchema,type EinvoiceModel,type EmisorSettings,type ValidationIssue} from './document';
import {readPkcs12} from './pkcs12';
import {MockSigner,XadesSigner,type EinvoiceSigner} from './signer';
import {buildEinvoiceXml,wellFormed} from './xml';
import type {EinvoiceDocument} from './api';

/**
 * Round 6A: e-invoice orchestration. validate → reserve (SQL composes consecutivo/clave) → XML → sign →
 * submit → recibido; «poll» asks for the final state (and retries a failed submission). Every step is
 * idempotent (derived action ids), every adapter call is logged redacted, and the mode is resolved on
 * every call: mock unless the owner chose sandbox/production AND the server has the keys (and, for
 * production, PRO_INTEGRATIONS_ALLOW_PRODUCTION=1).
 */
type Db=ReturnType<typeof createAdminClient>;
export class EinvoiceError extends Error{constructor(readonly status:number,readonly reason:string,message:string,readonly issues:ValidationIssue[]=[]){super(message);this.name='EinvoiceError';}}
type FullDocument=EinvoiceDocument&{xml:string|null;signedXml:string|null;responseXml:string|null;snapshot:EinvoiceModel};
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
function atvFor(mode:'mock'|'sandbox'|'production'):AtvClient{
 if(mode==='mock')return new MockAtv();
 const secrets=providerSecrets('hacienda',mode);if(!secrets)throw new EinvoiceError(409,'missing_keys','Faltan las claves de Hacienda.');
 return new RemoteAtv(mode,secrets);
}
export async function loadDraft(db:Db,owner:string,draftId:string){
 const draft=await rpc<InvoiceDraft|null>(db,'pro_invoice_extras_read',{p_user:owner,p_id:draftId,p_after:null});
 if(!draft)throw new EinvoiceError(404,'not_found','Borrador no encontrado.');
 return draft;
}
type Read={settings:EmisorSettings|null;settingsRevision:number;draftRevision:number;draftTotalCents:number;documents:EinvoiceDocument[];credited:Record<string,number>};
export async function readForDraft(db:Db,owner:string,draftId:string){
 const read=await rpc<Read|null>(db,'pro_einvoice_read',{p_actor:owner,p_draft:draftId});
 if(!read)throw new EinvoiceError(404,'not_found','Borrador no encontrado.');
 return read;
}
export async function documentFull(db:Db,owner:string,id:string){
 const doc=await rpc<FullDocument|null>(db,'pro_einvoice_document_read',{p_actor:owner,p_id:id});
 if(!doc)throw new EinvoiceError(404,'not_found','Comprobante no encontrado.');
 return doc;
}
function submissionOf(doc:FullDocument):AtvSubmission{
 const m=doc.snapshot;
 return {clave:doc.clave,issuedAt:crIsoTimestamp(new Date(doc.issuedAt)),emisor:{type:m.emisor.idType,number:m.emisor.idNumber,name:m.emisor.name},
  receptor:m.receptor&&m.receptor.idType&&m.receptor.idNumber?{type:m.receptor.idType,number:m.receptor.idNumber,name:m.receptor.name}:null,
  signedXml:doc.signedXml??'',totalComprobante:m.summary.total,totalImpuesto:m.summary.tax,attempt:doc.attempts+1};
}
async function logAtv(db:Db,owner:string,atv:AtvClient,operation:string,doc:{clave:string},status:number,ok:boolean,started:number,attempt:number,summary:Record<string,unknown>){
 if(atv instanceof RemoteAtv){for(const call of atv.calls.splice(0))await logOutbound(db,owner,{provider:'hacienda',mode:atv.mode,operation:call.operation,url:call.url,statusCode:call.status,outcome:call.outcome,durationMs:call.durationMs,attempt,correlation:doc.clave,summary});return;}
 await logOutbound(db,owner,{provider:'hacienda',mode:'mock',operation,url:'https://atv.mock.local/recepcion'+(operation==='estado'?'/{clave}':''),statusCode:status,outcome:ok?'ok':'error',durationMs:Date.now()-started,attempt,correlation:doc.clave,summary});
}
/** Sign (if still reserved), submit and record «recibido». Shared by FE/TE and NC. */
async function continueDocument(db:Db,owner:string,actionId:string,docId:string){
 let doc=await documentFull(db,owner,docId);
 if(doc.mode!=='mock'){const mode=await haciendaMode(db,owner);if(mode.mode!==doc.mode)throw new EinvoiceError(409,'mode_changed','El modo de Hacienda cambió desde que se reservó este comprobante.');requireReady(mode);}
 if(doc.status==='borrador'){
  const xml=buildEinvoiceXml(doc.snapshot,{clave:doc.clave,consecutivo:doc.consecutivo,issuedAt:crIsoTimestamp(new Date(doc.issuedAt))});
  if(!wellFormed(xml))throw new EinvoiceError(500,'xml','El XML generado no es válido.');
  const signed=await signerFor(doc.mode).sign(xml,doc.docType,new Date());
  await rpc(db,'pro_einvoice_mutate',{p_actor:owner,p_input:{action:'sign',actionId:derivedId(actionId,'sign:'+docId),documentId:docId,xml,xmlSha256:signed.xmlSha256,signedXml:signed.signedXml,signedSha256:signed.signedSha256,signer:signed.signer}});
  doc=await documentFull(db,owner,docId);
 }
 if(doc.status==='firmado'||doc.status==='error'&&!doc.events.some(event=>event.to==='enviado'||event.to==='recibido')){
  const atv=atvFor(doc.mode),input=submissionOf(doc),started=Date.now(),result=await atv.submit(input);
  await logAtv(db,owner,atv,'recepcion',doc,result.status,result.outcome==='sent',started,input.attempt,{docType:doc.docType,consecutivo:doc.consecutivo,outcome:result.outcome});
  await rpc(db,'pro_einvoice_mutate',{p_actor:owner,p_input:{action:'submitted',actionId:derivedId(actionId,`submit:${docId}:${doc.attempts}`),documentId:docId,outcome:result.outcome,message:result.message}});
  doc=await documentFull(db,owner,docId);
  if(doc.status==='enviado')await rpc(db,'pro_einvoice_mutate',{p_actor:owner,p_input:{action:'status',actionId:derivedId(actionId,'received:'+docId),documentId:docId,state:'recibido',message:result.message}});
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
   mode:mode.mode,securityCode:await securityCodeFor(input.actionId,owner),snapshot:built.model,totalCents:built.totalCents,taxCents:built.taxCents,
   receiverName:built.model.receptor?.name??'',receiverIdType:built.model.receptor?.idType??'',receiverId:built.model.receptor?.idNumber??''}});
 }
 return continueDocument(db,owner,input.actionId,input.actionId);
}
export async function creditNote(db:Db,owner:string,input:{actionId:string;draftId:string;originalId:string;code:'01'|'02';reason:string;lines:number[]}){
 const mode=await haciendaMode(db,owner);requireReady(mode);
 const read=await readForDraft(db,owner,input.draftId);
 if(!read.documents.some(doc=>doc.id===input.actionId)){
  const original=await documentFull(db,owner,input.originalId);
  if(original.draftId!==input.draftId||original.docType==='03')throw new EinvoiceError(400,'reference','Elija la factura o el tiquete de este borrador.');
  const draft=await loadDraft(db,owner,input.draftId);
  const built=buildCreditNote(original.snapshot,{clave:original.clave,issuedAt:crIsoTimestamp(new Date(original.issuedAt)),docType:original.docType as '01'|'04'},input);
  if(!built.ok)throw new EinvoiceError(400,'validation','Revise la nota de crédito.',built.issues);
  await rpc(db,'pro_einvoice_mutate',{p_actor:owner,p_input:{action:'reserve',actionId:input.actionId,draftId:input.draftId,draftRevision:draft.revision,settingsRevision:read.settingsRevision,docType:'03',
   mode:mode.mode,securityCode:await securityCodeFor(input.actionId,owner),snapshot:built.model,totalCents:built.totalCents,taxCents:built.taxCents,
   receiverName:built.model.receptor?.name??'',receiverIdType:built.model.receptor?.idType??'',receiverId:built.model.receptor?.idNumber??'',
   referenceDocumentId:input.originalId,referenceCode:input.code,referenceReason:input.reason}});
 }
 return continueDocument(db,owner,input.actionId,input.actionId);
}
/** «Consultar estado»: retries a failed submission, then asks for the final answer. */
export async function pollDocument(db:Db,owner:string,input:{actionId:string;documentId:string}){
 let doc=await documentFull(db,owner,input.documentId);
 if(doc.status==='aceptado'||doc.status==='rechazado')return doc;
 if(doc.status==='borrador'||doc.status==='firmado'||doc.status==='error'&&!doc.events.some(event=>event.to==='recibido'))doc=await continueDocument(db,owner,input.actionId,doc.id);
 if(doc.status!=='recibido'&&doc.status!=='enviado'&&doc.status!=='error')return doc;
 if(doc.mode!=='mock'){const mode=await haciendaMode(db,owner);if(mode.mode!==doc.mode)throw new EinvoiceError(409,'mode_changed','El modo de Hacienda cambió.');requireReady(mode);}
 const atv=atvFor(doc.mode),started=Date.now(),state=await atv.status(submissionOf(doc));
 await logAtv(db,owner,atv,'estado',doc,state.status,state.state!=='error',started,doc.attempts||1,{state:state.state});
 await rpc(db,'pro_einvoice_mutate',{p_actor:owner,p_input:{action:'status',actionId:derivedId(input.actionId,'status:'+doc.id),documentId:doc.id,state:state.state,responseXml:state.responseXml,responseCode:state.responseCode,message:state.message}});
 return documentFull(db,owner,doc.id);
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
  const atv=atvFor(mode) as RemoteAtv;
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
