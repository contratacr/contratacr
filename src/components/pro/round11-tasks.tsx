'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {teamTaskFileManageResultSchema,teamTaskFilesPageSchema,type TeamTaskFile} from '@/lib/pro/team-task-discussion';

/**
 * Round 11 (row 16): manage a task attachment — change the name shown, send it to the task trash and
 * restore it. Allowed to the person who uploaded it and to the account owner, with a contributor grant
 * (checked again in SQL). The stored file, its download name, size and digest never change. Each change
 * has its own actionId (a retry never applies twice) and the file revision (another tab → 409).
 */
type Ctx={ownerId:string;workId:string;grantId:string;taskId:string};
const api='/api/pro/team-task-discussion';
async function manage(actor:string,body:object){
 const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify(body)});
 if(!response.ok)throw Object.assign(Error('manage'),{status:response.status});
 return teamTaskFileManageResultSchema.parse(await response.json());
}
function failure(status:number|undefined,en:boolean){return status===409?(en?'This file changed in another tab. Reload the list.':'El archivo cambió en otra pestaña. Recargue la lista.'):status===403?(en?'Only the person who uploaded it or the owner can change it.':'Solo quien lo subió o el dueño puede cambiarlo.'):(en?'Could not save. Retry: it will not be applied twice.':'No se pudo guardar. Reintente: no se aplicará dos veces.');}
export function TaskFileTools({file,context,accountId,canWrite,disabled,onChanged}:{file:TeamTaskFile;context:Ctx;accountId:string;canWrite:boolean;disabled:boolean;onChanged:()=>void}){
 const en=useLocale()==='en',[editing,setEditing]=useState(false),[name,setName]=useState(file.displayName??file.name),[busy,setBusy]=useState(false),[error,setError]=useState(''),pending=useRef<{key:string;id:string}|null>(null);
 if(!canWrite||!(file.actorId===accountId||context.ownerId===accountId))return null;
 const actionId=(key:string)=>{if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};return pending.current.id;};
 async function send(body:Record<string,unknown>){
  if(busy)return;setBusy(true);setError('');
  const key=JSON.stringify(body);
  try{await manage(accountId,{...body,actionId:actionId(key),grantId:context.grantId,taskId:context.taskId,fileId:file.id,revision:file.metaRevision??0});pending.current=null;setEditing(false);onChanged();}
  catch(e){setError(failure((e as {status?:number}).status,en));if((e as {status?:number}).status===409)pending.current=null;}
  finally{setBusy(false);}
 }
 function rename(event:FormEvent){event.preventDefault();const value=name.trim();if(!value||value.length>160){setError(en?'Write a name of up to 160 characters.':'Escriba un nombre de hasta 160 caracteres.');return;}void send({action:'file_rename',name:value});}
 return <div data-task-file-tools={file.id} className="space-y-2">
  {editing?<form onSubmit={rename} className="flex flex-col gap-2 sm:flex-row sm:items-end">
   <label className="block min-w-0 flex-1 text-sm font-semibold">{en?'Name shown':'Nombre visible'}<input data-task-file-name className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal" maxLength={160} value={name} disabled={busy} onChange={event=>setName(event.target.value)}/></label>
   <div className="flex gap-2"><Button type="submit" className="min-h-11" disabled={busy||disabled}>{en?'Save name':'Guardar nombre'}</Button><Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={()=>{setEditing(false);setName(file.displayName??file.name);setError('');}}>{en?'Cancel':'Cancelar'}</Button></div>
  </form>:<div className="flex flex-wrap gap-2">
   <Button type="button" variant="outline" className="min-h-11" disabled={busy||disabled} onClick={()=>setEditing(true)}>{en?'Rename':'Cambiar nombre'}</Button>
   <Button type="button" variant="outline" className="min-h-11" data-task-file-trash={file.id} disabled={busy||disabled} onClick={()=>void send({action:'file_trash'})}>{en?'Move to trash':'Enviar a la papelera'}</Button>
  </div>}
  {error&&<p role="alert" className="text-sm text-[#8a2a1b]">{error}</p>}
 </div>;
}
/** Trash of the task: trashed files (kept, not deleted) with «Restore». */
export function TaskFileTrash({context,accountId,canWrite,refreshKey,onChanged}:{context:Ctx;accountId:string;canWrite:boolean;refreshKey:number;onChanged:()=>void}){
 const en=useLocale()==='en',[open,setOpen]=useState(false),[items,setItems]=useState<TeamTaskFile[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),sequence=useRef(0),pending=useRef<{file:string;id:string}|null>(null);
 const load=useCallback(async()=>{const n=++sequence.current;try{const response=await fetch(api+'?'+new URLSearchParams({grantId:context.grantId,taskId:context.taskId,kind:'trash'}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const page=teamTaskFilesPageSchema.parse(await response.json());if(n===sequence.current){setItems(page.items);setError('');}}catch{if(n===sequence.current)setError(en?'Could not load the trash.':'No se pudo cargar la papelera.');}},[accountId,context,en]);
 useEffect(()=>{if(!open)return;const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[open,load,refreshKey]);
 async function restore(file:TeamTaskFile){
  if(busy)return;setBusy(true);setError('');
  if(pending.current?.file!==file.id)pending.current={file:file.id,id:crypto.randomUUID()};
  try{await manage(accountId,{action:'file_restore',actionId:pending.current.id,grantId:context.grantId,taskId:context.taskId,fileId:file.id,revision:file.metaRevision??0});pending.current=null;await load();onChanged();}
  catch(e){setError(failure((e as {status?:number}).status,en));if((e as {status?:number}).status===409){pending.current=null;void load();}}
  finally{setBusy(false);}
 }
 return <section data-task-file-trash-list className="space-y-2">
  <Button type="button" variant="outline" className="min-h-11" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?(en?'Hide task trash':'Ocultar papelera de la tarea'):(en?'Task trash':'Papelera de la tarea')}</Button>
  {open&&<div className="space-y-2">
   {error&&<p role="alert" className="text-sm text-[#8a2a1b]">{error}</p>}
   {items===null&&!error?<p role="status" className="text-sm text-slate-600">{en?'Loading…':'Cargando…'}</p>:items?.length===0?<p className="text-sm text-slate-600">{en?'The task trash is empty.':'La papelera de la tarea está vacía.'}</p>:
    <ul className="space-y-2">{items?.map(file=><li key={file.id} data-task-trashed-file={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d7e1ea] bg-white p-3"><span className="min-w-0 break-all text-sm font-semibold">{file.displayName??file.name}<span className="block text-xs font-normal text-slate-600">{file.actorName}</span></span>
     {canWrite&&(file.actorId===accountId||context.ownerId===accountId)&&<Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={()=>void restore(file)}>{en?'Restore':'Restaurar'}</Button>}</li>)}</ul>}
   <p className="text-xs text-slate-600">{en?'Files in the trash are kept; they are only hidden from the task list.':'Los archivos de la papelera se conservan; solo se ocultan de la lista de la tarea.'}</p>
  </div>}
 </section>;
}
