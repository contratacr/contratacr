'use client';

import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {pushProParams} from '@/lib/pro/navigation';
import {crTodayISO} from '@/lib/time-cr';
import {workFilesPageSchema,type WorkFile} from '@/lib/pro/work-files';
import {clientPunchlistSchema,punchMutationSchema,punchResultSchema,punchlistSchema,type ClientPunchlist,type PunchItem,type PunchMutation,type Punchlist} from '@/lib/pro/work-punchlist';
import {useProChildGuard} from './use-pro-child-guard';

// Family 15: punch list of closing items. Items are job tasks (same history and
// task center) plus an optional job photo; sharing is the customer-view section.
const api='/api/pro/work-punchlist';
const field='mt-1 block min-h-11 w-full min-w-0 max-w-full appearance-none rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
type StateCallback={onStateChange?:(state:{dirty:boolean;busy:boolean})=>void};
type Values={title:string;dueDate:string;assignee:string;details:string;photoFileId:string;photoRequired:boolean};
type Editor={item:PunchItem|null;values:Values};
type Filter='all'|'open'|'done';
const toValues=(item:PunchItem|null):Values=>({title:item?.title??'',dueDate:item?.dueDate??'',assignee:item?.assignee??'',details:item?.details??'',photoFileId:item?.photoFileId??'',photoRequired:item?.photoRequired??false});
const fmt=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));

function copy(en:boolean){
 return en?{
  title:'Punch list',intro:'Closing items to finish before handing over the job. Each item is also a job task.',counter:(d:number,t:number)=>`${d} of ${t} completed`,
  create:'New punch item',move:'Move a task here',moveLabel:'Open task',moveButton:'Add to punch list',noCandidates:'There are no open tasks to move.',
  all:'All',open:'Pending',done:'Completed',statusOpen:'Pending',statusDone:'Completed',filterLabel:'Filter punch list',edit:'Edit',complete:'Mark completed',reopen:'Reopen',archive:'Archive',more:'More options',
  formNew:'New punch item',formEdit:'Edit punch item',item:'Item',due:'Due date (optional)',assignee:'Responsible (optional)',assigneeHelp:'Internal reference only; no invitations are sent.',notes:'Internal notes (optional)',
  photo:'Photo from job files (optional)',noPhoto:'No photo',photoHelp:'Upload photos in Updates › Job files; JPEG files appear here.',photoRequired:'Require a photo before completing',photoNeeded:'Add a photo before completing this item.',
  save:'Save',saving:'Saving…',cancel:'Cancel',saved:'Punch item saved.',empty:'No punch items yet. Add the details to fix or check before handing over the job.',emptyFilter:'No items in this view.',
  overdue:'Overdue',loading:'Loading punch list…',loadError:'Could not load the punch list.',retry:'Retry',conflict:'The item changed in another window. Reload before saving again.',reload:'Reload',
  uncertain:'We could not confirm whether it was saved. Retry the same operation; it will not be applied twice.',retrySame:'Retry the same save',failed:'It was not saved. Review the data.',
  leave:'Save or cancel the punch item before leaving.',shared:'Visible in the customer view',notShared:'Not shared with the customer',configureShare:'Configure customer view',
  discardTitle:'Discard changes?',discardBody:'The saved item is preserved.',discard:'Discard changes',keep:'Keep editing',archiveTitle:'Archive this item?',archiveBody:'It leaves the punch list and stays archived in Tasks.',photoAlt:(t:string)=>`Photo of ${t}`,
 }:{
  title:'Pendientes finales',intro:'Detalles de cierre que deben quedar listos antes de entregar el trabajo. Cada pendiente también es una tarea del trabajo.',counter:(d:number,t:number)=>`${d} de ${t} completados`,
  create:'Nuevo pendiente',move:'Pasar una tarea',moveLabel:'Tarea pendiente',moveButton:'Agregar a pendientes finales',noCandidates:'No hay tareas pendientes para pasar.',
  all:'Todos',open:'Pendientes',done:'Completados',statusOpen:'Pendiente',statusDone:'Completado',filterLabel:'Filtrar pendientes finales',edit:'Editar',complete:'Marcar completado',reopen:'Reabrir',archive:'Archivar',more:'Más opciones',
  formNew:'Nuevo pendiente',formEdit:'Editar pendiente',item:'Pendiente',due:'Fecha límite (opcional)',assignee:'Responsable (opcional)',assigneeHelp:'Solo referencia interna; no envía invitaciones.',notes:'Notas internas (opcional)',
  photo:'Foto de los archivos del trabajo (opcional)',noPhoto:'Sin foto',photoHelp:'Suba fotos en Avances › Archivos del trabajo; las JPEG aparecen aquí.',photoRequired:'Exigir una foto antes de completarlo',photoNeeded:'Agregue una foto antes de completar este pendiente.',
  save:'Guardar',saving:'Guardando…',cancel:'Cancelar',saved:'Pendiente guardado.',empty:'Todavía no hay pendientes finales. Agregue los detalles por corregir o revisar antes de entregar el trabajo.',emptyFilter:'No hay pendientes en esta vista.',
  overdue:'Vencido',loading:'Cargando pendientes finales…',loadError:'No se pudieron cargar los pendientes finales.',retry:'Reintentar',conflict:'El pendiente cambió en otra ventana. Recargue antes de volver a guardar.',reload:'Recargar',
  uncertain:'No pudimos confirmar si se guardó. Reintente la misma operación; no se aplicará dos veces.',retrySame:'Reintentar el mismo guardado',failed:'No se guardó. Revise los datos.',
  leave:'Guarde o cancele el pendiente antes de salir.',shared:'Visible en la vista del cliente',notShared:'No se comparte con el cliente',configureShare:'Configurar vista del cliente',
  discardTitle:'¿Descartar cambios?',discardBody:'El pendiente guardado se conserva.',discard:'Descartar cambios',keep:'Seguir editando',archiveTitle:'¿Archivar este pendiente?',archiveBody:'Sale de los pendientes finales y queda archivado en Tareas.',photoAlt:(t:string)=>`Foto de ${t}`,
 };
}

export function WorkPunchlist({workId,onStateChange}:{workId:string}&StateCallback){const {user,loading}=useAuth();if(loading||!user)return null;return <PunchSession key={user.id+':'+workId} accountId={user.id} workId={workId} onStateChange={onStateChange}/>;}

function PunchSession({accountId,workId,onStateChange}:{accountId:string;workId:string}&StateCallback){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog();
 const [data,setData]=useState<Punchlist|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false),[files,setFiles]=useState<WorkFile[]|null>(null);
 const [filter,setFilter]=useState<Filter>('all'),[editor,setEditor]=useState<Editor|null>(null),[moving,setMoving]=useState<string|null>(null);
 const [saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const active=useRef(true),sequence=useRef(0),pending=useRef<PunchMutation|null>(null),lock=useRef(false);
 const dirty=!!editor&&JSON.stringify(editor.values)!==JSON.stringify(toValues(editor.item))||moving!==null,busy=saving||uncertain;
 useProChildGuard(!onStateChange&&(dirty||busy),useCallback(()=>setError(c.leave),[c.leave]));
 useLayoutEffect(()=>{onStateChange?.({dirty,busy});},[dirty,busy,onStateChange]);
 useEffect(()=>()=>onStateChange?.({dirty:false,busy:false}),[onStateChange]);
 const load=useCallback(async()=>{const id=++sequence.current;setLoading(true);setLoadError(false);try{const response=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const body=punchlistSchema.parse(await response.json());if(body.workId!==workId)throw Error();if(active.current&&id===sequence.current)setData(body);}catch{if(active.current&&id===sequence.current)setLoadError(true);}finally{if(active.current&&id===sequence.current)setLoading(false);}},[accountId,workId]);
 const loadFiles=useCallback(async()=>{try{const response=await fetch('/api/pro/work-files?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const body=workFilesPageSchema.parse(await response.json());if(active.current)setFiles(body.items.filter(f=>f.ready&&f.mimeType==='image/jpeg'));}catch{if(active.current)setFiles([]);}},[accountId,workId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 async function send(next?:PunchMutation){
  if(lock.current)return;const input=next??pending.current;if(!input)return;lock.current=true;pending.current=input;setSaving(true);setError('');setNotice('');setConflict(false);
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(input)});
   if(response.status===409){pending.current=null;setUncertain(false);setConflict(true);setError(c.conflict);return;}
   if(response.status>=400&&response.status<500){pending.current=null;setUncertain(false);setError(c.failed);return;}
   if(!response.ok)throw Error();punchResultSchema.parse(await response.json());
   pending.current=null;setUncertain(false);setEditor(null);setMoving(null);setNotice(c.saved);await load();
  }catch{if(active.current){setUncertain(true);setError(c.uncertain);}}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }
 function open(item:PunchItem|null){if(busy||editor||moving!==null)return;setEditor({item,values:toValues(item)});setError('');setNotice('');if(files===null)void loadFiles();}
 function change<K extends keyof Values>(key:K,value:Values[K]){setEditor(old=>old?{...old,values:{...old.values,[key]:value}}:old);}
 function submit(event:FormEvent){event.preventDefault();if(!editor||busy)return;const v=editor.values,item=editor.item;const parsed=punchMutationSchema.safeParse(item?{action:'update',actionId:crypto.randomUUID(),workId,taskId:item.taskId,revision:item.revision,taskRevision:item.taskRevision,title:v.title,details:v.details,dueDate:v.dueDate||null,assignee:v.assignee,photoFileId:v.photoFileId||null,photoRequired:v.photoRequired}:{action:'create',actionId:crypto.randomUUID(),workId,taskId:crypto.randomUUID(),title:v.title,details:v.details,dueDate:v.dueDate||null,assignee:v.assignee,photoFileId:v.photoFileId||null,photoRequired:v.photoRequired});if(!parsed.success){setError(c.failed);return;}void send(parsed.data);}
 async function cancel(){if(busy)return;if(dirty&&editor){const answer=await confirm({title:c.discardTitle,description:c.discardBody,confirmLabel:c.discard,cancelLabel:c.keep});if(!answer.confirmed||!active.current)return;}setEditor(null);setMoving(null);setError('');}
 async function act(item:PunchItem,action:'complete'|'reopen'|'archive'){if(busy||editor)return;if(action==='archive'){const answer=await confirm({title:c.archiveTitle,description:c.archiveBody,confirmLabel:c.archive,cancelLabel:c.cancel});if(!answer.confirmed||!active.current)return;}void send({action,actionId:crypto.randomUUID(),workId,taskId:item.taskId,taskRevision:item.taskRevision});}

 if(loading&&!data)return <p role="status" className="text-sm text-[#52627a]">{c.loading}</p>;
 if(loadError&&!data)return <div role="alert" data-punchlist-error className="space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4"><p className="text-sm">{c.loadError}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{c.retry}</Button></div>;
 if(!data)return null;
 const today=crTodayISO(),items=data.items.filter(i=>filter==='all'||i.status===filter),percent=data.counts.total?Math.round(data.counts.done/data.counts.total*100):0;
 return <section data-work-punchlist className="min-w-0 space-y-4">
  <header className="space-y-2"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-bold text-[#162543]">{c.title}</h3><p data-punchlist-counter={`${data.counts.done}/${data.counts.total}`} className="text-sm font-semibold text-[#162543]">{c.counter(data.counts.done,data.counts.total)}</p></div>
   <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-[#e9eff5]"><span className="block h-full rounded-full bg-[#3aa776] transition-[width]" style={{width:percent+'%'}}/></span>
   <p className="text-sm text-[#52627a]">{c.intro}</p>
   <p data-punchlist-share className="flex flex-wrap items-center gap-2 text-sm"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${data.showPunchlist?'bg-[#eaf5fb] text-[#006e90]':'bg-[#eef2f6] text-[#52627a]'}`}>{data.showPunchlist?c.shared:c.notShared}</span><button type="button" disabled={dirty||busy} onClick={()=>pushProParams({vistaTrabajo:'client'})} className="min-h-11 font-semibold text-[#008bb5] underline-offset-2 hover:underline disabled:opacity-50">{c.configureShare}</button></p>
  </header>
  <div className="flex flex-wrap gap-2"><Button type="button" data-punchlist-create disabled={busy||!!editor||moving!==null} onClick={()=>open(null)}>{c.create}</Button><Button type="button" variant="secondary" data-punchlist-move-open disabled={busy||!!editor||moving!==null} onClick={()=>{setMoving(data.candidates[0]?.id??'');setError('');setNotice('');}}>{c.move}</Button></div>
  {notice&&<p role="status" className="text-sm text-[#175b42]">{notice}</p>}
  {error&&<div role="alert" className="space-y-2 rounded-xl border border-[#f1c9bd] bg-[#fff7f4] p-3 text-sm text-[#7a2e16]"><p>{error}</p>{uncertain&&<Button type="button" disabled={saving} onClick={()=>void send()}>{c.retrySame}</Button>}{conflict&&<Button type="button" variant="secondary" onClick={()=>{setConflict(false);setError('');setEditor(null);void load();}}>{c.reload}</Button>}</div>}
  {moving!==null&&<form data-punchlist-move onSubmit={event=>{event.preventDefault();if(moving)void send({action:'mark',actionId:crypto.randomUUID(),workId,taskId:moving});}} className="space-y-3 rounded-2xl border border-[#0089bb] bg-[#f7fbfd] p-4">
   {data.candidates.length?<label className="block text-sm font-semibold">{c.moveLabel}<select value={moving} disabled={busy} onChange={e=>setMoving(e.target.value)} className={field}>{data.candidates.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>:<p className="text-sm text-[#52627a]">{c.noCandidates}</p>}
   <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={()=>void cancel()}>{c.cancel}</Button>{!!data.candidates.length&&<Button type="submit" disabled={busy||!moving}>{saving?c.saving:c.moveButton}</Button>}</div>
  </form>}
  {editor&&<form data-punchlist-form aria-label={editor.item?c.formEdit:c.formNew} onSubmit={submit} className="space-y-4 rounded-2xl border border-[#0089bb] bg-[#f7fbfd] p-4">
   <h4 className="font-semibold">{editor.item?c.formEdit:c.formNew}</h4>
   <fieldset disabled={busy} className="min-w-0 space-y-4">
    <label className="block text-sm font-semibold">{c.item}<input data-punchlist-field="title" autoFocus required maxLength={160} value={editor.values.title} onChange={e=>change('title',e.target.value)} className={field}/></label>
    <div className="grid min-w-0 gap-4 sm:grid-cols-2"><label className="block min-w-0 text-sm font-semibold">{c.due}<input type="date" min="1900-01-01" max="2100-12-31" value={editor.values.dueDate} onChange={e=>change('dueDate',e.target.value)} className={field}/></label><label className="block min-w-0 text-sm font-semibold">{c.assignee}<input maxLength={160} value={editor.values.assignee} onChange={e=>change('assignee',e.target.value)} className={field}/><span className="mt-1 block text-xs font-normal text-[#52627a]">{c.assigneeHelp}</span></label></div>
    <label className="block text-sm font-semibold">{c.notes}<textarea maxLength={2000} value={editor.values.details} onChange={e=>change('details',e.target.value)} className={field}/></label>
    <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="block min-w-0 text-sm font-semibold">{c.photo}<select data-punchlist-field="photo" value={editor.values.photoFileId} onChange={e=>change('photoFileId',e.target.value)} className={field}><option value="">{c.noPhoto}</option>{editor.item?.photoFileId&&!files?.some(f=>f.id===editor.item!.photoFileId)&&<option value={editor.item.photoFileId}>{editor.item.photoName??c.photo}</option>}{files?.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select><span className="mt-1 block text-xs font-normal text-[#52627a]">{c.photoHelp}</span></label>
     {/* eslint-disable-next-line @next/next/no-img-element -- private job file preview, reauthorized by the work-files route */}
     {editor.values.photoFileId&&<img data-punchlist-photo-preview src={'/api/pro/work-files?'+new URLSearchParams({fileId:editor.values.photoFileId})} alt="" className="aspect-[4/3] w-32 rounded-xl border border-[#d7e1ea] object-cover"/>}</div>
    <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input data-punchlist-field="photoRequired" type="checkbox" checked={editor.values.photoRequired} onChange={e=>change('photoRequired',e.target.checked)} className="h-5 w-5 shrink-0 accent-[#0089bb]"/>{c.photoRequired}</label>
   </fieldset>
   <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={()=>void cancel()}>{c.cancel}</Button><Button type="submit" disabled={busy||!dirty||!editor.values.title.trim()}>{saving?c.saving:c.save}</Button></div>
  </form>}
  <div role="group" aria-label={c.filterLabel} className="grid grid-cols-3 gap-1 rounded-2xl bg-[#e9eff5] p-1.5">{(['all','open','done'] as const).map(value=><button key={value} type="button" data-punchlist-filter={value} aria-pressed={filter===value} onClick={()=>setFilter(value)} className={`min-h-11 rounded-xl px-2 text-sm font-semibold ${filter===value?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]'}`}>{c[value]}</button>)}</div>
  {!data.items.length?<p data-punchlist-empty className="rounded-2xl border border-dashed border-[#c9d6e2] bg-[#f7f9fc] p-4 text-sm text-[#52627a]">{c.empty}</p>:!items.length?<p className="rounded-xl border border-[#d7e1ea] p-4 text-sm text-[#52627a]">{c.emptyFilter}</p>:
  <ul className="space-y-3">{items.map(item=>{const overdue=item.status==='open'&&!!item.dueDate&&item.dueDate<today,blockedByPhoto=item.status==='open'&&item.photoRequired&&!item.photoFileId;return <li key={item.taskId} data-punch-item={item.taskId} data-punch-status={item.status} className="flex min-w-0 gap-3 rounded-2xl border border-[#d7e1ea] bg-white p-3">
   {/* eslint-disable-next-line @next/next/no-img-element -- private job photo, reauthorized per request */}
   {item.photoFileId?<img src={api+'?'+new URLSearchParams({image:item.taskId})} alt={c.photoAlt(item.title)} className="h-20 w-20 shrink-0 rounded-xl border border-[#d7e1ea] object-cover sm:h-24 sm:w-28"/>:null}
   <div className="min-w-0 flex-1 space-y-2">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><p className={`min-w-0 flex-1 break-words font-semibold ${item.status==='done'?'text-[#52627a] line-through decoration-[#9aa7b8]':'text-[#162543]'}`}>{item.title}</p><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${item.status==='done'?'bg-[#eef8f4] text-[#18573a]':overdue?'bg-[#fdf1e3] text-[#8a4b0b]':'bg-[#eaf5fb] text-[#006e90]'}`}>{item.status==='done'?c.statusDone:overdue?c.overdue:c.statusOpen}</span></div>
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[#52627a]">{item.dueDate&&<span>{fmt(item.dueDate,en)}</span>}{item.assignee&&<span className="break-words">{item.assignee}</span>}</p>
    {item.details&&<p className="whitespace-pre-wrap break-words text-sm text-[#52627a]">{item.details}</p>}
    {blockedByPhoto&&<p className="text-xs font-semibold text-[#8a4b0b]">{c.photoNeeded}</p>}
    <div className="flex flex-wrap items-center gap-2"><Button type="button" size="sm" className="min-h-11" data-punch-toggle disabled={busy||!!editor||blockedByPhoto} onClick={()=>void act(item,item.status==='open'?'complete':'reopen')}>{item.status==='open'?c.complete:c.reopen}</Button><Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={busy||!!editor} onClick={()=>open(item)}>{c.edit}</Button><Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={busy||!!editor} onClick={()=>void act(item,'archive')}>{c.archive}</Button></div>
   </div>
  </li>;})}</ul>}
  {dialogNode}
 </section>;
}

/** Customer side: renders nothing unless the owner shares the punch list for a confirmed/completed request. */
export function AppointmentPunchlist({requestId}:{requestId:string}){const {user,loading}=useAuth();if(loading||!user)return null;return <ClientPunchSession key={user.id+':'+requestId} accountId={user.id} requestId={requestId}/>;}
function ClientPunchSession({accountId,requestId}:{accountId:string;requestId:string}){
 const en=useLocale()==='en';
 const [view,setView]=useState<ClientPunchlist|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),active=useRef(true),sequence=useRef(0);
 const load=useCallback(async()=>{const id=++sequence.current;setLoading(true);setError(false);try{const response=await fetch(api+'?'+new URLSearchParams({requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(response.status===404){if(active.current&&id===sequence.current)setView({visible:false});return;}if(!response.ok)throw Error();const body=clientPunchlistSchema.parse(await response.json());if(active.current&&id===sequence.current)setView(body);}catch{if(active.current&&id===sequence.current)setError(true);}finally{if(active.current&&id===sequence.current)setLoading(false);}},[accountId,requestId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 const t=en?{title:'Punch list',error:'Could not load the punch list.',retry:'Retry',empty:'There are no closing items yet.',counter:(d:number,n:number)=>`${d} of ${n} completed`,done:'Completed',open:'Pending',photo:(x:string)=>`Photo of ${x}`}:{title:'Pendientes finales',error:'No se pudieron cargar los pendientes finales.',retry:'Reintentar',empty:'Todavía no hay detalles de cierre.',counter:(d:number,n:number)=>`${d} de ${n} completados`,done:'Completado',open:'Pendiente',photo:(x:string)=>`Foto de ${x}`};
 if(error)return <div role="alert" data-client-punchlist-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4"><p className="text-sm">{t.error}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{t.retry}</Button></div>;
 if(!view||!view.visible)return null;
 return <section data-client-punchlist aria-label={t.title} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-bold text-[#162543]">{t.title}</h3><p className="text-sm font-semibold">{t.counter(view.counts.done,view.counts.total)}</p></div>
  {!view.items.length?<p className="text-sm text-[#52627a]">{t.empty}</p>:<ul className="space-y-2">{view.items.map(item=><li key={item.id} data-client-punch-item={item.status} className="flex min-w-0 items-center gap-3 rounded-xl border border-[#e5e7eb] p-3 text-sm">
   {/* eslint-disable-next-line @next/next/no-img-element -- private job photo, reauthorized per request */}
   {item.hasPhoto&&<img src={api+'?'+new URLSearchParams({image:item.id,requestId})} alt={t.photo(item.title)} className="h-16 w-16 shrink-0 rounded-lg border border-[#d7e1ea] object-cover"/>}
   <div className="min-w-0 flex-1"><p className={`break-words font-semibold ${item.status==='done'?'text-[#52627a] line-through':'text-[#162543]'}`}>{item.title}</p>{item.dueDate&&<p className="text-[#52627a]">{fmt(item.dueDate,en)}</p>}</div>
   <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${item.status==='done'?'bg-[#eef8f4] text-[#18573a]':'bg-[#eaf5fb] text-[#006e90]'}`}>{item.status==='done'?t.done:t.open}</span>
  </li>)}</ul>}
 </section>;
}
