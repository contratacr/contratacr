'use client';
import {useCallback,useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {marketingListsSchema,type MarketingLists as Lists} from '@/lib/pro/marketing';

/** Area E: email lists. System lists (everyone with consent, customers, leads) with their counts, and the owner's custom lists. */
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
export function useMarketingLists(){
 const [lists,setLists]=useState<Lists|null>(null),[failed,setFailed]=useState(false);
 const load=useCallback(async()=>{setFailed(false);try{const r=await fetch('/api/pro/marketing-lists',{cache:'no-store'});if(!r.ok)throw Error();setLists(marketingListsSchema.parse(await r.json()));}catch{setFailed(true);}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 return {lists,setLists,failed,reload:load};
}
export function MarketingLists({en,lists,failed,reload,onChange}:{en:boolean;lists:Lists|null;failed:boolean;reload:()=>void;onChange:(next:Lists)=>void}){
 const t=(es:string,english:string)=>en?english:es,[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState<string|null>(null),[picked,setPicked]=useState<Set<string>>(new Set()),[renaming,setRenaming]=useState('');
 async function send(body:Record<string,unknown>){
  setBusy(true);setError('');
  try{const r=await fetch('/api/pro/marketing-lists',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(r.status===409){setError(t('Ya existe una lista con ese nombre o llegó al límite de 30 listas.','A list with that name already exists or you reached the limit of 30 lists.'));return false;}
   if(!r.ok){setError(t('No se pudo guardar la lista. Revise los datos.','Could not save the list. Check the details.'));return false;}
   onChange(marketingListsSchema.parse(await r.json()));return true;
  }catch{setError(t('No se pudo guardar la lista. Reintente.','Could not save the list. Retry.'));return false;}finally{setBusy(false);}
 }
 if(failed)return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{t('No se pudieron cargar las listas.','Could not load the lists.')}</span><Button type="button" variant="secondary" onClick={reload}>{t('Reintentar','Retry')}</Button></div>;
 if(!lists)return <p role="status" className="text-sm text-[#52627a]">{t('Cargando listas…','Loading lists…')}</p>;
 const sys=[['all',t('Todos con consentimiento','Everyone with consent'),lists.system.all],['clients',t('Clientes','Customers'),lists.system.clients],['leads',t('Solicitudes','Leads'),lists.system.leads]] as const;
 return <section data-mkt-lists className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5" aria-labelledby="mkt-lists-title">
  <h3 id="mkt-lists-title" className="font-bold">{t('Listas de correo','Email lists')}</h3>
  <p className="text-sm text-[#52627a]">{t('Solo se incluyen contactos con consentimiento vigente. Una campaña puede dirigirse a cualquiera de estas listas.','Only contacts with current consent are included. A campaign can target any of these lists.')}</p>
  <div><p className="text-xs font-bold uppercase tracking-wide text-[#52627a]">{t('Listas del sistema','System lists')} ({sys.length})</p>
   <ul className="mt-1 grid gap-2 sm:grid-cols-3">{sys.map(([key,label,count])=><li key={key} data-mkt-system-list={key} className="rounded-xl bg-[#f7f9fc] p-3 text-sm"><span className="font-semibold">{label}</span><span data-mkt-list-count className="block text-lg font-bold">{count}</span></li>)}</ul></div>
  <div className="space-y-2"><p className="text-xs font-bold uppercase tracking-wide text-[#52627a]">{t('Sus listas','Your lists')} ({lists.lists.length})</p>
   <div className="flex flex-wrap items-end gap-2"><label className="block min-w-0 flex-1 text-sm font-medium">{t('Nombre de la lista nueva','New list name')}<input data-mkt-list-name maxLength={80} value={name} onChange={e=>setName(e.target.value)} className={field}/></label>
    <Button type="button" className="min-h-11" data-mkt-list-create disabled={busy||!name.trim()} onClick={()=>void send({action:'create',id:crypto.randomUUID(),name}).then(ok=>{if(ok)setName('');})}>{t('Crear lista','Create list')}</Button></div>
   {error&&<p role="alert" className="text-sm text-[#8a2a1b]">{error}</p>}
   {!lists.lists.length?<p data-mkt-lists-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-4 text-sm text-[#52627a]">{t('Todavía no tiene listas propias. Cree una y elija sus contactos.','You have no lists of your own yet. Create one and choose its contacts.')}</p>
   :<ul className="space-y-2">{lists.lists.map(list=><li key={list.id} data-mkt-list={list.id} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-words font-semibold">{list.name}</span><span data-mkt-list-audience className="text-[#52627a]">{list.audience} {list.audience===1?t('contacto','contact'):t('contactos','contacts')}</span></div>
    {editing===list.id?<div className="space-y-2">
     <label className="block font-medium">{t('Nombre','Name')}<input maxLength={80} value={renaming} onChange={e=>setRenaming(e.target.value)} className={field}/></label>
     {!lists.contacts.length?<p className="text-[#52627a]">{t('No hay contactos con consentimiento todavía.','There are no contacts with consent yet.')}</p>:<ul className="max-h-56 space-y-1 overflow-y-auto">{lists.contacts.map(c=><li key={c.id}><label className="flex min-h-11 items-center gap-2"><input type="checkbox" data-mkt-list-member={c.id} checked={picked.has(c.id)} onChange={e=>setPicked(prev=>{const n=new Set(prev);if(e.target.checked)n.add(c.id);else n.delete(c.id);return n;})} className="h-5 w-5 accent-[#0089bb]"/><span className="min-w-0 break-words">{c.name} <span className="text-[#52627a]">{c.email}</span></span></label></li>)}</ul>}
     <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" data-mkt-list-save disabled={busy||!renaming.trim()} onClick={()=>void (async()=>{if(renaming.trim()!==list.name&&!(await send({action:'rename',id:list.id,name:renaming})))return;if(await send({action:'set_members',id:list.id,contactIds:[...picked]}))setEditing(null);})()}>{t('Guardar','Save')}</Button><Button type="button" variant="ghost" className="min-h-11" onClick={()=>setEditing(null)}>{t('Cancelar','Cancel')}</Button></div></div>
    :<div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" className="min-h-11" data-mkt-list-edit disabled={busy} onClick={()=>{setEditing(list.id);setPicked(new Set(list.contactIds));setRenaming(list.name);setError('');}}>{t('Editar contactos','Edit contacts')}</Button><Button type="button" size="sm" variant="ghost" className="min-h-11" data-mkt-list-delete disabled={busy} onClick={()=>void send({action:'delete',id:list.id})}>{t('Eliminar','Delete')}</Button></div>}
   </li>)}</ul>}
  </div>
 </section>;
}
