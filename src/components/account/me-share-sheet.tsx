'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Copy,Link2,MessageCircle,X} from 'lucide-react';

/** Bottom sheet shared by the Yo (Mi cuenta) share and QR actions. Escape and the backdrop close it. */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
export function MeSheet({open,title,onClose,children,closeLabel}:{open:boolean;title:string;onClose:()=>void;children:ReactNode;closeLabel:string}){
 const closeRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!open)return;closeRef.current?.focus();const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[open,onClose]);
 if(!open)return null;
 return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 sm:items-center" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-[#162543] shadow-2xl sm:rounded-3xl sm:pb-5">
   <div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">{title}</h2>
    <button ref={closeRef} type="button" aria-label={closeLabel} onClick={onClose} className={`grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100 ${ring}`}><X aria-hidden="true" className="h-5 w-5"/></button></div>
   {children}</div></div>;
}

/** Native share when the browser has it (phones); otherwise the sheet with «Copiar enlace» and WhatsApp. */
export async function tryNativeShare(url:string,title:string,text:string):Promise<boolean>{
 try{
  if(typeof navigator.share!=='function'||window.matchMedia('(hover: hover) and (pointer: fine)').matches)return false;
  await navigator.share({title,text,url});return true;
 }catch(e){return (e as {name?:string})?.name==='AbortError';}
}

export function MeShareSheet({open,onClose,url,locale}:{open:boolean;onClose:()=>void;url:string;locale:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const [copied,setCopied]=useState(false);
 const text=t('Descubra negocios y profesionales en ContrataCR.','Discover businesses and professionals on ContrataCR.');
 const copy=async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);window.setTimeout(()=>setCopied(false),2500);}catch{/* clipboard blocked: the link stays selectable below */}};
 return <MeSheet open={open} onClose={onClose} title={t('Compartir','Share')} closeLabel={t('Cerrar','Close')}>
  <div data-me-share-sheet className="space-y-3">
   <label className="sr-only" htmlFor="me-share-link">{t('Enlace','Link')}</label>
   <div className="flex items-center gap-2 rounded-xl border border-slate-300 px-3"><Link2 aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500"/>
    <input id="me-share-link" readOnly value={url} onFocus={e=>e.currentTarget.select()} className="min-h-11 w-full min-w-0 bg-transparent text-sm"/></div>
   <button type="button" data-me-copy onClick={copy} className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#162543] px-4 font-bold text-white ${ring}`}><Copy aria-hidden="true" className="h-4 w-4"/>{copied?t('Enlace copiado','Link copied'):t('Copiar enlace','Copy link')}</button>
   <a data-me-whatsapp target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#d7e1ea] px-4 font-bold ${ring}`}><MessageCircle aria-hidden="true" className="h-4 w-4"/>WhatsApp</a>
   <span role="status" className="sr-only">{copied?t('Enlace copiado','Link copied'):''}</span>
  </div></MeSheet>;
}
