'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {proFileSize} from '@/lib/pro/file-size';
import {IMPORT_BATCH_MAX,importReasonText,importResultSchema,importStateSchema,type ImportReason} from '@/lib/pro/file-import';
import {convertResultSchema,isOfficeMime} from '@/lib/pro/file-convert';

/**
 * Ronda F2-E (rows 28 and 31): the two file adapters in the screens.
 *  - FileImportModal: import from an external drive into the open library folder. Shows honestly whether it is the sandbox (example
 *    files, no account is touched) or a live connection, one result per file and a retry that never duplicates.
 *  - FileConvertButton: "Convert to PDF" for Word, Excel and PowerPoint. In simulated mode it says plainly that the PDF is a placeholder.
 */
export function FileImportModal({actor,folderId,folderName,onClose,onDone}:{actor?:string;folderId:string|null;folderName:string;onClose:()=>void;onDone:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [state,setState]=useState<ReturnType<typeof importStateSchema.parse>|null>(null),[failed,setFailed]=useState<'load'|'config'|null>(null),[picked,setPicked]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [results,setResults]=useState<ReturnType<typeof importResultSchema.parse>['results']>([]),batch=useRef<{key:string;id:string}|null>(null);
 const headers:Record<string,string>={...actor?{'X-Pro-Expected-Actor':actor}:{}};
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/file-import',{cache:'no-store',headers});if(r.status===409){setFailed('config');return;}if(!r.ok)throw Error();setState(importStateSchema.parse(await r.json()));setFailed(null);}catch{setFailed('load');}
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[actor]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 function toggle(id:string){setPicked(p=>p.includes(id)?p.filter(x=>x!==id):p.length<IMPORT_BATCH_MAX?[...p,id]:p);}
 async function run(){
  if(busy||picked.length===0)return;const items=picked.map(externalId=>({externalId})),key=JSON.stringify({folderId,items});if(batch.current?.key!==key)batch.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');setResults([]);
  try{const r=await fetch('/api/pro/file-import',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({action:'import',source:'drive',actionId:batch.current.id,folderId,items})});
   if(r.status===403)throw Error(t('No tiene permiso para importar a esta carpeta.','You do not have permission to import into this folder.'));
   if(!r.ok)throw Error(t('No se pudo comprobar la importación. Reintente: no se duplicará.','Could not confirm the import. Retry: it will not be duplicated.'));
   const res=importResultSchema.parse(await r.json());setResults(res.results);batch.current=null;setPicked(res.results.filter(x=>!x.ok&&(x.reason==='unavailable')).map(x=>x.externalId));onDone();await load();
  }catch(failure){setError(failure instanceof Error&&failure.message?failure.message:t('No se pudo importar.','Could not import.'));}finally{setBusy(false);}
 }
 const sandbox=state?.mode==='sandbox';
 return <Modal title={t('Importar desde Drive','Import from Drive')} ariaLabel={t('Importar desde Drive','Import from Drive')} size="xl" onClose={()=>{if(!busy)onClose();}} closeLabel={t('Cerrar','Close')} mobilePresentation="fullscreen"
  footer={<><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{t('Cerrar','Close')}</Button><Button type="button" data-file-import-run onClick={()=>void run()} disabled={busy||picked.length===0}>{busy?t('Importando…','Importing…'):t(`Importar ${picked.length||''} archivos`.replace('  ',' '),`Import ${picked.length||''} files`.replace('  ',' '))}</Button></>}>
  <div data-file-import className="space-y-3">
   <p className="text-sm text-[#52627a]">{t(`Los archivos se guardan en "${folderName}". Pasan por las mismas revisiones que una subida normal (formato, tamaño y espacio).`,`Files are saved in "${folderName}". They go through the same checks as a normal upload (format, size and space).`)}</p>
   {sandbox&&<p data-file-import-mode="sandbox" className="rounded-xl bg-[#fff7e6] p-3 text-sm text-[#6b4e00]">{t('Modo de prueba: se muestran archivos de ejemplo y no se conecta a ninguna cuenta de Google Drive. La conexión real se activa con las credenciales del servidor.','Test mode: example files are shown and no Google Drive account is touched. The real connection is turned on with the server credentials.')}</p>}
   {state&&!sandbox&&<p data-file-import-mode="live" className="rounded-xl bg-[#e7f6ee] p-3 text-sm text-[#175b42]">{t('Conectado a Google Drive.','Connected to Google Drive.')}</p>}
   {failed==='config'?<p role="alert" className="text-sm">{t('La conexión con la unidad no está configurada todavía.','The drive connection is not configured yet.')}</p>
    :failed==='load'?<div role="alert" className="space-y-2"><p className="text-sm">{t('No se pudo consultar la unidad.','Could not reach the drive.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>
    :!state?<p role="status" className="text-sm">{t('Cargando…','Loading…')}</p>
    :state.candidates.length===0?<p className="text-sm text-[#52627a]">{t('No hay archivos para importar.','There are no files to import.')}</p>
    :<ul className="space-y-2">{state.candidates.map(c=>{const r=results.find(x=>x.externalId===c.id);return <li key={c.id} data-file-import-item={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#d7e1ea] bg-white p-3">
      <input type="checkbox" className="h-5 w-5 accent-[#009FD9]" aria-label={t(`Elegir ${c.name}`,`Choose ${c.name}`)} checked={picked.includes(c.id)} disabled={busy} onChange={()=>toggle(c.id)}/>
      <div className="min-w-0 flex-1"><p className="break-words font-semibold">{c.name}</p><p className="text-xs text-[#52627a]">{proFileSize(c.sizeBytes,en)}</p></div>
      {r&&<span data-file-import-result={r.ok?'done':'failed'} role={r.ok?'status':'alert'} className={'text-sm '+(r.ok?'text-green-800':'text-red-700')}>{r.ok?(r.replayed?t('Ya estaba importado.','Already imported.'):t('Importado.','Imported.')):importReasonText(r.reason as ImportReason,en)}</span>}</li>;})}</ul>}
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>
 </Modal>;
}

export function FileConvertButton({scope,workId,fileId,mimeType,actor,disabled,onDone}:{scope:'work'|'company';workId?:string;fileId:string;mimeType:string;actor?:string;disabled?:boolean;onDone:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),pending=useRef<{actionId:string;targetFileId:string}|null>(null);
 if(!isOfficeMime(mimeType))return null;
 async function run(){
  if(busy)return;pending.current??={actionId:crypto.randomUUID(),targetFileId:crypto.randomUUID()};setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/pro/file-convert',{method:'POST',headers:{'Content-Type':'application/json',...actor?{'X-Pro-Expected-Actor':actor}:{}},body:JSON.stringify({action:'convert',scope,...scope==='work'?{workId}:{},fileId,...pending.current})});
   if(r.status===409)throw Error(t('El servicio de conversión no está configurado.','The conversion service is not configured.'));
   if(!r.ok)throw Error(t('No se pudo convertir. Reintente: no se duplicará.','Could not convert. Retry: it will not be duplicated.'));
   const res=convertResultSchema.parse(await r.json());pending.current=null;
   setNotice(res.simulated?t(`Se creó "${res.name}". Es una vista simulada: no hay un servicio de conversión conectado, el PDF no contiene el documento.`,`"${res.name}" was created. It is a simulated preview: no conversion service is connected, so the PDF does not contain the document.`):t(`Se creó "${res.name}".`,`"${res.name}" was created.`));onDone();
  }catch(failure){setError(failure instanceof Error&&failure.message?failure.message:t('No se pudo convertir.','Could not convert.'));}finally{setBusy(false);}
 }
 return <>
  <Button type="button" variant="outline" data-convert-pdf={fileId} disabled={busy||disabled} onClick={()=>void run()}>{busy?t('Convirtiendo…','Converting…'):t('Convertir a PDF','Convert to PDF')}</Button>
  {notice&&<p data-convert-notice role="status" className="basis-full text-xs text-[#6b4e00]">{notice}</p>}{error&&<p role="alert" className="basis-full text-xs text-red-700">{error}</p>}
 </>;
}
