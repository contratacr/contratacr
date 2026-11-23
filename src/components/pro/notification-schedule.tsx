'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {scheduleSchema,type NotifyChannel,type NotifySchedule} from '@/lib/pro/notification-adapters';

/** Row 24: quiet hours, digest frequency and the sandbox outbox. Nothing is delivered outside the app. */
const control='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base';
const hours=Array.from({length:24},(_,h)=>String(h).padStart(2,'0')+':00');
export function NotificationSchedule(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [saved,setSaved]=useState<NotifySchedule|null>(null),[draft,setDraft]=useState<NotifySchedule|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[failed,setFailed]=useState(false);
 const load=useCallback(async()=>{setFailed(false);try{const r=await fetch('/api/pro/notification-schedule',{cache:'no-store'});if(!r.ok)throw Error();const body=scheduleSchema.parse(await r.json());setSaved(body);setDraft(old=>old&&old.revision===body.revision?old:body);}catch{setFailed(true);}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function post(body:object,done:string){
  setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/pro/notification-schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));
   if(!r.ok)throw Object.assign(Error('x'),{status:r.status});const next=scheduleSchema.parse(data);setSaved(next);setDraft(next);setNotice(done);}
  catch(e){setError((e as {status?:number}).status===409?t('Sus horarios cambiaron en otra pestaña. Recargue antes de guardar.','Your schedule changed in another tab. Reload before saving.'):t('No se pudo completar. Reintente: no se duplicará.','Could not complete. Retry: it will not duplicate.'));}
  finally{setBusy(false);}
 }
 if(failed)return <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t('No se pudieron cargar los horarios. ','Could not load the schedule. ')}<Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></p>;
 if(!draft||!saved)return null;
 const set=<K extends keyof NotifySchedule>(key:K,value:NotifySchedule[K])=>setDraft({...draft,[key]:value});
 const changed=JSON.stringify({...draft,outbox:[],simulated:undefined})!==JSON.stringify({...saved,outbox:[],simulated:undefined});
 const invalid=draft.quietEnabled&&draft.quietStart===draft.quietEnd;
 const days=en?['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']:['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
 const channelName:Record<NotifyChannel,string>={email:t('Correo','Email'),whatsapp:'WhatsApp',push:'Push'};
 const save=()=>post({actionId:crypto.randomUUID(),revision:saved.revision,quietEnabled:draft.quietEnabled,quietStart:draft.quietStart,quietEnd:draft.quietEnd,quietWeekends:draft.quietWeekends,digestFrequency:draft.digestFrequency,digestHour:draft.digestHour,digestWeekday:draft.digestWeekday},t('Horario guardado.','Schedule saved.'));
 return <section data-notification-schedule className="min-w-0 space-y-4 rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-5">
  <div><h2 className="text-lg font-bold">{t('Horario de silencio y resumen','Quiet hours and digest')}</h2>
   <p className="text-sm text-[#52627a]">{t('En silencio, los avisos por correo, WhatsApp y push esperan hasta que termine el horario; los avisos dentro de la app siempre aparecen. Por ahora ContrataCR no envía correos, WhatsApp ni push: el resumen se simula y queda registrado abajo.','During quiet hours, email, WhatsApp and push notices wait until the window ends; in-app notices always appear. For now ContrataCR does not send email, WhatsApp or push: the digest is simulated and recorded below.')}</p></div>
  <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input data-schedule-quiet type="checkbox" className="h-5 w-5" checked={draft.quietEnabled} onChange={e=>set('quietEnabled',e.target.checked)}/>{t('Activar horario de silencio (hora de Costa Rica)','Turn on quiet hours (Costa Rica time)')}</label>
  {draft.quietEnabled&&<div className="grid min-w-0 gap-3 sm:grid-cols-2">
   <label className="text-sm font-semibold">{t('Desde','From')}<select data-schedule-start className={control} value={draft.quietStart} onChange={e=>set('quietStart',e.target.value)}>{hours.map(h=><option key={h} value={h}>{h}</option>)}</select></label>
   <label className="text-sm font-semibold">{t('Hasta','Until')}<select data-schedule-end className={control} value={draft.quietEnd} onChange={e=>set('quietEnd',e.target.value)}>{hours.map(h=><option key={h} value={h}>{h}</option>)}</select></label>
   <label className="flex min-h-11 items-center gap-2 text-sm font-semibold sm:col-span-2"><input data-schedule-weekends type="checkbox" className="h-5 w-5" checked={draft.quietWeekends} onChange={e=>set('quietWeekends',e.target.checked)}/>{t('También en silencio todo el sábado y domingo','Also quiet all day Saturday and Sunday')}</label>
   {invalid&&<p role="alert" className="text-sm text-red-700 sm:col-span-2">{t('La hora de inicio y la de fin deben ser distintas.','The start and end times must differ.')}</p>}
  </div>}
  <div className="grid min-w-0 gap-3 sm:grid-cols-3">
   <label className="text-sm font-semibold">{t('Resumen de pendientes','Pending digest')}<select data-schedule-frequency className={control} value={draft.digestFrequency} onChange={e=>set('digestFrequency',e.target.value as NotifySchedule['digestFrequency'])}><option value="off">{t('No enviar','Off')}</option><option value="daily">{t('Diario','Daily')}</option><option value="weekly">{t('Semanal','Weekly')}</option></select></label>
   {draft.digestFrequency!=='off'&&<label className="text-sm font-semibold">{t('Hora','Hour')}<select data-schedule-hour className={control} value={draft.digestHour} onChange={e=>set('digestHour',Number(e.target.value))}>{hours.map((h,i)=><option key={h} value={i}>{h}</option>)}</select></label>}
   {draft.digestFrequency==='weekly'&&<label className="text-sm font-semibold">{t('Día','Day')}<select data-schedule-weekday className={control} value={draft.digestWeekday} onChange={e=>set('digestWeekday',Number(e.target.value))}>{days.map((d,i)=><option key={d} value={i+1}>{d}</option>)}</select></label>}
  </div>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-[#0f7a3d]">{notice}</p>}
  <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy||!changed} onClick={()=>setDraft(saved)}>{t('Descartar cambios','Discard changes')}</Button><Button type="button" data-schedule-save disabled={busy||!changed||invalid} onClick={()=>void save()}>{t('Guardar horario','Save schedule')}</Button></div>
  <div className="min-w-0 space-y-2 border-t border-[#eef2f6] pt-3"><h3 className="text-sm font-bold">{t('Probar el resumen (simulado)','Try the digest (simulated)')}</h3>
   <div className="flex flex-wrap gap-2">{(['email','whatsapp','push'] as const).map(channel=><Button key={channel} type="button" variant="secondary" data-schedule-simulate={channel} disabled={busy||changed} onClick={()=>void post({actionId:crypto.randomUUID(),channels:[channel]},t('Resumen simulado. No se envió nada.','Digest simulated. Nothing was sent.'))}>{channelName[channel]}</Button>)}</div>
   {changed&&<p className="text-xs text-[#52627a]">{t('Guarde el horario antes de probar.','Save the schedule before trying.')}</p>}
   {saved.outbox.length>0&&<ul data-schedule-outbox className="min-w-0 space-y-2">{saved.outbox.map(o=><li key={o.id} className="min-w-0 break-words rounded-xl border border-[#eef2f6] p-3 text-sm"><span className="font-semibold">{channelName[o.channel]}</span> · {t('Simulado','Simulated')} · {new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(o.at))}<span className="block text-[#52627a]">{o.unreadCount} {t('sin leer','unread')}</span></li>)}</ul>}
  </div>
 </section>;
}
