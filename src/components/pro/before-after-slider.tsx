'use client';
/* eslint-disable @next/next/no-img-element -- Authenticated, checksum-verified blobs of the reauthorized download route. */
import {useId,useState} from 'react';

/**
 * Row 33: accessible before/after viewer. A native range input sits over the picture, so the slider works with the
 * keyboard (arrows, Home/End, PageUp/PageDown), mouse, touch and assistive technology. «Side by side» shows both photos
 * one under the other (clearer on a phone). Pure presentation: no data access here.
 */
export type SliderLabels={before:string;after:string;control:string;valueText:(percent:number)=>string;sideBySide:string;slider:string};
export function BeforeAfterSlider({beforeSrc,afterSrc,beforeAlt,afterAlt,labels,initial=50,sideBySideDefault=false}:{beforeSrc:string;afterSrc:string;beforeAlt:string;afterAlt:string;labels:SliderLabels;initial?:number;sideBySideDefault?:boolean}){
 const [pos,setPos]=useState(initial),[side,setSide]=useState(sideBySideDefault),id=useId();
 const badge='absolute top-2 rounded-full bg-[#162543]/85 px-2.5 py-1 text-xs font-bold text-white';
 return <div data-before-after className="min-w-0 space-y-2">
  {side?<div data-before-after-sidebyside className="grid gap-2 sm:grid-cols-2">
   <figure className="relative min-w-0 overflow-hidden rounded-xl bg-[#eef2f6]"><img src={beforeSrc} alt={beforeAlt} className="block aspect-[4/3] w-full object-cover"/><figcaption className={badge+' left-2'}>{labels.before}</figcaption></figure>
   <figure className="relative min-w-0 overflow-hidden rounded-xl bg-[#eef2f6]"><img src={afterSrc} alt={afterAlt} className="block aspect-[4/3] w-full object-cover"/><figcaption className={badge+' left-2'}>{labels.after}</figcaption></figure>
  </div>
  :<div className="relative aspect-[4/3] w-full select-none overflow-hidden rounded-xl bg-[#eef2f6] focus-within:ring-4 focus-within:ring-[#0089bb]/50">
   <img src={afterSrc} alt={afterAlt} draggable={false} className="absolute inset-0 h-full w-full object-cover"/>
   <img src={beforeSrc} alt={beforeAlt} draggable={false} data-before-after-before className="absolute inset-0 h-full w-full object-cover" style={{clipPath:`inset(0 ${100-pos}% 0 0)`}}/>
   <span className={badge+' left-2'} aria-hidden>{labels.before}</span><span className={badge+' right-2'} aria-hidden>{labels.after}</span>
   <span aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(22,37,67,.35)]" style={{left:pos+'%'}}>
    <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#0089bb] text-sm font-bold text-white shadow-lg">&#8596;</span></span>
   <input id={id} type="range" min={0} max={100} step={1} value={pos} aria-label={labels.control} aria-valuetext={labels.valueText(pos)} data-before-after-range onChange={e=>setPos(Number(e.target.value))}
    className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" style={{touchAction:'pan-y'}}/>
  </div>}
  <button type="button" data-before-after-toggle aria-pressed={side} onClick={()=>setSide(v=>!v)} className="inline-flex min-h-11 items-center rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-semibold text-[#162543]">{side?labels.slider:labels.sideBySide}</button>
 </div>;
}
