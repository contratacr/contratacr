import type {Metadata} from 'next';
import {businessPage} from '@/lib/directory/business-page';
import {placeSectionById} from '@/lib/directory/place-verticals';
import {BusinessNav} from '@/components/directory/business-nav';
import {ClaimPlaceNextStep} from '@/components/pro/place-next-step';

// Launch without Pro (2026-11-18): «Mi negocio» hub — the free owner tools of the claimed places this account manages
// (owner or manager), outside ContrataCR Pro. Reviews and questions are answered on the public page of the place.
export const dynamic='force-dynamic';
export const metadata:Metadata={robots:{index:false,follow:false}};
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const chip=`inline-flex min-h-11 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-[#162543] hover:border-[#009FD9] ${ring}`;
export default async function BusinessHubRoute({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 const {places,sections,prefix,en}=await businessPage(locale,'');
 const t=(es:string,english:string)=>en?english:es,base=prefix+'/dashboard/negocio';
 return <main id="contenido" data-business-hub className="mx-auto max-w-4xl space-y-5 px-4 py-6 text-[#162543] sm:py-10">
  <BusinessNav locale={locale} current="hub" sections={sections}/>
  <div className="space-y-2">
   <h1 className="text-2xl font-bold sm:text-3xl">{t('Mi negocio','My business')}</h1>
   <p className="text-slate-700">{t('Herramientas gratuitas para los negocios que usted administra en el directorio. El orden y la visibilidad de su ficha nunca dependen de pagos.','Free tools for the businesses you manage in the directory. The order and visibility of your page never depend on payment.')}</p>
  </div>
  {!places.length?<div data-business-no-place><ClaimPlaceNextStep locale={locale} intro={{es:'Todavía no administra ningún negocio. Reclame su ficha gratis y vuelva aquí para editar su contacto, horario, menú, reservas y eventos.',en:'You do not manage any business yet. Claim your page for free and come back here to edit your contact details, hours, menu, reservations and events.'}}/></div>
  :<ul className="space-y-4">{places.map(p=>{const s=placeSectionById(p.vertical),dining=p.vertical==='restaurant'||p.vertical==='cafe_bar';
   return <li key={p.id} data-business-place={p.slug} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
     <h2 className="text-lg font-bold">{p.name}</h2>
     <p className="text-sm text-[#52627a]">{s?(en?s.nameEn:s.nameEs):''} · {p.role==='owner'?t('Dueño','Owner'):t('Administrador','Manager')}</p>
    </div>
    <ul className="flex flex-wrap gap-2">
     <li><a className={chip} href={`${base}/perfil?lugar=${p.slug}`}>{t('Contacto y horario','Contact and hours')}</a></li>
     {dining&&<li><a className={chip} href={`${base}/menu?lugar=${p.slug}`}>{t('Menú','Menu')}</a></li>}
     {dining&&<li><a className={chip} href={`${base}/reservas`}>{t('Reservas de mesa','Table reservations')}</a></li>}
     {p.vertical!=='banking'&&<li><a className={chip} href={`${base}/lugar`}>{t('Eventos y "Pedir"','Events and "Order"')}</a></li>}
     <li><a data-business-public className={chip} href={`${prefix}/lugar/${p.slug}`}>{t('Ver ficha: responder reseñas y preguntas','Open page: reply to reviews and questions')}</a></li>
    </ul>
   </li>;})}</ul>}
 </main>;
}
