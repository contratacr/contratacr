import {enforceRateLimit} from '@/lib/rate-limit';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {closeDateInputSchema,closeDateResultSchema,closeForecastSchema} from '@/lib/pro/sales-pipeline';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 07: expected close date per lead and the forecast by close month. SQL is the authority
 * (pro_lead_close_*): per-lead revision (40001 -> 409), idempotent action receipts, immutable history.
 * The forecast is not a payment. Role gate: writes = lead.write (prefix lead-).
 */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const r=await a.db.rpc('pro_lead_close_forecast_read',{p_owner:a.user.id});if(r.error)return proDbError(r.error,'Las solicitudes cambiaron.');
  return Response.json(closeForecastSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar la previsión.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'lead-close-dates-'+a.user.id,120,60000);if(limited)return limited;
  let input;try{input=closeDateInputSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise la fecha de cierre.');}
  const member=await proWorkspaceMember();const r=await a.db.rpc('pro_lead_close_date_mutate',{p_owner:a.user.id,p_input:input,p_member:member?.memberId??null});
  if(r.error)return proDbError(r.error,'La fecha cambió en otra pestaña. Recargue.');
  return Response.json(closeDateResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo guardar. Reintente: no se duplicará.');}
}
