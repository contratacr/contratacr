import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proInternalFinanceDenied,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {savedReportMutationSchema,savedReportsSchema} from '@/lib/pro/saved-reports';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Area E: saved custom reports (a name, a report type and a period). Same access as the reports themselves. */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const denied=await proInternalFinanceDenied();if(denied)return denied;
  const r=await a.db.rpc('pro_saved_reports_read',{p_actor:a.user.id});if(r.error)return proDbError(r.error,'Los reportes cambiaron.');
  return Response.json(savedReportsSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar los reportes guardados.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;const denied=await proInternalFinanceDenied();if(denied)return denied;
 const limited=await enforceRateLimit(req,'saved-reports-'+a.user.id,60,60000);if(limited)return limited;
 let input;try{input=savedReportMutationSchema.parse(await proBoundedJson(req,8*1024));}catch{return proFail(400,'Revise el nombre, el reporte y el período.');}
 try{
  const r=await a.db.rpc('pro_saved_reports_mutate',{p_actor:a.user.id,p_input:input});
  if(r.error){
   if(r.error.code==='23505')return proFail(409,'Ya tiene un reporte guardado con ese nombre.');
   if(r.error.code==='54000')return proFail(409,'Llegó al límite de 30 reportes guardados.');
   if(r.error.code==='P0002')return proFail(404,'El reporte ya no existe.');
   return proDbError(r.error,'El reporte cambió. Actualice.');
  }
  return Response.json(savedReportsSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo guardar el reporte. Reintente.');}
}
