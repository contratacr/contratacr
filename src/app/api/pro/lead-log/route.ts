import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {leadLogInputSchema,leadLogQuerySchema,leadLogSchema} from '@/lib/pro/lead-log';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Leads area: private notes, call log and tags of a lead. SQL is the authority (pro_lead_log_*). Nothing is sent.
 * Idempotent by actionId; edit/remove are guarded by the entry revision (409).
 */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),q=raw?leadLogQuerySchema.safeParse(raw):null;if(!q?.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_lead_log_read',{p_owner:a.user.id,p_kind:q.data.kind,p_lead:q.data.leadId});if(r.error)return proDbError(r.error,'La solicitud cambió.');
  const data=leadLogSchema.parse(r.data);if(data.leadId!==q.data.leadId)return proFail(503,'No se pudo comprobar el origen.');
  return Response.json(data,{headers});
 }catch{return proFail(503,'No se pudieron cargar las notas.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'lead-log-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=leadLogInputSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise el texto de la nota, la llamada o la etiqueta.');}
  const r=await a.db.rpc('pro_lead_log_mutate',{p_owner:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'La nota cambió. Actualice y revise.');
  const data=leadLogSchema.parse(r.data);if(data.leadId!==input.leadId)return proFail(503,'No se pudo comprobar el origen.');
  return Response.json(data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente: no se duplicará.');}
}
