'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {proFileSize} from '@/lib/pro/file-size';
import {BULK_MAX,bulkErrorText,bulkResultSchema,purgeResultSchema,purgeStateSchema,type BulkItemError,type PurgeReceipt,type purgePreviewSchema} from '@/lib/pro/file-bulk';
import type {z} from 'zod';

/**
 * Ronda F2-E (row 29): shared selection bar for bulk operations (job files and company library) and the explicit
 * purge panel (preview, confirmation, receipt). The host screens keep their own lists; this module only owns the
 * selection, the batch request (one idempotent batchId per identical request) and the per-item result messages.
 */
export type BulkScope='work'|'company';
export type BulkRun=(body:Record<string,unknown>,doneText:string)=>Promise<boolean>;
type Failure={id:string;name:string;error:BulkItemError|null|undefined};
const card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-[#f3f8fb] p-4';
const field='min-h-11 min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base';

export function useFileBulk({scope,workId,actor,onDone}:{scope:BulkScope;workId?:string;actor?:string;onDone:()=>void}){
 const en=useLocale()==='en';
 const [selected,setSelected]=useState<Record<string,{revision:number;name:string}>>({}),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[failures,setFailures]=useState<Failure[]>([]);
 const [pending,setPending]=useState<{key:string;id:string}|null>(null);
 const ids=Object.keys(selected);
 const toggle=useCallback((id:string,revision:number,name:string)=>{setSelected(old=>{const next={...old};if(next[id])delete next[id];else if(Object.keys(next).length<BULK_MAX)next[id]={revision,name};return next;});setNotice('');setError('');},[]);
 const clear=useCallback(()=>{setSelected({});setFailures([]);},[]);
 const replace=useCallback((rows:Array<{id:string;revision:number;name:string}>)=>{setSelected(Object.fromEntries(rows.slice(0,BULK_MAX).map(r=>[r.id,{revision:r.revision,name:r.name}])));setNotice('');setError('');},[]);
 const run=useCallback<BulkRun>(async(body,doneText)=>{
  if(busy||ids.length===0)return false;
  const items=ids.map(fileId=>({fileId,revision:selected[fileId].revision})),payload={...body,...scope==='work'?{workId}:{},items};
  const key=JSON.stringify(payload),batchId=pending?.key===key?pending.id:crypto.randomUUID();setPending({key,id:batchId});setBusy(true);setError('');setNotice('');setFailures([]);
  try{
   const r=await fetch(scope==='work'?'/api/pro/work-file-bulk':'/api/pro/company-file-bulk',{method:'POST',headers:{'Content-Type':'application/json',...actor?{'X-Pro-Expected-Actor':actor}:{}},body:JSON.stringify({...payload,batchId})});
   if(r.status===403)throw Error(en?'Only the main account can do this.':'Solo la cuenta principal puede hacerlo.');
   if(!r.ok)throw Error(en?'Could not confirm the change. Retry: it will not be duplicated.':'No se pudo comprobar el cambio. Reintente: no se duplicará.');
   const result=bulkResultSchema.parse(await r.json());setPending(null);
   const bad=result.items.filter(i=>!i.ok).map(i=>({id:i.fileId,name:selected[i.fileId]?.name??'',error:i.error}));
   setFailures(bad);setSelected(Object.fromEntries(bad.flatMap(f=>selected[f.id]?[[f.id,selected[f.id]]]:[])));
   setNotice(bad.length?(en?`${result.ok} done, ${bad.length} not done.`:`${result.ok} listos, ${bad.length} sin completar.`):doneText);
   onDone();return bad.length===0;
  }catch(failure){setError(failure instanceof Error&&failure.message?failure.message:(en?'Could not confirm the change.':'No se pudo comprobar el cambio.'));return false;}
  finally{setBusy(false);}
 },[actor,busy,en,ids,onDone,pending,scope,selected,workId]);
 return{selected,ids,toggle,clear,replace,run,busy,notice,error,failures};
}

export function FileBulkBar({bulk,scope,view,all,folders,onPickFolder,onSelectAll}:{bulk:ReturnType<typeof useFileBulk>;scope:BulkScope;view:'active'|'trash';all:Array<{id:string;revision:number;name:string}>;folders?:Array<{id:string;label:string}>;onPickFolder?:()=>void;onSelectAll?:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,{confirm,dialogNode}=useAppDialog();
 const [target,setTarget]=useState(''),[tags,setTags]=useState('');
 const n=bulk.ids.length,noun=n===1?t('archivo','file'):t('archivos','files'),count=n===1?'1':String(n);
 if(all.length===0&&n===0&&!bulk.notice&&!bulk.error&&bulk.failures.length===0)return null;
 const parsedTags=tags.split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
 async function trash(){
  const a=await confirm({tone:'danger',title:scope==='work'?t('¿Enviar a la papelera?','Move to the trash?'):t('¿Archivar los archivos?','Archive the files?'),description:t(`Se enviarán ${count} ${noun}. Podrá restaurarlos durante 30 días.`,`${count} ${n===1?'file':'files'} will be moved. You can restore them for 30 days.`),confirmLabel:scope==='work'?t('Enviar a la papelera','Move to trash'):t('Archivar','Archive'),cancelLabel:t('Cancelar','Cancel')});
  if(a.confirmed)await bulk.run({action:scope==='work'?'trash':'archive'},scope==='work'?t('Archivos enviados a la papelera.','Files moved to the trash.'):t('Archivos archivados.','Files archived.'));
 }
 async function purge(){
  const a=await confirm({tone:'danger',title:t('¿Eliminar definitivamente?','Delete permanently?'),description:t('Se borran para siempre y no se podrán restaurar. Lo que ya se compartió o se usó en otra parte no se borra y se informa.','They are deleted forever and cannot be restored. Anything already shared or used elsewhere is not deleted and is reported.'),detail:`${count} ${noun}`,confirmLabel:t('Eliminar definitivamente','Delete permanently'),cancelLabel:t('Cancelar','Cancel')});
  if(a.confirmed)await bulk.run({action:'purge'},t('Archivos eliminados definitivamente.','Files deleted permanently.'));
 }
 const btn=(label:string,onClick:()=>void,extra?:string)=><Button type="button" variant="outline" className={extra} disabled={bulk.busy||n===0} onClick={onClick}>{label}</Button>;
 return <section data-file-bulk={scope} aria-label={t('Operaciones masivas','Bulk actions')} className={card}>
  <div className="flex flex-wrap items-center justify-between gap-2">
   <p data-file-bulk-count className="font-semibold">{n===0?t('Seleccione archivos para actuar sobre varios a la vez.','Select files to act on several at once.'):t(`${count} ${noun} seleccionados`,`${count} selected`)}</p>
   <div className="flex flex-wrap gap-2">{onSelectAll&&<Button type="button" variant="secondary" disabled={bulk.busy||all.length===0} onClick={onSelectAll}>{t('Seleccionar los de esta lista','Select all in this list')}</Button>}<Button type="button" variant="secondary" disabled={bulk.busy||n===0} onClick={bulk.clear}>{t('Quitar selección','Clear selection')}</Button></div></div>
  {n>0&&<div className="flex flex-wrap items-center gap-2">
   {view==='trash'?<>{btn(scope==='work'?t('Restaurar','Restore'):t('Restaurar','Restore'),()=>void bulk.run({action:'restore'},t('Archivos restaurados.','Files restored.')))}{btn(t('Eliminar definitivamente','Delete permanently'),()=>void purge())}</>
   :<>{scope==='work'&&folders&&<><select aria-label={t('Carpeta de destino','Destination folder')} value={target} onChange={e=>setTarget(e.target.value)} className={field}><option value="">{t('Inicio (sin carpeta)','Home (no folder)')}</option>{folders.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select>{btn(t('Mover','Move'),()=>void bulk.run({action:'move',folderId:target||null},t('Archivos movidos.','Files moved.')))}</>}
    {scope==='company'&&onPickFolder&&btn(t('Mover a carpeta','Move to folder'),onPickFolder)}
    {btn(t('Marcar favoritos','Mark favorite'),()=>void bulk.run({action:'favorite',on:true},t('Marcados como favoritos.','Marked as favorites.')))}{btn(t('Quitar favoritos','Remove favorite'),()=>void bulk.run({action:'favorite',on:false},t('Quitados de favoritos.','Removed from favorites.')))}
    {scope==='company'&&<><input aria-label={t('Etiquetas separadas por coma','Tags separated by commas')} placeholder={t('Etiquetas (coma)','Tags (comma)')} value={tags} maxLength={120} onChange={e=>setTags(e.target.value)} className={field+' w-44'}/>
     <Button type="button" variant="outline" disabled={bulk.busy||n===0||parsedTags.length===0||parsedTags.length>6} onClick={()=>void bulk.run({action:'tags_add',tags:parsedTags},t('Etiquetas agregadas.','Tags added.'))}>{t('Agregar etiquetas','Add tags')}</Button>
     <Button type="button" variant="outline" disabled={bulk.busy||n===0||parsedTags.length===0||parsedTags.length>6} onClick={()=>void bulk.run({action:'tags_remove',tags:parsedTags},t('Etiquetas quitadas.','Tags removed.'))}>{t('Quitar etiquetas','Remove tags')}</Button></>}
    {btn(scope==='work'?t('A la papelera','To trash'):t('Archivar','Archive'),()=>void trash())}</>}
  </div>}
  {bulk.busy&&<p role="status" className="text-sm">{t('Aplicando cambios…','Applying changes…')}</p>}
  {bulk.notice&&<p role="status" className="text-sm text-green-800">{bulk.notice}</p>}
  {bulk.error&&<p role="alert" className="text-sm text-red-700">{bulk.error}</p>}
  {bulk.failures.length>0&&<ul data-file-bulk-failures className="space-y-1 text-sm text-red-700">{bulk.failures.map(f=><li key={f.id} className="break-words"><span className="font-semibold">{f.name||t('Archivo','File')}</span>: {bulkErrorText(f.error,en)}</li>)}</ul>}
  {dialogNode}
 </section>;
}

type Preview=z.infer<typeof purgePreviewSchema>;
/** Explicit purge of what expired (30 days): preview, confirmation, immutable receipt. Owner only: hidden for anyone else. */
export function FilePurgePanel({scope,workId,actor,onDone}:{scope:BulkScope;workId?:string;actor?:string;onDone:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,{confirm,dialogNode}=useAppDialog();
 const [state,setState]=useState<{preview:Preview;receipts:PurgeReceipt[]}|null>(null),[hidden,setHidden]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const headers:Record<string,string>={...actor?{'X-Pro-Expected-Actor':actor}:{}};
 const query=new URLSearchParams({scope,...scope==='work'&&workId?{workId}:{}}).toString();
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/file-purge?'+query,{cache:'no-store',headers});if(r.status===403||r.status===404){setHidden(true);return;}if(!r.ok)throw Error();setState(purgeStateSchema.parse(await r.json()));setError('');}catch{setError(en?'Could not load the expired items.':'No se pudo cargar lo vencido.');}
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[query,en]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 if(hidden)return null;
 const p=state?.preview;
 async function purge(){
  if(!p)return;
  const a=await confirm({tone:'danger',title:t('¿Eliminar lo vencido definitivamente?','Delete expired items permanently?'),description:t(`Se borran para siempre ${p.deletableFiles} archivos (${proFileSize(p.bytes,false)}) que llevan más de 30 días en la papelera o archivados. No se podrán restaurar. ${p.keptFiles?`${p.keptFiles} se conservan porque se compartieron o se usaron.`:''}`,`${p.deletableFiles} files (${proFileSize(p.bytes,true)}) that have been in the trash or archived for more than 30 days are deleted forever and cannot be restored. ${p.keptFiles?`${p.keptFiles} are kept because they were shared or used.`:''}`),confirmLabel:t('Eliminar definitivamente','Delete permanently'),cancelLabel:t('Cancelar','Cancel')});
  if(!a.confirmed)return;
  setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/pro/file-purge',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({action:'purge_expired',scope,actionId:crypto.randomUUID(),confirm:true,...scope==='work'?{workId}:{}})});
   if(!r.ok)throw Error();const res=purgeResultSchema.parse(await r.json());
   setNotice(t(`Listo: ${res.receipt.purgedFiles} archivos eliminados, ${res.receipt.keptFiles} conservados.`,`Done: ${res.receipt.purgedFiles} files deleted, ${res.receipt.keptFiles} kept.`));await load();onDone();
  }catch{setError(t('No se pudo comprobar el cambio. Actualice y revise de nuevo.','Could not confirm the change. Refresh and review again.'));}finally{setBusy(false);}
 }
 return <section data-file-purge={scope} aria-label={t('Eliminar lo vencido','Delete expired items')} className={card}>
  <h4 className="font-bold">{t('Eliminar lo vencido','Delete expired items')}</h4>
  <p className="text-sm text-[#52627a]">{t('Nada se borra solo. Lo que lleva más de 30 días en la papelera o archivado se puede eliminar de forma definitiva con su confirmación; recibirá un recibo con nombre, tamaño y huella, sin el contenido.','Nothing is deleted by itself. Items that have been in the trash or archived for more than 30 days can be deleted permanently with your confirmation; you get a receipt with name, size and fingerprint, never the contents.')}</p>
  {!state?<p role="status" className="text-sm">{error||t('Cargando…','Loading…')}</p>:<>
   <p data-file-purge-preview className="text-sm">{t(`Vencidos: ${state.preview.expiredFiles} archivos y ${state.preview.expiredFolders} carpetas. Se pueden eliminar ${state.preview.deletableFiles} (${proFileSize(state.preview.bytes,false)}); ${state.preview.keptFiles} se conservan por estar compartidos o en uso.`,`Expired: ${state.preview.expiredFiles} files and ${state.preview.expiredFolders} folders. ${state.preview.deletableFiles} can be deleted (${proFileSize(state.preview.bytes,true)}); ${state.preview.keptFiles} are kept because they are shared or in use.`)}</p>
   <Button type="button" variant="outline" data-file-purge-run disabled={busy||state.preview.expiredFiles+state.preview.expiredFolders===0} onClick={()=>void purge()}>{busy?t('Eliminando…','Deleting…'):t('Eliminar lo vencido','Delete expired items')}</Button>
   {state.receipts.length>0&&<div data-file-purge-receipts className="space-y-1 text-sm"><p className="font-semibold">{t('Recibos','Receipts')}</p><ul className="space-y-1">{state.receipts.slice(0,5).map(rc=><li key={rc.id} className="break-words">{new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(rc.at))} · {t(`${rc.purgedFiles} archivos y ${rc.purgedFolders} carpetas eliminados, ${rc.keptFiles} conservados, ${proFileSize(rc.bytesFreed,false)} liberados`,`${rc.purgedFiles} files and ${rc.purgedFolders} folders deleted, ${rc.keptFiles} kept, ${proFileSize(rc.bytesFreed,true)} freed`)}</li>)}</ul></div>}</>}
  {notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
  {error&&state&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {dialogNode}
 </section>;
}
