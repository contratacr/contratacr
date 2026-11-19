import {VERIFICATION_LABELS,type VerificationLevel} from '@/lib/directory/types';
import type {PlaceSearchItem,PlaceSearchPrice,RankingReason} from '@/lib/directory/search-schemas';
import {crDay,money,sourceLine} from '@/lib/directory/price-compare';
import {isHealthVertical,kindLabel} from '@/lib/directory/place-verticals';
import {checkPlacePhone} from '@/lib/directory/phone';

/**
 * LOCAL PRO ONLY (multivertical F6): result card of a place (restaurant, fuel station, pharmacy, supermarket,
 * agency). Server component, not imported yet (see F6 wiring notes). Status is given in text, never by colour
 * alone; the whole title is the link (one tab stop per card); works at 390 px (single column, wrapping chips).
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

export function WhyHere({reasons,en}:{reasons:RankingReason[];en:boolean}){
 return <details className="text-sm text-slate-600">
  <summary className="inline-flex min-h-11 cursor-pointer items-center underline underline-offset-2">{en?'Why is this here?':'¿Por qué aparece aquí?'}</summary>
  <ul className="list-disc space-y-1 pl-5">{reasons.map(r=><li key={r} data-ranking-reason={r}>{REASON_LABELS[r]?.[en?'en':'es']??r}</li>)}</ul>
  <p className="mt-1">{en?'Order never depends on payment.':'El orden nunca depende de pagos.'}</p>
 </details>;
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
 if(price.kind==='menu')return <p className="text-sm" data-place-price="menu" data-price-amount={price.amount}>
  <span className="font-semibold">{t('Precio típico','Typical price')} {money(price.amount,price.currency,en)}</span>
  <span className="text-slate-600"> · {t(`mediana de ${price.dishes} ${price.dishes===1?'plato':'platos'} del menú publicado por el negocio, con IVA y servicio`,`median of ${price.dishes} ${price.dishes===1?'dish':'dishes'} on the menu published by the business, VAT and service included`)} · {t('actualizado el ','updated on ')}{crDay(price.updatedAt,en)}</span></p>;
 const o=price.observation;
 return <p className="text-sm" data-place-price="product" data-price-amount={o.price}>
  <span className="font-semibold">{price.item.name}{price.item.presentation?` (${price.item.presentation})`:''}: {money(o.price,o.currency,en)}</span>
  <span className="text-slate-600"> · {sourceLine(o,en)}</span></p>;
}

export function PlaceCard({item,locale,headingLevel=3}:{item:PlaceSearchItem;locale:string;headingLevel?:2|3}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const H=headingLevel===2?'h2':'h3';
 const href=`${en?'/en':''}/lugar/${item.slug}`;
 const area=[item.address.adminArea3,item.address.adminArea2,item.address.adminArea1].filter(Boolean).join(', ');
 const distance=formatDistance(item.distanceKm,en);
 const level=item.verificationLevel as VerificationLevel;
 const brand=typeof item.attributes.brand==='string'?item.attributes.brand:typeof item.attributes.chain==='string'?item.attributes.chain:null;
 const kind=kindLabel(item.vertical.id,item.attributes.kind,en),health=isHealthVertical(item.vertical.id);
 const phone=checkPlacePhone(item.phone);
 return <article data-search-item={item.key} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-[#162543]">
  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{en?item.vertical.nameEn:item.vertical.nameEs}{kind?<span data-place-kind={String(item.attributes.kind)}> · {kind}</span>:null}{brand?` · ${brand}`:''}</p>
  <H className="text-lg font-bold leading-snug"><a className="underline-offset-2 hover:underline focus-visible:underline" href={href}>{item.name}</a></H>
  {(area||distance)&&<p className="text-sm text-slate-700">{area}{area&&distance?' · ':''}{distance}</p>}
  {item.address.line&&<p className="text-sm text-slate-700" data-place-address>{item.address.line}</p>}
  {/* Only a valid Costa Rican number is a tel: link (lib/directory/phone.ts); others stay on the place page under «Otros datos». */}
  {phone?.kind==='cr'&&<p className="text-sm" data-place-phone><a className="underline underline-offset-2" href={`tel:${phone.tel}`}>{phone.display}</a></p>}
  <ul className="flex flex-wrap gap-2 text-sm" aria-label={t('Datos del lugar','Place details')}>
   {item.open24h?<li className="rounded-full border border-emerald-700 px-3 py-1 text-emerald-800" data-open="24h">{t('Abierto 24 horas','Open 24 hours')}</li>
    :item.openNow===true?<li className="rounded-full border border-emerald-700 px-3 py-1 text-emerald-800" data-open="now">{t('Abierto ahora','Open now')}</li>
    :item.openNow===false?<li className="rounded-full border border-slate-400 px-3 py-1 text-slate-700" data-open="closed">{t('Cerrado ahora','Closed now')}</li>:null}
   {item.rating.count>0&&item.rating.average!=null&&<li className="rounded-full border border-slate-300 px-3 py-1">
    <span aria-hidden="true">★ </span>{new Intl.NumberFormat(en?'en-US':'es-CR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(Number(item.rating.average))} / 5 · {item.rating.count} {t(item.rating.count===1?'reseña':'reseñas',item.rating.count===1?'review':'reviews')}</li>}
   {item.vertical.id==='pharmacy'&&(()=>{const lic=pharmacyLicence(item.verificationLevel,en);return <li data-pharmacy-license={lic.state}
    className={`rounded-full px-3 py-1 ${lic.state==='verified'?'bg-emerald-50 font-semibold text-emerald-900':'border border-slate-300 text-slate-700'}`}>{lic.text}</li>;})()}
   {health&&(()=>{const lic=healthPermit(item.verificationLevel,en);return <li data-health-permit={lic.state}
    className={`rounded-full px-3 py-1 ${lic.state==='verified'?'bg-emerald-50 font-semibold text-emerald-900':'border border-slate-300 text-slate-700'}`}>{lic.text}</li>;})()}
   {item.attributes.publicService===true&&<li className="rounded-full border border-slate-300 px-3 py-1" data-public-service>{t('Servicio público','Public service')}</li>}
   {/* «Datos públicos sin verificar» is stated once above the result list (search-results.tsx), not on every card. */}
   {VERIFICATION_LABELS[level]&&level!=='imported'&&level!=='unverified'&&!((item.vertical.id==='pharmacy'||health)&&level==='license_verified')&&<li className="rounded-full border border-slate-300 px-3 py-1">{VERIFICATION_LABELS[level][en?'en':'es']}</li>}
  </ul>
  {item.price&&<PlacePriceLine price={item.price} en={en}/>}
  <WhyHere reasons={item.ranking_reason} en={en}/>
 </article>;
}
