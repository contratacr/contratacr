import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {workMessageMutationSchema,workMessagePageSchema,workMessageThreadsSchema} from '@/lib/pro/work-messages';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 7C: messages of a job between the professional and its linked customer. The SQL side
 * decides who writes as 'pro' or 'client' (request owner vs linked customer account); anyone else
 * gets 403. Nothing is sent by email, SMS, WhatsApp or push: the other side sees it in the app.
 */
const id=z.string().uuid();
const query=z.discriminatedUnion('view',[
 z.object({view:z.literal('threads'),workId:z.string().min(1).max(160)}).strict(),
 z.object({view:z.literal('thread'),requestId:id,before:id.optional()}).strict(),
]);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);const parsed=raw&&query.safeParse(raw);if(!parsed||!parsed.success)return proFail(400,'Consulta inválida.');const q=parsed.data;
  if(q.view==='threads'){const r=await a.db.rpc('pro_work_message_threads',{p_actor:a.user.id,p_work:q.workId});if(r.error)return proDbError(r.error,'Los mensajes cambiaron.');return Response.json(workMessageThreadsSchema.parse(r.data),{headers});}
  const r=await a.db.rpc('pro_work_messages_read',{p_actor:a.user.id,p_request:q.requestId,p_before:q.before??null});if(r.error)return proDbError(r.error,'Los mensajes cambiaron. Recargue.');
  return Response.json(workMessagePageSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar los mensajes.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'work-messages-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=workMessageMutationSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Escriba un mensaje de hasta 2000 caracteres.');}
  const r=await a.db.rpc('pro_work_messages_mutate',{p_actor:a.user.id,p_input:input});if(r.error)return proDbError(r.error,'Los mensajes cambiaron.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el envío. Reintente: no se duplicará.');}
}
