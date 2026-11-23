import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {workCalendarMutationSchema,workCalendarResultSchema,workCalendarSchema} from '@/lib/pro/work-calendar';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 13 (work calendar) of the company: the owner and the current team read it (Gantt shading); only the owner writes it
 * (the database refuses anyone else). Optimistic revision: a change from another tab answers 409.
 */
async function person(){return (await proWorkspaceMember())?.memberId??null;}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw||Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_work_calendar_read',{p_owner:a.user.id,p_person:(await person())??a.user.id});if(r.error)return proDbError(r.error,'El calendario cambió.');
  return Response.json(workCalendarSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar el calendario laboral.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'work-calendar-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=workCalendarMutationSchema.parse(await proBoundedJson(req,32768));}catch{return proFail(400,'Revise los días laborables y las excepciones.');}
  const r=await a.db.rpc('pro_work_calendar_save',{p_owner:a.user.id,p_person:(await person())??a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'El calendario cambió en otra pestaña. Recargue.');
  return Response.json(workCalendarResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente.');}
}
