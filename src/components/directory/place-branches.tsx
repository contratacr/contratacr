import {MapPin,Navigation} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {BrandBranch,PlaceBrand} from '@/lib/directory/place-features';
import {directionsLinks} from '@/lib/maps/maplibre';
import {BIZ,HeroTile,RatingLine,ring} from './biz-ui';
import {formatDistance} from './place-card';
import {ResultThumb} from '@/components/search/result-card-parts';

/**
 * Branch cards (2026-11-19, Yelp model) shared by «Otras sucursales» on a branch page and the list of /marca/<slug>:
 * the section tile as square thumbnail (no photos in the brand data; same slot as PlaceCard), numbered name, stars + count, area, distance when known,
 * «Cómo llegar». Same visual family as PlaceCard. The whole card opens the branch (stretched link, one tab stop).
 */
const km=(a:{lat:number;lng:number},b:{lat:number;lng:number})=>{const r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLng=(b.lng-a.lng)*r;
 const h=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLng/2)**2;return 12742*Math.asin(Math.sqrt(h));};
export type BranchWithDistance=BrandBranch&{distanceKm:number|null};
/** Nearest other branches of the same brand (by straight-line distance; without a location, the first ones by province). */
export function nearestBranches(branches:BrandBranch[],slug:string,here:{lat:number;lng:number}|null,n:number):BranchWithDistance[]{
 const others=branches.filter(b=>b.slug!==slug).map(b=>({...b,distanceKm:here&&b.lat!=null&&b.lng!=null?km(here,{lat:b.lat,lng:b.lng}):null}));
 return (here?others.sort((a,b)=>(a.distanceKm??1e9)-(b.distanceKm??1e9)):others).slice(0,n);
}
export function BranchCard({branch,locale,rank,distanceKm}:{branch:BrandBranch;locale:string;rank?:number;distanceKm?:number|null}){
 const en=locale==='en',href=`${en?'/en':''}/lugar/${branch.slug}`;
 const directions=branch.lat!=null&&branch.lng!=null?directionsLinks(branch.lat,branch.lng):null;
 const distance=formatDistance(distanceKm??null,en);
 return <article data-brand-branch={branch.slug} className="group relative flex items-start gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-3 transition-shadow hover:border-[#d7e1ea] hover:shadow-md sm:p-4">
  <span aria-hidden="true" className="shrink-0">
   <ResultThumb rank={rank} fallback={<HeroTile verticalId={branch.vertical} className="h-full w-full" iconClass="h-10 w-10 lg:h-14 lg:w-14"/>}/>
  </span>
  <div className="flex min-w-0 flex-1 flex-col gap-1">
   <h3 className="text-[15px] font-bold leading-[1.15] text-[#111827]">
    <a href={href} className={`relative z-10 break-words hover:text-[#009FD9] ${ring} rounded`}>{branch.name}</a></h3>
   <RatingLine average={branch.rating} count={branch.ratingCount} en={en} compact/>
   <p data-brand-branch-area className="flex min-w-0 items-center gap-1 text-[12.5px] font-medium text-[#68778d]"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/><span className="truncate">{branch.area}</span></p>
   {distance&&<p className="text-xs font-semibold text-[#68778d]" data-branch-distance>{distance}</p>}
  </div>
  {directions&&<div className="relative z-10 hidden shrink-0 items-center self-center sm:flex">
   <a className={cn(BIZ.secondary,'px-4')} href={directions.google} rel="noopener noreferrer" target="_blank"><Navigation aria-hidden="true" className="h-4 w-4"/>{en?'Directions':'Cómo llegar'}</a></div>}
  <a href={href} className="absolute inset-0 z-0 rounded-2xl" tabIndex={-1} aria-hidden="true"/>
 </article>;
}
export function PlaceBranches({brand,branches,locale}:{brand:PlaceBrand;branches:BranchWithDistance[];locale:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 return <section id="sucursales" aria-labelledby="place-branches" data-place-branches={branches.length} className="scroll-mt-24 space-y-4">
  <div className="flex flex-wrap items-end justify-between gap-3">
   <h2 id="place-branches" className={BIZ.h2}>{t('Otras sucursales','Other branches')}</h2>
   <a className={`text-sm ${BIZ.link}`} href={`${en?'/en':''}/marca/${brand.slug}`}>{t(`Ver las ${brand.branches} sucursales de ${brand.name}`,`See all ${brand.branches} ${brand.name} branches`)}</a>
  </div>
  <ul className="grid gap-3">{branches.map(b=><li key={b.slug}><BranchCard branch={b} locale={locale} distanceKm={b.distanceKm}/></li>)}</ul>
 </section>;
}
