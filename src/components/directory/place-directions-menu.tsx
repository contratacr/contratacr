'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';

/**
 * «Cómo llegar» with the choice of navigation app (owner request 2026-11-23): Waze and Google Maps (Apple Maps removed,
 * owner 2026-11-27: «quita Apple Maps como opción»), as a
 * small menu under the button (pill variant) or a sheet above the bottom bar (bar variant). Plain links, no tracking;
 * closes on Escape, on an outside click and after choosing.
 */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
export function PlaceDirectionsMenu({maps,locale,label,className,variant='pill',children}:{maps:{google:string;waze:string;apple:string};locale:string;label:string;className:string;variant?:'pill'|'bar';children:ReactNode}){
 const en=locale==='en',[open,setOpen]=useState(false),root=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  if(!open)return;
  const onDown=(e:MouseEvent|TouchEvent)=>{if(root.current&&!root.current.contains(e.target as Node))setOpen(false);};
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
  document.addEventListener('mousedown',onDown);document.addEventListener('touchstart',onDown);document.addEventListener('keydown',onKey);
  return()=>{document.removeEventListener('mousedown',onDown);document.removeEventListener('touchstart',onDown);document.removeEventListener('keydown',onKey);};
 },[open]);
 const items:[string,string,string][]=[['waze','Waze',maps.waze],['google','Google Maps',maps.google]];
 const panel=variant==='bar'
  ?'fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-50 mx-auto max-w-sm'
  :'absolute left-0 top-full z-30 mt-2 w-60 max-w-[calc(100vw-2rem)]';
 return <span ref={root} className={variant==='bar'?'contents':'relative inline-flex min-w-0 max-w-full'} data-place-directions-menu={variant}>
  <button type="button" aria-expanded={open} aria-haspopup="true" data-place-directions-cta className={className} onClick={()=>setOpen(o=>!o)}>{children}</button>
  {open&&<div role="group" aria-label={en?'Open directions in':'Abrir indicaciones en'} data-place-directions-options className={`${panel} space-y-1 rounded-2xl border border-[#d7e1ea] bg-white p-2 text-[#162543] shadow-lg`}>
   <p className="px-3 pb-1 pt-1.5 text-xs font-bold uppercase tracking-wide text-[#5f6f86]">{label}</p>
   {items.map(([id,name,href])=><a key={id} data-directions-app={id} href={href} target="_blank" rel="noopener noreferrer" onClick={()=>setOpen(false)}
    className={`flex min-h-11 items-center rounded-xl px-3 text-[15px] font-semibold hover:bg-[#f1f7fb] ${ring}`}>{name}</a>)}
  </div>}
 </span>;
}
