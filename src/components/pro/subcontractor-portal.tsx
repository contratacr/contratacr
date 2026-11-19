'use client';
import {SubCommentAttach,SubCommentFileLink,useSubCommentFiles} from './sub-comment-files';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {ContrataCRLogo} from '@/components/landing/landing-navbar';
import {Button} from '@/components/ui/button';

/**
 * Round 8: «Mis obras como subcontratista». The account sees only the jobs it was linked to:
 * service, customer's name, dates, its assigned tasks (comment, mark done / reopen), key dates and
 * the files shared with it. Accepting an invitation code requires the invited, verified e-mail.
 */
type Comment={id:string;side:'pro'|'sub';authorName:string;body:string;createdAt:string};
type Task={id:string;title:string;details:string|null;status:'open'|'done';dueDate:string|null;revision:number;plannedStart:string|null;plannedEnd:string|null;comments:Comment[]};
type Job={ownerId:string;accessId:string;workId:string;company:string;service:string;customerName:string;start:string|null;end:string|null;cancelled:boolean;tasks:Task[];keyDates:{id:string;title:string;date:string}[];files:{id:string;name:string;mimeType:string;sizeBytes:number}[]};
export function SubcontractorPortal(){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]);
 const [jobs,setJobs]=useState<Job[]|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[code,setCode]=useState('');
 const pending=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/sub-portal',{cache:'no-store'});if(!r.ok)throw Error();setJobs((await r.json()).jobs);setFailed(false);}catch{setFailed(true);}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function send(body:Record<string,unknown>,done?:string){
  const key=JSON.stringify(body);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/pro/sub-portal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,actionId:pending.current.id})});const data=await r.json().catch(()=>({}));
   if(!r.ok){if(r.status===409){pending.current=null;await load();}throw Error(typeof data?.error==='string'?data.error:t('No se pudo comprobar el cambio. Reintente: no se duplicará.','Could not confirm the change. Retry: it will not be duplicated.'));}
   pending.current=null;if(done)setNotice(done);await load();return true;}catch(failure){setError((failure as Error).message);return false;}finally{setBusy(false);}
 }
 const day=(value:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:value.length===10?'UTC':'America/Costa_Rica'}).format(new Date(value.length===10?value+'T00:00:00Z':value));
 return <main data-subcontractor-portal className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6">
  <div className="flex items-center gap-3"><ContrataCRLogo/></div>
  <div><h1 className="text-2xl font-bold">{t('Mis obras como subcontratista','My subcontractor jobs')}</h1>
   <p className="text-sm text-[#52627a]">{t('Aquí ve solo las tareas que le asignaron, los archivos compartidos con usted y el cronograma de esos trabajos.','Here you only see the tasks assigned to you, the files shared with you and the schedule of those jobs.')}</p></div>
  <form data-subcontractor-accept className="flex flex-wrap items-end gap-2 rounded-2xl border border-[#d7e1ea] bg-white p-4" onSubmit={async event=>{event.preventDefault();if(await send({action:'accept',code:code.trim()},t('Invitación aceptada.','Invitation accepted.')))setCode('');}}>
   <label className="min-w-0 flex-1 text-sm font-semibold">{t('Código de invitación','Invitation code')}<input aria-label={t('Código de invitación','Invitation code')} autoComplete="one-time-code" maxLength={64} value={code} disabled={busy} onChange={e=>setCode(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] px-3 font-mono uppercase tracking-widest"/></label>
   <Button type="submit" disabled={busy||code.trim().length<8}>{t('Aceptar invitación','Accept invitation')}</Button></form>
  {notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {!jobs?(failed?<div role="alert" className="space-y-2"><p>{t('No se pudieron cargar sus trabajos.','Could not load your jobs.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>:<p role="status">{t('Cargando…','Loading…')}</p>)
   :jobs.length===0?<p className="rounded-2xl bg-[#f3f8fb] p-4 text-sm text-[#52627a]">{t('Todavía no tiene trabajos. Pida el código a la empresa que lo invitó.','You have no jobs yet. Ask the company that invited you for the code.')}</p>
   :<ul className="space-y-4">{jobs.map(job=><li key={job.accessId+job.workId} data-subcontractor-job={job.workId} className="space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4">
    <div><p className="text-sm text-[#52627a]">{job.company}</p><h2 className="break-words text-lg font-bold">{job.service}</h2>
     <p className="text-sm text-[#52627a]">{t('Cliente: ','Customer: ')}{job.customerName||'—'} · {job.start||job.end?`${job.start?day(job.start):'—'} – ${job.end?day(job.end):'—'}`:t('Sin fechas','No dates')}{job.cancelled?' · '+t('Cancelado','Cancelled'):''}</p></div>
    <section aria-label={t('Cronograma','Schedule')} className="space-y-1"><h3 className="font-semibold">{t('Cronograma','Schedule')}</h3>
     {job.tasks.length+job.keyDates.length===0?<p className="text-sm text-[#52627a]">{t('Sin fechas planificadas.','No planned dates.')}</p>:<ul className="space-y-1 text-sm">
      {job.tasks.filter(x=>x.plannedStart).map(x=><li key={'p'+x.id}>{x.title}: {day(x.plannedStart!)} – {x.plannedEnd?day(x.plannedEnd):''}</li>)}
      {job.keyDates.map(k=><li key={k.id}>{t('Fecha clave','Key date')} · {k.title}: {day(k.date)}</li>)}</ul>}</section>
    <section aria-label={t('Sus tareas','Your tasks')} className="space-y-2"><h3 className="font-semibold">{t('Sus tareas','Your tasks')}</h3>
     {job.tasks.length===0?<p className="text-sm text-[#52627a]">{t('No tiene tareas asignadas en este trabajo.','You have no tasks on this job.')}</p>:job.tasks.map(task=><TaskCard key={task.id} task={task} en={en} busy={busy}
      onToggle={()=>send({action:task.status==='open'?'complete':'reopen',ownerId:job.ownerId,accessId:job.accessId,taskId:task.id,revision:task.revision},task.status==='open'?t('Tarea marcada como hecha.','Task marked done.'):t('Tarea reabierta.','Task reopened.'))}
      onComment={body=>send({action:'comment',ownerId:job.ownerId,accessId:job.accessId,taskId:task.id,body})} ownerId={job.ownerId} accessId={job.accessId} onReload={()=>void load()} day={day}/>)}</section>
    <section aria-label={t('Archivos compartidos','Shared files')} className="space-y-1"><h3 className="font-semibold">{t('Archivos compartidos','Shared files')}</h3>
     {job.files.length===0?<p className="text-sm text-[#52627a]">{t('No hay archivos compartidos.','No shared files.')}</p>:<ul className="space-y-1">{job.files.map(f=><li key={f.id}><a className="inline-flex min-h-11 items-center break-all font-semibold text-[#00739a] underline" href={'/api/pro/sub-portal?'+new URLSearchParams({ownerId:job.ownerId,fileId:f.id})} download={f.name}>{f.name}</a></li>)}</ul>}</section>
   </li>)}</ul>}
 </main>;
}
function TaskCard({task,en,busy,onToggle,onComment,day,ownerId,accessId,onReload}:{task:Task;en:boolean;busy:boolean;onToggle:()=>Promise<boolean>;onComment:(body:string)=>Promise<boolean>;day:(v:string)=>string;ownerId:string;accessId:string;onReload:()=>void}){
 const [draft,setDraft]=useState('');const t=(es:string,english:string)=>en?english:es;
 // Round 9: attachments (subcontractor side; scope re-checked in SQL on every call).
 const endpoint='/api/pro/sub-portal/files',attachments=useSubCommentFiles({endpoint,ownerId,accessId});
 return <div data-subcontractor-task={task.id} data-status={task.status} className="space-y-2 rounded-xl border border-[#e5e7eb] p-3">
  <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className={'break-words font-semibold '+(task.status==='done'?'line-through text-[#52627a]':'')}>{task.title}</p>{task.details&&<p className="whitespace-pre-wrap break-words text-sm text-[#52627a]">{task.details}</p>}{task.dueDate&&<p className="text-xs text-[#52627a]">{t('Vence: ','Due: ')}{day(task.dueDate)}</p>}</div>
   <Button type="button" variant={task.status==='open'?'default':'secondary'} disabled={busy} onClick={()=>void onToggle()}>{task.status==='open'?t('Marcar como hecha','Mark done'):t('Reabrir','Reopen')}</Button></div>
  {task.comments.length>0&&<ul className="space-y-1 rounded-lg bg-[#f7f9fc] p-2 text-sm">{task.comments.map(c=><li key={c.id}><span className="font-semibold">{c.side==='sub'?t('Usted','You'):c.authorName}</span>: <span className="break-words">{c.body}</span>{attachments.files[c.id]&&<SubCommentFileLink file={attachments.files[c.id]} endpoint={endpoint} ownerId={ownerId} en={en}/>}</li>)}</ul>}
  <form className="flex flex-wrap gap-2" onSubmit={async event=>{event.preventDefault();if(draft.trim()&&await onComment(draft.trim()))setDraft('');}}><input aria-label={t(`Comentario sobre ${task.title}`,`Comment on ${task.title}`)} maxLength={1000} value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)} placeholder={t('Escriba un comentario','Write a comment')} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#d7e1ea] px-3 text-sm"/><Button type="submit" variant="secondary" disabled={busy||!draft.trim()}>{t('Comentar','Comment')}</Button><SubCommentAttach endpoint={endpoint} ownerId={ownerId} accessId={accessId} taskId={task.id} draft={draft} disabled={busy} en={en} onDone={()=>{setDraft('');onReload();void attachments.reload();}}/></form>
 </div>;
}
