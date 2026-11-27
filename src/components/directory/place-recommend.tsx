'use client';
import {useState} from 'react';
import {ThumbsDown,ThumbsUp,CircleHelp} from 'lucide-react';

/**
 * «¿Recomienda este lugar?» (Sí / No / Tal vez): a one-tap start of the review. Nothing is stored by the tap itself:
 * it opens the review form (#escribir-resena) with a suggested rating (Sí 5, Tal vez 3, No 2) the person can change.
 * `place-reviews.tsx` listens to the `ccr:place-recommend` event.
 */
export const RECOMMEND_EVENT='ccr:place-recommend';
const OPTIONS=[{id:'yes',rating:5,es:'Sí',en:'Yes',icon:ThumbsUp},{id:'maybe',rating:3,es:'Tal vez',en:'Maybe',icon:CircleHelp},{id:'no',rating:2,es:'No',en:'No',icon:ThumbsDown}] as const;
export function PlaceRecommend({locale}:{locale:string}){
 const en=locale==='en',[picked,setPicked]=useState<string|null>(null);
 const pick=(o:typeof OPTIONS[number])=>{
  setPicked(o.id);
  window.dispatchEvent(new CustomEvent(RECOMMEND_EVENT,{detail:{rating:o.rating}}));
  // Re-enter the anchor even when it is already the hash, so the Reviews tab opens again.
  if(window.location.hash==='#escribir-resena')window.history.replaceState(null,'',window.location.pathname+window.location.search);
  // replace, not assign: an anchor inside the page must not add a history entry (back would stay on the page).
  window.location.replace(window.location.pathname+window.location.search+'#escribir-resena');
 };
 return <section data-place-recommend aria-labelledby="place-recommend" className="space-y-2.5 rounded-2xl bg-[#f7fafc] p-4">
  <h2 id="place-recommend" className="text-[15px] font-bold text-[#162543]">{en?'Would you recommend this place?':'¿Recomienda este lugar?'}</h2>
  <div role="group" aria-labelledby="place-recommend" className="flex gap-2">
   {OPTIONS.map(o=>{const Icon=o.icon;return <button key={o.id} type="button" data-place-recommend-option={o.id} aria-pressed={picked===o.id} onClick={()=>pick(o)}
    className={`inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold ${picked===o.id?'border-[#009FD9] bg-[#eaf6fb] text-[#0b4f6c]':'border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]'}`}>
    <Icon aria-hidden="true" className="h-4 w-4"/>{en?o.en:o.es}</button>;})}
  </div>
 </section>;
}
