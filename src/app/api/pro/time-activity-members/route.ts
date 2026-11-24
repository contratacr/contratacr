import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {activityMembersReadSchema,activityMembersSaveSchema} from '@/lib/pro/time-activity-defaults';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Area A: which team members can log hours on each time activity. Owner only; no restriction = the whole team. */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw||Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_time_activity_members_read',{p_actor:a.user.id});if(r.error)return proDbError(r.error,'Las actividades cambiaron.');
  return Response.json(activityMembersReadSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar los permisos.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'time-activity-members-'+a.user.id,60,60000);if(limited)return limited;
 let input;try{input=activityMembersSaveSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise los miembros de la actividad.');}
 try{
  const r=await a.db.rpc('pro_time_activity_members_save',{p_actor:a.user.id,p_input:input});
  if(r.error){if(r.error.code==='P0002')return proFail(404,'La actividad ya no está disponible.');return proDbError(r.error,'La actividad cambió. Actualice antes de guardar.');}
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente.');}
}
