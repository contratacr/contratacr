'use client';
/* eslint-disable @next/next/no-img-element -- the image is an authenticated, checksum-verified blob URL, revoked on close. */
import {useCallback,useEffect,useMemo,useRef,useState,type MouseEvent} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {annotationCreateResultSchema,annotationsReadSchema,ANNOTATION_MAX_CHARS,type AnnotationInput,type FileAnnotation} from '@/lib/pro/file-annotations';
import {openTakeoffPdf,renderTakeoffPdfPage,type TakeoffPdfDocument} from '@/lib/pro/takeoff-pdf';
import type {PreviewTarget} from './pro-file-preview';

/**
 * Row 30 (Ronda F2-E): pins and notes on a file. Click on the photo or on a PDF page to drop a pin (coordinate saved as a fraction
 * of the page, so it is the same at any zoom), write the comment and save. It is a private comment of the team: the customer never
 * sees it. The history is append only (nothing is edited or deleted) and a retry of the same save never duplicates it.
 */
async function sha256Hex(buffer:ArrayBuffer){const hash=await crypto.subtle.digest('SHA-256',buffer);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');}
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
export function FileAnnotations({scope,workId,actor,file,onClose,onChanged}:{scope:'work'|'company';workId?:string;actor?:string;file:PreviewTarget&{id:string};onClose:()=>void;onChanged?:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [data,setData]=useState<{pinnable:boolean;items:FileAnnotation[]}|null>(null),[failed,setFailed]=useState(false);
 const [url,setUrl]=useState<string|null>(null),[viewError,setViewError]=useState(false),[pdf,setPdf]=useState<TakeoffPdfDocument|null>(null),[page,setPage]=useState(1);
 const [draft,setDraft]=useState<{x:number;y:number}|null>(null),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const pending=useRef<{key:string;id:string}|null>(null),canvas=useRef<HTMLCanvasElement>(null),frame=useRef<HTMLDivElement>(null),isPdf=file.mimeType==='application/pdf';
 const headers:Record<string,string>={...actor?{'X-Pro-Expected-Actor':actor}:{}};
 const query=useMemo(()=>new URLSearchParams({scope,fileId:file.id,...scope==='work'&&workId?{workId}:{}}).toString(),[scope,file.id,workId]);
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/file-annotations?'+query,{cache:'no-store',headers});if(!r.ok)throw Error();setData(annotationsReadSchema.parse(await r.json()));setFailed(false);}catch{setFailed(true);}
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[query]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 // Bytes: same reauthorized download API, verified by size and SHA-256, shown from a local blob (never a public URL).
 const pinnable=data?.pinnable??false;
 useEffect(()=>{
  if(!pinnable)return;let live=true,blobUrl:string|null=null,doc:TakeoffPdfDocument|null=null;
  void(async()=>{
   try{
    const r=await fetch(file.href,{cache:'no-store'});if(!r.ok||r.headers.get('content-type')?.split(';')[0].trim()!==file.mimeType)throw Error();
    const buffer=await r.arrayBuffer();if(buffer.byteLength!==file.sizeBytes||await sha256Hex(buffer)!==file.sha256)throw Error();
    if(isPdf){doc=await openTakeoffPdf(new File([buffer],file.name,{type:file.mimeType}));if(!live){await doc.destroy();return;}setPdf(doc);}
    else{blobUrl=URL.createObjectURL(new Blob([buffer],{type:file.mimeType}));if(!live){URL.revokeObjectURL(blobUrl);return;}setUrl(blobUrl);}
   }catch{if(live)setViewError(true);}
  })();
  return()=>{live=false;if(blobUrl)URL.revokeObjectURL(blobUrl);if(doc)void doc.destroy().catch(()=>null);};
 },[pinnable,file,isPdf]);
 useEffect(()=>{if(!pdf||!canvas.current)return;let live=true;void renderTakeoffPdfPage(pdf,page,canvas.current).catch(()=>{if(live)setViewError(true);});return()=>{live=false;};},[pdf,page]);
 const pins=(data?.items??[]).filter(a=>a.kind==='pin'),numbered=new Map(pins.map((a,i)=>[a.id,i+1]));
 const visible=pins.filter(a=>(isPdf?a.page===page:true));
 function place(event:MouseEvent<HTMLDivElement>){
  if(busy||!frame.current)return;const rect=frame.current.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;
  const x=Math.min(1,Math.max(0,(event.clientX-rect.left)/rect.width)),y=Math.min(1,Math.max(0,(event.clientY-rect.top)/rect.height));
  setDraft({x:Math.round(x*1e6)/1e6,y:Math.round(y*1e6)/1e6});setNotice('');setError('');
 }
 async function save(){
  const body=text.trim();if(!body||busy)return;
  const base={action:'create' as const,actionId:'',fileId:file.id,body},input=(scope==='work'
   ?draft?{...base,scope:'work' as const,workId:workId!,kind:'pin' as const,page:isPdf?page:1,x:draft.x,y:draft.y}:{...base,scope:'work' as const,workId:workId!,kind:'note' as const}
   :draft?{...base,scope:'company' as const,kind:'pin' as const,page:isPdf?page:1,x:draft.x,y:draft.y}:{...base,scope:'company' as const,kind:'note' as const}) as AnnotationInput;
  const {actionId:_ignored,...stable}=input;void _ignored;const key=JSON.stringify(stable);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');setNotice('');
  try{
   const r=await fetch('/api/pro/file-annotations',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({...input,actionId:pending.current.id})});
   if(r.status===403)throw Error(t('No tiene permiso para anotar este archivo.','You do not have permission to annotate this file.'));
   if(!r.ok){if(r.status===400||r.status===404)pending.current=null;throw Error(t('No se pudo guardar. Reintente: no se duplicará.','Could not save. Retry: it will not be duplicated.'));}
   annotationCreateResultSchema.parse(await r.json());pending.current=null;setText('');setDraft(null);setNotice(t('Anotación guardada. Solo la ve su equipo.','Annotation saved. Only your team sees it.'));await load();onChanged?.();
  }catch(failure){setError(failure instanceof Error&&failure.message?failure.message:t('No se pudo guardar.','Could not save.'));}finally{setBusy(false);}
 }
 return <Modal title={t('Anotaciones: ','Annotations: ')+file.name} ariaLabel={t('Anotaciones','Annotations')} size="xl" onClose={()=>{if(!busy)onClose();}} closeLabel={t('Cerrar','Close')} mobilePresentation="fullscreen"
  footer={<Button type="button" onClick={onClose} disabled={busy}>{t('Cerrar','Close')}</Button>}>
  <div data-file-annotations={scope} className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
   <div className="min-w-0 space-y-3">
    {failed&&<div role="alert" className="space-y-2"><p className="text-sm">{t('No se pudieron cargar las anotaciones.','Could not load the annotations.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>}
    {data&&!data.pinnable&&<p className="rounded-xl bg-[#f3f8fb] p-3 text-sm text-[#52627a]">{t('Este formato no permite marcar un punto. Puede dejar notas privadas del equipo sobre el archivo.','This format does not allow pinning a point. You can leave private team notes on the file.')}</p>}
    {data?.pinnable&&<>
     {isPdf&&pdf&&<div className="flex flex-wrap items-center gap-2 text-sm"><Button type="button" variant="outline" disabled={page<=1||busy} onClick={()=>{setPage(p=>p-1);setDraft(null);}}>{t('Página anterior','Previous page')}</Button><span data-annotation-page>{t(`Página ${page} de ${pdf.numPages}`,`Page ${page} of ${pdf.numPages}`)}</span><Button type="button" variant="outline" disabled={page>=pdf.numPages||busy} onClick={()=>{setPage(p=>p+1);setDraft(null);}}>{t('Página siguiente','Next page')}</Button></div>}
     {viewError?<p role="alert" className="text-sm">{t('No se pudo abrir el archivo para marcarlo. Puede dejar una nota.','Could not open the file to pin it. You can leave a note.')}</p>
      :!(isPdf?pdf:url)?<p role="status" className="text-sm">{t('Cargando archivo…','Loading file…')}</p>
      :<>
       <p className="text-xs text-[#52627a]">{t('Toque o haga clic sobre el archivo para colocar un pin.','Tap or click on the file to drop a pin.')}</p>
       <div ref={frame} data-annotation-surface onClick={place} className="relative mx-auto w-full max-w-3xl cursor-crosshair overflow-hidden rounded-lg border border-[#d7e1ea] bg-white">
        {isPdf?<canvas ref={canvas} aria-label={file.name} className="block h-auto w-full"/>:<img src={url!} alt={file.name} className="block h-auto w-full"/>}
        {visible.map(a=><button key={a.id} type="button" data-annotation-pin={a.id} aria-label={t(`Anotación ${numbered.get(a.id)}: ${a.body}`,`Annotation ${numbered.get(a.id)}: ${a.body}`)} title={a.body} onClick={event=>event.stopPropagation()} style={{left:`${(a.x??0)*100}%`,top:`${(a.y??0)*100}%`}} className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#009FD9] text-xs font-bold text-white shadow">{numbered.get(a.id)}</button>)}
        {draft&&<span data-annotation-draft aria-hidden style={{left:`${draft.x*100}%`,top:`${draft.y*100}%`}} className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-[#e8590c] bg-[#e8590c]/25"/>}
       </div></>}
    </>}
    <form className="space-y-2" onSubmit={event=>{event.preventDefault();void save();}}>
     <label className="block text-sm font-semibold">{draft?t('Comentario del pin','Pin comment'):t('Nota sobre el archivo','Note on the file')}
      <textarea data-annotation-text aria-label={t('Comentario','Comment')} value={text} maxLength={ANNOTATION_MAX_CHARS} rows={3} onChange={event=>setText(event.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal"/></label>
     <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[#52627a]">{text.length}/{ANNOTATION_MAX_CHARS} · {t('Privado del equipo; no se edita ni se borra.','Team private; it cannot be edited or deleted.')}</span>
      <div className="flex flex-wrap gap-2">{draft&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>setDraft(null)}>{t('Quitar pin (dejar como nota)','Remove pin (keep as note)')}</Button>}<Button type="submit" data-annotation-save disabled={busy||!text.trim()}>{busy?t('Guardando…','Saving…'):draft?t('Guardar pin','Save pin'):t('Guardar nota','Save note')}</Button></div></div>
    </form>
    {notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   </div>
   <aside className="min-w-0 space-y-2" aria-label={t('Historial de anotaciones','Annotation history')}>
    <h4 className="font-bold">{t('Historial','History')}{data?` (${data.items.length})`:''}</h4>
    {!data?<p role="status" className="text-sm">{t('Cargando…','Loading…')}</p>:data.items.length===0?<p className="text-sm text-[#52627a]">{t('Todavía no hay anotaciones.','No annotations yet.')}</p>
     :<ol className="max-h-[50vh] space-y-2 overflow-y-auto">{data.items.map(a=><li key={a.id} data-annotation-item={a.kind} className="rounded-xl border border-[#d7e1ea] bg-white p-3 text-sm">
       <p className="text-xs text-[#52627a]">{a.kind==='pin'?<button type="button" className="font-semibold text-[#008bb5] underline" onClick={()=>{if(isPdf&&a.page)setPage(a.page);}}>{t(`Pin ${numbered.get(a.id)}`,`Pin ${numbered.get(a.id)}`)}{isPdf&&a.page?` · ${t('pág.','p.')} ${a.page}`:''}</button>:t('Nota','Note')} · {a.authorName} · {stamp(a.at,en)}</p>
       <p className="mt-1 whitespace-pre-wrap break-words">{a.body}</p></li>)}</ol>}
   </aside>
  </div>
 </Modal>;
}
