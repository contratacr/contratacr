import {createElement,type ReactNode} from 'react';
import {cn} from '@/lib/utils';
import {ArrowLeftRight,Banknote,Bath,CalendarCheck,CalendarClock,Car,Check,ChevronRight,CircleParking,Clock,Coffee,CreditCard,Droplets,FileText,Fuel,Landmark,Leaf,MapPin,PawPrint,PenLine,Percent,Pill,ShoppingBag,Siren,Smartphone,Star,Store,Truck,Waves,Wifi,Wind,Wrench,Zap,type LucideIcon} from 'lucide-react';
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
import {BIZ,RatingLine,ring} from './biz-ui';
import {PlaceTabs,type PlaceTab} from './place-tabs';
import {VerifiedSeal} from '@/components/ui/verified-seal';
import {ShareButton} from './share-button';
import {PlaceMoreMenu} from './place-more-menu';
import {PlaceRecommend} from './place-recommend';
import {mapLinks,placeSideActions,resolvePlaceAction,type PlaceAction,type PlaceActionInput} from '@/lib/directory/place-actions';
import {ActionButton,actionIcon} from './place-action-buttons';
import {CHIP,PlaceStatusLine} from './place-card';
import {WhatsAppLogo} from '@/components/ui/whatsapp-logo';
import {GoogleMapsIcon,WazeIcon} from '@/components/ui/nav-app-icons';

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
/** Chip row of the page (same chips as the result card): one tab stop per action, slides sideways on phones, wraps from lg. */
const CHIP_ROW='scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-0.5 [touch-action:pan-x_pan-y] lg:flex-wrap lg:overflow-visible';


export type PlacePageSlots={
 /** Owner shortcut and reservations, first in the «Información» tab. */top?:ReactNode;
 /** Menu link, prices, price report, dealer/agency listings («Menú» / «Precios» tab). */offer?:ReactNode;
 events?:ReactNode;questions?:ReactNode;reviews?:ReactNode;
 /** Compact «¿Es su empresa?» row (only while unclaimed). */claim?:ReactNode;
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
  <a className={cn(BIZ.secondary,'px-3.5 text-[13px]')} href={directions.apple} rel="noopener noreferrer" target="_blank">Apple Maps</a>
  <a className={cn(BIZ.secondary,'px-3.5 text-[13px]')} href={directions.osm} rel="noopener noreferrer" target="_blank">OpenStreetMap</a></p>;


 // Side card. From lg: the sticky right column (contact buttons, «¿Recomienda este lugar?», claim, «Sugerir un cambio»).
 // On phones the chip row under the name already holds every contact action, so only the last three show, after the tabs.
 const sideCard=<div className={cn(BIZ.card,'overflow-hidden')} data-place-side-card>
  <div className="flex flex-col gap-1.5 p-5 max-lg:hidden">
   <p className={BIZ.cardTitle}>{t('Contacte a esta empresa','Contact this business')}</p>
   {area&&<p className="flex items-center gap-1 text-[12px] font-semibold text-[#5f6f86]"><MapPin aria-hidden="true" className="h-3 w-3 shrink-0"/><span className="min-w-0">{area}</span></p>}
   {priceNote&&<p data-place-price-note className="text-[15px] font-bold text-[#162543]">{priceNote}</p>}
   <div className="mt-2 flex flex-col gap-2" data-place-side-actions={sideActions.map(x=>x.id).join(' ')}>
    {sideActions.map((x,i)=><ActionButton key={x.id} action={x} slug={place.slug} locale={locale} className={cn(i===0?BIZ.primary:BIZ.secondary,'h-12 w-full text-base font-semibold')}>
     {actionIcon(x.id,'h-5 w-5')}{x.label}{x.id==='call'&&phone?.kind==='cr'&&<>{' '}<span className="whitespace-nowrap">{phone.display}</span></>}
     {x.id==='order'&&order&&<span className="text-sm font-normal">{order.channel==='whatsapp'?t('por WhatsApp','on WhatsApp'):order.channel==='web'?t('en su sitio','on its website'):t('por teléfono','by phone')}</span>}</ActionButton>)}
   </div>
   {address&&<p className="mt-1 text-center text-[13px] text-[#68778d]">{address}</p>}
  </div>
  {published&&<div className="p-3 lg:border-t lg:border-[#eef2f6]"><PlaceRecommend locale={locale}/></div>}
  {slots.claim&&<div className="border-t border-[#eef2f6]">{slots.claim}</div>}
  <div className="border-t border-[#eef2f6] py-2 text-center"><a href="#reportar" data-place-suggest className={`inline-flex min-h-11 items-center gap-2 text-sm ${BIZ.link}`}><PenLine aria-hidden="true" className="h-4 w-4"/>{t('Sugerir un cambio','Suggest an edit')}</a></div>
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
 const moreTab=<section id="mas" aria-labelledby="place-more" data-place-more className="scroll-mt-24 space-y-3">
  <h2 id="place-more" className={BIZ.h2}>{t('Más sobre este lugar','More about this place')}</h2>
  <ul className="divide-y divide-[#eef2f6] rounded-2xl border border-[#e3e9ef] text-[15px]">
   {place.website&&<li><a className={`flex min-h-12 items-center px-4 ${BIZ.link}`} href={place.website} rel="noopener noreferrer nofollow" target="_blank">{t('Sitio web de la empresa','Business website')}</a></li>}
   {brand&&<li><a className={`flex min-h-12 items-center px-4 ${BIZ.link}`} href={`${prefix}/marca/${brand.slug}`}>{t(`Todas las sucursales de ${brand.name}`,`All ${brand.name} branches`)}</a></li>}
   {sectionHref&&<li><a className={`flex min-h-12 items-center px-4 ${BIZ.link}`} href={sectionHref}>{t(`Más lugares en ${vertical}`,`More places in ${vertical}`)}</a></li>}
   <li><a href="#reportar" data-place-suggest-more className={`flex min-h-12 items-center gap-2 px-4 ${BIZ.link}`}><PenLine aria-hidden="true" className="h-4 w-4"/>{t('Sugerir un cambio','Suggest an edit')}</a></li>
  </ul>
 </section>;
 const offerLabel=offerTabLabel(place.vertical.id,en);
 const tabs:PlaceTab[]=[
  {id:'info',label:t('Información','Information'),anchors:['horario','comodidades','acerca','eventos','sucursales','place-reservations'],content:infoTab},
  ...(slots.offer?[{id:'offer',label:offerLabel,anchors:['precios'],content:<div className="space-y-6">{slots.offer}</div>}]:[]),
  ...(!reviews?[]:[{id:'reviews',label:t('Reseñas','Reviews'),anchors:['resenas','escribir-resena'],content:slots.reviews??<section id="resenas" className="space-y-3"><h2 className={BIZ.h2}>{t('Reseñas','Reviews')}</h2><p className={BIZ.sub} data-place-reviews-empty>{t('Todavía no hay reseñas.','No reviews yet.')}</p></section>}]),
  ...(photos.length>0?[{id:'photos',label:t('Fotos','Photos'),anchors:['fotos'],content:<section id="fotos" aria-labelledby="place-photos" data-place-photos className="scroll-mt-24 space-y-4">
   <h2 id="place-photos" className={BIZ.h2}>{t('Fotos','Photos')} ({photos.length})</h2>
   <PlacePhotoGallery en={en} placeName={place.name} photos={photos}/></section>}]:[]),
  ...(slots.questions?[{id:'questions',label:t('Preguntar','Ask'),anchors:['preguntas'],content:slots.questions}]:[]),
 {id:'more',label:t('Más','More'),anchors:['mas'],content:moreTab},
 ];
 // Gas stations lead with their prices; every other section opens on «Información».
 const defaultTab=place.vertical.id==='fuel'&&slots.offer?'offer':'info';

 const nameBadge=trusted?<span data-place-verification={place.verificationLevel} className="ml-1.5 inline-flex -translate-y-0.5 align-middle"><VerifiedSeal className="h-5 w-5" label={verification}/></span>:null;
 // Category line, like the result card: «Restaurantes · Soda · Comida típica · ₡₡ · No reclamado».
 const dot=<span aria-hidden="true"> · </span>;
 const chips=<div className={CHIP_ROW} data-place-actions-bar data-place-quick-actions={chipActions.map(c=>c.action.id).join(' ')}>
  {/* Order (owner 2026-11-26): Reservar first where it exists, then Reseñar, then contact, then Waze and Maps. */}
  {chipActions.filter(c=>c.action.id==='reserve').map(c=><ActionButton key={c.action.id} action={c.action} slug={place.slug} locale={locale} className={CHIP}>{c.icon}{c.label}</ActionButton>)}
  {published&&reviews&&<a href="#escribir-resena" data-place-write-review data-place-action="review" className={CHIP}><Star aria-hidden="true" className="h-4 w-4 shrink-0"/>{t('Reseñar','Review')}</a>}
  {chipActions.filter(c=>c.action.id!=='reserve').map(c=><ActionButton key={c.action.id} action={c.action} slug={place.slug} locale={locale} className={CHIP}>{c.icon}{c.label}</ActionButton>)}
  {maps&&<a href={maps.waze} data-place-action="waze" target="_blank" rel="noopener noreferrer" className={CHIP}><WazeIcon className="h-4 w-4 shrink-0"/>Waze</a>}
  {maps&&<a href={maps.google} data-place-action="maps" target="_blank" rel="noopener noreferrer" className={CHIP}><GoogleMapsIcon className="h-4 w-4 shrink-0"/>Maps</a>}
  {orderAction&&<ActionButton action={orderAction} slug={place.slug} locale={locale} className={CHIP}>{actionIcon('order','h-4 w-4 shrink-0')}{orderAction.label}</ActionButton>}
  {site&&<ActionButton action={site} slug={place.slug} locale={locale} className={CHIP}>{actionIcon('website','h-4 w-4 shrink-0')}{site.label}</ActionButton>}
  {/* Guardar, Compartir, Agregar fotos: in the bar's «…» on phones (like the professional profile), inline on computers. */}
  <PlaceMoreMenu title={place.name} closeLabel={t('Cerrar','Close')} desktop={<>{saveSlot}{published&&<ShareButton title={place.name} locale={locale} suggest sheet className={CHIP}/>}{photoSlot}</>}>
   {saveSlot}
   {published&&<ShareButton title={place.name} locale={locale} suggest sheet className={CHIP}/>}
   {photoSlot}
  </PlaceMoreMenu>
 </div>;
 return <main id="contenido" data-place-page={place.slug} className="mx-auto max-w-7xl px-4 pb-14 pt-4 text-[#162543] sm:px-6 lg:px-8 lg:pt-8">
  <nav aria-label={t('Ruta de navegación','Breadcrumb')} className="mb-4 hidden text-sm text-[#526277] sm:block">
   <ol className="flex flex-wrap items-center gap-1"><li><a className={`hover:underline ${ring}`} href={en?'/en':'/'}>{t('Inicio','Home')}</a></li><li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5"/></li>
    <li>{sectionHref?<a className={`hover:underline ${ring}`} href={sectionHref}>{vertical}</a>:vertical}</li><li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5"/></li><li aria-current="page" className="min-w-0 truncate text-[#162543]">{place.name}</li></ol>
  </nav>

  <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_352px]">
   {/* ── Header, Yelp/Maps order (owner 2026-11-26): real photos only → name → rating → category · price → status → area → chips ── */}
   <div className="min-w-0 lg:col-start-1 lg:row-start-1">
    <div data-place-header className="relative rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6">
     {photos.length>0&&<div className="mb-4"><PlacePhotoGallery variant="strip" en={en} placeName={place.name} photos={photos}/></div>}
     <h1 data-testid="place-name" className="break-words text-[24px] font-extrabold leading-tight text-[#111827] sm:text-[28px]">{place.name}{nameBadge}</h1>
     {reviews&&<div className="mt-1.5"><RatingLine average={place.rating.average} count={place.rating.count} en={en} href="#resenas"/></div>}
     <p className="mt-1 text-[13.5px] font-semibold leading-snug text-[#6b7280]" data-place-tags>
      {sectionHref?<a href={sectionHref} className={`hover:text-[#009FD9] ${ring}`}>{vertical}</a>:vertical}
      {kind&&<>{dot}<span data-place-kind={String(place.attributes.kind)}>{kind}</span></>}
      {cuisines.slice(0,3).map(c=><span key={c}>{dot}{c}</span>)}
      {priceLevel&&<>{dot}<span data-place-price-level className="font-bold text-[#009FD9]" aria-label={t(`Nivel de precio ${priceLevel.length} de 4`,`Price level ${priceLevel.length} of 4`)}>{priceLevel}</span></>}
      {/* Imported / unverified listings: a quiet «No reclamado» (sources in Terms 13.1 and the footer line). */}
      {!trusted&&<>{dot}<span data-place-verification={place.verificationLevel} className="font-medium">{verification}</span></>}
      {trusted&&<span className="sr-only">{verification}</span>}
     </p>
     {place.status==='closed_permanently'&&<p data-place-closed className="mt-2 inline-flex rounded-full bg-red-50 px-2.5 py-1 text-[12px] font-semibold text-red-800">{t('Cerrado definitivamente','Permanently closed')}</p>}
     {statusText&&<PlaceStatusLine status={statusText} className="mt-1.5 text-[14px]" data-place-open-status={status!.state}>
      {' '}<a href="#horario" className={`ml-1 text-[13px] ${BIZ.link}`}>{t('Ver horario','See hours')}</a></PlaceStatusLine>}
     {(address||area)&&<p className="mt-1.5 flex items-start gap-1 text-[13px] font-medium text-[#68778d]"><MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0"/><span className="min-w-0">{address?`${address}${area?` · ${area}`:''}`:area}</span></p>}
     {phone?.kind==='other'&&<p data-place-phone-other={phone.reason} className="mt-1.5 text-sm text-slate-700"><span className="font-semibold">{t('Otros datos:','Other details:')}</span>{' '}
      {phone.reason==='foreign'?t('teléfono registrado de otro país (sin verificar)','phone registered in another country (not verified)'):t('teléfono registrado con un formato que no es costarricense válido (sin verificar)','phone on file not in a valid Costa Rican format (not verified)')}: <span className="whitespace-nowrap">{phone.display}</span></p>}
     {published&&<div className="mt-3">{chips}</div>}
     {summary&&<p data-place-summary className="mt-3 max-w-2xl text-[14px] leading-6 text-[#334155]">{summary}</p>}
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
    </div>
   </div>

   {/* Tabs before the side card in the DOM: on phones they follow the header; from lg the card is the right column. */}
   <div className="min-w-0 lg:col-start-1 lg:row-start-2">
    <PlaceTabs tabs={tabs} label={t('Secciones de la empresa','Business sections')} defaultTab={defaultTab}/>
   </div>

   <aside aria-label={t('Contacto y ubicación','Contact and location')} className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
    <div className="lg:sticky lg:top-20">{sideCard}</div>
   </aside>
  </div>

  <footer className="mt-12 space-y-4 border-t border-[#e8edf2] pt-6 text-sm text-slate-600">
   {/* Data credit (owner 2026-11-26): one small line. The OSM licence (ODbL) asks for a visible credit where its data is
       shown; the full detail lives in the Terms. Places without an external source show nothing. */}
   {place.sources.length>0&&<p data-place-sources className="text-[11.5px] text-slate-400">{t('Datos','Data')}: {place.sources.map((s,i)=><span key={s.name} data-place-source={s.name}>{i?', ':''}{s.url?<a className={`hover:underline ${ring}`} href={s.url} rel="noopener noreferrer" target="_blank">{bilingual(s.attribution,en)}</a>:bilingual(s.attribution,en)}</span>)}</p>}
   <PlaceReportForm slug={place.slug} locale={locale}/>
  </footer>
 </main>;
}
