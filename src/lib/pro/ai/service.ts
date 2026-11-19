import 'server-only';
import {createHash} from 'node:crypto';
import type {createAdminClient} from '@/lib/supabase/admin';
import {derivedId} from '@/lib/pro/integrations/ids';
import {providerConfig} from '@/lib/pro/integrations/registry';
import {logOutbound,providerSecrets,resolveMode} from '@/lib/pro/integrations/server';
import {AnthropicAdapter,MockAiAdapter,MockTranscriber,OpenAiCompatibleTranscriber,seedOf,type AiAdapter,type Attachment,type CallRecord,type Transcriber} from './adapters';
import type {AiDraftFeature,AiFeature,AiSettings,AiSuggestion,Transcript} from './features';
import {validateOutput as validate} from './validate';
import {redactSummary} from './privacy';
import {draftPrompt,expensePrompt,meetingPrompt,takeoffPrompt,type JobContext} from './prompts';

/**
 * Round 6C: AI orchestration. Order for every call: resolve mode (mock unless the owner chose sandbox/production
 * AND the server has the key) → pro_ai_begin (consent ON, monthly cap, idempotent actionId, pending suggestion)
 * → adapter → redacted log line (counts only) → output validated with zod → pro_ai_finish. The result is only a
 * suggestion: nothing here writes to quotes, contracts, logs, updates, takeoffs, expenses, meetings or tasks.
 */
type Db=ReturnType<typeof createAdminClient>;
export class AiError extends Error{constructor(readonly status:number,readonly reason:string,message:string){super(message);this.name='AiError';}}
export async function aiRpc<T>(db:Db,name:string,args:Record<string,unknown>):Promise<T>{
 const result=await db.rpc(name,args);
 if(result.error){
  const e=result.error as {code?:string;hint?:string;message?:string};
  if(e.hint==='pro_ai_consent_required')throw new AiError(403,'consent_required','Active la autorización de uso de IA.');
  if(e.hint==='pro_ai_cap_reached')throw new AiError(429,'cap_reached','Se alcanzó el límite mensual de IA.');
  if(e.hint==='pro_ai_meeting_consent')throw new AiError(400,'consent_meeting','Falta el consentimiento de todas las partes.');
  throw new AiError(e.code==='40001'||e.code==='23505'?409:e.code==='42501'?403:e.code==='P0002'?404:e.code==='54000'?429:['22023','23514','22P02'].includes(e.code??'')?400:503,e.hint||e.code||'db',e.message||'db');
 }
 return result.data as T;
}
export const readSettings=(db:Db,owner:string)=>aiRpc<AiSettings&{history:unknown[]}>(db,'pro_ai_settings_read',{p_actor:owner});

async function providerState(db:Db,owner:string,provider:'ai'|'transcription'){
 const read=await aiRpc<{connections:{provider:string;mode:'mock'|'sandbox'|'production';enabled:boolean;config:Record<string,unknown>}[]}>(db,'pro_integration_read',{p_actor:owner});
 const row=read.connections.find(c=>c.provider===provider);
 const resolved=resolveMode(provider,row?(row.enabled?row.mode:'disabled'):'mock');
 return {resolved,config:providerConfig(provider,row?.config)};
}
async function aiAdapter(db:Db,owner:string):Promise<{adapter:AiAdapter;mode:'mock'|'sandbox'|'production'}>{
 const {resolved,config}=await providerState(db,owner,'ai');
 if(resolved.status!=='ready')throw new AiError(409,resolved.status,'Proveedor de IA no disponible.');
 if(resolved.mode==='mock')return {adapter:new MockAiAdapter(),mode:'mock'};
 const secrets=providerSecrets('ai',resolved.mode);if(!secrets)throw new AiError(409,'missing_keys','Faltan claves.');
 return {adapter:new AnthropicAdapter(secrets,String(config.model)),mode:resolved.mode};
}
async function transcriber(db:Db,owner:string):Promise<{adapter:Transcriber;mode:'mock'|'sandbox'|'production'}>{
 const {resolved,config}=await providerState(db,owner,'transcription');
 if(resolved.status!=='ready')throw new AiError(409,resolved.status,'Proveedor de transcripción no disponible.');
 if(resolved.mode==='mock')return {adapter:new MockTranscriber(),mode:'mock'};
 const secrets=providerSecrets('transcription',resolved.mode);if(!secrets)throw new AiError(409,'missing_keys','Faltan claves.');
 return {adapter:new OpenAiCompatibleTranscriber(secrets,config as {model?:string;language?:'auto'|'es'|'en'}),mode:resolved.mode};
}
async function flush(db:Db,owner:string,provider:'ai'|'transcription',mode:'mock'|'sandbox'|'production',calls:CallRecord[],correlation:string,names:string[]){
 for(const call of calls.splice(0))await logOutbound(db,owner,{provider,mode,operation:call.operation,url:call.url,statusCode:call.status,outcome:call.outcome,durationMs:call.durationMs,correlation,summary:redactSummary(call.summary,names)});
}
type Begin=AiSuggestion&{duplicate:boolean};
async function runAi(db:Db,owner:string,input:{actionId:string;feature:AiFeature;workId:string|null;source:Record<string,unknown>;names:string[];call:{prompt:string;language:'es'|'en';attachment?:Attachment;seed:string;hints?:Record<string,string>}}):Promise<AiSuggestion>{
 const {adapter,mode}=await aiAdapter(db,owner);
 const begin=await aiRpc<Begin>(db,'pro_ai_begin',{p_actor:owner,p_input:{actionId:input.actionId,id:derivedId(input.actionId,'suggestion'),feature:input.feature,provider:'ai',mode,model:adapter.model,workId:input.workId,source:input.source,units:1}});
 if(begin.status!=='pending')return begin;
 let output:Record<string,unknown>|null=null,error='provider_failed';
 try{const result=await adapter.complete({feature:input.feature,...input.call});if(result.ok)output=validate(input.feature,result.output);else error=result.reason;}
 finally{await flush(db,owner,'ai',mode,adapter.calls,begin.id,input.names);}
 return aiRpc<AiSuggestion>(db,'pro_ai_finish',{p_actor:owner,p_id:begin.id,p_ok:!!output,p_output:output,p_error:output?null:error});
}
async function runTranscription(db:Db,owner:string,input:{actionId:string;feature:'transcribe_voice'|'transcribe_meeting';workId:string|null;audio:{bytes:Uint8Array;mime:string;kind:'meeting'|'voice_note';language:'es'|'en'};source:Record<string,unknown>}):Promise<AiSuggestion>{
 const {adapter,mode}=await transcriber(db,owner);
 const begin=await aiRpc<Begin>(db,'pro_ai_begin',{p_actor:owner,p_input:{actionId:input.actionId,id:derivedId(input.actionId,'suggestion'),feature:input.feature,provider:'transcription',mode,model:adapter.model,workId:input.workId,source:input.source,units:1}});
 if(begin.status!=='pending')return begin;
 let transcript:Transcript|null=null;
 try{const result=await adapter.transcribe(input.audio);if(result.ok)transcript=result.transcript;}
 finally{await flush(db,owner,'transcription',mode,adapter.calls,begin.id,[]);}
 return aiRpc<AiSuggestion>(db,'pro_ai_finish',{p_actor:owner,p_id:begin.id,p_ok:!!transcript,p_output:transcript,p_error:transcript?null:'provider_failed'});
}
async function jobContext(db:Db,owner:string,workId:string|null):Promise<JobContext|null>{
 if(!workId)return null;
 return aiRpc<JobContext>(db,'pro_ai_job_context',{p_actor:owner,p_work:workId});
}

// ------------------------------------------------------------------ features
export async function draftSuggestion(db:Db,owner:string,body:{actionId:string;feature:AiDraftFeature;workId:string|null;language:'es'|'en';input:{title:string;current:string;notes:string;lines:string[]}}){
 const job=await jobContext(db,owner,body.workId);
 const prompt=draftPrompt(body.feature,body.language,body.input,job);
 return runAi(db,owner,{actionId:body.actionId,feature:body.feature,workId:body.workId,source:{titleChars:body.input.title.length,notesChars:body.input.notes.length,lines:body.input.lines.length},names:job?.clientFirstName?[job.clientFirstName]:[],
  call:{prompt,language:body.language,seed:seedOf(body.feature,prompt),hints:{title:body.input.title,service:job?.service??'',notes:body.input.notes,firstName:job?.clientFirstName??''}}});
}
export async function readPlan(db:Db,owner:string,body:{actionId:string;workId:string;planId:string;pageNumber:number;language:'es'|'en'}){
 const plan=await db.from('pro_work_takeoff_plans').select('id,work_id,file_id,title').eq('owner_id',owner).eq('work_id',body.workId).eq('id',body.planId).maybeSingle();
 if(plan.error)throw new AiError(503,'db','plan');if(!plan.data)throw new AiError(404,'plan_unavailable','Plano no disponible.');
 const file=await db.from('pro_work_files').select('object_path,mime_type,size_bytes,sha256,ready').eq('owner_id',owner).eq('work_id',body.workId).eq('id',plan.data.file_id).maybeSingle();
 if(file.error||!file.data||!file.data.ready||!['image/jpeg','application/pdf'].includes(file.data.mime_type))throw new AiError(404,'plan_unavailable','Plano no disponible.');
 const download=await db.storage.from('pro-work-files').download(file.data.object_path);
 if(download.error||!download.data)throw new AiError(503,'plan_unavailable','No se pudo abrir el plano.');
 const bytes=new Uint8Array(await download.data.arrayBuffer());
 if(createHash('sha256').update(bytes).digest('hex')!==file.data.sha256)throw new AiError(503,'plan_unavailable','El plano no coincide con su huella.');
 const page=await db.from('pro_work_takeoff_pages').select('unit,cal_length_milli').eq('owner_id',owner).eq('plan_id',body.planId).eq('page_number',body.pageNumber).maybeSingle();
 const scale=page.data?.cal_length_milli?`calibrated (${page.data.unit})`:'not calibrated';
 const pdf=file.data.mime_type==='application/pdf';
 return runAi(db,owner,{actionId:body.actionId,feature:'takeoff',workId:body.workId,source:{planId:body.planId,page:body.pageNumber,mime:file.data.mime_type,bytes:bytes.length},names:[],
  call:{prompt:takeoffPrompt(body.language,String(plan.data.title)+(pdf?` (page ${body.pageNumber})`:''),scale),language:body.language,attachment:{kind:pdf?'pdf':'image',mime:file.data.mime_type,bytes},seed:seedOf('takeoff',bytes,String(body.pageNumber))}});
}
export async function expenseFromReceipt(db:Db,owner:string,body:{actionId:string;language:'es'|'en';bytes:Uint8Array;mime:string}){
 return runAi(db,owner,{actionId:body.actionId,feature:'expense_receipt',workId:null,source:{mime:body.mime,bytes:body.bytes.length},names:[],
  call:{prompt:expensePrompt(body.language,'receipt'),language:body.language,attachment:{kind:'image',mime:body.mime,bytes:body.bytes},seed:seedOf('receipt',body.bytes)}});
}
export async function expenseFromVoice(db:Db,owner:string,body:{actionId:string;language:'es'|'en';bytes:Uint8Array;mime:string}){
 const transcription=await runTranscription(db,owner,{actionId:derivedId(body.actionId,'transcribe'),feature:'transcribe_voice',workId:null,audio:{bytes:body.bytes,mime:body.mime,kind:'voice_note',language:body.language},source:{mime:body.mime,bytes:body.bytes.length}});
 if(transcription.status!=='ready')return {transcription,suggestion:null};
 const text=(transcription.output as Transcript).text;
 const suggestion=await runAi(db,owner,{actionId:body.actionId,feature:'expense_voice',workId:null,source:{transcription:transcription.id},names:[],
  call:{prompt:expensePrompt(body.language,'voice',text),language:body.language,seed:seedOf('voice',text),hints:{transcript:text}}});
 return {transcription,suggestion};
}
export async function meetingFromRecording(db:Db,owner:string,body:{actionId:string;recordingId:string;language:'es'|'en'}){
 const audio=await aiRpc<{id:string;workId:string;mime:string;base64:string;sha256:string}>(db,'pro_ai_recording_audio',{p_actor:owner,p_id:body.recordingId});
 const bytes=new Uint8Array(Buffer.from(audio.base64,'base64'));
 const transcription=await runTranscription(db,owner,{actionId:derivedId(body.actionId,'transcribe'),feature:'transcribe_meeting',workId:audio.workId,audio:{bytes,mime:audio.mime,kind:'meeting',language:body.language},source:{recordingId:audio.id}});
 if(transcription.status!=='ready')return {transcription,suggestion:null};
 const text=(transcription.output as Transcript).text,job=await jobContext(db,owner,audio.workId);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica'}).format(new Date());
 const suggestion=await runAi(db,owner,{actionId:body.actionId,feature:'meeting',workId:audio.workId,source:{recordingId:audio.id,transcription:transcription.id},names:job?.clientFirstName?[job.clientFirstName]:[],
  call:{prompt:meetingPrompt(body.language,text,job,today),language:body.language,seed:seedOf('meeting',text),hints:{service:job?.service??''}}});
 return {transcription,suggestion};
}
