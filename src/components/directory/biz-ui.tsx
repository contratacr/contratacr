import {createElement,type ReactNode} from 'react';
import {Star} from 'lucide-react';
import {placeVerticalIcon} from './place-photo-placeholder';

/**
 * Shared page system (2026-11-19, owner request «revise cómo lo hace Yelp»): Yelp's MODEL — header with photos, rating
 * and open status, an action bar, two columns with a sticky contact card, a rating summary with 5→1 bars — in the
 * ContrataCR look (navy #162543 / cyan #009FD9, Inter, rounded cards). Used by /lugar, /marca, place result cards and
 * the professional profile. Server-safe (no hooks).
 */
export const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
// One visual system with the professional profile (profile-client.tsx / professional-schedule.tsx): same card, border,
// shadow, section heading, pill height and button colours. Places and professionals must not drift apart.
const pill=`inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-5 text-[13px] font-bold transition-colors ${ring}`;
export const BIZ={
 primary:`${pill} bg-[#009FD9] text-white hover:bg-[#0089bb]`,
 accent:`${pill} bg-[#009FD9] text-white hover:bg-[#0089bb]`,
 secondary:`${pill} border border-[#d7e1ea] bg-white text-[#162543] hover:border-[#b9c8d6] hover:bg-[#f6f9fb]`,
 card:'rounded-2xl border border-[#e5e7eb] bg-white shadow-sm',
 section:'scroll-mt-24 space-y-4',
 h2:'text-lg font-semibold text-[#162543]',
 sub:'text-sm text-[#68778d]',
 link:`font-semibold text-[#007fae] underline-offset-2 hover:underline ${ring}`,
 chip:'inline-flex items-center rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[12px] font-semibold text-[#4b5563]',
 /** Contact-card heading, same as «Consultar precio» in the professional contact card. */
 cardTitle:'text-xl font-bold leading-tight text-[#009FD9]',
 /** Avatar slot of the identity header (same size as the professional avatar). */
 avatar:'h-[72px] w-[72px] sm:h-[88px] sm:w-[88px]',
};

/** Soft section colours of the hero tile / thumbnail when there are no photos (never stock photos). */
const HUES:Record<string,[string,string,string]>={
 restaurant:['#fff1e6','#ffd9bf','#b5541c'],cafe_bar:['#f6ede4','#e8d3bd','#7a4a26'],fuel:['#e8f3ff','#c9e0fb','#1d5fa8'],
 pharmacy:['#e7f7f1','#c4ecdc','#137a55'],grocery:['#eef8e8','#d3eec4','#3d7a1f'],convenience:['#fff6df','#fbe5ae','#8a6100'],
 hardware:['#f2f0ec','#ddd7cc','#5b5146'],lodging:['#eef0ff','#d4d9fb','#3a45a8'],health:['#e6f6fb','#c3e8f5','#00739e'],
 vet_pets:['#fdf0f3','#f7d3dd','#a3324f'],auto_services:['#eef1f5','#d5dce6','#334155'],beauty:['#fbeffa','#f2d0ef','#94307f'],
 fitness:['#fff0ea','#fbd1c1','#b23d14'],tours:['#e9f8f4','#c2ebe0','#0f7660'],banking:['#edf1f7','#d3dcea','#162543'],
};
export const verticalHue=(id:string):[string,string,string]=>HUES[id]??['#eaf6fb','#cfeaf5','#0b7fab'];

/** Square/rect tile with the section icon on its colour (results thumbnail, hero when there are no photos). */
export function HeroTile({verticalId,className='',iconClass='h-8 w-8'}:{verticalId:string;className?:string;iconClass?:string}){
 const [from,to,ink]=verticalHue(verticalId);
 return <span aria-hidden="true" data-hero-tile={verticalId} className={`grid place-items-center overflow-hidden ${className}`}
  style={{backgroundImage:`radial-gradient(120% 90% at 85% 10%, ${to} 0%, transparent 60%), linear-gradient(135deg, ${from}, ${to})`,color:ink}}>
  {createElement(placeVerticalIcon(verticalId),{'aria-hidden':true,className:iconClass,strokeWidth:1.75})}</span>;
}

/** Five stars with halves; the text alternative is given once (`label`). */
export function Stars({value,size='md',label}:{value:number;size?:'sm'|'md'|'lg';label?:string}){
 const px=size==='lg'?'h-6 w-6':size==='sm'?'h-3.5 w-3.5':'h-[18px] w-[18px]';
 return <span className="inline-flex items-center gap-0.5" role={label?'img':undefined} aria-label={label} aria-hidden={label?undefined:true} data-stars={value}>
  {[1,2,3,4,5].map(i=>{const fill=Math.max(0,Math.min(1,value-(i-1)));
   return <span key={i} className={`relative inline-block ${px}`}>
    <Star aria-hidden="true" className={`absolute inset-0 ${px} fill-[#e5e9ef] text-[#e5e9ef]`}/>
    {fill>0&&<span className="absolute inset-0 overflow-hidden" style={{width:`${fill*100}%`}}><Star aria-hidden="true" className={`${px} fill-[#f5a623] text-[#f5a623]`}/></span>}
   </span>;})}
 </span>;
}

/** Same format as the professional profile and cards: «5.0» (toFixed(1)) in both languages. */
export const ratingNumber=(n:number,_en?:boolean)=>n.toFixed(1);
export const reviewsWord=(n:number,en:boolean)=>en?(n===1?'review':'reviews'):(n===1?'reseña':'reseñas');
export const reviewsLabel=(n:number,en:boolean)=>`${n} ${reviewsWord(n,en)}`;

/** Rating line, same anatomy as the professional profile: orange star, «5.0», «N reseñas» (no stars row, no parentheses). */
export function RatingLine({average,count,en,href,compact}:{average:number|null;count:number;en:boolean;href?:string;compact?:boolean}){
 if(!count||average==null)return <p className="text-[13px] text-[#68778d]" data-rating-line="none">{en?'No reviews yet':'Sin reseñas todavía'}</p>;
 const label=en?`${ratingNumber(average)} out of 5, ${reviewsLabel(count,en)}`:`${ratingNumber(average)} de 5, ${reviewsLabel(count,en)}`;
 const body=<><Star aria-hidden="true" className="h-3.5 w-3.5 shrink-0 fill-[#ff9b32] text-[#ff9b32]"/>
  <span className={`font-bold text-[#162543] ${compact?'text-[13px]':'text-[14px] sm:text-[15px]'}`}>{ratingNumber(average)}</span>
  <span className={`whitespace-nowrap ${compact?'text-[12px] text-[#5f6f86]':'text-[12.5px] text-[#68778d] sm:text-[13px]'}`}>{reviewsLabel(count,en)}</span></>;
 return <p className="flex items-center gap-1" data-rating-line={count}>{href?<a href={href} aria-label={label} className={`inline-flex items-center gap-1 ${ring} rounded`}>{body}</a>:<span className="inline-flex items-center gap-1" aria-label={label}>{body}</span>}</p>;
}

/** Yelp-model rating summary: big average + stars + count on the left, 5→1 distribution bars on the right. */
export function RatingSummary({average,count,distribution,en}:{average:number|null;count:number;distribution?:number[]|null;en:boolean}){
 if(!count||average==null)return null;
 const max=Math.max(1,...(distribution??[]));
 return <div data-rating-summary={count} className="grid gap-5 rounded-2xl bg-[#f7fafc] p-5 sm:grid-cols-[180px_1fr] sm:items-center">
  <div className="space-y-1.5">
   <p className="text-[44px] font-extrabold leading-none tracking-tight text-[#162543]">{ratingNumber(average,en)}<span className="text-lg font-bold tracking-normal text-[#94a3b8]"> / 5</span></p>
   <Stars value={average} size="lg" label={en?`${ratingNumber(average,en)} out of 5`:`${ratingNumber(average,en)} de 5`}/>
   <p className="text-sm text-[#526277]">{count} {reviewsWord(count,en)}</p>
  </div>
  {distribution&&distribution.length===5&&<ul className="space-y-1.5" aria-label={en?'Ratings by stars':'Calificaciones por estrellas'} data-rating-distribution>
   {[5,4,3,2,1].map(s=>{const n=distribution[s-1]??0;return <li key={s} className="grid grid-cols-[88px_1fr_32px] items-center gap-3 text-sm" data-rating-bar={s}>
    <span className="whitespace-nowrap font-semibold text-[#334155]">{s} {en?(s===1?'star':'stars'):(s===1?'estrella':'estrellas')}</span>
    <span className="h-2.5 overflow-hidden rounded-full bg-[#e5e9ef]" aria-hidden="true"><span className="block h-full rounded-full bg-[#f5a623]" style={{width:`${(n/max)*100}%`}}/></span>
    <span className="text-right tabular-nums text-[#526277]">{n}</span></li>;})}
  </ul>}
 </div>;
}

/** Section of the main column with an anchor id and an H2 (Yelp order lives in the page). */
export function BizSection({id,title,children,aside,...rest}:{id:string;title:ReactNode;children:ReactNode;aside?:ReactNode}&Record<`data-${string}`,string|number|boolean|undefined>){
 return <section id={id} aria-labelledby={`${id}-title`} className={BIZ.section} {...rest}>
  <div className="flex flex-wrap items-end justify-between gap-3"><h2 id={`${id}-title`} className={BIZ.h2}>{title}</h2>{aside}</div>
  {children}
 </section>;
}
