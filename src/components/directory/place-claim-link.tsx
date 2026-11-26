import {Store} from 'lucide-react';
import {cn} from '@/lib/utils';
import {BIZ} from './biz-ui';

/**
 * «¿Es su empresa?» box of the place page (only while the place is unclaimed). 2026-11-26 redesign: a quiet brand card
 * with one link to /lugar/<slug>/reclamar (the flow and its benefits live there). Phones: after the tabs; from lg: the
 * foot of the sticky contact card.
 */
export function PlaceClaimLink({slug,locale}:{slug:string;locale:string}){
 const en=locale==='en';
 return <div data-place-claim-link className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-[#f3f9fc] p-4 lg:rounded-none lg:bg-[#f7fafc] lg:px-5">
  <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#0083b0] shadow-sm"><Store className="h-5 w-5"/></span>
  <div className="min-w-[160px] flex-1">
   <p className="text-[14px] font-extrabold leading-tight text-[#162543]">{en?'Is this your business?':'¿Es su empresa?'}</p>
   <p className="mt-0.5 text-[12.5px] leading-snug text-[#5f6f86]">{en?'Reply to reviews and keep your details up to date.':'Responda reseñas y mantenga sus datos al día.'}</p>
  </div>
  <a href={`${en?'/en':''}/lugar/${slug}/reclamar`} className={cn(BIZ.secondary,'h-10 shrink-0 px-4 text-[13px] max-[440px]:ml-[52px] lg:ml-[52px]')}>{en?'Claim it for free':'Reclámela gratis'}</a>
 </div>;
}
