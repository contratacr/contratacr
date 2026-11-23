import {proActor,proInternalFinanceAllowed,proWithoutInternalCost,proDbError,proFail,proQuery,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {timeReportCsv,timeReportQuerySchema,timeReportSchema} from '@/lib/pro/round9';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 9: global hours across jobs (read only): period, job, person and billable filters, totals by
 * person and job, and a CSV export of exactly the filtered rows. SQL (pro_time_report_read) is the
 * authority and counts the same single time ledger as each job's Horas view. Through the role gate
 * (GET = read): company members read the owner's hours.
 */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req),parsed=raw?timeReportQuerySchema.safeParse(raw):null;if(!parsed?.success)return proFail(400,'Revise el período y los filtros.');
  const {format,lang,...filters}=parsed.data;
  const r=await a.db.rpc('pro_time_report_read',{p_actor:a.user.id,p_filters:filters});if(r.error)return proDbError(r.error,'Las horas cambiaron. Recargue.');
  const parsedReport=timeReportSchema.parse(r.data);
  const report=await proInternalFinanceAllowed()?parsedReport:{...proWithoutInternalCost(parsedReport,{nullify:['costCents']}),totals:{...parsedReport.totals,costCents:null,uncostedMinutes:0},costsHidden:true};
  if(format==='csv'){const en=lang==='en';
   return new Response(timeReportCsv(report,en),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="horas-${report.period.from}-${report.period.to}.csv"`}});}
  return Response.json(report,{headers});
 }catch{return proFail(503,'No se pudieron cargar las horas.');}
}
