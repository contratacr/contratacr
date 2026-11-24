'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {taskDetailSchema,type TaskDetail} from '@/lib/pro/task-center-detail';

/** Row 16: comments with explicit mentions and links to existing job files, from the global task center. */
const control='block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base';
const size=(bytes:number)=>bytes>=1048576?(bytes/1048576).toFixed(1)+' MB':Math.max(1,Math.round(bytes/1024))+' KB';
export function TaskDetailButton({onOpen,title}:{onOpen:()=>void;title:string}){
 const en=useLocale()==='en';
 return <Button type="button" variant="secondary" data-task-detail-open aria-label={(en?'Comments and files: ':'Comentarios y archivos: ')+title} onClick={onOpen}>{en?'Comments and files':'Comentarios y archivos'}</Button>;
}
export function TaskDetailPanel({accountId,workId,taskId,title,onClose}:{accountId:string;workId:string;taskId:string;title:string;onClose:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [editing,setEditing]=useState<{id:string;text:string}|null>(null);
 const [detail,setDetail]=useState<TaskDetail|null>(null),[failed,setFailed]=useState(false),[text,setText]=useState(''),[mentions,setMentions]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const headers={'Content-Type':'application/json','X-Pro-Expected-Actor':accountId};
 const load=useCallback(async()=>{setFailed(false);try{const r=await fetch('/api/pro/task-center-detail?'+new URLSearchParams({workId,taskId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();setDetail(taskDetailSchema.parse(await r.json()));}catch{setFailed(true);}},[accountId,workId,taskId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function post(body:object){
  setBusy(true);setError('');
  try{const r=await fetch('/api/pro/task-center-detail',{method:'POST',headers,body:JSON.stringify({...body,workId,taskId})});if(!r.ok)throw Error();await load();return true;}
  catch{setError(t('No se pudo guardar. Reintente: no se duplicará.','Could not save. Retry: it will not duplicate.'));return false;}
  finally{setBusy(false);}
 }
 async function send(){if(busy||!text.trim())return;if(await post({kind:'comment',actionId:crypto.randomUUID(),text:text.trim(),mentions})){setText('');setMentions([]);}}
 async function saveEdit(){if(!editing||busy||!editing.text.trim())return;if(await post({kind:'comment-change',action:'edit',actionId:crypto.randomUUID(),commentId:editing.id,text:editing.text.trim()}))setEditing(null);}
 async function remove(id:string){if(busy||!window.confirm(t('¿Eliminar este comentario? El texto anterior queda en el historial interno.','Delete this comment? The previous text stays in the internal history.')))return;await post({kind:'comment-change',action:'delete',actionId:crypto.randomUUID(),commentId:id});}
 const toggle=(id:string)=>setMentions(old=>old.includes(id)?old.filter(x=>x!==id):old.length>=5?old:[...old,id]);
 const date=(v:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(v));
 return <section data-task-detail className="min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] bg-[#f7f9fc] p-4" aria-label={t('Comentarios y archivos de la tarea','Task comments and files')}>
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="min-w-0 break-words text-lg font-bold">{title}</h3><Button type="button" variant="secondary" onClick={onClose}>{t('Cerrar','Close')}</Button></div>
  {failed?<p role="alert" className="text-sm">{t('No se pudo cargar. ','Could not load. ')}<Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></p>:!detail?<p role="status">{t('Cargando…','Loading…')}</p>:<>
   <div className="space-y-2"><h4 className="font-semibold">{t('Comentarios','Comments')}</h4>
    <label className="block text-sm font-semibold">{t('Nuevo comentario','New comment')}<textarea data-task-detail-text maxLength={1000} rows={3} value={text} onChange={e=>setText(e.target.value)} className={control+' mt-1'}/></label>
    <fieldset className="min-w-0"><legend className="text-sm font-semibold">{t('Mencionar (hasta 5, recibirán un aviso en la app)','Mention (up to 5, they get an in-app notice)')}</legend>
     <div className="flex flex-wrap gap-2">{detail.people.map(p=><label key={p.personId} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#d7e1ea] bg-white px-3 text-sm"><input data-task-detail-mention type="checkbox" className="h-5 w-5" checked={mentions.includes(p.personId)} onChange={()=>toggle(p.personId)}/>{p.name}</label>)}</div></fieldset>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <Button type="button" data-task-detail-send disabled={busy||!text.trim()} onClick={()=>void send()}>{t('Comentar','Comment')}</Button>
    {detail.comments.length===0?<p className="text-sm text-[#52627a]">{t('Aún no hay comentarios.','No comments yet.')}</p>:<ul className="space-y-2">{detail.comments.map(c=><li key={c.id} data-task-detail-comment={c.deleted?'deleted':''} className="min-w-0 break-words rounded-xl border border-[#d7e1ea] bg-white p-3 text-sm"><p className="font-semibold">{c.authorName} <span className="font-normal text-[#52627a]">· {date(c.at)}{c.edited&&!c.deleted?' · '+t('editado','edited'):''}</span></p>{c.deleted?<p className="italic text-[#52627a]">{t('Comentario eliminado.','Comment deleted.')}</p>:editing?.id===c.id?<div className="space-y-2"><textarea data-task-detail-edit-text maxLength={1000} rows={3} value={editing.text} onChange={e=>setEditing({id:c.id,text:e.target.value})} className={control} aria-label={t('Editar comentario','Edit comment')}/><div className="flex flex-wrap gap-2"><Button type="button" data-task-detail-edit-save disabled={busy||!editing.text.trim()} onClick={()=>void saveEdit()}>{t('Guardar','Save')}</Button><Button type="button" variant="secondary" onClick={()=>setEditing(null)}>{t('Cancelar','Cancel')}</Button></div></div>:<><p className="whitespace-pre-wrap">{c.body}</p>{c.mentions.length>0&&<p className="text-xs text-[#52627a]">{t('Mencionó a ','Mentioned ')}{c.mentions.map(m=>m.name).join(', ')}</p>}{c.canManage&&<div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="secondary" data-task-detail-edit disabled={busy} onClick={()=>setEditing({id:c.id,text:c.body})}>{t('Editar','Edit')}</Button><Button type="button" variant="secondary" data-task-detail-delete disabled={busy} onClick={()=>void remove(c.id)}>{t('Eliminar','Delete')}</Button></div>}</>}</li>)}</ul>}
   </div>
   <div className="space-y-2"><h4 className="font-semibold">{t('Archivos del trabajo vinculados','Linked job files')}</h4>
    {detail.files.length===0?<p className="text-sm text-[#52627a]">{t('Ningún archivo vinculado.','No linked files.')}</p>:<ul className="space-y-2">{detail.files.map(f=><li key={f.fileId} data-task-detail-file className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d7e1ea] bg-white p-3 text-sm"><span className="min-w-0 break-words font-semibold">{f.name} <span className="font-normal text-[#52627a]">· {size(f.sizeBytes)} · {f.linkedByName}</span></span><Button type="button" variant="secondary" disabled={busy} onClick={()=>void post({kind:'file',action:'unlink',actionId:crypto.randomUUID(),fileId:f.fileId})}>{t('Quitar vínculo','Unlink')}</Button></li>)}</ul>}
    <h4 className="pt-2 font-semibold">{t('Vincular un archivo del trabajo','Link a job file')}</h4>
    {detail.available.length===0?<p className="text-sm text-[#52627a]">{t('No hay más archivos listos en este trabajo.','No more ready files in this job.')}</p>:<ul className="space-y-2">{detail.available.map(f=><li key={f.fileId} data-task-detail-available className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d7e1ea] bg-white p-3 text-sm"><span className="min-w-0 break-words">{f.name} <span className="text-[#52627a]">· {size(f.sizeBytes)}</span></span><Button type="button" disabled={busy||detail.files.length>=20} onClick={()=>void post({kind:'file',action:'link',actionId:crypto.randomUUID(),fileId:f.fileId})}>{t('Vincular','Link')}</Button></li>)}</ul>}
    <p className="text-xs text-[#52627a]">{t('El archivo no se copia: sigue siendo el archivo del trabajo.','The file is not copied: it remains the job file.')}</p>
   </div>
  </>}
 </section>;
}
