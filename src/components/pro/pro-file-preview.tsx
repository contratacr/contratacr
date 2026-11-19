'use client';
/* eslint-disable @next/next/no-img-element -- Preview of an authenticated, checksum-verified blob, revoked on close. */
import {useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {proDocPreview} from '@/lib/pro/file-formats';
import {proFileSize} from '@/lib/pro/file-size';

/**
 * Ronda F2-D (row 28): in-app preview of photos, PDF and short videos. The bytes come from the
 * same reauthorized download API (attachment, nosniff), are checked against the stored size and
 * SHA-256, and are shown from a local blob URL that is revoked when the preview closes. No public
 * or signed storage URL is ever used. Office/CAD/text files are download only.
 */
export type PreviewTarget={name:string;mimeType:string;sizeBytes:number;sha256:string;href:string};
async function sha256Hex(buffer:ArrayBuffer){const hash=await crypto.subtle.digest('SHA-256',buffer);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');}
export function canPreview(mimeType:string){return proDocPreview(mimeType)!==null;}
export function ProFilePreview({target,onClose}:{target:PreviewTarget;onClose:()=>void}){
 const en=useLocale()==='en',[url,setUrl]=useState<string|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0),kind=proDocPreview(target.mimeType),current=useRef<string|null>(null);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   try{
    const response=await fetch(target.href,{cache:'no-store'});
    if(!response.ok||response.headers.get('content-type')?.split(';')[0].trim()!==target.mimeType)throw Error();
    const buffer=await response.arrayBuffer();if(buffer.byteLength!==target.sizeBytes||await sha256Hex(buffer)!==target.sha256)throw Error();
    if(!live)return;const next=URL.createObjectURL(new Blob([buffer],{type:target.mimeType}));current.current=next;setUrl(next);
   }catch{if(live)setFailed(true);}
  })();
  return()=>{live=false;if(current.current){URL.revokeObjectURL(current.current);current.current=null;}};
 },[target,attempt]);
 const download=<Button asChild variant="secondary"><a href={target.href} download={target.name}>{en?'Download':'Descargar'}</a></Button>;
 return <Modal title={target.name} ariaLabel={target.name} size="xl" onClose={onClose} closeLabel={en?'Close':'Cerrar'} mobilePresentation="fullscreen"
  footer={<>{download}<Button type="button" onClick={onClose}>{en?'Close preview':'Cerrar vista previa'}</Button></>}>
  <div data-pro-file-preview={kind??'none'} className="space-y-3">
   <p className="text-xs text-[#52627a]">{proFileSize(target.sizeBytes,en)}</p>
   {failed?<div role="alert" className="space-y-2"><p className="text-sm">{en?'Could not open the preview. You can download the file.':'No se pudo abrir la vista previa. Puede descargar el archivo.'}</p><Button type="button" variant="secondary" onClick={()=>{setFailed(false);setUrl(null);setAttempt(n=>n+1);}}>{en?'Retry':'Reintentar'}</Button></div>
    :!url?<p role="status" className="text-sm">{en?'Loading preview…':'Cargando vista previa…'}</p>
    :kind==='image'?<img src={url} alt={target.name} className="mx-auto max-h-[70vh] w-full rounded-lg object-contain"/>
    :kind==='video'?<video src={url} controls playsInline preload="metadata" aria-label={target.name} className="mx-auto max-h-[70vh] w-full rounded-lg bg-black"/>
    :kind==='pdf'?<iframe src={url} title={target.name} className="h-[70vh] w-full rounded-lg border border-[#d7e1ea]"/>
    :<p className="text-sm">{en?'This format is download only.':'Este formato es solo para descargar.'}</p>}
  </div>
 </Modal>;
}
