'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Check,ChevronDown,SlidersHorizontal,X} from 'lucide-react';
import {CAPA_HOJA} from '@/lib/capas';

/**
 * Filter chips + filters drawer of the places sections (/restaurantes, /farmacias…), 2026-11-19: the same row of pills
 * as /profesionales (same pill geometry), next to the title on desktop and in the results sheet on phones. Every chip
 * is a plain link to the same GET page (works without JavaScript once rendered); the full GET form (search, canton,
 * price, every section filter) lives in one drawer opened by «Filtros», on every screen size.
 */
export const OPEN_DIR_FILTERS='ccr:dir-open-filters';
export type ChipOption={value:string;label:string;href:string;current:boolean;
 /** «Más cercanos» without a position: ask for it, then open the href with lat/lng (2 decimals, like the professionals search). */needsLocation?:boolean};
export type ChipMenu={key:string;label:string;active:boolean;options:ChipOption[]};
export type ChipToggle={key:string;label:string;href:string;active:boolean};

const pill='ccr-search-filter-chip inline-flex h-9 w-max shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border bg-white px-3 text-[12px] font-bold shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const idle=`${pill} border-[#d7e1ea] text-[#162543] hover:border-[#009FD9]`;
const on=`${pill} border-[#009FD9] bg-[#EBF5FB] text-[#007fae]`;

function Menu({menu,openKey,setOpenKey}:{menu:ChipMenu;openKey:string|null;setOpenKey:(k:string|null)=>void}){
 const open=openKey===menu.key;
 return <div className="relative" data-chip-menu={menu.key}>
  <button type="button" aria-expanded={open} aria-haspopup="true" onClick={()=>setOpenKey(open?null:menu.key)} className={menu.active?on:idle}>
   <span>{menu.label}</span><ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open?'rotate-180':''}`} aria-hidden="true"/></button>
  {open&&<ul className="absolute left-0 top-full z-[60] mt-1.5 max-h-80 min-w-[13rem] overflow-y-auto rounded-2xl border border-[#e5e7eb] bg-white p-1.5 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.45)]">
   {menu.options.map(o=><li key={o.value}><a href={o.href} data-chip={o.value} aria-current={o.current?'true':undefined}
    className={`flex min-h-10 items-center rounded-xl px-3 text-[13px] ${o.current?'bg-[#EBF5FB] font-bold text-[#007fae]':'font-semibold text-[#162543] hover:bg-[#f4f7fa]'}`}>{o.label}</a></li>)}
  </ul>}
 </div>;
}

export function PlacesFilterChips({variant,menus,toggles,filtersLabel,activeFilters,clear,en}:{variant:'bar'|'sheet';menus:ChipMenu[];toggles:ChipToggle[];
 filtersLabel:string;activeFilters:number;clear?:{href:string;label:string};en:boolean}){
 const [openKey,setOpenKey]=useState<string|null>(null);
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!openKey)return;
  const away=(e:PointerEvent)=>{const t=e.target as Element;if(!root.current?.contains(t)&&!t?.closest?.("[data-chip-sheet]"))setOpenKey(null);};
  const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpenKey(null);};
  document.addEventListener('pointerdown',away);document.addEventListener('keydown',esc);
  return ()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',esc);};
 },[openKey]);
 const filters=<button type="button" data-dir-filters-button aria-haspopup="dialog" onClick={()=>window.dispatchEvent(new Event(OPEN_DIR_FILTERS))} className={activeFilters>0?on:idle}>
  <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/><span>{filtersLabel}{activeFilters>0?` (${activeFilters})`:''}</span></button>;
 // A toggle that is on reads as on (owner 2026-11-26): filled brand blue, white text and a check.
 const toggleChips=toggles.map(x=><a key={x.key} href={x.href} data-chip={x.key} aria-pressed={x.active} className={x.active?`${pill} border-[#009FD9] !bg-[#009FD9] text-white`:idle}>{x.active&&<Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden="true"/>}{x.label}</a>);
 // Phones (owner 2026-11-26, like Yelp): «Ordenar ▾», the toggles, then the other menus; each menu opens a bottom sheet
 // (a dropdown would be clipped by the chip rail).
 if(variant==='sheet'){
  // No filters button and no place menu (owner 2026-11-26): the location lives in the search; only loose chips here.
  const [sortMenu,...otherMenus]=menus.filter(m=>m.key!=='province');
  return <div ref={root} className="scrollbar-none flex w-full min-w-0 items-center gap-1 overflow-x-auto pb-0.5" aria-label={en?'Filters':'Filtros'} role="group">
   <div className="flex w-max min-w-full items-center gap-1">
    {sortMenu&&<SheetMenu menu={sortMenu} openKey={openKey} setOpenKey={setOpenKey} en={en}/>}
    {toggleChips}
    {otherMenus.map(m=><SheetMenu key={m.key} menu={m} openKey={openKey} setOpenKey={setOpenKey} en={en}/>)}
   </div></div>;
 }
 return <div ref={root} className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label={en?'Filters':'Filtros'} role="group">
  {menus.map(m=><Menu key={m.key} menu={m} openKey={openKey} setOpenKey={setOpenKey}/>)}
  {toggleChips}
  {filters}
  {clear&&<a href={clear.href} className="ml-1 text-[12px] font-semibold text-[#007fae] hover:underline">{clear.label}</a>}
 </div>;
}

/** The drawer with the complete GET filters form (left side, like the professionals filters drawer). */
export function PlacesFiltersDrawer({title,closeLabel,children}:{title:string;closeLabel:string;children:ReactNode}){
 const [open,setOpen]=useState(false);
 const panel=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const show=()=>setOpen(true);
  window.addEventListener(OPEN_DIR_FILTERS,show);
  return ()=>window.removeEventListener(OPEN_DIR_FILTERS,show);
 },[]);
 useEffect(()=>{
  if(!open)return;
  const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
  document.addEventListener('keydown',esc);
  panel.current?.focus({preventScroll:true});// the dialog itself: focusing the search field would pop the phone keyboard
  return ()=>document.removeEventListener('keydown',esc);
 },[open]);
 // CAPA_HOJA: above the mobile tab bar (data-directory-tabs), which otherwise covered the «Aplicar filtros» footer.
 return <div className={open?`fixed inset-0 ${CAPA_HOJA}`:'hidden'} data-dir-filters-drawer={open?'open':'closed'}>
  <div className="absolute inset-0 bg-black/40" onClick={()=>setOpen(false)} aria-hidden="true"/>
  <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="dir-filters-title" className="absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col bg-white shadow-xl outline-none">
   <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#eef2f6] px-4">
    <h2 id="dir-filters-title" className="text-base font-bold text-[#162543]">{title}</h2>
    <button type="button" onClick={()=>setOpen(false)} aria-label={closeLabel} className="-mr-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#162543]"><X className="h-[18px] w-[18px]"/></button>
   </div>
   <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">{children}</div>
  </div>
 </div>;
}

/** A chip menu on phones: the options open in a bottom sheet over the page (not a dropdown clipped by the chip rail). */
function SheetMenu({menu,openKey,setOpenKey,en}:{menu:ChipMenu;openKey:string|null;setOpenKey:(k:string|null)=>void;en:boolean}){
 const open=openKey===menu.key;
 return <>
  <button type="button" data-chip-menu={menu.key} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpenKey(open?null:menu.key)} className={menu.active?on:idle}>
   <span className="whitespace-nowrap">{menu.label}</span><ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/></button>
  {/* Portal: the results sheet is transformed, so a `fixed` child would be positioned (and clipped) inside it. */}
  {open&&typeof document!=='undefined'&&createPortal(<div data-chip-sheet={menu.key} className={`fixed inset-0 ${CAPA_HOJA}`} role="dialog" aria-modal="true" aria-label={menu.label}>
   <button type="button" aria-label={en?'Close':'Cerrar'} className="absolute inset-0 bg-black/30" onClick={()=>setOpenKey(null)}/>
   <div className="absolute inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-white px-2 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2 shadow-2xl">
    <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[#d1d5db]" aria-hidden="true"/>
    <ul>{menu.options.map(o=><li key={o.value}><a href={o.href} aria-current={o.current?'true':undefined} onClick={o.needsLocation?(e)=>{e.preventDefault();if(!('geolocation' in navigator))return;navigator.geolocation.getCurrentPosition(pos=>{const u=new URL(o.href,location.href);u.searchParams.set('lat',pos.coords.latitude.toFixed(2));u.searchParams.set('lng',pos.coords.longitude.toFixed(2));location.assign(u.toString());},()=>setOpenKey(null),{timeout:10000,maximumAge:300000});}:undefined} className={`flex min-h-12 items-center justify-between rounded-xl px-4 text-[15px] ${o.current?'font-bold text-[#007fae]':'font-semibold text-[#162543]'}`}>{o.label}{o.current&&<span aria-hidden="true">✓</span>}</a></li>)}</ul>
   </div>
  </div>,document.body)}
 </>;
}
