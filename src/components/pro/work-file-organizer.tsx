'use client';
/* eslint-disable @next/next/no-img-element -- previews are authenticated same-origin JPEGs from the work-files API. */
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Folder,Star,Trash2} from 'lucide-react';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {proFileSize} from '@/lib/pro/file-size';
import {PRO_FILE_MAX_BYTES,proFileLimitText} from '@/lib/pro/file-limit';
import {organizerPageSchema,type OrganizerPage} from '@/lib/pro/round8';
import {createWorkFileUpload,continueWorkFileWrite,type WorkFileStore} from '@/lib/pro/work-file-recovery';

/**
 * Round 8: «Archivos» of a job — folders and subfolders (up to 5 levels), move, rename, favorites,
 * trash with restore (30-day note), search and multi-file upload (sequential, with progress; each
 * file is one idempotent upload through the existing work-files writer). Versions and sharing with
 * the customer stay in Bitácora › Archivos (same files).
 */
type View='folder'|'favorites'|'trash'|'search';
type FileRow=OrganizerPage['files'][number];type FolderRow=OrganizerPage['folders'][number];
const memoryStore:WorkFileStore={read:async()=>null,advance:async()=>{},remove:async()=>{}};
const day=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));
export function WorkFileOrganizer({workId}:{workId:string}){
 const {user}=useAuth(),en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]);
 const [view,setView]=useState<View>('folder'),[folder,setFolder]=useState<string|null>(null),[q,setQ]=useState(''),[query,setQuery]=useState('');
 const [page,setPage]=useState<OrganizerPage|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [dialog,setDialog]=useState<{kind:'new_folder'|'rename_folder'|'rename_file'|'move_folder'|'move_file';id?:string;name?:string;revision?:number}|null>(null),[dialogValue,setDialogValue]=useState('');
 const [progress,setProgress]=useState<{done:number;total:number;failed:string[]}|null>(null);
 const pending=useRef<{key:string;id:string}|null>(null),input=useRef<HTMLInputElement>(null);
 const load=useCallback(async()=>{
  try{const params=new URLSearchParams({workId,view});if(view==='folder'&&folder)params.set('folderId',folder);if(view==='search')params.set('q',query);
   const r=await fetch('/api/pro/work-file-organizer?'+params,{cache:'no-store'});if(r.status===404&&folder){setFolder(null);return;}if(!r.ok)throw Error();setPage(organizerPageSchema.parse(await r.json()));setFailed(false);}catch{setFailed(true);}
 },[workId,view,folder,query]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function mutate(body:Record<string,unknown>,done?:string){
  const key=JSON.stringify(body);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/pro/work-file-organizer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,workId,actionId:pending.current.id})});const data=await r.json().catch(()=>({}));
   if(!r.ok){if(r.status===409){pending.current=null;await load();}throw Error(typeof data?.error==='string'?data.error:t('No se pudo comprobar el cambio. Reintente: no se duplicará.','Could not confirm the change. Retry: it will not be duplicated.'));}
   pending.current=null;if(done)setNotice(done);await load();return true;}catch(failure){setError((failure as Error).message);return false;}finally{setBusy(false);}
 }
 async function upload(list:FileList|null){
  if(!list||!list.length||!user)return;const files=Array.from(list).slice(0,20);const target=view==='folder'?folder:null;
  setProgress({done:0,total:files.length,failed:[]});setError('');setNotice('');
  for(const file of files){
   if(file.size>PRO_FILE_MAX_BYTES){setProgress(p=>p&&{...p,done:p.done+1,failed:[...p.failed,file.name]});continue;}
   try{const record=await createWorkFileUpload({accountId:user.id,workId},{name:file.name,type:file.type,bytes:await file.arrayBuffer()},crypto.randomUUID());
    const result=await continueWorkFileWrite({store:memoryStore,attempt:record,request:fetch,currentAccount:()=>user.id,currentWork:()=>workId,onCheckpoint:()=>{}});
    if(result.status!=='confirmed')throw Error();
    if(target){await fetch('/api/pro/work-file-organizer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'move_file',actionId:crypto.randomUUID(),workId,subjectId:result.file.id,revision:0,targetId:target})});}
    setProgress(p=>p&&{...p,done:p.done+1});
   }catch{setProgress(p=>p&&{...p,done:p.done+1,failed:[...p.failed,file.name]});}
  }
  if(input.current)input.current.value='';window.dispatchEvent(new Event('contratacr:work-files-changed'));await load();
 }
 const crumbs=page?.breadcrumb??[];const folders=page?.folders??[];const files=page?.files??[];
 const folderOptions=(exclude?:string)=>{const all=page?.allFolders??[];const blocked=new Set<string>();if(exclude){blocked.add(exclude);let grew=true;while(grew){grew=false;for(const f of all)if(f.parentId&&blocked.has(f.parentId)&&!blocked.has(f.id)){blocked.add(f.id);grew=true;}}}
  const path=(id:string):string=>{const f=all.find(x=>x.id===id);return f?(f.parentId?path(f.parentId)+' / ':'')+f.name:'';};return all.filter(f=>!blocked.has(f.id)).map(f=>({id:f.id,label:path(f.id)})).sort((a,b)=>a.label.localeCompare(b.label));};
 const tab=(value:View,label:string)=><Button key={value} type="button" variant={view===value?'default':'secondary'} aria-pressed={view===value} disabled={busy} onClick={()=>{setView(value);if(value!=='folder')setFolder(null);}}>{label}</Button>;
 const fileHref=(id:string)=>'/api/pro/work-files?'+new URLSearchParams({fileId:id});
 const folderItem=(f:FolderRow)=><li key={f.id} data-organizer-folder={f.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
  {view==='trash'?<span className="flex min-w-0 flex-1 items-center gap-2 font-semibold"><Folder aria-hidden className="h-5 w-5 shrink-0 text-[#68778d]"/>{f.name}</span>
   :<button type="button" disabled={busy} onClick={()=>{setView('folder');setFolder(f.id);}} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left font-semibold"><Folder aria-hidden className="h-5 w-5 shrink-0 text-[#008bb5]"/><span className="break-words">{f.name}</span><span className="text-xs font-normal text-[#68778d]">· {f.items} {f.items===1?t('elemento','item'):t('elementos','items')}</span></button>}
  {view==='trash'?<><span className="text-xs text-[#52627a]">{t('Se puede restaurar hasta el ','Can be restored until ')+(f.restoreUntil?day(f.restoreUntil,en):'')}</span><Button type="button" variant="secondary" disabled={busy} onClick={()=>void mutate({action:'restore_folder',subjectId:f.id,revision:f.revision},t('Carpeta restaurada.','Folder restored.'))}>{t('Restaurar','Restore')}</Button></>
   :<><Button type="button" variant="outline" disabled={busy} onClick={()=>{setDialog({kind:'rename_folder',id:f.id,name:f.name,revision:f.revision});setDialogValue(f.name);}}>{t('Renombrar','Rename')}</Button>
    <Button type="button" variant="outline" disabled={busy} onClick={()=>{setDialog({kind:'move_folder',id:f.id,revision:f.revision});setDialogValue('');}}>{t('Mover','Move')}</Button>
    <Button type="button" variant="outline" disabled={busy} aria-label={t(`Enviar ${f.name} a la papelera`,`Move ${f.name} to trash`)} onClick={()=>void mutate({action:'trash_folder',subjectId:f.id,revision:f.revision},t('Carpeta enviada a la papelera con todo su contenido.','Folder moved to the trash with everything inside.'))}><Trash2 aria-hidden className="h-4 w-4"/></Button></>}
 </li>;
 const fileItem=(f:FileRow)=><li key={f.id} data-organizer-file={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#d7e1ea] bg-white p-3">
  {f.mimeType==='image/jpeg'?<img src={fileHref(f.id)} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg bg-[#f3f8fb] object-cover"/>:<span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#fdecec] text-xs font-bold text-[#b42318]">PDF</span>}
  <div className="min-w-0 flex-1"><a href={fileHref(f.id)} download={f.name} className="block break-words font-semibold underline">{f.name}</a>
   <p className="text-xs text-[#52627a]">{proFileSize(f.sizeBytes,en)}{f.name!==f.originalName?' · '+t('Original: ','Original: ')+f.originalName:''}{f.publishedAt?' · '+t('Compartido con el cliente','Shared with the customer'):''}</p>
   {view==='trash'&&f.restoreUntil&&<p className="text-xs text-[#52627a]">{t('Se puede restaurar hasta el ','Can be restored until ')+day(f.restoreUntil,en)}</p>}</div>
  {view==='trash'?<Button type="button" variant="secondary" disabled={busy} onClick={()=>void mutate({action:'restore_file',subjectId:f.id,revision:f.metaRevision},t('Archivo restaurado.','File restored.'))}>{t('Restaurar','Restore')}</Button>:<>
   <Button type="button" variant="outline" className="h-11 w-11 p-0" aria-pressed={f.favorite} aria-label={f.favorite?t(`Quitar ${f.name} de favoritos`,`Remove ${f.name} from favorites`):t(`Marcar ${f.name} como favorito`,`Mark ${f.name} as favorite`)} disabled={busy} onClick={()=>void mutate({action:'favorite_file',subjectId:f.id,revision:f.metaRevision,on:!f.favorite})}><Star aria-hidden className={'h-4 w-4 '+(f.favorite?'fill-[#f2b705] text-[#c58a00]':'')}/></Button>
   <Button type="button" variant="outline" disabled={busy} onClick={()=>{setDialog({kind:'rename_file',id:f.id,name:f.name,revision:f.metaRevision});setDialogValue(f.name);}}>{t('Renombrar','Rename')}</Button>
   <Button type="button" variant="outline" disabled={busy} onClick={()=>{setDialog({kind:'move_file',id:f.id,revision:f.metaRevision});setDialogValue(f.folderId??'');}}>{t('Mover','Move')}</Button>
   <Button type="button" variant="outline" disabled={busy} aria-label={t(`Enviar ${f.name} a la papelera`,`Move ${f.name} to trash`)} onClick={()=>void mutate({action:'trash_file',subjectId:f.id,revision:f.metaRevision},t('Archivo enviado a la papelera.','File moved to the trash.'))}><Trash2 aria-hidden className="h-4 w-4"/></Button></>}
 </li>;
 const dialogTitle=!dialog?'':dialog.kind==='new_folder'?t('Nueva carpeta','New folder'):dialog.kind.startsWith('rename')?t('Renombrar','Rename'):t('Mover a','Move to');
 async function submitDialog(){
  if(!dialog)return;let ok=false;
  if(dialog.kind==='new_folder')ok=await mutate({action:'create_folder',folderId:crypto.randomUUID(),parentId:folder,name:dialogValue.trim()},t('Carpeta creada.','Folder created.'));
  else if(dialog.kind==='rename_folder'||dialog.kind==='rename_file')ok=await mutate({action:dialog.kind,subjectId:dialog.id,revision:dialog.revision,name:dialogValue.trim()},t('Nombre guardado.','Name saved.'));
  else ok=await mutate({action:dialog.kind,subjectId:dialog.id,revision:dialog.revision,targetId:dialogValue||null},t('Movido.','Moved.'));
  if(ok)setDialog(null);
 }
 return <section data-work-file-organizer aria-label={t('Archivos del trabajo','Job files')} className="min-w-0 space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold">{t('Archivos del trabajo','Job files')}</h3>
   <div className="flex flex-wrap gap-2">{view==='folder'&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>{setDialog({kind:'new_folder'});setDialogValue('');}}>{t('Nueva carpeta','New folder')}</Button>}
    <label className={'inline-flex min-h-11 cursor-pointer items-center rounded-full bg-[#009FD9] px-5 text-sm font-semibold text-white focus-within:ring-2 focus-within:ring-[#009FD9] focus-within:ring-offset-2 '+(progress&&progress.done<progress.total?'pointer-events-none opacity-50':'')}>{t('Subir archivos','Upload files')}<input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" aria-label={t('Subir archivos','Upload files')} className="sr-only" disabled={!!progress&&progress.done<progress.total} onChange={event=>void upload(event.target.files)}/></label></div></div>
  <p className="text-xs text-[#52627a]">{proFileLimitText(en)} {t('Puede elegir varios a la vez (hasta 20). Se guardan en la carpeta abierta.','You can choose several at once (up to 20). They are saved in the open folder.')}</p>
  {progress&&<div role="status" data-organizer-upload-progress className="rounded-xl bg-[#f3f8fb] p-3 text-sm">{progress.done<progress.total?t(`Subiendo ${progress.done+1} de ${progress.total}…`,`Uploading ${progress.done+1} of ${progress.total}…`):t(`Subidos ${progress.total-progress.failed.length} de ${progress.total}.`,`Uploaded ${progress.total-progress.failed.length} of ${progress.total}.`)}
   {progress.failed.length>0&&<span className="block text-red-700">{t('No se pudieron subir: ','Could not upload: ')+progress.failed.join(', ')}</span>}
   <progress className="mt-2 block h-2 w-full" max={progress.total} value={progress.done}/></div>}
  <div className="flex flex-wrap items-center gap-2">{tab('folder',t('Carpetas','Folders'))}{tab('favorites',t('Favoritos','Favorites'))}{tab('trash',t('Papelera','Trash')+(page?.trashCount?` (${page.trashCount})`:''))}
   <form role="search" className="flex min-w-0 flex-1 basis-full gap-2 sm:basis-0" onSubmit={event=>{event.preventDefault();setQuery(q.trim());setView('search');setFolder(null);}}><input type="search" aria-label={t('Buscar archivos','Search files')} placeholder={t('Buscar archivos','Search files')} value={q} maxLength={80} onChange={e=>setQ(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#d7e1ea] px-3"/><Button type="submit" variant="secondary" disabled={busy||!q.trim()}>{t('Buscar','Search')}</Button></form></div>
  {view==='folder'&&<nav aria-label={t('Ubicación','Location')} className="flex flex-wrap items-center gap-1 text-sm"><button type="button" className="min-h-11 rounded-lg px-2 font-semibold text-[#008bb5] underline" onClick={()=>setFolder(null)}>{t('Inicio','Home')}</button>{crumbs.map(c=><span key={c.id} className="flex items-center gap-1"><span aria-hidden>/</span><button type="button" className="min-h-11 rounded-lg px-2 font-semibold text-[#008bb5] underline" aria-current={c.id===folder?'page':undefined} onClick={()=>setFolder(c.id)}>{c.name}</button></span>)}</nav>}
  {view==='trash'&&<p data-organizer-retention className="rounded-xl bg-[#fff7e6] p-3 text-sm text-[#6b4e00]">{t('Los elementos de la papelera se pueden restaurar durante 30 días. Lo que ya compartió con el cliente sigue compartido.','Items in the trash can be restored for 30 days. Anything already shared with the customer stays shared.')}</p>}
  {notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {!page?(failed?<div role="alert" className="space-y-2"><p>{t('No se pudieron cargar los archivos.','Could not load the files.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>:<p role="status">{t('Cargando archivos…','Loading files…')}</p>)
   :folders.length+files.length===0?<p className="rounded-xl bg-[#f3f8fb] p-4 text-sm text-[#52627a]">{view==='trash'?t('La papelera está vacía.','The trash is empty.'):view==='favorites'?t('Todavía no hay favoritos.','No favorites yet.'):view==='search'?t('No hay archivos con ese nombre.','No files with that name.'):t('Esta carpeta está vacía. Suba archivos o cree una carpeta.','This folder is empty. Upload files or create a folder.')}</p>
   :<ul className="space-y-2">{folders.map(folderItem)}{files.map(fileItem)}</ul>}
  {dialog&&<Modal title={dialogTitle} ariaLabel={dialogTitle} onClose={()=>{if(!busy)setDialog(null);}} closeLabel={t('Cerrar','Close')} mobilePresentation="center"
   footer={<><Button type="button" variant="secondary" disabled={busy} onClick={()=>setDialog(null)}>{t('Cancelar','Cancel')}</Button><Button type="button" disabled={busy||(dialog.kind==='new_folder'||dialog.kind.startsWith('rename'))&&!dialogValue.trim()} onClick={()=>void submitDialog()}>{busy?t('Guardando…','Saving…'):t('Guardar','Save')}</Button></>}>
   <form onSubmit={event=>{event.preventDefault();void submitDialog();}} className="space-y-3">
    {dialog.kind==='new_folder'||dialog.kind.startsWith('rename')?<label className="block text-sm font-semibold">{t('Nombre','Name')}<input autoFocus aria-label={t('Nombre','Name')} maxLength={dialog.kind==='rename_file'?160:80} value={dialogValue} onChange={e=>setDialogValue(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] px-3"/></label>
     :<label className="block text-sm font-semibold">{t('Carpeta de destino','Destination folder')}<select aria-label={t('Carpeta de destino','Destination folder')} value={dialogValue} onChange={e=>setDialogValue(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3"><option value="">{t('Inicio (sin carpeta)','Home (no folder)')}</option>{folderOptions(dialog.kind==='move_folder'?dialog.id:undefined).map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>}
    {dialog.kind==='rename_file'&&<p className="text-xs text-[#52627a]">{t('La extensión se conserva. El archivo original no cambia.','The extension is kept. The original file does not change.')}</p>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   </form>
  </Modal>}
 </section>;
}
