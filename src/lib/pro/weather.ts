import {z} from 'zod';
import {mockWeather} from '@/lib/pro/round10';
/**
 * Row 20 (405): weather for a daily log entry through a provider adapter.
 *  - "mock": deterministic sample, labelled as simulated (default; nothing leaves the server).
 *  - "sandbox": deterministic readings labelled as the sandbox provider (used by specs; never touches the network).
 *  - "open-meteo": real provider, no API key. Enabled per company ("open-meteo") or for every company with
 *    PRO_WEATHER_PROVIDER=open-meteo. PRO_WEATHER_OPEN_METEO_URL overrides the endpoint (stub/proxy).
 * A provider failure falls back to the labelled sample so the person never gets an invented reading shown as real.
 */
export type WeatherQuery={latitude:number;longitude:number;date:string;workId:string;en:boolean};
export type WeatherReading={condition:'clear'|'cloudy'|'rain'|'other';temperatureC:number;note:string;source:'mock'|'sandbox'|'open-meteo'};
export interface WeatherProvider{id:WeatherReading['source'];read(q:WeatherQuery,fetcher?:typeof fetch):Promise<WeatherReading>}
export const weatherProviderChoices=['auto','sandbox','open-meteo','manual'] as const;
export type WeatherProviderChoice=typeof weatherProviderChoices[number];

export const mockProvider:WeatherProvider={id:'mock',async read(q){const w=mockWeather(q.workId,q.date,q.en);return {condition:w.condition,temperatureC:w.temperatureC,note:w.note,source:'mock'};}};
export const sandboxProvider:WeatherProvider={id:'sandbox',async read(q){
 let h=0;for(const ch of q.date+'|'+q.latitude.toFixed(2)+'|'+q.longitude.toFixed(2))h=(h*31+ch.charCodeAt(0))>>>0;const options=['clear','cloudy','rain'] as const;
 return {condition:options[h%options.length],temperatureC:18+h%12,note:q.en?'Weather from the sandbox provider (test data, not real)':'Clima del proveedor de pruebas (datos de prueba, no reales)',source:'sandbox'};}};

const meteoSchema=z.object({daily:z.object({time:z.array(z.string()).min(1),weather_code:z.array(z.number().nullable()).min(1),temperature_2m_mean:z.array(z.number().nullable()).min(1),precipitation_sum:z.array(z.number().nullable()).optional()})});
/** WMO weather interpretation codes -> the four conditions of the daily log. */
export function conditionFromWmo(code:number,precipitationMm?:number|null):WeatherReading['condition']{
 if(code===0||code===1)return (precipitationMm??0)>=1?'rain':'clear';
 if(code===2||code===3||code===45||code===48)return (precipitationMm??0)>=1?'rain':'cloudy';
 if((code>=51&&code<=67)||(code>=80&&code<=82)||(code>=95&&code<=99))return 'rain';
 return 'other';}
export const openMeteoProvider:WeatherProvider={id:'open-meteo',async read(q,fetcher=fetch){
 const base=process.env.PRO_WEATHER_OPEN_METEO_URL||'https://api.open-meteo.com/v1/forecast';
 const url=base+'?'+new URLSearchParams({latitude:q.latitude.toFixed(4),longitude:q.longitude.toFixed(4),start_date:q.date,end_date:q.date,daily:'weather_code,temperature_2m_mean,precipitation_sum',timezone:'America/Costa_Rica'});
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),4000);
 try{const r=await fetcher(url,{signal:ctl.signal,cache:'no-store'});if(!r.ok)throw new Error('provider '+r.status);
  const d=meteoSchema.parse(await r.json()).daily,i=d.time.indexOf(q.date);if(i<0)throw new Error('date missing');
  const code=d.weather_code[i],temp=d.temperature_2m_mean[i];if(code==null||temp==null)throw new Error('no data');
  return {condition:conditionFromWmo(code,d.precipitation_sum?.[i]),temperatureC:Math.round(temp),note:q.en?'Weather from Open-Meteo for the site location':'Clima de Open-Meteo para la ubicación de la obra',source:'open-meteo'};
 }finally{clearTimeout(timer);}}};

/** "auto" follows the server default (PRO_WEATHER_PROVIDER), otherwise the company choice. "manual" means no suggestion. */
export function resolveWeatherProvider(choice:WeatherProviderChoice,env:string|undefined=process.env.PRO_WEATHER_PROVIDER):WeatherProvider|null{
 if(choice==='manual')return null;
 const id=choice==='auto'?(env==='open-meteo'||env==='sandbox'?env:'mock'):choice;
 return id==='open-meteo'?openMeteoProvider:id==='sandbox'?sandboxProvider:mockProvider;}
/** Never throws: a failing provider yields the labelled sample (with a note that the provider could not be reached). */
export async function readWeather(choice:WeatherProviderChoice,q:WeatherQuery,env?:string,fetcher?:typeof fetch):Promise<WeatherReading|null>{
 const provider=resolveWeatherProvider(choice,env);if(!provider)return null;
 try{return await provider.read(q,fetcher);}catch{const m=await mockProvider.read(q);return {...m,note:q.en?'Sample weather (simulated): the weather provider could not be reached':'Clima de ejemplo (simulado): no se pudo consultar el proveedor del clima'};}
}
