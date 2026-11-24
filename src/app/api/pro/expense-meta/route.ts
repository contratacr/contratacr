import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {expenseMetaMutationSchema,expenseMetaSchema} from '@/lib/pro/expense-meta';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Area D: reference number and Taxable flag of internal expenses. Owner only. */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');
  const ids=z.array(z.string().uuid()).min(1).max(50).parse((q.ids??'').split(',').filter(Boolean));
  const r=await a.db.rpc('pro_expense_meta_read',{p_actor:a.user.id,p_ids:ids});if(r.error)return proDbError(r.error,'El gasto cambió.');
  return Response.json({items:z.record(z.string(),expenseMetaSchema).parse(r.data)},{headers});
 }catch{return proFail(400,'Consulta inválida.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'expense-meta-'+a.user.id,60,60000);if(limited)return limited;
 let input;try{input=expenseMetaMutationSchema.parse(await proBoundedJson(req,2048));}catch{return proFail(400,'Revise los datos del gasto.');}
 try{
  const r=await a.db.rpc('pro_expense_meta_set',{p_actor:a.user.id,p_input:input});
  if(r.error){if(r.error.code==='P0002')return proFail(404,'El gasto ya no está disponible.');return proDbError(r.error,'El gasto cambió. Actualice antes de guardar.');}
  return Response.json({meta:expenseMetaSchema.parse(r.data)},{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente.');}
}
