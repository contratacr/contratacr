import {proAccountRateLimit,proActor,proDbError,proFail,proInternalFinanceDenied,proQuery,proRouteHeaders} from '@/lib/pro/route-common';
import {proReportQuerySchema,proReportSchema} from '@/lib/pro/reports';

// Round 7B: financial (invoiced, collected, outstanding by age, job profitability) and jobs
// reports for the owner. Read-only; the CSV is built in the browser from this same answer.
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;const denied=await proInternalFinanceDenied();if(denied)return denied;const limited=await proAccountRateLimit('reports',a.user.id,30,60000);if(limited)return limited;const raw=proQuery(req);const q=raw?proReportQuerySchema.safeParse(raw):null;
  if(!q?.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_reports_read',{p_actor:a.user.id,p_from:q.data.from??null,p_to:q.data.to??null});
  if(result.error)return proDbError(result.error,'Los datos cambiaron. Actualice.');
  return Response.json(proReportSchema.parse(result.data),{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo cargar el reporte. Reintente.');}
}
