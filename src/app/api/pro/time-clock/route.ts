import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {timeClockMutationSchema,timeClockOptionsSchema,timesheetDecisionResultSchema,timesheetSchema} from '@/lib/pro/operations';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Ronda F2-C (row 22): time clock and weekly timesheets. Clock in = the existing person timer plus optional task
 * and optional location (only when an Administrator turned it on). Clock out keeps the existing review/save flow
 * (/api/pro/work-timers). The timesheet never includes internal cost. Approving or reopening a week is for the
 * owner, Administrator and Manager (checked in SQL). The person comes only from the signed gate headers.
 */
async function person(){return (await proWorkspaceMember())?.memberId??null;}
const query=z.union([z.object({week:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict(),z.object({workId:z.string().min(1).max(160)}).strict()]);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const parsed=query.safeParse(proQuery(req));if(!parsed.success)return proFail(400,'Consulta inválida.');
  const who=(await person())??a.user.id;
  if('workId' in parsed.data){const r=await a.db.rpc('pro_time_clock_options',{p_owner:a.user.id,p_person:who,p_work:parsed.data.workId});if(r.error)return proDbError(r.error,'El trabajo cambió.');return Response.json(timeClockOptionsSchema.parse(r.data),{headers});}
  const r=await a.db.rpc('pro_timesheet_read',{p_owner:a.user.id,p_person:who,p_week:parsed.data.week});if(r.error)return proDbError(r.error,'Las horas cambiaron.');
  return Response.json(timesheetSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar la hoja de horas.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'time-clock-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=timeClockMutationSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise los datos de la jornada.');}
  const who=(await person())??a.user.id;
  if(input.action==='clock_in'){
   const r=await a.db.rpc('pro_time_clock_in',{p_owner:a.user.id,p_person:who,p_input:input});
   if(r.error)return proDbError(r.error,r.error.message==='A timer is already open'?'Ya tiene una jornada o cronómetro abierto. Deténgalo antes de fichar otra entrada.':'La tarea o el trabajo cambiaron. Recargue.');
   return Response.json(r.data,{headers});
  }
  if(input.action==='settings'){
   const r=await a.db.rpc('pro_time_clock_settings_save',{p_owner:a.user.id,p_person:who,p_input:input});
   if(r.error)return r.error.code==='42501'?proFail(403,'Solo un Administrador puede cambiar esta opción.'):proDbError(r.error,'La opción cambió en otra pestaña. Recargue.');
   return Response.json(r.data,{headers});
  }
  const r=await a.db.rpc('pro_timesheet_decide',{p_owner:a.user.id,p_person:who,p_input:input});
  if(r.error)return r.error.code==='42501'?proFail(403,'Su rol no permite aprobar hojas de horas.'):proDbError(r.error,'La semana cambió. Recargue antes de decidir.');
  return Response.json(timesheetDecisionResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente: no se duplicará.');}
}
