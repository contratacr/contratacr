import {MapPin,Star} from 'lucide-react';
import {ScrollRow} from '@/components/landing/scroll-row';
import type {PlaceSearchItem} from '@/lib/directory/search-schemas';
import {kindLabel,reviewsOn} from '@/lib/directory/place-verticals';
import {placePhotoSrc} from '@/lib/directory/place-photos';
import {formatDistance} from './place-card';
import {ratingNumber,reviewsLabel} from './biz-ui';
import type {StreetView} from '@/lib/directory/street-view';

/**
 * «Lugares similares cerca» (2026-11-26 redesign, Yelp «People also viewed» model): other published places of the same
 * section, nearest first (dir_search, sort=distance). A sideways rail with arrows on the title row (owner 2026-11-27, like
 * «Mejor calificados»), up to the 10 nearest (owner 2026-11-27: no «Ver más» card). Each card is one
 * link with the first approved photo (text only without one) and only real data: rating, kind, area, distance.
 * Own hooks (data-similar-*) so page-wide place hooks keep counting only the place itself.
 */
/** `streetView`: Mapillary «Vista de la calle» when the place has no photo (labelled, credit as plain text: the card is one link). */
export type SimilarPlace={item:PlaceSearchItem;photo:string|null;streetView?:StreetView|null};
export function PlaceSimilar({places,locale,sectionPath,title,moreHref}:{places:SimilarPlace[];locale:string;sectionPath:string;title:string;moreHref:string|null}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 if(!places.length)return null;
 void sectionPath;void moreHref;
 return <section aria-labelledby="place-similar" data-similar-places={places.length} className="-mx-4 sm:-mx-4">
  <ScrollRow title={<h2 id="place-similar" className="pr-24 text-xl font-extrabold tracking-tight text-[#162543] sm:text-2xl">{title}</h2>} prevLabel={t('Anteriores','Previous')} nextLabel={t('Siguientes','Next')}>
   {places.map(({item,photo})=>{
    const kind=kindLabel(item.vertical.id,item.attributes.kind,en);
    const area=item.address.adminArea2??item.address.adminArea1??null,distance=item.distanceKm!=null&&item.distanceKm<0.1?(en?'very close':'muy cerca'):formatDistance(item.distanceKm,en);
    const rated=reviewsOn(item.vertical.id,item.attributes.kind)&&item.rating.count>0&&item.rating.average!=null;
    return <li key={item.slug} className="w-[72%] max-w-[260px] shrink-0 snap-start">
     <a href={`${en?'/en':''}/negocios/${item.slug}`} data-similar-place={item.slug} className="group block h-full overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]">
      {/* Owner 2026-11-27: only real photos of the business; without one the card is text only (no gradient/initial). */}
      {photo&&<span className="relative block aspect-[16/10] overflow-hidden bg-[#dfe8ef]">
       {/* eslint-disable-next-line @next/next/no-img-element -- same-origin photo route */}
       <img src={placePhotoSrc(photo,800)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"/>
      </span>}
      <span className="flex flex-col gap-1 p-3.5">
       <span className="text-[15px] font-bold leading-snug text-[#111827] group-hover:text-[#0083b0]">{item.name}</span>
       {rated&&<span className="flex items-center gap-1 text-[12.5px]" aria-label={en?`${ratingNumber(item.rating.average!)} out of 5, ${reviewsLabel(item.rating.count,en)}`:`${ratingNumber(item.rating.average!)} de 5, ${reviewsLabel(item.rating.count,en)}`}>
        <Star aria-hidden="true" className="h-3.5 w-3.5 fill-[#ff9b32] text-[#ff9b32]"/><span className="font-bold text-[#162543]">{ratingNumber(item.rating.average!)}</span><span className="text-[#68778d]">{reviewsLabel(item.rating.count,en)}</span></span>}
       {kind&&<span className="text-[12.5px] font-semibold text-[#6b7280]">{kind}</span>}
       {(area||distance)&&<span className="flex min-w-0 items-center gap-1 text-[12.5px] text-[#68778d]"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/><span>{area}{area&&distance?' · ':''}{distance}</span></span>}
      </span>
     </a>
    </li>;})}
  </ScrollRow>
 </section>;
}
