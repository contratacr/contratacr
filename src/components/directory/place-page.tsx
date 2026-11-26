import {createElement,type ReactNode} from 'react';
import {cn} from '@/lib/utils';
import {ArrowLeftRight,Banknote,Bath,CalendarCheck,CalendarClock,Car,Check,ChevronRight,CircleParking,Clock,Coffee,CreditCard,Droplets,ExternalLink,FileText,Fuel,Globe,Landmark,Leaf,MapPin,PawPrint,PenLine,Percent,Pill,ShieldCheck,ShoppingBag,Siren,Smartphone,Star,Store,Truck,Waves,Wifi,Wind,Wrench,Zap,type LucideIcon} from 'lucide-react';
import {VERIFICATION_LABELS,WEEKDAYS,type PublicPlace} from '@/lib/directory/types';
import {PlaceReportForm} from './place-report-form';
import {DIRECTORY_LISTINGS_ENABLED} from '@/lib/directory/feature-flags';
import {kindLabel,placeSectionById,reviewsOn} from '@/lib/directory/place-verticals';
import type {OrderLink,PlaceBrand} from '@/lib/directory/place-features';
import {PlacesMap} from '@/components/maps/places-map';
import {PlacePhotoGallery} from './place-photo-gallery';
import {checkPlacePhone} from '@/lib/directory/phone';
import {openStatus,openStatusText} from '@/lib/directory/open-status';
import {placeAmenities,placeCuisines,placePriceLevel} from '@/lib/directory/place-amenities';
import {BIZ,Stars,ratingNumber,reviewsLabel,ring} from './biz-ui';
import {sectionPhoto} from '@/lib/directory/section-photos';
import {PlaceTabs,type PlaceTab} from './place-tabs';
import {VerifiedSeal} from '@/components/ui/verified-seal';
import {ShareButton} from './share-button';
import {PlaceMoreMenu} from './place-more-menu';
import {mapLinks,placeSideActions,resolvePlaceAction,type PlaceAction,type PlaceActionInput} from '@/lib/directory/place-actions';
import {ActionButton,actionIcon} from './place-action-buttons';
import {CHIP} from './place-card';
import {PlaceChipRail} from './place-chip-rail';
import {WhatsAppLogo} from '@/components/ui/whatsapp-logo';
import {GoogleMapsIcon,WazeIcon} from '@/components/ui/nav-app-icons';

/**
 * Canonical page of a place, /lugar/<slug> — Yelp «biz page» MODEL in the ContrataCR look (2026-11-19, owner request
 * «revise cómo lo hace Yelp»; full redesign 2026-11-26 «rediseño completo … que realmente me deje con la boca abierta»):
 * - hero: the real photos (phones: swiped one by one with «1 / N»; computers: mosaic) or, without photos, the licence-free
 *   section photo blurred and darkened under a navy veil (never an icon tile); name, rating, tags and open status on it;
 * - under it the chip row (Reservar, Reseñar, WhatsApp, Llamar, Waze, Maps, Pedir, Sitio web; Guardar/Compartir/Agregar
 *   fotos in the bar's «…» on phones), the short description and the permit notes;
 * - a sticky tab bar (it also shows the name and rating once the hero is gone), panels without boxes, a map card and an
 *   hours card with today highlighted, amenities as icon rows, «Lugares similares cerca», and the claim box, «Sugerir un
 *   cambio», the data credit and «Reportar» as quiet links at the end.
 * Former notes (still true where they apply):
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
/** Chip row of the page (same chips and order as the result card, one size up): one tab stop per action, slides sideways on phones, wraps from lg. */
const CHIP_ROW='scrollbar-none -mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 py-0.5 [touch-action:pan-x_pan-y] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0';
export const PAGE_CHIP=cn(CHIP,'h-10 gap-2 px-4 text-[13px]');
/** The first action of the row (Reservar, else Reseñar…) is the solid brand pill. */
const PAGE_CHIP_PRIMARY=cn(PAGE_CHIP,'bg-[#009FD9] text-white hover:bg-[#0089bb]');
/** Section heading of the redesigned page (one size for every block). */
const H2='text-xl font-extrabold tracking-tight text-[#162543]';


export type PlacePageSlots={
 /** Owner shortcut, first in the «Información» tab. */top?:ReactNode;
 /** Reservations form, after location, hours and amenities (the «Reservar» chip jumps to it). */reservation?:ReactNode;
 /** Menu link, prices, price report, dealer/agency listings («Menú» / «Precios» tab). */offer?:ReactNode;
 events?:ReactNode;questions?:ReactNode;reviews?:ReactNode;
 /** Compact «¿Es su empresa?» row (only while unclaimed). */claim?:ReactNode;
 /** «Otras sucursales» of the same brand. */branches?:ReactNode;
 /** «Lugares similares cerca» (same section, nearest first), after the tabs. */similar?:ReactNode;
};
/** Label of the offer tab per section (menu for food, prices for fuel, products and prices for shops, listings for dealers). */
function offerTabLabel(vertical:string,en:boolean):string{
 if(vertical==='restaurant'||vertical==='cafe_bar')return en?'Menu':'Menú';
 if(vertical==='fuel')return en?'Prices':'Precios';
 if(vertical==='pharmacy'||vertical==='grocery'||vertical==='convenience'||vertical==='hardware')return en?'Products and prices':'Productos y precios';
 if(vertical==='vehicle_dealer'||vertical==='real_estate')return en?'Listings':'Anuncios';
 return en?'Prices':'Precios';
}
export function PlacePage({place,locale,hoursSource,orderLink,brand,saveSlot,photoSlot,priceNote,slots={},hasMenu=false,reservation=false}:{hasMenu?:boolean;reservation?:boolean;photoSlot?:ReactNode;place:PublicPlace;locale:string;hoursSource?:string|null;orderLink?:OrderLink|null;brand?:PlaceBrand|null;saveSlot?:ReactNode;priceNote?:string|null;slots?:PlacePageSlots}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const area=[place.address.adminArea3,place.address.adminArea2,place.address.adminArea1].filter(Boolean).join(', ');
 const days=en?WEEKDAYS.en:WEEKDAYS.es,vertical=en?place.vertical.nameEn:place.vertical.nameEs;
 // Section pages use the Spanish segment in both languages (/restaurantes, /en/restaurantes), like the rest of the site.
 // Dealers and agencies share the path of the classified listings, which are OFF (feature-flags.ts): no link then.
 const sectionHref=!DIRECTORY_LISTINGS_ENABLED&&(place.vertical.pathEs==='vehiculos'||place.vertical.pathEs==='inmuebles')?null:(en?'/en/':'/')+place.vertical.pathEs;
 const verification=VERIFICATION_LABELS[place.verificationLevel][en?'en':'es'];
 const section=placeSectionById(place.vertical.id),kind=kindLabel(place.vertical.id,place.attributes.kind,en);
 const trusted=place.verificationLevel==='verified'||place.verificationLevel==='license_verified'||place.verificationLevel==='claimed';
 const directions=place.location?mapLinks(place.location.lat,place.location.lng):null;
 const today=new Date(new Date().toLocaleString('en-US',{timeZone:'America/Costa_Rica'})).getDay();
 const phone=checkPlacePhone(place.phone);
 const status=place.status==='published'?openStatus(place.hours):null,statusText=status?openStatusText(status,en,days):null;
 const amenities=placeAmenities(place.attributes,{open24:status?.state==='open24'});
 const cuisines=placeCuisines(place.attributes),priceLevel=placePriceLevel(place.attributes);
 const photos=place.media.filter(m=>m.kind==='photo').map(m=>({url:m.url,caption:(en?m.altEn:m.altEs)??null}));
 const brandAbout=brand?(en?brand.descriptionEn:brand.descriptionEs):null;
 const address=place.address.line?`${place.address.line}${place.address.locality?`, ${place.address.locality}`:''}`:null;
 // The owner's «Pedir» link wins; otherwise the WhatsApp number the team recorded (attributes.whatsapp, 2026-11-26).
 const teamWa=typeof place.attributes?.whatsapp==='string'&&place.attributes.whatsapp?{channel:'whatsapp' as const,value:place.attributes.whatsapp}:null;
 const order=(orderLink??teamWa)&&place.status==='published'?(orderLink??teamWa):null;
 const published=place.status==='published';
 // Owner 2026-11-26: no reviews for public offices, malls, schools and terminals (no rating, no «Reseñar», no Reseñas tab).
 const reviews=reviewsOn(place.vertical.id,place.attributes.kind);
 const actionInput:PlaceActionInput={slug:place.slug,name:place.name,verticalId:place.vertical.id,locale,phone:place.phone,website:place.website,location:place.location,
  hasHours:place.hours.length>0,hasMenu,hasPrices:!!slots.offer&&place.vertical.id==='fuel',reservation,order,reviewable:published&&reviews};
 const sideActions=placeSideActions(actionInput);
 // ONE chip row, same chips and order as the result card (owner 2026-11-26): Reservar, Reseñar, WhatsApp, Llamar, Waze,
 // Maps; then «Pedir» (web/phone link), «Sitio web», and the page tools (Guardar, Compartir, Agregar fotos). Only what exists.
 const pick=(id:Parameters<typeof resolvePlaceAction>[0])=>published?resolvePlaceAction(id,actionInput):null;
 const chipActions:{action:PlaceAction;icon:ReactNode;label:string}[]=[];
 const reserve=reservation?pick('reserve'):null;if(reserve)chipActions.push({action:reserve,icon:<CalendarCheck aria-hidden="true" className="h-4 w-4 shrink-0"/>,label:t('Reservar','Reserve')});
 const wa=pick('whatsapp');if(wa)chipActions.push({action:wa,icon:<WhatsAppLogo className="h-4 w-4 shrink-0"/>,label:'WhatsApp'});
 const call=pick('call');if(call)chipActions.push({action:call,icon:actionIcon('call','h-4 w-4 shrink-0'),label:t('Llamar','Call')});
 const orderAction=order&&order.channel!=='whatsapp'?pick('order'):null;
 const site=pick('website');
 const maps=published&&directions?directions:null;
 // Short description from typed data only (never invented): «<kind> en <zona>. Cocina: …».
 const summary=[kind&&area?t(`${kind} en ${place.address.adminArea2??area}.`,`${kind} in ${place.address.adminArea2??area}.`):null,cuisines.length?t(`Cocina: ${cuisines.slice(0,3).join(', ')}.`,`Cuisine: ${cuisines.slice(0,3).join(', ')}.`):null].filter(Boolean).join(' ')||(brandAbout??'');

 const sec=section?.section??place.vertical.pathEs;
 const backdrop=photos.length?null:sectionPhoto(sec,1200);
 const rated=reviews&&place.rating.count>0&&place.rating.average!=null;
 const ratingAria=rated?t(`${ratingNumber(place.rating.average!)} de 5, ${reviewsLabel(place.rating.count,en)}`,`${ratingNumber(place.rating.average!)} out of 5, ${reviewsLabel(place.rating.count,en)}`):'';

 // ── Hours card: Maps-like status on top, the week below with today highlighted ──
 const hoursTable=place.hours.length>0&&<section aria-labelledby="place-hours" className="overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white">
  <div className="flex items-center gap-3 border-b border-[#eef2f6] px-4 py-3.5">
   <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eaf7fd] text-[#0083b0]"><Clock className="h-[18px] w-[18px]"/></span>
   <div className="min-w-0">
    <h3 id="place-hours" className="text-[15px] font-extrabold text-[#162543]">{t('Horario','Opening hours')}</h3>
    {statusText&&<p className="text-[13px] font-semibold leading-snug"><span className={statusText.open?'text-[#047857]':'text-[#b91c1c]'}>{statusText.label}</span>{statusText.detail&&<span className="text-[#526277]"> · {statusText.detail}</span>}</p>}
   </div>
  </div>
  <dl className="grid grid-cols-[max-content_1fr] px-2 py-2 text-[14.5px]">
   {days.map((day,i)=>{const slots=place.hours.filter(h=>h.weekday===i),now=i===today;return <div key={day} className="contents" data-place-today={now||undefined}>
    <dt className={`rounded-l-xl py-2 pl-3 pr-6 ${now?'bg-[#eaf7fd] font-extrabold text-[#162543]':'font-medium text-[#475569]'}`}>{day}{now&&<span className="ml-2 inline-flex rounded-full bg-[#009FD9] px-2 py-0.5 align-[1px] text-[10.5px] font-extrabold uppercase tracking-wide text-white">{t('hoy','today')}</span>}</dt>
    <dd className={`rounded-r-xl py-2 pr-3 text-right tabular-nums ${now?'bg-[#eaf7fd] font-bold text-[#162543]':'text-[#334155]'}`}>{slots.length?slots.map(h=>h.opens==='00:00'&&(h.closes==='24:00'||h.closes==='23:59')?t('24 horas','24 hours'):`${h.opens}–${h.closes}`).join(', '):<span className="text-slate-500">{t('Cerrado','Closed')}</span>}</dd></div>;})}
  </dl>
  {hoursSource==='osm'&&<p data-place-hours-source="osm" className="border-t border-[#eef2f6] px-4 py-2.5 text-xs text-slate-600">{t('Horario según OpenStreetMap.','Hours from OpenStreetMap.')}</p>}
 </section>;

 // One compact row of map apps (Waze and Maps are also in the header chips; here they sit with the map).
 const dirLinks=directions&&<div data-place-directions aria-label={t('Abrir en una aplicación de mapas','Open in a maps app')} role="group" className="flex flex-wrap items-center gap-1.5">
  <a className={CHIP} href={directions.google} rel="noopener noreferrer" target="_blank"><GoogleMapsIcon className="h-4 w-4 shrink-0"/>Google Maps</a>
  <a className={CHIP} href={directions.waze} rel="noopener noreferrer" target="_blank"><WazeIcon className="h-4 w-4 shrink-0"/>Waze</a>
  <a className={CHIP} href={directions.apple} rel="noopener noreferrer" target="_blank">Apple Maps</a></div>;

 // Side card. From lg: the sticky right column (contact buttons, address, claim, «Sugerir un cambio»).
 // On phones the chip row under the hero already holds every contact action, so only the claim box and «Sugerir un cambio» show, after the tabs.
 const sideCard=<div className="overflow-hidden lg:rounded-2xl lg:border lg:border-[#e5e9ee] lg:bg-white lg:shadow-[0_8px_30px_rgba(22,37,67,0.08)]" data-place-side-card>
  <div className="flex flex-col gap-1.5 p-5 max-lg:hidden">
   <p className="text-[17px] font-extrabold leading-tight text-[#162543]">{t('Contacte a esta empresa','Contact this business')}</p>
   {area&&<p className="flex items-center gap-1 text-[12.5px] font-semibold text-[#5f6f86]"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/><span className="min-w-0">{area}</span></p>}
   {priceNote&&<p data-place-price-note className="text-[15px] font-bold text-[#162543]">{priceNote}</p>}
   <div className="mt-3 flex flex-col gap-2" data-place-side-actions={sideActions.map(x=>x.id).join(' ')}>
    {sideActions.map((x,i)=><ActionButton key={x.id} action={x} slug={place.slug} locale={locale} className={cn(i===0?BIZ.primary:BIZ.secondary,'h-12 w-full text-[15px] font-bold')}>
     {actionIcon(x.id,'h-5 w-5')}{x.label}{x.id==='call'&&phone?.kind==='cr'&&<>{' '}<span className="whitespace-nowrap">{phone.display}</span></>}
     {x.id==='order'&&order&&<span className="text-sm font-normal">{order.channel==='whatsapp'?t('por WhatsApp','on WhatsApp'):order.channel==='web'?t('en su sitio','on its website'):t('por teléfono','by phone')}</span>}</ActionButton>)}
   </div>
   {address&&<p className="mt-2 text-center text-[13px] text-[#68778d]">{address}</p>}
  </div>
  {slots.claim&&<div className="lg:border-t lg:border-[#eef2f6]">{slots.claim}</div>}
  <div className="border-[#eef2f6] max-lg:mt-2 max-lg:px-1 lg:border-t lg:py-1.5 lg:text-center"><a href="#reportar" data-place-suggest className={`inline-flex min-h-11 items-center gap-2 text-[13.5px] ${BIZ.link}`}><PenLine aria-hidden="true" className="h-4 w-4"/>{t('Sugerir un cambio','Suggest an edit')}</a></div>
 </div>;

 // ── Tabs (only the ones with content) ──
 const infoTab=<>
  {slots.top&&<div className="space-y-4">{slots.top}</div>}
  <section id="horario" aria-labelledby="place-location" className="scroll-mt-32 space-y-4">
   <h2 id="place-location" className={H2}>{place.hours.length?t('Ubicación y horario','Location and hours'):t('Ubicación','Location')}</h2>
   <div className={`grid items-start gap-4 ${place.hours.length?'md:grid-cols-2':''}`}>
    <div className="overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white">
     {place.location&&<PlacesMap locale={locale} zoom={place.location.precision==='exact'?15:13} className="h-48 overflow-hidden sm:h-52"
      label={t(`Mapa con la ubicación de ${place.name}`,`Map showing where ${place.name} is`)}
      points={[{id:place.slug,lat:place.location.lat,lng:place.location.lng,label:place.name}]}/>}
     <div className="space-y-3 p-4">
      {(address||area)&&<div className="flex items-start gap-3">
       <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eaf7fd] text-[#0083b0]"><MapPin className="h-[18px] w-[18px]"/></span>
       <div className="min-w-0">{address&&<p className="font-bold leading-snug text-[#162543]">{address}</p>}
        {area&&<p className="text-sm text-[#526277]">{area}</p>}
        {place.location&&place.location.precision!=='exact'&&<p className="text-[13px] text-slate-600">{t('Ubicación aproximada.','Approximate location.')}</p>}</div>
      </div>}
      {dirLinks}
     </div>
    </div>
    {hoursTable}
   </div>
  </section>
  {amenities.length>0&&<section id="comodidades" aria-labelledby="place-amenities" data-place-amenities={amenities.length} className="scroll-mt-32 space-y-4">
   <h2 id="place-amenities" className={H2}>{t('Comodidades y más','Amenities and more')}</h2>
   <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">{amenities.map(a=><li key={a.key} data-place-amenity={a.key} className="flex min-h-12 items-center gap-3 border-b border-[#f1f4f7] text-[15px] font-medium text-[#1f2a3d]">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eaf7fd] text-[#0083b0]">{createElement(iconOf(a.icon),{'aria-hidden':true,className:'h-[18px] w-[18px]'})}</span>{en?a.en:a.es}</li>)}</ul>
  </section>}
  {slots.reservation}
  {brand&&brandAbout&&<section id="acerca" aria-labelledby="place-about" data-place-brand-about={brand.slug} className="scroll-mt-32 space-y-3">
   <h2 id="place-about" className={H2}>{t(`Acerca de ${brand.name}`,`About ${brand.name}`)}</h2>
   <p className="max-w-2xl text-[15px] leading-7 text-[#334155]">{brandAbout}</p>
  </section>}
  {/* Reviews at a glance (no hooks: the full section lives in the Reseñas tab). */}
  {rated&&<a href="#resenas" className={`flex items-center gap-4 rounded-2xl bg-gradient-to-br from-[#f3f9fc] to-white p-4 ring-1 ring-[#e5eef4] transition-shadow hover:shadow-md ${ring}`}>
   <span className="text-[40px] font-extrabold leading-none tracking-tight text-[#162543]">{ratingNumber(place.rating.average!)}</span>
   <span className="min-w-0 flex-1"><Stars value={place.rating.average!}/><span className="mt-1 block text-[13.5px] text-[#526277]">{t(`Según ${reviewsLabel(place.rating.count,en)}`,`Based on ${reviewsLabel(place.rating.count,en)}`)}</span></span>
   <span className="shrink-0 text-[13.5px] font-bold text-[#0083b0]">{t('Ver reseñas','See reviews')}</span>
  </a>}
  {slots.events}
  {slots.branches}
 </>;
 const moreTab=<section id="mas" aria-labelledby="place-more" data-place-more className="scroll-mt-32 space-y-4">
  <h2 id="place-more" className={H2}>{t('Más sobre este lugar','More about this place')}</h2>
  <ul className="divide-y divide-[#eef2f6] overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white text-[15px]">
   {place.website&&<li><a className={`flex min-h-14 items-center gap-3 px-4 font-semibold text-[#162543] hover:bg-[#f7fafc] ${ring}`} href={place.website} rel="noopener noreferrer nofollow" target="_blank"><Globe aria-hidden="true" className="h-5 w-5 text-[#0083b0]"/><span className="flex-1">{t('Sitio web de la empresa','Business website')}</span><ExternalLink aria-hidden="true" className="h-4 w-4 text-slate-400"/></a></li>}
   {brand&&<li><a className={`flex min-h-14 items-center gap-3 px-4 font-semibold text-[#162543] hover:bg-[#f7fafc] ${ring}`} href={`${prefix}/marca/${brand.slug}`}><Store aria-hidden="true" className="h-5 w-5 text-[#0083b0]"/><span className="flex-1">{t(`Todas las sucursales de ${brand.name}`,`All ${brand.name} branches`)}</span><ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400"/></a></li>}
   {sectionHref&&<li><a className={`flex min-h-14 items-center gap-3 px-4 font-semibold text-[#162543] hover:bg-[#f7fafc] ${ring}`} href={sectionHref}><MapPin aria-hidden="true" className="h-5 w-5 text-[#0083b0]"/><span className="flex-1">{t(`Más lugares en ${vertical}`,`More places in ${vertical}`)}</span><ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400"/></a></li>}
   <li><a href="#reportar" data-place-suggest-more className={`flex min-h-14 items-center gap-3 px-4 font-semibold text-[#162543] hover:bg-[#f7fafc] ${ring}`}><PenLine aria-hidden="true" className="h-5 w-5 text-[#0083b0]"/><span className="flex-1">{t('Sugerir un cambio','Suggest an edit')}</span><ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400"/></a></li>
  </ul>
 </section>;
 const offerLabel=offerTabLabel(place.vertical.id,en);
 const tabs:PlaceTab[]=[
  {id:'info',label:t('Información','Information'),anchors:['horario','comodidades','acerca','eventos','sucursales','place-reservations'],content:infoTab},
  ...(slots.offer?[{id:'offer',label:offerLabel,anchors:['precios'],content:<div className="space-y-6">{slots.offer}</div>}]:[]),
  ...(!reviews?[]:[{id:'reviews',label:place.rating.count>0?`${t('Reseñas','Reviews')} (${place.rating.count})`:t('Reseñas','Reviews'),anchors:['resenas','escribir-resena'],content:slots.reviews??<section id="resenas" className="space-y-3"><h2 className={H2}>{t('Reseñas','Reviews')}</h2><p className={BIZ.sub} data-place-reviews-empty>{t('Todavía no hay reseñas.','No reviews yet.')}</p></section>}]),
  ...(photos.length>0?[{id:'photos',label:`${t('Fotos','Photos')} (${photos.length})`,anchors:['fotos'],content:<section id="fotos" aria-labelledby="place-photos" data-place-photos className="scroll-mt-32 space-y-4">
   <h2 id="place-photos" className={H2}>{t('Fotos','Photos')} <span className="font-semibold text-[#94a3b8]">{photos.length}</span></h2>
   <PlacePhotoGallery en={en} placeName={place.name} photos={photos}/></section>}]:[]),
  // «Preguntar» left the page (owner 2026-11-26): reviews already answer what people ask.
  {id:'more',label:t('Más','More'),anchors:['mas'],content:moreTab},
 ];
 // Gas stations lead with their prices; every other section opens on «Información».
 const defaultTab=place.vertical.id==='fuel'&&slots.offer?'offer':'info';

 const nameBadge=trusted?<span data-place-verification={place.verificationLevel} className="ml-2 inline-flex -translate-y-1 align-middle text-[#14b2ec] [filter:drop-shadow(0_1px_6px_rgba(0,0,0,0.35))]"><VerifiedSeal className="h-6 w-6 sm:h-7 sm:w-7" label={verification}/></span>:null;
 const dot=<span aria-hidden="true" className="text-white/50"> · </span>;
 const reviewable=published&&reviews;
 const firstId=chipActions.some(c=>c.action.id==='reserve')?'reserve':reviewable?'review':chipActions[0]?.action.id;
 const chipClass=(id:string)=>id===firstId?PAGE_CHIP_PRIMARY:PAGE_CHIP;
 const reserveChips=chipActions.filter(c=>c.action.id==='reserve').map(c=><ActionButton key={c.action.id} action={c.action} slug={place.slug} locale={locale} className={chipClass(c.action.id)}>{c.icon}{c.label}</ActionButton>);
 const reviewChip=reviewable?<a href="#escribir-resena" data-place-write-review data-place-action="review" className={chipClass('review')}><Star aria-hidden="true" className="h-4 w-4 shrink-0"/>{t('Reseñar','Review')}</a>:null;
 const contactChips=chipActions.filter(c=>c.action.id!=='reserve').map(c=><ActionButton key={c.action.id} action={c.action} slug={place.slug} locale={locale} className={chipClass(c.action.id)}>{c.icon}{c.label}</ActionButton>);
 const chips=<PlaceChipRail className={CHIP_ROW} data-place-actions-bar data-place-quick-actions={chipActions.map(c=>c.action.id).join(' ')}>
  {/* Order (owner 2026-11-26): Reservar first where it exists, then Reseñar, then contact, then Waze and Maps. */}
  {reserveChips}{reviewChip}{contactChips}
  {maps&&<a href={maps.waze} data-place-action="waze" target="_blank" rel="noopener noreferrer" className={PAGE_CHIP}><WazeIcon className="h-4 w-4 shrink-0"/>Waze</a>}
  {maps&&<a href={maps.google} data-place-action="maps" target="_blank" rel="noopener noreferrer" className={PAGE_CHIP}><GoogleMapsIcon className="h-4 w-4 shrink-0"/>Maps</a>}
  {orderAction&&<ActionButton action={orderAction} slug={place.slug} locale={locale} className={PAGE_CHIP}>{actionIcon('order','h-4 w-4 shrink-0')}{orderAction.label}</ActionButton>}
  {site&&<ActionButton action={site} slug={place.slug} locale={locale} className={PAGE_CHIP}>{actionIcon('website','h-4 w-4 shrink-0')}{site.label}</ActionButton>}
  {/* Guardar, Compartir, Agregar fotos: in the bar's «…» on phones (like the professional profile), inline on computers. */}
  <PlaceMoreMenu title={place.name} closeLabel={t('Cerrar','Close')} desktop={<>{saveSlot}{published&&<ShareButton title={place.name} locale={locale} suggest sheet className={PAGE_CHIP}/>}{photoSlot}</>}>
   {saveSlot}
   {published&&<ShareButton title={place.name} locale={locale} suggest sheet className={PAGE_CHIP}/>}
   {photoSlot}
  </PlaceMoreMenu>
 </PlaceChipRail>;

 // Compact title of the sticky tab bar (decorative copy of the hero: no hooks, no heading).
 const compact=<div className="flex items-center gap-2 pb-0.5 pt-2.5">
  <p className="min-w-0 truncate text-[15px] font-extrabold text-[#162543]">{place.name}</p>
  {rated&&<p className="flex shrink-0 items-center gap-1 text-[12.5px]"><Star className="h-3.5 w-3.5 fill-[#ff9b32] text-[#ff9b32]"/><span className="font-bold text-[#162543]">{ratingNumber(place.rating.average!)}</span><span className="text-[#68778d]">({place.rating.count})</span></p>}
  {statusText&&<p className={`shrink-0 text-[12.5px] font-bold ${statusText.open?'text-[#047857]':'text-[#b91c1c]'}`}>· {statusText.label.replace(/ ahora$/,'').replace(/ now$/,'')}</p>}
 </div>;

 const hasPhotos=photos.length>0;
 return <main id="contenido" data-place-page={place.slug} className="mx-auto max-w-7xl px-4 pb-6 text-[#162543] sm:px-6 lg:px-8 lg:pt-6">
  <nav aria-label={t('Ruta de navegación','Breadcrumb')} className="mb-4 hidden pt-4 text-sm text-[#526277] sm:block lg:pt-0">
   <ol className="flex flex-wrap items-center gap-1"><li><a className={`hover:underline ${ring}`} href={en?'/en':'/'}>{t('Inicio','Home')}</a></li><li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5"/></li>
    <li>{sectionHref?<a className={`hover:underline ${ring}`} href={sectionHref}>{vertical}</a>:vertical}</li><li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5"/></li><li aria-current="page" className="min-w-0 truncate text-[#162543]">{place.name}</li></ol>
  </nav>

  {/* ── HERO: real photos (or the blurred section photo) with the identity on a navy veil ── */}
  <header data-place-header data-place-hero className={`relative isolate -mx-4 overflow-hidden bg-[#162543] sm:-mx-6 lg:mx-0 lg:rounded-3xl ${hasPhotos?'h-[340px] sm:h-[400px] lg:h-[440px]':'min-h-[250px] sm:min-h-[300px] lg:min-h-[320px]'}`}>
   {hasPhotos?<PlacePhotoGallery variant="hero" en={en} placeName={place.name} photos={photos}/>
    :<div aria-hidden="true" className="absolute inset-0 -z-10">
     {/* eslint-disable-next-line @next/next/no-img-element -- licence-free section photo (Unsplash CDN), decorative */}
     {backdrop&&<img src={backdrop} alt="" decoding="async" fetchPriority="high" className="h-full w-full scale-110 object-cover opacity-70 blur-[6px] saturate-[.8]"/>}
     <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,rgba(0,159,217,0.45),transparent_55%)]"/>
    </div>}
   <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${hasPhotos?'bg-gradient-to-t from-[#0b1424]/95 via-[#0b1424]/40 to-transparent':'bg-gradient-to-t from-[#0b1424]/90 via-[#162543]/55 to-[#162543]/20'}`}/>
   <div className={`pointer-events-none flex flex-col justify-end px-4 pb-5 sm:px-8 sm:pb-7 ${hasPhotos?'absolute inset-x-0 bottom-0 sm:pr-60':'relative min-h-[inherit] pt-16'}`}>
    <p className="mb-2 flex flex-wrap items-center gap-1.5" data-place-tags>
     {sectionHref?<a href={sectionHref} className={`pointer-events-auto inline-flex h-7 items-center rounded-full bg-white/15 px-3 text-[12px] font-bold text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/25 ${ring}`}>{vertical}</a>
      :<span className="inline-flex h-7 items-center rounded-full bg-white/15 px-3 text-[12px] font-bold text-white ring-1 ring-white/25 backdrop-blur">{vertical}</span>}
     {kind&&<span data-place-kind={String(place.attributes.kind)} className="inline-flex h-7 items-center rounded-full bg-white/15 px-3 text-[12px] font-bold text-white ring-1 ring-white/25 backdrop-blur">{kind}</span>}
     {/* Imported / unverified listings: a quiet «No reclamado» (sources in Terms 13.1 and the footer line). */}
     {!trusted&&<span data-place-verification={place.verificationLevel} className="inline-flex h-7 items-center rounded-full bg-black/25 px-3 text-[12px] font-semibold text-white/85 ring-1 ring-white/15">{verification}</span>}
     {trusted&&<span className="sr-only">{verification}</span>}
    </p>
    <h1 data-testid="place-name" className="break-words text-[28px] font-extrabold leading-[1.1] tracking-tight text-white [text-shadow:0_2px_16px_rgba(0,0,0,0.35)] sm:text-[40px] lg:text-[44px]">{nameBadge?(()=>{const i=place.name.trimEnd().lastIndexOf(' ');return <>{i>0?place.name.slice(0,i+1):''}<span className="whitespace-nowrap">{i>0?place.name.slice(i+1):place.name}{nameBadge}</span></>;})():place.name}</h1>
    {reviews&&(rated
     ?<p className="mt-2.5 flex items-center gap-2" data-rating-line={place.rating.count}><a href="#resenas" aria-label={ratingAria} className={`pointer-events-auto inline-flex items-center gap-2 rounded ${ring}`}>
      <Stars value={place.rating.average!}/><span className="text-[16px] font-extrabold text-white">{ratingNumber(place.rating.average!)}</span><span className="text-[14px] font-medium text-white/80 underline-offset-2 hover:underline">({reviewsLabel(place.rating.count,en)})</span></a></p>
     :<p className="mt-2.5 text-[14px] font-medium text-white/80" data-rating-line="none">{t('Sin reseñas todavía','No reviews yet')}</p>)}
    {(cuisines.length>0||priceLevel)&&<p className="mt-1.5 text-[14px] font-semibold text-white/90">
     {priceLevel&&<span data-place-price-level className="font-extrabold text-[#7fd6f5]" aria-label={t(`Nivel de precio ${priceLevel.length} de 4`,`Price level ${priceLevel.length} of 4`)}>{priceLevel}</span>}
     {cuisines.slice(0,3).map((c,i)=><span key={c}>{i||priceLevel?dot:null}{c}</span>)}</p>}
    {place.status==='closed_permanently'&&<p data-place-closed className="mt-2 inline-flex w-fit rounded-full bg-red-600 px-3 py-1 text-[12.5px] font-bold text-white">{t('Cerrado definitivamente','Permanently closed')}</p>}
    {statusText&&<p className="mt-2 text-[14px] font-semibold leading-snug" data-place-open-status={status!.state} data-open={statusText.open?'open':'closed'}>
     <span className={`inline-flex items-center gap-1.5 font-extrabold ${statusText.open?'text-[#6ee7b7]':'text-[#fca5a5]'}`}><span aria-hidden="true" className={`h-2 w-2 rounded-full ${statusText.open?'bg-[#34d399]':'bg-[#f87171]'}`}/>{statusText.label}</span>
     {statusText.detail&&<span className="text-white/85"> · {statusText.detail}</span>}
     {' '}<a href="#horario" className={`pointer-events-auto ml-1 text-[13px] font-bold text-white underline decoration-white/50 underline-offset-2 hover:decoration-white ${ring}`}>{t('Ver horario','See hours')}</a></p>}
   </div>
  </header>

  <div className="grid grid-cols-1 gap-x-10 gap-y-6 pt-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:pt-6">
   {/* ── Under the hero: address, actions, description, permit notes ── */}
   <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
    {(address||area)&&<p className="flex items-start gap-1.5 text-[14px] font-medium text-[#526277]"><MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#0083b0]"/><span className="min-w-0">{address?`${address}${area?` · ${area}`:''}`:area}</span></p>}
    {phone?.kind==='other'&&<p data-place-phone-other={phone.reason} className="text-sm text-slate-700"><span className="font-semibold">{t('Otros datos:','Other details:')}</span>{' '}
     {phone.reason==='foreign'?t('teléfono registrado de otro país (sin verificar)','phone registered in another country (not verified)'):t('teléfono registrado con un formato que no es costarricense válido (sin verificar)','phone on file not in a valid Costa Rican format (not verified)')}: <span className="whitespace-nowrap">{phone.display}</span></p>}
    {published&&chips}
    {summary&&<p data-place-summary className="max-w-2xl text-[15px] leading-7 text-[#334155]">{summary}</p>}
    {place.vertical.id==='pharmacy'&&(place.verificationLevel==='license_verified'
     ?<p data-pharmacy-license="verified" className="flex items-center gap-2 text-sm font-semibold text-[#047857]"><ShieldCheck aria-hidden="true" className="h-4 w-4"/>{t('ContrataCR verificó el permiso de funcionamiento de esta farmacia.','ContrataCR verified this pharmacy\'s operating license.')}</p>
     :<p data-pharmacy-license="unverified" className="text-sm text-slate-700">{t('Permiso sin verificar por ContrataCR.','License not verified by ContrataCR.')}</p>)}
    {section?.policy.health&&(place.verificationLevel==='license_verified'
     ?<p data-health-permit="verified" className="flex items-center gap-2 text-sm font-semibold text-[#047857]"><ShieldCheck aria-hidden="true" className="h-4 w-4"/>{t('ContrataCR verificó la habilitación de este establecimiento.','ContrataCR verified this facility\'s health permit.')}</p>
     :<p data-health-permit="unverified" className="text-sm text-slate-700">{t('Habilitación sin verificar por ContrataCR.','Permit not verified by ContrataCR.')}
      {place.vertical.id==='health'?` ${t('En una emergencia llame al 9-1-1.','In an emergency, call 9-1-1.')}`:''}</p>)}
    {brand&&<p data-place-brand={brand.slug} className="text-[14px] text-[#334155]">{t('Sucursal de','Branch of')}{' '}
     <a className={BIZ.link} href={`${prefix}/marca/${brand.slug}`}>{brand.name}</a>
     {brand.branches>1&&<>{' · '}<a className={BIZ.link} href={`${prefix}/marca/${brand.slug}#sucursales`}>{t(`ver las ${brand.branches} sucursales`,`see all ${brand.branches} branches`)}</a></>}</p>}
   </div>

   {/* Tabs before the side card in the DOM: on phones they follow the header; from lg the card is the right column. */}
   <div className="min-w-0 lg:col-start-1 lg:row-start-2">
    <PlaceTabs tabs={tabs} label={t('Secciones de la empresa','Business sections')} defaultTab={defaultTab} compact={compact}/>
   </div>

   <aside aria-label={t('Contacto y ubicación','Contact and location')} className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
    <div className="lg:sticky lg:top-24">{sideCard}</div>
   </aside>
  </div>

  {slots.similar&&<div className="mt-12 border-t border-[#eef2f6] pt-8">{slots.similar}</div>}

  <footer className="mt-8 flex flex-col gap-1 text-sm text-slate-600 lg:mt-10 lg:border-t lg:border-[#e8edf2] lg:pt-6">
   {/* Data credit (owner 2026-11-26): one small line. The OSM licence (ODbL) asks for a visible credit where its data is
       shown; the full detail lives in the Terms. Places without an external source show nothing. */}
   {place.sources.length>0&&<p data-place-sources className="text-[11.5px] text-slate-400">{t('Datos','Data')}: {place.sources.map((s,i)=><span key={s.name} data-place-source={s.name}>{i?', ':''}{s.url?<a className={`hover:underline ${ring}`} href={s.url} rel="noopener noreferrer" target="_blank">{bilingual(s.attribution,en)}</a>:bilingual(s.attribution,en)}</span>)}</p>}
   <PlaceReportForm slug={place.slug} locale={locale}/>
  </footer>
 </main>;
}
