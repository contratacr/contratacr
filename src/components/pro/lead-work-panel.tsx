'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {AiDraftAssist} from './ai-assistant';
import {LeadQuickQuoteButton} from './lead-quick-quote';
import {navigatePro} from '@/lib/pro/navigation';
import {leadFileKindLabel,leadFileSizeLabel,leadFilesSchema,leadTasksSchema,type LeadFile,type LeadFilePurpose,type LeadTask} from '@/lib/pro/lead-work';

/**
 * Leads area: Quick Create tiles, tasks, files and photos, plans (takeoff uploads), estimate entry (from scratch, upload,
 * with AI) and the More actions menu (print, delete) of a lead. Private to the professional; nothing is sent out.
 * Writes carry a client id that is kept while a retry is pending, so a repeated tap never duplicates a row.
 */
const field='block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
const card='min-w-0 space-y-3 rounded-xl border border-[#d7e1ea] bg-white p-3';
const accept='.pdf,.jpg,.jpeg,.png,.webp,.heic,.docx,.xlsx,.pptx,.csv,.txt,.dwg,.dxf';
export function LeadWorkPanel({actor,kind,leadId,service,disabled=false,canDelete=false}:{actor:string;kind:'manual'|'request';leadId:string;service:string;disabled?:boolean;canDelete?:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,headers={'X-Pro-Expected-Actor':actor};
 const [tasks,setTasks]=useState<LeadTask[]|null>(null),[files,setFiles]=useState<LeadFile[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[title,setTitle]=useState(''),[due,setDue]=useState(''),[menu,setMenu]=useState(false),[aiNote,setAiNote]=useState(''),[tasksFilter,setTasksFilter]=useState<'all'|'open'|'done'>('all');
 const pendingTask=useRef<{key:string;id:string}|null>(null),pendingFile=useRef<Map<string,string>>(new Map()),mutex=useRef(false),root=useRef<HTMLElement|null>(null);
 const q=new URLSearchParams({kind,leadId}).toString();
 const loadAll=useCallback(async()=>{
  try{
   const [a,b]=await Promise.all([fetch('/api/pro/lead-work?'+q,{cache:'no-store',headers}),fetch('/api/pro/lead-files?'+q,{cache:'no-store',headers})]);
   if(!a.ok||!b.ok)throw Error();setTasks(leadTasksSchema.parse(await a.json()).items);setFiles(leadFilesSchema.parse(await b.json()).items);setError('');
  }catch{setError(t('No se pudieron cargar las tareas y los archivos de la solicitud.','Could not load the lead tasks and files.'));}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[actor,kind,leadId,en]);
 useEffect(()=>{const timer=setTimeout(()=>void loadAll(),0);return()=>clearTimeout(timer);},[loadAll]);
 async function taskCall(body:Record<string,unknown>,done?:()=>void){
  if(mutex.current||disabled)return;mutex.current=true;setBusy(true);setError('');
  try{
   const r=await fetch('/api/pro/lead-work',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({kind,leadId,...body})});
   if(r.status===409){await loadAll();setError(t('La tarea cambió. Se actualizó la lista; revise e intente de nuevo.','The task changed. The list was refreshed; review it and try again.'));return;}
   if(!r.ok)throw Error();setTasks(leadTasksSchema.parse(await r.json()).items);pendingTask.current=null;done?.();
  }catch{setError(t('No se pudo comprobar el guardado. Reintente: no se duplicará.','Could not confirm the save. Retry: it will not be duplicated.'));}
  finally{mutex.current=false;setBusy(false);}
 }
 function addTask(){
  const text=title.trim();if(!text)return;const key=text+'|'+due;if(pendingTask.current?.key!==key)pendingTask.current={key,id:crypto.randomUUID()};
  void taskCall({action:'add',id:pendingTask.current.id,title:text,dueDate:due||null},()=>{setTitle('');setDue('');});
 }
 async function upload(purpose:LeadFilePurpose,list:FileList|null){
  if(!list?.length||mutex.current||disabled)return;mutex.current=true;setBusy(true);setError('');
  try{
   for(const file of Array.from(list)){
    const key=purpose+':'+file.name+':'+file.size+':'+file.lastModified;let id=pendingFile.current.get(key);if(!id){id=crypto.randomUUID();pendingFile.current.set(key,id);}
    const form=new FormData();form.set('kind',kind);form.set('leadId',leadId);form.set('id',id);form.set('purpose',purpose);form.set('file',file);
    const r=await fetch('/api/pro/lead-files',{method:'POST',headers,body:form});
    if(!r.ok){const body=await r.json().catch(()=>({})) as {error?:string};setError(r.status===400||r.status===413?(body.error??t('No se pudo subir el archivo.','Could not upload the file.')):t('No se pudo comprobar el guardado. Reintente: no se duplicará.','Could not confirm the save. Retry: it will not be duplicated.'));return;}
    pendingFile.current.delete(key);setFiles(leadFilesSchema.parse(await r.json()).items);
   }
  }catch{setError(t('No se pudo comprobar el guardado. Reintente: no se duplicará.','Could not confirm the save. Retry: it will not be duplicated.'));}
  finally{mutex.current=false;setBusy(false);}
 }
 async function removeFile(id:string){
  if(mutex.current||disabled||!window.confirm(t('¿Eliminar este archivo? No se puede deshacer.','Delete this file? This cannot be undone.')))return;mutex.current=true;setBusy(true);setError('');
  try{const r=await fetch('/api/pro/lead-files',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'remove',kind,leadId,id})});if(!r.ok)throw Error();setFiles(leadFilesSchema.parse(await r.json()).items);}
  catch{setError(t('No se pudo eliminar el archivo. Reintente.','Could not delete the file. Retry.'));}
  finally{mutex.current=false;setBusy(false);}
 }
 async function deleteLead(){
  setMenu(false);if(mutex.current||disabled||!window.confirm(t('¿Eliminar esta oportunidad? Se borran sus notas, tareas y archivos. No se puede deshacer.','Delete this opportunity? Its notes, tasks and files are removed. This cannot be undone.')))return;
  mutex.current=true;setBusy(true);setError('');
  try{
   const r=await fetch('/api/pro/lead-delete',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({kind:'manual',leadId})});
   if(r.status===409){const body=await r.json().catch(()=>({})) as {error?:string};setError(body.error??t('No se puede eliminar. Puede archivarla.','It cannot be deleted. You can archive it.'));return;}
   if(!r.ok)throw Error();navigatePro('pro_leads',{});
  }catch{setError(t('No se pudo comprobar la eliminación. Reintente.','Could not confirm the deletion. Retry.'));}
  finally{mutex.current=false;setBusy(false);}
 }
 async function saveAiNote(){
  const text=aiNote.trim();if(!text||mutex.current)return;mutex.current=true;setBusy(true);
  try{const r=await fetch('/api/pro/lead-log',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'add',actionId:crypto.randomUUID(),id:crypto.randomUUID(),kind,leadId,entry:'note',outcome:null,body:t('Borrador de alcance (IA): ','Scope draft (AI): ')+text})});if(!r.ok)throw Error();setAiNote('');window.dispatchEvent(new Event('focus'));}
  catch{setError(t('No se pudo guardar la nota.','Could not save the note.'));}
  finally{mutex.current=false;setBusy(false);}
 }
 const jump=(section:string)=>{const el=root.current?.querySelector<HTMLElement>(`[data-lead-section="${section}"]`);el?.scrollIntoView({behavior:'smooth',block:'start'});el?.querySelector<HTMLElement>('input,button,textarea')?.focus({preventScroll:true});};
 const noteTarget=()=>document.querySelector<HTMLElement>('[data-lead-log] [data-lead-note-input]'),callTarget=()=>document.querySelector<HTMLElement>('[data-lead-log] [data-lead-call-outcome]');
 const focusOutside=(el:HTMLElement|null)=>{el?.scrollIntoView({behavior:'smooth',block:'center'});el?.focus({preventScroll:true});};
 const day=(v:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(v+'T00:00:00Z'));
 const when=(v:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(v));
 const visibleTasks=(tasks??[]).filter(x=>tasksFilter==='all'||(tasksFilter==='done')===x.done);
 const tileAction=(id:string)=>{if(id==='tasks')jump('tasks');else if(id==='estimate')jump('estimate');else if(id==='note')focusOutside(noteTarget());else if(id==='call')focusOutside(callTarget());else jump('plans');};
 const tiles:[string,string][]=[['tasks',t('Tareas','Tasks')],['estimate',t('Cotización','Estimate')],['note',t('Nota','Note')],['call',t('Registro de llamada','Call log')],['takeoff',t('Planos y mediciones','Plans and takeoff')]];
 const byPurpose=(p:LeadFilePurpose)=>(files??[]).filter(f=>f.purpose===p);
 const fileRow=(f:LeadFile)=><li key={f.id} data-lead-file={f.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d7e1ea] p-3 text-sm"><div className="min-w-0"><a data-lead-file-download href={'/api/pro/lead-files?fileId='+f.id} className="break-words font-semibold text-[#006f90] underline">{f.name}</a><p className="text-xs text-[#52627a]">{leadFileKindLabel(f.mimeType)} · {leadFileSizeLabel(f.sizeBytes)} · {when(f.createdAt)}</p></div><Button type="button" variant="outline" disabled={busy||disabled} onClick={()=>void removeFile(f.id)}>{t('Eliminar','Delete')}</Button></li>;
 const uploader=(purpose:LeadFilePurpose,label:string)=><label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-[#008bb5] bg-white px-4 text-sm font-semibold text-[#006f90]"><span>{label}</span><input data-lead-upload={purpose} type="file" multiple={purpose!=='estimate'} accept={accept} disabled={busy||disabled} className="sr-only" onChange={e=>{void upload(purpose,e.target.files);e.target.value='';}}/></label>;
 return <section ref={root} data-lead-work className={card}>
  <style>{'@media print{body *{visibility:hidden}[data-pro-leads],[data-pro-leads] *{visibility:visible}[data-pro-leads]{position:absolute;left:0;top:0;width:100%}[data-lead-noprint]{display:none!important}}'}</style>
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h3 className="font-semibold">{t('Trabajo de la solicitud','Lead work')}</h3>
   <div data-lead-noprint className="relative">
    <Button type="button" variant="outline" data-lead-more aria-expanded={menu} aria-haspopup="menu" onClick={()=>setMenu(v=>!v)}>{t('Más acciones','More actions')}</Button>
    {menu&&<ul role="menu" className="absolute right-0 z-20 mt-1 min-w-44 rounded-xl border border-[#d7e1ea] bg-white p-1 shadow-lg">
     <li role="none"><button role="menuitem" type="button" data-lead-print className="min-h-11 w-full rounded-lg px-3 text-left text-sm hover:bg-[#e8f6fb]" onClick={()=>{setMenu(false);setTimeout(()=>window.print(),0);}}>{t('Imprimir','Print')}</button></li>
     {canDelete&&<li role="none"><button role="menuitem" type="button" data-lead-delete disabled={busy||disabled} className="min-h-11 w-full rounded-lg px-3 text-left text-sm text-[#b42318] hover:bg-[#fef3f2]" onClick={()=>void deleteLead()}>{t('Eliminar','Delete')}</button></li>}
    </ul>}
   </div>
  </div>
  {error&&<p role="alert" className="text-sm text-[#b42318]">{error}</p>}
  <div data-lead-noprint data-lead-quick-create className="space-y-2"><p className="text-sm font-semibold">{t('Creación rápida','Quick Create')}</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{tiles.map(([id,label])=><button key={id} type="button" data-lead-tile={id} onClick={()=>tileAction(id)} className="min-h-14 rounded-xl border border-[#d7e1ea] bg-[#f6fafc] px-3 text-sm font-semibold hover:border-[#008bb5]">{label}</button>)}</div></div>
  <div data-lead-section="tasks" className="space-y-2" data-lead-tasks>
   <p className="text-sm font-semibold">{t('Tareas','Tasks')}</p>
   <div className="flex flex-wrap gap-2"><label className="min-w-0 flex-1 text-sm font-semibold">{t('Nueva tarea','New task')}<input data-lead-task-input value={title} maxLength={160} disabled={busy||disabled} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTask();}}} className={field+' mt-1'}/></label><label className="text-sm font-semibold">{t('Vence','Due')}<input data-lead-task-due type="date" value={due} disabled={busy||disabled} onChange={e=>setDue(e.target.value)} className={field+' mt-1'}/></label><Button type="button" disabled={busy||disabled||!title.trim()} onClick={addTask} className="self-end">{t('Agregar tarea','Add task')}</Button></div>
   <div role="group" aria-label={t('Filtrar tareas','Filter tasks')} className="flex flex-wrap gap-2">{([['all',t('Todas','All')],['open',t('Pendientes','Open')],['done',t('Hechas','Done')]] as ['all'|'open'|'done',string][]).map(([v,l])=><button key={v} type="button" aria-pressed={tasksFilter===v} onClick={()=>setTasksFilter(v)} className={'min-h-9 rounded-full border px-3 text-sm '+(tasksFilter===v?'border-[#008bb5] bg-[#e8f6fb] font-semibold':'border-[#d7e1ea]')}>{l}</button>)}</div>
   {tasks&&visibleTasks.length===0&&<p className="text-sm text-[#52627a]">{t('Todavía no hay tareas.','No tasks yet.')}</p>}
   <ul className="space-y-2">{visibleTasks.map(x=><li key={x.id} data-lead-task={x.id} data-done={x.done} className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-[#d7e1ea] p-3 text-sm"><input type="checkbox" data-lead-task-done aria-label={t('Marcar como hecha: ','Mark as done: ')+x.title} checked={x.done} disabled={busy||disabled} onChange={e=>void taskCall({action:'set_done',id:x.id,done:e.target.checked,revision:x.revision})} className="h-5 w-5"/><span className={'min-w-0 flex-1 break-words '+(x.done?'text-[#52627a] line-through':'')}>{x.title}</span>{x.dueDate&&<span className="text-xs text-[#52627a]">{t('Vence ','Due ')}{day(x.dueDate)}</span>}<Button type="button" variant="outline" data-lead-task-remove disabled={busy||disabled} onClick={()=>void taskCall({action:'remove',id:x.id,revision:x.revision})}>{t('Eliminar','Delete')}</Button></li>)}</ul>
  </div>
  <div data-lead-section="estimate" data-lead-estimate className="space-y-2">
   <p className="text-sm font-semibold">{t('Cotización','Estimate')}</p>
   <div className="flex flex-wrap items-start gap-2">{kind==='manual'&&<LeadQuickQuoteButton actor={actor} kind={kind} id={leadId} service={service} size="md" disabled={disabled||busy}/>}{uploader('estimate',t('Subir cotización','Upload estimate'))}<AiDraftAssist feature="quote_scope" label={t('✦ Crear con IA','✦ Create with AI')} disabled={disabled||busy} getInput={()=>({title:service,notes:''})} onUse={setAiNote}/></div>
   {aiNote&&<div data-lead-ai-draft className="space-y-2"><textarea aria-label={t('Borrador de alcance','Scope draft')} value={aiNote} maxLength={1800} rows={4} onChange={e=>setAiNote(e.target.value)} className={field}/><Button type="button" onClick={()=>void saveAiNote()} disabled={busy||disabled}>{t('Guardar como nota','Save as note')}</Button></div>}
   <ul className="space-y-2">{byPurpose('estimate').map(fileRow)}</ul>
  </div>
  <div data-lead-section="files" data-lead-files className="space-y-2">
   <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{t('Archivos y fotos','Files and photos')}</p>{uploader('file',t('Subir archivos','Upload files'))}</div>
   <p className="text-xs text-[#52627a]">{t('Fotos, PDF, Office y planos de hasta 20 MB. Es privado: no se envía nada a la persona cliente.','Photos, PDF, Office and plan files up to 20 MB. This is private: nothing is sent to the customer.')}</p>
   {files&&byPurpose('file').length===0&&<p className="text-sm text-[#52627a]">{t('Agregue sus primeros archivos: planos, fotos del sitio y documentos.','Add your first files: plans, site photos and documents.')}</p>}
   <ul className="space-y-2">{byPurpose('file').map(fileRow)}</ul>
  </div>
  <div data-lead-section="plans" data-lead-plans className="space-y-2">
   <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{t('Planos y mediciones','Plans and takeoff')}</p>{uploader('plan',t('Subir planos','Upload plans'))}</div>
   {files&&byPurpose('plan').length===0&&<p className="text-sm text-[#52627a]">{t('Todavía no hay planos. Suba un PDF, una imagen o un DWG para medir y cotizar.','No plans yet. Upload a PDF, image or DWG to measure and quote.')}</p>}
   {byPurpose('plan').length>0&&<div className="overflow-x-auto"><table className="w-full min-w-[28rem] text-left text-sm"><thead><tr className="text-xs text-[#52627a]"><th className="py-1 pr-2">{t('Título','Title')}</th><th className="py-1 pr-2">{t('Subido','Uploaded')}</th><th className="py-1 pr-2">{t('Tipo','File type')}</th><th className="py-1 pr-2">{t('Tamaño','File size')}</th><th className="py-1 pr-2">{t('Adjunto a','Attached to')}</th><th/></tr></thead><tbody>{byPurpose('plan').map(f=><tr key={f.id} data-lead-plan={f.id} className="border-t border-[#d7e1ea]"><td className="py-2 pr-2"><a href={'/api/pro/lead-files?fileId='+f.id} className="break-words font-semibold text-[#006f90] underline">{f.name}</a></td><td className="py-2 pr-2">{when(f.createdAt)}</td><td className="py-2 pr-2">{leadFileKindLabel(f.mimeType)}</td><td className="py-2 pr-2">{leadFileSizeLabel(f.sizeBytes)}</td><td className="py-2 pr-2">{t('Esta solicitud','This lead')}</td><td><Button type="button" variant="outline" disabled={busy||disabled} onClick={()=>void removeFile(f.id)}>{t('Eliminar','Delete')}</Button></td></tr>)}</tbody></table></div>}
  </div>
 </section>;
}
