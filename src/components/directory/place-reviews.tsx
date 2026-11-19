'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {PhotoPicker,uploadPlacePhotos,type UploadOutcome} from './place-photo-upload';
import type {PublicPlaceReviews,ReplyTarget} from '@/lib/directory/review-schemas';
import {FlagReview,OwnerReplyEditor} from './place-review-actions';
import {BIZ,RatingSummary,Stars} from './biz-ui';

/**
 * LOCAL PRO ONLY (multivertical F5): reviews of a place. Same rules as professional reviews (half stars, 300
 * characters, no links). With an account the profile name is used; without one, only after contacting the business
 * from ContrataCR on this device. New reviews appear after a reload (the list is the published one from the server).
 * M1: the business (manage = dir_review_reply_targets, only for its managers) replies once per review and may edit the
 * reply («editada»); everyone else can report a review to the moderators.
 */
const REASONS:Record<string,[string,string]>={
 review_contact_required:['Para reseñar sin cuenta, contacte primero al negocio desde ContrataCR (botón "Llamar") o inicie sesión.','To review without an account, first contact the business from ContrataCR ("Call" button) or sign in.'],
 review_own_place:['No puede reseñar un negocio que usted administra.','You cannot review a business you manage.'],
 review_cap:['Alcanzó el máximo de reseñas por hoy.','You reached the daily limit of reviews.'],
 name_required:['Escriba su nombre.','Please write your name.'],
 reload:['La reseña cambió en otra pestaña. Recargue la página.','The review changed in another tab. Please reload the page.'],
 unavailable:['No se pudo enviar. Intente de nuevo.','Could not send. Please try again.'],
};
const noSubscribe=()=>()=>{};
/** `note` (2026-11-17, health/vet places): visible scope note shown above the list and the form. */
/** 2026-11-19 (Yelp model): rating summary with 5→1 bars (`distribution`, counted server-side), sort of the listed
 *  reviews (newest / best / worst; offered when every review is on the page) and «Escribir reseña» opened from the
 *  header action bar or the mobile bar through the #escribir-resena anchor. */
type Sort='recent'|'best'|'worst';
export function PlaceReviews({slug,locale,initial,signedIn,manage=null,note,distribution=null}:{slug:string;locale:string;initial:PublicPlaceReviews;signedIn:boolean;manage?:ReplyTarget[]|null;note?:string;distribution?:number[]|null}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const [state,setState]=useState<'idle'|'sending'|'sent'>('idle'),[error,setError]=useState<string|null>(null),[writing,setWriting]=useState(false);
 const [photos,setPhotos]=useState<File[]>([]),[photoResult,setPhotoResult]=useState<UploadOutcome|null>(null),[sort,setSort]=useState<Sort>('recent');
 const sectionRef=useRef<HTMLElement>(null);
 // «Escribir reseña» links (#escribir-resena) open the form here, on arrival and on later clicks.
 useEffect(()=>{
  const fromHash=()=>{if(window.location.hash!=='#escribir-resena')return;setWriting(true);
   requestAnimationFrame(()=>{sectionRef.current?.scrollIntoView({block:'start'});(sectionRef.current?.querySelector('form select, form input, [data-place-review-manager], [data-place-review-sent]') as HTMLElement|null)?.focus?.();});};
  fromHash();window.addEventListener('hashchange',fromHash);return()=>window.removeEventListener('hashchange',fromHash);
 },[]);
 const items=sort==='recent'?initial.items:[...initial.items].sort((a,b)=>sort==='best'?b.rating-a.rating||b.createdAt.localeCompare(a.createdAt):a.rating-b.rating||b.createdAt.localeCompare(a.createdAt));
 const action=useRef(''),form=useRef<HTMLFormElement>(null);
 // data-ready marks the form as interactive (true only after hydration); the action id is created on first submit.
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 const date=(iso:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(iso));
 const submit=async()=>{
  if(!action.current)action.current=crypto.randomUUID();
  const f=new FormData(form.current!);setState('sending');setError(null);
  try{
   const r=await fetch(`/api/lugar/${encodeURIComponent(slug)}/resenas`,{method:'POST',headers:{'content-type':'application/json','accept-language':en?'en':'es'},
    body:JSON.stringify({actionId:action.current,rating:Number(f.get('rating')),comment:String(f.get('comment')??''),...(signedIn?{}:{authorName:String(f.get('authorName')??'')})})});
   const data=await r.json().catch(()=>({})) as {reason?:string;error?:string};
   // Photos of the review (launch round 2026-11-18): uploaded after the review exists; they wait for staff approval.
   if(r.ok){if(signedIn&&photos.length){setPhotoResult(await uploadPlacePhotos(slug,photos,{review:true,en}));setPhotos([]);}setState('sent');action.current=crypto.randomUUID();return;}
   setState('idle');action.current=crypto.randomUUID();
   setError(data.reason==='invalid'&&data.error?data.error:(REASONS[data.reason??'']??REASONS.unavailable)![en?1:0]);
  }catch{setState('idle');setError(REASONS.unavailable![en?1:0]);}
 };
 const input='min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543]';
 return <section ref={sectionRef} id="resenas" aria-labelledby="place-reviews" className="scroll-mt-24 space-y-5" data-place-reviews={initial.summary.count}>
  <span id="escribir-resena" className="block scroll-mt-24" aria-hidden="true"/>
  <div className="flex flex-wrap items-end justify-between gap-3">
   <h2 id="place-reviews" className={BIZ.h2}>{t('Reseñas','Reviews')}</h2>
   {!initial.nextCursor&&initial.items.length>1&&<label className="flex items-center gap-2 text-sm font-semibold text-[#334155]">{t('Ordenar por','Sort by')}
    <select data-place-review-sort value={sort} onChange={e=>setSort(e.target.value as Sort)} className="min-h-11 rounded-full border border-[#cfd9e3] bg-white px-4 text-sm font-semibold text-[#162543]">
     <option value="recent">{t('Más recientes','Newest')}</option><option value="best">{t('Mejor calificación','Highest rated')}</option><option value="worst">{t('Peor calificación','Lowest rated')}</option></select></label>}
  </div>
  {note&&<p role="note" data-place-review-note className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">{note}</p>}
  {initial.summary.count>0&&initial.summary.average!=null
   ?<RatingSummary average={initial.summary.average} count={initial.summary.count} distribution={distribution} en={en}/>
   :<div data-place-reviews-empty className="flex items-center gap-4 rounded-2xl bg-[#f7fafc] p-5"><Stars value={0} size="lg"/><p className="text-base font-semibold text-[#162543]">{t('Todavía no hay reseñas.','No reviews yet.')}</p></div>}
  {items.length>0&&<ul className="divide-y divide-[#e8edf2]">{items.map(r=><li key={r.id} data-place-review={r.id} className="space-y-2 py-5 first:pt-1">
   <div className="flex items-center gap-3">
    <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#eaf6fb] text-base font-bold text-[#0b4f6c]">{r.name.trim().charAt(0).toUpperCase()}</span>
    <div className="min-w-0"><p className="truncate font-bold text-[#162543]">{r.name}</p>
     {r.guest&&<p className="text-xs text-slate-600">{t('sin cuenta, contactó al negocio','no account, contacted the business')}</p>}</div>
   </div>
   <p className="flex flex-wrap items-center gap-2 text-sm"><Stars value={r.rating} size="sm" label={t(`${String(r.rating).replace('.',',')} de 5`,`${r.rating} out of 5`)}/><span className="text-slate-600">{date(r.createdAt)}{r.edited?` · ${t('editada','edited')}`:''}</span></p>
   <p className="break-words text-[15px] leading-6 text-[#1f2937]">{r.comment}</p>
   {r.ownerReply&&<div className="mt-2 rounded-xl bg-[#f7fafc] p-3 text-sm" data-owner-reply><p><span className="font-semibold">{t('Respuesta del negocio: ','Reply from the business: ')}</span><span className="break-words">{r.ownerReply.text}</span></p>
    <p className="text-xs text-slate-600">{date(r.ownerReply.at)}{r.ownerReply.edited?` · ${t('editada','edited')}${r.ownerReply.editedAt?` ${date(r.ownerReply.editedAt)}`:''}`:''}</p></div>}
   {manage?(()=>{const target=manage.find(m=>m.reviewId===r.id);return target?<OwnerReplyEditor target={target} locale={locale}/>:null;})():<FlagReview slug={slug} reviewId={r.id} locale={locale}/>}
  </li>)}</ul>}
  {manage?<p className="rounded-2xl bg-[#F7FAFC] p-4 text-sm text-slate-700" data-place-review-manager>{t('Usted administra este negocio: puede responder las reseñas, pero no reseñarlo.','You manage this business: you can reply to reviews, but not review it.')}</p>
  :state==='sent'
   ?<p role="status" data-place-review-sent className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">{t('Gracias. Su reseña se publicó; recargue la página para verla.','Thank you. Your review was published; reload the page to see it.')}
    {photoResult&&photoResult.pending>0&&<span className="mt-1 block text-sm" data-place-review-photos-pending>{t(`${photoResult.pending===1?'Su foto quedó pendiente':`Sus ${photoResult.pending} fotos quedaron pendientes`} de revisión.`,`${photoResult.pending===1?'Your photo is':`Your ${photoResult.pending} photos are`} awaiting review.`)}</span>}
    {photoResult?.errors.map(e=><span key={e} className="mt-1 block text-sm text-red-800">{e}</span>)}</p>
   // Launch polish: the form opens from one «Escribir reseña» button instead of filling the page from the start.
   :!writing
    ?<button type="button" data-place-review-open data-ready={ready||undefined} onClick={()=>setWriting(true)} className={BIZ.primary}>{t('Escribir reseña','Write a review')}</button>
   :<form ref={form} onSubmit={e=>{e.preventDefault();void submit();}} className="space-y-3 rounded-2xl border border-[#d7e1ea] p-4" data-place-review-form data-ready={ready||undefined}>
    <h3 className="font-semibold">{t('Escribir una reseña','Write a review')}</h3>
    {!signedIn&&<label className="flex flex-col gap-1 text-sm font-medium">{t('Su nombre','Your name')}<input name="authorName" maxLength={80} autoComplete="name" className={input}/></label>}
    <label className="flex flex-col gap-1 text-sm font-medium">{t('Calificación','Rating')}
     <select name="rating" defaultValue="5" className={input}>{[5,4.5,4,3.5,3,2.5,2,1.5,1,0.5].map(v=><option key={v} value={v}>{t(`${String(v).replace('.',',')} de 5`,`${v} out of 5`)}</option>)}</select></label>
    <label className="flex flex-col gap-1 text-sm font-medium">{t('Comentario (máximo 300 caracteres)','Comment (up to 300 characters)')}<textarea name="comment" maxLength={300} rows={3} required className={`${input} py-2`}/></label>
    {signedIn&&<fieldset className="space-y-1 text-sm"><legend className="font-medium">{t('Fotos (opcional, hasta 5)','Photos (optional, up to 5)')}</legend>
     <PhotoPicker files={photos} onChange={setPhotos} en={en} label={t('Agregar fotos a la reseña','Add photos to the review')} disabled={state==='sending'}/>
     <p className="text-xs text-slate-600">{t('Se revisan antes de publicarse.','They are reviewed before they are published.')}</p></fieldset>}
    <button type="submit" disabled={state==='sending'} className="inline-flex min-h-11 items-center rounded-full bg-[#162543] px-5 font-semibold text-white disabled:opacity-60">{t('Publicar reseña','Post review')}</button>
    {error&&<p role="alert" className="text-sm font-semibold text-red-800" data-place-review-error>{error}</p>}
   </form>}
 </section>;
}
