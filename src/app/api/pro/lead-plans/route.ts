import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {leadPlanInputSchema,leadPlanItemSchema,leadPlansSchema} from '@/lib/pro/lead-plans';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Rows 78/79: pending task/schedule template plans of an opportunity (manual lead) that is not a job yet. SQL is the
 * authority (pro_lead_plan_*): the plan is created in the job by the conversion itself, in the same transaction.
 * Nothing is sent. Idempotent by actionId; removing a plan is guarded by its revision (409).
 */
const query=z.object({leadId:z.string().uuid()}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),q=raw?query.safeParse(raw):null;if(!q?.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_lead_plan_read',{p_owner:a.user.id,p_lead:q.data.leadId});if(r.error)return proDbError(r.error,'La oportunidad cambió.');
  const data=leadPlansSchema.parse(r.data);if(data.leadId!==q.data.leadId)return proFail(503,'No se pudo comprobar el origen.');
  return Response.json(data,{headers});
 }catch{return proFail(503,'No se pudieron cargar los planes.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'lead-plans-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=leadPlanInputSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise la plantilla y la fecha de inicio.');}
  const r=await a.db.rpc('pro_lead_plan_mutate',{p_owner:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'La oportunidad o el plan cambió. Actualice y revise.');
  return Response.json(leadPlanItemSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente: no se duplicará.');}
}
