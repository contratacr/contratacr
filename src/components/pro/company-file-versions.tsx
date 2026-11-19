'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {ProModal} from './modal';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {ProFileInput} from './pro-file-input';
import {companyFileFamilySchema,companyFileVersionIndexSchema,companyFileVersionResultSchema,type CompanyFileFamily,type CompanyFileVersion,type CompanyFileVersionMutation} from '@/lib/pro/company-file-versions';
import {companyFileResultSchema,type CompanyFile} from '@/lib/pro/company-files';
import {WORK_FILE_MAX_BYTES} from '@/lib/pro/work-files';
import {readWorkFileBinary} from '@/lib/pro/work-file-recovery';
import {saveFile} from '@/lib/file-download';

/**
 * Versions of a company library file (row 30). Upload a new version (same upload route and
 * checks as the library), see the history and restore an older version as current. Private:
 * nothing is shared with customers; «Usar en trabajo» keeps copying the current version.
 */
const api='/api/pro/company-file-versions',library='/api/pro/company-files';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal text-[#162543]';
type Pending={kind:'upload';body:string;fileId:string}|{kind:'version';input:CompanyFileVersionMutation};
function copy(en:boolean){
 return en?{
  title:'Versions',loading:'Loading versions…',loadError:'Could not load the versions.',retry:'Retry',close:'Close',current:'Current',
  kind:{original:'Original',upload:'New version',restore:'Restored'},restoredFrom:(n:number)=>`from version ${n}`,version:(n:number)=>`Version ${n}`,
  upload:'Upload a new version',file:'File',note:'Note (optional)',save:'Save as current version',saving:'Saving…',download:'Download',restore:'Restore as current',
  help:'The new version becomes the one listed in the library and used in jobs. Older versions stay available here. Nothing is shared with customers.',
  invalid:'Choose a JPG, PNG, WebP or PDF up to 20 MB.',uploaded:'New version saved as current.',restored:(n:number)=>`Version ${n} is current again (saved as a new version).`,
  changed:'Versions changed meanwhile. Refreshed; try again.',failed:'Could not save the version. Check the file and try again.',uncertain:'Could not confirm. Retry: it is not duplicated.',
  attachFailed:'The file was uploaded but not added as a version yet. Retry to add it.',downloadFailed:'Could not download this version. Try again.',
  confirmRestore:(n:number)=>`Restore version ${n}?`,confirmRestoreText:'It becomes the current version as a new entry. No version is deleted.',cancel:'Cancel',
  size:(kb:number)=>`${kb} KB`,
 }:{
  title:'Versiones',loading:'Cargando versiones…',loadError:'No se pudieron cargar las versiones.',retry:'Reintentar',close:'Cerrar',current:'Vigente',
  kind:{original:'Original',upload:'Versión nueva',restore:'Restaurada'},restoredFrom:(n:number)=>`desde la versión ${n}`,version:(n:number)=>`Versión ${n}`,
  upload:'Subir una versión nueva',file:'Archivo',note:'Nota (opcional)',save:'Guardar como versión vigente',saving:'Guardando…',download:'Descargar',restore:'Restaurar como vigente',
  help:'La versión nueva pasa a ser la que se muestra en la biblioteca y se usa en los trabajos. Las anteriores siguen disponibles aquí. No se comparte nada con clientes.',
  invalid:'Use un JPG, PNG, WebP o PDF de hasta 20 MB.',uploaded:'Versión nueva guardada como vigente.',restored:(n:number)=>`La versión ${n} vuelve a ser la vigente (se guardó como versión nueva).`,
  changed:'Las versiones cambiaron mientras tanto. Ya se actualizaron; vuelva a intentarlo.',failed:'No se pudo guardar la versión. Revise el archivo y vuelva a intentarlo.',uncertain:'No se pudo confirmar. Reintente: no se duplica.',
  attachFailed:'El archivo se subió, pero todavía no se agregó como versión. Reintente para agregarlo.',downloadFailed:'No se pudo descargar esta versión. Reintente.',
  confirmRestore:(n:number)=>`¿Restaurar la versión ${n}?`,confirmRestoreText:'Pasa a ser la vigente como una entrada nueva. No se borra ninguna versión.',cancel:'Cancelar',
  size:(kb:number)=>`${kb} KB`,
 };
}
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
function readBase64(file:File){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const value=String(reader.result??''),comma=value.indexOf(',');if(comma>0)resolve(value.slice(comma+1));else reject(Error('empty'));};reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});}

export function CompanyFileVersions({actor,file,en,onClose,onChanged}:{actor:string;file:CompanyFile;en:boolean;onClose:()=>void;onChanged:()=>void}){
 const c=copy(en),{confirm,dialogNode}=useAppDialog();
 const [family,setFamily]=useState<CompanyFileFamily|null>(null),[loadError,setLoadError]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [chosen,setChosen]=useState<File|null>(null),[note,setNote]=useState(''),[retryable,setRetryable]=useState(false),[inputKey,setInputKey]=useState(0);
 const pending=useRef<Pending|null>(null),sequence=useRef(0),headers={'X-Pro-Expected-Actor':actor};
 const load=useCallback(async(fileId:string)=>{
  const id=++sequence.current;setLoadError(false);
  try{const response=await fetch(api+'?'+new URLSearchParams({fileId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!response.ok)throw Error();const body=companyFileFamilySchema.parse(await response.json());if(id===sequence.current)setFamily(body);}
  catch{if(id===sequence.current)setLoadError(true);}
 },[actor]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(file.id),0);return()=>{invalidate();clearTimeout(timer);};},[file.id,load,invalidate]);
 async function mutate(input:CompanyFileVersionMutation){
  pending.current={kind:'version',input};
  const response=await fetch(api,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(input)});
  if(response.status>=500)throw Object.assign(Error('uncertain'),{uncertain:true});
  if(!response.ok){pending.current=null;if(response.status===409){await load(input.fileId);throw Error(c.changed);}throw Error(input.action==='add_version'?c.attachFailed:c.failed);}
  const body=companyFileVersionResultSchema.parse(await response.json());pending.current=null;setFamily(body.family);onChanged();return body;
 }
 async function run(task:()=>Promise<void>){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{await task();setRetryable(false);}
  catch(cause){const uncertain=(cause as {uncertain?:boolean}).uncertain||cause instanceof TypeError;setRetryable(!!uncertain||pending.current?.kind==='version');setError(uncertain?c.uncertain:(cause as Error).message||c.failed);}
  finally{setBusy(false);}
 }
 async function uploadAndAttach(){
  if(!family||!chosen)return;
  const current=family.versions.find(v=>v.current)!,newFileId=crypto.randomUUID();
  const body=JSON.stringify({action:'upload',actionId:crypto.randomUUID(),fileId:newFileId,folderId:file.folderId,name:chosen.name.slice(0,160),data:await readBase64(chosen)});
  pending.current={kind:'upload',body,fileId:newFileId};await finishUpload(body,newFileId,current.file.id,family.revision);
 }
 async function finishUpload(body:string,newFileId:string,currentFileId:string,revision:number){
  const response=await fetch(library,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body});
  if(response.status>=500)throw Object.assign(Error('uncertain'),{uncertain:true});
  if(!response.ok){pending.current=null;throw Error(response.status===400?c.invalid:c.failed);}
  const uploaded=companyFileResultSchema.parse(await response.json());if(uploaded.action!=='upload'||uploaded.file.id!==newFileId)throw Error(c.failed);
  await mutate({action:'add_version',actionId:crypto.randomUUID(),fileId:currentFileId,newFileId,note:note.trim()||null,revision});
  setChosen(null);setNote('');setInputKey(k=>k+1);setNotice(c.uploaded);
 }
 function retry(){
  const last=pending.current;if(!last||!family)return;
  void run(async()=>{if(last.kind==='upload')await finishUpload(last.body,last.fileId,family.currentFileId,family.revision);else{await mutate(last.input);setNotice(last.input.action==='restore'?c.restored(last.input.version):c.uploaded);}});
 }
 async function restore(version:CompanyFileVersion){
  if(!family||!(await confirm({title:c.confirmRestore(version.version),description:c.confirmRestoreText,confirmLabel:c.restore,cancelLabel:c.cancel})).confirmed)return;
  void run(async()=>{await mutate({action:'restore',actionId:crypto.randomUUID(),fileId:family.currentFileId,version:version.version,note:null,revision:family.revision});setNotice(c.restored(version.version));});
 }
 async function download(version:CompanyFileVersion){
  if(busy)return;setBusy(true);setError('');
  try{const response=await fetch(library+'?'+new URLSearchParams({view:'binary',fileId:version.file.id}),{cache:'no-store',headers}),bytes=await readWorkFileBinary(response,version.file);await saveFile(new Blob([bytes],{type:version.file.mimeType}),version.file.name);}
  catch{setError(c.downloadFailed);}finally{setBusy(false);}
 }
 return <ProModal open title={c.title} ariaLabel={c.title} closeLabel={c.close} mobilePresentation="fullscreen" onClose={()=>{if(!busy)onClose();}}>
  {dialogNode}
  <div data-company-file-versions className="min-w-0 space-y-4">
   <p className="break-words font-semibold">{family?family.versions.find(v=>v.current)?.file.name:file.name}</p>
   {notice&&<p role="status" data-company-file-versions-notice className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
   {error&&<div role="alert" data-company-file-versions-error className="space-y-2 rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]"><p>{error}</p>{retryable&&<Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={retry}>{c.retry}</Button>}</div>}
   {!family?(loadError?<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button type="button" variant="outline" className="min-h-11" onClick={()=>void load(file.id)}>{c.retry}</Button></div>:<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>)
   :<>
    <section className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-[#f7f9fc] p-4">
     <h3 className="font-semibold">{c.upload}</h3>
     <label className="block text-sm font-semibold">{c.file}<ProFileInput key={inputKey} aria-label={c.file} accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy||!!file.archived} className="mt-1" onChange={event=>{const value=event.target.files?.[0]??null;setError('');setNotice('');if(value&&(value.size<=0||value.size>WORK_FILE_MAX_BYTES||!['image/jpeg','image/png','image/webp','application/pdf'].includes(value.type))){setError(c.invalid);setChosen(null);event.target.value='';return;}setChosen(value);}}/></label>
     <label className="block text-sm font-semibold">{c.note}<input className={field} maxLength={500} value={note} disabled={busy} onChange={event=>setNote(event.target.value)}/></label>
     <p className="text-xs text-[#52627a]">{c.help}</p>
     <Button type="button" className="min-h-11" data-company-file-version-save disabled={busy||!chosen||!!file.archived} onClick={()=>void run(uploadAndAttach)}>{busy?c.saving:c.save}</Button>
    </section>
    <ol className="space-y-3" aria-label={c.title}>{family.versions.map(v=><li key={v.version} data-company-file-version={v.version} data-current={v.current?'true':'false'} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] p-3">
     <div className="flex flex-wrap items-center gap-2"><strong>{c.version(v.version)}</strong><span className="text-sm text-[#52627a]">{c.kind[v.kind]}{v.restoredFrom?' '+c.restoredFrom(v.restoredFrom):''}</span>{v.current&&<span className="inline-flex min-h-7 items-center rounded-full bg-[#e6f6fb] px-2.5 text-xs font-semibold text-[#006c8f]">{c.current}</span>}</div>
     <p className="break-words text-sm">{v.file.name} · {v.file.mimeType==='application/pdf'?'PDF':(en?'Photo':'Foto')} · {c.size(Math.ceil(v.file.sizeBytes/1024))}</p>
     <p className="text-xs text-[#52627a]">{stamp(v.createdAt,en)}</p>
     {v.note&&<p className="whitespace-pre-wrap break-words text-sm">{v.note}</p>}
     <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={()=>void download(v)}>{c.download}</Button>
      {!v.current&&v.file.id!==family.currentFileId&&!file.archived&&<Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={()=>void restore(v)}>{c.restore}</Button>}</div>
    </li>)}</ol>
   </>}
  </div>
 </ProModal>;
}

/** Current version number of the listed files that have versions (badge in the library list). */
export function useCompanyFileVersionBadges(actor:string,fileIds:string[]){
 const [badges,setBadges]=useState<Record<string,number>>({}),joined=fileIds.join(',');
 useEffect(()=>{
  let cancelled=false;const ids=joined?joined.split(','):[];
  const timer=setTimeout(async()=>{
   const next:Record<string,number>={};
   try{
    for(let start=0;start<ids.length;start+=20){
     const response=await fetch(api+'?'+new URLSearchParams({files:ids.slice(start,start+20).join(',')}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!response.ok)return;
     for(const row of companyFileVersionIndexSchema.parse(await response.json()))next[row.fileId]=row.currentVersion;
    }
    if(!cancelled)setBadges(next);
   }catch{/* badges are optional */}
  },0);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[actor,joined]);
 return badges;
}
