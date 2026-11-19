'use client';
import {useCallback,useEffect,useRef,useState,type DragEvent,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {CheckCircle2,RotateCcw,UploadCloud,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {proFileSize} from '@/lib/pro/file-size';
import {PRO_DOC_ACCEPT,PRO_DOC_BATCH_MAX,checkProDocSource,proDocCheckMessage,proDocLimitText} from '@/lib/pro/file-formats';

/**
 * Ronda F2-D (rows 28/31): multi-file upload shared by the job files and the company library.
 * Drag and drop (desktop) or picker (all devices), up to 20 files per batch, ONE at a time with a
 * real progress bar (XMLHttpRequest upload events), a per-file error with the reason and «Reintentar»
 * that resends the SAME identities (fileId/actionId), so the server never duplicates a file. Files
 * stay in memory only (nothing in browser storage); leaving the page while uploading is blocked by
 * the caller through `busy`.
 */
export type UploadItem={key:string;file:File;status:'waiting'|'uploading'|'done'|'error';progress:number;error:string;ids:{fileId:string;actionId:string};final?:boolean};
export type UploadSend=(item:UploadItem,data:string,onProgress:(fraction:number)=>void)=>Promise<{ok:true}|{ok:false;message:string}>;

/** Base64 of the file without loading it twice in memory as text and bytes. */
export function readFileBase64(file:File){
 return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error);reader.onload=()=>{const value=String(reader.result);const comma=value.indexOf(',');resolve(comma>=0?value.slice(comma+1):'');};reader.readAsDataURL(file);});
}
/** JSON POST with upload progress. Same-origin; the session cookie authenticates it like fetch. */
export function postJsonWithProgress(url:string,body:string,onProgress:(fraction:number)=>void,headers:Record<string,string>={}){
 return new Promise<{status:number;data:unknown}>((resolve)=>{
  const xhr=new XMLHttpRequest();xhr.open('POST',url);xhr.setRequestHeader('Content-Type','application/json');for(const [k,v] of Object.entries(headers))xhr.setRequestHeader(k,v);
  xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(Math.min(0.98,event.loaded/event.total));};
  xhr.onload=()=>{let data:unknown=null;try{data=JSON.parse(xhr.responseText);}catch{}resolve({status:xhr.status,data});};
  xhr.onerror=()=>resolve({status:0,data:null});xhr.ontimeout=()=>resolve({status:0,data:null});
  xhr.send(body);
 });
}
export function uploadFailureMessage(status:number,data:unknown,en:boolean){
 const reason=data&&typeof data==='object'&&'reason' in data?String((data as {reason:unknown}).reason):'';
 if(status===0)return en?'No connection. Retry: it will not be duplicated.':'Sin conexión. Reintente: no se duplicará.';
 if(reason==='macro')return proDocCheckMessage('macro',en);
 if(reason==='size'||status===413)return proDocCheckMessage('size',en);
 if(reason==='mismatch')return en?'The extension does not match the file content.':'La extensión no coincide con el contenido del archivo.';
 if(reason==='quota')return en?'The account file space is full. Delete files from the trash to free space.':'Se llenó el espacio de archivos de la cuenta. Elimine archivos de la papelera para liberar espacio.';
 if(reason==='type'||status===400)return en?'Format not accepted or damaged file.':'Formato no aceptado o archivo dañado.';
 if(status===429)return en?'Too many uploads in a minute. Wait and retry.':'Demasiadas subidas en un minuto. Espere y reintente.';
 return en?'Could not confirm the upload. Retry: it will not be duplicated.':'No se pudo confirmar la subida. Reintente: no se duplicará.';
}

export function useProUploadQueue(send:UploadSend,onFinished:(items:UploadItem[])=>void){
 const en=useLocale()==='en';
 const [items,setItems]=useState<UploadItem[]>([]),running=useRef(false),list=useRef<UploadItem[]>([]),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const update=useCallback((key:string,patch:Partial<UploadItem>)=>{list.current=list.current.map(item=>item.key===key?{...item,...patch}:item);if(mounted.current)setItems(list.current);},[]);
 const pump=useCallback(async()=>{
  if(running.current)return;running.current=true;let sent=false;
  try{
   for(let next=list.current.find(item=>item.status==='waiting');next;next=list.current.find(item=>item.status==='waiting')){
    const item=next;update(item.key,{status:'uploading',progress:0,error:''});sent=true;
    try{
     const data=await readFileBase64(item.file);
     const result=await send(item,data,fraction=>update(item.key,{progress:fraction}));
     update(item.key,result.ok?{status:'done',progress:1}:{status:'error',error:result.message});
    }catch{update(item.key,{status:'error',error:en?'Could not read the file on this device.':'No se pudo leer el archivo en este dispositivo.'});}
   }
  }finally{running.current=false;if(sent&&mounted.current)onFinished(list.current);}
 },[en,onFinished,send,update]);
 const add=useCallback((files:File[])=>{
  const room=PRO_DOC_BATCH_MAX-list.current.filter(item=>item.status==='waiting'||item.status==='uploading').length;
  const fresh=files.slice(0,Math.max(0,room)).map(file=>{const check=checkProDocSource(file);return{key:crypto.randomUUID(),file,status:check.ok?'waiting':'error',progress:0,error:check.ok?'':proDocCheckMessage(check.reason,en),final:!check.ok,ids:{fileId:crypto.randomUUID(),actionId:crypto.randomUUID()}} satisfies UploadItem;});
  const skipped=files.length-fresh.length;
  list.current=[...list.current.filter(item=>item.status!=='done'),...fresh];setItems(list.current);void pump();
  return skipped;
 },[en,pump]);
 const retry=useCallback((key:string)=>{update(key,{status:'waiting',error:'',progress:0});void pump();},[pump,update]);
 const dismiss=useCallback((key:string)=>{list.current=list.current.filter(item=>item.key!==key||item.status==='uploading');setItems(list.current);},[]);
 const clearDone=useCallback(()=>{list.current=list.current.filter(item=>item.status!=='done');setItems(list.current);},[]);
 const busy=items.some(item=>item.status==='waiting'||item.status==='uploading');
 return{items,add,retry,dismiss,clearDone,busy};
}

/** Drop zone + picker. Keyboard and screen readers use the visible «Elegir archivos» button. */
export function ProDropZone({onFiles,disabled,label,hint,children}:{onFiles:(files:File[])=>void;disabled?:boolean;label?:string;hint?:ReactNode;children?:ReactNode}){
 const en=useLocale()==='en',input=useRef<HTMLInputElement>(null),[over,setOver]=useState(false),depth=useRef(0);
 const files=(event:DragEvent)=>Array.from(event.dataTransfer?.files??[]);
 const isFileDrag=(event:DragEvent)=>Array.from(event.dataTransfer?.types??[]).includes('Files');
 return <div data-pro-drop-zone data-over={over?'':undefined}
  onDragEnter={event=>{if(disabled||!isFileDrag(event))return;event.preventDefault();depth.current++;setOver(true);}}
  onDragOver={event=>{if(disabled||!isFileDrag(event))return;event.preventDefault();event.dataTransfer.dropEffect='copy';}}
  onDragLeave={event=>{if(!isFileDrag(event))return;depth.current=Math.max(0,depth.current-1);if(!depth.current)setOver(false);}}
  onDrop={event=>{if(disabled||!isFileDrag(event))return;event.preventDefault();depth.current=0;setOver(false);const list=files(event);if(list.length)onFiles(list);}}
  className={'rounded-2xl border-2 border-dashed p-4 text-sm transition-colors '+(over?'border-[#009FD9] bg-[#e8f6fc]':'border-[#c9d6e2] bg-[#f8fbfd]')}>
  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
   <UploadCloud aria-hidden className="hidden h-8 w-8 shrink-0 text-[#008bb5] sm:block"/>
   <div className="min-w-0 flex-1"><p className="font-semibold text-[#162543]"><span className="hidden sm:inline">{en?'Drag files here or ':'Arrastre archivos aquí o '}</span><span className="sm:hidden">{en?'Add files from your phone':'Agregue archivos desde su teléfono'}</span></p>
    <p className="mt-1 text-xs text-[#52627a]">{hint??proDocLimitText(en)} {en?`Up to ${PRO_DOC_BATCH_MAX} at a time.`:`Hasta ${PRO_DOC_BATCH_MAX} a la vez.`}</p></div>
   <Button type="button" disabled={disabled} onClick={()=>input.current?.click()} className="w-full shrink-0 sm:w-auto">{label??(en?'Choose files':'Elegir archivos')}</Button>
   <input ref={input} type="file" multiple accept={PRO_DOC_ACCEPT} aria-label={label??(en?'Choose files':'Elegir archivos')} className="sr-only" tabIndex={-1} disabled={disabled} onChange={event=>{const list=Array.from(event.target.files??[]);event.target.value='';if(list.length)onFiles(list);}}/>
  </div>
  {children}
 </div>;
}

export function ProUploadList({queue,marker}:{queue:ReturnType<typeof useProUploadQueue>;marker?:`data-${string}`}){
 const en=useLocale()==='en';
 if(!queue.items.length)return null;
 const done=queue.items.filter(item=>item.status==='done').length,failed=queue.items.filter(item=>item.status==='error').length,total=queue.items.length;
 return <section data-pro-upload-list {...marker?{[marker]:''}:{}} aria-label={en?'Uploads':'Subidas'} className="space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-sm font-semibold text-[#162543]">{queue.busy?(en?`Uploading ${done+1} of ${total}…`:`Subiendo ${done+1} de ${total}…`):(en?`Uploaded ${done} of ${total}.`:`Subidos ${done} de ${total}.`)}{failed>0&&<span className="ml-1 text-red-700">{en?`${failed} with errors.`:`${failed} con error.`}</span>}</p>
   {!queue.busy&&done>0&&<Button type="button" variant="ghost" onClick={queue.clearDone}>{en?'Clear finished':'Limpiar terminados'}</Button>}</div>
  <ul className="space-y-2">{queue.items.map(item=><li key={item.key} data-upload-item={item.status} className="rounded-xl border border-[#e3eaf1] p-2">
   <div className="flex min-w-0 items-center gap-2">
    {item.status==='done'?<CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-[#175b42]"/>:null}
    <span className="min-w-0 flex-1 break-all text-sm font-semibold">{item.file.name}</span>
    <span className="shrink-0 text-xs text-[#52627a]">{proFileSize(item.file.size,en)}</span>
    {item.status==='error'&&<>{!item.final&&<Button type="button" variant="secondary" className="h-9 px-3" onClick={()=>queue.retry(item.key)} aria-label={(en?'Retry ':'Reintentar ')+item.file.name}><RotateCcw aria-hidden className="h-4 w-4"/><span className="hidden sm:inline">{en?'Retry':'Reintentar'}</span></Button>}
     <Button type="button" variant="ghost" className="h-9 w-9 p-0" onClick={()=>queue.dismiss(item.key)} aria-label={(en?'Remove from the list ':'Quitar de la lista ')+item.file.name}><X aria-hidden className="h-4 w-4"/></Button></>}
   </div>
   {(item.status==='uploading'||item.status==='waiting')&&<progress aria-label={(en?'Progress of ':'Progreso de ')+item.file.name} className="mt-2 block h-2 w-full accent-[#009FD9]" max={100} value={Math.round(item.progress*100)}/>}
   {item.status==='waiting'&&<p className="mt-1 text-xs text-[#52627a]">{en?'Waiting…':'En espera…'}</p>}
   {item.status==='error'&&<p role="alert" className="mt-1 text-xs text-red-700">{item.error}</p>}
  </li>)}</ul>
 </section>;
}
