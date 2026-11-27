'use client';
import {useEffect,useId,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
const noSubscribe=()=>()=>{};
import {ImagePlus,X} from 'lucide-react';
import {PUBLIC_IMAGE_OPTIONS,prepareImageForUpload} from '@/lib/client-image-upload';
import {makePlaceVariants} from '@/lib/client-image-variants';
import {useRouter} from 'next/navigation';
import {InstagramImportButton} from '@/components/integrations/instagram-import';
import {INSTAGRAM_IMPORT_UI_ENABLED} from '@/lib/integrations/instagram/enabled-client';
import {PLACE_PHOTO_ACCEPT,PLACE_PHOTO_BATCH,checkPhotoPick,photoReasonText} from '@/lib/directory/place-photos';

/**
 * Launch round (2026-11-18): «Agregar fotos» of a place and photo picker of the review form.
 * The native <input type=file> is visually hidden behind a labelled button, so the browser's own (English) «Choose file /
 * No file chosen» text never shows on the Spanish site. HEIC/large photos are converted/compressed in the browser first
 * (prepareImageForUpload); the server validates and re-encodes everything again.
 */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
export type UploadOutcome={ok:number;pending:number;errors:string[]};

export async function uploadPlacePhotos(slug:string,files:File[],{review=false,caption,en}:{review?:boolean;caption?:string;en:boolean}):Promise<UploadOutcome>{
 const out:UploadOutcome={ok:0,pending:0,errors:[]};
 for(const original of files){
  // Storage plan 2026-11-26: the browser makes the 1600/800/320 variants itself (WebP, or JPEG without a WebP encoder),
  // so the server only validates them; without them it falls back to the single prepared file.
  // A source this browser cannot decode directly (e.g. HEIC) is converted first and the variants made from that JPEG.
  let variants=await makePlaceVariants(original).catch(()=>null);
  let file:File;
  if(variants)file=variants.v1600;
  else{
   try{file=await prepareImageForUpload(original,PUBLIC_IMAGE_OPTIONS);}catch{out.errors.push(`${original.name}: ${photoReasonText('format',en)}`);continue;}
   variants=await makePlaceVariants(file).catch(()=>null);if(variants)file=variants.v1600;
  }
  const form=new FormData();form.set('file',file);if(variants){form.set('v800',variants.v800);form.set('v320',variants.v320);}form.set('uploadId',crypto.randomUUID());if(caption)form.set('caption',caption);if(review)form.set('review','1');
  try{
   const r=await fetch(`/api/lugar/${encodeURIComponent(slug)}/fotos`,{method:'POST',body:form,headers:{'accept-language':en?'en':'es'}});
   const j=await r.json().catch(()=>({})) as {reason?:string;error?:string;photo?:{status?:string}};
   if(r.ok){if(j.photo?.status==='pending')out.pending++;else out.ok++;continue;}
   const text=j.reason?.startsWith('photo_')&&j.error?j.error:r.status===429&&!j.reason?photoReasonText('limit',en):photoReasonText(j.reason,en);
   out.errors.push(`${original.name}: ${text}`);
  }catch{out.errors.push(`${original.name}: ${photoReasonText('unavailable',en)}`);}
 }
 return out;
}

/** Labelled picker: a real button-styled <label> for a hidden file input, plus the chosen files as removable chips. */
export function PhotoPicker({files,onChange,en,label,max=PLACE_PHOTO_BATCH,disabled}:{files:File[];onChange:(f:File[])=>void;en:boolean;label?:string;max?:number;disabled?:boolean}){
 const id=useId(),[warn,setWarn]=useState<string|null>(null);
 const t=(es:string,english:string)=>en?english:es;
 return <div className="space-y-2" data-photo-picker>
  <input id={id} type="file" accept={PLACE_PHOTO_ACCEPT} multiple className="peer sr-only" disabled={disabled} data-photo-input
   onChange={e=>{const picked=[...(e.target.files??[])];e.target.value='';const bad=picked.map(f=>({f,c:checkPhotoPick(f)})).filter(x=>!x.c.ok);
    setWarn(bad.length?bad.map(x=>`${x.f.name}: ${photoReasonText((x.c as {reason:string}).reason,en)}`).join(' '):null);
    const next=[...files,...picked.filter(f=>checkPhotoPick(f).ok)].slice(0,max);if(files.length+picked.length>max)setWarn(t(`Puede elegir hasta ${max} fotos a la vez.`,`You can choose up to ${max} photos at a time.`));onChange(next);}}/>
  <label htmlFor={id} data-photo-choose className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[#162543] bg-white px-4 text-sm font-semibold text-[#162543] hover:bg-[#F7FAFC] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#009FD9] ${disabled?'pointer-events-none opacity-50':''}`}>
   <ImagePlus aria-hidden className="h-4 w-4"/>{label??t('Elegir fotos','Choose photos')}</label>
  <p className="text-xs text-slate-600">{files.length===0?t('Ninguna foto elegida. JPG, PNG, WebP o HEIC.','No photo chosen. JPG, PNG, WebP or HEIC.'):t(`${files.length} ${files.length===1?'foto elegida':'fotos elegidas'}`,`${files.length} ${files.length===1?'photo':'photos'} chosen`)}</p>
  {files.length>0&&<ul className="flex flex-wrap gap-2">{files.map((f,i)=><li key={f.name+i} className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-xs">
   <span className="truncate">{f.name}</span>
   <button type="button" aria-label={t(`Quitar ${f.name}`,`Remove ${f.name}`)} onClick={()=>onChange(files.filter((_,j)=>j!==i))} className={`grid h-7 w-7 place-items-center rounded-full hover:bg-slate-200 ${ring}`}><X aria-hidden className="h-3.5 w-3.5"/></button></li>)}</ul>}
  {warn&&<p role="alert" className="text-xs font-semibold text-red-800">{warn}</p>}
 </div>;
}

/** «Agregar fotos» of a place. Owner/team: published at once; others: pending review. `popover` (2026-11-19, action bar
 *  of the Yelp-model header): the button sits in the bar and the panel/result open as a floating card under it. */
/** `openOn` + `hideButton` (2026-11-27): the place page's «…» sheet on phones opens the same panel through a window event. */
export function PlacePhotoUpload({slug,locale,signedIn,loginHref,isManager,popover=false,buttonClass,openOn,hideButton=false}:{slug:string;locale:string;signedIn:boolean;loginHref:string|null;isManager:boolean;popover?:boolean;buttonClass?:string;openOn?:string;hideButton?:boolean}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const [open,setOpen]=useState(false),[files,setFiles]=useState<File[]>([]),[caption,setCaption]=useState(''),[busy,setBusy]=useState(false);
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 const [result,setResult]=useState<UploadOutcome|null>(null);const captionId=useId();
 // Owner 2026-11-27: everyone confirms the photos are theirs or that they have permission (Terms §10) before uploading.
 const [rights,setRights]=useState(false);const panel=useRef<HTMLDivElement>(null);const router=useRouter();
 useEffect(()=>{if(!openOn)return;const on=()=>{setOpen(true);setResult(null);};window.addEventListener(openOn,on);return()=>window.removeEventListener(openOn,on);},[openOn]);
 const btn=`inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold ${ring}`;
 const openClass=buttonClass??`${btn} border border-[#162543] text-[#162543] hover:bg-[#F7FAFC]`;
 // Phones: a bottom sheet (the button lives in a sliding chip row that clips anything hanging below it); lg: a card under the button.
 const float=popover?'fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-[120] max-h-[80vh] overflow-y-auto bg-white shadow-2xl lg:absolute lg:inset-x-auto lg:bottom-auto lg:left-0 lg:top-full lg:z-30 lg:mt-2 lg:max-h-none lg:w-[26rem] lg:shadow-xl':'';
 if(!signedIn)return <span data-place-photo-add className="inline-flex"><a href={loginHref??'/login'} className={openClass}><ImagePlus aria-hidden className="h-4 w-4"/>{t('Agregar fotos','Add photos')}</a></span>;
 let summary:ReactNode=null;
 if(result){
  summary=<div role="status" data-place-photo-result className={`space-y-1 rounded-xl bg-[#F7FAFC] p-3 text-sm`}>
   {result.ok>0&&<p className="font-semibold text-emerald-900">{t(`${result.ok===1?'Se publicó 1 foto':`Se publicaron ${result.ok} fotos`}. Recargue la página para verlas.`,`${result.ok===1?'1 photo was':`${result.ok} photos were`} published. Reload the page to see them.`)}</p>}
   {result.pending>0&&<p className="font-semibold text-[#162543]" data-place-photo-pending>{t(`Gracias. ${result.pending===1?'Su foto quedó':`Sus ${result.pending} fotos quedaron`} pendiente${result.pending===1?'':'s'} de revisión; aparecerá${result.pending===1?'':'n'} cuando el equipo de ContrataCR la${result.pending===1?'':'s'} apruebe.`,`Thank you. ${result.pending===1?'Your photo is':`Your ${result.pending} photos are`} awaiting review and will appear once the ContrataCR team approves ${result.pending===1?'it':'them'}.`)}</p>}
   {result.errors.map(e=><p key={e} className="text-red-800">{e}</p>)}
  </div>;
 }
 return <div className={popover?'relative inline-flex':'space-y-3'} data-place-photo-add>
  {!hideButton&&(!open||popover)&&<button type="button" data-place-photo-open data-ready={ready||undefined} aria-expanded={popover?open:undefined} onClick={()=>{setOpen(popover?!open:true);setResult(null);}} className={openClass}><ImagePlus aria-hidden className="h-4 w-4"/>{t('Agregar fotos','Add photos')}</button>}
  {open&&<div ref={panel} className={`space-y-3 rounded-2xl border border-[#d7e1ea] p-4 ${float}`} data-place-photo-panel>
   <p className="text-sm text-slate-700">{isManager?t('Como administrador de la empresa, sus fotos se publican de inmediato. Cualquier persona puede reportarlas.','As the business manager, your photos are published right away. Anyone can report them.')
    :t('Sus fotos se revisan antes de publicarse. Suba solo fotos tomadas por usted, sin personas reconocibles ni datos privados.','Your photos are reviewed before they are published. Only upload photos you took, without recognisable people or private data.')}</p>
   <PhotoPicker files={files} onChange={setFiles} en={en} disabled={busy}/>
   {/* 2026-11-27: managers can also bring photos from the business's own Instagram (docs/instagram-import.md). */}
   {isManager&&INSTAGRAM_IMPORT_UI_ENABLED&&<InstagramImportButton target="place" slug={slug} locale={locale} disabled={busy} onImported={()=>router.refresh()}/>}
   <label htmlFor={captionId} className="flex flex-col gap-1 text-sm font-medium">{t('Descripción (opcional)','Caption (optional)')}
    <input id={captionId} value={caption} onChange={e=>setCaption(e.target.value)} maxLength={200} placeholder={t('Ej.: Terraza del segundo piso','E.g. Second-floor terrace')} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543]"/></label>
   <label className="flex items-start gap-2.5 text-sm text-[#334155]" data-place-photo-rights>
    <input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)} disabled={busy} className="mt-0.5 h-5 w-5 shrink-0 accent-[#009FD9]"/>
    <span>{t('Confirmo que tomé estas fotos o tengo permiso para publicarlas. No son de Google Maps, redes sociales ni otros sitios.','I confirm I took these photos or have permission to publish them. They are not from Google Maps, social networks or other sites.')}</span>
   </label>
   <div className="flex flex-wrap gap-2">
    <button type="button" data-place-photo-submit disabled={busy||files.length===0||!rights} onClick={async()=>{setBusy(true);setResult(null);
      const r=await uploadPlacePhotos(slug,files,{caption:caption.trim()||undefined,en});setBusy(false);setResult(r);if(!r.errors.length){setFiles([]);setCaption('');setRights(false);}}}
     className={`${btn} bg-[#162543] text-white disabled:opacity-50`}>{busy?t('Subiendo…','Uploading…'):t('Subir fotos','Upload photos')}</button>
    <button type="button" disabled={busy} onClick={()=>{setOpen(false);setFiles([]);}} className={`${btn} text-[#162543] underline`}>{t('Cancelar','Cancel')}</button>
   </div>
   {popover&&summary}
  </div>}
  {!popover&&summary}
 </div>;
}
