import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {dailyLogSettingsSaveSchema,dailyLogSettingsSchema} from '@/lib/pro/daily-log-automation';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Row 20 (405): weather provider/location and automatic draft settings of the daily log (owner of the company). CAS by revision. */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(raw&&Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_daily_log_settings_read',{p_owner:a.user.id});if(r.error)return proDbError(r.error,'La configuración cambió.');
  return Response.json(dailyLogSettingsSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar la configuración de la bitácora.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'daily-log-settings-'+a.user.id,40,60000);if(limited)return limited;
  let input;try{input=dailyLogSettingsSaveSchema.parse(await proBoundedJson(req,2048));}catch{return proFail(400,'Revise la configuración.');}
  const r=await a.db.rpc('pro_daily_log_settings_save',{p_owner:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'La configuración cambió. Recargue.');
  return Response.json(dailyLogSettingsSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo guardar la configuración.');}
}
