import {z} from 'zod';
import {proAccountRateLimit,proActor,proDbError,proFail,proInternalFinanceDenied,proQuery,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {financeReportSchema} from '@/lib/pro/round11';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 11 (rows 23, 55): accounting reports for the owner — receivables aging per customer (open balance
 * of each invoice draft: payments and credit notes applied), payments received (reversed ones apart,
 * refunds total) and the IVA summary per rate. Read-only; the CSV is built in the browser from this answer.
 */
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const query=z.object({from:day.optional(),to:day.optional()}).strict().refine(v=>!v.from||!v.to||v.from<=v.to);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const denied=await proInternalFinanceDenied();if(denied)return denied;const limited=await proAccountRateLimit('finance-reports',a.user.id,30,60000);if(limited)return limited;const raw=proQuery(req);const q=raw?query.safeParse(raw):null;if(!q?.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_reports_finance_read',{p_actor:a.user.id,p_from:q.data.from??null,p_to:q.data.to??null});
  if(r.error)return proDbError(r.error,'Los datos cambiaron. Actualice.');
  return Response.json(financeReportSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar el reporte. Reintente.');}
}
