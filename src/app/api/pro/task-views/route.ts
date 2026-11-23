import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {taskViewMutationSchema,taskViewResultSchema,taskViewsSchema} from '@/lib/pro/operations';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Ronda F2-C (row 15): saved views of the global task center, per person (owner or company member; the member
 * id comes only from the signed gate headers). Filters only: the list is read by /api/pro/task-center.
 */
async function person(){return (await proWorkspaceMember())?.memberId??null;}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw||Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_task_views_read',{p_owner:a.user.id,p_person:(await person())??a.user.id});if(r.error)return proDbError(r.error,'Las vistas cambiaron.');
  return Response.json(taskViewsSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar las vistas guardadas.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'task-views-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=taskViewMutationSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise el nombre y los filtros.');}
  const r=await a.db.rpc('pro_task_views_mutate',{p_owner:a.user.id,p_person:(await person())??a.user.id,p_input:input});
  if(r.error)return r.error.code==='23505'?proFail(409,'Ya tiene una vista con ese nombre.'):r.error.code==='54000'?proFail(429,'Puede guardar hasta 20 vistas.'):proDbError(r.error,'Sus vistas cambiaron en otra pestaña. Recargue.');
  return Response.json(taskViewResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente: no se duplicará.');}
}
