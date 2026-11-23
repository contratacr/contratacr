import {z} from 'zod';
import {proAccountRateLimit,proActor,proDbError,proFail,proQuery,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {autofillSchema} from '@/lib/pro/round10';
import {readWeather,weatherProviderChoices} from '@/lib/pro/weather';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 10 (row 20): suggestions to fill a daily log entry (read only): crew and minutes from the hours
 * of that date, tasks completed that day and tasks planned for it (SQL pro_daily_log_autofill), plus
 * weather from the provider adapter (src/lib/pro/weather.ts: sample by default, sandbox or Open-Meteo by setting). The entry itself is
 * saved by the existing daily log writer after the person reviews it.
 */
const query=z.object({workId:z.string().trim().min(1).max(160),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),lang:z.enum(['es','en']).optional()}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),parsed=raw?query.safeParse(raw):null;if(!parsed?.success)return proFail(400,'Consulta inválida.');
  const limited=await proAccountRateLimit('daily-autofill',a.user.id,30,60000);if(limited)return limited;
  const r=await a.db.rpc('pro_daily_log_autofill',{p_owner:a.user.id,p_work:parsed.data.workId,p_date:parsed.data.date});if(r.error)return proDbError(r.error,'El trabajo cambió.');
  // Row 20 (405): weather through the provider adapter chosen in the daily log settings (default: labelled sample).
  const settings=await a.db.rpc('pro_daily_log_settings_read',{p_owner:a.user.id}),w=(settings.data as {weather?:{provider?:string;latitude?:number;longitude?:number}}|null)?.weather,
   choice=(weatherProviderChoices as readonly string[]).includes(w?.provider??'')?w!.provider as typeof weatherProviderChoices[number]:'auto';
  const weather=await readWeather(choice,{latitude:w?.latitude??9.93,longitude:w?.longitude??-84.08,date:parsed.data.date,workId:parsed.data.workId,en:parsed.data.lang==='en'});
  return Response.json(autofillSchema.parse({...(r.data as object),weather}),{headers});
 }catch{return proFail(503,'No se pudieron preparar los datos del día.');}
}
