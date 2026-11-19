import type {ListingSearchItem} from '@/lib/directory/search-schemas';
import {WhyHere,formatDistance} from './place-card';
import {proMoney} from '@/lib/pro/money';

/**
 * LOCAL PRO ONLY (multivertical F6): result card of a vehicle or property listing. Server component, not imported
 * yet. Reserved listings stay visible with a text badge «Reservado». Location is always approximate (fuzzed
 * ~500 m). Seller declarations are not shown here; the detail page labels them as declarations.
 */
const TYPE_LABELS:Record<string,{es:string;en:string}>={
 car:{es:'Automóvil',en:'Car'},suv:{es:'SUV',en:'SUV'},pickup:{es:'Pickup',en:'Pickup'},van:{es:'Microbús o van',en:'Van'},truck:{es:'Camión',en:'Truck'},
 motorcycle:{es:'Motocicleta',en:'Motorcycle'},atv:{es:'Cuadraciclo',en:'ATV'},
 house:{es:'Casa',en:'House'},apartment:{es:'Apartamento',en:'Apartment'},condo:{es:'Condominio',en:'Condo'},lot:{es:'Lote',en:'Lot'},office:{es:'Oficina',en:'Office'},
 commercial:{es:'Local comercial',en:'Commercial space'},warehouse:{es:'Bodega',en:'Warehouse'},farm:{es:'Finca',en:'Farm'},room:{es:'Habitación',en:'Room'},
};
const FUEL:Record<string,{es:string;en:string}>={gasoline:{es:'Gasolina',en:'Gasoline'},diesel:{es:'Diésel',en:'Diesel'},hybrid:{es:'Híbrido',en:'Hybrid'},
 plugin_hybrid:{es:'Híbrido enchufable',en:'Plug-in hybrid'},electric:{es:'Eléctrico',en:'Electric'},lpg:{es:'Gas LP',en:'LPG'},other:{es:'Otro',en:'Other'}};
const TRANSMISSION:Record<string,{es:string;en:string}>={manual:{es:'Manual',en:'Manual'},automatic:{es:'Automático',en:'Automatic'},cvt:{es:'CVT',en:'CVT'},other:{es:'Otra',en:'Other'}};

export function slugifyTitle(title:string){
 return title.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'anuncio';
}
/** /vehiculos/v/<slug>-<code> (V1 doc). Property detail route is not defined yet: /inmuebles/i/<slug>-<code> assumed. */
export function listingHref(item:Pick<ListingSearchItem,'vertical'|'title'|'code'>,en:boolean){
 return `${en?'/en':''}/${item.vertical}/${item.vertical==='vehiculos'?'v':'i'}/${slugifyTitle(item.title)}-${item.code}`;
}
export function formatPrice(minor:number,currency:'CRC'|'USD',en:boolean){
 if(currency==='CRC')return proMoney(Math.round(minor/100),en);
 return new Intl.NumberFormat(en?'en-US':'es-CR',{style:'currency',currency,maximumFractionDigits:0}).format(minor/100);
}

export function ListingCard({item,locale,headingLevel=3}:{item:ListingSearchItem;locale:string;headingLevel?:2|3}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,L=(m:Record<string,{es:string;en:string}>,k:string|null|undefined)=>k?(m[k]?.[en?'en':'es']??k):null;
 const H=headingLevel===2?'h2':'h3';
 const nf=new Intl.NumberFormat(en?'en-US':'es-CR');
 const area=[item.address.adminArea2,item.address.adminArea1].filter(Boolean).join(', ');
 const distance=formatDistance(item.distanceKm,en);
 const facts:string[]=[];
 if(item.vehicle){const v=item.vehicle;facts.push(String(v.year));if(v.mileageKm!=null)facts.push(`${nf.format(v.mileageKm)} km`);
  const tr=L(TRANSMISSION,v.transmission),fu=L(FUEL,v.fuel);if(tr)facts.push(tr);if(fu)facts.push(fu);if(v.condition==='new')facts.push(t('Nuevo','New'));}
 if(item.property){const p=item.property;facts.push(p.operation==='rent'?t('Alquiler','For rent'):t('Venta','For sale'));facts.push(L(TYPE_LABELS,p.type)!);
  if(p.bedrooms!=null)facts.push(en?`${p.bedrooms} bedroom${p.bedrooms===1?'':'s'}`:`${p.bedrooms} ${p.bedrooms===1?'habitación':'habitaciones'}`);
  const m2=p.builtM2??p.lotM2;if(m2!=null)facts.push(`${nf.format(Number(m2))} m²`);}
 return <article data-search-item={item.key} data-listing-status={item.status} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-[#162543]">
  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
   <span>{item.vehicle?`${item.vehicle.makeName} · ${L(TYPE_LABELS,item.vehicle.type)}`:L(TYPE_LABELS,item.property?.type)}</span>
   {item.status==='reserved'&&<span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900" data-reserved>{t('Reservado','Reserved')}</span>}
  </div>
  <H className="text-lg font-bold leading-snug"><a className="underline-offset-2 hover:underline focus-visible:underline" href={listingHref(item,en)}>{item.title}</a></H>
  <p className="text-xl font-extrabold">{formatPrice(item.price.minor,item.price.currency,en)}
   {item.property?.operation==='rent'&&<span className="text-sm font-medium">{t(' por mes',' per month')}</span>}</p>
  {item.price.currency==='USD'&&item.price.crcNorm!=null&&<p className="text-xs text-slate-600">{t('Aprox. ','Approx. ')}{formatPrice(item.price.crcNorm,'CRC',en)}{item.price.fxRateDate?t(` (tipo de cambio del ${item.price.fxRateDate})`,` (exchange rate of ${item.price.fxRateDate})`):''}</p>}
  {facts.length>0&&<p className="text-sm text-slate-700">{facts.join(' · ')}</p>}
  {(area||distance)&&<p className="text-sm text-slate-700">{area}{area&&distance?' · ':''}{distance}<span className="sr-only">{t(' (ubicación aproximada)',' (approximate location)')}</span></p>}
  <p className="text-sm text-slate-600">{item.sellerKind==='business'
   ?<>{item.placeSlug?<a className="underline underline-offset-2" href={`${en?'/en':''}/lugar/${item.placeSlug}`}>{item.placeName}</a>:t('Negocio','Business')}{item.sellerBusinessVerified?t(' · Negocio verificado',' · Verified business'):''}</>
   :t('Particular','Private seller')}</p>
  <WhyHere reasons={item.ranking_reason} en={en}/>
 </article>;
}
