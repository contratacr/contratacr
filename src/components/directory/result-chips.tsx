'use client';
import {useState,type ReactNode} from 'react';
import {useSearchParams} from 'next/navigation';
import {useLocale} from 'next-intl';
import {Check,ChevronDown,SlidersHorizontal,X} from 'lucide-react';
import {usePathname,useRouter} from '@/i18n/navigation';

/**
 * Chips of the app results (phones, inside the draggable sheet header). Two modes:
 * - place: filters | Ordenar | Abierto ahora | Precio | Ofrece para llevar (all real: open now goes to the section search,
 *   price level and takeout are attributes of the place, sort by reviews is over the loaded page);
 * - service: FiltersIconChip first and ServiceChipExtras (Diagnóstico for auto, Solicitar cotización, Consultas virtuales,
 *   Más filtros) inside the existing professional chip row (SearchFilters), each one a parameter the professional search
 *   already understands (precio=quote, modalidad=video, q). There is no response-time or opening-hours data for
 *   professionals, so "Respuesta rápida" and "Abierto ahora" are not offered for services.
 * Every control writes the URL (the server page re-renders); the full filter sheet of places is built here.
 */
const OPEN_FILTERS='ccr:open-filters';
const pill='ccr-search-filter-chip inline-flex h-9 w-max shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-3 text-[13px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]';
const idle=`${pill} border-[#d7e1ea] bg-white text-[#162543]`;
const on=`${pill} border-[#009FD9] bg-[#EBF5FB] text-[#00688f]`;

function useParamWriter(){
 const sp=useSearchParams(),router=useRouter(),pathname=usePathname();
 const get=(k:string)=>sp.get(k);
 const write=(patch:Record<string,string|null>)=>{
  const p=new URLSearchParams(sp.toString());
  for(const [k,v] of Object.entries(patch)){if(v==null||v==='')p.delete(k);else p.set(k,v);}
  p.delete('page');
  const qs=p.toString();
  router.replace(qs?`${pathname}?${qs}`:pathname,{scroll:false});
 };
 return {get,write};
}

function Sheet({title,onClose,children,footer}:{title:string;onClose:()=>void;children:ReactNode;footer?:ReactNode}){
 const locale=useLocale(),en=locale==='en';
 return <div className="fixed inset-0 z-[100] flex items-end bg-black/45" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
  <div onClick={e=>e.stopPropagation()} className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 text-[#162543]" data-chip-sheet>
   <div className="mb-2 flex items-center justify-between"><h2 className="text-[18px] font-extrabold">{title}</h2>
    <button type="button" onClick={onClose} aria-label={en?'Close':'Cerrar'} className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#f4f7fa]"><X className="h-5 w-5" aria-hidden="true"/></button></div>
   {children}{footer}
  </div>
 </div>;
}

function Radio({checked,label,onSelect,disabled,hint}:{checked:boolean;label:string;onSelect:()=>void;disabled?:boolean;hint?:string}){
 return <button type="button" role="radio" aria-checked={checked} disabled={disabled} onClick={onSelect} data-sort-option={label}
  className="flex min-h-12 w-full items-center gap-3 border-b border-[#eef2f6] py-2 text-left text-[16px] font-semibold disabled:opacity-50">
  <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${checked?'border-[#009FD9]':'border-[#b6c2d1]'}`}>{checked&&<span className="h-3 w-3 rounded-full bg-[#009FD9]"/>}</span>
  <span className="min-w-0 flex-1">{label}{hint&&<span className="block text-[12.5px] font-medium text-[#6b7280]">{hint}</span>}</span>
 </button>;
}

/** Filters icon, first chip of the service row (opens the full professional filters drawer of the layout). */
export function FiltersIconChip(){
 const en=useLocale()==='en';
 return <button type="button" data-chip="filters" aria-haspopup="dialog" aria-label={en?'Filters':'Filtros'} onClick={()=>window.dispatchEvent(new Event(OPEN_FILTERS))} className={`${idle} !px-2.5`}>
  <SlidersHorizontal className="h-4 w-4" aria-hidden="true"/></button>;
}

/** Service chips that map to parameters the professional search already reads. */
export function ServiceChipExtras({auto=false,videoOk=false}:{auto?:boolean;videoOk?:boolean}){
 const en=useLocale()==='en',t=(es:string,e:string)=>en?e:es;
 const {get,write}=useParamWriter();
 const diag=(get('q')??'').toLowerCase()==='diagnóstico';
 return <>
  {auto&&<button type="button" data-chip="diagnostic" aria-pressed={diag} onClick={()=>write({q:diag?null:'diagnóstico'})} className={diag?on:idle}>{t('Diagnóstico','Diagnostic')}</button>}
  <button type="button" data-chip="quote" aria-pressed={get('precio')==='quote'} onClick={()=>write({precio:get('precio')==='quote'?null:'quote'})} className={get('precio')==='quote'?on:idle}>{t('Solicitar cotización','Request a quote')}</button>
  {videoOk&&<button type="button" data-chip="virtual" aria-pressed={get('modalidad')==='video'} onClick={()=>write({modalidad:get('modalidad')==='video'?null:'video'})} className={get('modalidad')==='video'?on:idle}>{t('Consultas virtuales','Virtual consultations')}</button>}
  <button type="button" data-chip="more" onClick={()=>window.dispatchEvent(new Event(OPEN_FILTERS))} className={idle}>{t('Más filtros','More filters')}</button>
 </>;
}

/** Place chips: filters sheet | Ordenar | Abierto ahora | Precio | Ofrece para llevar. */
export function ResultChips(){
 const locale=useLocale(),en=locale==='en',t=(es:string,e:string)=>en?e:es;
 const {get,write}=useParamWriter();
 const [sheet,setSheet]=useState<null|'sort'|'price'|'filters'>(null);
 const [geoMsg,setGeoMsg]=useState<string|null>(null);
 const placeSort=get('orden')??'relevance';
 const hasPoint=!!get('lat')&&!!get('lng');
 const abierto=get('abierto')==='1'||get('mod')==='open';
 const llevar=get('llevar')==='1'||get('mod')==='takeout';
 const niveles=(get('nivel')??'').split(',').filter(Boolean);
 const withLocation=(apply:(lat:string,lng:string)=>void)=>{
  if(hasPoint){apply(get('lat')!,get('lng')!);return;}
  if(!navigator.geolocation){setGeoMsg(t('Su navegador no ofrece ubicación.','Your browser does not provide location.'));return;}
  navigator.geolocation.getCurrentPosition(p=>{setGeoMsg(null);apply(p.coords.latitude.toFixed(5),p.coords.longitude.toFixed(5));},
   ()=>setGeoMsg(t('Active la ubicación para ordenar por distancia.','Turn on location to sort by distance.')),{timeout:8000,maximumAge:300000});
 };
 const toggle=(k:'abierto'|'llevar',v:boolean)=>write({[k]:v?null:'1',mod:null});
 const toggleLevel=(n:number)=>{const has=niveles.includes(String(n));const next=has?niveles.filter(x=>x!==String(n)):[...niveles,String(n)].sort();write({nivel:next.join(',')||null});};
 const sortLabel=t('Ordenar','Sort');
 const options:{v:string;label:string}[]=[
  {v:'relevance',label:t('Recomendado','Recommended')},{v:'distance',label:t('Distancia','Distance')},
  {v:'rating',label:t('Calificación','Rating')},{v:'reviews',label:t('Más reseñas','Most reviewed')}];
 const levelNames=[t('Económico','Inexpensive'),t('Moderado','Moderate'),t('Caro','Pricey'),t('Muy caro','Very pricey')];

 return <div data-result-chips="place" role="group" aria-label={t('Filtros','Filters')} className="scrollbar-none flex w-full min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5">
  <button type="button" data-chip="filters" aria-haspopup="dialog" aria-label={t('Filtros','Filters')} onClick={()=>setSheet('filters')} className={`${idle} !px-2.5`}><SlidersHorizontal className="h-4 w-4" aria-hidden="true"/></button>
  <button type="button" data-chip="sort" onClick={()=>setSheet('sort')} className={placeSort!=='relevance'?on:idle}>{sortLabel}<ChevronDown className="h-3.5 w-3.5" aria-hidden="true"/></button>
  <button type="button" data-chip="open-now" aria-pressed={abierto} onClick={()=>toggle('abierto',abierto)} className={abierto?on:idle}>{t('Abierto ahora','Open now')}</button>
  <button type="button" data-chip="price" onClick={()=>setSheet('price')} className={niveles.length?on:idle}>{t('Precio','Price')}{niveles.length>0&&` · ${niveles.map(n=>'₡'.repeat(Number(n))).join(' ')}`}<ChevronDown className="h-3.5 w-3.5" aria-hidden="true"/></button>
  <button type="button" data-chip="takeout" aria-pressed={llevar} onClick={()=>toggle('llevar',llevar)} className={llevar?on:idle}>{t('Ofrece para llevar','Offers takeout')}</button>

  {sheet==='sort'&&<Sheet title={sortLabel} onClose={()=>setSheet(null)}>
   <div role="radiogroup" aria-label={sortLabel}>
    {options.map(o=><Radio key={o.v} checked={placeSort===o.v} label={o.label} hint={o.v==='distance'&&!hasPoint?t('Pedirá su ubicación','Will ask for your location'):undefined}
     onSelect={()=>{
      const apply=(extra:Record<string,string|null>={})=>{write({orden:o.v==='relevance'?null:o.v,...extra});setSheet(null);};
      if(o.v==='distance')withLocation((lat,lng)=>apply({lat,lng}));else apply();
     }}/>)}
   </div>
   {geoMsg&&<p role="status" className="mt-3 text-[13px] font-semibold text-[#c0392b]">{geoMsg}</p>}
  </Sheet>}

  {sheet==='price'&&<Sheet title={t('Precio','Price')} onClose={()=>setSheet(null)}>
   <ul>{[1,2,3,4].map(n=>{const checked=niveles.includes(String(n));return <li key={n}>
    <button type="button" role="checkbox" aria-checked={checked} data-price-level={n} onClick={()=>toggleLevel(n)} className="flex min-h-12 w-full items-center gap-3 border-b border-[#eef2f6] py-2 text-left text-[16px] font-semibold">
     <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md border-2 ${checked?'border-[#009FD9] bg-[#009FD9] text-white':'border-[#b6c2d1]'}`}>{checked&&<Check className="h-4 w-4" aria-hidden="true"/>}</span>
     <span className="font-extrabold tracking-wide">{'₡'.repeat(n)}</span><span className="text-[#6b7280]">{levelNames[n-1]}</span></button></li>;})}</ul>
  </Sheet>}

  {sheet==='filters'&&<Sheet title={t('Filtros','Filters')} onClose={()=>setSheet(null)}
   footer={<button type="button" onClick={()=>setSheet(null)} className="mt-5 h-12 w-full rounded-full bg-[#009FD9] text-[15px] font-extrabold text-white">{t('Ver resultados','See results')}</button>}>
   <div>
    {([['abierto',t('Abierto ahora','Open now'),abierto],['llevar',t('Ofrece para llevar','Offers takeout'),llevar]] as const).map(([k,label,val])=>
     <button key={k} type="button" role="switch" aria-checked={val} onClick={()=>toggle(k,val)} className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[#eef2f6] py-2 text-left text-[16px] font-semibold">{label}
      <span className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${val?'bg-[#009FD9]':'bg-[#cbd5e1]'}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${val?'left-[22px]':'left-0.5'}`}/></span></button>)}
    <p className="pt-4 text-[13px] font-extrabold uppercase tracking-wide text-[#5b6b82]">{t('Precio','Price')}</p>
    <div className="flex gap-2 pb-2 pt-2">{[1,2,3,4].map(n=><button key={n} type="button" aria-pressed={niveles.includes(String(n))} onClick={()=>toggleLevel(n)} className={`${niveles.includes(String(n))?on:idle} min-w-14`}>{'₡'.repeat(n)}</button>)}</div>
    <p className="pt-3 text-[13px] font-extrabold uppercase tracking-wide text-[#5b6b82]">{sortLabel}</p>
    <div role="radiogroup" aria-label={sortLabel}>{options.map(o=><Radio key={o.v} checked={placeSort===o.v} label={o.label} disabled={o.v==='distance'&&!hasPoint} hint={o.v==='distance'&&!hasPoint?t('Use Ordenar para dar su ubicación','Use Sort to share your location'):undefined} onSelect={()=>write({orden:o.v==='relevance'?null:o.v})}/>)}</div>
   </div>
  </Sheet>}
 </div>;
}
