'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {proposalDesignSchema,proposalFilesSchema,proposalPublicationSchema,proposalResultSchema,type ProposalDesign,type ProposalFiles,type ProposalImage,type ProposalPublication} from '@/lib/pro/estimate-proposals';

/**
 * Ronda F2-B (row 39): visual proposal. The owner designs a cover, introduction, closing and photos taken from the
 * existing company or job files, then applies it to an open shared version. The customer (and the owner) see the
 * applied snapshot around the existing per-line approval. Nothing is uploaded or sent from here.
 */
const api='/api/pro/quote-proposals';
const COPY={
 es:{design:'Diseñar propuesta visual',designTitle:'Propuesta visual',designIntro:'Prepare la portada, una introducción y fotos de sus archivos para cada sección o partida. El cliente la ve solo cuando usted la aplica a una versión compartida.',
  coverTitle:'Título de la portada',intro:'Introducción',closing:'Cierre',save:'Guardar textos',saved:'Se guardó la propuesta.',coverPhoto:'Foto de portada',sectionPhotos:'Fotos de la sección',linePhotos:'Fotos de la partida',
  addPhoto:'Agregar foto',remove:'Quitar',up:'Subir',down:'Bajar',pick:'Elegir foto de sus archivos',search:'Buscar por nombre o trabajo',noFiles:'No hay fotos JPEG en Archivos de la empresa ni en los archivos de sus trabajos.',
  company:'Archivos de la empresa',work:'Trabajo',caption:'Pie de foto (opcional)',unavailable:'Archivo no disponible',sections:'Secciones',lines:'Partidas',noSection:'Sin sección',
  apply:(v:number)=>`Mostrar al cliente en la versión ${v}`,applied:(v:number)=>`La versión ${v} muestra este diseño.`,older:(v:number)=>`La versión ${v} muestra un diseño anterior.`,notApplied:(v:number)=>`La versión ${v} todavía no muestra la propuesta.`,
  closed:'Las versiones aceptadas, rechazadas o retiradas conservan el diseño que tenían.',noOpen:'Comparta una versión para poder mostrarle la propuesta al cliente.',changed:'La propuesta cambió en otra pestaña. Se recargó.',
  failed:'No se pudo guardar. Reintente: no se duplicará.',limit:'Llegó al máximo de fotos para este lugar.',loading:'Cargando…',loadFailed:'No se pudo cargar la propuesta.',retry:'Reintentar',close:'Cerrar',
  appliedNotice:(v:number)=>`El cliente ya ve la propuesta en la versión ${v}.`,photoOf:(n:string)=>`Foto: ${n}`,proposalFor:'Propuesta para usted',ownerPreview:'Así ve el cliente la propuesta de esta versión.',photos:(n:number)=>n===1?'1 foto':`${n} fotos`},
 en:{design:'Design visual proposal',designTitle:'Visual proposal',designIntro:'Prepare the cover, an introduction and photos from your files for each section or item. The customer sees it only when you apply it to a shared version.',
  coverTitle:'Cover title',intro:'Introduction',closing:'Closing',save:'Save texts',saved:'The proposal was saved.',coverPhoto:'Cover photo',sectionPhotos:'Section photos',linePhotos:'Item photos',
  addPhoto:'Add photo',remove:'Remove',up:'Move up',down:'Move down',pick:'Choose a photo from your files',search:'Search by name or job',noFiles:'There are no JPEG photos in Company files or in your job files.',
  company:'Company files',work:'Job',caption:'Caption (optional)',unavailable:'File not available',sections:'Sections',lines:'Items',noSection:'No section',
  apply:(v:number)=>`Show to the customer in version ${v}`,applied:(v:number)=>`Version ${v} shows this design.`,older:(v:number)=>`Version ${v} shows an earlier design.`,notApplied:(v:number)=>`Version ${v} does not show the proposal yet.`,
  closed:'Accepted, declined or withdrawn versions keep the design they had.',noOpen:'Share a version to be able to show the proposal to the customer.',changed:'The proposal changed in another tab. It was reloaded.',
  failed:'Could not save. Retry: it will not be duplicated.',limit:'You reached the maximum number of photos for this place.',loading:'Loading…',loadFailed:'Could not load the proposal.',retry:'Retry',close:'Close',
  appliedNotice:(v:number)=>`The customer now sees the proposal in version ${v}.`,photoOf:(n:string)=>`Photo: ${n}`,proposalFor:'Proposal for you',ownerPreview:'This is how the customer sees the proposal of this version.',photos:(n:number)=>n===1?'1 photo':`${n} photos`},
};
function useCopy(){const l=useLocale()==='en'?'en':'es';return COPY[l];}
const field='mt-1 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base text-[#162543]';
type Snapshot=NonNullable<ProposalPublication['proposal']>;
export type ProposalSnapshotImage=Snapshot['images'][number];

// One request per publication shared by the cover, the line cards and the closing.
const cache=new Map<string,Promise<ProposalPublication|null>>();
const listeners=new Set<(key:string)=>void>();
function loadPublication(actor:string,publicationId:string,force=false){const key=actor+':'+publicationId;
 if(force||!cache.has(key))cache.set(key,fetch(api+'?'+new URLSearchParams({view:'publication',publicationId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}}).then(async r=>r.ok?proposalPublicationSchema.parse(await r.json()):null).catch(()=>null));
 return cache.get(key)!;}
export function useProposalPublication(actor:string,publicationId:string){
 const [data,setData]=useState<ProposalPublication|null>(null);
 useEffect(()=>{let live=true;const key=actor+':'+publicationId;const run=()=>void loadPublication(actor,publicationId).then(v=>{if(live)setData(v);});run();const on=(k:string)=>{if(k===key)run();};listeners.add(on);return()=>{live=false;listeners.delete(on);};},[actor,publicationId]);
 return data;
}
function refreshPublication(actor:string,publicationId:string){void loadPublication(actor,publicationId,true).then(()=>{for(const l of listeners)l(actor+':'+publicationId);});}
export const proposalImageUrl=(publicationId:string,imageId:string)=>api+'?'+new URLSearchParams({view:'image',publicationId,imageId});

/** Photos of one place (section or line), first one large. */
export function ProposalGallery({publicationId,images,compact=false}:{publicationId:string;images:ProposalSnapshotImage[];compact?:boolean}){
 const c=useCopy();const [index,setIndex]=useState(0);if(!images.length)return null;const current=images[Math.min(index,images.length-1)];
 return <figure data-proposal-gallery className="min-w-0 space-y-1.5">
  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin JPEG verified by size and SHA-256. */}
  <img data-proposal-photo={current.imageId} src={proposalImageUrl(publicationId,current.imageId)} alt={current.caption||c.photoOf(String(index+1))} loading="lazy" className={`w-full rounded-xl border border-[#e5e7eb] bg-[#f3f8fb] object-cover ${compact?'aspect-[4/3]':'aspect-[16/9]'}`}/>
  {current.caption&&<figcaption className="text-xs text-[#52627a]">{current.caption}</figcaption>}
  {images.length>1&&<div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={c.photos(images.length)}>{images.map((img,i)=><button key={img.imageId} type="button" aria-label={c.photoOf(img.caption||String(i+1))} aria-pressed={i===index} onClick={()=>setIndex(i)}
   className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${i===index?'border-[#008bb5]':'border-transparent'}`}>
   {/* eslint-disable-next-line @next/next/no-img-element -- same authenticated thumbnail. */}
   <img src={proposalImageUrl(publicationId,img.imageId)} alt="" loading="lazy" className="h-full w-full object-cover"/></button>)}</div>}
 </figure>;
}

/** Cover and introduction above the shared document (owner and customer). Owner: entry to the designer. */
export function ProposalCover({actor,publicationId,side,estimateId}:{actor:string;publicationId:string;side:'owner'|'client';estimateId:string|null}){
 const c=useCopy(),data=useProposalPublication(actor,publicationId),[open,setOpen]=useState(false);const p=data?.proposal??null;
 const cover=p?.images.find(i=>i.target==='cover');
 return <div className="min-w-0 space-y-3">
  {side==='owner'&&estimateId&&<div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-[#52627a]">{p?c.ownerPreview:''}</p><Button type="button" variant="outline" data-proposal-design-open data-pro-write="sales.write" onClick={()=>setOpen(true)}>{c.design}</Button></div>}
  {p&&(p.coverTitle||p.intro||cover)&&<section data-proposal-cover className="min-w-0 overflow-hidden rounded-2xl border border-[#d7e1ea] bg-white">
   {cover&&<div className="relative">
    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin JPEG verified by size and SHA-256. */}
    <img data-proposal-photo={cover.imageId} src={proposalImageUrl(publicationId,cover.imageId)} alt={cover.caption||p.coverTitle} className="aspect-[16/9] w-full object-cover sm:aspect-[21/9]"/>
    {p.coverTitle&&<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0b1a33]/85 via-[#0b1a33]/40 to-transparent px-4 pb-4 pt-12 sm:px-6"><p className="text-xs font-semibold uppercase tracking-wider text-white/80">{c.proposalFor}</p><h3 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{p.coverTitle}</h3></div>}
   </div>}
   <div className="space-y-2 p-4 sm:p-6">{!cover&&p.coverTitle&&<><p className="text-xs font-semibold uppercase tracking-wider text-[#008bb5]">{c.proposalFor}</p><h3 className="text-2xl font-bold text-[#162543]">{p.coverTitle}</h3></>}
    {cover?.caption&&<p className="text-xs text-[#52627a]">{cover.caption}</p>}
    {p.intro&&<div data-proposal-intro className="space-y-2 text-[15px] leading-relaxed text-[#2b3a55]">{p.intro.split(/\n{2,}/).map((para,i)=><p key={i} className="whitespace-pre-line">{para}</p>)}</div>}</div>
  </section>}
  {open&&estimateId&&<ProposalDesigner actor={actor} estimateId={estimateId} focusPublicationId={publicationId} onClose={()=>setOpen(false)}/>}
 </div>;
}
export function ProposalClosing({actor,publicationId}:{actor:string;publicationId:string}){
 const data=useProposalPublication(actor,publicationId);const closing=data?.proposal?.closing;if(!closing)return null;
 return <section data-proposal-closing className="rounded-2xl bg-[#f3f8fb] p-4 text-[15px] leading-relaxed text-[#2b3a55] sm:p-5">{closing.split(/\n{2,}/).map((para,i)=><p key={i} className="whitespace-pre-line">{para}</p>)}</section>;
}

// ===================== Designer (owner) =====================
function ProposalDesigner({actor,estimateId,focusPublicationId,onClose}:{actor:string;estimateId:string;focusPublicationId:string;onClose:()=>void}){
 const c=useCopy();
 const [design,setDesign]=useState<ProposalDesign|null>(null),[texts,setTexts]=useState({coverTitle:'',intro:'',closing:''}),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[picker,setPicker]=useState<{target:ProposalImage['target'];targetKey:string;label:string}|null>(null),[failed,setFailed]=useState(false);
 const pending=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async()=>{try{setFailed(false);const r=await fetch(api+'?'+new URLSearchParams({view:'design',estimateId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error();const d=proposalDesignSchema.parse(await r.json());setDesign(d);setTexts({coverTitle:d.coverTitle,intro:d.intro,closing:d.closing});setDirty(false);}catch{setFailed(true);}},[actor,estimateId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function send(body:Record<string,unknown>,onOk?:(r:ReturnType<typeof proposalResultSchema.parse>)=>void){if(!design||busy)return;const full={...body,estimateId,revision:design.revision},key=JSON.stringify(full);
  if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};setBusy(true);setError('');setNotice('');
  try{const r=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify({...full,actionId:pending.current.id})});
   if(r.status===409){pending.current=null;setError(c.changed);await load();return;}
   if(r.status===400){pending.current=null;const b=await r.json().catch(()=>null) as {reason?:string}|null;setError(b?.reason==='photo_limit'?c.limit:c.failed);return;}if(!r.ok)throw Error();
   const res=proposalResultSchema.parse(await r.json());pending.current=null;setDesign(d=>d?{...d,...res.proposal}:d);onOk?.(res);
   if(res.action==='publish'){await load();}
  }catch{setError(c.failed);}finally{setBusy(false);}}
 const imgs=(target:ProposalImage['target'],key:string)=>design?.images.filter(i=>i.target===target&&i.targetKey===key)??[];
 const sections=design?[...new Set(design.lines.map(l=>l.group).filter((g):g is string=>!!g))]:[];
 const draftUrl=(i:ProposalImage)=>api+'?'+new URLSearchParams({view:'draft-image',estimateId,source:i.source,fileId:i.fileId});
 const slot=(target:ProposalImage['target'],key:string,label:string,max:number)=>{const list=imgs(target,key);return <div data-proposal-slot={target+':'+key} className="min-w-0 space-y-2">
  <div className="flex flex-wrap gap-2">{list.map((i,n)=><div key={i.id} data-proposal-design-image={i.id} className="w-28 min-w-0 space-y-1">
   {/* eslint-disable-next-line @next/next/no-img-element -- owner thumbnail of the current file. */}
   {i.available?<img src={draftUrl(i)} alt={i.caption||i.name} className="aspect-[4/3] w-28 rounded-lg border border-[#e5e7eb] object-cover"/>
    :<span className="flex aspect-[4/3] w-28 items-center justify-center rounded-lg bg-[#fdf1ef] p-1 text-center text-xs text-[#8b1c1c]">{c.unavailable}</span>}
   <p className="truncate text-xs text-[#52627a]" title={i.caption||i.name}>{i.caption||i.name}</p>
   <div className="flex gap-1">{list.length>1&&<><button type="button" className="min-h-7 min-w-7 rounded-md border border-[#d7e1ea] px-2 text-xs disabled:opacity-40" aria-label={c.up} disabled={busy||n===0} onClick={()=>void send({action:'move_image',imageId:i.id,direction:-1})}>←</button>
    <button type="button" className="min-h-7 min-w-7 rounded-md border border-[#d7e1ea] px-2 text-xs disabled:opacity-40" aria-label={c.down} disabled={busy||n===list.length-1} onClick={()=>void send({action:'move_image',imageId:i.id,direction:1})}>→</button></>}
    <button type="button" data-proposal-remove={i.id} className="min-h-7 rounded-md border border-[#f3c4bd] px-2 text-xs text-[#8b1c1c]" disabled={busy} onClick={()=>void send({action:'remove_image',imageId:i.id})}>{c.remove}</button></div></div>)}
   {list.length<max&&<button type="button" data-proposal-add={target+':'+key} disabled={busy} onClick={()=>setPicker({target,targetKey:key,label})} className="flex aspect-[4/3] w-28 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[#b8c7d6] text-xs font-semibold text-[#008bb5] hover:bg-[#f3f8fb]"><span aria-hidden className="text-xl leading-none">+</span>{c.addPhoto}</button>}</div></div>;};
 return <Modal manageFocus open size="lg" title={c.designTitle} ariaLabel={c.designTitle} closeLabel={c.close} onClose={onClose}>
  <section data-proposal-designer className="min-w-0 space-y-5"><p className="text-sm text-[#52627a]">{c.designIntro}</p>
   {failed&&!design&&<p role="alert" className="text-sm">{c.loadFailed} <Button variant="outline" size="sm" onClick={()=>void load()}>{c.retry}</Button></p>}
   {!design&&!failed&&<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>}
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" data-proposal-notice className="text-sm text-[#1f6f43]">{notice}</p>}
   {design&&<>
    <div className="space-y-3 rounded-2xl border border-[#d7e1ea] p-3 sm:p-4">
     <label className="block text-sm font-semibold">{c.coverTitle}<input data-proposal-cover-title className={field+' min-h-11'} maxLength={120} value={texts.coverTitle} onChange={e=>{setTexts({...texts,coverTitle:e.target.value});setDirty(true);}}/></label>
     <label className="block text-sm font-semibold">{c.intro}<textarea data-proposal-intro-input className={field} rows={4} maxLength={4000} value={texts.intro} onChange={e=>{setTexts({...texts,intro:e.target.value});setDirty(true);}}/></label>
     <label className="block text-sm font-semibold">{c.closing}<textarea data-proposal-closing-input className={field} rows={2} maxLength={2000} value={texts.closing} onChange={e=>{setTexts({...texts,closing:e.target.value});setDirty(true);}}/></label>
     <Button type="button" data-proposal-save disabled={busy||!dirty} onClick={()=>void send({action:'save',...texts},()=>{setDirty(false);setNotice(c.saved);})}>{c.save}</Button></div>
    <div className="space-y-2"><h4 className="font-semibold">{c.coverPhoto}</h4>{slot('cover','',c.coverPhoto,1)}</div>
    {sections.length>0&&<div className="space-y-3"><h4 className="font-semibold">{c.sections}</h4>{sections.map(s=><div key={s} className="space-y-1 rounded-xl bg-[#f7f9fc] p-3"><p className="text-sm font-semibold">{s}</p>{slot('section',s,s,6)}</div>)}</div>}
    <div className="space-y-3"><h4 className="font-semibold">{c.lines}</h4>{design.lines.map(l=><div key={l.id} className="space-y-1 rounded-xl border border-[#eef2f6] p-3"><p className="text-sm font-semibold">{l.description||'—'}<span className="font-normal text-[#52627a]">{l.group?' · '+l.group:''}</span></p>{slot('line',l.id,l.description,6)}</div>)}</div>
    <div data-proposal-publications className="space-y-2 rounded-2xl border border-[#d7e1ea] p-3 sm:p-4">{design.publications.filter(p=>p.open).length===0&&<p className="text-sm text-[#52627a]">{c.noOpen}</p>}
     {design.publications.filter(p=>p.open).map(p=><div key={p.publicationId} data-proposal-publication={p.publicationId} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl p-2 ${p.publicationId===focusPublicationId?'bg-[#eaf7fb]':''}`}>
      <p className="text-sm">{p.appliedRevision===null?c.notApplied(p.version):p.appliedRevision===design.revision?c.applied(p.version):c.older(p.version)}</p>
      <Button type="button" size="sm" data-proposal-apply={p.publicationId} disabled={busy||dirty||design.revision===0||p.appliedRevision===design.revision} onClick={()=>void send({action:'publish',publicationId:p.publicationId},()=>{setNotice(c.appliedNotice(p.version));refreshPublication(actor,p.publicationId);})}>{c.apply(p.version)}</Button></div>)}
     <p className="text-xs text-[#52627a]">{c.closed}</p></div>
   </>}
   {picker&&<FilePicker actor={actor} estimateId={estimateId} label={picker.label} onClose={()=>setPicker(null)} onPick={(file,caption)=>{const t=picker;setPicker(null);void send({action:'add_image',imageId:crypto.randomUUID(),target:t.target,targetKey:t.targetKey,source:file.source,fileId:file.fileId,caption});}}/>}
  </section>
 </Modal>;
}
function FilePicker({actor,estimateId,label,onClose,onPick}:{actor:string;estimateId:string;label:string;onClose:()=>void;onPick:(file:ProposalFiles['items'][number],caption:string)=>void}){
 const c=useCopy();const [q,setQ]=useState(''),[files,setFiles]=useState<ProposalFiles|null>(null),[failed,setFailed]=useState(false),[chosen,setChosen]=useState<ProposalFiles['items'][number]|null>(null),[caption,setCaption]=useState(''),seq=useRef(0);
 useEffect(()=>{const n=++seq.current;const timer=setTimeout(async()=>{try{const r=await fetch(api+'?'+new URLSearchParams({view:'files',estimateId,...q.trim()?{q:q.trim()}:{}}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error();const d=proposalFilesSchema.parse(await r.json());if(n===seq.current){setFiles(d);setFailed(false);}}catch{if(n===seq.current)setFailed(true);}},q?250:0);return()=>clearTimeout(timer);},[actor,estimateId,q]);
 return <Modal manageFocus open size="lg" title={c.pick} ariaLabel={c.pick} subtitle={label} closeLabel={c.close} onClose={onClose}>
  <section data-proposal-picker className="min-w-0 space-y-3"><label className="block text-sm font-semibold">{c.search}<input type="search" className={field+' min-h-11'} value={q} onChange={e=>setQ(e.target.value)}/></label>
   {failed&&<p role="alert" className="text-sm">{c.loadFailed}</p>}{!files&&!failed&&<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>}
   {files&&files.items.length===0&&<p className="text-sm text-[#52627a]">{c.noFiles}</p>}
   {files&&files.items.length>0&&<ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">{files.items.map(f=><li key={f.source+f.fileId}><button type="button" data-proposal-file={f.fileId} aria-pressed={chosen?.fileId===f.fileId} onClick={()=>setChosen(f)}
    className={`w-full min-w-0 overflow-hidden rounded-xl border-2 text-left ${chosen?.fileId===f.fileId?'border-[#008bb5]':'border-[#eef2f6]'}`}>
    {/* eslint-disable-next-line @next/next/no-img-element -- owner thumbnail of the current file. */}
    <img src={api+'?'+new URLSearchParams({view:'draft-image',estimateId,source:f.source,fileId:f.fileId})} alt="" loading="lazy" className="aspect-[4/3] w-full bg-[#f3f8fb] object-cover"/>
    <span className="block truncate px-2 pt-1 text-xs font-semibold">{f.name}</span><span className="block truncate px-2 pb-1.5 text-xs text-[#52627a]">{f.source==='company'?c.company:`${c.work}: ${f.place??'—'}`}</span></button></li>)}</ul>}
   {chosen&&<div className="flex flex-wrap items-end gap-2 border-t border-[#eef2f6] pt-3"><label className="block min-w-0 flex-1 text-sm font-semibold">{c.caption}<input data-proposal-caption className={field+' min-h-11'} maxLength={160} value={caption} onChange={e=>setCaption(e.target.value)}/></label>
    <Button type="button" data-proposal-pick-confirm onClick={()=>onPick(chosen,caption.trim())}>{c.addPhoto}</Button></div>}
  </section>
 </Modal>;
}
