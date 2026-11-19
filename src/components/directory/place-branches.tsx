import {MapPin,Navigation} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {BrandBranch,PlaceBrand} from '@/lib/directory/place-features';
import {directionsLinks} from '@/lib/maps/maplibre';
import {BIZ,HeroTile,Stars,ratingNumber,reviewsWord,ring} from './biz-ui';
import {formatDistance} from './place-card';

/**
 * Branch cards (2026-11-19, Yelp model) shared by «Otras sucursales» on a branch page and the list of /marca/<slug>:
 * the section tile as thumbnail (no photos in the brand data), numbered name, stars + count, area, distance when known,
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
 return <article data-brand-branch={branch.slug} className="group relative flex gap-4 rounded-2xl border border-[#e3e9ef] bg-white p-3 transition-shadow hover:shadow-md sm:p-4">
  <HeroTile verticalId={branch.vertical} className="h-20 w-20 shrink-0 rounded-xl sm:h-24 sm:w-24" iconClass="h-8 w-8"/>
  <div className="flex min-w-0 flex-1 flex-col gap-1">
   <h3 className="text-[16px] font-bold leading-snug text-[#111827]">{rank!=null&&<span className="text-[#526277]">{rank}. </span>}
    <a href={href} className={`relative z-10 break-words hover:text-[#007fae] ${ring} rounded`}>{branch.name}</a></h3>
   {branch.ratingCount>0&&branch.rating!=null
    ?<p className="flex items-center gap-1.5 text-sm"><Stars value={branch.rating} size="sm" label={en?`${ratingNumber(branch.rating,en)} out of 5`:`${ratingNumber(branch.rating,en)} de 5`}/><span className="font-semibold">{ratingNumber(branch.rating,en)}</span><span className="text-[#526277]">({branch.ratingCount} {reviewsWord(branch.ratingCount,en)})</span></p>
    :<p className="text-sm text-[#526277]">{en?'No reviews yet':'Sin reseñas todavía'}</p>}
   <p data-brand-branch-area className="flex min-w-0 items-center gap-1 text-sm text-[#526277]"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/><span className="truncate">{branch.area}</span></p>
   {distance&&<p className="text-xs font-semibold text-[#526277]" data-branch-distance>{distance}</p>}
  </div>
  {directions&&<div className="relative z-10 hidden shrink-0 items-center sm:flex">
   <a className={cn(BIZ.secondary,'px-4 text-sm')} href={directions.google} rel="noopener noreferrer" target="_blank"><Navigation aria-hidden="true" className="h-4 w-4"/>{en?'Directions':'Cómo llegar'}</a></div>}
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
