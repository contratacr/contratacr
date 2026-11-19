import {VERIFICATION_LABELS,type VerificationLevel} from '@/lib/directory/types';
import type {PlaceSearchItem,PlaceSearchPrice,RankingReason} from '@/lib/directory/search-schemas';
import {crDay,money,sourceLine} from '@/lib/directory/price-compare';
import {isHealthVertical,kindLabel} from '@/lib/directory/place-verticals';
import {checkPlacePhone} from '@/lib/directory/phone';
import {directionsLinks} from '@/lib/maps/maplibre';
import {BadgeCheck,MapPin,Navigation,Phone,Star} from 'lucide-react';
import {placeVerticalIcon} from './place-photo-placeholder';

/**
 * LOCAL PRO ONLY (multivertical F6): result card of a place (restaurant, fuel station, pharmacy, supermarket,
 * agency). Server component. Status is given in text, never by colour alone; one tab stop per card (the name);
 * works at 390 px. REASON_LABELS stay for the assistant and any machine-readable use; they are not shown on cards.
 */
export const REASON_LABELS:Record<RankingReason,{es:string;en:string}>={
 text_exact:{es:'El nombre coincide con su búsqueda',en:'Name matches your search'},
 text_prefix:{es:'El nombre empieza con su búsqueda',en:'Name starts with your search'},
 text_word:{es:'El nombre contiene la palabra buscada',en:'Name contains the word you searched'},
 text_partial:{es:'El nombre contiene parte de su búsqueda',en:'Name contains part of your search'},
 text_keyword:{es:'Coincide con la categoría, marca o zona',en:'Matches the category, brand or area'},
 locality_district:{es:'Está en el distrito elegido',en:'In the chosen district'},
 locality_canton:{es:'Está en el cantón elegido',en:'In the chosen canton'},
 locality_province:{es:'Está en la provincia elegida',en:'In the chosen province'},
 rating_credible:{es:'Tiene calificaciones de varios clientes',en:'Rated by several customers'},
 verified:{es:'Verificado por ContrataCR',en:'Verified by ContrataCR'},
 profile_complete:{es:'Ficha completa',en:'Complete listing'},
 fresh_listing:{es:'Publicado recientemente',en:'Recently published'},
 distance:{es:'Ordenado por cercanía',en:'Sorted by distance'},
 price_asc:{es:'Ordenado por precio, de menor a mayor',en:'Sorted by price, low to high'},
 price_desc:{es:'Ordenado por precio, de mayor a menor',en:'Sorted by price, high to low'},
 price_missing:{es:'Sin precio publicado',en:'No published price'},
 newest:{es:'Ordenado por fecha de publicación',en:'Sorted by date published'},
 sort_rating:{es:'Ordenado por calificación',en:'Sorted by rating'},
 id_tiebreak:{es:'Empate resuelto de forma fija',en:'Tie resolved in a fixed order'},
};

export function formatDistance(km:number|null,en:boolean){
 if(km==null)return null;
 const n=new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:km<10?1:0}).format(km);
 return en?`${n} km away`:`a ${n} km`;
}

/**
 * Permit status of a pharmacy (owner decision 2026-11-17: every pharmacy is shown). Verified → badge; otherwise a
 * neutral note, never an alarm: ContrataCR simply has not checked the permit yet.
 */
export function pharmacyLicence(level:string,en:boolean){
 return level==='license_verified'
  ?{state:'verified' as const,text:en?'Operating license verified':'Permiso de funcionamiento verificado'}
  :{state:'unverified' as const,text:en?'License not verified by ContrataCR':'Permiso sin verificar por ContrataCR'};
}

/**
 * Permit line of a health or vet place (2026-11-17 sections; same pattern as pharmacies, requires_license=false):
 * verified → badge; otherwise the neutral «Habilitación sin verificar por ContrataCR», never an alarm.
 */
export function healthPermit(level:string,en:boolean){
 return level==='license_verified'
  ?{state:'verified' as const,text:en?'Health permit verified by ContrataCR':'Habilitación verificada por ContrataCR'}
  :{state:'unverified' as const,text:en?'Permit not verified by ContrataCR':'Habilitación sin verificar por ContrataCR'};
}

/** Price line of a card: amount + what it is + source and date (Ley 7472: source and date always visible). */
export function PlacePriceLine({price,en}:{price:PlaceSearchPrice;en:boolean}){
 const t=(es:string,english:string)=>en?english:es;
 if(price.kind==='menu')return <p className="text-[12px] leading-snug text-[#6b7280]" data-place-price="menu" data-price-amount={price.amount}>
  <span className="text-[13px] font-bold text-[#009FD9]">{t('Precio típico','Typical price')} {money(price.amount,price.currency,en)}</span>
  {' · '}{t(`${price.dishes} ${price.dishes===1?'plato':'platos'} del menú, con IVA y servicio`,`${price.dishes} ${price.dishes===1?'dish':'dishes'} on the menu, VAT and service included`)} · {t('actualizado el ','updated on ')}{crDay(price.updatedAt,en)}</p>;
 const o=price.observation;
 return <p className="text-[12px] leading-snug text-[#6b7280]" data-place-price="product" data-price-amount={o.price}>
  <span className="text-[13px] font-bold text-[#009FD9]">{price.item.name}{price.item.presentation?` (${price.item.presentation})`:''}: {money(o.price,o.currency,en)}</span>
  {' · '}{sourceLine(o,en)}</p>;
}

const VERIFIED=new Set(['verified','license_verified']);
const actionBase='relative z-10 inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#162543]';
const actionPrimary=`${actionBase} bg-[#009FD9] text-white hover:bg-[#0089bb] lg:basis-full`;
const actionSecondary=`${actionBase} border border-[#d7e1ea] bg-white text-[#162543] hover:border-[#009FD9] hover:text-[#007fae]`;

/**
 * Result card of a place in the professionals card style (2026-11-19, owner request «misma lógica estética y orden que
 * buscar profesionales»): numbered icon on the left (the number matches the map pin), name + verified check, category,
 * rating, location, open status and price; actions on the right on desktop (below on phones). The whole card opens the
 * place page (stretched low-z link, like ProfessionalCard); the visible name link keeps one tab stop. Ranking reasons
 * stay machine-readable in `data-ranking-reasons` (the explanation lives in /como-ordenamos and the Terms).
 */
export function PlaceCard({item,locale,headingLevel=3,rank}:{item:PlaceSearchItem;locale:string;headingLevel?:2|3;rank?:number}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const H=headingLevel===2?'h2':'h3';
 const href=`${en?'/en':''}/lugar/${item.slug}`;
 const area=[item.address.adminArea3,item.address.adminArea2,item.address.adminArea1].filter(Boolean).join(', ');
 const distance=formatDistance(item.distanceKm,en);
 const level=item.verificationLevel as VerificationLevel;
 const brand=typeof item.attributes.brand==='string'?item.attributes.brand:typeof item.attributes.chain==='string'?item.attributes.chain:null;
 const kind=kindLabel(item.vertical.id,item.attributes.kind,en),health=isHealthVertical(item.vertical.id);
 const phone=checkPlacePhone(item.phone);
 const directions=item.location?directionsLinks(item.location.lat,item.location.lng):null;
 const verified=VERIFIED.has(level);
 const Icon=placeVerticalIcon(item.vertical.id);
 const chip='inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4';
 const permit=item.vertical.id==='pharmacy'?{...pharmacyLicence(item.verificationLevel,en),attr:'data-pharmacy-license'}:health?{...healthPermit(item.verificationLevel,en),attr:'data-health-permit'}:null;
 return <article data-search-item={item.key} data-ranking-reasons={item.ranking_reason.join(' ')}
  className="group relative flex min-w-0 flex-col bg-white px-4 py-3 text-[#162543] shadow-[0_8px_14px_-14px_rgba(15,23,42,0.55)] transition-shadow duration-200 lg:rounded-2xl lg:border lg:border-[#e5e7eb] lg:p-4 lg:shadow-none lg:hover:border-[#d7e1ea] lg:hover:shadow-md">
  <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-4">
   <div className="flex min-w-0 flex-1 items-start gap-2.5 lg:gap-3">
    <span className="relative shrink-0" aria-hidden="true">
     <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-[#EBF5FB] text-[#009FD9] lg:h-16 lg:w-16"><Icon className="h-6 w-6 lg:h-7 lg:w-7"/></span>
     {rank!=null&&<span className="absolute -left-1.5 -top-1.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#162543] px-1 text-[10px] font-bold text-white ring-2 ring-white">{rank}</span>}
    </span>
    <div className="flex min-w-0 flex-1 flex-col gap-1">
     <H className="min-w-0 text-[15px] font-bold leading-[1.15] text-[#111827]">
      <a className="relative z-10 break-words transition-colors hover:text-[#009FD9] focus-visible:underline" href={href}>{item.name}</a>
      {verified&&<BadgeCheck className="ml-1 inline h-4 w-4 -translate-y-px fill-[#009FD9] text-white" aria-label={VERIFICATION_LABELS[level][en?'en':'es']}/>}
     </H>
     <p className="truncate text-[12px] font-semibold text-[#6b7280]">{en?item.vertical.nameEn:item.vertical.nameEs}{kind?<span data-place-kind={String(item.attributes.kind)}> · {kind}</span>:null}{brand?` · ${brand}`:''}</p>
     {item.rating.count>0&&item.rating.average!=null&&<p className="flex items-center gap-1 text-[12px] text-[#6b7280]" data-place-rating>
      <Star className="h-3.5 w-3.5 shrink-0 fill-current text-[#f59e0b]" aria-hidden="true"/>
      <span className="font-bold tabular-nums text-[#162543]">{new Intl.NumberFormat(en?'en-US':'es-CR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(Number(item.rating.average))}</span>
      <span>{item.rating.count} {t(item.rating.count===1?'reseña':'reseñas',item.rating.count===1?'review':'reviews')}</span></p>}
     {(area||distance)&&<p className="flex min-w-0 items-center gap-1 text-[12px] font-medium text-[#526277]"><MapPin className="h-3.5 w-3.5 shrink-0 text-[#94a3b8]" aria-hidden="true"/>
      <span className="truncate">{area}{area&&distance?' · ':''}{distance}</span></p>}
     <ul className="mt-0.5 flex flex-wrap items-center gap-1.5" aria-label={t('Datos del lugar','Place details')}>
      {item.open24h?<li className={`${chip} bg-emerald-50 text-emerald-800`} data-open="24h">{t('Abierto 24 horas','Open 24 hours')}</li>
       :item.openNow===true?<li className={`${chip} bg-emerald-50 text-emerald-800`} data-open="now">{t('Abierto ahora','Open now')}</li>
       :item.openNow===false?<li className={`${chip} bg-slate-100 text-slate-700`} data-open="closed">{t('Cerrado ahora','Closed now')}</li>:null}
      {permit&&<li {...{[permit.attr]:permit.state}} className={`${chip} ${permit.state==='verified'?'bg-emerald-50 text-emerald-900':'bg-slate-100 text-slate-700'}`}>{permit.text}</li>}
      {item.attributes.publicService===true&&<li className={`${chip} bg-slate-100 text-slate-700`} data-public-service>{t('Servicio público','Public service')}</li>}
      {level==='claimed'&&<li className={`${chip} bg-[#EBF5FB] text-[#00739e]`} data-place-claimed>{VERIFICATION_LABELS.claimed[en?'en':'es']}</li>}
     </ul>
     {item.price&&<PlacePriceLine price={item.price} en={en}/>}
    </div>
   </div>
   {/* Desktop: «Llamar» and «Cómo llegar» side by side, «Ver ficha» under them (two rows, like the professionals card). */}
   <div className="flex min-w-0 gap-2 lg:w-[272px] lg:shrink-0 lg:flex-wrap lg:content-center lg:border-l lg:border-[#eef2f6] lg:pl-4" data-place-actions>
    {phone?.kind==='cr'&&<a className={actionSecondary} href={`tel:${phone.tel}`} data-place-phone aria-label={`${t('Llamar','Call')} ${phone.display}`}><Phone className="h-4 w-4 shrink-0" aria-hidden="true"/>{t('Llamar','Call')}</a>}
    {directions&&<a className={actionSecondary} href={directions.osm} rel="noopener noreferrer" target="_blank"><Navigation className="h-4 w-4 shrink-0" aria-hidden="true"/>{t('Cómo llegar','Directions')}</a>}
    <a className={actionPrimary} href={href} tabIndex={-1}>{t('Ver ficha','View details')}</a>
   </div>
  </div>
  {/* Whole card → the place page (stretched low-z overlay, like ProfessionalCard); the name link is the focusable one. */}
  <a href={href} className="absolute inset-0 z-0" tabIndex={-1} aria-hidden="true"/>
 </article>;
}
