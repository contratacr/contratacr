'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {selectionVisibilitySchema,type SelectionVisibility} from '@/lib/pro/round11';

/**
 * Round 11 (row 62): per selection item, hide the price and/or the product link from the customer view.
 * The owner keeps seeing everything; the customer copy returns no price/link for that item (SQL). Saves
 * all changed items in one action (idempotent actionId, revision per item → 409 if another tab changed it).
 */
export function SelectionVisibilityPanel({workId}:{workId:string}){const {user,loading}=useAuth();if(loading||!user)return null;return <Panel key={user.id+':'+workId} actor={user.id} workId={workId}/>;}
type Row=SelectionVisibility['items'][number];
function Panel({actor,workId}:{actor:string;workId:string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [data,setData]=useState<SelectionVisibility|null>(null),[draft,setDraft]=useState<Record<string,{hidePrice:boolean;hideLink:boolean}>>({}),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),pending=useRef<{body:string;id:string}|null>(null);
 const load=useCallback(async()=>{setError('');try{const response=await fetch('/api/pro/selections-visibility?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!response.ok)throw Error();const body=selectionVisibilitySchema.parse(await response.json());setData(body);setDraft(Object.fromEntries(body.items.map(i=>[i.itemId,{hidePrice:i.hidePrice,hideLink:i.hideLink}])));}catch{setError(t('No se pudo cargar la visibilidad de las selecciones.','Could not load selection visibility.'));}},[actor,workId,en]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!open)return;const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[open,load]);
 const changed=(data?.items??[]).filter(i=>draft[i.itemId]&&(draft[i.itemId].hidePrice!==i.hidePrice||draft[i.itemId].hideLink!==i.hideLink));
 async function save(){
  if(busy||!changed.length)return;setBusy(true);setError('');setNotice('');
  const items=changed.map((i:Row)=>({itemId:i.itemId,revision:i.revision,...draft[i.itemId]})),key=JSON.stringify(items);
  if(pending.current?.body!==key)pending.current={body:key,id:crypto.randomUUID()};
  try{const response=await fetch('/api/pro/selections-visibility',{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify({action:'visibility_set',actionId:pending.current.id,workId,items})});
   if(response.status===409){pending.current=null;setError(t('Otra pestaña cambió estas selecciones. Se recargaron: revise y guarde de nuevo.','Another tab changed these selections. They were reloaded: review and save again.'));await load();return;}
   if(!response.ok)throw Error();pending.current=null;setNotice(t('Visibilidad guardada.','Visibility saved.'));await load();}
  catch{setError(t('No se pudo guardar. Reintente: no se aplicará dos veces.','Could not save. Retry: it will not be applied twice.'));}
  finally{setBusy(false);}
 }
 const set=(id:string,key:'hidePrice'|'hideLink',value:boolean)=>setDraft(old=>({...old,[id]:{...old[id],[key]:value}}));
 return <section data-selection-visibility className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><h4 className="font-bold text-[#162543]">{t('Qué ve el cliente','What the customer sees')}</h4><p className="text-sm text-[#52627a]">{t('Oculte el precio o el enlace del producto de una selección en la vista del cliente. Usted los sigue viendo.','Hide the price or the product link of a selection in the customer view. You still see them.')}</p></div>
   <Button type="button" variant="outline" className="min-h-11" aria-expanded={open} data-selection-visibility-toggle onClick={()=>setOpen(!open)}>{open?t('Ocultar','Hide'):t('Elegir qué ocultar','Choose what to hide')}</Button></div>
  {open&&<>
   {error&&<p role="alert" className="rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]">{error}</p>}
   {notice&&<p role="status" className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
   {!data&&!error?<p role="status" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>:data&&data.items.length===0?<p className="text-sm text-[#52627a]">{t('Todavía no hay selecciones.','No selections yet.')}</p>:data&&
    <ul className="space-y-2">{data.items.map(item=><li key={item.itemId} data-selection-visibility-item={item.itemId} className="flex flex-col gap-2 rounded-xl border border-[#e5e7eb] p-3 sm:flex-row sm:items-center sm:justify-between">
     <span className="min-w-0 break-words text-sm"><span className="font-semibold text-[#162543]">{item.name}</span><span className="block text-xs text-[#52627a]">{item.areaName}{item.published?'':' · '+t('sin publicar','not published')}</span></span>
     <span className="flex flex-wrap gap-4 text-sm">
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-[#008bb5]" data-selection-hide-price checked={draft[item.itemId]?.hidePrice??false} disabled={busy} onChange={event=>set(item.itemId,'hidePrice',event.target.checked)}/>{t('Ocultar precio','Hide price')}</label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-[#008bb5]" data-selection-hide-link checked={draft[item.itemId]?.hideLink??false} disabled={busy} onChange={event=>set(item.itemId,'hideLink',event.target.checked)}/>{t('Ocultar enlace','Hide link')}</label>
     </span></li>)}</ul>}
   {data&&data.items.length>0&&<Button type="button" className="min-h-11" data-selection-visibility-save disabled={busy||!changed.length} onClick={()=>void save()}>{busy?t('Guardando…','Saving…'):t('Guardar visibilidad','Save visibility')}</Button>}
  </>}
 </section>;
}
