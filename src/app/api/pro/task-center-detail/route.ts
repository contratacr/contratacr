import {enforceRateLimit} from '@/lib/rate-limit';
import {z} from 'zod';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {taskDetailMutationSchema,taskDetailSchema} from '@/lib/pro/task-center-detail';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 16: comments with explicit mentions and links to existing job files for a task, from the global task center.
 * Reads and writes are RPCs with their own role checks; comments are append-only; linking never copies the file.
 */
async function person(){return (await proWorkspaceMember())?.memberId??null;}
const query=z.object({workId:z.string().min(1).max(160),taskId:z.string().uuid()}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),q=raw?query.safeParse(raw):null;if(!q?.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_task_center_detail_read',{p_owner:a.user.id,p_person:(await person())??a.user.id,p_work:q.data.workId,p_task:q.data.taskId});
  if(r.error)return proDbError(r.error,'El detalle cambió.');return Response.json(taskDetailSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar el detalle de la tarea.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'task-center-detail-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=taskDetailMutationSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise los datos.');}
  const who=(await person())??a.user.id;
  const{kind,...rest}=input;
  const r=kind==='comment'?await a.db.rpc('pro_task_center_comment_add',{p_owner:a.user.id,p_person:who,p_input:rest}):await a.db.rpc('pro_task_center_file_link',{p_owner:a.user.id,p_person:who,p_input:rest});
  if(r.error)return proDbError(r.error,'El archivo ya no estaba vinculado. Actualice.');return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente: no se duplicará.');}
}
