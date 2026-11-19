import type {Metadata} from 'next';
import {businessPage} from '@/lib/directory/business-page';
import {BusinessNav} from '@/components/directory/business-nav';
import {BusinessProfileEditor} from '@/components/directory/business-profile-editor';
import {ClaimPlaceNextStep} from '@/components/pro/place-next-step';

// Launch without Pro (2026-11-18): contact data and opening hours of a claimed place (owner/managers, free).
// Writes go through /api/negocio/perfil (SQL dir_owner_place_update). ?lugar=<slug> picks the place.
export const dynamic='force-dynamic';
export const metadata:Metadata={robots:{index:false,follow:false}};
export default async function BusinessProfileRoute({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{lugar?:string}>}){
 const {locale}=await params,{lugar}=await searchParams;
 const {user,places,sections,en}=await businessPage(locale,'/perfil');
 const place=places.find(p=>p.slug===lugar)??places[0];
 return <main id="contenido" data-business-profile-page className="mx-auto max-w-4xl space-y-4 px-4 py-6 text-[#162543] sm:py-10">
  <BusinessNav locale={locale} current="profile" sections={sections}/>
  <h1 className="text-2xl font-bold">{en?'Contact and hours':'Contacto y horario'}</h1>
  <p className="text-slate-700">{en?'What you save here appears on your public page right away. To change the name, section or location, use «Report a problem» on your page.':'Lo que guarde aquí aparece de inmediato en su ficha pública. Para cambiar el nombre, la sección o la ubicación, use «Reportar un problema» en su ficha.'}</p>
  {place?<BusinessProfileEditor key={place.id} locale={locale} expectedActor={user.id} places={places.map(p=>({id:p.id,slug:p.slug,name:p.name}))} placeId={place.id}/>
   :<div data-business-no-place><ClaimPlaceNextStep locale={locale} intro={{es:'Primero reclame su negocio. Luego podrá editar su contacto y horario aquí.',en:'First claim your business. Then you can edit its contact details and hours here.'}}/></div>}
 </main>;
}
