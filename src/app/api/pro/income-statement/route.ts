import {proAccountRateLimit,proActor,proDbError,proFail,proInternalFinanceDenied,proQuery,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {incomeQuerySchema} from '@/lib/pro/payables';

/**
 * Round F1-A (row 55): simple income statement per period and per job (invoiced without IVA vs expenses, recorded hours and PO supplier bills). Management report, not a tax filing.
 * Read-only; owner, Administrator and Manager. Regression owner: tests/e2e/pro-payables-cashflow.spec.ts.
 */
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const denied=await proInternalFinanceDenied();if(denied)return denied;
  const limited=await proAccountRateLimit('income-statement',a.user.id,30,60000);if(limited)return limited;
  const raw=proQuery(req);const q=raw?incomeQuerySchema.safeParse(raw):null;if(!q?.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_income_statement_read',{p_actor:a.user.id,p_from:q.data.from,p_to:q.data.to,p_grain:q.data.grain});
  if(r.error)return proDbError(r.error,'Los datos cambiaron. Actualice.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo cargar el estado de resultados. Reintente.');}
}
