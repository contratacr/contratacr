'use client';
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
const noSubscribe=()=>()=>{};
import {Camera,ChevronLeft,ChevronRight,Flag,Maximize2,X} from 'lucide-react';
import {PHOTO_FLAG_REASONS,photoAlt,photoReasonText,placePhotoId,placePhotoSrc} from '@/lib/directory/place-photos';

/**
 * Launch round (2026-11-18): photo gallery of a place. Grid (first photo large from sm up) + lightbox dialog: arrows,
 * ←/→ keys, ESC closes, focus returns to the thumbnail. Alt text = caption, else «Foto N de <lugar>». Uploaded photos can
 * be reported from the lightbox («Reportar foto»).
 */
/** `by` (547): «Foto de <nombre>» of a customer's photo (the name the person's reviews show; never an id); `owner`: a
 *  photo of the business itself; `category`: what it shows (the «Fotos» tab filters by it). */
export type GalleryPhoto={url:string;caption:string|null;by?:string|null;owner?:boolean;category?:import('@/lib/directory/place-photos').PhotoCategory|null};
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const FLAG_TEXT:Record<string,[string,string]>={not_this_place:['No es de este lugar','Not this place'],offensive:['Ofensiva','Offensive'],private_info:['Muestra datos privados o personas','Shows private data or people'],
 copyright:['Es de otra persona (derechos)','Belongs to someone else (copyright)'],spam:['Publicidad o spam','Advertising or spam'],other:['Otro motivo','Other reason']};

/** `mosaic` (2026-11-19, Yelp model): header strip — first photo large, up to four more, «Ver las N fotos» on top.
 *  `hero` (2026-11-26 redesign): fills the place hero (absolute, the parent sets the height). Phones: one photo per
 *  screen width, swiped sideways, with a «1 / N» counter; from sm: the Yelp-like mosaic (one large + up to four). The
 *  same buttons serve both layouts (each photo is rendered once). */
/** `cases` (owner 2026-11-27, «mostrarlas como en profesionales cuando hay fotos»): the production professional profile's
 *  «Casos de éxito» cards (case-showcase.tsx): photos in groups of three, each group one rounded card whose cover fills
 *  the width (16:10) with the «ampliar» mark, the other photos peeking as small squares on the cover, the caption under
 *  it in full; one card per row on phones, two from sm. Every photo is its own button and opens the same lightbox. */
export function PlacePhotoGallery({photos,placeName,en,variant='grid'}:{photos:GalleryPhoto[];placeName:string;en:boolean;variant?:'grid'|'mosaic'|'strip'|'hero'|'cases'}){
 const t=(es:string,english:string)=>en?english:es;
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 const [open,setOpen]=useState<number|null>(null);const opener=useRef<HTMLButtonElement|null>(null);const dialog=useRef<HTMLDivElement>(null);
 const close=useCallback(()=>{setOpen(null);requestAnimationFrame(()=>opener.current?.focus());},[]);
 const step=useCallback((d:number)=>setOpen(i=>i===null?i:(i+d+photos.length)%photos.length),[photos.length]);
 useEffect(()=>{
  if(open===null)return;
  dialog.current?.focus();
  const prev=document.body.style.overflow;document.body.style.overflow='hidden';
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='ArrowRight')step(1);else if(e.key==='ArrowLeft')step(-1);
   else if(e.key==='Tab'&&dialog.current){const f=[...dialog.current.querySelectorAll<HTMLElement>('button,select,textarea,[tabindex="0"]')].filter(x=>!x.hasAttribute('disabled'));
    if(!f.length)return;const first=f[0]!,last=f[f.length-1]!;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
  document.addEventListener('keydown',onKey);return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=prev;};
 },[open,close,step]);
 const alt=(i:number)=>photoAlt(photos[i]?.caption,placeName,i+1,en);
 const cur=open===null?null:photos[open]!;
 const [slide,setSlide]=useState(0);
 const shown=photos.slice(0,5),n=shown.length;
 const heroGrid=n===1?'sm:grid-cols-1':n===2?'sm:grid-cols-2':n===3?'sm:grid-cols-3 sm:grid-rows-2':'sm:grid-cols-4 sm:grid-rows-2';
 return <>
  {variant==='hero'?<div className="absolute inset-0" data-place-photo-strip={n}>
   <ul onScroll={e=>{const el=e.currentTarget;setSlide(Math.round(el.scrollLeft/Math.max(1,el.clientWidth)));}}
    className={`scrollbar-none flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain sm:grid sm:gap-1 sm:overflow-hidden ${heroGrid}`}>
    {shown.map((p,i)=><li key={p.url} className={`h-full w-full shrink-0 snap-center sm:h-auto sm:min-h-0 sm:w-auto ${i===0&&n>2?'sm:col-span-2 sm:row-span-2':''} ${i>0&&n===3?'':''}`}>
     <button type="button" onClick={e=>{opener.current=e.currentTarget;setOpen(i);}} data-place-strip-thumb={i}
      aria-label={t(`Ver foto ${i+1} de ${photos.length}: ${alt(i)}`,`View photo ${i+1} of ${photos.length}: ${alt(i)}`)} className={`group relative block h-full w-full overflow-hidden bg-[#1c2b45] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- same-origin photo route or validated https seed URL */}
      <img draggable={false} src={placePhotoSrc(p.url,i===0?1600:800)} alt={alt(i)} width={i===0?1600:800} height={i===0?1200:600} loading={i===0?'eager':'lazy'} fetchPriority={i===0?'high':undefined} decoding="async"
       className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"/>
      {i===4&&photos.length>5&&<span aria-hidden="true" className="absolute inset-0 hidden place-items-center bg-[#162543]/55 text-xl font-bold text-white sm:grid">+{photos.length-5}</span>}
     </button></li>)}
   </ul>
   {n>1&&<span aria-hidden="true" className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[12px] font-bold tabular-nums text-white backdrop-blur sm:hidden">{Math.min(slide,n-1)+1} / {photos.length}</span>}
   <a href="#fotos" data-place-strip-all className={`absolute right-3 top-3 z-10 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/95 px-3.5 text-[12.5px] font-bold text-[#162543] shadow-md backdrop-blur transition-colors hover:bg-white sm:bottom-5 sm:right-5 sm:top-auto sm:h-10 sm:px-4 sm:text-[13px] ${ring}`}>
    <Camera aria-hidden="true" className="h-4 w-4 shrink-0"/>{photos.length===1?t('Ver la foto','See the photo'):t(`Ver las ${photos.length} fotos`,`See all ${photos.length} photos`)}</a>
  </div>:variant==='strip'?<div data-place-photo-strip={Math.min(photos.length,5)}>
   <ul className={`flex snap-x gap-2 overflow-x-auto pb-1 sm:grid sm:h-[280px] sm:gap-2 sm:overflow-hidden sm:pb-0 ${photos.length===1?'sm:grid-cols-1':photos.length===2?'sm:grid-cols-2':'sm:grid-cols-4 sm:grid-rows-2'}`}>
    {photos.slice(0,5).map((p,i)=><li key={p.url} className={`h-32 w-44 shrink-0 snap-start sm:h-auto sm:min-h-0 sm:w-auto ${i===0&&photos.length>2?'max-sm:h-32 max-sm:w-56 sm:col-span-2 sm:row-span-2':''} ${i>0&&photos.length===3?'sm:col-span-2':''}`}>
     <button type="button" onClick={e=>{opener.current=e.currentTarget;setOpen(i);}} data-place-strip-thumb={i}
      aria-label={t(`Ver foto ${i+1} de ${photos.length}: ${alt(i)}`,`View photo ${i+1} of ${photos.length}: ${alt(i)}`)} className={`group relative block h-full w-full overflow-hidden rounded-xl bg-slate-100 ${ring}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- same-origin photo route or validated https seed URL */}
      <img draggable={false} src={placePhotoSrc(p.url,i===0?800:320)} alt={alt(i)} width={i===0?800:320} height={i===0?600:240} loading={i===0?'eager':'lazy'} decoding="async" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"/>
      {i===4&&photos.length>5&&<span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-[#162543]/60 text-lg font-bold text-white">+{photos.length-5}</span>}
     </button></li>)}
   </ul>
   <a href="#fotos" data-place-strip-all className={`mt-2 inline-flex min-h-11 items-center text-[13px] font-bold text-[#009FD9] hover:underline ${ring}`}>
    {photos.length===1?t('Ver la foto','See the photo'):t(`Ver las ${photos.length} fotos`,`See all ${photos.length} photos`)}</a>
  </div>:variant==='mosaic'?<div className="relative" data-place-gallery={photos.length} data-ready={ready||undefined}>
   <ul className={`grid h-56 gap-1.5 overflow-hidden rounded-3xl sm:h-[360px] ${photos.length===1?'grid-cols-1':photos.length===2?'grid-cols-2':photos.length<5?'grid-cols-3 grid-rows-2':'grid-cols-4 grid-rows-2'}`}>
    {photos.slice(0,5).map((p,i)=><li key={p.url} className={`min-h-0 ${i===0&&photos.length>2?'col-span-2 row-span-2':''} ${i>0&&photos.length>2?'hidden sm:block':''} ${i===0&&photos.length>2?'max-sm:col-span-full max-sm:row-span-full':''}`}>
     <button type="button" onClick={e=>{opener.current=e.currentTarget;setOpen(i);}} data-place-photo-thumb={i}
      aria-label={t(`Ver foto ${i+1} de ${photos.length}: ${alt(i)}`,`View photo ${i+1} of ${photos.length}: ${alt(i)}`)} className={`group block h-full w-full overflow-hidden bg-slate-100 ${ring}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- same-origin photo route or validated https seed URL */}
      <img draggable={false} src={placePhotoSrc(p.url,i===0?1600:800)} alt={alt(i)} loading={i===0?'eager':'lazy'} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"/>
     </button></li>)}
   </ul>
   <button type="button" data-place-photos-all onClick={e=>{opener.current=e.currentTarget;setOpen(0);}}
    className={`absolute bottom-3 right-3 inline-flex min-h-11 items-center rounded-full bg-white/95 px-4 text-sm font-bold text-[#162543] shadow-md backdrop-blur hover:bg-white ${ring}`}>
    {photos.length===1?t('Ver la foto','See the photo'):t(`Ver las ${photos.length} fotos`,`See all ${photos.length} photos`)}</button>
  </div>:variant==='cases'?<ul className="grid grid-cols-1 gap-5 sm:grid-cols-2" data-place-gallery={photos.length} data-place-photo-cases data-ready={ready||undefined}>
   {Array.from({length:Math.ceil(photos.length/3)},(_,g)=>g*3).map(start=>{const group=photos.slice(start,start+3),cover=group[0]!;
    const label=(i:number)=>t(`Ver foto ${i+1} de ${photos.length}: ${alt(i)}`,`View photo ${i+1} of ${photos.length}: ${alt(i)}`);
    return <li key={cover.url} className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm transition-shadow hover:shadow-md">
     <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#eef3f8]">
      <button type="button" onClick={e=>{opener.current=e.currentTarget;setOpen(start);}} data-place-photo-thumb={start} aria-label={label(start)} className={`group block h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[#009FD9]`}>
       {/* eslint-disable-next-line @next/next/no-img-element -- same-origin photo route or validated https seed URL */}
       <img draggable={false} src={placePhotoSrc(cover.url,800)} alt={alt(start)} loading={start===0?'eager':'lazy'} decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"/>
       <span aria-hidden="true" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-[#08111f]/55 text-white backdrop-blur-sm transition-colors group-hover:bg-[#08111f]/75">
        <Maximize2 className="h-[18px] w-[18px]" strokeWidth={2.4}/></span>
      </button>
      {group.length>1&&<div className="absolute bottom-3 left-3 flex items-center gap-1.5">
       {group.slice(1).map((p,k)=><button key={p.url} type="button" onClick={e=>{opener.current=e.currentTarget;setOpen(start+1+k);}} data-place-photo-thumb={start+1+k} aria-label={label(start+1+k)} className={`relative h-10 w-10 overflow-hidden rounded-lg border border-white/70 bg-white/20 shadow-sm backdrop-blur-sm ${ring}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- same-origin photo route or validated https seed URL */}
        <img draggable={false} src={placePhotoSrc(p.url,320)} alt={alt(start+1+k)} loading="lazy" decoding="async" className="h-full w-full object-cover"/></button>)}
      </div>}
     </div>
     {cover.caption&&<p className="p-4 text-[14px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]">{cover.caption}</p>}
    </li>;})}
  </ul>:
  <ul className={`grid gap-2 ${photos.length===1?'grid-cols-1 sm:max-w-md':photos.length===2?'grid-cols-2 sm:max-w-2xl':'grid-cols-2 sm:grid-cols-4'}`} data-place-gallery={photos.length} data-ready={ready||undefined}>
   {photos.slice(0,photos.length>5?5:photos.length).map((p,i)=><li key={p.url} className={i===0&&photos.length>2?'col-span-2 row-span-2':''}>
    <button type="button" onClick={e=>{opener.current=e.currentTarget;setOpen(i);}} data-place-photo-thumb={i}
     aria-label={t(`Ver foto ${i+1} de ${photos.length}: ${alt(i)}`,`View photo ${i+1} of ${photos.length}: ${alt(i)}`)} className={`group relative block w-full overflow-hidden rounded-xl bg-slate-100 ${ring}`}>
     {/* eslint-disable-next-line @next/next/no-img-element -- same-origin photo route or validated https seed URL */}
     <img draggable={false} src={placePhotoSrc(p.url,i===0?800:320)} alt={alt(i)} loading={i===0?'eager':'lazy'} className={`w-full object-cover transition group-hover:scale-[1.02] ${i===0&&photos.length>2?'aspect-square sm:aspect-auto sm:h-full':'aspect-square'}`}/>
     {i===4&&photos.length>5&&<span className="absolute inset-0 grid place-items-center bg-[#162543]/60 text-lg font-bold text-white">+{photos.length-5}</span>}
    </button></li>)}
  </ul>}
  {cur&&open!==null&&<div ref={dialog} role="dialog" aria-modal="true" aria-label={t(`Foto ${open+1} de ${photos.length}`,`Photo ${open+1} of ${photos.length}`)} tabIndex={-1} data-place-lightbox
   className="fixed inset-0 z-[60] flex flex-col bg-[#0b1220] text-white outline-none" onClick={e=>{if(e.target===e.currentTarget)close();}}>
   <div className="flex items-center justify-between gap-2 p-3">
    <p className="text-sm" aria-live="polite">{open+1} / {photos.length}</p>
    <button type="button" onClick={close} aria-label={t('Cerrar (Esc)','Close (Esc)')} data-place-lightbox-close className={`grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/20 ${ring}`}><X aria-hidden className="h-5 w-5"/></button>
   </div>
   <div className="relative flex min-h-0 flex-1 items-center justify-center px-2" onClick={e=>{if(e.target===e.currentTarget)close();}}>
    {/* eslint-disable-next-line @next/next/no-img-element -- same-origin photo route or validated https seed URL */}
    <img draggable={false} src={placePhotoSrc(cur.url,1600)} alt={alt(open)} className="max-h-full max-w-full rounded-lg object-contain"/>
    {photos.length>1&&<>
     <button type="button" onClick={()=>step(-1)} aria-label={t('Foto anterior','Previous photo')} className={`absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 hover:bg-white/25 ${ring}`}><ChevronLeft aria-hidden className="h-6 w-6"/></button>
     <button type="button" onClick={()=>step(1)} aria-label={t('Foto siguiente','Next photo')} data-place-lightbox-next className={`absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 hover:bg-white/25 ${ring}`}><ChevronRight aria-hidden className="h-6 w-6"/></button>
    </>}
   </div>
   <div className="mx-auto w-full max-w-3xl space-y-2 p-4 text-sm">
    {cur.caption&&<p>{cur.caption}</p>}
    {(cur.by||cur.owner)&&<p data-photo-by className="text-[12.5px] text-white/75">{cur.owner?t('Foto del negocio','Photo by the business'):t(`Foto de ${cur.by}`,`Photo by ${cur.by}`)}</p>}
    {placePhotoId(cur.url)&&<PhotoCredit key={'c'+cur.url} id={placePhotoId(cur.url)!} en={en}/>}
    {placePhotoId(cur.url)&&<ReportPhoto key={cur.url} id={placePhotoId(cur.url)!} en={en}/>}
   </div>
  </div>}
 </>;
}

type Credit={author:string|null;license:string|null;licenseUrl:string|null;sourceUrl:string|null;provider:string|null};
/** Credit of a freely licensed photo (Wikimedia Commons / Openverse): «Foto: <Autor> · <Licencia> · Wikimedia Commons», linked to the source page. Nothing for uploaded photos. */
function PhotoCredit({id,en}:{id:string;en:boolean}){
 const [credit,setCredit]=useState<Credit|null>(null);
 useEffect(()=>{let live=true;
  fetch(`/api/fotos-lugar/${id}?meta=1`).then(r=>r.ok?r.json():null).then((j:{attribution?:Credit|null}|null)=>{if(live)setCredit(j?.attribution??null);}).catch(()=>{});
  return()=>{live=false;};},[id]);
 if(!credit||!credit.sourceUrl||!credit.license)return null;
 const link='underline decoration-white/40 hover:text-white';
 return <p data-photo-credit className="text-[12.5px] text-white/75">{en?'Photo':'Foto'}: {credit.author?`${credit.author} · `:''}
  {credit.licenseUrl?<a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer license" className={link}>{credit.license}</a>:credit.license}
  {' · '}<a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer" className={link}>{credit.provider??'Wikimedia Commons'}</a></p>;
}

function ReportPhoto({id,en}:{id:string;en:boolean}){
 const t=(es:string,english:string)=>en?english:es;
 const [open,setOpen]=useState(false),[reason,setReason]=useState<string>('not_this_place'),[message,setMessage]=useState(''),[state,setState]=useState<'idle'|'sending'|'sent'>('idle'),[error,setError]=useState<string|null>(null);
 const flagId=useRef('');
 if(state==='sent')return <p role="status" data-photo-report-sent className="text-emerald-200">{t('Gracias. El equipo revisará la foto.','Thank you. The team will review the photo.')}</p>;
 if(!open)return <button type="button" onClick={()=>setOpen(true)} data-photo-report className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-white/80 underline hover:text-white ${ring}`}><Flag aria-hidden className="h-4 w-4"/>{t('Reportar foto','Report photo')}</button>;
 return <form className="flex flex-wrap items-end gap-2" onSubmit={async e=>{e.preventDefault();if(!flagId.current)flagId.current=crypto.randomUUID();setState('sending');setError(null);
   try{const r=await fetch(`/api/fotos-lugar/${id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({flagId:flagId.current,reason,...(message.trim()?{message:message.trim()}:{})})});
    const j=await r.json().catch(()=>({})) as {reason?:string};if(r.ok){setState('sent');return;}setState('idle');
    setError(j.reason==='message_required'?t('Explique el motivo (al menos 5 caracteres).','Explain the reason (at least 5 characters).'):photoReasonText(j.reason,en));}catch{setState('idle');setError(photoReasonText('unavailable',en));}}}>
  <label className="flex flex-col gap-1">{t('Motivo','Reason')}
   <select value={reason} onChange={e=>setReason(e.target.value)} className="min-h-11 rounded-xl bg-white px-3 text-base text-[#162543]">{PHOTO_FLAG_REASONS.map(r=><option key={r} value={r}>{FLAG_TEXT[r]![en?1:0]}</option>)}</select></label>
  <label className="flex min-w-48 flex-1 flex-col gap-1">{t('Detalle (opcional)','Details (optional)')}
   <input value={message} onChange={e=>setMessage(e.target.value)} maxLength={500} className="min-h-11 rounded-xl bg-white px-3 text-base text-[#162543]"/></label>
  <button type="submit" disabled={state==='sending'} className={`min-h-11 rounded-full bg-white px-4 font-semibold text-[#162543] disabled:opacity-60 ${ring}`}>{t('Enviar reporte','Send report')}</button>
  {error&&<p role="alert" className="w-full text-red-200">{error}</p>}
 </form>;
}
