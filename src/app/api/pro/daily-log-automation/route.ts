import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {AUTO_DRAFT_LIMIT,dailyLogAutomationResultSchema,dailyLogAutomationRunSchema} from '@/lib/pro/daily-log-automation';
import {autofillSchema,autofillSummary} from '@/lib/pro/round10';
import {readWeather,weatherProviderChoices} from '@/lib/pro/weather';
import {crTodayISO} from '@/lib/time-cr';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 20 (405): automatic daily log drafts. When the owner turned the automation on, opening a job's Bitacora asks
 * this route to prepare PRIVATE drafts (never published or shared) for recent days of that job that had hours,
 * timers or completed tasks and no entry. Text, crew minutes and weather come from the same sources as
 * "Completar con datos del dia" (weather through the provider adapter). Each job/day is drafted at most once.
 */
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'daily-log-auto-'+a.user.id,20,60000);if(limited)return limited;
  let input;try{input=dailyLogAutomationRunSchema.parse(await proBoundedJson(req,512));}catch{return proFail(400,'Solicitud inválida.');}
  const en=input.lang==='en',today=crTodayISO();
  const cand=await a.db.rpc('pro_daily_log_auto_candidates',{p_owner:a.user.id,p_today:today});if(cand.error)return proDbError(cand.error,'No se pudo preparar la bitácora.');
  const c=cand.data as {enabled:boolean;includeWeather:boolean;items:{workId:string;date:string;service:string}[]};
  if(!c.enabled)return Response.json(dailyLogAutomationResultSchema.parse({enabled:false,created:0}),{headers});
  const settings=await a.db.rpc('pro_daily_log_settings_read',{p_owner:a.user.id}),w=(settings.data as {weather?:{provider?:string;latitude?:number;longitude?:number}}|null)?.weather,
   choice=(weatherProviderChoices as readonly string[]).includes(w?.provider??'')?w!.provider as typeof weatherProviderChoices[number]:'auto';
  let created=0;
  for(const item of c.items.filter(i=>i.workId===input.workId).slice(0,AUTO_DRAFT_LIMIT)){
   const fill=await a.db.rpc('pro_daily_log_autofill',{p_owner:a.user.id,p_work:item.workId,p_date:item.date});if(fill.error)continue;
   const weather=c.includeWeather?await readWeather(choice,{latitude:w?.latitude??9.93,longitude:w?.longitude??-84.08,date:item.date,workId:item.workId,en}):null;
   const data=autofillSchema.parse({...(fill.data as object),weather}),summary=autofillSummary(data,en).trim();
   if(!summary)continue;
   const made=await a.db.rpc('pro_daily_log_auto_create',{p_owner:a.user.id,p_today:today,p_input:{workId:item.workId,date:item.date,title:((en?'Automatic draft: ':'Borrador automático: ')+item.service).slice(0,160),summary:(en?'Automatic draft, review before sharing.\n':'Borrador automático, revise antes de compartir.\n')+summary,minutes:data.crew.minutes>0?data.crew.minutes:null,weather:weather?{condition:weather.condition,temperatureC:weather.temperatureC,note:weather.note.slice(0,300)}:null}});
   if(!made.error&&(made.data as {created?:boolean}|null)?.created)created++;
  }
  return Response.json(dailyLogAutomationResultSchema.parse({enabled:true,created}),{headers});
 }catch{return proFail(503,'No se pudo preparar la bitácora automática.');}
}
