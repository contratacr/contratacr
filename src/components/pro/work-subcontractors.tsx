'use client';
import {SubCommentAttach,SubCommentFileLink,useSubCommentFiles} from './sub-comment-files';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';

/**
 * Round 8: «Subcontratistas» of a job (owner). Invite a vendor of the directory by e-mail (a one-use
 * code that the owner copies and sends; ContrataCR sends nothing), add an existing subcontractor
 * to this job, choose the tasks assigned to each one and the files shared with them, comment on a
 * task and revoke access. What they see is limited on the server: their tasks, shared files and the
 * schedule of linked jobs; never finances or customer contact data.
 */
type Access={id:string;supplierId:string;vendorName:string;email:string;status:'pending'|'active'|'revoked'|'expired';memberName:string|null;revision:number;expiresAt:string;taskIds?:string[];fileIds?:string[];comments?:{id:string;taskId:string;side:'pro'|'sub';authorName:string;body:string;createdAt:string}[]};
type Page={workId:string;linked:Access[];available:Access[];vendors:{id:string;name:string;kind:string;trade:string|null}[];tasks:{id:string;title:string;status:string;dueDate:string|null}[];files:{id:string;name:string;mimeType:string}[]};
export function WorkSubcontractors({workId}:{workId:string}){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]);
 const [page,setPage]=useState<Page|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [vendor,setVendor]=useState(''),[email,setEmail]=useState(''),[code,setCode]=useState<{code:string;email:string;vendor:string}|null>(null),[addId,setAddId]=useState('');
 const pending=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/subcontractors?'+new URLSearchParams({workId}),{cache:'no-store'});if(!r.ok)throw Error();setPage(await r.json());setFailed(false);}catch{setFailed(true);}},[workId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function mutate(body:Record<string,unknown>,done?:string){
  const key=JSON.stringify(body);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/pro/subcontractors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,actionId:pending.current.id})});const data=await r.json().catch(()=>({}));
   if(!r.ok){if(r.status===409){pending.current=null;await load();}throw Error(r.status===403&&data?.code==='pro_role'?t('Su rol en esta empresa no permite administrar subcontratistas.','Your role in this company cannot manage subcontractors.'):typeof data?.error==='string'?data.error:t('No se pudo comprobar el cambio. Reintente: no se duplicará.','Could not confirm the change. Retry: it will not be duplicated.'));}
   pending.current=null;if(done)setNotice(done);await load();return data;}catch(failure){setError((failure as Error).message);return null;}finally{setBusy(false);}
 }
 if(!page)return failed?<div role="alert" className="space-y-2"><p>{t('No se pudieron cargar los subcontratistas.','Could not load the subcontractors.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>:<p role="status">{t('Cargando…','Loading…')}</p>;
 const statusLabel=(a:Access)=>a.status==='active'?t('Con acceso','Has access'):a.status==='pending'?t('Invitación pendiente','Invitation pending'):a.status==='expired'?t('Código vencido','Code expired'):t('Acceso revocado','Access revoked');
 return <section data-work-subcontractors aria-label={t('Subcontratistas','Subcontractors')} className="min-w-0 space-y-5">
  <div><h3 className="text-lg font-bold">{t('Subcontratistas','Subcontractors')}</h3>
   <p className="text-sm text-[#52627a]">{t('Solo ven las tareas que les asigne, los archivos que comparta y el cronograma de los trabajos donde participan. Pueden comentar y marcar sus tareas como hechas. No ven finanzas ni datos de contacto del cliente (solo su nombre).','They only see the tasks you assign, the files you share and the schedule of the jobs they work on. They can comment and mark their tasks done. They never see finances or customer contact details (only the name).')}</p></div>
  {notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {code&&<div data-subcontractor-code role="status" className="space-y-1 rounded-xl border border-[#008fb8] bg-[#eaf7fb] p-4 text-sm">
   <p className="font-semibold">{t('Código de invitación para ','Invitation code for ')}{code.vendor}</p>
   <p data-subcontractor-code-value className="select-all font-mono text-xl tracking-widest">{code.code}</p>
   <p>{t(`Envíelo usted a ${code.email}. Vence en 72 horas y sirve una sola vez. La persona debe iniciar sesión con ese correo y abrir "Mis obras como subcontratista".`,`Send it yourself to ${code.email}. It expires in 72 hours and works once. The person must sign in with that email and open "My subcontractor jobs".`)}</p>
   <p className="text-xs text-[#52627a]">{t('ContrataCR no envió ningún correo. Este código no se puede volver a mostrar.','ContrataCR did not send any email. This code cannot be shown again.')}</p></div>}
  <form data-subcontractor-invite className="space-y-3 rounded-xl border border-[#d7e1ea] bg-white p-4" onSubmit={async event=>{event.preventDefault();const v=page.vendors.find(x=>x.id===vendor);const data=await mutate({action:'invite',workId,supplierId:vendor,email:email.trim()});if(data?.code&&v){setCode({code:data.code,email:email.trim(),vendor:v.name});setEmail('');setVendor('');}}}>
   <h4 className="font-semibold">{t('Invitar subcontratista','Invite subcontractor')}</h4>
   {page.vendors.length===0?<p className="text-sm text-[#52627a]">{t('Agregue primero el subcontratista en Empresa › Proveedores.','First add the subcontractor in Company › Vendors.')}</p>:<>
    <label className="block text-sm font-semibold">{t('Proveedor o subcontratista','Vendor or subcontractor')}<select aria-label={t('Proveedor o subcontratista','Vendor or subcontractor')} required value={vendor} disabled={busy} onChange={e=>setVendor(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3"><option value="">{t('Elegir…','Choose…')}</option>{page.vendors.map(v=><option key={v.id} value={v.id}>{v.name}{v.kind==='subcontractor'?t(' · subcontratista',' · subcontractor'):''}{v.trade?' · '+v.trade:''}</option>)}</select></label>
    <label className="block text-sm font-semibold">{t('Correo de la persona','Person’s email')}<input aria-label={t('Correo de la persona','Person’s email')} type="email" required maxLength={254} value={email} disabled={busy} onChange={e=>setEmail(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] px-3"/></label>
    <Button type="submit" disabled={busy||!vendor||!email.trim()}>{t('Crear invitación','Create invitation')}</Button></>}
  </form>
  {page.available.length>0&&<div className="flex flex-wrap items-end gap-2 rounded-xl border border-[#d7e1ea] bg-white p-4">
   <label className="min-w-0 flex-1 text-sm font-semibold">{t('Agregar a este trabajo','Add to this job')}<select aria-label={t('Agregar a este trabajo','Add to this job')} value={addId} disabled={busy} onChange={e=>setAddId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3"><option value="">{t('Elegir…','Choose…')}</option>{page.available.map(a=><option key={a.id} value={a.id}>{a.vendorName} · {a.email}</option>)}</select></label>
   <Button type="button" variant="secondary" disabled={busy||!addId} onClick={async()=>{if(await mutate({action:'add_job',workId,accessId:addId},t('Agregado a este trabajo.','Added to this job.')))setAddId('');}}>{t('Agregar','Add')}</Button></div>}
  {page.linked.length===0?<p className="rounded-xl bg-[#f3f8fb] p-4 text-sm text-[#52627a]">{t('Este trabajo no tiene subcontratistas.','This job has no subcontractors.')}</p>:
   <ul className="space-y-3">{page.linked.map(a=><li key={a.id} data-subcontractor={a.id} className="space-y-3 rounded-xl border border-[#d7e1ea] bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold">{a.vendorName}{a.memberName?` · ${a.memberName}`:''}</p><p className="break-all text-sm text-[#52627a]">{a.email} · <span data-subcontractor-status={a.status}>{statusLabel(a)}</span></p></div>
     <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>void mutate({action:'remove_job',workId,accessId:a.id},t('Quitado de este trabajo.','Removed from this job.'))}>{t('Quitar de este trabajo','Remove from this job')}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={()=>void mutate({action:'revoke',accessId:a.id,revision:a.revision},t('Acceso revocado en todos los trabajos.','Access revoked on every job.'))}>{t('Revocar acceso','Revoke access')}</Button></div></div>
    <fieldset className="space-y-1" disabled={busy}><legend className="text-sm font-semibold">{t('Tareas asignadas','Assigned tasks')}</legend>
     {page.tasks.length===0?<p className="text-sm text-[#52627a]">{t('El trabajo no tiene tareas.','The job has no tasks.')}</p>:page.tasks.map(task=>{const on=a.taskIds?.includes(task.id)??false,thread=(a.comments??[]).filter(c=>c.taskId===task.id);return <div key={task.id} className="space-y-1"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={on} className="h-5 w-5" onChange={()=>void mutate({action:'assign_task',workId,accessId:a.id,subjectId:task.id,on:!on})}/><span className="min-w-0 break-words">{task.title}{task.status==='done'?t(' · hecha',' · done'):''}</span></label>
      {on&&a.status==='active'&&<TaskThread comments={thread} en={en} busy={busy} accessId={a.id} taskId={task.id} onReload={()=>void load()} onSend={body=>mutate({action:'comment',workId,accessId:a.id,subjectId:task.id,body})}/>}</div>;})}</fieldset>
    <fieldset className="space-y-1" disabled={busy}><legend className="text-sm font-semibold">{t('Archivos compartidos','Shared files')}</legend>
     {page.files.length===0?<p className="text-sm text-[#52627a]">{t('El trabajo no tiene archivos.','The job has no files.')}</p>:page.files.map(file=>{const on=a.fileIds?.includes(file.id)??false;return <label key={file.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={on} className="h-5 w-5" onChange={()=>void mutate({action:'share_file',workId,accessId:a.id,subjectId:file.id,on:!on})}/><span className="min-w-0 break-all">{file.name}</span></label>;})}</fieldset>
   </li>)}</ul>}
 </section>;
}

function TaskThread({comments,en,busy,onSend,accessId,taskId,onReload}:{comments:NonNullable<Access['comments']>;en:boolean;busy:boolean;onSend:(body:string)=>Promise<unknown>;accessId:string;taskId:string;onReload:()=>void}){
 const [draft,setDraft]=useState('');const t=(es:string,english:string)=>en?english:es;
 // Round 9: attachments (owner side; the owner comes from the gate on the server).
 const endpoint='/api/pro/subcontractors/files',attachments=useSubCommentFiles({endpoint,accessId});
 return <div data-subcontractor-thread className="ml-7 space-y-2 rounded-lg bg-[#f7f9fc] p-2">
  {comments.map(c=><p key={c.id} data-subcontractor-comment={c.side} className="text-sm"><span className="font-semibold">{c.side==='pro'?t('Usted','You'):c.authorName}</span>: <span className="break-words">{c.body}</span>{attachments.files[c.id]&&<SubCommentFileLink file={attachments.files[c.id]} endpoint={endpoint} en={en}/>}</p>)}
  <form className="flex flex-wrap gap-2" onSubmit={async event=>{event.preventDefault();if(!draft.trim())return;if(await onSend(draft.trim()))setDraft('');}}><input aria-label={t('Comentario para el subcontratista','Comment for the subcontractor')} maxLength={1000} value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)} placeholder={t('Comentario','Comment')} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#d7e1ea] px-3 text-sm"/><Button type="submit" variant="secondary" disabled={busy||!draft.trim()}>{t('Comentar','Comment')}</Button><SubCommentAttach endpoint={endpoint} accessId={accessId} taskId={taskId} draft={draft} disabled={busy} en={en} onDone={()=>{setDraft('');onReload();void attachments.reload();}}/></form>
 </div>;
}
