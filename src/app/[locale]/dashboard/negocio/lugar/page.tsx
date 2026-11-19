import type {Metadata} from 'next';
import {businessPage} from '@/lib/directory/business-page';
import {BusinessNav} from '@/components/directory/business-nav';
import {PlaceTools} from '@/components/pro/place-tools';

// Launch without Pro (2026-11-18): events (public /eventos, staff-moderated) and the «Pedir» link-out of a claimed
// place, free for its owner/managers, through /api/negocio/lugar. Brand information stays with staff-approved brand
// owners (not offered here).
export const dynamic='force-dynamic';
export const metadata:Metadata={robots:{index:false,follow:false}};
export default async function BusinessPlaceToolsRoute({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 const {user,sections,en}=await businessPage(locale,'/lugar');
 return <main id="contenido" data-place-tools-page data-business-place-page className="mx-auto max-w-4xl space-y-4 px-4 py-6 text-[#162543] sm:py-10">
  <BusinessNav locale={locale} current="place" sections={sections}/>
  <h1 className="text-2xl font-bold">{en?'Events and «Order» button':'Eventos y botón «Pedir»'}</h1>
  <p className="text-slate-700">{en?'Publish events on /eventos and add one way to order from your own channel. Order and visibility never depend on payment.':'Publique eventos en /eventos y agregue una forma de pedir por su propio canal. El orden y la visibilidad nunca dependen de pagos.'}</p>
  <PlaceTools locale={locale} expectedActor={user.id} endpoint="/api/negocio/lugar" brandEndpoint={null}/>
 </main>;
}
