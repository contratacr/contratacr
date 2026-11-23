'use client';
/* eslint-disable @next/next/no-img-element -- Preview of an authenticated, checksum-verified blob, revoked on close. */
import {useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {proDocPreview} from '@/lib/pro/file-formats';
import {proFileSize} from '@/lib/pro/file-size';
import {CSV_PREVIEW_MAX_COLS,CSV_PREVIEW_MAX_ROWS,decodeTextPreview,formatDuration,parseCsvPreview,type TextPreview} from '@/lib/pro/text-preview';

/**
 * Ronda F2-D (row 28): in-app preview of photos, PDF and short videos. The bytes come from the
 * same reauthorized download API (attachment, nosniff), are checked against the stored size and
 * SHA-256, and are shown from a local blob URL that is revoked when the preview closes. No public
 * or signed storage URL is ever used. Office/CAD files are download only. CSV/TXT show their first 64 KB as plain text (CSV as a grid);
 * videos show their duration and a poster frame.
 */
export type PreviewTarget={name:string;mimeType:string;sizeBytes:number;sha256:string;href:string};
async function sha256Hex(buffer:ArrayBuffer){const hash=await crypto.subtle.digest('SHA-256',buffer);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');}
export function canPreview(mimeType:string){return proDocPreview(mimeType)!==null;}
export function ProFilePreview({target,onClose}:{target:PreviewTarget;onClose:()=>void}){
 const en=useLocale()==='en',[url,setUrl]=useState<string|null>(null),[failed,setFailed]=useState(false),[text,setText]=useState<TextPreview|null>(null),[attempt,setAttempt]=useState(0),kind=proDocPreview(target.mimeType),current=useRef<string|null>(null);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   try{
    const response=await fetch(target.href,{cache:'no-store'});
    if(!response.ok||response.headers.get('content-type')?.split(';')[0].trim()!==target.mimeType)throw Error();
    const buffer=await response.arrayBuffer();if(buffer.byteLength!==target.sizeBytes||await sha256Hex(buffer)!==target.sha256)throw Error();
    if(kind==='text'){if(live)setText(decodeTextPreview(buffer));return;}
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
    :kind==='text'?(text?<TextBody text={text} csv={target.mimeType==='text/csv'} en={en}/>:<p role="status" className="text-sm">{en?'Loading preview…':'Cargando vista previa…'}</p>)
    :!url?<p role="status" className="text-sm">{en?'Loading preview…':'Cargando vista previa…'}</p>
    :kind==='image'?<img src={url} alt={target.name} className="mx-auto max-h-[70vh] w-full rounded-lg object-contain"/>
    :kind==='video'?<VideoBody src={url} name={target.name} en={en}/>
    :kind==='pdf'?<iframe src={url} title={target.name} className="h-[70vh] w-full rounded-lg border border-[#d7e1ea]"/>
    :<p className="text-sm">{en?'This format is download only.':'Este formato es solo para descargar.'}</p>}
  </div>
 </Modal>;
}

function TextBody({text,csv,en}:{text:TextPreview;csv:boolean;en:boolean}){
 const grid=csv?parseCsvPreview(text.text):null;
 return <div data-pro-text-preview={csv?'csv':'txt'} className="space-y-2">
  {grid?<div className="max-h-[60vh] overflow-auto rounded-lg border border-[#d7e1ea]"><table className="min-w-full text-left text-sm"><tbody>{grid.rows.map((row,i)=><tr key={i} className={i===0?'bg-[#f3f8fb] font-semibold':'border-t border-[#eef2f6]'}>{row.map((cell,j)=><td key={j} className="max-w-64 break-words px-2 py-1 align-top">{cell}</td>)}</tr>)}</tbody></table></div>
   :<pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[#d7e1ea] bg-[#f9fbfd] p-3 text-sm">{text.text}</pre>}
  {(text.truncated||grid?.truncatedRows||grid?.truncatedCols)&&<p data-pro-text-truncated className="text-xs text-[#6b4e00]">{grid?.truncatedRows||grid?.truncatedCols?(en?`Showing the first ${CSV_PREVIEW_MAX_ROWS} rows and ${CSV_PREVIEW_MAX_COLS} columns. Download the file to see everything.`:`Se muestran las primeras ${CSV_PREVIEW_MAX_ROWS} filas y ${CSV_PREVIEW_MAX_COLS} columnas. Descargue el archivo para verlo completo.`):(en?'Showing the first 64 KB. Download the file to see everything.':'Se muestran los primeros 64 KB. Descargue el archivo para verlo completo.')}</p>}
 </div>;
}
/** Duration under the player and a poster frame taken from the video itself (nothing leaves the browser). */
function VideoBody({src,name,en}:{src:string;name:string;en:boolean}){
 const video=useRef<HTMLVideoElement>(null),[duration,setDuration]=useState(0),[poster,setPoster]=useState<string|undefined>(),taken=useRef(false);
 useEffect(()=>()=>{if(poster)URL.revokeObjectURL(poster);},[poster]);
 function onMeta(){const el=video.current;if(!el)return;setDuration(el.duration);if(!taken.current&&Number.isFinite(el.duration)&&el.duration>0){el.currentTime=Math.min(1,el.duration/10);}}
 function onSeeked(){
  const el=video.current;if(!el||taken.current||!el.videoWidth||!el.videoHeight)return;taken.current=true;
  try{const canvas=document.createElement('canvas'),scale=Math.min(1,640/el.videoWidth);canvas.width=Math.round(el.videoWidth*scale);canvas.height=Math.round(el.videoHeight*scale);canvas.getContext('2d')?.drawImage(el,0,0,canvas.width,canvas.height);
   canvas.toBlob(blob=>{if(blob)setPoster(URL.createObjectURL(blob));},'image/jpeg',0.8);}catch{}
  el.currentTime=0;
 }
 return <div className="space-y-2"><video ref={video} src={src} poster={poster} controls playsInline preload="metadata" aria-label={name} onLoadedMetadata={onMeta} onSeeked={onSeeked} className="mx-auto max-h-[70vh] w-full rounded-lg bg-black"/>
  {duration>0&&<p data-pro-video-duration className="text-xs text-[#52627a]">{en?'Duration: ':'Duración: '}{formatDuration(duration)}</p>}</div>;
}
