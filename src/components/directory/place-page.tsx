import {createElement,type ReactNode} from 'react';
import {cn} from '@/lib/utils';
import {ArrowLeftRight,Banknote,Bath,CalendarCheck,CalendarClock,Car,Check,ChevronRight,CircleParking,Clock,Coffee,CreditCard,Droplets,ExternalLink,FileText,Fuel,Landmark,Leaf,MapPin,Navigation,PawPrint,PenLine,Percent,Phone,Pill,ShoppingBag,Siren,Smartphone,Star,Store,Truck,Waves,Wifi,Wind,Wrench,Zap,type LucideIcon} from 'lucide-react';
import {VERIFICATION_LABELS,WEEKDAYS,type PublicPlace} from '@/lib/directory/types';
import {PlaceReportForm} from './place-report-form';
import {PlaceContactLink} from './place-contact-link';
import {DIRECTORY_LISTINGS_ENABLED} from '@/lib/directory/feature-flags';
import {kindLabel,placeSectionById} from '@/lib/directory/place-verticals';
import type {OrderLink,PlaceBrand} from '@/lib/directory/place-features';
import {PlacesMap} from '@/components/maps/places-map';
import {directionsLinks} from '@/lib/maps/maplibre';
import {PlacePhotoGallery} from './place-photo-gallery';
import {checkPlacePhone} from '@/lib/directory/phone';
import {openStatus,openStatusText} from '@/lib/directory/open-status';
import {placeAmenities,placeCuisines,placePriceLevel} from '@/lib/directory/place-amenities';
import {BIZ,HeroTile,RatingLine,ring} from './biz-ui';
import {PlaceTabs,type PlaceTab} from './place-tabs';
import {ProfileIdentityName} from '@/components/professionals/profile-identity-name';
import {VerifiedSeal} from '@/components/ui/verified-seal';
import {placePhotoSrc} from '@/lib/directory/place-photos';
import {ShareButton} from './share-button';

/**
 * Canonical page of a place, /lugar/<slug> — Yelp «biz page» MODEL in the ContrataCR look (2026-11-19, owner request
 * «revise cómo lo hace Yelp … para cada empresa o sucursal»):
 * - header: photo mosaic (or a calm section-colour hero with «Agregar fotos»; never stock photos), H1, stars + count or
 *   «Sin reseñas todavía», verification chip («No reclamado» when imported), price level, section · kind chips, open
 *   status computed from the hours in Costa Rica time with a «Ver horario» anchor, «Sucursal de <marca> · ver las N»;
 * - action bar: «Escribir reseña» (opens the review form through #escribir-resena), «Agregar foto», «Compartir», «Guardar»;
 * - two columns from lg: main sections in Yelp order (offer/menu/prices, «Ubicación y horario», «Comodidades y más»
 *   from typed attributes only, «Acerca de», events, «Preguntas a la comunidad», reviews, other branches) and a sticky
 *   card (website, «Llamar», address + «Cómo llegar» in Google Maps / Waze / OpenStreetMap, «Pedir», compact claim
 *   link, «Sugerir un cambio»); phones get a fixed bottom bar (Llamar / Cómo llegar / Escribir reseña);
 * - footer: source attribution (© OpenStreetMap, ODbL) and «Reportar un problema o pedir el retiro» (Ley 10.946 notice
 *   channel). Explanations of the directory (sources, Pedir, Q&A, prices, claims) live in Terms 13.1, not here.
 * Data rules unchanged: only a valid Costa Rican number becomes «Llamar»; pharmacies/health keep the permit line;
 * hours from OSM keep «Horario según OpenStreetMap.»; nothing is shown that the data does not contain.
 */
/** Source labels are stored bilingual («Español / English»); show only the page language. */
const bilingual=(text:string,en:boolean)=>{const parts=text.split(' / ');return parts.length===2?parts[en?1:0]!.trim():text;};
const AMENITY_ICONS:Record<string,LucideIcon>={ArrowLeftRight,Banknote,Bath,CalendarCheck,CalendarClock,Car,Clock,Coffee,CreditCard,Droplets,FileText,Fuel,Landmark,Leaf,CircleParking,PawPrint,Percent,Pill,ShoppingBag,Siren,Smartphone,Store,Truck,Waves,Wifi,Wind,Wrench,Zap};
const iconOf=(name:string)=>AMENITY_ICONS[name]??Check;


export type PlacePageSlots={
 /** Owner shortcut and reservations, first in the «Información» tab. */top?:ReactNode;
 /** Menu link, prices, price report, dealer/agency listings («Menú» / «Precios» tab). */offer?:ReactNode;
 events?:ReactNode;questions?:ReactNode;reviews?:ReactNode;
 /** Compact «¿Es su negocio?» row of the side card (only while unclaimed). */claim?:ReactNode;
 /** «Otras sucursales» of the same brand. */branches?:ReactNode;
};
/** Label of the offer tab per section (menu for food, prices for fuel, products and prices for shops, listings for dealers). */
function offerTabLabel(vertical:string,en:boolean):string{
 if(vertical==='restaurant'||vertical==='cafe_bar')return en?'Menu':'Menú';
 if(vertical==='fuel')return en?'Prices':'Precios';
 if(vertical==='pharmacy'||vertical==='grocery'||vertical==='convenience'||vertical==='hardware')return en?'Products and prices':'Productos y precios';
 if(vertical==='vehicle_dealer'||vertical==='real_estate')return en?'Listings':'Anuncios';
 return en?'Prices':'Precios';
}
export function PlacePage({place,locale,hoursSource,orderLink,brand,saveSlot,photoSlot,priceNote,slots={}}:{photoSlot?:ReactNode;place:PublicPlace;locale:string;hoursSource?:string|null;orderLink?:OrderLink|null;brand?:PlaceBrand|null;saveSlot?:ReactNode;priceNote?:string|null;slots?:PlacePageSlots}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const area=[place.address.adminArea3,place.address.adminArea2,place.address.adminArea1].filter(Boolean).join(', ');
 const days=en?WEEKDAYS.en:WEEKDAYS.es,vertical=en?place.vertical.nameEn:place.vertical.nameEs;
 // Section pages use the Spanish segment in both languages (/restaurantes, /en/restaurantes), like the rest of the site.
 // Dealers and agencies share the path of the classified listings, which are OFF (feature-flags.ts): no link then.
 const sectionHref=!DIRECTORY_LISTINGS_ENABLED&&(place.vertical.pathEs==='vehiculos'||place.vertical.pathEs==='inmuebles')?null:(en?'/en/':'/')+place.vertical.pathEs;
 const verification=VERIFICATION_LABELS[place.verificationLevel][en?'en':'es'];
 const section=placeSectionById(place.vertical.id),kind=kindLabel(place.vertical.id,place.attributes.kind,en);
 const trusted=place.verificationLevel==='verified'||place.verificationLevel==='license_verified'||place.verificationLevel==='claimed';
 const directions=place.location?directionsLinks(place.location.lat,place.location.lng):null;
 const today=new Date(new Date().toLocaleString('en-US',{timeZone:'America/Costa_Rica'})).getDay();
 const phone=checkPlacePhone(place.phone);
 const status=place.status==='published'?openStatus(place.hours):null,statusText=status?openStatusText(status,en,days):null;
 const amenities=placeAmenities(place.attributes,{open24:status?.state==='open24'});
 const cuisines=placeCuisines(place.attributes),priceLevel=placePriceLevel(place.attributes);
 const photos=place.media.filter(m=>m.kind==='photo').map(m=>({url:m.url,caption:(en?m.altEn:m.altEs)??null}));
 const brandAbout=brand?(en?brand.descriptionEn:brand.descriptionEs):null;
 const address=place.address.line?`${place.address.line}${place.address.locality?`, ${place.address.locality}`:''}`:null;
 const order=orderLink&&place.status==='published'?orderLink:null;
 const orderHref=order?(order.channel==='phone'?`tel:${order.value.replace(/[^+0-9]/g,'')}`:order.value):null;
 const hasMobileBar=place.status==='published';
 const avatarClass=cn(BIZ.avatar,'relative grid shrink-0 place-items-center overflow-hidden rounded-full');
 const hoursTable=place.hours.length>0&&<section aria-labelledby="place-hours" className="space-y-3">
  <h3 id="place-hours" className="text-base font-bold text-[#162543]">{t('Horario','Opening hours')}</h3>
  <dl className="grid grid-cols-[max-content_1fr] overflow-hidden rounded-2xl border border-[#e3e9ef] text-[15px]">
   {days.map((day,i)=>{const slots=place.hours.filter(h=>h.weekday===i),now=i===today;return <div key={day} className={`contents ${now?'font-semibold':''}`} data-place-today={now||undefined}>
    <dt className={`border-b border-[#eef2f6] py-2.5 pl-4 pr-6 ${now?'bg-[#eaf6fb] font-bold':'font-medium text-[#334155]'}`}>{day}{now&&<span className="ml-2 rounded-full bg-[#162543] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">{t('hoy','today')}</span>}</dt>
    <dd className={`border-b border-[#eef2f6] py-2.5 pr-4 ${now?'bg-[#eaf6fb]':''}`}>{slots.length?slots.map(h=>h.opens==='00:00'&&(h.closes==='24:00'||h.closes==='23:59')?t('24 horas','24 hours'):`${h.opens}–${h.closes}`).join(', '):<span className="text-slate-500">{t('Cerrado','Closed')}</span>}</dd></div>;})}
  </dl>
  {hoursSource==='osm'&&<p data-place-hours-source="osm" className="text-xs text-slate-600">{t('Horario según OpenStreetMap.','Hours from OpenStreetMap.')}</p>}
 </section>;

 const dirLinks=directions&&<p data-place-directions className="flex flex-wrap gap-2">
  <a className={cn(BIZ.secondary,'px-3.5 text-[13px]')} href={directions.google} rel="noopener noreferrer" target="_blank">Google Maps</a>
  <a className={cn(BIZ.secondary,'px-3.5 text-[13px]')} href={directions.waze} rel="noopener noreferrer" target="_blank">Waze</a>
  <a className={cn(BIZ.secondary,'px-3.5 text-[13px]')} href={directions.osm} rel="noopener noreferrer" target="_blank">OpenStreetMap</a></p>;


 // Contact card: same anatomy as the professional contact card («Consultar precio» heading, location line, stacked
 // pill buttons), adapted to a business. Rendered once; on phones it sits right under the identity card.
 const row='flex flex-col gap-2';
 const sideCard=<div className={cn(BIZ.card,'p-5')} data-place-side-card>
  <div className="mx-auto flex w-full max-w-md flex-col gap-1.5 lg:max-w-none">
   <p className={BIZ.cardTitle}>{t('Contacte a este negocio','Contact this business')}</p>
   {area&&<p className="flex items-center gap-1 text-[12px] font-semibold text-[#5f6f86]"><MapPin aria-hidden="true" className="h-3 w-3 shrink-0"/><span className="min-w-0">{area}</span></p>}
   {priceNote&&<p data-place-price-note className="text-[15px] font-bold text-[#162543]">{priceNote}</p>}
   <div className={cn(row,'mt-2')}>
    {phone?.kind==='cr'&&<PlaceContactLink slug={place.slug} channel="call" className={cn(BIZ.primary,'h-12 w-full text-base font-semibold')} href={`tel:${phone.tel}`}><Phone aria-hidden="true" className="h-5 w-5"/>{t('Llamar','Call')} <span className="whitespace-nowrap">{phone.display}</span></PlaceContactLink>}
    {order&&orderHref&&<a data-place-order={order.channel} className={cn(phone?.kind==='cr'?BIZ.secondary:BIZ.primary,'h-12 w-full text-base font-semibold')} href={orderHref} {...(order.channel==='phone'?{}:{target:'_blank',rel:'nofollow noopener noreferrer'})}>
     <ShoppingBag aria-hidden="true" className="h-5 w-5"/>{t('Pedir','Order')}<span className="text-sm font-normal">{order.channel==='whatsapp'?t('por WhatsApp','on WhatsApp'):order.channel==='web'?t('en su sitio','on its website'):t('por teléfono','by phone')}</span></a>}
    {directions&&<a data-place-directions-cta className={cn(BIZ.secondary,'h-12 w-full text-base font-semibold')} href={directions.google} rel="noopener noreferrer" target="_blank"><Navigation aria-hidden="true" className="h-5 w-5"/>{t('Cómo llegar','Get directions')}</a>}
    {place.website&&<a data-place-website className={cn(BIZ.secondary,'h-12 w-full text-base font-semibold')} href={place.website} rel="nofollow ugc noopener noreferrer" target="_blank"><ExternalLink aria-hidden="true" className="h-5 w-5"/>{t('Sitio web','Website')}</a>}
   </div>
   {address&&<p className="mt-1 text-center text-[13px] text-[#68778d]">{address}</p>}
   {phone?.kind==='other'&&<p data-place-phone-other={phone.reason} className="mt-1 text-sm text-slate-700"><span className="font-semibold">{t('Otros datos:','Other details:')}</span>{' '}
    {phone.reason==='foreign'?t('teléfono registrado de otro país (sin verificar)','phone registered in another country (not verified)'):t('teléfono registrado con un formato que no es costarricense válido (sin verificar)','phone on file not in a valid Costa Rican format (not verified)')}: <span className="whitespace-nowrap">{phone.display}</span></p>}
  </div>
  {slots.claim&&<div className="mt-4 border-t border-[#eef2f6] pt-4">{slots.claim}</div>}
  <div className="mt-3 border-t border-[#eef2f6] pt-3 text-center"><a href="#reportar" data-place-suggest className={`inline-flex min-h-11 items-center gap-2 text-sm ${BIZ.link}`}><PenLine aria-hidden="true" className="h-4 w-4"/>{t('Sugerir un cambio','Suggest an edit')}</a></div>
 </div>;

 // ── Tabs (only the ones with content; reviews always) ──
 const infoTab=<>
  {slots.top&&<div className="space-y-4">{slots.top}</div>}
  <section id="horario" aria-labelledby="place-location" className="scroll-mt-24 space-y-4">
   <h2 id="place-location" className={BIZ.h2}>{place.hours.length?t('Ubicación y horario','Location and hours'):t('Ubicación','Location')}</h2>
   <div className={`grid gap-6 ${place.hours.length?'md:grid-cols-2':''}`}>
    <div className="space-y-3">
     {place.location&&<PlacesMap locale={locale} zoom={place.location.precision==='exact'?15:13} className="h-48 overflow-hidden rounded-2xl sm:h-56"
      label={t(`Mapa con la ubicación de ${place.name}`,`Map showing where ${place.name} is`)}
      points={[{id:place.slug,lat:place.location.lat,lng:place.location.lng,label:place.name}]}/>}
     {address?<p className="font-semibold">{address}</p>:<p className="text-slate-700">{t('Dirección no indicada.','No address provided.')}</p>}
     {area&&address&&<p className="-mt-2 text-sm text-[#526277]">{area}</p>}
     {place.location&&place.location.precision!=='exact'&&<p className="text-sm text-slate-700">{t('Ubicación aproximada.','Approximate location.')}</p>}
     {dirLinks}
    </div>
    {hoursTable}
   </div>
  </section>
  {amenities.length>0&&<section id="comodidades" aria-labelledby="place-amenities" data-place-amenities={amenities.length} className="scroll-mt-24 space-y-4">
   <h2 id="place-amenities" className={BIZ.h2}>{t('Comodidades y más','Amenities and more')}</h2>
   <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{amenities.map(a=><li key={a.key} data-place-amenity={a.key} className="flex items-center gap-3 text-[15px]">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f1f5f9] text-[#162543]">{createElement(iconOf(a.icon),{'aria-hidden':true,className:'h-5 w-5'})}</span>{en?a.en:a.es}</li>)}</ul>
  </section>}
  {brand&&brandAbout&&<section id="acerca" aria-labelledby="place-about" data-place-brand-about={brand.slug} className="scroll-mt-24 space-y-3">
   <h2 id="place-about" className={BIZ.h2}>{t(`Acerca de ${brand.name}`,`About ${brand.name}`)}</h2>
   <p className="max-w-2xl text-[15px] leading-7 text-[#334155]">{brandAbout}</p>
  </section>}
  {slots.events}
  {slots.branches}
 </>;
 const offerLabel=offerTabLabel(place.vertical.id,en);
 const tabs:PlaceTab[]=[
  {id:'info',label:t('Información','Information'),anchors:['horario','comodidades','acerca','eventos','sucursales'],content:infoTab},
  ...(slots.offer?[{id:'offer',label:offerLabel,anchors:['precios'],content:<div className="space-y-6">{slots.offer}</div>}]:[]),
  {id:'reviews',label:t('Reseñas','Reviews'),anchors:['resenas','escribir-resena'],content:slots.reviews??<section id="resenas" className="space-y-3"><h2 className={BIZ.h2}>{t('Reseñas','Reviews')}</h2><p className={BIZ.sub} data-place-reviews-empty>{t('Todavía no hay reseñas.','No reviews yet.')}</p></section>},
  ...(photos.length>0?[{id:'photos',label:t('Fotos','Photos'),anchors:['fotos'],content:<section id="fotos" aria-labelledby="place-photos" data-place-photos className="scroll-mt-24 space-y-4">
   <h2 id="place-photos" className={BIZ.h2}>{t('Fotos','Photos')} ({photos.length})</h2>
   <PlacePhotoGallery en={en} placeName={place.name} photos={photos}/></section>}]:[]),
  ...(slots.questions?[{id:'questions',label:t('Preguntas','Questions'),anchors:['preguntas'],content:slots.questions}]:[]),
 ];
 // Gas stations lead with their prices; every other section opens on «Información».
 const defaultTab=place.vertical.id==='fuel'&&slots.offer?'offer':'info';

 const nameBadge=trusted?<span data-place-verification={place.verificationLevel} className="inline-flex align-middle"><VerifiedSeal className="h-4 w-4" label={verification}/></span>:null;
 return <main id="contenido" data-place-page={place.slug} className={`mx-auto max-w-7xl px-4 pt-4 text-[#162543] sm:px-6 lg:px-8 lg:pt-8 ${hasMobileBar?'pb-28 lg:pb-14':'pb-14'}`}>
  <nav aria-label={t('Ruta de navegación','Breadcrumb')} className="mb-4 hidden text-sm text-[#526277] sm:block">
   <ol className="flex flex-wrap items-center gap-1"><li><a className={`hover:underline ${ring}`} href={en?'/en':'/'}>{t('Inicio','Home')}</a></li><li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5"/></li>
    <li>{sectionHref?<a className={`hover:underline ${ring}`} href={sectionHref}>{vertical}</a>:vertical}</li><li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5"/></li><li aria-current="page" className="min-w-0 truncate text-[#162543]">{place.name}</li></ol>
  </nav>

  <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_352px]">
   {/* ── Identity card: same grid as the professional profile (avatar | name, rating, tags | actions) ── */}
   <div className="min-w-0 lg:col-start-1 lg:row-start-1">
    <div className="relative rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6">
     {photos.length>0&&<div className="mb-4 sm:mb-5"><PlacePhotoGallery variant="strip" en={en} placeName={place.name} photos={photos}/></div>}
     <div className="flex min-w-0 items-center gap-3 sm:gap-5">
      {photos.length>0
       ?<span data-place-avatar="photo" className={avatarClass}>{/* eslint-disable-next-line @next/next/no-img-element -- same-origin photo route */}
        <img src={placePhotoSrc(photos[0]!.url,320)} alt="" loading="eager" className="absolute inset-0 h-full w-full bg-white object-cover"/></span>
       :<span data-place-photo-placeholder={place.vertical.id} className={avatarClass}><HeroTile verticalId={place.vertical.id} className="h-full w-full" iconClass="h-8 w-8 sm:h-10 sm:w-10"/></span>}
      <div className="min-w-0 flex-1">
       <ProfileIdentityName testId="place-name" name={place.name} badge={nameBadge}/>
       <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 sm:mt-2">
        <RatingLine average={place.rating.average} count={place.rating.count} en={en} href="#resenas"/>
        {priceLevel&&<span data-place-price-level className="text-[13px] font-bold text-[#334155]" aria-label={t(`Nivel de precio ${priceLevel.length} de 4`,`Price level ${priceLevel.length} of 4`)}>{priceLevel}</span>}
       </div>
       <ul className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={t('Datos principales','Key facts')}>
        {/* Imported / unverified listings: a quiet «No reclamado» (sources in Terms 13.1 and the footer line). */}
        {!trusted&&<li data-place-verification={place.verificationLevel} className={cn(BIZ.chip,'border border-[#d7e1ea] bg-white')}>{verification}</li>}
        {trusted&&<li className="sr-only">{verification}</li>}
        {place.status==='closed_permanently'&&<li data-place-closed className="rounded-full bg-red-50 px-2.5 py-1 text-[12px] font-semibold text-red-800">{t('Cerrado definitivamente','Permanently closed')}</li>}
        <li>{sectionHref?<a href={sectionHref} className={cn(BIZ.chip,'hover:bg-[#e5e7eb]',ring)}>{vertical}</a>:<span className={BIZ.chip}>{vertical}</span>}</li>
        {kind&&<li><span data-place-kind={String(place.attributes.kind)} className={BIZ.chip}>{kind}</span></li>}
        {cuisines.slice(0,4).map(c=><li key={c}><span className={BIZ.chip}>{c}</span></li>)}
       </ul>
       {statusText&&<p data-place-open-status={status!.state} className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
        <span className={`font-bold ${statusText.open?'text-emerald-700':'text-red-700'}`}>{statusText.label}</span>
        {statusText.detail&&<>{' '}<span className="text-[#334155]">· {statusText.detail}</span></>}
        <a href="#horario" className={`ml-1 text-[13px] ${BIZ.link}`}>{t('Ver horario','See hours')}</a></p>}
       {area&&<p className="mt-1.5 flex items-center gap-1 text-[12.5px] text-[#68778d]"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/>{area}</p>}
      </div>
     </div>
     {place.vertical.id==='pharmacy'&&(place.verificationLevel==='license_verified'
      ?<p data-pharmacy-license="verified" className="mt-3 text-sm text-slate-700">{t('ContrataCR verificó el permiso de funcionamiento de esta farmacia.','ContrataCR verified this pharmacy\'s operating license.')}</p>
      :<p data-pharmacy-license="unverified" className="mt-3 text-sm text-slate-700">{t('Permiso sin verificar por ContrataCR.','License not verified by ContrataCR.')}</p>)}
     {section?.policy.health&&(place.verificationLevel==='license_verified'
      ?<p data-health-permit="verified" className="mt-3 text-sm text-slate-700">{t('ContrataCR verificó la habilitación de este establecimiento.','ContrataCR verified this facility\'s health permit.')}</p>
      :<p data-health-permit="unverified" className="mt-3 text-sm text-slate-700">{t('Habilitación sin verificar por ContrataCR.','Permit not verified by ContrataCR.')}
       {place.vertical.id==='health'?` ${t('En una emergencia llame al 9-1-1.','In an emergency, call 9-1-1.')}`:''}</p>)}
     {brand&&<p data-place-brand={brand.slug} className="mt-3 text-[14px] text-[#334155]">{t('Sucursal de','Branch of')}{' '}
      <a className={BIZ.link} href={`${prefix}/marca/${brand.slug}`}>{brand.name}</a>
      {brand.branches>1&&<>{' · '}<a className={BIZ.link} href={`${prefix}/marca/${brand.slug}#sucursales`}>{t(`ver las ${brand.branches} sucursales`,`see all ${brand.branches} branches`)}</a></>}</p>}
     {place.status==='published'&&<div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-[#eef2f6] pt-4" data-place-actions-bar>
      <a href="#escribir-resena" data-place-write-review className={cn(BIZ.primary,'max-lg:hidden')}><Star aria-hidden="true" className="h-4 w-4"/>{t('Dejar una reseña','Leave a review')}</a>
      {photoSlot}
      <ShareButton title={place.name} locale={locale} className={BIZ.secondary}/>
      {saveSlot}
     </div>}
    </div>
   </div>

   {/* ── Contact card: right column from lg (sticky), right under the identity card on phones ── */}
   <aside aria-label={t('Contacto y ubicación','Contact and location')} className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
    <div className="lg:sticky lg:top-20">{sideCard}</div>
   </aside>

   <div className="min-w-0 lg:col-start-1 lg:row-start-2">
    <PlaceTabs tabs={tabs} label={t('Secciones del negocio','Business sections')} defaultTab={defaultTab}/>
   </div>
  </div>

  <footer className="mt-12 space-y-4 border-t border-[#e8edf2] pt-6 text-sm text-slate-600">
   <section aria-labelledby="place-sources" className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
    <h2 id="place-sources" className="font-semibold text-[#334155]">{t('Fuentes:','Sources:')}</h2>
    {place.sources.length?<ul className="inline-flex flex-wrap gap-x-3">{place.sources.map(s=><li key={s.name} data-place-source={s.name}>
     {s.url?<a className={`underline underline-offset-2 ${ring}`} href={s.url} rel="noopener noreferrer" target="_blank">{bilingual(s.attribution,en)}</a>:bilingual(s.attribution,en)} · {bilingual(s.license,en)}</li>)}</ul>
     :<p>{t('Información aportada a ContrataCR.','Information provided to ContrataCR.')}</p>}
   </section>
   <PlaceReportForm slug={place.slug} locale={locale}/>
  </footer>

  {hasMobileBar&&<nav aria-label={t('Acciones rápidas','Quick actions')} data-place-mobile-bar className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e5e7eb] bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 shadow-[0_-8px_24px_-16px_rgba(22,37,67,0.4)] backdrop-blur lg:hidden">
   <div className="mx-auto flex max-w-md gap-2">
    {phone?.kind==='cr'&&<PlaceContactLink slug={place.slug} channel="call" className={cn(BIZ.primary,'h-12 min-w-0 flex-1 gap-1.5 px-2 text-[14px]')} href={`tel:${phone.tel}`}><Phone aria-hidden="true" className="h-4 w-4 shrink-0"/>{t('Llamar','Call')}</PlaceContactLink>}
    {directions&&<a className={cn(BIZ.secondary,'h-12 min-w-0 flex-1 gap-1.5 px-2 text-[14px]')} href={directions.google} rel="noopener noreferrer" target="_blank"><Navigation aria-hidden="true" className="h-4 w-4 shrink-0"/>{t('Cómo llegar','Directions')}</a>}
    <a href="#escribir-resena" data-place-mobile-review className={cn(BIZ.secondary,'h-12 min-w-0 flex-1 gap-1.5 px-2 text-[14px]')}><Star aria-hidden="true" className="h-4 w-4 shrink-0"/>{t('Reseñar','Review')}</a>
   </div>
  </nav>}
 </main>;
}
