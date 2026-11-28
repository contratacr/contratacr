import {RESERVATION_STATUS_LABELS} from '@/lib/directory/place-features';
import type {MyReservationRow} from '@/lib/directory/my-reservations';

// The list of «Mis reservas» (no hooks): rendered by the /mis-reservas page (server) and the «Mi panel» section (client).
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
export function MyReservationsList({rows,failed,en}:{rows:MyReservationRow[]|null;failed:boolean;en:boolean}){
 const t=(es:string,english:string)=>en?english:es;
 const fmt=(d:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
 if(failed||!rows)return <p role="alert">{t('No se pudieron cargar sus reservas. Recargue la página.','Could not load your reservations. Please reload.')}</p>;
 if(rows.length===0)return <p className="rounded-2xl bg-slate-50 p-5" data-my-reservations-empty>{t('Todavía no tiene reservas.','You have no reservations yet.')}</p>;
 return <ul className="divide-y divide-[#d7e1ea] rounded-2xl border border-[#d7e1ea] bg-white">{rows.map(r=><li key={r.reference} data-my-reservation={r.reference} data-status={r.status} className="flex flex-wrap items-center justify-between gap-3 p-4">
  <div className="min-w-0"><p className="break-words font-semibold">{r.placeName}</p>
   <p className="text-sm text-slate-700">{r.kind==='booking'?`${fmt(r.day)} · ${r.time}`:t(`Lista de espera · ${fmt(r.day)}`,`Waitlist · ${fmt(r.day)}`)} · {r.partySize} {t('personas','people')} · {r.reference}</p>
   <p className="text-sm font-semibold">{RESERVATION_STATUS_LABELS[r.status][en?1:0]}{r.position?` · ${t('Puesto','Position')} ${r.position}`:''}</p></div>
  {r.href&&<a href={r.href} data-my-reservation-open className={`inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 font-semibold ${ring}`}>{r.canCancel?t('Ver o cancelar','View or cancel'):t('Ver','View')}</a>}
 </li>)}</ul>;
}
