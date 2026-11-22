import type {ReactNode} from 'react';

/**
 * Shared anatomy of a search result card (owner request 2026-11-22, Yelp model): ProfessionalCard (/profesionales) and
 * PlaceCard (/lugares, sections, /marca) use these parts so they cannot drift apart. Server-safe (no hooks), so both
 * server and client cards can import it. Visual language stays ContrataCR (navy #162543, cyan #009FD9, rounded cards).
 */

/** Card shell: sheet on phones, rounded bordered card from lg, soft shadow on hover. Callers add layout classes. */
export const RESULT_CARD='group relative min-w-0 bg-white px-4 py-3 shadow-[0_8px_14px_-14px_rgba(15,23,42,0.55)] transition-shadow duration-200 lg:rounded-2xl lg:border lg:border-[#e5e7eb] lg:p-4 lg:shadow-none lg:hover:border-[#d7e1ea] lg:hover:shadow-md';
/** Round avatar slot (owner 2026-11-22: the profile image is NOT enlarged): 52 px on phones, 64 px from lg, as in production. */
export const RESULT_THUMB_BOX='relative block h-[52px] w-[52px] shrink-0 overflow-hidden rounded-full bg-[#EBF5FB] lg:h-16 lg:w-16';
/** Small status chip (open now, permit, verified...). */
export const RESULT_CHIP='inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4';
export const RESULT_CHIP_TONES={
 ok:'bg-emerald-50 text-emerald-800',
 bad:'bg-red-50 text-red-800',
 neutral:'bg-slate-100 text-slate-700',
 brand:'bg-[#EBF5FB] text-[#00739e]',
} as const;
export const resultChip=(tone:keyof typeof RESULT_CHIP_TONES)=>`${RESULT_CHIP} ${RESULT_CHIP_TONES[tone]}`;

/**
 * Round result thumbnail (52/64 px, same slot for professionals and places). `src` = real photo (eager when `priority`;
 * width and height set); no photo → `fallback` (avatar / section tile) at the same size, never an empty box. `rank` is
 * the navy number (desktop). Decorative: the card's name link is the accessible target.
 */
export function ResultThumb({src,alt='',fallback,rank,priority=false,kind}:{src?:string|null;alt?:string;fallback:ReactNode;rank?:number;priority?:boolean;kind?:'photo'|'tile'}){
 return <span className="relative block shrink-0" data-result-thumb={kind??(src?'photo':'tile')}>
  <span className={RESULT_THUMB_BOX}>
   {src
    // eslint-disable-next-line @next/next/no-img-element -- approved photo via the same-origin / Cloudinary helpers of each card
    ?<img src={src} alt={alt} width={64} height={64} loading={priority?'eager':'lazy'} decoding="async" {...(priority?{fetchPriority:'high' as const}:{})} className="absolute inset-0 h-full w-full bg-white object-cover"/>
    :fallback}
  </span>
  {rank!=null&&<span aria-hidden="true" className="absolute -left-1.5 -top-1.5 z-10 hidden h-[22px] w-[22px] items-center justify-center rounded-full bg-[#162543] text-[10px] font-bold text-white ring-2 ring-white lg:flex">{rank}</span>}
 </span>;
}

/**
 * Photo strip under the info block of a result card (Yelp model: a business shows several photos). Up to 3 squares
 * (56 px phones / 72 px lg, fixed size so nothing shifts while they load, lazy); the last carries «+N» when more photos
 * exist. Renders NOTHING without photos (no empty placeholders). Decorative: the whole card is the link.
 */
export function ResultPhotoStrip({photos,more=0,className=''}:{photos:string[];more?:number;className?:string}){
 const list=photos.filter(Boolean).slice(0,3);
 if(!list.length)return null;
 return <div aria-hidden="true" data-result-photo-strip={list.length} className={`flex items-center gap-1.5 ${className}`}>
  {list.map((src,i)=><span key={`${i}-${src}`} className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#EBF5FB] lg:h-[72px] lg:w-[72px]">
   {/* eslint-disable-next-line @next/next/no-img-element -- approved photo via the Cloudinary / same-origin helpers */}
   <img src={src} alt="" width={72} height={72} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover"/>
   {i===list.length-1&&more>0&&<span data-result-thumb-more className="absolute inset-0 flex items-center justify-center bg-[#162543]/60 text-[13px] font-bold text-white">+{more}</span>}
  </span>)}
 </div>;
}
