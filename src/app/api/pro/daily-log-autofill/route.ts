import {z} from 'zod';
import {proAccountRateLimit,proActor,proDbError,proFail,proQuery,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {autofillSchema,mockWeather} from '@/lib/pro/round10';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 10 (row 20): suggestions to fill a daily log entry (read only): crew and minutes from the hours
 * of that date, tasks completed that day and tasks planned for it (SQL pro_daily_log_autofill), plus
 * weather from the MOCK adapter (deterministic sample, no provider is called). The entry itself is
 * saved by the existing daily log writer after the person reviews it.
 */
const query=z.object({workId:z.string().trim().min(1).max(160),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),lang:z.enum(['es','en']).optional()}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),parsed=raw?query.safeParse(raw):null;if(!parsed?.success)return proFail(400,'Consulta inválida.');
  const limited=await proAccountRateLimit('daily-autofill',a.user.id,30,60000);if(limited)return limited;
  const r=await a.db.rpc('pro_daily_log_autofill',{p_owner:a.user.id,p_work:parsed.data.workId,p_date:parsed.data.date});if(r.error)return proDbError(r.error,'El trabajo cambió.');
  return Response.json(autofillSchema.parse({...(r.data as object),weather:mockWeather(parsed.data.workId,parsed.data.date,parsed.data.lang==='en')}),{headers});
 }catch{return proFail(503,'No se pudieron preparar los datos del día.');}
}
