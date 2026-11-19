import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {fileVersionMutationSchema} from '@/lib/pro/file-versions';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
// Fila 30: versions and per-file discussion for Archivos del trabajo. Bytes never pass
// through here: uploads and downloads keep using /api/pro/work-files (same bucket,
// normalization, hash and reauthorization), and «Compartir esta versión» is the existing
// explicit publish of that route. Development only, expected actor, same-origin writes,
// JSON ≤ 16 KiB (413), rate limited.
const conflict='La versión o el comentario cambió. Actualice antes de guardar.',uuid=z.string().uuid(),workId=z.string().trim().min(1).max(160);
const ids=z.string().max(20*37).transform(value=>value.split(',')).pipe(z.array(uuid).min(1).max(20));
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');const keys=Object.keys(q).sort().join(',');
  if(keys==='fileId,requestId'||keys==='after,fileId,requestId'){
   const request=uuid.safeParse(q.requestId),file=uuid.safeParse(q.fileId),after=q.after===undefined?null:uuid.safeParse(q.after);
   if(!request.success||!file.success||after&&!after.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_work_file_client_discussion_read',{p_actor:a.user.id,p_request:request.data,p_file:file.data,p_after:after?.data??null});
   if(result.error)return proDbError(result.error,conflict);return result.data?Response.json(result.data,{headers}):proFail(404,'Archivo no disponible.');
  }
  const work=workId.safeParse(q.workId);if(!work.success)return proFail(400,'Consulta inválida.');
  if(keys==='index,workId'){
   const files=ids.safeParse(q.index);if(!files.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_work_file_versions_index',{p_actor:a.user.id,p_work:work.data,p_files:files.data});
   if(result.error)return proDbError(result.error,conflict);return result.data?Response.json(result.data,{headers}):proFail(404,'Trabajo no disponible.');
  }
  const file=uuid.safeParse(q.fileId);if(!file.success)return proFail(400,'Consulta inválida.');
  let args:{p_thread:string|null;p_archived:boolean;p_after:string|null;p_comment:string|null};
  if(keys==='fileId,workId')args={p_thread:null,p_archived:false,p_after:null,p_comment:null};
  else if(keys==='commentId,fileId,workId'){const comment=uuid.safeParse(q.commentId);if(!comment.success)return proFail(400,'Consulta inválida.');args={p_thread:null,p_archived:false,p_after:null,p_comment:comment.data};}
  else if(['fileId,thread,workId','archived,fileId,thread,workId','after,fileId,thread,workId','after,archived,fileId,thread,workId'].includes(keys)){
   const thread=z.enum(['team','client']).safeParse(q.thread),after=q.after===undefined?null:uuid.safeParse(q.after);
   if(!thread.success||after&&!after.success||q.archived!==undefined&&q.archived!=='1')return proFail(400,'Consulta inválida.');
   args={p_thread:thread.data,p_archived:q.archived==='1',p_after:after?.data??null,p_comment:null};
  }else return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_work_file_versions_read',{p_actor:a.user.id,p_work:work.data,p_file:file.data,...args});
  if(result.error)return proDbError(result.error,conflict);return result.data?Response.json(result.data,{headers}):proFail(404,'Archivo no disponible.');
 }catch{return proFail(503,'No se pudieron cargar las versiones. Reintente.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'file-versions-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=fileVersionMutationSchema.parse(await proBoundedJson(req));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise la versión o el comentario.');}
  const result='requestId' in input
   ?await a.db.rpc('pro_work_file_client_comments_mutate',{p_actor:a.user.id,p_input:input})
   :await a.db.rpc('pro_work_file_versions_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error)return proDbError(result.error,conflict);return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
