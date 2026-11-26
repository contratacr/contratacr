import {MapPin,Star} from 'lucide-react';
import type {PlaceSearchItem} from '@/lib/directory/search-schemas';
import {kindLabel,reviewsOn} from '@/lib/directory/place-verticals';
import {placePhotoSrc} from '@/lib/directory/place-photos';
import {formatDistance} from './place-card';
import {ratingNumber,reviewsLabel} from './biz-ui';

/**
 * «Lugares similares cerca» (2026-11-26 redesign, Yelp «People also viewed» model): other published places of the same
 * section, nearest first (dir_search, sort=distance). Phones: a sideways rail of cards; from sm a grid. Each card is one
 * link with the first approved photo (or the section photo, dimmed) and only real data: rating, kind, area, distance.
 * Own hooks (data-similar-*) so page-wide place hooks keep counting only the place itself.
 */
const SHADES=['bg-[radial-gradient(120%_100%_at_100%_0%,#2bc0f2_0%,#0083b0_55%,#162543_100%)]','bg-[radial-gradient(120%_100%_at_0%_0%,#57d0f5_0%,#009FD9_45%,#0b3a5c_100%)]','bg-[radial-gradient(120%_100%_at_50%_0%,#3a5a8c_0%,#162543_70%)]'];
export type SimilarPlace={item:PlaceSearchItem;photo:string|null};
export function PlaceSimilar({places,locale,sectionPath,title,moreHref}:{places:SimilarPlace[];locale:string;sectionPath:string;title:string;moreHref:string|null}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 if(!places.length)return null;
 void sectionPath;
 return <section aria-labelledby="place-similar" data-similar-places={places.length} className="space-y-4">
  <div className="flex items-end justify-between gap-3">
   <h2 id="place-similar" className="text-xl font-extrabold tracking-tight text-[#162543] sm:text-2xl">{title}</h2>
   {moreHref&&<a href={moreHref} className="shrink-0 text-[13.5px] font-bold text-[#0083b0] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]">{t('Ver más','See more')}</a>}
  </div>
  <ul className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
   {places.map(({item,photo})=>{
    const kind=kindLabel(item.vertical.id,item.attributes.kind,en);
    const area=item.address.adminArea2??item.address.adminArea1??null,distance=formatDistance(item.distanceKm,en);
    const rated=reviewsOn(item.vertical.id,item.attributes.kind)&&item.rating.count>0&&item.rating.average!=null;
    // No photo: a brand gradient (one of three, by name) with the initial — never a stock photo repeated on every card.
    const shade=SHADES[[...item.name].reduce((a,c)=>a+c.charCodeAt(0),0)%SHADES.length]!;
    return <li key={item.slug} className="w-[72%] max-w-[260px] shrink-0 snap-start sm:w-auto sm:max-w-none">
     <a href={`${en?'/en':''}/lugar/${item.slug}`} data-similar-place={item.slug} className="group block h-full overflow-hidden rounded-2xl border border-[#e5e9ee] bg-white shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]">
      <span className="relative block aspect-[16/10] overflow-hidden bg-[#dfe8ef]">
       {/* eslint-disable-next-line @next/next/no-img-element -- same-origin photo route */}
       {photo?<img src={placePhotoSrc(photo,800)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"/>
        :<span aria-hidden="true" className={`grid h-full w-full place-items-center ${shade}`}><span className="text-[44px] font-extrabold leading-none text-white/90 [text-shadow:0_2px_12px_rgba(0,0,0,0.2)]">{[...item.name.trim()][0]?.toUpperCase()}</span></span>}
      </span>
      <span className="flex flex-col gap-1 p-3.5">
       <span className="line-clamp-2 text-[15px] font-bold leading-snug text-[#111827] group-hover:text-[#0083b0]">{item.name}</span>
       {rated&&<span className="flex items-center gap-1 text-[12.5px]" aria-label={en?`${ratingNumber(item.rating.average!)} out of 5, ${reviewsLabel(item.rating.count,en)}`:`${ratingNumber(item.rating.average!)} de 5, ${reviewsLabel(item.rating.count,en)}`}>
        <Star aria-hidden="true" className="h-3.5 w-3.5 fill-[#ff9b32] text-[#ff9b32]"/><span className="font-bold text-[#162543]">{ratingNumber(item.rating.average!)}</span><span className="text-[#68778d]">{reviewsLabel(item.rating.count,en)}</span></span>}
       {kind&&<span className="truncate text-[12.5px] font-semibold text-[#6b7280]">{kind}</span>}
       {(area||distance)&&<span className="flex min-w-0 items-center gap-1 text-[12.5px] text-[#68778d]"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/><span className="truncate">{area}{area&&distance?' · ':''}{distance}</span></span>}
      </span>
     </a>
    </li>;})}
  </ul>
 </section>;
}
