import type {ReactNode} from 'react';
import {VERIFICATION_LABELS,WEEKDAYS,type PublicPlace} from '@/lib/directory/types';
import {PlaceReportForm} from './place-report-form';
import {PlaceContactLink} from './place-contact-link';
import {DIRECTORY_LISTINGS_ENABLED} from '@/lib/directory/feature-flags';
import {kindLabel,placeSectionById} from '@/lib/directory/place-verticals';
import type {OrderLink,PlaceBrand} from '@/lib/directory/place-features';
import {PlacesMap} from '@/components/maps/places-map';
import {directionsLinks} from '@/lib/maps/maplibre';
import {PlacePhotoPlaceholder} from './place-photo-placeholder';
import {PlacePhotoGallery} from './place-photo-gallery';
import {checkPlacePhone} from '@/lib/directory/phone';

/**
 * LOCAL PRO ONLY (multivertical F1 + UI polish): canonical page of a place, /lugar/<slug>. Optional `children`
 * (claim, prices, menu link, <PlaceListingsSection/> for dealers/agencies, reviews). Layout:
 * - breadcrumb as an ordered list (Inicio › Sección) with aria-current;
 * - verification badge coloured by level (verified/licence = green, imported/unverified = neutral);
 * - pharmacies (all shown since the owner decision of 2026-11-17): one line on the permit, verified or a neutral note;
 * - «Llamar» and «Cómo llegar» as 44 px buttons (navy), website as secondary button (rel nofollow ugc noopener);
 * - hours imported from OpenStreetMap carry the short credit «Horario según OpenStreetMap»; 00:00–24:00 reads «24 horas»;
 * - today's row highlighted in the hours table (America/Costa_Rica) with «Hoy» for screen readers;
 * - photos before hours on mobile (first visual content), lazy images keep alt text;
 * - children slot after the hours (menu link, prices, reviews, claim); same data attributes as before.
 * - 2026-11-17 sections: subtype (`kind`) next to the section name; health/vet places carry the neutral permit line
 *   «Habilitación sin verificar por ContrataCR». Since 2026-11-19 the explanatory notes (no medical advice, banks map
 *   only, no ICT declaratoria, «Pedir» goes to the business's own channel, order never paid) live in the Terms
 *   («Directorio de lugares y negocios») and /como-ordenamos, not on this page.
 * - Place features round (2026-11-17): «Pedir» link-out to the business's OWN channel (WhatsApp / its order page / phone;
 *   ContrataCR takes no orders or payments), «Sucursal de <marca>» link to /marca/<slug> with the brand's common info,
 *   and a `saveSlot` (save to a list) next to the main buttons. Banks accept service reviews (note in the reviews block).
 */
/** Source labels are stored bilingual («Español / English»); show only the page language. */
const bilingual=(text:string,en:boolean)=>{const parts=text.split(' / ');return parts.length===2?parts[en?1:0]!.trim():text;};
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
/** `hoursSource`: kind of the source behind the current hours (dir_place_hours_source); 'osm' adds the OpenStreetMap note. */
export function PlacePage({place,locale,hoursSource,children,orderLink,brand,saveSlot,photoSlot}:{photoSlot?:ReactNode;place:PublicPlace;locale:string;hoursSource?:string|null;children?:ReactNode;orderLink?:OrderLink|null;brand?:PlaceBrand|null;saveSlot?:ReactNode}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const area=[place.address.adminArea3,place.address.adminArea2,place.address.adminArea1].filter(Boolean).join(', ');
 const days=en?WEEKDAYS.en:WEEKDAYS.es,vertical=en?place.vertical.nameEn:place.vertical.nameEs;
 // Section pages use the Spanish segment in both languages (/restaurantes, /en/restaurantes), like the rest of the site.
 // Dealers and agencies share the path of the classified listings, which are OFF (feature-flags.ts): no link then.
 const sectionHref=!DIRECTORY_LISTINGS_ENABLED&&(place.vertical.pathEs==='vehiculos'||place.vertical.pathEs==='inmuebles')?null:(en?'/en/':'/')+place.vertical.pathEs;
 const verification=VERIFICATION_LABELS[place.verificationLevel][en?'en':'es'];
 const section=placeSectionById(place.vertical.id),kind=kindLabel(place.vertical.id,place.attributes.kind,en);
 const trusted=place.verificationLevel==='verified'||place.verificationLevel==='license_verified'||place.verificationLevel==='claimed';
 // Map embed (MapLibre + OpenFreeMap, loaded when scrolled into view) and plain-URL directions: OSM, Google Maps, Waze (no API).
 const directions=place.location?directionsLinks(place.location.lat,place.location.lng):null;
 const mapHref=directions?.osm??null;
 const today=new Date(new Date().toLocaleString('en-US',{timeZone:'America/Costa_Rica'})).getDay();
 const button=`inline-flex min-h-11 items-center justify-center rounded-full px-5 font-semibold ${ring}`;
 // Data quality (2026-11-18): only a valid Costa Rican number becomes «Llamar» (lib/directory/phone.ts).
 const phone=checkPlacePhone(place.phone);
 return <main id="contenido" data-place-page={place.slug} className="mx-auto max-w-3xl space-y-8 px-4 py-8 text-[#162543] sm:py-12">
  <nav aria-label={t('Ruta de navegación','Breadcrumb')} className="text-sm">
   <ol className="flex flex-wrap gap-1"><li><a className={`underline underline-offset-2 ${ring}`} href={en?'/en':'/'}>{t('Inicio','Home')}</a> ›</li>
    <li>{sectionHref?<a className={`underline underline-offset-2 ${ring}`} href={sectionHref}>{vertical}</a>:vertical} ›</li><li aria-current="page" className="text-slate-700">{place.name}</li></ol>
  </nav>
  <header className="space-y-3">
   <h1 className="break-words text-3xl font-extrabold leading-tight sm:text-4xl">{place.name}</h1>
   {(kind||area)&&<p className="text-base text-slate-700">{kind&&<span data-place-kind={String(place.attributes.kind)} className="font-semibold">{kind}{area?' · ':''}</span>}{area}</p>}
   <p className="flex flex-wrap gap-2 text-sm">
    {/* Imported / unverified listings: a quiet «No reclamado» (the data sources are listed at the end of the page and the
        Terms explain them); the claim call to action is in the claim block. */}
    <span data-place-verification={place.verificationLevel} className={`rounded-full px-3 py-1 font-semibold ${trusted?'bg-emerald-50 text-emerald-900':'border border-slate-200 text-slate-600'}`}>{trusted?verification:t('No reclamado','Unclaimed')}</span>
    {place.status==='closed_permanently'&&<span data-place-closed className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-800">{t('Cerrado definitivamente','Permanently closed')}</span>}
    {place.rating.count>0&&place.rating.average!=null&&<span className="rounded-full border border-slate-300 px-3 py-1">{new Intl.NumberFormat(en?'en-US':'es-CR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(place.rating.average)} / 5 · {place.rating.count} {t(place.rating.count===1?'reseña':'reseñas',place.rating.count===1?'review':'reviews')}</span>}
   </p>
   {place.vertical.id==='pharmacy'&&(place.verificationLevel==='license_verified'
    ?<p data-pharmacy-license="verified" className="text-sm text-slate-700">{t('ContrataCR verificó el permiso de funcionamiento de esta farmacia.','ContrataCR verified this pharmacy\'s operating license.')}</p>
    :<p data-pharmacy-license="unverified" className="text-sm text-slate-700">{t('Permiso sin verificar por ContrataCR.','License not verified by ContrataCR.')}</p>)}
   {section?.policy.health&&(place.verificationLevel==='license_verified'
    ?<p data-health-permit="verified" className="text-sm text-slate-700">{t('ContrataCR verificó la habilitación de este establecimiento.','ContrataCR verified this facility\'s health permit.')}</p>
    :<p data-health-permit="unverified" className="text-sm text-slate-700">{t('Habilitación sin verificar por ContrataCR.','Permit not verified by ContrataCR.')}
     {place.vertical.id==='health'?` ${t('En una emergencia llame al 9-1-1.','In an emergency, call 9-1-1.')}`:''}</p>)}
   <div className="flex flex-wrap gap-2 pt-1">
    {phone?.kind==='cr'&&<PlaceContactLink slug={place.slug} channel="call" className={`${button} bg-[#162543] text-white`} href={`tel:${phone.tel}`}>{t('Llamar','Call')} {phone.display}</PlaceContactLink>}
    {mapHref&&<a className={`${button} border border-[#162543] bg-white`} href={mapHref} rel="noopener noreferrer" target="_blank">{t('Cómo llegar','Directions')}<span className="sr-only"> (OpenStreetMap)</span></a>}
    {place.website&&<a className={`${button} border border-[#d7e1ea] bg-white`} href={place.website} rel="nofollow ugc noopener noreferrer" target="_blank" data-place-website>{t('Sitio web','Website')}</a>}
    {orderLink&&place.status==='published'&&<a data-place-order={orderLink.channel} className={`${button} bg-[#009FD9] text-[#0b1730]`}
     href={orderLink.channel==='phone'?`tel:${orderLink.value.replace(/[^+0-9]/g,'')}`:orderLink.value} {...(orderLink.channel==='phone'?{}:{target:'_blank',rel:'nofollow noopener noreferrer'})}>
     {t('Pedir','Order')}<span className="ml-1 text-sm font-normal">{orderLink.channel==='whatsapp'?t('por WhatsApp','on WhatsApp'):orderLink.channel==='web'?t('en su sitio','on its website'):t('por teléfono','by phone')}</span></a>}
    {saveSlot}
   </div>
   {phone?.kind==='other'&&<p data-place-phone-other={phone.reason} className="text-sm text-slate-700"><span className="font-semibold">{t('Otros datos:','Other details:')}</span>{' '}
    {phone.reason==='foreign'?t('teléfono registrado de otro país (sin verificar)','phone registered in another country (not verified)'):t('teléfono registrado con un formato que no es costarricense válido (sin verificar)','phone on file not in a valid Costa Rican format (not verified)')}: <span className="whitespace-nowrap">{phone.display}</span></p>}
   {brand&&<p data-place-brand={brand.slug} className="text-sm text-slate-800">{t('Sucursal de','Branch of')}{' '}
    <a className={`font-semibold underline underline-offset-2 ${ring}`} href={`${en?'/en':''}/marca/${brand.slug}`}>{brand.name}</a>
    {' · '}{brand.branches} {t(brand.branches===1?'sucursal':'sucursales',brand.branches===1?'branch':'branches')}
    {(en?brand.descriptionEn:brand.descriptionEs)&&<span className="block text-slate-700">{en?brand.descriptionEn:brand.descriptionEs}</span>}</p>}
  </header>

  {/* Photos (launch round 2026-11-18): gallery + lightbox when there are photos; «Agregar fotos» slot from the route. */}
  {place.media.length===0&&<PlacePhotoPlaceholder verticalId={place.vertical.id} en={en} claimed={trusted}/>}
  {place.media.length>0&&<section aria-labelledby="place-photos" className="space-y-2" data-place-photos>
   <h2 id="place-photos" className="text-lg font-bold">{t('Fotos','Photos')} <span className="text-sm font-normal text-slate-600">({place.media.filter(m=>m.kind==='photo').length})</span></h2>
   <PlacePhotoGallery en={en} placeName={place.name} photos={place.media.filter(m=>m.kind==='photo').map(m=>({url:m.url,caption:(en?m.altEn:m.altEs)??null}))}/>
  </section>}
  {photoSlot}

  <section aria-labelledby="place-contact" className="space-y-2 rounded-2xl border border-[#d7e1ea] p-5">
   <h2 id="place-contact" className="text-lg font-bold">{t('Ubicación','Location')}</h2>
   {place.address.line?<p>{place.address.line}{place.address.locality?`, ${place.address.locality}`:''}</p>:<p className="text-slate-700">{t('Dirección no indicada.','No address provided.')}</p>}
   {place.location&&place.location.precision!=='exact'&&<p className="text-sm text-slate-700">{t('Ubicación aproximada.','Approximate location.')}</p>}
   {place.location&&<PlacesMap locale={locale} zoom={place.location.precision==='exact'?15:13} className="h-56 sm:h-72"
    label={t(`Mapa con la ubicación de ${place.name}`,`Map showing where ${place.name} is`)}
    points={[{id:place.slug,lat:place.location.lat,lng:place.location.lng,label:place.name}]}/>}
   {directions&&<p data-place-directions className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
    <span className="text-slate-700">{t('Abrir en:','Open in:')}</span>
    <a className={`font-semibold underline underline-offset-2 ${ring}`} href={directions.google} rel="noopener noreferrer" target="_blank">Google Maps</a>
    <a className={`font-semibold underline underline-offset-2 ${ring}`} href={directions.waze} rel="noopener noreferrer" target="_blank">Waze</a>
    <a className={`font-semibold underline underline-offset-2 ${ring}`} href={directions.osm} rel="noopener noreferrer" target="_blank">OpenStreetMap</a></p>}
  </section>

  {place.hours.length>0&&<section aria-labelledby="place-hours" className="space-y-2">
   <h2 id="place-hours" className="text-lg font-bold">{t('Horario','Opening hours')}</h2>
   <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
    {days.map((day,i)=>{const slots=place.hours.filter(h=>h.weekday===i),now=i===today;return <div key={day} className={`contents ${now?'font-semibold':''}`} data-place-today={now||undefined}>
     <dt className={now?'font-bold':'font-medium'}>{day}{now&&<span className="ml-1 text-xs">({t('hoy','today')})</span>}</dt>
     <dd>{slots.length?slots.map(h=>h.opens==='00:00'&&(h.closes==='24:00'||h.closes==='23:59')?t('24 horas','24 hours'):`${h.opens}–${h.closes}`).join(', '):t('Cerrado','Closed')}</dd></div>;})}
   </dl>
   {hoursSource==='osm'&&<p data-place-hours-source="osm" className="text-sm text-slate-600">{t('Horario según OpenStreetMap.','Hours from OpenStreetMap.')}</p>}
  </section>}

  {children}

  <section aria-labelledby="place-sources" className="space-y-2 border-t border-[#d7e1ea] pt-6 text-sm text-slate-700">
   <h2 id="place-sources" className="text-base font-bold">{t('Fuentes de esta ficha','Sources for this listing')}</h2>
   {place.sources.length?<ul className="space-y-1">{place.sources.map(s=><li key={s.name} data-place-source={s.name}>
    {s.url?<a className={`underline underline-offset-2 ${ring}`} href={s.url} rel="noopener noreferrer" target="_blank">{bilingual(s.attribution,en)}</a>:bilingual(s.attribution,en)} · {bilingual(s.license,en)}</li>)}</ul>
    :<p>{t('Información aportada a ContrataCR.','Information provided to ContrataCR.')}</p>}
  </section>

  <PlaceReportForm slug={place.slug} locale={locale}/>
 </main>;
}
