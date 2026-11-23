import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {dailyLogCrewResultSchema,dailyLogCrewSaveSchema,dailyLogCrewSchema} from '@/lib/pro/operations';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Ronda F2-C (row 20): crew present in a daily log entry, chosen from the team (owner and active company
 * members) with hours per person. The entry's crew summary is written through the existing journal writer.
 */
const query=z.object({workId:z.string().min(1).max(160),logId:z.string().uuid()}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const parsed=query.safeParse(proQuery(req));if(!parsed.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_daily_log_crew_read',{p_owner:a.user.id,p_work:parsed.data.workId,p_log:parsed.data.logId});if(r.error)return proDbError(r.error,'La entrada cambió.');
  return Response.json(dailyLogCrewSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar el personal.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'daily-log-crew-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=dailyLogCrewSaveSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise el personal.');}
  const r=await a.db.rpc('pro_daily_log_crew_save',{p_owner:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'La entrada o el equipo cambiaron. Recargue.');
  return Response.json(dailyLogCrewResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente: no se duplicará.');}
}
