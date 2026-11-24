import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {activityDefaultsMapSchema,activityDefaultsSaveSchema} from '@/lib/pro/time-activity-defaults';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Area A: default markup % and taxable flag per time activity. Owner only. */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw||Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_time_activity_defaults_read',{p_actor:a.user.id});if(r.error)return proDbError(r.error,'Las actividades cambiaron.');
  return Response.json(activityDefaultsMapSchema.parse({items:r.data}),{headers});
 }catch{return proFail(503,'No se pudieron cargar las actividades.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'time-activity-defaults-'+a.user.id,60,60000);if(limited)return limited;
 let input;try{input=activityDefaultsSaveSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise el recargo y el impuesto de la actividad.');}
 try{
  const r=await a.db.rpc('pro_time_activity_defaults_save',{p_actor:a.user.id,p_input:input});
  if(r.error){if(r.error.code==='P0002')return proFail(404,'La actividad ya no está disponible.');return proDbError(r.error,'La actividad cambió. Actualice antes de guardar.');}
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente.');}
}
