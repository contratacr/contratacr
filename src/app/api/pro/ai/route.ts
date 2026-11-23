import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {ProBodyError,proActor,proBoundedForm,proBoundedJson,proFail,proQuery,proRouteHeaders as headers,proSameOrigin,sniffAudio,sniffImage} from '@/lib/pro/route-common';
import {AI_AUDIO_MAX_BYTES,AI_IMAGE_MAX_BYTES,aiAudioTypes,aiErrorCopy,aiImageTypes,aiJsonMutationSchema,baseMime} from '@/lib/pro/ai/features';
import {AiError,aiRpc,draftSuggestion,expenseFromReceipt,expenseFromVoice,readPlan,readSettings} from '@/lib/pro/ai/service';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6C: AI assistant (rows 46, 67, 77). GET ?settings=1 (consent, monthly cap, usage) or ?suggestion=<id>.
// POST JSON: set_consent / set_limit (CAS + actionId), suggest (drafts), read_plan (takeoff suggestions from a
// plan already in Files), review (used/discarded, once). POST multipart: expense_receipt (photo) or
// expense_voice (audio → transcription → extraction). Every result is a SUGGESTION: this route never writes
// quotes, clauses, logs, updates, takeoffs or expenses. Mock adapters unless the server has the provider keys.
const fail=(error:unknown)=>{
 if(error instanceof AiError){const copy=aiErrorCopy[error.reason];return Response.json({error:copy?.es??(error.status===409?'La configuración cambió. Actualice y reintente.':error.status===404?'No encontrado.':'No se pudo completar la operación.'),reason:error.reason},{status:error.status,headers});}
 return proFail(503,'No se pudo comprobar la operación. Reintente la misma acción.');
};
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q||Object.keys(q).length!==1)return proFail(400,'Consulta inválida.');
  if(q.settings==='1')return Response.json(await readSettings(a.db,a.user.id),{headers});
  const id=z.string().uuid().safeParse(q.suggestion);if(!id.success)return proFail(400,'Consulta inválida.');
  return Response.json(await aiRpc(a.db,'pro_ai_suggestion_read',{p_actor:a.user.id,p_id:id.data}),{headers});
 }catch(error){return fail(error);}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'ai-'+a.user.id,40,60000);if(limited)return limited;
  const type=req.headers.get('content-type')?.toLowerCase()??'';
  if(type.startsWith('multipart/form-data')){
   // Post-security fixes: the body is read as a stream with a hard cap (Content-Length is only a hint), one file,
   // known fields only, and the file type is taken from its first bytes (the declared type must also be allowed).
   let form:FormData;
   try{form=await proBoundedForm(req,{maxBytes:AI_AUDIO_MAX_BYTES+65536,maxFiles:1,maxFileBytes:AI_AUDIO_MAX_BYTES,fields:['action','actionId','language','file']});}
   catch(error){return error instanceof ProBodyError&&error.status===413?Response.json({error:aiErrorCopy.unsupported_file!.es,reason:'unsupported_file'},{status:413,headers}):proFail(400,'Revise el archivo.');}
   const action=form.get('action'),actionId=z.string().uuid().safeParse(form.get('actionId')),language=form.get('language')==='en'?'en':'es',file=form.get('file');
   if((action!=='expense_receipt'&&action!=='expense_voice')||!actionId.success||!(file instanceof Blob))return proFail(400,'Revise el archivo.');
   const declared=baseMime(file.type),image=action==='expense_receipt';
   const bytes=image?(file.size<=AI_IMAGE_MAX_BYTES?new Uint8Array(await file.arrayBuffer()):null):(file.size>=1&&file.size<=AI_AUDIO_MAX_BYTES?new Uint8Array(await file.arrayBuffer()):null);
   const mime=bytes?(image?sniffImage(bytes):sniffAudio(bytes)):null;
   if(!bytes||!mime||!((image?aiImageTypes:aiAudioTypes) as readonly string[]).includes(declared))return Response.json({error:aiErrorCopy.unsupported_file!.es,reason:'unsupported_file'},{status:400,headers});
   if(image)return Response.json({suggestion:await expenseFromReceipt(a.db,a.user.id,{actionId:actionId.data,language,bytes,mime})},{headers});
   return Response.json(await expenseFromVoice(a.db,a.user.id,{actionId:actionId.data,language,bytes,mime}),{headers});
  }
  let raw:unknown;try{raw=await proBoundedJson(req,32768);}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise la solicitud.');}
  const input=aiJsonMutationSchema.safeParse(raw);if(!input.success)return proFail(400,'Revise la solicitud.');
  const body=input.data;
  if(body.action==='set_consent'||body.action==='set_limit')return Response.json(await aiRpc(a.db,'pro_ai_settings_mutate',{p_actor:a.user.id,p_input:body}),{headers});
  if(body.action==='review')return Response.json(await aiRpc(a.db,'pro_ai_review',{p_actor:a.user.id,p_input:body}),{headers});
  if(body.action==='read_plan')return Response.json(await readPlan(a.db,a.user.id,body),{headers});
  return Response.json(await draftSuggestion(a.db,a.user.id,body),{headers});
 }catch(error){return fail(error);}
}
