'use client';
import {idiomaDe,rutaConIdioma} from '@/lib/prefijo-de-idioma';
import {useState,type KeyboardEvent,type ReactNode} from 'react';
import {ChevronLeft,ChevronRight,ImageOff,MapPin,ShieldAlert,ShieldCheck,Store,User} from 'lucide-react';
import {formatDate,formatMoney,type PublicListing,type PublicListingPhoto} from '@/lib/directory/listing-public';

/**
 * LOCAL PRO ONLY (multivertical V4/R1): building blocks shared by vehicle-listing-page and property-listing-page.
 * ContrataCR look (navy #162543, cyan accent #009FD9 only on borders/backgrounds, never as text on white).
 */
export const tr=(locale:string)=>(es:string,en:string)=>({es,en})[idiomaDe(locale)];
export const focusRing='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
export const primaryButton=`inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#162543] px-5 font-semibold text-white disabled:opacity-60 ${focusRing}`;
export const secondaryButton=`inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#162543] bg-white px-5 font-semibold text-[#162543] disabled:opacity-60 ${focusRing}`;

export function ListingGallery({photos,title,locale}:{photos:PublicListingPhoto[];title:string;locale:string}){
 const t=tr(locale),[index,setIndex]=useState(0),count=photos.length;
 if(!count)return <div data-listing-gallery="empty" className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl bg-[#EBF5FB] text-[#162543]">
  <ImageOff aria-hidden className="size-8"/><p className="text-sm">{t('El vendedor aún no agregó fotos.','The seller has not added photos yet.')}</p></div>;
 const go=(i:number)=>setIndex((i+count)%count),photo=photos[index];
 const alt=(p:PublicListingPhoto,i:number)=>({es:p.altEs,en:p.altEn})[idiomaDe(locale)]??`${title} — ${t('foto','photo')} ${i+1}`;
 const onKey=(e:KeyboardEvent)=>{if(e.key==='ArrowRight'){e.preventDefault();go(index+1);}else if(e.key==='ArrowLeft'){e.preventDefault();go(index-1);}};
 return <section aria-roledescription="carousel" aria-label={t('Fotos del anuncio','Listing photos')} data-listing-gallery={count} className="space-y-2" onKeyDown={onKey}>
  <div className="relative overflow-hidden rounded-2xl bg-slate-100">
   {/* eslint-disable-next-line @next/next/no-img-element -- https URLs validated by the media pipeline (V3) */}
   <img src={photo.url} alt={alt(photo,index)} className="aspect-[4/3] w-full object-cover"/>
   {count>1&&<>
    <button type="button" onClick={()=>go(index-1)} aria-label={t('Foto anterior','Previous photo')} className={`absolute left-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#162543] shadow ${focusRing}`}><ChevronLeft aria-hidden/></button>
    <button type="button" onClick={()=>go(index+1)} aria-label={t('Foto siguiente','Next photo')} className={`absolute right-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#162543] shadow ${focusRing}`}><ChevronRight aria-hidden/></button>
    <p aria-live="polite" className="absolute bottom-2 right-2 rounded-full bg-[#162543]/85 px-3 py-1 text-xs font-semibold text-white">{index+1} / {count}</p>
   </>}
  </div>
  {count>1&&<ul className="flex gap-2 overflow-x-auto pb-1" aria-label={t('Miniaturas','Thumbnails')}>{photos.map((p,i)=><li key={p.url} className="shrink-0">
   <button type="button" onClick={()=>go(i)} aria-label={`${t('Ver foto','Show photo')} ${i+1} ${t('de','of')} ${count}`} aria-current={i===index?'true':undefined}
    className={`block size-16 overflow-hidden rounded-lg border-2 ${i===index?'border-[#009FD9]':'border-transparent'} ${focusRing}`}>
    {/* eslint-disable-next-line @next/next/no-img-element -- thumbnails of the same validated URLs */}
    <img src={p.url} alt="" loading="lazy" className="size-full object-cover"/></button></li>)}</ul>}
 </section>;
}

export function StatusBadge({listing,locale}:{listing:PublicListing;locale:string}){
 if(listing.status!=='reserved')return null;
 return <span data-listing-reserved className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">{tr(locale)('Reservado','Reserved')}</span>;
}

/** Price in the listing currency; USD also shows the colón reference with the exchange-rate date (Ley 7472). */
export function PriceBlock({listing,locale,suffix}:{listing:PublicListing;locale:string;suffix?:string}){
 const t=tr(locale);
 return <div data-listing-price className="space-y-1">
  <p className="text-3xl font-extrabold tracking-tight text-[#162543]">{formatMoney(listing.priceMinor,listing.currency,locale)}{suffix&&<span className="text-lg font-semibold text-slate-600"> {suffix}</span>}</p>
  {listing.currency==='USD'&&listing.priceCrcNorm!=null&&<p className="text-sm text-slate-700" data-listing-price-crc>
   {t('Aprox.','Approx.')} {formatMoney(listing.priceCrcNorm,'CRC',locale)}
   {listing.fxRateDate&&<> · {t('tipo de cambio del','exchange rate of')} {formatDate(listing.fxRateDate,locale)}</>}</p>}
 </div>;
}

export function LocationLine({listing,locale,approximateNote}:{listing:PublicListing;locale:string;approximateNote?:boolean}){
 const t=tr(locale),area=[listing.locality,listing.adminArea3,listing.adminArea2,listing.adminArea1].filter(Boolean).join(', ');
 const map=listing.approxLat!=null&&listing.approxLng!=null?`https://www.openstreetmap.org/?mlat=${listing.approxLat.toFixed(4)}&mlon=${listing.approxLng.toFixed(4)}#map=15/${listing.approxLat.toFixed(4)}/${listing.approxLng.toFixed(4)}`:null;
 if(!area&&!map)return null;
 return <div className="space-y-1 text-[#162543]" data-listing-location>
  {area&&<p className="flex items-start gap-2"><MapPin aria-hidden className="mt-0.5 size-5 shrink-0"/><span>{area}</span></p>}
  {approximateNote&&<p className="text-sm text-slate-700" data-listing-location-approx>{t(
   `Ubicación aproximada: el punto se desplaza al azar unos ${listing.locationRadiusM??500} m para proteger la dirección exacta. El vendedor se la indicará al coordinar la visita.`,
   `Approximate location: the point is shifted about ${listing.locationRadiusM??500} m to protect the exact address. The seller will share it when you arrange a visit.`)}</p>}
  {map&&<p><a className={`text-sm underline underline-offset-2 ${focusRing}`} href={map} rel="noopener noreferrer" target="_blank">{t('Ver zona en el mapa (OpenStreetMap)','View area on the map (OpenStreetMap)')}</a></p>}
 </div>;
}

export function SellerBlock({listing,locale}:{listing:PublicListing;locale:string}){
 const t=tr(locale),business=listing.sellerKind==='business';
 const href=listing.placeSlug?rutaConIdioma(locale,`/negocios/${listing.placeSlug}`):null;
 return <section aria-labelledby="listing-seller" data-listing-seller={listing.sellerKind} className="space-y-2 rounded-2xl border border-[#d7e1ea] p-5">
  <h2 id="listing-seller" className="text-lg font-bold">{t('Quién vende','Seller')}</h2>
  <p className="flex items-center gap-2 font-semibold">{business?<Store aria-hidden className="size-5"/>:<User aria-hidden className="size-5"/>}
   {href&&listing.placeName?<a className={`underline underline-offset-2 ${focusRing}`} href={href}>{listing.placeName}</a>:business?(listing.placeName??t('Negocio','Business')):t('Particular','Private seller')}</p>
  {business&&listing.sellerBusinessVerified
   ?<p className="flex items-center gap-2 text-sm text-emerald-800"><ShieldCheck aria-hidden className="size-4"/>{t('Negocio verificado por ContrataCR','Business verified by ContrataCR')}</p>
   :<p className="text-sm text-slate-700">{business?t('Negocio aún sin verificar.','Business not verified yet.'):t('Anuncio de una persona particular.','Listing by a private individual.')}</p>}
  {href&&<p className="text-sm"><a className={`underline underline-offset-2 ${focusRing}`} href={href}>{t('Ver ficha y otros anuncios del negocio','See the business page and other listings')}</a></p>}
 </section>;
}

export type Spec={key:string;label:string;value:ReactNode};
export function SpecList({specs,title,id}:{specs:Spec[];title:string;id:string}){
 const visible=specs.filter(s=>s.value!==null&&s.value!==undefined&&s.value!=='');
 if(!visible.length)return null;
 return <section aria-labelledby={id} className="space-y-3">
  <h2 id={id} className="text-lg font-bold">{title}</h2>
  <dl className="grid grid-cols-1 gap-x-6 gap-y-2 min-[380px]:grid-cols-2 sm:grid-cols-3">
   {visible.map(s=><div key={s.key} data-spec={s.key} className="rounded-xl bg-[#f6f9fc] px-3 py-2"><dt className="text-xs font-medium uppercase tracking-wide text-slate-600">{s.label}</dt><dd className="font-semibold text-[#162543]">{s.value}</dd></div>)}
  </dl>
 </section>;
}

export function SafetyNotice({children,tone='info'}:{children:ReactNode;tone?:'info'|'warning'}){
 return <aside role="note" data-listing-safety={tone} className={`flex gap-3 rounded-2xl p-4 text-sm ${tone==='warning'?'bg-amber-50 text-amber-950':'bg-[#EBF5FB] text-[#162543]'}`}>
  <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0"/><div className="space-y-1">{children}</div></aside>;
}

/** Contact actions are callbacks: the route decides (login, V5 request form, etc.). */
export function ContactActions({locale,onInterest,onSchedule,scheduleLabel,disabled}:{locale:string;onInterest:()=>void;onSchedule?:()=>void;scheduleLabel:string;disabled?:boolean}){
 const t=tr(locale);
 return <div className="grid gap-2" data-listing-actions>
  <button type="button" className={primaryButton} onClick={onInterest} disabled={disabled} data-listing-interest>{t('Me interesa','I am interested')}</button>
  {onSchedule&&<button type="button" className={secondaryButton} onClick={onSchedule} disabled={disabled} data-listing-schedule>{scheduleLabel}</button>}
  {disabled&&<p className="text-sm text-slate-700">{t('Este anuncio está reservado; el vendedor puede no aceptar nuevas solicitudes.','This listing is reserved; the seller may not accept new requests.')}</p>}
 </div>;
}

export function ListingFooter({listing,locale,reportHref}:{listing:PublicListing;locale:string;reportHref:string}){
 const t=tr(locale);
 return <footer className="space-y-2 border-t border-[#d7e1ea] pt-6 text-sm text-slate-700">
  <p>{t('Código del anuncio','Listing code')}: <span className="font-mono font-semibold text-[#162543]">{listing.code.toUpperCase()}</span>
   {listing.publishedAt&&<> · {t('Publicado el','Published on')} {formatDate(listing.publishedAt,locale)}</>}</p>
  <p>{t('El orden de los anuncios en ContrataCR no depende de pagos.','Listing order on ContrataCR never depends on payment.')} <a className={`underline underline-offset-2 ${focusRing}`} href={rutaConIdioma(locale,'/como-ordenamos')}>{t('Cómo ordenamos','How we rank')}</a></p>
  <p><a className={`inline-flex min-h-11 items-center underline underline-offset-2 ${focusRing}`} href={reportHref} data-listing-report rel="nofollow">{t('Reportar este anuncio','Report this listing')}</a></p>
 </footer>;
}
