import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {fileMentionMutationSchema} from '@/lib/pro/file-mentions';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';
// Fila 30: @mentions of the job team in the private team thread of a job file, and the
// member's isolated in-app inbox. The comment is created by the same SQL writer as
// /api/pro/file-versions (one transaction with its mentions). Nothing is sent: no e-mail,
// push or notifications rows. The inbox never returns file ids, paths, URLs or bytes.
// Development only, expected actor, same-origin writes, JSON <= 16 KiB (413), rate limited.
const conflict='Un integrante mencionado cambió su acceso. Actualice la lista y vuelva a intentarlo.',uuid=z.string().uuid(),workId=z.string().trim().min(1).max(160);
const ids=z.string().max(20*37).transform(value=>value.split(',')).pipe(z.array(uuid).min(1).max(20));
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');const keys=Object.keys(q).sort().join(',');
  if(q.view==='targets'&&keys==='view,workId'){
   const work=workId.safeParse(q.workId);if(!work.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_work_file_mention_targets',{p_actor:a.user.id,p_work:work.data});
   if(result.error)return proDbError(result.error,conflict);return Response.json(result.data,{headers});
  }
  if(q.view==='comments'&&keys==='ids,view,workId'){
   const work=workId.safeParse(q.workId),list=ids.safeParse(q.ids);if(!work.success||!list.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_work_file_comment_mentions_read',{p_actor:a.user.id,p_work:work.data,p_comments:list.data});
   if(result.error)return proDbError(result.error,conflict);return Response.json(result.data,{headers});
  }
  if(q.view==='inbox'&&(keys==='status,view'||keys==='after,status,view')){
   const status=z.enum(['unread','all']).safeParse(q.status),after=q.after===undefined?null:uuid.safeParse(q.after);
   if(!status.success||after&&!after.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_work_file_mention_inbox',{p_actor:a.user.id,p_status:status.data,p_after:after?.data??null});
   if(result.error)return proDbError(result.error,conflict);return Response.json(result.data,{headers});
  }
  return proFail(400,'Consulta inválida.');
 }catch{return proFail(503,'No se pudieron cargar las menciones. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'file-mentions-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=fileMentionMutationSchema.parse(await proBoundedJson(req));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise el comentario y las menciones.');}
  const result=input.action==='mark_read'
   ?await a.db.rpc('pro_work_file_mention_notice_mark_read',{p_actor:a.user.id,p_input:input})
   :await a.db.rpc('pro_work_file_comment_with_mentions',{p_actor:a.user.id,p_input:input});
  if(result.error)return proDbError(result.error,conflict);return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
