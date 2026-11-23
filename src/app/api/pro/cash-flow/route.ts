import {proAccountRateLimit,proActor,proDbError,proFail,proInternalFinanceDenied,proQuery,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {cashFlowQuerySchema} from '@/lib/pro/payables';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round F1-A (row 55): cash flow by week or month: payments received and made (actual) and open invoices, payment-plan installments and payables by due date (expected), overdue placed on today, running balance.
 * Read-only; owner, Administrator and Manager. Regression owner: tests/e2e/pro-payables-cashflow.spec.ts.
 */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const denied=await proInternalFinanceDenied();if(denied)return denied;
  const limited=await proAccountRateLimit('cash-flow',a.user.id,30,60000);if(limited)return limited;
  const raw=proQuery(req);const q=raw?cashFlowQuerySchema.safeParse(raw):null;if(!q?.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_cash_flow_read',{p_actor:a.user.id,p_from:q.data.from,p_to:q.data.to,p_grain:q.data.grain});
  if(r.error)return proDbError(r.error,'Los datos cambiaron. Actualice.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo cargar el flujo de caja. Reintente.');}
}
