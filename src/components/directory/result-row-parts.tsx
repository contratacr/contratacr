'use client';
import {useState} from 'react';
import {Info} from 'lucide-react';

/** Client islands of the app result rows (rows themselves are server components): expandable snippet and info tooltip. */
export function ReadMoreText({text,more,less}:{text:string;more:string;less:string}){
 const [open,setOpen]=useState(false);
 const long=text.length>90;
 return <p className="text-[13.5px] leading-snug text-[#334155]" data-row-snippet>
  <span className={open||!long?'':'line-clamp-2'}>{'"'}{text}{'"'}</span>
  {long&&<button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)} className="relative z-10 mt-0.5 text-[13px] font-bold text-[#007fae]">{open?less:more}</button>}
 </p>;
}

/** Badge with a tappable (i): the explanation shows under the badge, never on hover only. */
export function InfoBadge({label,tip,tone='brand'}:{label:string;tip:string;tone?:'brand'|'ok'}){
 const [open,setOpen]=useState(false);
 const cls=tone==='ok'?'border-[#bfe5d0] bg-[#eefaf3] text-[#17613a]':'border-[#bfe3f3] bg-[#EBF5FB] text-[#00688f]';
 return <span className="relative z-10 inline-flex flex-col items-start">
  <button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)} data-row-badge className={`inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] font-bold ${cls}`}>{label}<Info className="h-3.5 w-3.5" aria-hidden="true"/></button>
  {open&&<span role="status" className="mt-1 block max-w-[260px] rounded-xl border border-[#e5e9ee] bg-white p-2.5 text-[12.5px] font-medium leading-snug text-[#334155] shadow-md">{tip}</span>}
 </span>;
}
