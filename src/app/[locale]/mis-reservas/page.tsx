import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {RESERVATION_STATUS_LABELS,type CustomerReservation} from '@/lib/directory/place-features';
import {reservationAccessToken,reservationLink} from '@/lib/directory/reservation-access';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// LOCAL PRO ONLY (pending fixes round, 2026-11-17; development only like /negocios): «Mis reservas» of the signed-in
// customer (dir_reservation_mine, latest 50). Each row links to its private page /reserva/<token>; the server derives
// the token from the reservation and the id never reaches the browser. Guests (no account) keep only their link; here
// they are told so and offered to sign in.
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 const {locale}=await params;return {title:(await getTranslations({locale,namespace:'directoryRoutes'}))('reservationsTitle'),robots:{index:false,follow:false},referrer:'no-referrer'};
}
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
export default async function MyReservationsRoute({params}:{params:Promise<{locale:string}>}){
 if(!DIR_ENABLED)notFound();
 const {locale}=await params,en=locale==='en',prefix=en?'/en':'',t=(es:string,english:string)=>en?english:es;
 const user=await safeGetUser(await createClient());
 let rows:(CustomerReservation&{href:string|null})[]|null=null,failed=false;
 if(user){
  const r=await createAdminClient().rpc('dir_reservation_mine',{p_actor:user.id});
  if(r.error)failed=true;
  else rows=await Promise.all(((r.data??[]) as (CustomerReservation&{id:string})[]).map(async({id,...x})=>{const tok=await reservationAccessToken(id);return {...x,href:tok?reservationLink(tok,locale):null};}));
 }
 const fmt=(d:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
 return <DirectoryShell><main id="contenido" data-my-reservations className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-[#162543] sm:py-12">
  <header className="space-y-2"><h1 className="text-3xl font-extrabold">{t('Mis reservas','My reservations')}</h1>
   <p className="text-slate-700">{t('Reservas de mesa y listas de espera que pidió con su cuenta. Abra una para ver su estado o cancelarla.','Table reservations and waitlist entries you made with your account. Open one to see its status or cancel it.')}</p></header>
  {!user?<div data-my-reservations-guest className="space-y-3 rounded-2xl border border-[#d7e1ea] p-5">
    <p>{t('Si reservó sin cuenta, use el enlace privado que le mostramos al reservar y que le enviamos en el aviso.','If you booked without an account, use the private link we showed you when booking and sent you in the notice.')}</p>
    <a href={`${prefix}/login?redirect=${encodeURIComponent(prefix+'/mis-reservas')}`} className={`inline-flex min-h-11 items-center rounded-full bg-[#162543] px-5 font-semibold text-white ${ring}`}>{t('Iniciar sesión','Sign in')}</a></div>
  :failed?<p role="alert">{t('No se pudieron cargar sus reservas. Recargue la página.','Could not load your reservations. Please reload.')}</p>
  :rows!.length===0?<p className="rounded-2xl bg-slate-50 p-5" data-my-reservations-empty>{t('Todavía no tiene reservas.','You have no reservations yet.')}</p>
  :<ul className="divide-y divide-[#d7e1ea] rounded-2xl border border-[#d7e1ea]">{rows!.map(r=><li key={r.reference} data-my-reservation={r.reference} data-status={r.status} className="flex flex-wrap items-center justify-between gap-3 p-4">
    <div className="min-w-0"><p className="break-words font-semibold">{r.placeName}</p>
     <p className="text-sm text-slate-700">{r.kind==='booking'?`${fmt(r.day)} · ${r.time}`:t(`Lista de espera · ${fmt(r.day)}`,`Waitlist · ${fmt(r.day)}`)} · {r.partySize} {t('personas','people')} · {r.reference}</p>
     <p className="text-sm font-semibold">{RESERVATION_STATUS_LABELS[r.status][en?1:0]}{r.position?` · ${t('Puesto','Position')} ${r.position}`:''}</p></div>
    {r.href&&<a href={r.href} data-my-reservation-open className={`inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 font-semibold ${ring}`}>{r.canCancel?t('Ver o cancelar','View or cancel'):t('Ver','View')}</a>}
   </li>)}</ul>}
 </main></DirectoryShell>;
}
