import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {ProBodyError,proActor,proBoundedForm,proBoundedJson,proFail,proQuery,proRouteHeaders as headers,proSameOrigin,sniffAudio} from '@/lib/pro/route-common';
import {AI_AUDIO_MAX_BYTES,aiAudioTypes,aiErrorCopy,baseMime,meetingConsentText} from '@/lib/pro/ai/features';
import {AiError,aiRpc,meetingFromRecording} from '@/lib/pro/ai/service';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6C: meeting / call recordings of a job (row 76). Upload only with the explicit «all parties informed
// and consented» confirmation (stored with the recording). Audio is private to the owner (other owners 404,
// customers 403) and deletable. «transcribe» = transcription + summary + action items as a SUGGESTION; the
// meeting notes exist only after the owner reviews/edits and saves them (create/update, CAS + actionId);
// an action item becomes a task through /api/pro/work-tasks and is then linked here (link_task).
const workId=z.string().trim().min(1).max(160),uuid=z.string().uuid();
const item=z.object({id:uuid,text:z.string().trim().min(1).max(160),dueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),taskId:uuid.nullable()}).strict();
const notes={title:z.string().trim().min(1).max(160),transcript:z.string().max(60000),summary:z.string().trim().min(1).max(4000),actionItems:z.array(item).max(20),decisions:z.array(z.string().trim().min(1).max(300)).max(20)};
const mutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('transcribe'),actionId:uuid,recordingId:uuid,language:z.enum(['es','en'])}).strict(),
 z.object({action:z.literal('create'),actionId:uuid,id:uuid,workId,recordingId:uuid.nullable(),suggestionId:uuid.nullable(),...notes}).strict(),
 z.object({action:z.literal('update'),actionId:uuid,id:uuid,revision:z.number().int().positive(),...notes}).strict(),
 z.object({action:z.literal('link_task'),actionId:uuid,id:uuid,revision:z.number().int().positive(),itemId:uuid,taskId:uuid}).strict(),
 z.object({action:z.literal('delete_recording'),id:uuid}).strict(),
]);
const fail=(error:unknown)=>{
 if(error instanceof AiError){const copy=aiErrorCopy[error.reason];return Response.json({error:copy?.es??(error.status===409?'La reunión cambió. Actualice y reintente.':error.status===404?'No encontrado.':'No se pudo completar la operación.'),reason:error.reason},{status:error.status,headers});}
 return proFail(503,'No se pudo comprobar la operación. Reintente la misma acción.');
};
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q||Object.keys(q).length!==1)return proFail(400,'Consulta inválida.');
  if('audio' in q){
   const id=uuid.safeParse(q.audio);if(!id.success)return proFail(400,'Consulta inválida.');
   const audio=await aiRpc<{mime:string;base64:string}>(a.db,'pro_ai_recording_audio',{p_actor:a.user.id,p_id:id.data});
   const bytes=Buffer.from(audio.base64,'base64');
   return new Response(bytes,{headers:{...headers,'Content-Type':audio.mime,'Content-Length':String(bytes.length),'Content-Disposition':'inline','Content-Security-Policy':"sandbox; default-src 'none'",'Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer'}});
  }
  const work=workId.safeParse(q.workId);if(!work.success)return proFail(400,'Consulta inválida.');
  return Response.json(await aiRpc(a.db,'pro_ai_meetings_read',{p_actor:a.user.id,p_work:work.data}),{headers});
 }catch(error){return fail(error);}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'ai-meetings-'+a.user.id,40,60000);if(limited)return limited;
  if(req.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')){
   // Post-security fixes: streamed byte cap, one file, known fields only; the stored type comes from the file's bytes.
   let form:FormData;
   try{form=await proBoundedForm(req,{maxBytes:AI_AUDIO_MAX_BYTES+65536,maxFiles:1,maxFileBytes:AI_AUDIO_MAX_BYTES,fields:['id','workId','title','consentAllParties','language','file']});}
   catch(error){return error instanceof ProBodyError&&error.status===413?Response.json({error:aiErrorCopy.unsupported_file!.es,reason:'unsupported_file'},{status:413,headers}):proFail(400,'Revise la grabación.');}
   const id=uuid.safeParse(form.get('id')),work=workId.safeParse(form.get('workId')),file=form.get('file'),language=form.get('language')==='en'?'en':'es';
   const title=z.string().trim().min(1).max(160).safeParse(form.get('title'));
   if(!id.success||!work.success||!title.success||!(file instanceof Blob))return proFail(400,'Revise la grabación.');
   if(form.get('consentAllParties')!=='true')return Response.json({error:aiErrorCopy.consent_meeting!.es,reason:'consent_meeting'},{status:400,headers});
   const declared=baseMime(file.type),bytes=file.size>=1&&file.size<=AI_AUDIO_MAX_BYTES?Buffer.from(await file.arrayBuffer()):null,mime=bytes?sniffAudio(bytes):null;
   if(!bytes||!mime||!(aiAudioTypes as readonly string[]).includes(declared))return Response.json({error:aiErrorCopy.unsupported_file!.es,reason:'unsupported_file'},{status:400,headers});
   return Response.json(await aiRpc(a.db,'pro_ai_recording_create',{p_actor:a.user.id,p_input:{id:id.data,workId:work.data,title:title.data,mime,consentAllParties:true,consentText:meetingConsentText[language]},p_content:'\\x'+bytes.toString('hex')}),{headers});
  }
  let raw:unknown;try{raw=await proBoundedJson(req,131072);}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos.');}
  const input=mutation.safeParse(raw);if(!input.success)return proFail(400,'Revise los datos.');
  const body=input.data;
  if(body.action==='transcribe')return Response.json(await meetingFromRecording(a.db,a.user.id,body),{headers});
  if(body.action==='delete_recording')return Response.json(await aiRpc(a.db,'pro_ai_recording_delete',{p_actor:a.user.id,p_id:body.id}),{headers});
  return Response.json(await aiRpc(a.db,'pro_ai_meeting_save',{p_actor:a.user.id,p_input:body}),{headers});
 }catch(error){return fail(error);}
}
