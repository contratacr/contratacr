import {BIZ} from './biz-ui';
import {formatMoney,listingPath,type PublicListing} from '@/lib/directory/listing-public';

/**
 * LOCAL PRO ONLY (multivertical V4/R1 + place page polish): «Anuncios de este negocio» block for /negocios/<slug> of a
 * dealer (vehicle_dealer) or real-estate agency (real_estate). Server-safe. The caller passes the public listings
 * whose place_slug is this place, already ordered by a neutral key (published_at desc). Reserved ones are labelled.
 */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
export function PlaceListingsSection({listings,locale,moreHref,total}:{listings:PublicListing[];locale:string;moreHref?:string;total?:number}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 if(!listings.length)return null;
 const vehicles=listings[0].vertical==='vehiculos';
 return <section aria-labelledby="place-listings" data-place-listings={listings.length} className="space-y-3">
  <h2 id="place-listings" className={BIZ.h2}>{vehicles?t('Vehículos de este negocio','Vehicles from this business'):t('Inmuebles de este negocio','Properties from this business')}</h2>
  <ul className="divide-y divide-[#d7e1ea] rounded-2xl border border-[#d7e1ea]">
   {listings.map(l=><li key={l.code}>
    <a href={listingPath(l,locale)} className={`flex min-h-14 flex-col gap-1 px-4 py-3 hover:bg-[#f6f9fc] min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between ${ring}`}>
     <span className="min-w-0 break-words font-semibold">{l.title}{l.status==='reserved'&&<span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{t('Reservado','Reserved')}</span>}</span>
     <span className="shrink-0 font-bold">{formatMoney(l.priceMinor,l.currency,locale)}{l.vertical==='inmuebles'&&l.operation==='rent'?t(' /mes',' /mo'):''}</span>
    </a></li>)}
  </ul>
  {moreHref&&(total??0)>listings.length&&<p><a className={`inline-flex min-h-11 items-center underline underline-offset-2 ${ring}`} href={moreHref}>{t(`Ver los ${total} anuncios`,`See all ${total} listings`)}</a></p>}
 </section>;
}
