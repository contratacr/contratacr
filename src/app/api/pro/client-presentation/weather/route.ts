import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proFail,proQuery,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {weatherCities,weatherCityKeys,type WeatherCity} from '@/lib/pro/client-presentation';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 33: three-day weather for a Costa Rican province, for the customer view widget. Public forecast data (no key,
 * no personal data is sent: only the coordinates of the province). Short timeout; any failure answers
 * {available:false} and the widget says the forecast is not available. Needs a signed-in account (rate limited).
 */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'client-weather-'+a.user.id,60,60000);if(limited)return limited;
  const q=proQuery(req);const parsed=z.object({city:z.enum(weatherCityKeys as [WeatherCity,...WeatherCity[]])}).strict().safeParse(q);if(!parsed.success)return proFail(400,'Consulta inválida.');
  const city=parsed.data.city,place=weatherCities[city];
  try{
   const url=`https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FCosta_Rica&forecast_days=3`;
   const r=await fetch(url,{signal:AbortSignal.timeout(3500),headers:{Accept:'application/json'}});if(!r.ok)throw Error(String(r.status));
   const d=await r.json() as {current?:{temperature_2m?:number;weather_code?:number};daily?:{time?:string[];temperature_2m_max?:(number|null)[];temperature_2m_min?:(number|null)[];precipitation_probability_max?:(number|null)[]}};
   const times=d.daily?.time??[];
   return Response.json({available:true,city,tempC:d.current?.temperature_2m??null,code:d.current?.weather_code??null,
    days:times.slice(0,3).map((date,i)=>({date,maxC:d.daily?.temperature_2m_max?.[i]??null,minC:d.daily?.temperature_2m_min?.[i]??null,rainPct:d.daily?.precipitation_probability_max?.[i]??null}))},{headers});
  }catch{return Response.json({available:false,city},{headers});}
 }catch{return proFail(503,'No se pudo cargar el clima.');}
}
