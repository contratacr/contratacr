import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {createAdminClient} from '@/lib/supabase/admin';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {ReservationStatus} from '@/components/directory/reservation-status';
import {reservationAccessHash} from '@/lib/directory/reservation-access';
import type {CustomerReservation} from '@/lib/directory/place-features';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// LOCAL PRO ONLY (pending fixes round, 2026-11-17; development only like /lugar): private link of a table reservation,
// /reserva/<token>. The token (no ids inside) is hashed (SHA-256) and looked up; unknown → 404. Shows status, waitlist
// position, timeline and «Cancelar» until the start time (POST /api/reservas/<token>). Not indexed; no referrer.
export const dynamic='force-dynamic';
async function load(token:string){
 const hash=reservationAccessHash(token);if(!hash)return null;
 const r=await createAdminClient().rpc('dir_reservation_by_access',{p_access_hash:hash});
 return r.error||!r.data?null:r.data as CustomerReservation;
}
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 const {locale}=await params;
 return {title:(await getTranslations({locale,namespace:'directoryRoutes'}))('reservationTitle'),robots:{index:false,follow:false},referrer:'no-referrer'};
}
export default async function ReservationRoute({params}:{params:Promise<{locale:string;token:string}>}){
 if(!DIR_ENABLED)notFound();
 const {locale,token}=await params,r=await load(token);if(!r)notFound();
 return <DirectoryShell><main id="contenido" data-reservation-page className="mx-auto max-w-2xl px-4 py-8 text-[#162543] sm:py-12">
  <ReservationStatus token={token} locale={locale} initial={r}/>
 </main></DirectoryShell>;
}
