'use client';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft,Maximize2} from 'lucide-react';
import {PlacesMap,type PlacesMapPoint} from '@/components/maps/places-map';

const RING='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';

/**
 * The «Ubicación» map with a way to open it big (owner 2026-11-27: «debería haber forma de abrir el mapa en grande»).
 * The small map is a preview: a tap on it, or the expand button, opens a full-screen map (phones: 100dvh; computers: a
 * large modal) with normal one-finger panning, the place's pin, a back arrow and the same Google Maps / Waze buttons.
 * The big map mounts only when opened. Esc, the arrow and the phone's back button close it (a history entry is pushed).
 */
export function PlaceMapDialog({points,locale,label,zoom,apps}:{points:PlacesMapPoint[];locale:string;label:string;zoom:number;apps?:ReactNode}){
 const en=locale==='en',[open,setOpen]=useState(false),pushed=useRef(false);
 const close=useCallback(()=>{if(pushed.current){pushed.current=false;history.back();}else setOpen(false);},[]);
 useEffect(()=>{
  if(!open)return;
  history.pushState({ccrPlaceMap:true},'');pushed.current=true;
  const onPop=()=>{pushed.current=false;setOpen(false);};
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};
  const prev=document.body.style.overflow;document.body.style.overflow='hidden';
  window.addEventListener('popstate',onPop);window.addEventListener('keydown',onKey);
  return()=>{window.removeEventListener('popstate',onPop);window.removeEventListener('keydown',onKey);document.body.style.overflow=prev;};
 },[open,close]);
 const openLabel=en?'See the map full size':'Ver el mapa en grande';
 return <>
  <div className="relative" data-place-map-preview>
   <PlacesMap locale={locale} zoom={zoom} className="h-56 overflow-hidden sm:h-72" label={label} points={points}/>
   {/* The whole preview opens the big map (the small one does not pan inside the scrolling page). */}
   <button type="button" onClick={()=>setOpen(true)} aria-label={openLabel} className={`absolute inset-0 z-10 cursor-zoom-in ${RING}`} data-place-map-open/>
   <span aria-hidden="true" className="pointer-events-none absolute left-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full border border-[#d7e1ea] bg-white text-[#162543] shadow-sm"><Maximize2 className="h-[18px] w-[18px]"/></span>
  </div>
  {open&&typeof document!=='undefined'&&createPortal(
   <div role="dialog" aria-modal="true" aria-label={label} data-place-map-dialog className="fixed inset-0 z-[1500] flex items-center justify-center bg-white lg:bg-[#071426]/55">
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white lg:h-[85vh] lg:w-[90vw] lg:rounded-2xl lg:shadow-2xl">
     <div className="relative min-h-0 flex-1">
      <PlacesMap locale={locale} zoom={zoom} className="h-full w-full" label={label} points={points} cooperative={false} bare/>
      <button type="button" onClick={close} aria-label={en?'Close the map':'Cerrar el mapa'} data-place-map-close
       className={`absolute left-3 top-[calc(env(safe-area-inset-top)+12px)] z-20 grid h-11 w-11 place-items-center rounded-full bg-white text-[#162543] shadow-md ${RING}`}><ArrowLeft className="h-5 w-5"/></button>
     </div>
     {apps&&<div className="border-t border-[#eef2f6] bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">{apps}</div>}
    </div>
   </div>,document.body)}
 </>;
}
