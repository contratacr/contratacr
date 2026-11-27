import {createElement,type ReactNode} from 'react';
import {cn} from '@/lib/utils';
import {RecordRecentVisit} from '@/components/mobile/record-recent-visit';
import {AccionesAlPie} from '@/components/ui/acciones-al-pie';
import {ArrowLeftRight,Banknote,Bath,CalendarCheck,CalendarClock,Car,Check,ChevronRight,CircleParking,Clock,Coffee,CreditCard,Droplets,ExternalLink,FileText,Fuel,Globe,Phone,Landmark,Leaf,MapPin,PawPrint,PenLine,Percent,Pill,ShieldCheck,ShoppingBag,Siren,Smartphone,Star,Store,Truck,Waves,Wifi,Wind,Wrench,Zap,type LucideIcon} from 'lucide-react';
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
import {BIZ,HeroTile,ratingNumber,reviewsLabel,ring} from './biz-ui';
import {ProfileIdentityName,profileIdentityAvatarClass} from '@/components/professionals/profile-identity-name';
import {PlaceTabs,type PlaceTab} from './place-tabs';
import {VerifiedSeal} from '@/components/ui/verified-seal';
import {ShareButton} from './share-button';
import {PlaceMoreMenu} from './place-more-menu';
import {mapLinks,placeSideActions,resolvePlaceAction,type PlaceAction,type PlaceActionInput} from '@/lib/directory/place-actions';
import {ActionButton,actionIcon} from './place-action-buttons';
import {PlaceChipRail} from './place-chip-rail';
import {WhatsAppLogo} from '@/components/ui/whatsapp-logo';
import {GoogleMapsIcon,WazeIcon} from '@/components/ui/nav-app-icons';

/**
 * Canonical page of a place, /lugar/<slug> (owner 2026-11-26: «que se vea como el perfil del profesional de
 * producción y solo agregue lo que un negocio necesita»). It reuses the CLASSIC professional profile
 * (profile-client.tsx with the directory off, i.e. production) piece by piece:
 * - identity card: same container, round avatar (first approved photo, else the section tile; never a stock photo),
 *   ProfileIdentityName with the verified seal, «★ 4.6 125 reseñas · ₡₡», «Restaurante · Escazú» and, new for a
 *   business, today's open status. On phones the card ends with the two contact buttons of the profile (WhatsApp first
 *   when the place has one, else Llamar, then Cómo llegar) and a row of the business extras (Reservar, Reseñar, Pedir,
 *   Sitio web; Guardar, Compartir and Agregar fotos sit in the bar's «…» on phones, inline from lg);
 * - the same tab card (Menú/Precios only when the place has them, Reseñas, Fotos with the gallery, Información with
 *   hours, map + Google Maps/Waze, phone, website, amenities, reservations, events, branches and the claim box);
 * - from lg the same right contact column (sticky card with the place's actions, address and claim).
 * Data rules unchanged: only a valid Costa Rican number becomes «Llamar»; pharmacies/health keep the permit line;
 * hours from OSM keep «Horario según OpenStreetMap.»; nothing is shown that the data does not contain. The footer keeps
 * the data credit (© OpenStreetMap, ODbL) and «Reportar un problema o pedir el retiro» (Ley 10.946 notice channel).
 */
/** Source labels are stored bilingual («Español / English»); show only the page language. */
const bilingual=(text:string,en:boolean)=>{const parts=text.split(' / ');return parts.length===2?parts[en?1:0]!.trim():text;};
const AMENITY_ICONS:Record<string,LucideIcon>={ArrowLeftRight,Banknote,Bath,CalendarCheck,CalendarClock,Car,Clock,Coffee,CreditCard,Droplets,FileText,Fuel,Landmark,Leaf,CircleParking,PawPrint,Percent,Pill,ShoppingBag,Siren,Smartphone,Store,Truck,Waves,Wifi,Wind,Wrench,Zap};
const iconOf=(name:string)=>AMENITY_ICONS[name]??Check;
/** Extras row of the identity card (Reservar, Reseñar, Pedir, Sitio web, Guardar…): slides sideways on phones, wraps from lg. */
const CHIP_ROW='scrollbar-none -mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 py-0.5 [touch-action:pan-x_pan-y] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0';
/** The professional profile's secondary white pill (professional-schedule.tsx secondaryContactBase), one step smaller. */
export const PAGE_CHIP='inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-[#d7e1ea] bg-white px-4 text-[13px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
/** Contact buttons of the card on phones: the professional profile's bar buttons (48 px, 16 px semibold). */
// Bottom bar buttons: the same as the professional profile's bar (professional-schedule.tsx: green WhatsApp, white
// bordered second button, 48 px, text-base semibold, two equal halves).
const BAR_BTN='inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-base font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const BAR_WA=`${BAR_BTN} ccr-boton-whatsapp text-white`;
const BAR_PRIMARY=`${BAR_BTN} bg-[#009FD9] text-white hover:bg-[#0089bb]`;
const BAR_SECONDARY=`${BAR_BTN} border border-[#d7e1ea] bg-white text-[#162543] hover:border-[#b9c8d6] hover:bg-[#f6f9fb]`;
const H2=BIZ.h2;


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
 // Identity card actions (owner 2026-11-26, «igual que el profesional»): two contact buttons on phones — WhatsApp first
 // when the place has one (its number, else the WhatsApp «Pedir» the team recorded), then Llamar, then Cómo llegar — and
 // a row with what a business adds: Reservar, Reseñar, Pedir (web/phone), Sitio web and the page tools. Only what exists.
 const pick=(id:Parameters<typeof resolvePlaceAction>[0])=>published?resolvePlaceAction(id,actionInput):null;
 const reserve=reservation?pick('reserve'):null;
 const waOrder=order?.channel==='whatsapp'?pick('order'):null;
 const wa=pick('whatsapp')??waOrder;
 const call=pick('call');
 const go=pick('directions');
 // Waze and Maps chips stay in the header row; the bottom bar has the one-tap «Cómo llegar».
 const goChip=go;
 const orderAction=order&&order.channel!=='whatsapp'?pick('order'):null;
 const site=pick('website');
 // Short description from typed data only (never invented): «<kind> en <zona>. Cocina: …».
 const summary=[kind&&area?t(`${kind} en ${place.address.adminArea2??area}.`,`${kind} in ${place.address.adminArea2??area}.`):null,cuisines.length?t(`Cocina: ${cuisines.slice(0,3).join(', ')}.`,`Cuisine: ${cuisines.slice(0,3).join(', ')}.`):null].filter(Boolean).join(' ')||(brandAbout??'');

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
  <a className={PAGE_CHIP} href={directions.google} rel="noopener noreferrer" target="_blank"><GoogleMapsIcon className="h-4 w-4 shrink-0"/>Google Maps</a>
  <a className={PAGE_CHIP} href={directions.waze} rel="noopener noreferrer" target="_blank"><WazeIcon className="h-4 w-4 shrink-0"/>Waze</a>
  <a className={PAGE_CHIP} href={directions.apple} rel="noopener noreferrer" target="_blank">Apple Maps</a></div>;


 // Right column from lg (the professional profile's contact column: same card, sticky): the place's actions, address,
 // claim and «Sugerir un cambio». On phones the contact actions are in the identity card, so only the claim box and
 // «Sugerir un cambio» show, under the tabs and only while «Información» is open (that is where they belong).
 const sideCard=<div className="overflow-hidden lg:rounded-2xl lg:border lg:border-[#e5e7eb] lg:bg-white lg:shadow-sm" data-place-side-card>
  <div className="flex flex-col gap-1.5 p-5 max-lg:hidden">
   <p className="text-[17px] font-extrabold leading-tight text-[#162543]">{t('Contacte a esta empresa','Contact this business')}</p>
   {area&&<p className="flex items-center gap-1 text-[12.5px] font-semibold text-[#5f6f86]"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/><span className="min-w-0">{area}</span></p>}
   {priceNote&&<p data-place-price-note className="text-xl font-bold leading-tight text-[#009FD9]">{priceNote}</p>}
   <div className="mt-3 flex flex-col gap-2" data-place-side-actions={sideActions.map(x=>x.id).join(' ')}>
    {sideActions.map((x,i)=><ActionButton key={x.id} action={x} slug={place.slug} locale={locale} className={cn(i===0?(x.id==='whatsapp'?cn(BIZ.primary,'ccr-boton-whatsapp text-white'):BIZ.primary):BIZ.secondary,'h-12 w-full text-[15px] font-bold')}>
     {x.id==='whatsapp'?<WhatsAppLogo className="h-5 w-5 shrink-0"/>:actionIcon(x.id,'h-5 w-5')}{x.label}{x.id==='call'&&phone?.kind==='cr'&&<>{' '}<span className="whitespace-nowrap">{phone.display}</span></>}
     {x.id==='order'&&order&&<span className="text-sm font-normal">{order.channel==='whatsapp'?t('por WhatsApp','on WhatsApp'):order.channel==='web'?t('en su sitio','on its website'):t('por teléfono','by phone')}</span>}</ActionButton>)}
   </div>
   {address&&<p className="mt-2 text-center text-[13px] text-[#68778d]">{address}</p>}
  </div>
  {slots.claim&&<div className="lg:border-t lg:border-[#eef2f6]">{slots.claim}</div>}
  <div className="border-[#eef2f6] max-lg:mt-2 max-lg:px-1 lg:border-t lg:py-1.5 lg:text-center"><a href="#reportar" data-place-suggest className={`inline-flex min-h-11 items-center gap-2 text-[13.5px] ${BIZ.link}`}><PenLine aria-hidden="true" className="h-4 w-4"/>{t('Sugerir un cambio','Suggest an edit')}</a></div>
 </div>;

 // ── «Información» tab: about (typed data only), location and hours, contact rows, amenities, reservations, brand, events, branches ──
 const rowClass=`flex min-h-14 items-center gap-3 px-4 font-semibold text-[#162543] hover:bg-[#f7fafc] ${ring}`;
 const about=(summary||phone?.kind==='other'||place.vertical.id==='pharmacy'||section?.policy.health||brand)&&<section aria-label={t('Acerca de este lugar','About this place')} data-place-about className="space-y-2">
  {summary&&<p data-place-summary className="max-w-2xl text-[15px] leading-7 text-[#334155]">{summary}</p>}
  {phone?.kind==='other'&&<p data-place-phone-other={phone.reason} className="text-sm text-slate-700"><span className="font-semibold">{t('Otros datos:','Other details:')}</span>{' '}
   {phone.reason==='foreign'?t('teléfono registrado de otro país (sin verificar)','phone registered in another country (not verified)'):t('teléfono registrado con un formato que no es costarricense válido (sin verificar)','phone on file not in a valid Costa Rican format (not verified)')}: <span className="whitespace-nowrap">{phone.display}</span></p>}
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
 </section>;
 const infoTab=<>
  {slots.top&&<div className="space-y-4">{slots.top}</div>}
  {about}
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
  <section id="mas" aria-labelledby="place-more" data-place-more className="scroll-mt-32 space-y-4">
   <h2 id="place-more" className={H2}>{t('Contacto y más','Contact and more')}</h2>
   <ul className="divide-y divide-[#eef2f6] overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white text-[15px]">
    {call&&<li><ActionButton action={call} slug={place.slug} locale={locale} className={rowClass}><Phone aria-hidden="true" className="h-5 w-5 text-[#0083b0]"/><span className="flex-1">{t('Teléfono','Phone')}</span>{phone?.kind==='cr'&&<span className="whitespace-nowrap tabular-nums text-[#526277]">{phone.display}</span>}</ActionButton></li>}
    {place.website&&<li><a className={rowClass} href={place.website} rel="noopener noreferrer nofollow" target="_blank"><Globe aria-hidden="true" className="h-5 w-5 text-[#0083b0]"/><span className="flex-1">{t('Sitio web de la empresa','Business website')}</span><ExternalLink aria-hidden="true" className="h-4 w-4 text-slate-400"/></a></li>}
    {brand&&<li><a className={rowClass} href={`${prefix}/marca/${brand.slug}`}><Store aria-hidden="true" className="h-5 w-5 text-[#0083b0]"/><span className="flex-1">{t(`Todas las sucursales de ${brand.name}`,`All ${brand.name} branches`)}</span><ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400"/></a></li>}
    {sectionHref&&<li><a className={rowClass} href={sectionHref}><MapPin aria-hidden="true" className="h-5 w-5 text-[#0083b0]"/><span className="flex-1">{t(`Más lugares en ${vertical}`,`More places in ${vertical}`)}</span><ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400"/></a></li>}
    <li><a href="#reportar" data-place-suggest-more className={rowClass}><PenLine aria-hidden="true" className="h-5 w-5 text-[#0083b0]"/><span className="flex-1">{t('Sugerir un cambio','Suggest an edit')}</span><ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400"/></a></li>
   </ul>
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
  {slots.events}
  {slots.branches}
 </>;

 // ── Tabs (only the ones with content), in the approved order: Menú/Precios · Reseñas · Fotos · Información ──
 const offerLabel=offerTabLabel(place.vertical.id,en);
 const tabs:PlaceTab[]=[
  ...(slots.offer?[{id:'offer',label:offerLabel,anchors:['precios'],content:<div className="space-y-6">{slots.offer}</div>}]:[]),
  ...(!reviews?[]:[{id:'reviews',label:place.rating.count>0?`${t('Reseñas','Reviews')} (${place.rating.count})`:t('Reseñas','Reviews'),anchors:['resenas','escribir-resena'],content:slots.reviews??<section id="resenas" className="space-y-3"><h2 className={H2}>{t('Reseñas','Reviews')}</h2><p className={BIZ.sub} data-place-reviews-empty>{t('Todavía no hay reseñas.','No reviews yet.')}</p></section>}]),
  ...(photos.length>0?[{id:'photos',label:`${t('Fotos','Photos')} (${photos.length})`,anchors:['fotos'],content:<section id="fotos" aria-labelledby="place-photos" data-place-photos className="scroll-mt-32 space-y-4">
   <h2 id="place-photos" className={H2}>{t('Fotos','Photos')} <span className="font-semibold text-[#94a3b8]">{photos.length}</span></h2>
   <PlacePhotoGallery en={en} placeName={place.name} photos={photos}/></section>}]:[]),
  // «Más» merged into «Información» (owner layout 2026-11-26: website, phone, branches and «Sugerir un cambio» live there).
  {id:'info',label:t('Información','Information'),anchors:['horario','comodidades','acerca','eventos','sucursales','place-reservations','mas'],content:infoTab},
 ];
 // Gas stations lead with their prices; every other section opens on «Información» (hours, map, contact).
 const defaultTab=place.vertical.id==='fuel'&&slots.offer?'offer':'info';

 // ── Identity card (the classic professional profile card) ──
 const nameBadge=trusted?<span data-place-verification={place.verificationLevel} className="inline-flex text-[#14b2ec]"><VerifiedSeal className="h-5 w-5 sm:h-6 sm:w-6" label={verification}/></span>:null;
 const hasPhotos=photos.length>0;
 const avatarInner=hasPhotos
  // eslint-disable-next-line @next/next/no-img-element -- approved place photo (R2), painted by the server like the professional avatar
  ?<img src={photos[0]!.url} alt={photos[0]!.caption??place.name} loading="eager" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full bg-white object-cover"/>
  :<HeroTile verticalId={place.vertical.id} className="absolute inset-0 h-full w-full" iconClass="h-8 w-8 sm:h-10 sm:w-10"/>;
 const avatarClass=`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#EBF5FB] ${profileIdentityAvatarClass}`;
 const avatar=hasPhotos
  ?<a href="#fotos" data-place-avatar="photo" aria-label={t(`Ver las fotos de ${place.name}`,`See photos of ${place.name}`)} className={cn(avatarClass,ring,'sm:col-start-1 sm:row-start-1 sm:row-span-2 sm:self-center lg:row-span-1')}>{avatarInner}</a>
  :<span data-place-avatar="section" className={cn(avatarClass,'sm:col-start-1 sm:row-start-1 sm:row-span-2 sm:self-center lg:row-span-1')}>{avatarInner}</span>;
 const kindLine=[kind??vertical,place.address.adminArea2??place.address.adminArea1??null].filter(Boolean);
 // Owner 2026-11-27, «como en prod con los perfiles»: on phones the contact buttons sit in the fixed bar at the bottom
 // (the same AccionesAlPie strip as the professional profile): WhatsApp, Llamar and Cómo llegar, only those that exist.
 // Two buttons like the professional profile: WhatsApp and Llamar; Cómo llegar fills in when one is missing (Waze and
 // Maps chips stay in the card).
 const barActions=[wa,call,go].filter((x):x is PlaceAction=>!!x).slice(0,2);
 const barLabel=(x:PlaceAction)=>x===wa?'WhatsApp':x.id==='call'?t('Llamar','Call'):x.id==='directions'?t('Cómo llegar','Directions'):x.short;
 const contactBar=published&&barActions.length>0&&<AccionesAlPie className="lg:hidden max-sm:px-4 max-sm:pt-2.5 max-sm:pb-[calc(env(safe-area-inset-bottom)+0.75rem)] max-sm:shadow-[0_-8px_24px_rgba(22,37,67,0.08)] sm:mt-4">
  <div className="flex w-full gap-2" data-place-contact-buttons={barActions.map(x=>x.id).join(' ')}>
   {barActions.map((x,i)=><ActionButton key={x.id} action={x} slug={place.slug} locale={locale} className={x===wa?BAR_WA:i===0?BAR_PRIMARY:BAR_SECONDARY}>
    {x===wa?<WhatsAppLogo className="h-5 w-5 shrink-0"/>:actionIcon(x.id,'h-5 w-5 shrink-0')}<span className="truncate">{barLabel(x)}</span></ActionButton>)}
  </div>
 </AccionesAlPie>;
 const extras=<PlaceChipRail className={CHIP_ROW} data-place-quick-actions={[reserve?.id,goChip?'waze maps':null,orderAction?.id,site?.id].filter(Boolean).join(' ')}>
  {reserve&&<ActionButton action={reserve} slug={place.slug} locale={locale} className={PAGE_CHIP}><CalendarCheck aria-hidden="true" className="h-4 w-4 shrink-0"/>{t('Reservar','Reserve')}</ActionButton>}
  {/* «Reseñar» lives only inside Reseñas (owner 2026-11-26), like the professional profile. */}
  {/* Plain links (a dropdown would be clipped by the sliding row): Waze and Google Maps, phones only (the side card has «Cómo llegar» from lg). */}
  {goChip?.maps&&<a href={goChip.maps.waze} data-place-action="waze" target="_blank" rel="noopener noreferrer" className={cn(PAGE_CHIP,'lg:hidden')}><WazeIcon className="h-4 w-4 shrink-0"/>Waze</a>}
  {goChip?.maps&&<a href={goChip.maps.google} data-place-action="maps" target="_blank" rel="noopener noreferrer" className={cn(PAGE_CHIP,'lg:hidden')}><GoogleMapsIcon className="h-4 w-4 shrink-0"/>Maps</a>}
  {orderAction&&<ActionButton action={orderAction} slug={place.slug} locale={locale} className={PAGE_CHIP}>{actionIcon('order','h-4 w-4 shrink-0')}{orderAction.label}</ActionButton>}
  {site&&<ActionButton action={site} slug={place.slug} locale={locale} className={PAGE_CHIP}>{actionIcon('website','h-4 w-4 shrink-0')}{site.label}</ActionButton>}
  {/* Guardar, Compartir, Agregar fotos: in the bar's «…» on phones (like the professional profile), inline on computers. */}
  <PlaceMoreMenu title={place.name} closeLabel={t('Cerrar','Close')} desktop={<>{saveSlot}{published&&<ShareButton title={place.name} locale={locale} suggest sheet className={PAGE_CHIP}/>}{photoSlot}</>}>
   {saveSlot}
   {published&&<ShareButton title={place.name} locale={locale} suggest sheet className={PAGE_CHIP}/>}
   {photoSlot}
  </PlaceMoreMenu>
 </PlaceChipRail>;

 return <main id="contenido" data-place-page={place.slug} className="mx-auto max-w-7xl px-4 pb-8 pt-4 text-[#162543] sm:px-6 lg:px-8 lg:pt-8">
  <nav aria-label={t('Ruta de navegación','Breadcrumb')} className="mb-4 hidden text-sm text-[#526277] sm:block">
   <ol className="flex flex-wrap items-center gap-1"><li><a className={`hover:underline ${ring}`} href={en?'/en':'/'}>{t('Inicio','Home')}</a></li><li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5"/></li>
    <li>{sectionHref?<a className={`hover:underline ${ring}`} href={sectionHref}>{vertical}</a>:vertical}</li><li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5"/></li><li aria-current="page" className="min-w-0 truncate text-[#162543]">{place.name}</li></ol>
  </nav>

  {/* The search's «Recientes» lists the businesses opened, like the profiles (owner 2026-11-26). */}
  <RecordRecentVisit surface="negocios" visita={{id:`lugar:${place.slug}`,titulo:place.name,subtitulo:[vertical,place.address.adminArea2].filter(Boolean).join(' · '),imagen:photos[0]?.url,iniciales:place.name.slice(0,2).toUpperCase(),href:`${en?'/en':''}/lugar/${place.slug}`}}/>

  {/* Same two columns as the professional profile: identity card + tab card | sticky contact card (from lg).
      On phones the side card (claim, «Sugerir un cambio») follows the tabs and only shows with «Información» open. */}
  <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_352px] max-lg:[&:has([data-place-panel=info][hidden])>aside]:hidden">
   <div className="min-w-0">
    {/* ── IDENTITY CARD: photo | name, rating, kind · zone, today's status | (lg) actions row ── */}
    <header data-place-header data-place-hero className="relative mb-6 rounded-2xl border border-[#e5e7eb] bg-white px-4 pb-4 pt-3.5 shadow-sm sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:gap-x-5 sm:p-6 sm:pt-6">
     <div className="flex min-w-0 flex-col items-start gap-2 text-left min-[360px]:flex-row min-[360px]:items-center min-[360px]:gap-3 sm:contents sm:gap-0">
      {avatar}
      <div className="w-full min-w-0 sm:col-start-2 sm:row-start-1 sm:w-auto sm:self-center">
       <ProfileIdentityName testId="place-name" name={place.name} badge={nameBadge}/>
       {reviews&&(rated
        ?<p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-[#68778d] sm:mt-2 sm:text-[13px]" data-rating-line={place.rating.count}>
         <a href="#resenas" aria-label={ratingAria} className={`relative inline-flex min-w-0 items-center gap-1.5 rounded ${ring}`}>
          <Star aria-hidden="true" className="h-3.5 w-3.5 shrink-0 fill-[#ff9b32] text-[#ff9b32]"/>
          <span className="text-[14px] font-bold text-[#162543] sm:text-[15px]">{ratingNumber(place.rating.average!)}</span>
          <span className="whitespace-nowrap">{reviewsLabel(place.rating.count,en)}</span></a>
         {priceLevel&&<><span aria-hidden="true">·</span><span data-place-price-level className="font-bold text-[#162543]" aria-label={t(`Nivel de precio ${priceLevel.length} de 4`,`Price level ${priceLevel.length} of 4`)}>{priceLevel}</span></>}</p>
        :<p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-[#68778d] sm:mt-2 sm:text-[13px]" data-rating-line="none"><span>{t('Sin reseñas todavía','No reviews yet')}</span>
         {priceLevel&&<><span aria-hidden="true">·</span><span data-place-price-level className="font-bold text-[#162543]" aria-label={t(`Nivel de precio ${priceLevel.length} de 4`,`Price level ${priceLevel.length} of 4`)}>{priceLevel}</span></>}</p>)}
       {!reviews&&priceLevel&&<p className="mt-1.5 text-[13px]"><span data-place-price-level className="font-bold text-[#162543]" aria-label={t(`Nivel de precio ${priceLevel.length} de 4`,`Price level ${priceLevel.length} of 4`)}>{priceLevel}</span></p>}
       <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-[#526277] sm:text-[14px]" data-place-tags>
        {kind?<span data-place-kind={String(place.attributes.kind)}>{kind}</span>:sectionHref?<a href={sectionHref} className={`hover:underline ${ring}`}>{vertical}</a>:<span>{vertical}</span>}
        {kindLine.slice(1).map(x=><span key={x}><span aria-hidden="true">· </span>{x}</span>)}
        {cuisines.length>0&&<span><span aria-hidden="true">· </span>{cuisines.slice(0,2).join(', ')}</span>}
        {/* Owner 2026-11-27: no «No reclamado» label on the page; unclaimed places only show the quiet «¿Es su empresa?» box at the end. */}
       </p>
       {place.status==='closed_permanently'&&<p data-place-closed className="mt-2 inline-flex w-fit rounded-full bg-red-600 px-3 py-1 text-[12.5px] font-bold text-white">{t('Cerrado definitivamente','Permanently closed')}</p>}
       {statusText&&<p className="mt-1.5 text-[13px] font-semibold leading-snug sm:text-[14px]" data-place-open-status={status!.state} data-open={statusText.open?'open':'closed'}>
        <span className={`inline-flex items-center gap-1.5 font-bold ${statusText.open?'text-[#047857]':'text-[#b91c1c]'}`}><span aria-hidden="true" className={`h-2 w-2 rounded-full ${statusText.open?'bg-[#10b981]':'bg-[#ef4444]'}`}/>{statusText.label}</span>
        {statusText.detail&&<span className="font-medium text-[#526277]"> · {statusText.detail}</span>}
        {' '}<a href="#horario" className={`ml-1 text-[13px] ${BIZ.link}`}>{t('Ver horario','See hours')}</a></p>}
      </div>
     </div>
     {published&&<div className="mt-4 flex flex-col gap-3 border-t border-[#eef2f6] pt-4 sm:col-span-2 sm:col-start-1" data-place-actions-bar>
      {extras}
     </div>}
    </header>
    {contactBar}

    <PlaceTabs variant="card" tabs={tabs} label={t('Secciones de la empresa','Business sections')} defaultTab={defaultTab}/>
   </div>

   <aside aria-label={t('Contacto y ubicación','Contact and location')} className="min-w-0">
    <div className="lg:sticky lg:top-20">{sideCard}</div>
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
