'use client';
import {useState,type ReactNode} from 'react';

/**
 * Launch polish (2026-11-18): on phones the directory filters stay folded behind one «Filtros (n)» button (n = active
 * filters) so the first results are visible right away (no layout jump: folded from the first paint); from lg they
 * are always open. The fields stay inside the same GET form, so submitting works the same open or folded.
 */
export function FiltersDisclosure({active,en,children}:{active:number;en:boolean;children:ReactNode}){
 const [open,setOpen]=useState(false);
 const label=(en?'Filters':'Filtros')+(active>0?` (${active})`:'');
 return <div data-filters-disclosure data-active-filters={active}>
  <button type="button" aria-expanded={open} aria-controls="dir-filters-panel" onClick={()=>setOpen(!open)}
   className="flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-[#162543] lg:hidden">
   <span>{label}</span><span aria-hidden="true">{open?'−':'+'}</span></button>
  <div id="dir-filters-panel" className={`${open?'':'max-lg:hidden'} mt-4 space-y-4 lg:mt-0`}>{children}</div>
 </div>;
}
