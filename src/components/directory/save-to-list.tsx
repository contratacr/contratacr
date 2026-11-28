'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {Bookmark,Check,X} from 'lucide-react';
import {featureReasonText,type SavedList} from '@/lib/directory/place-features';
import {PANEL_MIS_LISTAS} from '@/lib/directory/panel-links';
import {BEEN_NAME,WANT_NAME,announceListsChanged,fetchLists,isSystemList,postListChange,rememberBeenHereCount,setSystemList} from '@/components/saved/lists-client';
import {rememberViewedPlace} from '@/components/saved/recently-viewed';

/**
 * «Guardar» on a place page or card. Opens the sheet «Guardar en» with three kinds of destination: "He estado", "Quiero ir"
 * (two reserved lists created on first use) and the person's own lists (plus «Nueva lista»). Lists are private; sharing is
 * managed in /listas. Each change is CAS by list revision (another tab → 409 → the sheet reloads) and idempotent.
 * Mounting it on a place page also remembers the place in «Vistos recientemente» (this browser only).
 */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const noSubscribe=()=>()=>{};
const button=`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold ${ring}`;
const secondary=`${button} !min-h-0 h-11 !px-5 !text-[13px] !font-bold border border-[#d7e1ea] text-[#162543] hover:border-[#b9c8d6]`;
/** `chipClass`: the pill look is replaced by the caller's chip (place page chip row).
 *  `openOn` + `hideButton` (2026-11-27, the place page's «…» sheet on phones, MenuFicha like the professional profile):
 *  no button of its own; the window event opens the sheet. Every load announces `ccr:place-saved` ({saved}) so the menu
 *  shows «Guardado» with a filled bookmark. */
export const PLACE_SAVED_EVENT='ccr:place-saved';
export function SaveToList({slug,locale,signedIn,loginHref,name,area,image,variant='pill',chipClass,openOn,hideButton=false}:{slug:string;locale:string;signedIn:boolean;loginHref:string|null;
 name?:string;area?:string;image?:string;variant?:'pill'|'icon';chipClass?:string;openOn?:string;hideButton?:boolean}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const [open,setOpen]=useState(false),[lists,setLists]=useState<SavedList[]|null>(null),[msg,setMsg]=useState<{ok:boolean;text:string}|null>(null),[busy,setBusy]=useState(false);
 const nameRef=useRef<HTMLInputElement>(null),closeRef=useRef<HTMLButtonElement>(null);
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 useEffect(()=>{
  if(variant!=='pill')return;
  const label=name??document.querySelector('h1')?.textContent?.trim();
  if(label)rememberViewedPlace({slug,name:label,area,image});
 },[slug,name,area,image,variant]);
 useEffect(()=>{if(!open)return;closeRef.current?.focus();const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[open]);
 // The button shows «Guardado» as soon as the person is known to have the place somewhere: load once on mount.
 useEffect(()=>{if(signedIn&&variant==='pill')void load();},[signedIn,variant]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!openOn||!signedIn)return;const on=()=>{setOpen(true);if(lists===null)void load();};
  window.addEventListener(openOn,on);return()=>window.removeEventListener(openOn,on);},[openOn,signedIn,lists]);// eslint-disable-line react-hooks/exhaustive-deps
 if(!signedIn)return loginHref?<a data-save-login className={variant==='icon'?`grid h-10 w-10 place-items-center rounded-full border border-[#d7e1ea] bg-white text-[#162543] ${ring}`:chipClass??`${secondary} bg-white`} href={loginHref} aria-label={t('Guardar','Save')}><Bookmark aria-hidden="true" className="h-4 w-4"/>{variant==='icon'?null:t('Guardar','Save')}</a>:null;
 async function load(){const l=await fetchLists(slug);setLists(l??[]);if(l)rememberBeenHereCount(l);
  window.dispatchEvent(new CustomEvent(PLACE_SAVED_EVENT,{detail:{slug,saved:(l??[]).some(x=>x.hasPlace)}}));}
 const fail=(reason?:string)=>setMsg({ok:false,text:featureReasonText(reason,en)});
 const toggleSystem=async(sysName:typeof BEEN_NAME|typeof WANT_NAME,on:boolean)=>{
  setBusy(true);setMsg(null);const r=await setSystemList(sysName,slug,on);if(!r.ok)fail(r.reason);await load();setBusy(false);
 };
 const toggleCustom=async(l:SavedList)=>{
  setBusy(true);setMsg(null);const r=await postListChange({action:l.hasPlace?'remove':'add',listId:l.listId,revision:l.revision,slug});
  if(!r.ok)fail(r.reason);else announceListsChanged();await load();setBusy(false);
 };
 const create=async()=>{
  const nm=nameRef.current?.value.trim()??'';if(!nm||isSystemList(nm))return;
  setBusy(true);setMsg(null);const listId=crypto.randomUUID(),made=await postListChange({action:'create',listId,name:nm});
  if(!made.ok){fail(made.reason);setBusy(false);return;}
  const fresh=await fetchLists(slug),mine=fresh?.find(x=>x.listId===listId);
  if(mine){const a=await postListChange({action:'add',listId,revision:mine.revision,slug});if(!a.ok)fail(a.reason);}
  if(nameRef.current)nameRef.current.value='';announceListsChanged();await load();setBusy(false);
 };
 const byName=(n:string)=>(lists??[]).find(l=>l.name===n);
 const custom=(lists??[]).filter(l=>!isSystemList(l.name));
 const saved=(lists??[]).some(l=>l.hasPlace);
 const sysRows:{n:typeof BEEN_NAME|typeof WANT_NAME;label:string;icon:typeof Check}[]=[{n:BEEN_NAME,label:t('He estado','Been here'),icon:Check},{n:WANT_NAME,label:t('Quiero ir','Want to go'),icon:Bookmark}];
 return <div className="relative" data-save-to-list data-ready={ready||undefined}>
  {!hideButton&&<button type="button" aria-haspopup="dialog" aria-expanded={open} data-save-open aria-label={variant==='icon'?(saved?t('Guardado','Saved'):t('Guardar','Save')):undefined}
   className={variant==='icon'?`grid h-10 w-10 place-items-center rounded-full border border-[#d7e1ea] ${saved?'bg-[#eaf6fb] text-[#0089bb]':'bg-white text-[#162543]'} ${ring}`:chipClass?`${chipClass} ${saved?'!bg-[#d9f0fb]':''}`:`${secondary} ${saved?'bg-[#eaf6fb]':'bg-white'}`}
   onClick={async()=>{setOpen(true);if(lists===null)await load();}}><Bookmark aria-hidden="true" className={`h-4 w-4 ${saved?'fill-current':''}`}/>{variant==='icon'?null:saved?t('Guardado','Saved'):t('Guardar','Save')}</button>}
  {open&&<div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 sm:items-center" onClick={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
   <div id="save-panel" role="dialog" aria-modal="true" aria-label={t('Guardar en','Save to')} className="max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-[#162543] shadow-2xl sm:rounded-3xl sm:pb-5">
    <div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">{t('Guardar en','Save to')}</h2>
     <button ref={closeRef} type="button" aria-label={t('Cerrar','Close')} onClick={()=>setOpen(false)} className={`grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100 ${ring}`}><X aria-hidden="true" className="h-5 w-5"/></button></div>
    {lists===null?<p role="status">{t('Cargando…','Loading…')}</p>:<>
     <ul className="space-y-1">
      {sysRows.map(({n,label,icon:Icon})=>{const l=byName(n);return <li key={n}><label className="flex min-h-12 items-center gap-3 rounded-xl px-2 hover:bg-slate-50">
       <span className="grid h-9 w-9 place-items-center rounded-full bg-[#eaf6fb] text-[#0089bb]"><Icon aria-hidden="true" className="h-4 w-4"/></span>
       <span className="flex-1 font-semibold">{label}</span>
       <input type="checkbox" className="h-5 w-5 accent-[#009FD9]" data-save-list={n} checked={!!l?.hasPlace} disabled={busy} onChange={()=>toggleSystem(n,!l?.hasPlace)}/></label></li>;})}
      {custom.map(l=><li key={l.listId}><label className="flex min-h-12 items-center gap-3 rounded-xl px-2 hover:bg-slate-50">
       <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600"><Bookmark aria-hidden="true" className="h-4 w-4"/></span>
       <span className="flex-1">{l.name} <span className="text-xs text-slate-700">({l.count})</span></span>
       <input type="checkbox" className="h-5 w-5 accent-[#009FD9]" data-save-list={l.name} checked={!!l.hasPlace} disabled={busy} onChange={()=>toggleCustom(l)}/></label></li>)}
     </ul>
     <form className="flex gap-2" onSubmit={e=>{e.preventDefault();void create();}}>
      <label className="sr-only" htmlFor="save-new">{t('Nombre de la nueva lista','New list name')}</label>
      <input id="save-new" ref={nameRef} data-save-new-name maxLength={80} placeholder={t('Nueva lista','New list')} className="min-h-11 w-full min-w-0 rounded-xl border border-slate-300 px-3 text-base"/>
      <button type="submit" disabled={busy} data-save-create className={`${button} bg-[#162543] px-4 text-white disabled:opacity-60`}>{t('Crear','Create')}</button></form>
     {msg&&<p role="alert" className="text-sm font-semibold text-red-800">{msg.text}</p>}
     <a className={`inline-block text-sm underline underline-offset-2 ${ring}`} href={`${prefix}${PANEL_MIS_LISTAS}`}>{t('Ver mis listas','See my lists')}</a>
    </>}
   </div></div>}
 </div>;
}
