'use client';
/* eslint-disable @next/next/no-img-element -- previews are authenticated same-origin JPEGs from the work-files API. */
import {useCallback,useEffect,useMemo,useRef,useState,type DragEvent} from 'react';
import {useLocale} from 'next-intl';
import {Eye,EyeOff,Folder,FolderOpen,Star,Trash2} from 'lucide-react';
import {z} from 'zod';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {proFileSize} from '@/lib/pro/file-size';
import {proDocKindLabel} from '@/lib/pro/file-formats';
import {organizerPageSchema,type OrganizerPage} from '@/lib/pro/round8';
import {workFileSchema} from '@/lib/pro/work-files';
import {ProDropZone,ProUploadList,postJsonWithProgress,uploadFailureMessage,useProUploadQueue,type UploadSend} from './pro-upload-queue';
import {ProFilePreview,canPreview,type PreviewTarget} from './pro-file-preview';
import {FileBulkBar,FilePurgePanel,useFileBulk} from './file-bulk';
import {FileAnnotations} from './file-annotations';
import {FileConvertButton} from './file-transfers';
import {FileTypeIcon} from './file-type-icon';

/**
 * Round 8 + Ronda F2-D: «Archivos» of a job. Folders and subfolders (up to 5 levels), move (drag a
 * file onto a folder on desktop, «Mover» menu everywhere), rename, favorites, trash with restore
 * (30 days) and permanent delete with confirmation, search and sort, multi-file upload with drag
 * and drop, per-file progress, errors and retry (Word/Excel/PowerPoint/CSV/TXT/DWG/DXF/HEIC/video
 * besides photos and PDF), in-app preview of photos/PDF/video and folders shared with the linked
 * customer («Visible para el cliente»). Versions and sharing single files stay in Bitácora ›
 * Archivos (same files).
 */
type View='folder'|'favorites'|'trash'|'search';type Sort='recent'|'oldest'|'name'|'size';
type FileRow=OrganizerPage['files'][number];type FolderRow=OrganizerPage['folders'][number];
const day=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(value));
const DRAG_TYPE='application/x-contratacr-work-file';
const uploadResult=z.object({file:workFileSchema}).passthrough();
export function WorkFileOrganizer({workId}:{workId:string}){
 const {user}=useAuth(),en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]);
 const [view,setView]=useState<View>('folder'),[folder,setFolder]=useState<string|null>(null),[q,setQ]=useState(''),[query,setQuery]=useState(''),[sort,setSort]=useState<Sort>('recent');
 const [page,setPage]=useState<OrganizerPage|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [dialog,setDialog]=useState<{kind:'new_folder'|'rename_folder'|'rename_file'|'move_folder'|'move_file';id?:string;name?:string;revision?:number}|null>(null),[dialogValue,setDialogValue]=useState('');
 const [annotate,setAnnotate]=useState<(PreviewTarget&{id:string})|null>(null),[preview,setPreview]=useState<PreviewTarget|null>(null),[dropTarget,setDropTarget]=useState<string|null>(null);
 const pending=useRef<{key:string;id:string}|null>(null),uploadFolder=useRef<string|null>(null),{confirm,dialogNode}=useAppDialog();
 const load=useCallback(async()=>{
  try{const params=new URLSearchParams({workId,view});if(view==='folder'&&folder)params.set('folderId',folder);if(view==='search')params.set('q',query);
   const r=await fetch('/api/pro/work-file-organizer?'+params,{cache:'no-store'});if(r.status===404&&folder){setFolder(null);return;}if(!r.ok)throw Error();setPage(organizerPageSchema.parse(await r.json()));setFailed(false);}catch{setFailed(true);}
 },[workId,view,folder,query]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 // Row 29: multi-selection (1 to 50) with move, favorites, trash, restore and permanent delete.
 const bulk=useFileBulk({scope:'work',workId,onDone:()=>{window.dispatchEvent(new Event('contratacr:work-files-changed'));void load();}});
 async function mutate(body:Record<string,unknown>,done?:string){
  const key=JSON.stringify(body);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/pro/work-file-organizer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,workId,actionId:pending.current.id})});const data=await r.json().catch(()=>({}));
   if(!r.ok){if(r.status===409||r.status===400)pending.current=null;if(r.status===409&&data?.reason!=='in_use')await load();
    throw Error(data?.reason==='in_use'?t('Este archivo se usa en otra parte (compartido con el cliente, con versiones, comentarios u otro módulo). Se conserva en la papelera.','This file is used elsewhere (shared with the customer, with versions, comments or another module). It stays in the trash.'):r.status===409?t('El archivo o la carpeta cambió. Revise y vuelva a intentarlo.','The file or folder changed. Review and try again.'):t('No se pudo comprobar el cambio. Reintente: no se duplicará.','Could not confirm the change. Retry: it will not be duplicated.'));}
   pending.current=null;if(done)setNotice(done);await load();return true;}catch(failure){setError((failure as Error).message);return false;}finally{setBusy(false);}
 }
 // One upload = the existing idempotent work-files writer (same fileId on retry), then a move into the open folder.
 const send=useCallback<UploadSend>(async(item,data,onProgress)=>{
  const body=JSON.stringify({action:'upload',workId,fileId:item.ids.fileId,name:item.file.name,data});
  const r=await postJsonWithProgress('/api/pro/work-files',body,onProgress);
  if(r.status<200||r.status>=300)return{ok:false,message:uploadFailureMessage(r.status,r.data,en)};
  const parsed=uploadResult.safeParse(r.data);if(!parsed.success||parsed.data.file.id!==item.ids.fileId)return{ok:false,message:uploadFailureMessage(503,null,en)};
  const target=uploadFolder.current;
  if(target){const moved=await fetch('/api/pro/work-file-organizer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'move_file',actionId:item.ids.actionId,workId,subjectId:item.ids.fileId,revision:0,targetId:target})}).catch(()=>null);
   if(!moved||!moved.ok&&moved.status!==409)return{ok:false,message:t('El archivo se guardó, pero no se pudo mover a la carpeta. Reintente.','The file was saved but could not be moved into the folder. Retry.')};}
  return{ok:true};
 },[en,t,workId]);
 const finished=useCallback(()=>{window.dispatchEvent(new Event('contratacr:work-files-changed'));void load();},[load]);
 const queue=useProUploadQueue(send,finished);
 const addFiles=(list:File[])=>{uploadFolder.current=view==='folder'?folder:null;setError('');setNotice('');const skipped=queue.add(list);if(skipped>0)setError(t(`Se agregaron 20 archivos; elija los otros ${skipped} cuando terminen.`,`20 files were added; choose the other ${skipped} when they finish.`));};
 const crumbs=page?.breadcrumb??[];const folders=page?.folders??[];
 const files=useMemo(()=>{const list=[...(page?.files??[])];const by={recent:(a:FileRow,b:FileRow)=>b.createdAt.localeCompare(a.createdAt),oldest:(a:FileRow,b:FileRow)=>a.createdAt.localeCompare(b.createdAt),name:(a:FileRow,b:FileRow)=>a.name.localeCompare(b.name,en?'en':'es',{numeric:true,sensitivity:'base'}),size:(a:FileRow,b:FileRow)=>b.sizeBytes-a.sizeBytes}[sort];return list.sort(by);},[page,sort,en]);
 const folderOptions=(exclude?:string)=>{const all=page?.allFolders??[];const blocked=new Set<string>();if(exclude){blocked.add(exclude);let grew=true;while(grew){grew=false;for(const f of all)if(f.parentId&&blocked.has(f.parentId)&&!blocked.has(f.id)){blocked.add(f.id);grew=true;}}}
  const path=(id:string):string=>{const f=all.find(x=>x.id===id);return f?(f.parentId?path(f.parentId)+' / ':'')+f.name:'';};return all.filter(f=>!blocked.has(f.id)).map(f=>({id:f.id,label:path(f.id)})).sort((a,b)=>a.label.localeCompare(b.label));};
 const tab=(value:View,label:string)=><Button key={value} type="button" variant={view===value?'default':'secondary'} aria-pressed={view===value} disabled={busy} onClick={()=>{setView(value);if(value!=='folder')setFolder(null);}}>{label}</Button>;
 const fileHref=(id:string)=>'/api/pro/work-files?'+new URLSearchParams({fileId:id});
 // Desktop: drag a file row onto a folder (or «Inicio») to move it. Phones use the «Mover» menu.
 // The target folder travels in data-drop-folder ('' = Inicio).
 const dropTargetOf=(event:DragEvent)=>(event.currentTarget as HTMLElement).dataset.dropFolder||null;
 function onDragOverFolder(event:DragEvent){if(view!=='folder'||busy||!Array.from(event.dataTransfer.types).includes(DRAG_TYPE))return;event.preventDefault();event.dataTransfer.dropEffect='move';setDropTarget(dropTargetOf(event)??'root');}
 function onDragLeaveFolder(event:DragEvent){const target=dropTargetOf(event)??'root';setDropTarget(current=>current===target?null:current);}
 function onDropFolder(event:DragEvent){const raw=event.dataTransfer.getData(DRAG_TYPE),target=dropTargetOf(event);setDropTarget(null);if(!raw||busy)return;event.preventDefault();event.stopPropagation();
  try{const moved=JSON.parse(raw) as {id:string;revision:number;folderId:string|null;name:string};if(moved.folderId===target)return;void mutate({action:'move_file',subjectId:moved.id,revision:moved.revision,targetId:target},t(`"${moved.name}" se movió.`,`"${moved.name}" was moved.`));}catch{}}
 async function purge(kind:'file'|'folder',id:string,revision:number,name:string){
  const answer=await confirm({tone:'danger',title:kind==='file'?t('¿Eliminar el archivo definitivamente?','Delete the file permanently?'):t('¿Eliminar la carpeta definitivamente?','Delete the folder permanently?'),
   description:kind==='file'?t('Se borra para siempre y no se podrá restaurar. Los archivos compartidos con el cliente o con versiones o comentarios se conservan.','It is deleted forever and cannot be restored. Files shared with the customer or with versions or comments are kept.'):t('Se borran para siempre la carpeta y todo su contenido; no se podrán restaurar. Si algún archivo está compartido o tiene versiones o comentarios, no se borra nada.','The folder and everything inside are deleted forever and cannot be restored. If any file is shared or has versions or comments, nothing is deleted.'),
   detail:name,confirmLabel:t('Eliminar definitivamente','Delete permanently'),cancelLabel:t('Cancelar','Cancel')});
  if(!answer.confirmed)return;
  await mutate({action:kind==='file'?'purge_file':'purge_folder',subjectId:id,revision},kind==='file'?t('Archivo eliminado definitivamente.','File deleted permanently.'):t('Carpeta eliminada definitivamente.','Folder deleted permanently.'));
 }
 const menu=(label:string,children:React.ReactNode)=><details className="relative"><summary aria-label={label} className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-full text-xl font-bold text-[#68778d] hover:bg-[#f3f8fb] [&::-webkit-details-marker]:hidden"><span aria-hidden="true">⋯</span></summary>
  <div className="absolute right-0 top-full z-20 mt-1 flex min-w-52 flex-col gap-1 rounded-xl border border-[#d7e1ea] bg-white p-2 shadow-lg" onClick={event=>{const box=(event.currentTarget.parentElement as HTMLDetailsElement);if((event.target as HTMLElement).closest('button'))box.open=false;}}>{children}</div></details>;
 const folderItem=(f:FolderRow)=><li key={f.id} data-organizer-folder={f.id} data-drop-target={dropTarget===f.id?'':undefined} data-drop-folder={f.id} onDragOver={onDragOverFolder} onDragLeave={onDragLeaveFolder} onDrop={onDropFolder} className={'flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 '+(dropTarget===f.id?'border-[#009FD9] bg-[#e8f6fc]':'border-[#d7e1ea]')}>
  {view==='trash'?<span className="flex min-w-0 flex-1 items-center gap-2 font-semibold"><Folder aria-hidden className="h-5 w-5 shrink-0 text-[#68778d]"/>{f.name}</span>
   :<button type="button" disabled={busy} onClick={()=>{setView('folder');setFolder(f.id);}} className="flex min-h-11 min-w-0 flex-1 basis-full items-center gap-2 text-left font-semibold sm:basis-0"><Folder aria-hidden className="h-5 w-5 shrink-0 text-[#008bb5]"/><span className="break-words">{f.name}</span><span className="text-xs font-normal text-[#68778d]">· {f.items} {f.items===1?t('elemento','item'):t('elementos','items')}</span></button>}
  {f.clientVisible&&view!=='trash'&&<span data-folder-client-visible className="inline-flex items-center gap-1 rounded-full bg-[#e7f6ee] px-2 py-1 text-xs font-semibold text-[#175b42]"><Eye aria-hidden className="h-3.5 w-3.5"/>{t('Visible para el cliente','Visible to the customer')}</span>}
  {view==='trash'?<><span className="text-xs text-[#52627a]">{t('Se puede restaurar hasta el ','Can be restored until ')+(f.restoreUntil?day(f.restoreUntil,en):'')}</span><Button type="button" variant="secondary" disabled={busy} onClick={()=>void mutate({action:'restore_folder',subjectId:f.id,revision:f.revision},t('Carpeta restaurada.','Folder restored.'))}>{t('Restaurar','Restore')}</Button>
    <Button type="button" variant="outline" disabled={busy} onClick={()=>void purge('folder',f.id,f.revision,f.name)}>{t('Eliminar definitivamente','Delete permanently')}</Button></>
   :<><Button type="button" variant="outline" disabled={busy} aria-label={t(`Enviar ${f.name} a la papelera`,`Move ${f.name} to trash`)} onClick={()=>void mutate({action:'trash_folder',subjectId:f.id,revision:f.revision},t('Carpeta enviada a la papelera con todo su contenido.','Folder moved to the trash with everything inside.'))}><Trash2 aria-hidden className="h-4 w-4"/></Button>
    {menu(t(`Opciones de la carpeta ${f.name}`,`Options for folder ${f.name}`),<>
     <Button type="button" variant="ghost" className="justify-start" disabled={busy} onClick={()=>void mutate({action:'share_folder',subjectId:f.id,revision:f.revision,on:!f.clientVisible},f.clientVisible?t('La carpeta ya no es visible para el cliente.','The folder is no longer visible to the customer.'):t('El cliente verá los archivos de esta carpeta (si "Archivos y fotos" está activo en la Vista del cliente).','The customer will see the files in this folder (if "Files and photos" is on in the Customer view).'))}>{f.clientVisible?<EyeOff aria-hidden className="h-4 w-4"/>:<Eye aria-hidden className="h-4 w-4"/>}{f.clientVisible?t('Dejar de mostrar al cliente','Stop showing to the customer'):t('Mostrar al cliente','Show to the customer')}</Button>
     <Button type="button" variant="ghost" className="justify-start" disabled={busy} onClick={()=>{setDialog({kind:'rename_folder',id:f.id,name:f.name,revision:f.revision});setDialogValue(f.name);}}>{t('Renombrar','Rename')}</Button>
     <Button type="button" variant="ghost" className="justify-start" disabled={busy} onClick={()=>{setDialog({kind:'move_folder',id:f.id,revision:f.revision});setDialogValue('');}}>{t('Mover','Move')}</Button></>)}</>}
 </li>;
 const fileItem=(f:FileRow)=>{const previewable=canPreview(f.mimeType)&&typeof f.sha256==='string';const target={name:f.name,mimeType:f.mimeType,sizeBytes:f.sizeBytes,sha256:String(f.sha256??''),href:fileHref(f.id)};
  return <li key={f.id} data-organizer-file={f.id} draggable={view==='folder'&&!busy} onDragStart={event=>{event.dataTransfer.setData(DRAG_TYPE,JSON.stringify({id:f.id,revision:f.metaRevision,folderId:f.folderId,name:f.name}));event.dataTransfer.effectAllowed='move';}} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#d7e1ea] bg-white p-3">
  <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-0"><input type="checkbox" data-bulk-select={f.id} className="h-5 w-5 shrink-0 accent-[#009FD9]" aria-label={t(`Seleccionar ${f.name}`,`Select ${f.name}`)} checked={!!bulk.selected[f.id]} disabled={busy} onChange={()=>bulk.toggle(f.id,f.metaRevision,f.name)}/>{f.mimeType==='image/jpeg'?<img src={fileHref(f.id)} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg bg-[#f3f8fb] object-cover"/>:<FileTypeIcon mimeType={f.mimeType}/>}
  <div className="min-w-0 flex-1"><a data-organizer-file-name href={fileHref(f.id)} download={f.name} className="block break-words font-semibold underline">{f.name}</a>
   <p className="text-xs text-[#52627a]">{proDocKindLabel(f.mimeType,en)} · {proFileSize(f.sizeBytes,en)} · {stamp(f.createdAt,en)}{f.name!==f.originalName?' · '+t('Original: ','Original: ')+f.originalName:''}{f.publishedAt?' · '+t('Compartido con el cliente','Shared with the customer'):''}</p>
   {view==='trash'&&f.restoreUntil&&<p className="text-xs text-[#52627a]">{t('Se puede restaurar hasta el ','Can be restored until ')+day(f.restoreUntil,en)}</p>}</div></div>
  <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{view==='trash'?<><Button type="button" variant="secondary" disabled={busy} onClick={()=>void mutate({action:'restore_file',subjectId:f.id,revision:f.metaRevision},t('Archivo restaurado.','File restored.'))}>{t('Restaurar','Restore')}</Button>
    <Button type="button" variant="outline" disabled={busy} onClick={()=>void purge('file',f.id,f.metaRevision,f.name)}>{t('Eliminar definitivamente','Delete permanently')}</Button></>:<>
   {previewable&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>setPreview(target)}>{t('Ver','View')}</Button>}
   <FileConvertButton scope="work" workId={workId} fileId={f.id} mimeType={f.mimeType} disabled={busy} onDone={()=>{window.dispatchEvent(new Event('contratacr:work-files-changed'));void load();}}/>
   {typeof f.sha256==='string'&&<Button type="button" variant="outline" data-annotate-open={f.id} disabled={busy} onClick={()=>setAnnotate({...target,id:f.id})}>{t('Anotar','Annotate')}</Button>}
   <Button type="button" variant="outline" className="h-11 w-11 p-0" aria-pressed={f.favorite} aria-label={f.favorite?t(`Quitar ${f.name} de favoritos`,`Remove ${f.name} from favorites`):t(`Marcar ${f.name} como favorito`,`Mark ${f.name} as favorite`)} disabled={busy} onClick={()=>void mutate({action:'favorite_file',subjectId:f.id,revision:f.metaRevision,on:!f.favorite})}><Star aria-hidden className={'h-4 w-4 '+(f.favorite?'fill-[#f2b705] text-[#c58a00]':'')}/></Button>
   <Button type="button" variant="outline" disabled={busy} aria-label={t(`Enviar ${f.name} a la papelera`,`Move ${f.name} to trash`)} onClick={()=>void mutate({action:'trash_file',subjectId:f.id,revision:f.metaRevision},t('Archivo enviado a la papelera.','File moved to the trash.'))}><Trash2 aria-hidden className="h-4 w-4"/></Button>
   {menu(t(`Opciones de ${f.name}`,`Options for ${f.name}`),<>
    <Button type="button" variant="ghost" className="justify-start" disabled={busy} onClick={()=>{setDialog({kind:'rename_file',id:f.id,name:f.name,revision:f.metaRevision});setDialogValue(f.name);}}>{t('Renombrar','Rename')}</Button>
    <Button type="button" variant="ghost" className="justify-start" disabled={busy} onClick={()=>{setDialog({kind:'move_file',id:f.id,revision:f.metaRevision});setDialogValue(f.folderId??'');}}>{t('Mover','Move')}</Button>
    <Button asChild variant="ghost" className="justify-start"><a href={fileHref(f.id)} download={f.name}>{t('Descargar','Download')}</a></Button></>)}</>}</div>
 </li>;};
 const dialogTitle=!dialog?'':dialog.kind==='new_folder'?t('Nueva carpeta','New folder'):dialog.kind.startsWith('rename')?t('Renombrar','Rename'):t('Mover a','Move to');
 async function submitDialog(){
  if(!dialog)return;let ok=false;
  if(dialog.kind==='new_folder')ok=await mutate({action:'create_folder',folderId:crypto.randomUUID(),parentId:folder,name:dialogValue.trim()},t('Carpeta creada.','Folder created.'));
  else if(dialog.kind==='rename_folder'||dialog.kind==='rename_file')ok=await mutate({action:dialog.kind,subjectId:dialog.id,revision:dialog.revision,name:dialogValue.trim()},t('Nombre guardado.','Name saved.'));
  else ok=await mutate({action:dialog.kind,subjectId:dialog.id,revision:dialog.revision,targetId:dialogValue||null},t('Movido.','Moved.'));
  if(ok)setDialog(null);
 }
 const quota=page?.quota,used=quota?Math.min(1,quota.usedBytes/quota.limitBytes):0;
 if(!user)return null;
 return <section data-work-file-organizer aria-label={t('Archivos del trabajo','Job files')} className="min-w-0 space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold">{t('Archivos del trabajo','Job files')}</h3>
   {view==='folder'&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>{setDialog({kind:'new_folder'});setDialogValue('');}}>{t('Nueva carpeta','New folder')}</Button>}</div>
  {view!=='trash'&&<ProDropZone onFiles={addFiles} label={t('Subir archivos','Upload files')} hint={undefined}>
   <p className="mt-2 text-xs text-[#52627a]">{view==='folder'&&folder?t('Se guardan en la carpeta abierta.','They are saved in the open folder.'):t('Se guardan en Inicio (sin carpeta).','They are saved in Home (no folder).')}</p></ProDropZone>}
  <ProUploadList queue={queue} marker="data-organizer-upload-progress"/>
  {quota&&<div data-file-quota className="space-y-1"><div className="flex flex-wrap justify-between gap-2 text-xs text-[#52627a]"><span>{t('Espacio usado por la cuenta (trabajos y biblioteca)','Space used by the account (jobs and library)')}</span><span>{proFileSize(quota.usedBytes,en)} / {proFileSize(quota.limitBytes,en)}</span></div><progress aria-label={t('Espacio usado','Space used')} className="block h-1.5 w-full accent-[#009FD9]" max={100} value={Math.round(used*100)}/></div>}
  <div className="flex flex-wrap items-center gap-2">{tab('folder',t('Carpetas','Folders'))}{tab('favorites',t('Favoritos','Favorites'))}{tab('trash',t('Papelera','Trash')+(page?.trashCount?` (${page.trashCount})`:''))}
   <form role="search" className="flex min-w-0 flex-1 basis-full gap-2 sm:min-w-56 sm:basis-56" onSubmit={event=>{event.preventDefault();setQuery(q.trim());setView('search');setFolder(null);}}><input type="search" aria-label={t('Buscar archivos','Search files')} placeholder={t('Buscar archivos','Search files')} value={q} maxLength={80} onChange={e=>setQ(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#d7e1ea] px-3"/><Button type="submit" variant="secondary" disabled={busy||!q.trim()}>{t('Buscar','Search')}</Button></form>
   <label className="flex items-center gap-2 text-sm font-semibold">{t('Ordenar','Sort')}<select aria-label={t('Ordenar archivos','Sort files')} value={sort} onChange={e=>setSort(e.target.value as Sort)} className="min-h-11 rounded-xl border border-[#d7e1ea] bg-white px-2 font-normal"><option value="recent">{t('Más recientes','Newest')}</option><option value="oldest">{t('Más antiguos','Oldest')}</option><option value="name">{t('Nombre (A-Z)','Name (A-Z)')}</option><option value="size">{t('Tamaño (mayor primero)','Size (largest first)')}</option></select></label></div>
  {view==='folder'&&<nav aria-label={t('Ubicación','Location')} className="flex flex-wrap items-center gap-1 text-sm"><button type="button" data-drop-folder="" onDragOver={onDragOverFolder} onDragLeave={onDragLeaveFolder} onDrop={onDropFolder} data-drop-target={dropTarget==='root'?'':undefined} className={'flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold text-[#008bb5] underline '+(dropTarget==='root'?'bg-[#e8f6fc]':'')} onClick={()=>setFolder(null)}><FolderOpen aria-hidden className="h-4 w-4"/>{t('Inicio','Home')}</button>{crumbs.map(c=><span key={c.id} className="flex items-center gap-1"><span aria-hidden>/</span><button type="button" data-drop-folder={c.id} onDragOver={onDragOverFolder} onDragLeave={onDragLeaveFolder} onDrop={onDropFolder} className="min-h-11 rounded-lg px-2 font-semibold text-[#008bb5] underline" aria-current={c.id===folder?'page':undefined} onClick={()=>setFolder(c.id)}>{c.name}</button></span>)}</nav>}
  {view==='folder'&&files.length>0&&<p className="hidden text-xs text-[#52627a] lg:block">{t('Consejo: arrastre un archivo sobre una carpeta (o sobre "Inicio") para moverlo.','Tip: drag a file onto a folder (or onto "Home") to move it.')}</p>}
  {view==='trash'&&<p data-organizer-retention className="rounded-xl bg-[#fff7e6] p-3 text-sm text-[#6b4e00]">{t('Los elementos de la papelera se pueden restaurar durante 30 días. Lo que ya compartió con el cliente sigue compartido. "Eliminar definitivamente" borra el archivo para siempre.','Items in the trash can be restored for 30 days. Anything already shared with the customer stays shared. "Delete permanently" erases the file forever.')}</p>}
  {view==='trash'&&<FilePurgePanel scope="work" workId={workId} onDone={()=>void load()}/>}
  {files.length>0&&<FileBulkBar bulk={bulk} scope="work" view={view==='trash'?'trash':'active'} all={files.map(f=>({id:f.id,revision:f.metaRevision,name:f.name}))} folders={folderOptions()} onSelectAll={()=>bulk.replace(files.map(f=>({id:f.id,revision:f.metaRevision,name:f.name})))}/>}
  {notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {!page?(failed?<div role="alert" className="space-y-2"><p>{t('No se pudieron cargar los archivos.','Could not load the files.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>:<p role="status">{t('Cargando archivos…','Loading files…')}</p>)
   :folders.length+files.length===0?<p className="rounded-xl bg-[#f3f8fb] p-4 text-sm text-[#52627a]">{view==='trash'?t('La papelera está vacía.','The trash is empty.'):view==='favorites'?t('Todavía no hay favoritos.','No favorites yet.'):view==='search'?t('No hay archivos con ese nombre.','No files with that name.'):t('Esta carpeta está vacía. Suba archivos o cree una carpeta.','This folder is empty. Upload files or create a folder.')}</p>
   :<ul className="space-y-2">{folders.map(folderItem)}{files.map(fileItem)}</ul>}
  {preview&&<ProFilePreview target={preview} onClose={()=>setPreview(null)}/>}
  {annotate&&<FileAnnotations scope="work" workId={workId} file={annotate} onClose={()=>setAnnotate(null)}/>}
  {dialog&&<Modal title={dialogTitle} ariaLabel={dialogTitle} onClose={()=>{if(!busy)setDialog(null);}} closeLabel={t('Cerrar','Close')} mobilePresentation="center"
   footer={<><Button type="button" variant="secondary" disabled={busy} onClick={()=>setDialog(null)}>{t('Cancelar','Cancel')}</Button><Button type="button" disabled={busy||(dialog.kind==='new_folder'||dialog.kind.startsWith('rename'))&&!dialogValue.trim()} onClick={()=>void submitDialog()}>{busy?t('Guardando…','Saving…'):t('Guardar','Save')}</Button></>}>
   <form onSubmit={event=>{event.preventDefault();void submitDialog();}} className="space-y-3">
    {dialog.kind==='new_folder'||dialog.kind.startsWith('rename')?<label className="block text-sm font-semibold">{t('Nombre','Name')}<input autoFocus aria-label={t('Nombre','Name')} maxLength={dialog.kind==='rename_file'?160:80} value={dialogValue} onChange={e=>setDialogValue(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] px-3"/></label>
     :<label className="block text-sm font-semibold">{t('Carpeta de destino','Destination folder')}<select aria-label={t('Carpeta de destino','Destination folder')} value={dialogValue} onChange={e=>setDialogValue(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3"><option value="">{t('Inicio (sin carpeta)','Home (no folder)')}</option>{folderOptions(dialog.kind==='move_folder'?dialog.id:undefined).map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>}
    {dialog.kind==='rename_file'&&<p className="text-xs text-[#52627a]">{t('La extensión se conserva. El archivo original no cambia.','The extension is kept. The original file does not change.')}</p>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   </form>
  </Modal>}
  {dialogNode}
 </section>;
}
