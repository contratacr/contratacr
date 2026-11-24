'use client';
import {useRef,useState,useSyncExternalStore} from 'react';
import {featureReasonText,type SavedList} from '@/lib/directory/place-features';
import {isSystemList,announceListsChanged} from '@/components/saved/lists-client';

/**
 * LOCAL PRO ONLY (place features round, 2026-11-17): «Mis listas» (/listas). Create, rename, delete, remove places and
 * turn the share link on/off (a new random link every time it is turned on; the old one stops working). Private by
 * default. CAS by revision: another tab → 409 → the lists reload. Idempotent actionId kept until the server answers.
 */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const btn=`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-60 ${ring}`;
const noSubscribe=()=>()=>{};
const field='min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543]';
export function SavedListsManager({locale,initial,origin}:{locale:string;initial:SavedList[];origin:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const [lists,setLists]=useState(()=>initial.filter(l=>!isSystemList(l.name))),[msg,setMsg]=useState<{ok:boolean;text:string}|null>(null),[busy,setBusy]=useState(false),[editing,setEditing]=useState<string|null>(null);
 const actions=useRef(new Map<string,{id:string;body:string}>());
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 const load=async()=>{const r=await fetch('/api/listas',{cache:'no-store'});const j=await r.json().catch(()=>({}));if(r.ok){setLists((j.items as SavedList[]).filter(l=>!isSystemList(l.name)));announceListsChanged();}};
 const mutate=async(key:string,body:Record<string,unknown>,ok:string)=>{
  const k=JSON.stringify(body);let a=actions.current.get(key);if(!a||a.body!==k){a={id:crypto.randomUUID(),body:k};actions.current.set(key,a);}
  setBusy(true);setMsg(null);
  try{
   const r=await fetch('/api/listas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,actionId:a.id})});
   const j=await r.json().catch(()=>({})) as {reason?:string};actions.current.delete(key);
   await load();
   setMsg(r.ok?{ok:true,text:ok}:{ok:false,text:featureReasonText(j.reason,en)});return r.ok;
  }catch{setMsg({ok:false,text:featureReasonText('unavailable',en)});return false;}finally{setBusy(false);}
 };
 return <div className="space-y-6" data-lists-manager data-ready={ready||undefined}>
  <form data-lists-create className="flex gap-2" onSubmit={async e=>{e.preventDefault();const el=e.currentTarget,name=String(new FormData(el).get('name')??'').trim();if(!name)return;
    if(isSystemList(name)){setMsg({ok:false,text:t('Ese nombre está reservado. Elija otro.','That name is reserved. Choose another one.')});return;}
    if(await mutate('create:'+name,{action:'create',listId:crypto.randomUUID(),name},t('Lista creada.','List created.')))el.reset();}}>
   <label className="sr-only" htmlFor="lists-new">{t('Nombre de la nueva lista','New list name')}</label>
   <input id="lists-new" name="name" maxLength={80} placeholder={t('Nueva lista, p. ej. "Sodas para el almuerzo"','New list, e.g. "Lunch spots"')} className={field}/>
   <button type="submit" disabled={busy} className={`${btn} bg-[#162543] text-white`}>{t('Crear','Create')}</button></form>
  {msg&&<p role={msg.ok?'status':'alert'} data-lists-msg={msg.ok?'ok':'error'} className={`text-sm font-semibold ${msg.ok?'text-emerald-800':'text-red-800'}`}>{msg.text}</p>}
  {lists.length===0?<p data-lists-empty className="rounded-2xl bg-slate-50 p-5 text-slate-700">{t('Todavía no tiene listas propias. Cree una arriba o use "Guardar" en la página de un lugar.','You have no lists of your own yet. Create one above or use "Save" on a place page.')}</p>
   :<ul className="space-y-4">{lists.map(l=>{const share=l.shareToken?`${origin}${prefix}/lista/${l.shareToken}`:null;return <li key={l.listId} data-list={l.name} className="space-y-3 rounded-2xl border border-[#d7e1ea] p-4">
    {editing===l.listId?<form className="flex gap-2" onSubmit={async e=>{e.preventDefault();const name=String(new FormData(e.currentTarget).get('name')??'').trim();
      if(name&&name!==l.name&&await mutate('rename:'+l.listId,{action:'rename',listId:l.listId,revision:l.revision,name},t('Nombre actualizado.','Name updated.')))setEditing(null);}}>
     <label className="sr-only" htmlFor={'rename-'+l.listId}>{t('Nuevo nombre','New name')}</label>
     <input id={'rename-'+l.listId} name="name" defaultValue={l.name} maxLength={80} className={field}/>
     <button type="submit" disabled={busy} className={`${btn} bg-[#162543] text-white`}>{t('Guardar','Save')}</button>
     <button type="button" className={`${btn} border border-slate-300`} onClick={()=>setEditing(null)}>{t('Cancelar','Cancel')}</button></form>
     :<h2 className="text-lg font-bold">{l.name} <span className="text-sm font-normal text-slate-700">({l.count})</span></h2>}
    {l.places.length>0&&<ul className="space-y-1">{l.places.map(p=><li key={p.slug} className="flex flex-wrap items-center justify-between gap-2">
     <span className="min-w-0"><a className={`underline underline-offset-2 ${ring}`} href={`${prefix}/lugar/${p.slug}`}>{p.name}</a>{p.area?<span className="text-sm text-slate-700"> · {p.area}</span>:null}</span>
     <button type="button" disabled={busy} className={`${btn} border border-slate-300`} onClick={()=>mutate('rm:'+l.listId+p.slug,{action:'remove',listId:l.listId,revision:l.revision,slug:p.slug},t('Lugar quitado.','Place removed.'))}>{t('Quitar','Remove')}<span className="sr-only"> {p.name}</span></button></li>)}</ul>}
    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
     <p className="text-sm font-semibold">{share?t('Compartida: cualquiera con el enlace puede verla (sin su nombre).','Shared: anyone with the link can see it (without your name).'):t('Privada: solo usted la ve.','Private: only you can see it.')}</p>
     {share&&<input readOnly data-list-share-link value={share} aria-label={t('Enlace para compartir','Share link')} className={field} onFocus={e=>e.currentTarget.select()}/>}
     <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} data-list-share={share?'off':'on'} className={`${btn} border border-[#162543] bg-white`}
       onClick={()=>mutate('share:'+l.listId,{action:share?'share_off':'share_on',listId:l.listId,revision:l.revision},share?t('El enlace ya no funciona.','The link no longer works.'):t('Enlace creado.','Link created.'))}>
       {share?t('Dejar de compartir','Stop sharing'):t('Crear enlace para compartir','Create share link')}</button>
      {share&&<button type="button" className={`${btn} border border-slate-300 bg-white`} onClick={()=>navigator.clipboard?.writeText(share).then(()=>setMsg({ok:true,text:t('Enlace copiado.','Link copied.')})).catch(()=>{})}>{t('Copiar enlace','Copy link')}</button>}
      <button type="button" className={`${btn} border border-slate-300 bg-white`} onClick={()=>setEditing(l.listId)}>{t('Renombrar','Rename')}</button>
      <button type="button" disabled={busy} data-list-delete className={`${btn} border border-red-300 bg-white text-red-800`} onClick={()=>{if(window.confirm(t(`¿Eliminar la lista "${l.name}"?`,`Delete the list "${l.name}"?`)))void mutate('del:'+l.listId,{action:'delete',listId:l.listId,revision:l.revision},t('Lista eliminada.','List deleted.'));}}>{t('Eliminar','Delete')}</button>
     </div></div>
   </li>;})}</ul>}
 </div>;
}
