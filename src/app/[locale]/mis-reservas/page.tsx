import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {notFound,redirect,RedirectType} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// LOCAL PRO ONLY (pending fixes round, 2026-11-17; development only like /negocios): «Mis reservas».
// Owner, 2026-11-27: signed in, «Mis reservas» is a section of «Mi panel» (?tab=mis_reservas, rows from
// /api/mis-reservas): this page redirects there (replace). Guests (no account) keep only their private link; here they are
// told so and offered to sign in, and come back to the panel section.
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 const {locale}=await params;return {title:(await getTranslations({locale,namespace:'directoryRoutes'}))('reservationsTitle'),robots:{index:false,follow:false},referrer:'no-referrer'};
}
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
export default async function MyReservationsRoute({params}:{params:Promise<{locale:string}>}){
 if(!DIR_ENABLED)notFound();
 const {locale}=await params,en=locale==='en',prefix=en?'/en':'',t=(es:string,english:string)=>en?english:es;
 const user=await safeGetUser(await createClient());
 if(user)redirect(`${prefix}/dashboard/profesional?tab=mis_reservas`,RedirectType.replace);
 return <DirectoryShell><main id="contenido" data-my-reservations className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-[#162543] sm:py-12">
  <header className="space-y-2"><h1 className="text-3xl font-extrabold">{t('Mis reservas','My reservations')}</h1>
   <p className="text-slate-700">{t('Reservas de mesa y listas de espera que pidió con su cuenta. Abra una para ver su estado o cancelarla.','Table reservations and waitlist entries you made with your account. Open one to see its status or cancel it.')}</p></header>
  <div data-my-reservations-guest className="space-y-3 rounded-2xl border border-[#d7e1ea] p-5">
   <p>{t('Si reservó sin cuenta, use el enlace privado que le mostramos al reservar y que le enviamos en el aviso.','If you booked without an account, use the private link we showed you when booking and sent you in the notice.')}</p>
   <a href={`${prefix}/login?redirect=${encodeURIComponent(prefix+'/mis-reservas')}`} className={`inline-flex min-h-11 items-center rounded-full bg-[#162543] px-5 font-semibold text-white ${ring}`}>{t('Iniciar sesión','Sign in')}</a></div>
 </main></DirectoryShell>;
}
