import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {PlaceTools} from '@/components/pro/place-tools';
import {createAdminClient} from '@/lib/supabase/admin';
import {proPlaceHubState} from '@/lib/directory/pro-place-hub';
import {PlaceModuleNav} from '@/components/pro/place-module-nav';
import {proPageWorkspace} from '@/lib/pro/page-workspace';

// LOCAL PRO ONLY (place features round, development only): tools of a claimed place in the Pro dashboard — events
// (public /eventos, staff-moderated), the «Pedir» link-out (own WhatsApp / order page / phone) and, for an approved
// brand owner, the brand's common information. /api/pro/place-events and /api/pro/brand-info enforce access (SQL:
// active manager of the claimed place; company members need listing.publish to publish).
export const dynamic='force-dynamic';
export default async function PlaceToolsRoute({params}:{params:Promise<{locale:string}>}){
 if(process.env.NODE_ENV!=='development')notFound();
 const {locale}=await params,en=locale==='en',prefix=en?'/en':'';
 const user=await safeGetUser(await createClient());
 if(!user)redirect(prefix+'/login?redirect='+encodeURIComponent(prefix+'/dashboard/pro/lugar'));
 const db=createAdminClient(),ws=await proPageWorkspace(db,user.id),hub=await proPlaceHubState(db,ws.actor,ws.member);
 return <main id="contenido" data-place-tools-page className="mx-auto max-w-4xl space-y-4 px-4 py-6 text-[#162543] sm:py-10">
  <PlaceModuleNav locale={locale} current="place" hub={hub}/>
  <h1 className="text-2xl font-bold">{en?'My business in the directory':'Mi negocio en el directorio'}</h1>
  <p className="text-slate-700">{en?'Events, the «Order» button and brand information. Order and visibility never depend on payment.':'Eventos, botón «Pedir» e información de marca. El orden y la visibilidad nunca dependen de pagos.'}</p>
  <PlaceTools locale={locale} expectedActor={user.id}/>
 </main>;
}
