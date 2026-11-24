'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {featureReasonText,RESERVATION_STATUS_LABELS,type OwnerReservation,type OwnerReservationDay,type ReservationSettings} from '@/lib/directory/place-features';
import {ClaimPlaceNextStep,EditionNextStep} from '@/components/pro/place-next-step';

/**
 * LOCAL PRO ONLY (place features round, 2026-11-17): «Reservas de mesa» in the Pro dashboard (/dashboard/pro/reservas-mesa).
 * Day view of a claimed restaurant/café: requests to confirm/decline, confirmed tables (seated / no-show / cancel) and the
 * same-day waitlist («Avisar: mesa lista», seated, left). Settings: opt-in switch, waitlist, party max, horizon, minimum
 * notice and weekly slots with capacity. Everything goes through /api/pro/table-reservations (team gate: members manage
 * bookings, read_only only reads; CAS → 409 reloads; actionId kept per action until the server answers). Customer
 * notices go to the MOCK sender only (shown as «aviso simulado»). No deposits or payments.
 */
type Place={id:string;slug:string;name:string;vertical:string};
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const btn=`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-60 ${ring}`;
const field='min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543]';
const WEEKDAYS:[string,string][]=[['Dom','Sun'],['Lun','Mon'],['Mar','Tue'],['Mié','Wed'],['Jue','Thu'],['Vie','Fri'],['Sáb','Sat']];
const ACTION_LABEL:Record<string,[string,string]>={confirm:['Confirmar','Confirm'],decline:['Rechazar','Decline'],cancel:['Cancelar','Cancel'],seated:['Atendida','Seated'],no_show:['No llegó','No-show'],
 notify_ready:['Avisar: mesa lista','Notify: table ready'],left:['Se retiró','Left']};
const NEXT:Record<string,string[]>={pending:['confirm','decline'],confirmed:['seated','no_show','cancel'],waiting:['notify_ready','seated','left'],notified:['seated','left','notify_ready']};
const addDays=(d:string,n:number)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
// endpoint (2026-11-18): «Mi negocio» without Pro uses /api/negocio/reservas (no edition link in the empty state).
export function TableReservations({locale,expectedActor,endpoint='/api/pro/table-reservations'}:{locale:string;expectedActor:string;endpoint?:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,pick=(p:[string,string])=>p[en?1:0];
 const [places,setPlaces]=useState<Place[]|null>(null),[placeId,setPlaceId]=useState(''),[day,setDay]=useState(''),[data,setData]=useState<OwnerReservationDay|null>(null);
 const [off,setOff]=useState<string|null>(null),[msg,setMsg]=useState<{ok:boolean;text:string}|null>(null),[busy,setBusy]=useState<string|null>(null),[nonce,setNonce]=useState(0);
 const actions=useRef(new Map<string,{id:string;body:string}>());
 const headers=useCallback((json=false)=>({...(json?{'content-type':'application/json'}:{}),'accept-language':en?'en':'es','x-pro-expected-actor':expectedActor}),[en,expectedActor]);
 useEffect(()=>{let alive=true;
  fetch(endpoint,{cache:'no-store',headers:headers()}).then(r=>r.json().then(j=>({ok:r.ok,j}))).then(({ok,j})=>{if(!alive)return;
   if(!ok){setOff(String(j.reason??j.code??'unavailable'));setPlaces([]);return;}
   const list=(j.places??[]) as Place[];setPlaces(list);if(list[0])setPlaceId(p=>p||list[0]!.id);}).catch(()=>{if(alive){setOff('unavailable');setPlaces([]);}});
  return ()=>{alive=false;};},[headers,endpoint]);
 useEffect(()=>{if(!placeId)return;let alive=true;
  fetch(`${endpoint}?placeId=${placeId}${day?`&day=${day}`:''}`,{cache:'no-store',headers:headers()}).then(r=>r.json().then(j=>({ok:r.ok,j}))).then(({ok,j})=>{if(!alive)return;
   if(ok){setData(j as OwnerReservationDay);if(!day)setDay((j as OwnerReservationDay).day);}else setMsg({ok:false,text:featureReasonText(j.reason,en)});}).catch(()=>{if(alive)setMsg({ok:false,text:featureReasonText('unavailable',en)});});
  return ()=>{alive=false;};},[placeId,day,nonce,headers,en,endpoint]);
 const post=async(key:string,body:Record<string,unknown>)=>{
  const k=JSON.stringify(body);let a=actions.current.get(key);if(!a||a.body!==k){a={id:crypto.randomUUID(),body:k};actions.current.set(key,a);}
  setBusy(key);setMsg(null);
  try{
   const input={...(body.input as Record<string,unknown>),actionId:a.id};
   const r=await fetch(endpoint,{method:'POST',headers:headers(true),body:JSON.stringify({...body,input})});
   const j=await r.json().catch(()=>({})) as {reason?:string;code?:string;notice?:{kind:string;channel:string}|null};
   actions.current.delete(key);setNonce(n=>n+1);
   if(!r.ok){setMsg({ok:false,text:featureReasonText(r.status===409&&!j.reason?'reload':j.reason??j.code,en)});return false;}
   setMsg({ok:true,text:j.notice?t(`Guardado. Aviso simulado al cliente por ${j.notice.channel==='email'?'correo':'SMS'} (no se envía nada real en esta versión).`,`Saved. Simulated notice to the customer by ${j.notice.channel==='email'?'e-mail':'SMS'} (nothing real is sent in this build).`):t('Guardado.','Saved.')});
   return true;
  }catch{setMsg({ok:false,text:featureReasonText('unavailable',en)});return false;}finally{setBusy(null);}
 };
 if(places===null)return <p role="status">{t('Cargando…','Loading…')}</p>;
 if(off)return off==='module_unavailable'||off==='module_disabled'
  ?<div data-table-res-off><EditionNextStep locale={locale} feature={{es:'las reservas de mesa',en:'table reservations'}} text={{es:'Las reservas de mesa están en la edición "Restaurantes" de ContrataCR Pro.',en:'Table reservations belong to the "Restaurants" edition of ContrataCR Pro.'}}/></div>
  :<p data-table-res-off className="rounded-2xl bg-slate-50 p-5">{featureReasonText(off,en)}</p>;
 if(!places.length)return <div data-table-res-no-place><ClaimPlaceNextStep locale={locale} sections={['restaurantes','cafes']} edition={endpoint==='/api/pro/table-reservations'?'restaurantes':undefined} intro={{es:'Primero reclame su restaurante o café. Luego podrá recibir reservas aquí.',en:'First claim your restaurant or café. Then you can take reservations here.'}}/></div>;
 const bookings=(data?.items??[]).filter(i=>i.kind==='booking'),waitlist=(data?.items??[]).filter(i=>i.kind==='waitlist');
 const row=(r:OwnerReservation)=><li key={r.id} data-table-res={r.reference} data-status={r.status} className="flex flex-wrap items-start justify-between gap-3 p-4">
  <div className="min-w-0 space-y-1">
   <p className="font-semibold">{r.time?`${r.time} · `:''}{r.name} · {r.partySize} {t(r.partySize===1?'persona':'personas',r.partySize===1?'person':'people')}</p>
   <p className="text-sm text-slate-700">{[r.phone,r.email].filter(Boolean).join(' · ')} · {t('Ref.','Ref.')} {r.reference}</p>
   {r.note&&<p className="text-sm">&quot;{r.note}&quot;</p>}
   <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">{pick(RESERVATION_STATUS_LABELS[r.status])}</span>
  </div>
  <div className="flex flex-wrap gap-2">{(NEXT[r.status]??[]).map(a=><button key={a} type="button" data-table-res-action={a} disabled={busy!==null}
   className={`${btn} ${a==='confirm'||a==='notify_ready'?'bg-[#162543] text-white':'border border-slate-300 bg-white'}`}
   onClick={()=>post(`decide:${r.id}:${a}`,{op:'decide',input:{reservationId:r.id,revision:r.revision,action:a}})}>{pick(ACTION_LABEL[a]!)}</button>)}</div>
 </li>;
 return <div className="space-y-6" data-table-reservations={placeId}>
  <div className="flex flex-wrap items-end gap-3">
   {places.length>1&&<label className="space-y-1 text-sm font-semibold">{t('Negocio','Business')}
    <select className={field} value={placeId} onChange={e=>{setPlaceId(e.target.value);setData(null);}}>{places.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
   <div className="flex flex-wrap items-end gap-2">
    <button type="button" className={`${btn} border border-slate-300`} onClick={()=>day&&setDay(addDays(day,-1))} aria-label={t('Día anterior','Previous day')}>‹</button>
    <label className="space-y-1 text-sm font-semibold">{t('Día','Day')}<input type="date" data-table-res-day className={field} value={day} onChange={e=>e.target.value&&setDay(e.target.value)}/></label>
    <button type="button" className={`${btn} border border-slate-300`} onClick={()=>day&&setDay(addDays(day,1))} aria-label={t('Día siguiente','Next day')}>›</button>
    {data&&day!==data.today&&<button type="button" className={`${btn} border border-slate-300`} onClick={()=>setDay(data.today)}>{t('Hoy','Today')}</button>}
   </div>
  </div>
  {msg&&<p role={msg.ok?'status':'alert'} data-table-res-msg={msg.ok?'ok':'error'} className={`text-sm font-semibold ${msg.ok?'text-emerald-800':'text-red-800'}`}>{msg.text}</p>}
  {data&&<>
   {!data.settings.enabled&&<p data-table-res-disabled className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">{t('Las reservas en línea están apagadas: su ficha pública no muestra el formulario. Actívelas en "Configuración".','Online reservations are off: your public page does not show the form. Turn them on in "Settings".')}</p>}
   {data.pendingUpcoming>0&&<p className="font-semibold" data-table-res-pending={data.pendingUpcoming}>{data.pendingUpcoming} {t(data.pendingUpcoming===1?'solicitud por confirmar en los próximos días.':'solicitudes por confirmar en los próximos días.',data.pendingUpcoming===1?'request to confirm in the coming days.':'requests to confirm in the coming days.')}</p>}
   <section aria-labelledby="res-bookings" className="space-y-2"><h2 id="res-bookings" className="text-lg font-bold">{t('Reservas del día','Bookings for the day')}</h2>
    {bookings.length?<ul className="divide-y divide-[#d7e1ea] rounded-2xl border border-[#d7e1ea]">{bookings.map(row)}</ul>:<p className="text-slate-700">{t('No hay reservas este día.','No bookings this day.')}</p>}</section>
   {(data.settings.waitlistEnabled||waitlist.length>0)&&<section aria-labelledby="res-waitlist" className="space-y-2"><h2 id="res-waitlist" className="text-lg font-bold">{t('Lista de espera','Waitlist')}</h2>
    {waitlist.length?<ul className="divide-y divide-[#d7e1ea] rounded-2xl border border-[#d7e1ea]">{waitlist.map(row)}</ul>:<p className="text-slate-700">{t('Nadie en espera.','Nobody waiting.')}</p>}</section>}
   <SettingsForm key={`${data.placeId}:${data.settings.revision}`} settings={data.settings} en={en} busy={busy!==null}
    onSave={s=>post('settings:'+data.placeId,{op:'settings',input:{placeId:data.placeId,revision:data.settings.revision,...s}})}/>
   <p className="text-sm text-slate-700">{t('Sin depósitos ni pagos. Los avisos al cliente se simulan en esta versión local (no se envían correos ni SMS reales).','No deposits or payments. Customer notices are simulated in this local build (no real e-mail or SMS is sent).')}</p>
  </>}
 </div>;
}
function SettingsForm({settings,en,busy,onSave}:{settings:ReservationSettings;en:boolean;busy:boolean;onSave:(s:Omit<ReservationSettings,'revision'>)=>void}){
 const t=(es:string,english:string)=>en?english:es;
 const days0=[...new Set(settings.slots.map(s=>s.weekday))],times0=[...new Set(settings.slots.map(s=>s.time))].sort(),cap0=settings.slots[0]?.capacity??20;
 const [enabled,setEnabled]=useState(settings.enabled),[waitlist,setWaitlist]=useState(settings.waitlistEnabled),[partyMax,setPartyMax]=useState(settings.partyMax);
 const [horizon,setHorizon]=useState(settings.horizonDays),[notice,setNotice]=useState(settings.minNoticeMinutes),[days,setDays]=useState<number[]>(days0.length?days0:[2,3,4,5,6]);
 const [times,setTimes]=useState(times0.length?times0.join(', '):'12:00, 13:00, 19:00, 20:00'),[capacity,setCapacity]=useState(cap0),[err,setErr]=useState<string|null>(null);
 return <details className="rounded-2xl border border-[#d7e1ea] p-4" data-table-res-settings open={!settings.enabled}>
  <summary className="cursor-pointer text-lg font-bold">{t('Configuración','Settings')}</summary>
  <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();setErr(null);
    const list=times.split(/[,\s]+/).map(x=>x.trim()).filter(Boolean);
    if(list.some(x=>!/^([01]\d|2[0-3]):(00|15|30|45)$/.test(x))){setErr(t('Use horas como 12:00 o 19:30 (cada 15 minutos).','Use times like 12:00 or 19:30 (every 15 minutes).'));return;}
    const slots=days.flatMap(weekday=>[...new Set(list)].map(time=>({weekday,time,capacity})));
    if(enabled&&!slots.length){setErr(t('Agregue al menos un día y una hora.','Add at least one day and one time.'));return;}
    onSave({enabled,waitlistEnabled:waitlist,partyMax,horizonDays:horizon,minNoticeMinutes:notice,slots});}}>
   <label className="flex min-h-11 items-center gap-3 sm:col-span-2"><input type="checkbox" data-table-res-enabled className="h-5 w-5" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>{t('Recibir reservas en línea en mi ficha','Take online reservations on my page')}</label>
   <label className="flex min-h-11 items-center gap-3 sm:col-span-2"><input type="checkbox" data-table-res-waitlist className="h-5 w-5" checked={waitlist} onChange={e=>setWaitlist(e.target.checked)}/>{t('Abrir lista de espera del mismo día','Open a same-day waitlist')}</label>
   <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold">{t('Días','Days')}</legend><div className="flex flex-wrap gap-2">
    {WEEKDAYS.map((d,i)=><label key={i} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 px-3"><input type="checkbox" className="h-4 w-4" checked={days.includes(i)} onChange={e=>setDays(x=>e.target.checked?[...x,i]:x.filter(y=>y!==i))}/>{d[en?1:0]}</label>)}</div></fieldset>
   <label className="space-y-1 text-sm font-semibold sm:col-span-2">{t('Horas de inicio (separadas por coma)','Start times (comma separated)')}<input data-table-res-times className={field} value={times} onChange={e=>setTimes(e.target.value)}/></label>
   <label className="space-y-1 text-sm font-semibold">{t('Personas por horario','People per time slot')}<input type="number" min={1} max={500} className={field} value={capacity} onChange={e=>setCapacity(Number(e.target.value)||1)}/></label>
   <label className="space-y-1 text-sm font-semibold">{t('Máximo de personas por reserva','Max party size')}<input type="number" min={1} max={30} className={field} value={partyMax} onChange={e=>setPartyMax(Number(e.target.value)||1)}/></label>
   <label className="space-y-1 text-sm font-semibold">{t('Días hacia adelante','Days ahead')}<input type="number" min={1} max={90} className={field} value={horizon} onChange={e=>setHorizon(Number(e.target.value)||1)}/></label>
   <label className="space-y-1 text-sm font-semibold">{t('Anticipación mínima (minutos)','Minimum notice (minutes)')}<input type="number" min={0} max={2880} step={15} className={field} value={notice} onChange={e=>setNotice(Number(e.target.value)||0)}/></label>
   {err&&<p role="alert" className="text-sm font-semibold text-red-800 sm:col-span-2">{err}</p>}
   <div className="sm:col-span-2"><button type="submit" data-table-res-save disabled={busy} className={`${btn} bg-[#162543] text-white`}>{t('Guardar configuración','Save settings')}</button></div>
  </form></details>;
}
