import {proAccountRateLimit,proActor,proBoundedJson,proDbError,proFail,proInternalFinanceDenied,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {payableMutationSchema,payablesQuerySchema} from '@/lib/pro/payables';

/**
 * Round F1-A (row 55): accounts payable for the owner, Administrator and Manager. Payables are the existing
 * expenses plus purchase orders with a recorded supplier bill; payments are written by the Expenses and
 * Purchase-order writers (pro_payables_mutate delegates). Internal record only: nothing is paid or sent.
 * Regression owner: tests/e2e/pro-payables-cashflow.spec.ts.
 */
const conflict='La cuenta por pagar cambió. Actualice antes de guardar.';
const reasons:Record<string,[string,string]>={
 pro_payable_paid:['Esta factura tiene pagos. Revierta primero los pagos en Gastos u Órdenes de compra.','paid'],
 pro_payable_void:['La factura está anulada. Restáurela antes de cambiarla o pagarla.','void'],
 pro_payable_order_state:['Emita la orden de compra antes de registrar su factura.','order_state'],
 pro_payable_balance:['El pago supera el saldo pendiente.','balance'],
};
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const denied=await proInternalFinanceDenied();if(denied)return denied;
  const limited=await proAccountRateLimit('payables',a.user.id,60,60000);if(limited)return limited;
  const raw=proQuery(req);const q=raw?payablesQuerySchema.safeParse(raw):null;if(!q?.success)return proFail(400,'Consulta inválida.');
  const query=Object.fromEntries(Object.entries(q.data).filter(([,value])=>value!==undefined));
  const r=await a.db.rpc('pro_payables_read',{p_actor:a.user.id,p_query:query});
  if(r.error)return proDbError(r.error,conflict);
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudieron cargar las cuentas por pagar. Reintente.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const denied=await proInternalFinanceDenied();if(denied)return denied;
  const limited=await proAccountRateLimit('payables-write',a.user.id,60,60000);if(limited)return limited;
  let input;try{input=payableMutationSchema.parse(await proBoundedJson(req,8192));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos de la cuenta por pagar.');}
  const r=await a.db.rpc('pro_payables_mutate',{p_actor:a.user.id,p_input:input});
  if(r.error){const known=r.error.hint?reasons[r.error.hint]:undefined;if(known)return Response.json({error:known[0],reason:known[1]},{status:400,headers});
   if(r.error.code==='P0002')return proFail(404,'No se encontró ese gasto u orden de compra.');return proDbError(r.error,conflict);}
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
