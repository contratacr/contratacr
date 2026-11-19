import {Store} from 'lucide-react';
import {cn} from '@/lib/utils';
import {BIZ} from './biz-ui';

/**
 * Compact «¿Es su negocio?» row of the place side card (2026-11-19, Yelp model: one line + button). The claim flow and
 * its benefits are on /lugar/<slug>/reclamar.
 */
export function PlaceClaimLink({slug,locale}:{slug:string;locale:string}){
 const en=locale==='en';
 return <div data-place-claim-link className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef2f6] bg-[#f7fafc] px-5 py-4">
  <p className="flex items-center gap-2 whitespace-nowrap text-[15px] font-bold text-[#162543]"><Store aria-hidden="true" className="h-5 w-5 shrink-0 text-[#0b7fab]"/>{en?'Is this your business?':'¿Es su negocio?'}</p>
  <a href={`${en?'/en':''}/lugar/${slug}/reclamar`} className={cn(BIZ.secondary,'shrink-0 px-4 text-sm')}>{en?'Claim it for free':'Reclámelo gratis'}</a>
 </div>;
}
