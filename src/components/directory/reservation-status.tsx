'use client';
import {useRef,useState,useSyncExternalStore} from 'react';
import {featureReasonText,type CustomerReservation} from '@/lib/directory/place-features';

/**
 * LOCAL PRO ONLY (pending fixes round, 2026-11-17): the customer's view of one table reservation or waitlist entry,
 * reached only through the private link /reserva/<token>. Shows the status (pending, confirmed, declined, cancelled,
 * seated, no-show; waitlist position or «table ready»), the timeline and — until the start time — «Cancelar».
 * Cancel asks for confirmation first, retries reuse the same actionId (idempotent) and a stale revision (the business
 * changed it meanwhile) answers 409 with a reload hint. The business is told by the MOCK sender only.
 * Timeline times are formatted after hydration only (server and Safari ICU format «Nov 17, 2026, 3:13 PM» differently).
 */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const noSubscribe=()=>()=>{};
const STATUS:Record<CustomerReservation['status'],[string,string,string]>={
 pending:['Por confirmar','Awaiting confirmation','bg-amber-50 text-amber-950 border-amber-200'],
 confirmed:['Confirmada','Confirmed','bg-emerald-50 text-emerald-950 border-emerald-200'],
 declined:['Rechazada por el negocio','Declined by the business','bg-red-50 text-red-950 border-red-200'],
 cancelled:['Cancelada','Cancelled','bg-slate-100 text-slate-900 border-slate-300'],
 seated:['Atendida','Seated','bg-emerald-50 text-emerald-950 border-emerald-200'],
 no_show:['No se presentó','No-show','bg-slate-100 text-slate-900 border-slate-300'],
 waiting:['En lista de espera','On the waitlist','bg-sky-50 text-sky-950 border-sky-200'],
 notified:['¡Su mesa está lista!','Your table is ready!','bg-emerald-50 text-emerald-950 border-emerald-200'],
 left:['Salió de la lista','Left the waitlist','bg-slate-100 text-slate-900 border-slate-300'],
};
const ACTION:Record<string,[string,string]>={request:['Solicitud enviada','Request sent'],join:['Se unió a la lista de espera','Joined the waitlist'],
 confirm:['El negocio confirmó','The business confirmed'],decline:['El negocio rechazó','The business declined'],cancel:['El negocio canceló','The business cancelled'],
 seated:['Atendida','Seated'],no_show:['Marcada como no presentada','Marked as no-show'],notify_ready:['Aviso: mesa lista','Notice: table ready'],
 left:['Retirada de la lista','Removed from the list'],customer_cancel:['Usted canceló','You cancelled']};
export function ReservationStatus({token,locale,initial}:{token:string;locale:string;initial:CustomerReservation}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 const [r,setR]=useState(initial),[asking,setAsking]=useState(false),[busy,setBusy]=useState(false),[msg,setMsg]=useState<{ok:boolean;text:string}|null>(null);
 const action=useRef<{id:string;revision:number}|null>(null);
 const dayText=new Intl.DateTimeFormat(en?'en-US':'es-CR',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(r.day+'T12:00:00Z'));
 const at=(iso:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(iso));
 const [label,labelEn,tone]=STATUS[r.status];
 const cancel=async()=>{
  setBusy(true);setMsg(null);
  if(!action.current||action.current.revision!==r.revision)action.current={id:crypto.randomUUID(),revision:r.revision};
  try{
   const res=await fetch(`/api/reservas/${token}`,{method:'POST',headers:{'content-type':'application/json','accept-language':en?'en':'es'},
    body:JSON.stringify({actionId:action.current.id,revision:action.current.revision})});
   const j=await res.json().catch(()=>({})) as CustomerReservation&{reason?:string};
   if(!res.ok){setMsg({ok:false,text:featureReasonText(j.reason,en)});return;}
   setR(j);setAsking(false);action.current=null;
   // Public copy is neutral; the «simulated notice» hint exists only in local development builds.
   setMsg({ok:true,text:process.env.NODE_ENV==='development'?t('Listo. Avisamos al negocio (aviso simulado en esta versión local).','Done. We let the business know (simulated notice in this local build).'):t('Listo. Avisamos al negocio.','Done. We let the business know.')});
  }catch{setMsg({ok:false,text:featureReasonText('unavailable',en)});}finally{setBusy(false);}
 };
 return <section data-reservation-status={r.status} data-ready={ready||undefined} aria-labelledby="reservation-title" className="space-y-5">
  <header className="space-y-2">
   <p className="text-sm font-semibold text-[#0b4f6c]">{r.kind==='booking'?t('Reserva de mesa','Table reservation'):t('Lista de espera de hoy','Today’s waitlist')}</p>
   <h1 id="reservation-title" className="break-words text-3xl font-extrabold">{r.placeName}</h1>
   <p className={`inline-flex rounded-full border px-3 py-1 text-sm font-bold ${tone}`} role="status" data-reservation-status-label>{en?labelEn:label}</p>
  </header>
  <dl className="grid gap-3 rounded-2xl border border-[#d7e1ea] p-5 sm:grid-cols-2">
   <div><dt className="text-sm text-slate-700">{t('Referencia','Reference')}</dt><dd className="text-lg font-bold" data-reservation-status-ref>{r.reference}</dd></div>
   <div><dt className="text-sm text-slate-700">{t('A nombre de','Name')}</dt><dd className="font-semibold break-words">{r.name}</dd></div>
   <div><dt className="text-sm text-slate-700">{t('Fecha','Date')}</dt><dd className="font-semibold">{dayText}{r.time?` · ${r.time}`:''}</dd></div>
   <div><dt className="text-sm text-slate-700">{t('Personas','Party size')}</dt><dd className="font-semibold">{r.partySize}</dd></div>
   {r.kind==='waitlist'&&r.status==='waiting'&&r.position!=null&&<div className="sm:col-span-2"><dt className="text-sm text-slate-700">{t('Su puesto en la lista','Your place in line')}</dt>
    <dd className="text-2xl font-extrabold" data-reservation-position>{r.position}</dd></div>}
  </dl>
  {r.status==='pending'&&<p className="text-slate-800">{t('El negocio todavía no ha confirmado. Le avisaremos cuando lo haga.','The business has not confirmed yet. We will let you know when it does.')}</p>}
  {r.status==='notified'&&<p className="font-semibold text-emerald-900">{t('Por favor acérquese a la entrada del negocio.','Please come to the entrance of the business.')}</p>}
  {msg&&<p role={msg.ok?'status':'alert'} data-reservation-cancel-msg={msg.ok?'ok':'error'} className={`rounded-xl p-3 text-sm font-semibold ${msg.ok?'bg-emerald-50 text-emerald-950':'bg-red-50 text-red-900'}`}>{msg.text}</p>}
  {r.canCancel&&<div className="space-y-3 rounded-2xl border border-[#d7e1ea] p-5">
   {!asking?<button type="button" data-reservation-cancel disabled={!ready} onClick={()=>{setAsking(true);setMsg(null);}}
    className={`inline-flex min-h-11 items-center rounded-full border border-red-300 px-5 font-semibold text-red-900 disabled:opacity-60 ${ring}`}>
    {r.kind==='booking'?t('Cancelar reserva','Cancel reservation'):t('Salir de la lista','Leave the waitlist')}</button>
   :<div className="space-y-3" role="group" aria-label={t('Confirmar cancelación','Confirm cancellation')}>
    <p className="font-semibold">{r.kind==='booking'?t('¿Seguro que desea cancelar esta reserva?','Are you sure you want to cancel this reservation?'):t('¿Seguro que desea salir de la lista de espera?','Are you sure you want to leave the waitlist?')}</p>
    <div className="flex flex-wrap gap-2">
     <button type="button" data-reservation-cancel-confirm disabled={busy} onClick={()=>void cancel()} className={`inline-flex min-h-11 items-center rounded-full bg-red-800 px-5 font-semibold text-white disabled:opacity-60 ${ring}`}>
      {busy?t('Cancelando…','Cancelling…'):t('Sí, cancelar','Yes, cancel')}</button>
     <button type="button" disabled={busy} onClick={()=>setAsking(false)} className={`inline-flex min-h-11 items-center rounded-full border border-slate-300 px-5 font-semibold ${ring}`}>{t('No, mantener','No, keep it')}</button>
    </div></div>}
   <p className="text-xs text-slate-700">{r.kind==='booking'?t('Puede cancelar hasta la hora de la reserva. Después, llame al negocio.','You can cancel until the reservation time. After that, please call the business.')
    :t('Puede salir de la lista hoy mismo, mientras espera.','You can leave the list today, while you wait.')}</p>
  </div>}
  <section aria-labelledby="reservation-history" className="space-y-2">
   <h2 id="reservation-history" className="text-lg font-bold">{t('Historial','History')}</h2>
   <ol className="space-y-1 text-sm" data-reservation-timeline>{r.timeline.map((e,i)=><li key={i} className="flex flex-wrap gap-x-2"><span className="font-semibold">{(ACTION[e.action]??[e.action,e.action])[en?1:0]}</span><time dateTime={e.at} className="text-slate-700">{ready?at(e.at):''}</time></li>)}</ol>
  </section>
  <p className="text-sm"><a href={`${prefix}/lugar/${r.placeSlug}`} className={`font-semibold underline underline-offset-2 ${ring}`}>{t('Ver el lugar','View the place')}</a>
   {' · '}<a href={`${prefix}/mis-reservas`} className={`font-semibold underline underline-offset-2 ${ring}`}>{t('Mis reservas','My reservations')}</a></p>
  <p className="text-xs text-slate-700">{t('Este enlace es privado: quien lo tenga puede ver y cancelar esta reserva. No lo comparta.','This link is private: anyone who has it can view and cancel this reservation. Do not share it.')}</p>
 </section>;
}
