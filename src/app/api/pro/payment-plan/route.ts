import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proCustomerReader,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {clientPaymentPlanBodySchema,clientPaymentPlanSchema,paymentPlanAcceptSchema,paymentPlanMutationSchema,paymentPlanNoticesSchema,paymentPlanReadSchema} from '@/lib/pro/payment-plan';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 5: «Plan de pagos» (the professional's own installment plan; no lender, no interest, nothing sent or charged).
// GET ?workId= (owner) · ?workId=&part=notices (owner, overview) · ?requestId= (linked customer, or the owner's preview).
const conflict='El plan de pagos cambió. Actualice y revise antes de guardar.';
const ownerQuery=z.object({workId:z.string().trim().min(1).max(160),part:z.literal('notices').optional()}).strict(),clientQuery=z.object({requestId:z.string().uuid()}).strict();
function planError(error:{code?:string;hint?:string}){
 if(error.hint==='pro_payment_plan_invoiced')return Response.json({error:'Una cuota tiene un borrador de factura activo. Archívelo en Facturas antes de cambiar o cancelar el plan.',reason:'invoiced'},{status:400,headers});
 if(error.hint==='pro_payment_plan_sum')return Response.json({error:'La prima y las cuotas deben sumar exactamente el total.',reason:'sum'},{status:400,headers});
 if(error.hint==='pro_billing_already')return Response.json({error:'Esa cuota ya está en un borrador activo, o el trabajo ya se factura por líneas o avance.',reason:'already_billed'},{status:409,headers});
 return proDbError(error,conflict);
}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  if('requestId' in raw){
   const q=clientQuery.safeParse(raw);if(!q.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_payment_plan_client_read',{p_actor:await proCustomerReader(a.db,a.user.id,q.data.requestId),p_request:q.data.requestId});
   if(result.error)return planError(result.error);if(!result.data)return proFail(404,'Cita no disponible.');
   return Response.json(clientPaymentPlanSchema.parse(result.data),{headers});
  }
  const q=ownerQuery.safeParse(raw);if(!q.success)return proFail(400,'Consulta inválida.');
  if(q.data.part==='notices'){
   const result=await a.db.rpc('pro_payment_plan_notices',{p_actor:a.user.id,p_work:q.data.workId});
   if(result.error)return planError(result.error);if(!result.data)return proFail(404,'Trabajo no disponible.');
   return Response.json(paymentPlanNoticesSchema.parse(result.data),{headers});
  }
  const result=await a.db.rpc('pro_payment_plan_read',{p_actor:a.user.id,p_work:q.data.workId});
  if(result.error)return planError(result.error);if(!result.data)return proFail(404,'Trabajo no disponible.');
  return Response.json(paymentPlanReadSchema.parse(result.data),{headers});
 }catch{return proFail(503,'No se pudo cargar el plan de pagos. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'payment-plan-'+a.user.id,60,60000);if(limited)return limited;
  let raw:unknown;try{raw=await proBoundedJson(req,16384);}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise el plan de pagos.');}
  if(raw&&typeof raw==='object'&&(raw as {action?:unknown}).action==='accept'){
   const input=paymentPlanAcceptSchema.safeParse(raw);if(!input.success)return proFail(400,'Revise su respuesta.');
   const result=await a.db.rpc('pro_payment_plan_client_mutate',{p_actor:a.user.id,p_input:input.data});
   if(result.error)return planError(result.error);return Response.json(clientPaymentPlanBodySchema.parse(result.data.plan),{headers});
  }
  const input=paymentPlanMutationSchema.safeParse(raw);if(!input.success)return proFail(400,input.error.issues[0]?.message||'Revise el plan de pagos.');
  const result=await a.db.rpc('pro_payment_plan_mutate',{p_actor:a.user.id,p_input:input.data});
  if(result.error){
   if(result.error.code==='22023'&&!result.error.hint)return proFail(400,'Revise el plan: montos, fechas, hitos o tareas no válidos, o el trabajo está cancelado o su cliente archivado. No se guardó nada.');
   return planError(result.error);
  }
  return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
