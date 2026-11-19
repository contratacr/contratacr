import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {baselineMutationSchema} from '@/lib/pro/project-schedule';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin,proCustomerReader} from '@/lib/pro/route-common';
// Families 13/79: owner Gantt with baselines, and the linked customer's opt-in schedule.
const conflict='El cronograma cambió. Actualice antes de guardar.';
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);
  if(!q||Object.keys(q).length!==1)return proFail(400,'Consulta inválida.');
  if('requestId'in q){
   const request=z.string().uuid().safeParse(q.requestId);if(!request.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_work_schedule_client_read',{p_actor:await proCustomerReader(a.db,a.user.id,request.data),p_request:request.data});
   if(result.error)return proDbError(result.error,conflict);return result.data?Response.json(result.data,{headers}):proFail(404,'Cita no disponible.');
  }
  const work=z.string().trim().min(1).max(160).safeParse(q.workId);if(!work.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_work_gantt_read',{p_actor:a.user.id,p_work:work.data});
  if(result.error)return proDbError(result.error,conflict);return result.data?Response.json(result.data,{headers}):proFail(404,'Trabajo no disponible.');
 }catch{return proFail(503,'No se pudo cargar el cronograma.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'project-schedule-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=baselineMutationSchema.parse(await proBoundedJson(req,4096));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise la línea base.');}
  const result=await a.db.rpc('pro_work_schedule_baseline_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error)return proDbError(result.error,conflict);return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
