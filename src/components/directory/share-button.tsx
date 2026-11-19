'use client';
import {useState} from 'react';
import {Share2} from 'lucide-react';

/**
 * «Compartir» of a place or brand page (2026-11-19): the device share sheet (Web Share API) when there is one,
 * otherwise the link is copied and a short confirmation is announced. Never sends data anywhere else.
 */
export function ShareButton({title,locale,className}:{title:string;locale:string;className:string}){
 const en=locale==='en',[copied,setCopied]=useState<null|'ok'|'error'>(null);
 const share=async()=>{
  const url=window.location.href.split('#')[0]!;
  if(typeof navigator.share==='function'){try{await navigator.share({title,url});return;}catch(e){if((e as Error)?.name==='AbortError')return;}}
  try{await navigator.clipboard.writeText(url);setCopied('ok');}catch{setCopied('error');}
  window.setTimeout(()=>setCopied(null),2500);
 };
 return <span className="relative inline-flex">
  <button type="button" data-share-button onClick={()=>void share()} className={className}><Share2 aria-hidden="true" className="h-4 w-4"/>{en?'Share':'Compartir'}</button>
  <span role="status" aria-live="polite" className={copied?'absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#162543] px-3 py-1.5 text-xs font-semibold text-white shadow-lg':'sr-only'} data-share-status={copied??undefined}>
   {copied==='ok'?(en?'Link copied':'Enlace copiado'):copied==='error'?(en?'Could not copy the link':'No se pudo copiar el enlace'):''}</span>
 </span>;
}
