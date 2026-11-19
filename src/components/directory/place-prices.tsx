import type {PublicPriceCurrent,PublicPriceItem,PublicPriceObservation} from '@/lib/directory/price-schemas';
import {proMoney} from '@/lib/pro/money';

/**
 * LOCAL PRO ONLY (multivertical P1): prices of a place (public_price_current). Every price shows its source, date and
 * validity; a stale price is shown greyed as «desactualizado», never as current. Prescription medicines never have
 * observations (blocked in SQL): this list never shows them and there is no report form for them.
 */
const CONFIDENCE:Record<PublicPriceObservation['confidence'],{es:string;en:string}>={
 official:{es:'Precio oficial',en:'Official price'},business:{es:'Informado por el negocio',en:'Reported by the business'},
 // M1: user reports carry the source «reportado por usuarios» and their confidence (one person = unconfirmed).
 community_verified:{es:'Reportado por usuarios · confirmado por varias personas',en:'Reported by users · confirmed by several people'},community:{es:'Reportado por usuarios · sin confirmar',en:'Reported by users · unconfirmed'},
};
/** Source labels are stored bilingual («Español / English»); show only the page language. */
const bilingual=(text:string,en:boolean)=>{const parts=text.split(' / ');return parts.length===2?parts[en?1:0]!.trim():text;};
const money=(n:number,currency:string,en:boolean)=>currency==='CRC'?proMoney(n,en):new Intl.NumberFormat(en?'en-US':'es-CR',{style:'currency',currency,maximumFractionDigits:2}).format(n);
const day=(iso:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(iso));

function Observation({o,en,stale}:{o:PublicPriceObservation;en:boolean;stale:boolean}){
 const t=(es:string,english:string)=>en?english:es;
 return <div className={stale?'text-slate-500':''}>
  <p className="text-xl font-bold" data-price-value={o.price}>{money(o.price,o.currency,en)}{stale&&<span className="ml-2 rounded-full border border-slate-300 px-2 py-0.5 text-xs font-semibold" data-price-stale>{t('desactualizado','out of date')}</span>}</p>
  {/* The source name is shown only for official prices (ARESEP/MEIC); business and community prices are described by
      their confidence label (the stored attribution of those sources is a bilingual internal label). */}
  <p className="text-sm">{CONFIDENCE[o.confidence][en?'en':'es']}{o.regulated||o.sourceKind.startsWith('official')?` · ${bilingual(o.source.attribution,en)}`:''}{o.sourceRef?` · ${o.sourceRef}`:''}</p>
  <p className="text-sm">{t('Dato del ','As of ')}{day(o.observedAt,en)}{o.validTo?` · ${t('vigente hasta el ','valid until ')}${day(o.validTo,en)}`:''}</p>
 </div>;
}

export function PlacePrices({prices,locale}:{prices:PublicPriceCurrent;locale:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const items=prices.items.filter((i:PublicPriceItem)=>i.current||i.lastKnown);
 if(!items.length)return null;
 return <section aria-labelledby="place-prices" className="space-y-3" data-place-prices>
  <h2 id="place-prices" className="text-lg font-bold">{t('Precios','Prices')}</h2>
  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">{items.map(i=><li key={i.item.slug} data-price-item={i.item.slug} className="rounded-2xl border border-[#d7e1ea] p-4">
   <h3 className="font-semibold">{i.item.name}{i.item.presentation?<span className="font-normal text-slate-600"> · {i.item.presentation}</span>:null}</h3>
   {i.current?<Observation o={i.current} en={en} stale={false}/>:i.lastKnown?<Observation o={i.lastKnown} en={en} stale/>:null}
  </li>)}</ul>
  <p className="text-sm text-slate-700">{t('Los precios pueden cambiar. Confirme con el negocio antes de comprar.','Prices may change. Please confirm with the business before buying.')}</p>
 </section>;
}

/** National regulated fuel price (ARESEP) for /gasolineras: one banner, same price at every station. */
export function NationalFuelPrices({prices,locale}:{prices:PublicPriceCurrent;locale:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const items=prices.items.filter(i=>i.current);
 if(!items.length)return null;
 const ref=items[0]!.current!;
 return <aside aria-labelledby="fuel-national" data-national-fuel className="space-y-2 rounded-2xl border border-[#d7e1ea] bg-[#F7FAFC] p-4 text-[#162543]">
  <h2 id="fuel-national" className="text-lg font-bold">{t('Precio nacional de los combustibles','National fuel prices')}</h2>
  <ul className="flex flex-wrap gap-x-6 gap-y-1">{items.map(i=><li key={i.item.slug} data-price-item={i.item.slug}><span className="font-semibold">{i.item.name}:</span> {money(i.current!.price,i.current!.currency,en)} / {i.item.unitBase==='l'?t('litro','liter'):i.item.unitBase}</li>)}</ul>
  <p className="text-sm text-slate-700">{t('Precio regulado por ARESEP, igual en todas las estaciones del país.','Price regulated by ARESEP, the same at every station in the country.')} {ref.sourceRef?`${t('Resolución','Resolution')} ${ref.sourceRef}. `:''}{t('Vigente desde el ','Valid from ')}{day(ref.validFrom,en)}{ref.validTo?`${t(' hasta el ',' to ')}${day(ref.validTo,en)}`:''}.</p>
 </aside>;
}
