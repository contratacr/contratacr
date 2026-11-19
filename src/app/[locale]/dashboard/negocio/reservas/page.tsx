import type {Metadata} from 'next';
import {businessPage} from '@/lib/directory/business-page';
import {BusinessNav} from '@/components/directory/business-nav';
import {TableReservations} from '@/components/pro/table-reservations';

// Launch without Pro (2026-11-18): table reservations + waitlist of a claimed restaurant/café, free for its
// owner/managers. Everything goes through /api/negocio/reservas (same SQL as the Pro screen).
export const dynamic='force-dynamic';
export const metadata:Metadata={robots:{index:false,follow:false}};
export default async function BusinessReservationsRoute({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 const {user,sections,en}=await businessPage(locale,'/reservas');
 return <main id="contenido" data-table-res-page data-business-reservations-page className="mx-auto max-w-4xl space-y-4 px-4 py-6 text-[#162543] sm:py-10">
  <BusinessNav locale={locale} current="reservations" sections={sections}/>
  <h1 className="text-2xl font-bold">{en?'Table reservations':'Reservas de mesa'}</h1>
  <p className="text-slate-700">{en?'Confirm or decline requests, manage today’s waitlist and choose your times. Your public page shows the form only while reservations are on.':'Confirme o rechace solicitudes, maneje la lista de espera de hoy y elija sus horarios. Su ficha pública muestra el formulario solo mientras las reservas estén activas.'}</p>
  <TableReservations locale={locale} expectedActor={user.id} endpoint="/api/negocio/reservas"/>
 </main>;
}
