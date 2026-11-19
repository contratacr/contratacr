'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {taskViewResultSchema,taskViewsSchema,type TaskViewFilters,type TaskViews} from '@/lib/pro/operations';

/**
 * Ronda F2-C (row 15): saved views of the global task center. A view stores the current filters (status, date,
 * search, job, responsible) under a name, per person. Applying one only changes the address filters; the list
 * is read as before. Up to 20 views; another tab's change is detected by revision (409).
 */
const same=(a:TaskViewFilters,b:TaskViewFilters)=>a.status===b.status&&a.timing===b.timing&&a.q===b.q&&a.job===b.job&&a.assignee===b.assignee;
export function TaskCenterViews({accountId,current,disabled,onApply}:{accountId:string;current:TaskViewFilters;disabled:boolean;onApply:(filters:TaskViewFilters)=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [views,setViews]=useState<TaskViews|null>(null),[naming,setNaming]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),pending=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/task-views',{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();setViews(taskViewsSchema.parse(await r.json()));}catch{setError(t('No se pudieron cargar sus vistas guardadas.','Could not load your saved views.'));}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[accountId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function send(body:Record<string,unknown>){
  if(!views||busy)return false;const key=JSON.stringify(body);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');
  try{const r=await fetch('/api/pro/task-views',{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({...body,actionId:pending.current.id,revision:views.revision})});
   const data=await r.json().catch(()=>({}));if(!r.ok){if(r.status===409||r.status===429)pending.current=null;setError(typeof data.error==='string'?data.error:t('No se pudo guardar.','Could not save.'));if(r.status===409)await load();return false;}
   taskViewResultSchema.parse(data);pending.current=null;await load();return true;}
  catch{setError(t('No se pudo comprobar el guardado. Reintente: no se duplicará.','Could not confirm the save. Retry: it will not be duplicated.'));return false;}
  finally{setBusy(false);}
 }
 async function save(event:FormEvent){event.preventDefault();const name=(naming??'').trim();if(!name||name.length>60){setError(t('Escriba un nombre de hasta 60 caracteres.','Write a name of up to 60 characters.'));return;}
  const existing=views?.items.find(v=>v.name.toLowerCase()===name.toLowerCase());if(await send({action:'save',viewId:existing?.id??crypto.randomUUID(),name,filters:current}))setNaming(null);}
 const active=views?.items.find(v=>same(v.filters,current));
 return <div data-task-center-views className="flex min-w-0 flex-wrap items-center gap-2">
  <span className="text-sm font-semibold text-[#52627a]">{t('Vistas guardadas','Saved views')}</span>
  {views?.items.map(view=><span key={view.id} className="inline-flex min-w-0 items-center rounded-full border border-[#d7e1ea] bg-white">
   <button type="button" data-task-view={view.name} aria-pressed={active?.id===view.id} disabled={disabled||busy} onClick={()=>onApply(view.filters)} className={`min-h-11 max-w-[14rem] truncate rounded-full px-3 text-sm font-semibold disabled:opacity-50 ${active?.id===view.id?'text-[#008bb5]':'text-[#162543]'}`}>{view.name}</button>
   <button type="button" data-task-view-delete={view.name} aria-label={t('Borrar vista ','Delete view ')+'"'+view.name+'"'} disabled={disabled||busy} onClick={()=>void send({action:'delete',viewId:view.id})} className="flex h-11 w-9 items-center justify-center rounded-full text-[#68778d] hover:text-[#9b1c1c] disabled:opacity-50"><X aria-hidden="true" className="h-4 w-4"/></button>
  </span>)}
  {views&&!views.items.length&&naming===null&&<span className="text-sm text-[#68778d]">{t('Todavía no tiene vistas.','No views yet.')}</span>}
  {naming===null?<Button type="button" variant="secondary" data-task-view-save className="min-h-11" disabled={disabled||busy||!views||!!active} onClick={()=>{setNaming('');setError('');}}>{t('Guardar esta vista','Save this view')}</Button>
  :<form onSubmit={save} className="flex min-w-0 flex-wrap items-center gap-2"><input autoFocus aria-label={t('Nombre de la vista','View name')} placeholder={t('Nombre de la vista','View name')} maxLength={60} value={naming} disabled={busy} onChange={e=>setNaming(e.target.value)} className="min-h-11 min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base sm:w-56"/><Button type="submit" className="min-h-11" disabled={busy}>{busy?t('Guardando…','Saving…'):t('Guardar','Save')}</Button><Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={()=>setNaming(null)}>{t('Cancelar','Cancel')}</Button></form>}
  {error&&<p role="alert" className="w-full text-sm text-red-700">{error}</p>}
 </div>;
}
