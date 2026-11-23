import {z} from 'zod';
import {PRO_ENABLED} from '@/lib/pro/enabled';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proInternalFinanceDenied,proRequestOrigin,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {profitTargetMutationSchema,profitTargetResultSchema,workProfitabilitySchema} from '@/lib/pro/work-profitability';

// Row 23: profitability of a job (agreed vs real cost, commitments, approved changes, projection) and the owner's minimum-margin alert.
// Owner only, internal finance roles only. Read model; the single write is the target, idempotent by actionId with CAS on its revision.
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const q=new URL(req.url).searchParams,keys=[...q.keys()];if(keys.length!==1||keys[0]!=='workId')return proFail(400,'Consulta inválida.');
  const work=z.string().trim().min(1).max(160).safeParse(q.get('workId'));if(!work.success)return proFail(400,'Consulta inválida.');
  const denied=await proInternalFinanceDenied();if(denied)return denied;
  const r=await a.db.rpc('pro_work_profitability_read',{p_actor:a.user.id,p_work:work.data});
  if(r.error)return proDbError(r.error,'El trabajo cambió. Actualice.');
  if(!r.data)return proFail(404,'Trabajo no disponible.');
  return Response.json(workProfitabilitySchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo calcular la rentabilidad. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==proRequestOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  if(req.headers.get('x-pro-expected-actor')!==a.user.id)return proFail(403,'La cuenta cambió.');
  const denied=await proInternalFinanceDenied();if(denied)return denied;
  const limited=await enforceRateLimit(req,'work-profit-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=profitTargetMutationSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise el margen mínimo.');}
  const r=await a.db.rpc('pro_work_profit_target_set',{p_actor:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'El margen mínimo cambió. Actualice antes de guardar.');
  return Response.json(profitTargetResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
