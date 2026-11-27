'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {featureReasonText,type ReservationConfig} from '@/lib/directory/place-features';

/**
 * LOCAL PRO ONLY (place features round, 2026-11-17): «Reservar mesa» on /negocios/<slug> of a claimed restaurant/café whose
 * owner turned reservations on. Date (within the owner's horizon) → available times (seats left, from the server) →
 * party size, name and a phone or e-mail. The same-day waitlist appears only when the owner opened it for today.
 * No deposits, cards or payments. The confirmation shows the reference; the business confirms or declines later and
 * the customer is told by e-mail/SMS (MOCK sender in this build: nothing is delivered for real).
 * Retries reuse the same actionId/reservationId, so a double tap never books twice.
 * Pending fixes round (2026-11-17): the confirmation shows the customer's private link (/reserva/<token>: status and
 * cancel). It is shown once here and sent in the mock notice; signed-in customers also find it in «Mis reservas».
 */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const button=`inline-flex min-h-11 items-center justify-center rounded-full bg-[#162543] px-5 font-semibold text-white disabled:opacity-60 ${ring}`;
const field='min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543]';
const noSubscribe=()=>()=>{};
type Done={kind:'booking'|'waitlist';reference:string;position:number|null;channel:string|null;link:string|null};
export function PlaceReservation({slug,locale,config}:{slug:string;locale:string;config:ReservationConfig}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 const [mode,setMode]=useState<'booking'|'waitlist'>('booking'),[day,setDay]=useState(''),[times,setTimes]=useState<{time:string;left:number}[]|null>(null);
 const [copied,setCopied]=useState(false),[nonce,setNonce]=useState(0),[time,setTime]=useState(''),[party,setParty]=useState(2),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[done,setDone]=useState<Done|null>(null);
 const ids=useRef<{actionId:string;reservationId:string;key:string}|null>(null),form=useRef<HTMLFormElement>(null);
 useEffect(()=>{
  if(!day){return;}
  let alive=true;
  fetch(`/api/lugar/${encodeURIComponent(slug)}/reservas?day=${day}`,{cache:'no-store'}).then(r=>r.json()).then(j=>{if(alive)setTimes(Array.isArray(j.times)?j.times:[]);}).catch(()=>{if(alive)setTimes([]);});
  return ()=>{alive=false;};
 },[day,slug,nonce]);
 const submit=async(e:React.FormEvent<HTMLFormElement>)=>{
  e.preventDefault();setError(null);
  const f=new FormData(e.currentTarget),name=String(f.get('name')??'').trim(),phone=String(f.get('phone')??'').trim(),email=String(f.get('email')??'').trim(),note=String(f.get('note')??'').trim();
  if(!phone&&!email){setError(featureReasonText('contact_required',en));return;}
  if(mode==='booking'&&(!day||!time)){setError(t('Elija la fecha y la hora.','Choose the date and time.'));return;}
  const body={kind:mode,partySize:party,name,...(phone?{phone}:{}),...(email?{email}:{}),...(mode==='booking'?{day,time,...(note?{note}:{})}:{})};
  const key=JSON.stringify(body);if(!ids.current||ids.current.key!==key)ids.current={actionId:crypto.randomUUID(),reservationId:crypto.randomUUID(),key};
  setBusy(true);
  try{
   const r=await fetch(`/api/lugar/${encodeURIComponent(slug)}/reservas`,{method:'POST',headers:{'content-type':'application/json','accept-language':en?'en':'es'},
    body:JSON.stringify({...body,actionId:ids.current.actionId,reservationId:ids.current.reservationId})});
   const j=await r.json().catch(()=>({})) as {reference?:string;position?:number|null;notice?:{channel?:string}|null;reason?:string;accessToken?:string};
   if(!r.ok){setError(featureReasonText(j.reason,en));if(r.status===409&&mode==='booking'){setTime('');setNonce(n=>n+1);}return;}
   setDone({kind:mode,reference:String(j.reference),position:j.position??null,channel:j.notice?.channel??null,
    link:typeof j.accessToken==='string'&&/^[A-Za-z0-9_-]{43}$/.test(j.accessToken)?`${en?'/en':''}/reserva/${j.accessToken}`:null});setCopied(false);ids.current=null;
  }catch{setError(featureReasonText('unavailable',en));}finally{setBusy(false);}
 };
 const fmtDay=(d:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
 return <section aria-labelledby="place-reservations" data-place-reservations data-ready={ready||undefined} className="space-y-4 rounded-2xl border border-[#d7e1ea] p-5 text-[#162543]">
  <h2 id="place-reservations" className="text-lg font-bold">{t('Reservar mesa','Book a table')}</h2>
  {done?<div role="status" data-reservation-done={done.kind} className="space-y-2 rounded-xl bg-emerald-50 p-4 text-emerald-950">
   <p className="font-semibold">{done.kind==='booking'?t('Solicitud enviada. La empresa la confirmará.','Request sent. The business will confirm it.'):t('Está en la lista de espera de hoy.','You are on today’s waitlist.')}</p>
   <p>{t('Referencia','Reference')}: <strong data-reservation-reference>{done.reference}</strong>{done.position?` · ${t('Puesto','Position')} ${done.position}`:''}</p>
   <p className="text-sm">{done.kind==='booking'?t('Le avisaremos cuando la empresa confirme o rechace la reserva.','We will let you know when the business confirms or declines the reservation.')
    :t('Le avisaremos cuando su mesa esté lista.','We will let you know when your table is ready.')}</p>
   {done.link&&<div data-reservation-link className="space-y-2 rounded-lg border border-emerald-200 bg-white p-3 text-[#162543]">
    <p className="text-sm font-semibold">{t('Su enlace privado para ver el estado o cancelar:','Your private link to check the status or cancel:')}</p>
    <a data-reservation-link-href href={done.link} className={`block break-all text-sm font-semibold text-[#0b4f6c] underline underline-offset-2 ${ring}`}>{t('Ver mi reserva','View my reservation')}</a>
    <div className="flex flex-wrap items-center gap-2">
     <button type="button" data-reservation-link-copy className={`min-h-11 rounded-full border border-slate-300 px-4 text-sm font-semibold ${ring}`}
      onClick={()=>{void navigator.clipboard?.writeText(new URL(done.link!,location.origin).toString()).then(()=>setCopied(true),()=>setCopied(false));}}>{copied?t('Enlace copiado','Link copied'):t('Copiar enlace','Copy link')}</button>
    </div>
    <p className="text-xs text-slate-700">{t('Guárdelo: solo se muestra esta vez y también se lo enviamos en el aviso. Quien tenga el enlace puede ver y cancelar esta reserva.','Keep it: it is only shown now and we also sent it in the notice. Anyone with the link can view and cancel this reservation.')}</p>
   </div>}
   <p className="text-sm"><a href={`${en?'/en':''}/mis-reservas`} className={`font-semibold underline underline-offset-2 ${ring}`}>{t('Mis reservas (con cuenta)','My reservations (signed in)')}</a></p>
   <button type="button" className={`underline underline-offset-2 ${ring}`} onClick={()=>{setDone(null);form.current?.reset();}}>{t('Hacer otra solicitud','Make another request')}</button>
  </div>:<>
   {config.waitlistOpen&&<div role="radiogroup" aria-label={t('Tipo de solicitud','Request type')} className="flex flex-wrap gap-2">
    {(['booking','waitlist'] as const).map(m=><button key={m} type="button" role="radio" aria-checked={mode===m} data-reservation-mode={m} onClick={()=>{setMode(m);setError(null);}}
     className={`min-h-11 rounded-full border px-4 font-semibold ${mode===m?'border-[#162543] bg-[#162543] text-white':'border-slate-300 bg-white'} ${ring}`}>
     {m==='booking'?t('Reservar para otro momento','Reserve for later'):t('Lista de espera de hoy','Today’s waitlist')}</button>)}
   </div>}
   <form ref={form} onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
    {mode==='booking'&&<>
     <label className="space-y-1 text-sm font-semibold">{t('Fecha','Date')}
      <input data-reservation-day type="date" className={field} min={config.today} max={config.lastDay} value={day} onChange={e=>{setDay(e.target.value);setTime('');setTimes(null);}} required/></label>
     <label className="space-y-1 text-sm font-semibold">{t('Personas','Party size')}
      <select data-reservation-party className={field} value={party} onChange={e=>setParty(Number(e.target.value))}>{Array.from({length:config.partyMax},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</select></label>
     <fieldset className="space-y-2 sm:col-span-2"><legend className="text-sm font-semibold">{t('Hora','Time')}{day?` · ${fmtDay(day)}`:''}</legend>
      {!day?<p className="text-sm text-slate-700">{t('Elija una fecha para ver los horarios.','Choose a date to see the times.')}</p>
       :times===null?<p className="text-sm text-slate-700" role="status">{t('Buscando horarios…','Looking for times…')}</p>
       :times.length===0?<p className="text-sm text-slate-700" data-reservation-no-times>{t('No hay horarios ese día. Pruebe otra fecha.','No times that day. Try another date.')}</p>
       :<div className="flex flex-wrap gap-2">{times.map(s=>{const full=s.left<party;return <label key={s.time} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 ${time===s.time?'border-[#162543] bg-[#eaf6fb]':'border-slate-300'} ${full?'opacity-50':''}`}>
        <input type="radio" name="time" value={s.time} data-reservation-time={s.time} disabled={full} checked={time===s.time} onChange={()=>setTime(s.time)} className="h-4 w-4"/>{s.time}
        <span className="text-xs text-slate-700">{full?t('lleno','full'):`${s.left} ${t('cupos','seats')}`}</span></label>;})}</div>}
     </fieldset>
    </>}
    {mode==='waitlist'&&<label className="space-y-1 text-sm font-semibold sm:col-span-2">{t('Personas','Party size')}
     <select data-reservation-party className={field} value={party} onChange={e=>setParty(Number(e.target.value))}>{Array.from({length:config.partyMax},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</select></label>}
    <label className="space-y-1 text-sm font-semibold">{t('Nombre','Name')}<input data-reservation-name name="name" className={field} autoComplete="name" required minLength={2} maxLength={80}/></label>
    <label className="space-y-1 text-sm font-semibold">{t('Teléfono','Phone')}<input data-reservation-phone name="phone" type="tel" inputMode="tel" className={field} autoComplete="tel" maxLength={23}/></label>
    <label className="space-y-1 text-sm font-semibold sm:col-span-2">{t('Correo (opcional si dio teléfono)','E-mail (optional if you gave a phone)')}<input data-reservation-email name="email" type="email" className={field} autoComplete="email" maxLength={254}/></label>
    {mode==='booking'&&<label className="space-y-1 text-sm font-semibold sm:col-span-2">{t('Nota para la empresa (opcional)','Note for the business (optional)')}<input name="note" className={field} maxLength={300}/></label>}
    {error&&<p role="alert" data-reservation-error className="text-sm font-semibold text-red-800 sm:col-span-2">{error}</p>}
    <div className="sm:col-span-2"><button data-reservation-submit type="submit" className={button} disabled={busy||!ready}>{busy?t('Enviando…','Sending…'):mode==='booking'?t('Pedir reserva','Request a reservation'):t('Unirme a la lista','Join the waitlist')}</button></div>
   </form>
   <p className="text-xs text-slate-700">{t('Sin depósitos ni pagos: la reserva la confirma la empresa. Sus datos solo se comparten con esta empresa.','No deposits or payments: the business confirms the booking. Your details are only shared with this business.')}</p>
  </>}
 </section>;
}
