'use client';
import {useEffect,useRef,useState} from 'react';
import {Copy,PenLine,Send,Share2} from 'lucide-react';

/**
 * «Compartir» of a place or brand page: opens a small sheet with «Copiar enlace», «Enviar a amigos» (the device share
 * sheet when there is one, otherwise a prefilled WhatsApp message) and, on places, «Sugerir un cambio» (opens the
 * report form at #reportar). Never sends data anywhere else; the link is always the page address without hash.
 */
/** `sheet`: the button sits in a sliding chip row (which clips overflow), so on phones the menu opens as a bottom sheet. */
export function ShareButton({title,locale,className,suggest=false,sheet=false}:{title:string;locale:string;className:string;suggest?:boolean;sheet?:boolean}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const [open,setOpen]=useState(false),[copied,setCopied]=useState<null|'ok'|'error'>(null);
 const box=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  if(!open)return;
  const away=(e:MouseEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);};
  const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
  document.addEventListener('mousedown',away);document.addEventListener('keydown',esc);
  return()=>{document.removeEventListener('mousedown',away);document.removeEventListener('keydown',esc);};
 },[open]);
 const url=()=>window.location.href.split('#')[0]!;
 const done=(v:'ok'|'error')=>{setCopied(v);window.setTimeout(()=>setCopied(null),2500);};
 const copy=async()=>{try{await navigator.clipboard.writeText(url());done('ok');}catch{done('error');}setOpen(false);};
 const send=async()=>{
  if(typeof navigator.share==='function'){try{await navigator.share({title,url:url()});setOpen(false);return;}catch(e){if((e as Error)?.name==='AbortError'){setOpen(false);return;}}}
  window.open(`https://wa.me/?text=${encodeURIComponent(`${title} ${url()}`)}`,'_blank','noopener,noreferrer');setOpen(false);
 };
 const item='flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-[#162543] hover:bg-[#f1f5f9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]';
 return <span ref={box} className="relative inline-flex">
  <button type="button" data-share-button aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(o=>!o)} className={className}><Share2 aria-hidden="true" className="h-4 w-4"/>{t('Compartir','Share')}</button>
  {open&&<div role="menu" data-share-sheet aria-label={t('Compartir este lugar','Share this place')} className={sheet?'fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-[120] rounded-2xl border border-[#e5e7eb] bg-white p-1.5 shadow-2xl lg:absolute lg:inset-x-auto lg:bottom-auto lg:left-0 lg:top-full lg:z-30 lg:mt-2 lg:w-60 lg:shadow-lg':'absolute left-0 top-full z-30 mt-2 w-60 rounded-2xl border border-[#e5e7eb] bg-white p-1.5 shadow-lg'}>
   <button type="button" role="menuitem" data-share-copy onClick={()=>void copy()} className={item}><Copy aria-hidden="true" className="h-4 w-4"/>{t('Copiar enlace','Copy link')}</button>
   <button type="button" role="menuitem" data-share-send onClick={()=>void send()} className={item}><Send aria-hidden="true" className="h-4 w-4"/>{t('Enviar a amigos','Send to friends')}</button>
   {suggest&&<a role="menuitem" href="#reportar" data-share-suggest onClick={()=>setOpen(false)} className={item}><PenLine aria-hidden="true" className="h-4 w-4"/>{t('Sugerir un cambio','Suggest an edit')}</a>}
  </div>}
  <span role="status" aria-live="polite" className={copied?'absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#162543] px-3 py-1.5 text-xs font-semibold text-white shadow-lg':'sr-only'} data-share-status={copied??undefined}>
   {copied==='ok'?t('Enlace copiado','Link copied'):copied==='error'?t('No se pudo copiar el enlace','Could not copy the link'):''}</span>
 </span>;
}
