'use client';
import {useRef,useState,useSyncExternalStore} from 'react';
import {featureReasonText,type SavedList} from '@/lib/directory/place-features';

/**
 * LOCAL PRO ONLY (place features round, 2026-11-17): «Guardar» on a place page. Signed in: a small panel with the
 * person's lists (check = saved), and «Nueva lista». Lists are private; sharing is managed in /listas. Each change is
 * CAS by list revision (another tab → 409 → the panel reloads) and idempotent (actionId kept until the server answers).
 */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const noSubscribe=()=>()=>{};
const button=`inline-flex min-h-11 items-center justify-center rounded-full px-5 font-semibold ${ring}`;
export function SaveToList({slug,locale,signedIn,loginHref}:{slug:string;locale:string;signedIn:boolean;loginHref:string|null}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const [open,setOpen]=useState(false),[lists,setLists]=useState<SavedList[]|null>(null),[msg,setMsg]=useState<{ok:boolean;text:string}|null>(null),[busy,setBusy]=useState(false);
 const actions=useRef(new Map<string,{id:string;body:string}>()),nameRef=useRef<HTMLInputElement>(null);
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 if(!signedIn)return loginHref?<a data-save-login className={`${button} border border-[#162543] bg-white`} href={loginHref}>{t('Guardar','Save')}</a>:null;
 const load=async()=>{const r=await fetch(`/api/listas?slug=${encodeURIComponent(slug)}`,{cache:'no-store'});const j=await r.json().catch(()=>({}));setLists(r.ok?(j.items as SavedList[]):[]);};
 const mutate=async(key:string,body:Record<string,unknown>)=>{
  const k=JSON.stringify(body);let a=actions.current.get(key);if(!a||a.body!==k){a={id:crypto.randomUUID(),body:k};actions.current.set(key,a);}
  setBusy(true);setMsg(null);
  try{
   const r=await fetch('/api/listas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,actionId:a.id})});
   const j=await r.json().catch(()=>({})) as {reason?:string};actions.current.delete(key);
   if(!r.ok){setMsg({ok:false,text:featureReasonText(j.reason,en)});await load();return false;}
   await load();return true;
  }catch{setMsg({ok:false,text:featureReasonText('unavailable',en)});return false;}finally{setBusy(false);}
 };
 const saved=(lists??[]).some(l=>l.hasPlace);
 return <div className="relative" data-save-to-list data-ready={ready||undefined}>
  <button type="button" aria-expanded={open} aria-controls="save-panel" data-save-open className={`${button} border border-[#162543] ${saved?'bg-[#eaf6fb]':'bg-white'}`}
   onClick={async()=>{const next=!open;setOpen(next);if(next&&lists===null)await load();}}>{saved?t('Guardado','Saved'):t('Guardar','Save')}</button>
  {open&&<div id="save-panel" role="group" aria-label={t('Guardar en una lista','Save to a list')} className="absolute left-0 z-10 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 text-[#162543] shadow-lg">
   {lists===null?<p role="status">{t('Cargando…','Loading…')}</p>:<>
    {lists.length===0&&<p className="text-sm text-slate-700">{t('Todavía no tiene listas.','You have no lists yet.')}</p>}
    <ul className="space-y-1">{lists.map(l=><li key={l.listId}><label className="flex min-h-11 items-center gap-3">
     <input type="checkbox" className="h-5 w-5" data-save-list={l.name} checked={!!l.hasPlace} disabled={busy}
      onChange={()=>mutate('item:'+l.listId,{action:l.hasPlace?'remove':'add',listId:l.listId,revision:l.revision,slug})}/>
     <span>{l.name} <span className="text-xs text-slate-700">({l.count})</span></span></label></li>)}</ul>
    <form className="flex gap-2" onSubmit={async e=>{e.preventDefault();const name=nameRef.current?.value.trim()??'';if(!name)return;
      const listId=crypto.randomUUID();if(await mutate('create:'+name,{action:'create',listId,name})){
       const fresh=await fetch(`/api/listas?slug=${encodeURIComponent(slug)}`,{cache:'no-store'}).then(r=>r.json()).catch(()=>({items:[]})) as {items:SavedList[]};
       const made=fresh.items.find(x=>x.listId===listId);if(made)await mutate('item:'+listId,{action:'add',listId,revision:made.revision,slug});if(nameRef.current)nameRef.current.value='';}}}>
     <label className="sr-only" htmlFor="save-new">{t('Nombre de la nueva lista','New list name')}</label>
     <input id="save-new" ref={nameRef} data-save-new-name maxLength={80} placeholder={t('Nueva lista','New list')} className="min-h-11 w-full min-w-0 rounded-xl border border-slate-300 px-3 text-base"/>
     <button type="submit" disabled={busy} data-save-create className={`${button} bg-[#162543] px-4 text-white`}>{t('Crear','Create')}</button></form>
    {msg&&<p role="alert" className="text-sm font-semibold text-red-800">{msg.text}</p>}
    <a className={`text-sm underline underline-offset-2 ${ring}`} href={`${prefix}/listas`}>{t('Ver mis listas','See my lists')}</a>
   </>}
  </div>}
 </div>;
}
