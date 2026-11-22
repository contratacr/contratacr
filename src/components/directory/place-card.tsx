import {VERIFICATION_LABELS,type VerificationLevel} from '@/lib/directory/types';
import type {PlaceSearchItem,PlaceSearchPrice,RankingReason} from '@/lib/directory/search-schemas';
import {crDay,money,sourceLine} from '@/lib/directory/price-compare';
import {isHealthVertical,kindLabel} from '@/lib/directory/place-verticals';
import {checkPlacePhone} from '@/lib/directory/phone';
import {directionsLinks} from '@/lib/maps/maplibre';
import {MapPin,Navigation,Phone} from 'lucide-react';
import {VerifiedSeal} from '@/components/ui/verified-seal';
import {HeroTile,RatingLine} from './biz-ui';
import {RESULT_CARD,ResultPhotoStrip,ResultThumb,resultChip} from '@/components/search/result-card-parts';
import {placePriceLevel} from '@/lib/directory/place-amenities';
import {placePhotoSrc} from '@/lib/directory/place-photos';
import type {CardExtra} from '@/lib/directory/card-extras';

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
// Buttons: same pills as the professional card (ProfessionalSchedule: h-11, full width, 13px bold) in the places' brand colours.
const actionBase='relative z-10 inline-flex h-11 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const actionPrimary=`${actionBase} bg-[#009FD9] text-white hover:bg-[#0089bb]`;
const actionSecondary=`${actionBase} border border-[#d7e1ea] bg-white text-[#162543] hover:border-[#b9c8d6] hover:bg-[#f6f9fb]`;

/**
 * Result card of a place, same anatomy as ProfessionalCard (one visual system, owner decision 2026-11-21): round photo (first approved one) or
 * section tile on the left, 52/64 px, photos 2-4 as a strip under the info, carrying the navy rank badge that mirrors its map pin, name + verified seal with the price
 * level on the right of the name line, tags, rating («5.0 7 reseñas»), location, status chips, and in the right column
 * (below the info on phones) the action pills: «Llamar» takes the place WhatsApp has for professionals, «Cómo llegar»
 * the place of «Contactar por llamada». The whole card opens the place page (stretched low-z link); the name link is the
 * one tab stop. Ranking reasons stay machine-readable in `data-ranking-reasons` (/como-ordenamos and the Terms).
 */
export function PlaceCard({item,locale,headingLevel=3,rank,extra}:{item:PlaceSearchItem;locale:string;headingLevel?:2|3;rank?:number;extra?:CardExtra|null}){
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
 const priceLevel=placePriceLevel(item.attributes);
 const permit=item.vertical.id==='pharmacy'?{...pharmacyLicence(item.verificationLevel,en),attr:'data-pharmacy-license'}:health?{...healthPermit(item.verificationLevel,en),attr:'data-health-permit'}:null;
 const rated=item.rating.count>0&&item.rating.average!=null;
 const tags=[en?item.vertical.nameEn:item.vertical.nameEs,kind,brand].filter(Boolean) as string[];
 return <article data-search-item={item.key} data-ranking-reasons={item.ranking_reason.join(' ')}
  className={`${RESULT_CARD} flex flex-col gap-3 text-[#162543] lg:flex-row lg:gap-0`}>
  <div className="flex min-w-0 flex-1 items-start gap-2.5 lg:gap-3">
   {extra?.photo
    ?<span aria-hidden="true" className="shrink-0" data-place-thumb="photo">
     <ResultThumb src={placePhotoSrc(extra.photo,320)} priority={rank!=null&&rank<=2} rank={rank} fallback={null}/>
    </span>
    // Without an approved photo the card is text-first: a compact category badge (no photo-sized empty box).
    :<span aria-hidden="true" className="relative mt-0.5 shrink-0" data-place-thumb="badge">
     <HeroTile verticalId={item.vertical.id} className="h-10 w-10 rounded-xl lg:h-11 lg:w-11" iconClass="h-5 w-5"/>
     {rank!=null&&<span className="absolute -left-1.5 -top-1.5 z-10 hidden h-[20px] w-[20px] items-center justify-center rounded-full bg-[#162543] text-[10px] font-bold text-white ring-2 ring-white lg:flex">{rank}</span>}
    </span>}
   <div className="flex min-w-0 flex-1 flex-col gap-1">
    <div className="flex min-w-0 items-start gap-3 lg:items-center">
     <H className="min-w-0 flex-1 text-[15px] font-bold leading-[1.15] text-[#111827]">
      <a className="relative z-10 break-words transition-colors hover:text-[#009FD9] focus-visible:underline" href={href}>{item.name}</a>
      {verified&&<VerifiedSeal className="ml-1 inline h-4 w-4 -translate-y-px align-middle" label={VERIFICATION_LABELS[level][en?'en':'es']}/>}
     </H>
     {priceLevel&&<span className="shrink-0 text-[13px] font-bold text-[#009FD9]" aria-label={t(`Nivel de precio ${priceLevel.length} de 4`,`Price level ${priceLevel.length} of 4`)}>{priceLevel}</span>}
    </div>
    <p className="truncate text-[12px] font-semibold leading-snug text-[#6b7280]" data-place-tags>{tags.map((x,i)=>i===1&&kind?<span key={x} data-place-kind={String(item.attributes.kind)}>{i?' · ':''}{x}</span>:<span key={x}>{i?' · ':''}{x}</span>)}</p>
    {rated&&<div className="mt-0.5" data-place-rating><RatingLine average={Number(item.rating.average)} count={item.rating.count} en={en} compact/></div>}
    {(area||distance)&&<p className="flex min-w-0 items-center gap-1 text-[12.5px] font-medium text-[#68778d]"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/>
     <span className="truncate">{area}{area&&distance?' · ':''}{distance}</span></p>}
    <ul className="mt-0.5 flex flex-wrap items-center gap-1.5" aria-label={t('Datos del lugar','Place details')}>
     {item.open24h?<li className={`${resultChip('ok')}`} data-open="24h">{t('Abierto 24 horas','Open 24 hours')}</li>
      :item.openNow===true?<li className={`${resultChip('ok')}`} data-open="now">{t('Abierto ahora','Open now')}</li>
      :item.openNow===false?<li className={`${resultChip('bad')}`} data-open="closed">{t('Cerrado ahora','Closed now')}</li>:null}
     {permit&&<li {...{[permit.attr]:permit.state}} className={`${resultChip(permit.state==='verified'?'ok':'neutral')}`}>{permit.text}</li>}
     {item.attributes.publicService===true&&<li className={`${resultChip('neutral')}`} data-public-service>{t('Servicio público','Public service')}</li>}
     {level==='claimed'&&<li className={`${resultChip('brand')}`} data-place-claimed>{VERIFICATION_LABELS.claimed[en?'en':'es']}</li>}
    </ul>
    {item.price&&<PlacePriceLine price={item.price} en={en}/>}
    {extra?.snippet&&<p className="line-clamp-1 text-[12.5px] italic text-[#334155]" data-place-snippet>{'"'}{extra.snippet}{'"'}</p>}
    <ResultPhotoStrip className="mt-1" photos={(extra?.photos??[]).slice(1,4).map(u=>placePhotoSrc(u,320))}/>
   </div>
  </div>
  {(phone?.kind==='cr'||directions)&&<div className="flex min-w-0 flex-col gap-2 lg:ml-5 lg:w-[240px] lg:shrink-0 lg:justify-center lg:border-l lg:border-[#eef2f6] lg:pl-5" data-place-actions>
   {phone?.kind==='cr'&&<a className={actionPrimary} href={`tel:${phone.tel}`} data-place-phone aria-label={`${t('Llamar','Call')} ${phone.display}`}><Phone className="h-4 w-4 shrink-0" aria-hidden="true"/>{t('Llamar','Call')}</a>}
   {directions&&<a className={phone?.kind==='cr'?actionSecondary:actionPrimary} href={directions.google} rel="noopener noreferrer" target="_blank"><Navigation className="h-4 w-4 shrink-0" aria-hidden="true"/>{t('Cómo llegar','Directions')}</a>}
  </div>}
  {/* Whole card → the place page (stretched low-z overlay, like ProfessionalCard); the name link is the focusable one. */}
  <a href={href} className="absolute inset-0 z-0" tabIndex={-1} aria-hidden="true"/>
 </article>;
}
