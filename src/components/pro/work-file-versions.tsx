'use client';
import {proFileSize} from '@/lib/pro/file-size';
import {ProFileInput} from './pro-file-input';
import {useCallback,useEffect,useId,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {storedPhotoNotice,type WorkFile,type SharedWorkFile} from '@/lib/pro/work-files';
import {WORK_FILE_UPLOAD_LIMIT,createWorkFileUpload,continueWorkFileWrite,type WorkFileStore,type WorkFileWrite} from '@/lib/pro/work-file-recovery';
import {FILE_COMMENT_MAX,FILE_VERSION_NOTE_MAX,clientFileCommentResultSchema,clientFileDiscussionSchema,compareFileVersions,fileCommentDetailSchema,fileCommentPageSchema,
 fileFamilySchema,fileVersionIndexSchema,fileVersionMutationResultSchema,type ClientFileDiscussion,type FileComment,type FileCommentDetail,type FileCommentPage,
 type FileFamily,type FileVersion,type FileVersionIndex} from '@/lib/pro/file-versions';
/* Fila 30: versions and per-file discussion inside Archivos del trabajo. Bytes keep using
   /api/pro/work-files (upload, download and explicit publish); this module only links files
   into versions and keeps the comment threads. Nothing is sent: no e-mail, push or message. */
const api='/api/pro/file-versions',filesApi='/api/pro/work-files';
type State={dirty:boolean;busy:boolean};type IndexItem=FileVersionIndex['items'][number];
const size=(value:number,en=false)=>proFileSize(value,en);
const when=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
const field='mt-1 block w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-sm text-[#162543] focus:border-[#008bb5] focus:outline-none focus:ring-2 focus:ring-[#008bb5]/30';
class HttpError extends Error{constructor(readonly status:number){super('http '+status);}}
async function send(accountId:string,body:unknown){
 const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(body)});
 if(!response.ok)throw new HttpError(response.status);return response.json() as Promise<unknown>;
}
async function read(accountId:string,params:Record<string,string>){
 const response=await fetch(api+'?'+new URLSearchParams(params),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});
 if(!response.ok)throw new HttpError(response.status);return response.json() as Promise<unknown>;
}
function failure(cause:unknown,en:boolean){
 const status=cause instanceof HttpError?cause.status:0;
 if(status===409)return en?'Someone changed this file in the meantime. The list was refreshed; review it and try again.':'El archivo cambió mientras tanto. Se actualizó la lista; revísela y vuelva a intentarlo.';
 if(status===429)return en?'Limit reached. Wait a moment or archive older items.':'Se alcanzó el límite. Espere un momento o archive elementos anteriores.';
 if(status===400||status===413)return en?'Check the text and try again.':'Revise el texto y vuelva a intentarlo.';
 if(status===403||status===404)return en?'This file is no longer available to you.':'Este archivo ya no está disponible para usted.';
 return en?'Could not confirm the change. Retry the same action.':'No se pudo confirmar el cambio. Reintente la misma acción.';
}

/** One request per page of the Archivos list: version badges and comment counts. */
export function useWorkFileVersionIndex(accountId:string,workId:string,files:WorkFile[]|null|undefined){
 const key=(files??[]).filter(file=>file.ready).map(file=>file.id).slice(0,20).join(',');
 const [items,setItems]=useState<Map<string,IndexItem>>(()=>new Map()),sequence=useRef(0);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 const reload=useCallback(async()=>{
  const id=++sequence.current;if(!key){setItems(new Map());return;}
  try{const body=fileVersionIndexSchema.parse(await read(accountId,{workId,index:key}));if(id===sequence.current)setItems(new Map(body.items.map(item=>[item.fileId,item])));}
  catch{if(id===sequence.current)setItems(new Map());}
 },[accountId,workId,key]);
 useEffect(()=>{const timer=setTimeout(()=>void reload(),0);return()=>{clearTimeout(timer);invalidate();};},[reload,invalidate]);
 return{items,reload};
}

/** Badge + «Versiones y comentarios» button for one file card; opens the panel below it. */
export function WorkFileVersionsEntry({accountId,workId,file,files,index,openId,onOpen,blocked,onChanged,onStateChange}:{accountId:string;workId:string;file:WorkFile;files:WorkFile[];
 index:Map<string,IndexItem>;openId:string|null;onOpen:(id:string|null)=>void;blocked:boolean;onChanged:()=>void;onStateChange:(state:State)=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,panelId=useId(),item=index.get(file.id),open=openId===file.id;
 if(!file.ready)return null;
 const comments=(item?.teamComments??0)+(item?.clientComments??0);
 const candidates=files.filter(other=>other.ready&&other.id!==file.id&&!index.has(other.id));
 return <div data-work-file-versions-entry className="min-w-0 space-y-3 border-t border-[#eef2f6] pt-3">
  <div className="flex min-w-0 flex-wrap items-center gap-2">
   {item&&item.versionCount>1&&<span data-version-badge className={`rounded-md px-2 py-0.5 text-xs font-semibold ${item.current?'bg-[#e6f6fb] text-[#006e8f]':'bg-[#f1f3f6] text-[#52627a]'}`}>
    {item.current?t(`Versión ${item.versionNo} · vigente`,`Version ${item.versionNo} · current`):t(`Versión anterior (v${item.versionNo}; vigente: v${item.currentVersionNo})`,`Earlier version (v${item.versionNo}; current: v${item.currentVersionNo})`)}</span>}
   <Button type="button" variant="secondary" className="min-h-11" aria-expanded={open} aria-controls={panelId} disabled={blocked||openId!==null&&!open}
    onClick={()=>onOpen(open?null:file.id)}>{open?t('Cerrar versiones','Close versions'):comments?t(`Versiones y comentarios (${comments})`,`Versions and comments (${comments})`):t('Versiones y comentarios','Versions and comments')}</Button>
  </div>
  {open&&<div id={panelId}><VersionsPanel accountId={accountId} workId={workId} file={file} candidates={candidates} onClose={()=>onOpen(null)} onChanged={onChanged} onStateChange={onStateChange}/></div>}
 </div>;
}

function memoryStore():WorkFileStore{let value:WorkFileWrite|null=null;return{read:async()=>value,advance:async next=>{value=next;},remove:async()=>{value=null;}};}

function VersionsPanel({accountId,workId,file,candidates,onClose,onChanged,onStateChange}:{accountId:string;workId:string;file:WorkFile;candidates:WorkFile[];onClose:()=>void;onChanged:()=>void;onStateChange:(state:State)=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,{confirm,dialogNode}=useAppDialog(),headingId=useId();
 const [family,setFamily]=useState<FileFamily|null>(null),[loadError,setLoadError]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [picked,setPicked]=useState<File|null>(null),[existing,setExisting]=useState(''),[note,setNote]=useState(''),[threadDirty,setThreadDirty]=useState(false),[compare,setCompare]=useState<[number,number]|null>(null),[pickerKey,setPickerKey]=useState(0);
 const attach=useRef<{newFileId:string;actionId:string;payload:string}|null>(null),uploadId=useRef<string|null>(null),pendingAction=useRef<{key:string;actionId:string}|null>(null),alive=useRef(true),lock=useRef(false);
 const dirty=!!picked||!!existing||note.trim().length>0||threadDirty;
 useEffect(()=>{onStateChange({dirty,busy});},[dirty,busy,onStateChange]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;onStateChange({dirty:false,busy:false});};},[onStateChange]);
 const load=useCallback(async()=>{
  try{const body=fileFamilySchema.parse(await read(accountId,{workId,fileId:file.id}));if(body.workId!==workId)throw Error();if(alive.current){setFamily(body);setLoadError(false);}}
  catch{if(alive.current)setLoadError(true);}
 },[accountId,workId,file.id]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 /** Same intent -> same actionId (idempotent retry); a new intent gets a fresh one. */
 const actionFor=(key:string)=>{if(pendingAction.current?.key!==key)pendingAction.current={key,actionId:crypto.randomUUID()};return pendingAction.current.actionId;};
 async function run(work:()=>Promise<void>,success:string){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');
  try{await work();pendingAction.current=null;if(alive.current){setNotice(success);onChanged();}}
  catch(cause){if(cause instanceof HttpError&&cause.status!==503)pendingAction.current=null;if(alive.current){setError(failure(cause,en));if(cause instanceof HttpError&&cause.status===409)await load();}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 async function addVersion(event:FormEvent){
  event.preventDefault();if(!family||busy||!picked&&!existing)return;
  const current=family;
  await run(async()=>{
   let newFileId=existing;
   if(!newFileId){
    const chosen=picked!;
    if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(chosen.type)||chosen.size<1||chosen.size>WORK_FILE_UPLOAD_LIMIT)throw new HttpError(400);
    // Same bytes path as «Adjuntar archivo»: normalization, hash and stored-byte check.
    uploadId.current??=crypto.randomUUID();
    const record=await createWorkFileUpload({accountId,workId},{name:chosen.name,type:chosen.type,bytes:await chosen.arrayBuffer()},uploadId.current);
    const result=await continueWorkFileWrite({attempt:record,store:memoryStore(),request:fetch,currentAccount:()=>alive.current?accountId:undefined,currentWork:()=>alive.current?workId:undefined,onCheckpoint:()=>{}});
    if(result.status==='rejected'){uploadId.current=null;throw new HttpError(400);}
    newFileId=result.file.id;
   }
   const payload={action:'add_version',workId,fileId:current.currentFileId,newFileId,note:note.trim()||null,revision:current.revision},serial=JSON.stringify(payload);
   if(!attach.current||attach.current.payload!==serial)attach.current={newFileId,actionId:crypto.randomUUID(),payload:serial};
   const body=fileVersionMutationResultSchema.parse(await send(accountId,{...payload,actionId:attach.current.actionId}));
   if(!('family' in body))throw Error();attach.current=null;uploadId.current=null;
   if(alive.current){setFamily(body.family);setPicked(null);setExisting('');setNote('');setPickerKey(value=>value+1);}
  },t('Nueva versión guardada de forma privada. El cliente sigue viendo solo lo que usted compartió.','New version saved privately. The customer still sees only what you shared.'));
 }
 async function restore(version:FileVersion){
  if(!family||busy)return;
  const answer=await confirm({title:t(`¿Restaurar la versión ${version.versionNo}?`,`Restore version ${version.versionNo}?`),
   description:t('Se crea una versión nueva con este archivo. No se borra ninguna versión ni cambia lo compartido con el cliente.','A new version is created from this file. No version is deleted and nothing shared with the customer changes.'),
   detail:version.file.name,input:{label:t('Nota del cambio (opcional)','Change note (optional)'),placeholder:t('Por qué se restaura','Why it is restored')},
   confirmLabel:t('Restaurar como vigente','Restore as current'),cancelLabel:t('Cancelar','Cancel')});
  if(!answer.confirmed||!alive.current)return;const current=family,restoreNote=(answer.value??'').trim().slice(0,FILE_VERSION_NOTE_MAX)||null;
  await run(async()=>{
   const payload={action:'restore',workId,fileId:current.currentFileId,versionNo:version.versionNo,note:restoreNote,revision:current.revision};
   const body=fileVersionMutationResultSchema.parse(await send(accountId,{...payload,actionId:actionFor(JSON.stringify(payload))}));
   if(!('family' in body))throw Error();if(alive.current)setFamily(body.family);
  },t(`Versión ${version.versionNo} restaurada como vigente.`,`Version ${version.versionNo} restored as current.`));
 }
 async function share(version:FileVersion){
  if(!family?.canShare||!family.recipientId||!family.recipientName||busy||version.shared)return;
  const answer=await confirm({title:t(`¿Compartir la versión ${version.versionNo}?`,`Share version ${version.versionNo}?`),
   description:family.recipientName+t(' podrá descargar exactamente esta versión desde su cuenta. Las versiones que ya compartió se mantienen. No se envía ningún mensaje.',' will be able to download exactly this version from their account. Versions you already shared remain. No message is sent.'),
   detail:version.file.name,confirmLabel:t('Compartir esta versión','Share this version'),cancelLabel:t('Cancelar','Cancel')});
  if(!answer.confirmed||!alive.current)return;const recipientId=family.recipientId;
  await run(async()=>{
   const payload={action:'publish',workId,fileId:version.fileId,revision:1,recipientId};
   const response=await fetch(filesApi,{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({...payload,actionId:actionFor(JSON.stringify(payload))})});
   if(!response.ok)throw new HttpError(response.status);await load();
  },t(`Versión ${version.versionNo} compartida con el cliente.`,`Version ${version.versionNo} shared with the customer.`));
 }
 const versions=family?.versions??[],sharedVersions=versions.filter(version=>version.shared);
 const left=compare?versions.find(v=>v.versionNo===compare[0]):undefined,right=compare?versions.find(v=>v.versionNo===compare[1]):undefined;
 const pair=left&&right?{left,right,diff:compareFileVersions(left,right)}:null;
 const kind=(version:FileVersion)=>version.kind==='original'?t('Original','Original'):version.kind==='upload'?t('Nueva versión','New version'):t(`Restaurada desde v${version.restoredFrom}`,`Restored from v${version.restoredFrom}`);
 return <section aria-labelledby={headingId} data-work-file-versions className="min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] bg-[#f7f9fc] p-3 sm:p-4">
  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><h5 id={headingId} className="min-w-0 break-words font-bold text-[#162543]">{t('Versiones y comentarios','Versions and comments')}</h5>
   <Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={()=>{if(!dirty)onClose();else void confirm({title:t('¿Descartar cambios?','Discard changes?'),description:t('Lo que ya guardó se conserva.','What you already saved is kept.'),confirmLabel:t('Descartar cambios','Discard changes'),cancelLabel:t('Seguir editando','Keep editing')}).then(answer=>{if(answer.confirmed)onClose();});}}>{t('Cerrar','Close')}</Button></div>
  {notice&&<p role="status" className="text-sm text-[#175b42]">{notice}</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {loadError?<div role="alert" className="space-y-2"><p className="text-sm">{t('No se pudieron cargar las versiones.','Could not load versions.')}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>
  :!family?<p role="status" className="text-sm text-[#52627a]">{t('Cargando versiones…','Loading versions…')}</p>:<>
   <p className="text-sm text-[#52627a]">{t(`Vigente: versión ${family.currentVersionNo} de ${family.versionCount}.`,`Current: version ${family.currentVersionNo} of ${family.versionCount}.`)} {sharedVersions.length?t(`El cliente tiene ${sharedVersions.map(v=>'v'+v.versionNo).join(', ')}.`,`The customer has ${sharedVersions.map(v=>'v'+v.versionNo).join(', ')}.`):t('Ninguna versión está compartida con el cliente.','No version is shared with the customer.')}</p>
   <form data-file-version-form onSubmit={event=>void addVersion(event)} className="min-w-0 space-y-3 rounded-xl border border-[#d7e1ea] bg-white p-3">
    <p className="text-sm font-semibold text-[#162543]">{t('Subir nueva versión','Upload new version')}</p>
    <label className="block text-sm font-semibold">{t('Archivo nuevo','New file')}<ProFileInput key={pickerKey} data-file-version-picker aria-label={t('Archivo nuevo','New file')} accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy||!!existing} onChange={event=>{setPicked(event.target.files?.[0]??null);uploadId.current=null;}} className="mt-1"/>{storedPhotoNotice(picked,en)&&<span data-file-version-converted className="mt-1 block text-xs font-normal text-[#52627a]">{storedPhotoNotice(picked,en)}</span>}</label>
    {candidates.length>0&&<label className="block text-sm font-semibold">{t('O use un archivo ya subido a este trabajo','Or use a file already uploaded to this job')}<select value={existing} disabled={busy||!!picked} onChange={event=>setExisting(event.target.value)} className={field}><option value="">{t('Ninguno','None')}</option>{candidates.map(other=><option key={other.id} value={other.id}>{other.name}</option>)}</select></label>}
    <label className="block text-sm font-semibold">{t('Nota del cambio (opcional)','Change note (optional)')}<textarea value={note} maxLength={FILE_VERSION_NOTE_MAX} rows={2} disabled={busy} onChange={event=>setNote(event.target.value)} className={field}/></label>
    <p className="text-xs text-[#52627a]">{t('Fotos JPG, PNG o WebP (PNG y WebP se guardan como JPG), o PDF de hasta 20 MB. La versión nueva queda privada hasta que la comparta.','JPG, PNG or WebP photos (PNG and WebP are saved as JPG), or PDFs up to 20 MB. The new version stays private until you share it.')}</p>
    <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={busy||!picked&&!existing}>{busy?t('Guardando…','Saving…'):t('Guardar como nueva versión','Save as new version')}</Button>
   </form>
   <ol data-file-version-list aria-label={t('Historial de versiones','Version history')} className="min-w-0 space-y-2">{versions.map(version=><li key={version.versionNo} data-file-version={version.versionNo} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
    <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="font-semibold text-[#162543]">v{version.versionNo}</span><span className="text-xs text-[#52627a]">{kind(version)}</span>
     {version.versionNo===family.currentVersionNo&&<span className="rounded-md bg-[#e6f6fb] px-2 py-0.5 text-xs font-semibold text-[#006e8f]">{t('Vigente','Current')}</span>}
     {version.shared&&<span className="rounded-md bg-[#eaf6ef] px-2 py-0.5 text-xs font-semibold text-[#175b42]">{t('Compartida con el cliente','Shared with customer')}</span>}</div>
    <p className="break-all text-sm">{version.file.name}</p>
    <p className="text-xs text-[#52627a]">{version.file.mimeType==='application/pdf'?'PDF':t('Foto','Photo')} · {size(version.file.sizeBytes,en)} · {when(version.createdAt,en)}</p>
    {version.note&&<p className="whitespace-pre-wrap break-words text-sm text-[#162543]">{version.note}</p>}
    <div className="flex flex-wrap gap-2"><Button asChild variant="secondary" className="min-h-11"><a href={filesApi+'?'+new URLSearchParams({fileId:version.fileId})} download={version.file.name}>{t('Descargar','Download')}<span className="sr-only"> v{version.versionNo}</span></a></Button>
     {version.versionNo!==family.currentVersionNo&&<Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={()=>void restore(version)}>{t('Restaurar como vigente','Restore as current')}<span className="sr-only"> v{version.versionNo}</span></Button>}
     {!version.shared&&family.canShare&&<Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={()=>void share(version)}>{t('Compartir esta versión','Share this version')}<span className="sr-only"> v{version.versionNo}</span></Button>}</div>
   </li>)}</ol>
   {versions.length>1&&<div data-file-version-compare className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
    <p className="text-sm font-semibold">{t('Comparar datos de dos versiones','Compare details of two versions')}</p>
    <div className="grid gap-2 sm:grid-cols-2">{([0,1] as const).map(slot=><label key={slot} className="block text-sm font-semibold">{slot===0?t('Versión A','Version A'):t('Versión B','Version B')}
     <select value={compare?.[slot]??''} onChange={event=>{const value=Number(event.target.value);const base=compare??[versions[1].versionNo,versions[0].versionNo];setCompare(slot===0?[value,base[1]]:[base[0],value]);}} className={field}>
      <option value="" disabled>{t('Elija una versión','Choose a version')}</option>{versions.map(version=><option key={version.versionNo} value={version.versionNo}>v{version.versionNo}</option>)}</select></label>)}</div>
    {pair&&<dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
     <dt className="font-semibold">{t('Nombre','Name')}</dt><dd className="break-all">{pair.diff.sameName?t('Igual','Same'):`${pair.left.file.name} → ${pair.right.file.name}`}</dd>
     <dt className="font-semibold">{t('Tipo','Type')}</dt><dd>{pair.diff.sameType?t('Igual','Same'):t('Distinto','Different')}</dd>
     <dt className="font-semibold">{t('Tamaño','Size')}</dt><dd>{size(pair.left.file.sizeBytes,en)} → {size(pair.right.file.sizeBytes,en)}</dd>
     <dt className="font-semibold">{t('Contenido','Content')}</dt><dd>{pair.diff.sameContent?t('Idéntico (misma huella SHA-256)','Identical (same SHA-256 fingerprint)'):t('Distinto','Different')}</dd>
     <dt className="font-semibold">{t('Fechas','Dates')}</dt><dd>{when(pair.left.createdAt,en)} → {when(pair.right.createdAt,en)}</dd>
     <dt className="font-semibold">{t('Con el cliente','With customer')}</dt><dd>{(pair.left.shared?t('Compartida','Shared'):t('Privada','Private'))+' → '+(pair.right.shared?t('Compartida','Shared'):t('Privada','Private'))}</dd>
    </dl>}
   </div>}
   <Discussion accountId={accountId} workId={workId} family={family} onDirty={setThreadDirty} onChanged={onChanged}/>
  </>}
  {dialogNode}
 </section>;
}

function Discussion({accountId,workId,family,onDirty,onChanged}:{accountId:string;workId:string;family:FileFamily;onDirty:(dirty:boolean)=>void;onChanged:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,{confirm,dialogNode}=useAppDialog(),boxId=useId();
 const sharedVersions=family.versions.filter(version=>version.shared),clientAvailable=sharedVersions.length>0||family.counts.client+family.counts.clientArchived>0;
 const [thread,setThread]=useState<'team'|'client'>('team'),[archived,setArchived]=useState(false),[page,setPage]=useState<FileCommentPage|null>(null),[loadError,setLoadError]=useState(false);
 const [text,setText]=useState(''),[versionNo,setVersionNo]=useState<string>(''),[editing,setEditing]=useState<{id:string;text:string}|null>(null),[history,setHistory]=useState<FileCommentDetail|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),pending=useRef<{key:string;actionId:string;commentId:string}|null>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{onDirty(text.trim().length>0||!!editing);},[text,editing,onDirty]);
 const load=useCallback(async(after?:string)=>{
  try{const body=fileCommentPageSchema.parse(await read(accountId,{workId,fileId:family.familyId,thread,...archived?{archived:'1'}:{},...after?{after}:{}}));
   if(alive.current){setPage(old=>after&&old?{...body,items:[...old.items,...body.items.filter(item=>!old.items.some(prior=>prior.id===item.id))]}:body);setLoadError(false);}}
  catch{if(alive.current)setLoadError(true);}
 },[accountId,workId,family.familyId,thread,archived]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const idsFor=(key:string)=>{if(pending.current?.key!==key)pending.current={key,actionId:crypto.randomUUID(),commentId:crypto.randomUUID()};return pending.current;};
 async function mutate(payload:Record<string,unknown>,after:()=>void){
  if(busy)return;setBusy(true);setError('');
  try{const ids=idsFor(JSON.stringify(payload));const body=fileVersionMutationResultSchema.parse(await send(accountId,{...payload,actionId:ids.actionId,...payload.action==='comment_create'?{commentId:ids.commentId}:{}}));
   if(!('comment' in body))throw Error();pending.current=null;if(alive.current){after();await load();onChanged();}}
  catch(cause){if(cause instanceof HttpError&&cause.status!==503)pending.current=null;if(alive.current){setError(failure(cause,en));if(cause instanceof HttpError&&cause.status===409)await load();}}
  finally{if(alive.current)setBusy(false);}
 }
 function submit(event:FormEvent){
  event.preventDefault();const body=text.trim();if(!body||body.length>FILE_COMMENT_MAX)return;
  const chosen=thread==='client'?Number(versionNo||sharedVersions[0]?.versionNo):versionNo?Number(versionNo):null;
  if(thread==='client'&&!chosen)return;
  void mutate({action:'comment_create',workId,fileId:family.familyId,thread,versionNo:chosen,body},()=>{setText('');});
 }
 async function archive(comment:FileComment){
  if(!comment.archived){const answer=await confirm({title:t('¿Archivar comentario?','Archive comment?'),description:comment.thread==='client'?t('Dejará de verse en la cuenta del cliente. Puede restaurarlo después.','It will no longer show in the customer account. You can restore it later.'):t('Puede restaurarlo después desde Archivados.','You can restore it later from Archived.'),confirmLabel:t('Archivar','Archive'),cancelLabel:t('Cancelar','Cancel')});if(!answer.confirmed)return;}
  void mutate({action:comment.archived?'comment_restore':'comment_archive',workId,commentId:comment.id,revision:comment.revision},()=>{});
 }
 async function showHistory(comment:FileComment){
  try{const body=fileCommentDetailSchema.parse(await read(accountId,{workId,fileId:family.familyId,commentId:comment.id}));if(alive.current)setHistory(body);}catch(cause){if(alive.current)setError(failure(cause,en));}
 }
 const actionLabel={create:t('Creado','Created'),edit:t('Editado','Edited'),archive:t('Archivado','Archived'),restore:t('Restaurado','Restored')};
 const tabs:[('team'|'client'),string][]=[['team',t('Equipo (privado)','Team (private)')],...clientAvailable?[['client',t('Con el cliente','With customer')] as ['client',string]]:[]];
 return <div data-file-discussion className="min-w-0 space-y-3">
  <div role="group" aria-label={t('Comentarios del archivo','File comments')} className="flex flex-wrap gap-2">{tabs.map(([value,label])=><button key={value} type="button" aria-pressed={thread===value} disabled={busy||!!editing||text.trim().length>0}
   onClick={()=>{setThread(value);setArchived(false);setPage(null);setHistory(null);setVersionNo('');}} className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${thread===value?'border-[#008bb5] bg-white text-[#008bb5]':'border-[#d7e1ea] bg-white text-[#52627a] hover:text-[#162543]'}`}>{label}</button>)}</div>
  <p className="text-xs text-[#52627a]">{thread==='team'?t('Solo usted ve estos comentarios. Nunca se muestran al cliente.','Only you see these comments. They are never shown to the customer.'):t('El cliente ve estos comentarios junto a la versión que usted compartió. No se envía ningún aviso.','The customer sees these comments next to the version you shared. No notice is sent.')}</p>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {!archived&&(thread==='team'||sharedVersions.length>0)&&<form data-file-comment-form onSubmit={submit} className="min-w-0 space-y-2">
   <label htmlFor={boxId} className="block text-sm font-semibold">{thread==='team'?t('Nuevo comentario del equipo','New team comment'):t('Nuevo comentario para el cliente','New comment for the customer')}</label>
   <textarea id={boxId} value={text} rows={3} maxLength={FILE_COMMENT_MAX} disabled={busy} onChange={event=>setText(event.target.value)} className={field} aria-describedby={boxId+'-count'}/>
   <div className="flex min-w-0 flex-wrap items-end justify-between gap-2"><span id={boxId+'-count'} className="text-xs text-[#52627a]">{text.trim().length}/{FILE_COMMENT_MAX}</span>
    <label className="block min-w-0 text-sm font-semibold">{t('Sobre la versión','About version')}<select value={thread==='client'?versionNo||String(sharedVersions[0]?.versionNo??''):versionNo} disabled={busy} onChange={event=>setVersionNo(event.target.value)} className={field}>
     {thread==='team'&&<option value="">{t('Archivo en general','File in general')}</option>}{(thread==='team'?family.versions:sharedVersions).map(version=><option key={version.versionNo} value={version.versionNo}>v{version.versionNo}</option>)}</select></label></div>
   <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={busy||!text.trim()}>{t('Publicar comentario','Post comment')}</Button>
  </form>}
  <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="min-h-11" aria-pressed={archived} disabled={busy||!!editing} onClick={()=>{setArchived(!archived);setPage(null);setHistory(null);}}>{archived?t('Ver activos','Show active'):t('Ver archivados','Show archived')}</Button></div>
  {loadError?<div role="alert" className="space-y-2"><p className="text-sm">{t('No se pudieron cargar los comentarios.','Could not load comments.')}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>
  :!page?<p role="status" className="text-sm text-[#52627a]">{t('Cargando comentarios…','Loading comments…')}</p>
  :!page.items.length?<p className="rounded-xl border border-[#d7e1ea] bg-white p-3 text-sm text-[#52627a]">{archived?t('No hay comentarios archivados.','No archived comments.'):t('Todavía no hay comentarios.','No comments yet.')}</p>
  :<ul data-file-comment-list className="min-w-0 space-y-2">{page.items.map(comment=><li key={comment.id} data-file-comment={comment.id} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
   <p className="flex min-w-0 flex-wrap gap-x-2 text-xs text-[#52627a]"><span className="font-semibold text-[#162543]">{comment.authorKind==='client'?t(`Cliente: ${comment.authorName||'—'}`,`Customer: ${comment.authorName||'—'}`):t('Usted','You')}</span><span>{when(comment.createdAt,en)}</span>{comment.versionNo&&<span>v{comment.versionNo}</span>}{comment.edited&&<span>{t('Editado','Edited')}</span>}</p>
   {editing?.id===comment.id?<form onSubmit={event=>{event.preventDefault();const body=editing.text.trim();if(!body||body===comment.body)return;void mutate({action:'comment_edit',workId,commentId:comment.id,body,revision:comment.revision},()=>setEditing(null));}} className="space-y-2">
    <label className="block text-sm font-semibold">{t('Editar comentario','Edit comment')}<textarea value={editing.text} rows={3} maxLength={FILE_COMMENT_MAX} disabled={busy} onChange={event=>setEditing({id:comment.id,text:event.target.value})} className={field}/></label>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={()=>setEditing(null)}>{t('Cancelar','Cancel')}</Button><Button type="submit" className="min-h-11" disabled={busy||!editing.text.trim()||editing.text.trim()===comment.body}>{t('Guardar cambios','Save changes')}</Button></div>
   </form>:<p className="whitespace-pre-wrap break-words text-sm text-[#162543]">{comment.body}</p>}
   {editing?.id!==comment.id&&<div className="flex flex-wrap gap-2">
    {comment.authorKind==='owner'&&!comment.archived&&<Button type="button" variant="secondary" className="min-h-11" disabled={busy||!!editing} onClick={()=>setEditing({id:comment.id,text:comment.body})}>{t('Editar','Edit')}</Button>}
    <Button type="button" variant="secondary" className="min-h-11" disabled={busy||!!editing} onClick={()=>void archive(comment)}>{comment.archived?t('Restaurar','Restore'):t('Archivar','Archive')}</Button>
    {comment.edited&&<Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={()=>void showHistory(comment)}>{t('Ver historial','View history')}</Button>}</div>}
   {history?.comment.id===comment.id&&<div data-file-comment-history className="space-y-2 rounded-xl border border-[#eef2f6] bg-[#f7f9fc] p-2"><p className="text-xs font-semibold">{t('Historial del comentario','Comment history')}</p>
    <ol className="space-y-2">{history.history.map(entry=><li key={entry.actionId} className="min-w-0 text-xs text-[#52627a]"><span className="font-semibold text-[#162543]">{actionLabel[entry.action]}</span> · {when(entry.at,en)}{entry.action==='edit'&&entry.before&&<span className="mt-1 block whitespace-pre-wrap break-words text-[#162543]">{t('Antes: ','Before: ')}{entry.before.body}</span>}</li>)}</ol>
    <Button type="button" variant="secondary" className="min-h-11" onClick={()=>setHistory(null)}>{t('Cerrar historial','Close history')}</Button></div>}
  </li>)}</ul>}
  {page?.nextCursor&&<Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={()=>void load(page.nextCursor!)}>{t('Ver comentarios anteriores','Show earlier comments')}</Button>}
  {dialogNode}
 </div>;
}

/** Customer side: discussion on a version the owner shared explicitly. */
export function AppointmentFileDiscussion({accountId,requestId,file}:{accountId:string;requestId:string;file:SharedWorkFile}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,{confirm,dialogNode}=useAppDialog(),panelId=useId(),boxId=useId();
 const [open,setOpen]=useState(false),[data,setData]=useState<ClientFileDiscussion|null>(null),[loadError,setLoadError]=useState(false),[text,setText]=useState(''),[editing,setEditing]=useState<{id:string;text:string}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),pending=useRef<{key:string;actionId:string;commentId:string}|null>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const load=useCallback(async(after?:string)=>{
  try{const body=clientFileDiscussionSchema.parse(await read(accountId,{requestId,fileId:file.id,...after?{after}:{}}));if(body.fileId!==file.id)throw Error();
   if(alive.current){setData(old=>after&&old?{...body,items:[...old.items,...body.items.filter(item=>!old.items.some(prior=>prior.id===item.id))]}:body);setLoadError(false);}}
  catch{if(alive.current)setLoadError(true);}
 },[accountId,requestId,file.id]);
 useEffect(()=>{if(!open)return;const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[open,load]);
 async function mutate(payload:Record<string,unknown>,after:()=>void){
  if(busy)return;setBusy(true);setError('');
  try{const key=JSON.stringify(payload);if(pending.current?.key!==key)pending.current={key,actionId:crypto.randomUUID(),commentId:crypto.randomUUID()};
   clientFileCommentResultSchema.parse(await send(accountId,{...payload,actionId:pending.current.actionId,...payload.action==='create'?{commentId:pending.current.commentId}:{}}));
   pending.current=null;if(alive.current){after();await load();}}
  catch(cause){if(cause instanceof HttpError&&cause.status!==503)pending.current=null;if(alive.current){setError(failure(cause,en));if(cause instanceof HttpError&&cause.status===409)await load();}}
  finally{if(alive.current)setBusy(false);}
 }
 return <div data-appointment-file-discussion className="min-w-0 space-y-2">
  <Button type="button" variant="secondary" className="min-h-11" aria-expanded={open} aria-controls={panelId} disabled={busy||!!editing||text.trim().length>0} onClick={()=>setOpen(!open)}>{open?t('Ocultar comentarios','Hide comments'):t('Comentarios','Comments')}</Button>
  {open&&<div id={panelId} className="min-w-0 space-y-3 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3">
   {loadError?<div role="alert" className="space-y-2"><p className="text-sm">{t('No se pudieron cargar los comentarios.','Could not load comments.')}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>
   :!data?<p role="status" className="text-sm text-[#52627a]">{t('Cargando comentarios…','Loading comments…')}</p>:<>
    <p className="text-xs text-[#52627a]">{data.sharedVersions.length>1?t(`Esta es la versión ${data.versionNo}. Versiones que le compartieron: ${data.sharedVersions.map(v=>'v'+v.versionNo).join(', ')}.`,`This is version ${data.versionNo}. Versions shared with you: ${data.sharedVersions.map(v=>'v'+v.versionNo).join(', ')}.`):t(`Versión ${data.versionNo}.`,`Version ${data.versionNo}.`)}</p>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {data.canComment&&<form onSubmit={event=>{event.preventDefault();const body=text.trim();if(!body)return;void mutate({action:'create',requestId,fileId:file.id,body},()=>setText(''));}} className="space-y-2">
     <label htmlFor={boxId} className="block text-sm font-semibold">{t('Su comentario sobre este archivo','Your comment on this file')}</label>
     <textarea id={boxId} value={text} rows={3} maxLength={FILE_COMMENT_MAX} disabled={busy} onChange={event=>setText(event.target.value)} className={field}/>
     <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[#52627a]">{text.trim().length}/{FILE_COMMENT_MAX}</span><Button type="submit" className="min-h-11" disabled={busy||!text.trim()}>{t('Enviar comentario','Post comment')}</Button></div>
    </form>}
    {!data.items.length?<p className="text-sm text-[#52627a]">{t('Todavía no hay comentarios.','No comments yet.')}</p>:<ul className="min-w-0 space-y-2">{data.items.map(comment=><li key={comment.id} data-client-file-comment={comment.id} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] bg-white p-3">
     <p className="flex min-w-0 flex-wrap gap-x-2 text-xs text-[#52627a]"><span className="font-semibold text-[#162543]">{comment.mine?t('Usted','You'):comment.authorName||t('Profesional','Professional')}</span><span>{when(comment.createdAt,en)}</span><span>v{comment.versionNo}</span>{comment.edited&&<span>{t('Editado','Edited')}</span>}</p>
     {editing?.id===comment.id?<form onSubmit={event=>{event.preventDefault();const body=editing.text.trim();if(!body||body===comment.body)return;void mutate({action:'edit',requestId,commentId:comment.id,body,revision:comment.revision},()=>setEditing(null));}} className="space-y-2">
      <label className="block text-sm font-semibold">{t('Editar comentario','Edit comment')}<textarea value={editing.text} rows={3} maxLength={FILE_COMMENT_MAX} disabled={busy} onChange={event=>setEditing({id:comment.id,text:event.target.value})} className={field}/></label>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={()=>setEditing(null)}>{t('Cancelar','Cancel')}</Button><Button type="submit" className="min-h-11" disabled={busy||!editing.text.trim()||editing.text.trim()===comment.body}>{t('Guardar cambios','Save changes')}</Button></div>
     </form>:<p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>}
     {comment.mine&&editing?.id!==comment.id&&<div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="min-h-11" disabled={busy||!!editing} onClick={()=>setEditing({id:comment.id,text:comment.body})}>{t('Editar','Edit')}</Button>
      <Button type="button" variant="secondary" className="min-h-11" disabled={busy||!!editing} onClick={()=>void confirm({title:t('¿Quitar su comentario?','Remove your comment?'),description:t('Dejará de verse en esta conversación.','It will no longer show in this conversation.'),confirmLabel:t('Quitar','Remove'),cancelLabel:t('Cancelar','Cancel')}).then(answer=>{if(answer.confirmed)void mutate({action:'archive',requestId,commentId:comment.id,revision:comment.revision},()=>{});})}>{t('Quitar','Remove')}</Button></div>}
    </li>)}</ul>}
    {data.nextCursor&&<Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={()=>void load(data.nextCursor!)}>{t('Ver comentarios anteriores','Show earlier comments')}</Button>}
   </>}
  </div>}
  {dialogNode}
 </div>;
}
