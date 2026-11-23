import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {TableReservations} from '@/components/pro/table-reservations';
import {createAdminClient} from '@/lib/supabase/admin';
import {proPlaceHubState} from '@/lib/directory/pro-place-hub';
import {PlaceModuleNav} from '@/components/pro/place-module-nav';
import {proPageWorkspace} from '@/lib/pro/page-workspace';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// LOCAL PRO ONLY (place features round, development only): owner bookings screen of a claimed restaurant/café.
// Module 'table_reservations' (edition restaurantes) and team roles are enforced by /api/pro/table-reservations (workspace
// gate + SQL): a company member working in the owner's company manages bookings; read_only only reads.
export const dynamic='force-dynamic';
export default async function TableReservationsRoute({params}:{params:Promise<{locale:string}>}){
 if(!PRO_ENABLED)notFound();
 const {locale}=await params,en=locale==='en',prefix=en?'/en':'';
 const user=await safeGetUser(await createClient());
 if(!user)redirect(prefix+'/login?redirect='+encodeURIComponent(prefix+'/dashboard/pro/reservas-mesa'));
 const db=createAdminClient(),ws=await proPageWorkspace(db,user.id),hub=await proPlaceHubState(db,ws.actor,ws.member);
 return <main id="contenido" data-table-res-page className="mx-auto max-w-4xl space-y-4 px-4 py-6 text-[#162543] sm:py-10">
  <PlaceModuleNav locale={locale} current="table_reservations" hub={hub}/>
  <h1 className="text-2xl font-bold">{en?'Table reservations':'Reservas de mesa'}</h1>
  <p className="text-slate-700">{en?'Confirm or decline requests, manage today’s waitlist and choose your times. Your public page shows the form only while reservations are on.':'Confirme o rechace solicitudes, maneje la lista de espera de hoy y elija sus horarios. Su ficha pública muestra el formulario solo mientras las reservas estén activas.'}</p>
  <TableReservations locale={locale} expectedActor={user.id}/>
 </main>;
}
