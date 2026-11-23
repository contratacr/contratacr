'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {dailyLogAutomationResultSchema,dailyLogSettingsSchema,type DailyLogSettings} from '@/lib/pro/daily-log-automation';

/**
 * Row 20 (405): weather provider and automatic drafts of the daily log. Weather comes from an adapter (server
 * default, test provider, Open-Meteo or manual); with the automation on, opening the Bitacora prepares private drafts
 * for recent days with work and no entry. Reminders ("Falta la bitacora de ayer") keep their own preferences in the
 * notification center.
 */
const control='block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base';
export function DailyLogAutomationPanel({workId,onCreated}:{workId:string;onCreated:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [data,setData]=useState<DailyLogSettings|null>(null),[draft,setDraft]=useState<DailyLogSettings|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),ran=useRef('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/daily-log-settings',{cache:'no-store'});if(!r.ok)return;const v=dailyLogSettingsSchema.parse(await r.json());setData(v);setDraft(v);}catch{/* settings are optional: the log works without them */}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 // Prepares automatic drafts once per job and settings revision (server decides if there is anything to prepare).
 useEffect(()=>{if(!data?.automation.enabled)return;const key=workId+':'+data.automation.revision;if(ran.current===key)return;ran.current=key;
  void fetch('/api/pro/daily-log-automation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workId,lang:en?'en':'es'})}).then(async r=>{if(!r.ok)return;const v=dailyLogAutomationResultSchema.parse(await r.json());if(v.created>0){setMessage(t(`Se prepararon ${v.created} borradores automáticos (privados). Revíselos antes de compartir.`,`${v.created} automatic drafts were prepared (private). Review them before sharing.`));onCreated();}}).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[data?.automation.enabled,data?.automation.revision,workId]);
 if(!data||!draft)return null;
 async function save(kind:'weather'|'automation'){
  if(busy||!draft||!data)return;setBusy(true);setMessage('');
  const body=kind==='weather'?{kind,revision:data.weather.revision,provider:draft.weather.provider,latitude:draft.weather.latitude,longitude:draft.weather.longitude,place:draft.weather.place}:{kind,revision:data.automation.revision,enabled:draft.automation.enabled,includeWeather:draft.automation.includeWeather,lookbackDays:draft.automation.lookbackDays};
  try{const r=await fetch('/api/pro/daily-log-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const res=await r.json().catch(()=>({}));
   if(!r.ok){setMessage(typeof res.error==='string'?res.error:t('No se pudo guardar.','Could not save.'));await load();return;}
   const v=dailyLogSettingsSchema.parse(res);setData(v);setDraft(v);setMessage(t('Configuración guardada.','Settings saved.'));}
  catch{setMessage(t('No se pudo guardar.','Could not save.'));}finally{setBusy(false);}
 }
 const w=draft.weather,a=draft.automation,num=(v:string,fallback:number)=>{const n=Number(v.replace(',','.'));return Number.isFinite(n)?n:fallback;};
 return <details data-daily-log-automation className="rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <summary className="min-h-11 cursor-pointer py-2 font-semibold">{t('Clima y borradores automáticos','Weather and automatic drafts')}</summary>
  <div className="mt-2 space-y-4">
   {message&&<p role="status" data-daily-log-automation-message className="rounded-xl bg-[#f7f9fc] p-2 text-sm">{message}</p>}
   <div className="space-y-2" data-daily-log-weather-settings>
    <h4 className="font-semibold">{t('Clima','Weather')}</h4>
    <label className="block text-sm font-semibold">{t('Fuente del clima','Weather source')}<select data-weather-provider className={control+' mt-1'} value={w.provider} disabled={busy} onChange={e=>setDraft({...draft,weather:{...w,provider:e.target.value as typeof w.provider}})}>
     <option value="auto">{t('Predeterminada del servidor','Server default')}</option><option value="open-meteo">Open-Meteo</option><option value="sandbox">{t('Proveedor de pruebas','Test provider')}</option><option value="manual">{t('Solo manual (sin sugerencia)','Manual only (no suggestion)')}</option></select></label>
    <div className="grid gap-2 sm:grid-cols-3">
     <label className="block text-sm font-semibold">{t('Lugar (nota)','Place (note)')}<input data-weather-place maxLength={120} className={control+' mt-1'} value={w.place} disabled={busy} onChange={e=>setDraft({...draft,weather:{...w,place:e.target.value}})}/></label>
     <label className="block text-sm font-semibold">{t('Latitud','Latitude')}<input data-weather-lat inputMode="decimal" className={control+' mt-1'} defaultValue={String(w.latitude)} disabled={busy} onBlur={e=>setDraft({...draft,weather:{...w,latitude:Math.max(-90,Math.min(90,num(e.target.value,w.latitude)))}})}/></label>
     <label className="block text-sm font-semibold">{t('Longitud','Longitude')}<input data-weather-lon inputMode="decimal" className={control+' mt-1'} defaultValue={String(w.longitude)} disabled={busy} onBlur={e=>setDraft({...draft,weather:{...w,longitude:Math.max(-180,Math.min(180,num(e.target.value,w.longitude)))}})}/></label></div>
    <p className="text-xs text-[#52627a]">{t('Si el proveedor no responde se sugiere un clima de ejemplo, marcado como simulado. Usted siempre revisa el clima antes de guardar.','If the provider does not respond, a sample weather marked as simulated is suggested. You always review the weather before saving.')}</p>
    <div className="flex justify-end"><Button type="button" variant="outline" data-weather-save disabled={busy} onClick={()=>void save('weather')}>{t('Guardar clima','Save weather')}</Button></div></div>
   <div className="space-y-2 border-t border-[#eef2f6] pt-3" data-daily-log-auto-settings>
    <h4 className="font-semibold">{t('Borradores automáticos','Automatic drafts')}</h4>
    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" data-auto-enabled className="h-5 w-5" checked={a.enabled} disabled={busy} onChange={e=>setDraft({...draft,automation:{...a,enabled:e.target.checked}})}/>{t('Preparar un borrador privado de los días con trabajo y sin entrada','Prepare a private draft for days with work and no entry')}</label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" data-auto-weather className="h-5 w-5" checked={a.includeWeather} disabled={busy} onChange={e=>setDraft({...draft,automation:{...a,includeWeather:e.target.checked}})}/>{t('Incluir el clima sugerido','Include the suggested weather')}</label>
    <label className="block text-sm font-semibold">{t('Días hacia atrás','Days back')}<select data-auto-days className={control+' mt-1 sm:w-40'} value={a.lookbackDays} disabled={busy} onChange={e=>setDraft({...draft,automation:{...a,lookbackDays:Number(e.target.value)}})}>{[1,2,3,5,7].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
    <p className="text-xs text-[#52627a]">{t('Los borradores son privados, nunca se publican ni se comparten solos, y no se vuelven a crear si usted los archiva. Se preparan al abrir la Bitácora (no hay un proceso en segundo plano). El recordatorio "Falta la bitácora de ayer" se configura en Avisos.','Drafts are private, never published or shared on their own, and are not recreated if you archive them. They are prepared when you open the Daily log (there is no background process). The "Yesterday\'s daily log is missing" reminder is configured in Notifications.')}</p>
    <div className="flex justify-end"><Button type="button" variant="outline" data-auto-save disabled={busy} onClick={()=>void save('automation')}>{t('Guardar borradores','Save drafts')}</Button></div></div>
  </div></details>;
}
