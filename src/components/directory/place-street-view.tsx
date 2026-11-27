'use client';
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {streetViewLabel,type StreetView} from '@/lib/directory/street-view';

/**
 * «Vista de la calle» (2026-11-27, owner-approved): a Mapillary street-level image (CC BY-SA 4.0) shown ONLY for places
 * without any photo of their own. It is never presented as the business's photo: always labelled «Vista de la calle»,
 * with the credit «© <creator> · Mapillary · CC BY-SA 4.0» and a note that the community took it. The image comes from
 * our own route /api/vista-calle/<placeId> (302 to a fresh Mapillary thumb); nothing is copied into our storage.
 *
 * - `PlaceStreetView`: place page block (where the photo would go). Tap → large view with the linked credit.
 * - `StreetViewThumb`: card image (result cards, similar businesses). Cards are links already, so the credit there is
 *   plain text (no nested link); the linked credit lives on the place page.
 */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const LICENSE_URL='https://creativecommons.org/licenses/by-sa/4.0/deed.es';
function monthYear(iso:string|null,en:boolean){
 if(!iso)return null;const d=new Date(iso);if(Number.isNaN(d.getTime()))return null;
 return new Intl.DateTimeFormat(en?'en-US':'es-CR',{month:'long',year:'numeric',timeZone:'America/Costa_Rica'}).format(d);
}

/** «© creator · Mapillary · CC BY-SA 4.0»; linked (page) or plain text (inside a card link). */
export function StreetViewCredit({view,en,linked=true,className=''}:{view:StreetView;en:boolean;linked?:boolean;className?:string}){
 const a='underline decoration-current/40 underline-offset-2 hover:decoration-current';
 if(!linked)return <span data-street-view-credit className={className}>© {view.creator} · Mapillary · CC BY-SA 4.0</span>;
 return <span data-street-view-credit className={className}>
  <a href={view.pageUrl} target="_blank" rel="noopener noreferrer" className={a} aria-label={en?`Image by ${view.creator} on Mapillary (opens in a new tab)`:`Imagen de ${view.creator} en Mapillary (se abre en otra pestaña)`}>© {view.creator} · Mapillary</a>
  {' · '}<a href={LICENSE_URL} target="_blank" rel="noopener noreferrer license" className={a}>CC BY-SA 4.0</a></span>;
}

function Label({en}:{en:boolean}){
 return <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-[#162543]/80 px-2.5 py-1 text-[11.5px] font-bold text-white">{streetViewLabel(en)}</span>;
}

/** Card image: 16:10, «Vista de la calle» label on the image, plain-text credit under it (`credit`), no link inside. */
export function StreetViewThumb({view,en,className='',credit=true}:{view:StreetView;en:boolean;className?:string;credit?:boolean}){
 return <span data-street-view={view.imageId} className={`block ${className}`}>
  <span className="relative block aspect-[16/10] overflow-hidden rounded-xl bg-[#dfe8ef]">
   {/* eslint-disable-next-line @next/next/no-img-element -- same-origin redirect to Mapillary's CDN (CC BY-SA 4.0) */}
   <img src={view.src} alt={en?'Street view near the place (Mapillary)':'Vista de la calle cerca del lugar (Mapillary)'} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover"/>
   <Label en={en}/>
  </span>
  {credit&&<StreetViewCredit view={view} en={en} linked={false} className="mt-1 block text-[11px] leading-snug text-[#68778d]"/>}
 </span>;
}

/** Place page block: «Vista de la calle» image + linked credit + note; tap opens it large. */
export function PlaceStreetView({view,en,placeName,className=''}:{view:StreetView;en:boolean;placeName:string;className?:string}){
 const t=(es:string,english:string)=>en?english:es;
 const [open,setOpen]=useState(false);
 const trigger=useRef<HTMLButtonElement>(null),closeBtn=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!open)return;closeBtn.current?.focus();const back=trigger.current;
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
  document.addEventListener('keydown',onKey);const prev=document.body.style.overflow;document.body.style.overflow='hidden';
  return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=prev;back?.focus();};
 },[open]);
 const when=monthYear(view.capturedAt,en);
 const alt=t(`Vista de la calle cerca de ${placeName} (Mapillary)`,`Street view near ${placeName} (Mapillary)`);
 const note=t(`Imagen de la calle tomada por la comunidad de Mapillary${when?` en ${when}`:''}. No es una foto del negocio.`,
  `Street image taken by the Mapillary community${when?` in ${when}`:''}. It is not a photo of the business.`);
 return <figure data-place-street-view={view.imageId} className={`space-y-2 ${className}`}>
  <button ref={trigger} type="button" onClick={()=>setOpen(true)} aria-label={t(`Ver en grande: ${alt}`,`View large: ${alt}`)}
   className={`group relative block aspect-[16/10] w-full overflow-hidden rounded-2xl bg-[#dfe8ef] ${ring}`}>
   {/* eslint-disable-next-line @next/next/no-img-element -- same-origin redirect to Mapillary's CDN (CC BY-SA 4.0) */}
   <img src={view.src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"/>
   <Label en={en}/>
  </button>
  <figcaption className="space-y-0.5 text-[12px] leading-snug text-[#526277]">
   <StreetViewCredit view={view} en={en} className="block font-semibold text-[#374151]"/>
   <span className="block">{note}</span>
  </figcaption>
  {open&&<div role="dialog" aria-modal="true" aria-label={streetViewLabel(en)} data-street-view-lightbox className="fixed inset-0 z-[60] flex flex-col bg-[#0b1220] text-white"
   onClick={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
   <div className="flex items-center justify-between gap-2 p-3">
    <p className="text-sm font-semibold">{streetViewLabel(en)}</p>
    <button ref={closeBtn} type="button" onClick={()=>setOpen(false)} aria-label={t('Cerrar (Esc)','Close (Esc)')} className={`grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/20 ${ring}`}><X aria-hidden className="h-5 w-5"/></button>
   </div>
   <div className="flex min-h-0 flex-1 items-center justify-center px-2" onClick={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
    {/* eslint-disable-next-line @next/next/no-img-element -- same-origin redirect to Mapillary's CDN (CC BY-SA 4.0) */}
    <img src={`${view.src}?s=2048`} alt={alt} referrerPolicy="no-referrer" className="max-h-full max-w-full rounded-lg object-contain"/>
   </div>
   <div className="mx-auto w-full max-w-3xl space-y-1 p-4 text-[12.5px] text-white/80">
    <StreetViewCredit view={view} en={en} className="block font-semibold text-white"/>
    <p>{note}</p>
   </div>
  </div>}
 </figure>;
}
