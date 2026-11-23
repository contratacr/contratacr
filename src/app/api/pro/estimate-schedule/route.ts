import {z} from 'zod';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin,proAccountRateLimit} from '@/lib/pro/route-common';
import {estimateScheduleApplySchema,estimateScheduleResultSchema,estimateScheduleSourceSchema} from '@/lib/pro/operations';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Ronda F2-C (row 13, "cotización a cronograma"): proposal of phases (quote sections) and tasks (quote lines)
 * for one job, and the apply that creates them through the existing task/plan/link writers in one transaction.
 * Role gate: GET = read, POST = work.write (estimate-schedule is not a classified module).
 */
const query=z.object({workId:z.string().min(1).max(160)}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const parsed=query.safeParse(proQuery(req));if(!parsed.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_estimate_schedule_source',{p_owner:a.user.id,p_work:parsed.data.workId});
  if(r.error)return proDbError(r.error,'El cronograma cambió.');
  return Response.json(estimateScheduleSourceSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar las cotizaciones del trabajo.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await proAccountRateLimit('estimate-schedule',a.user.id,20,60000);if(limited)return limited;
  let input;try{input=estimateScheduleApplySchema.parse(await proBoundedJson(req,65536));}catch{return proFail(400,'Revise las fases y tareas.');}
  const r=await a.db.rpc('pro_estimate_schedule_apply',{p_owner:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'El cronograma o la cotización cambiaron. Actualice antes de crear.');
  return Response.json(estimateScheduleResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el cronograma. Reintente: no se duplicará.');}
}
