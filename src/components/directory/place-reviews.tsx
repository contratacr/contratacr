'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {PhotoPicker,uploadPlacePhotos,type UploadOutcome} from './place-photo-upload';
import type {PublicPlaceReviews,ReplyTarget} from '@/lib/directory/review-schemas';
import {FlagReview,OwnerReplyEditor} from './place-review-actions';
import {Stars} from './biz-ui';
import {RECOMMEND_EVENT} from './place-recommend';
import {CHIP} from './place-card';

/**
 * LOCAL PRO ONLY (multivertical F5): reviews of a place. Same rules as professional reviews (half stars, 300
 * characters, no links). With an account the profile name is used; without one, only after contacting the business
 * from ContrataCR on this device. New reviews appear after a reload (the list is the published one from the server).
 * M1: the business (manage = dir_review_reply_targets, only for its managers) replies once per review and may edit the
 * reply («editada»); everyone else can report a review to the moderators.
 */
const REASONS:Record<string,[string,string]>={
 review_contact_required:['Para reseñar sin cuenta, contacte primero a la empresa desde ContrataCR (botón "Llamar") o inicie sesión.','To review without an account, first contact the business from ContrataCR ("Call" button) or sign in.'],
 review_own_place:['No puede reseñar una empresa que usted administra.','You cannot review a business you manage.'],
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
/** Soft avatar tints for the reviewer's initial (brand family). */
const AVATAR=['bg-[#eaf7fd] text-[#0083b0]','bg-[#e8eefb] text-[#2b4c8c]','bg-[#e6f6f1] text-[#0f7660]','bg-[#fdf1e7] text-[#a6521b]'];
export function PlaceReviews({slug,locale,initial,signedIn,manage=null,note,distribution=null}:{slug:string;locale:string;initial:PublicPlaceReviews;signedIn:boolean;manage?:ReplyTarget[]|null;note?:string;distribution?:number[]|null}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const [state,setState]=useState<'idle'|'sending'|'sent'>('idle'),[error,setError]=useState<string|null>(null),[writing,setWriting]=useState(false);
 const [photos,setPhotos]=useState<File[]>([]),[photoResult,setPhotoResult]=useState<UploadOutcome|null>(null),[sort,setSort]=useState<Sort>('recent'),[suggested,setSuggested]=useState('5');
 const sectionRef=useRef<HTMLElement>(null);
 // «Escribir reseña» links (#escribir-resena) open the form here, on arrival and on later clicks.
 useEffect(()=>{
  const fromHash=()=>{if(window.location.hash!=='#escribir-resena')return;setWriting(true);
   requestAnimationFrame(()=>{sectionRef.current?.scrollIntoView({block:'start'});(sectionRef.current?.querySelector('form select, form input, [data-place-review-manager], [data-place-review-sent]') as HTMLElement|null)?.focus?.();});};
  fromHash();window.addEventListener('hashchange',fromHash);return()=>window.removeEventListener('hashchange',fromHash);
 },[]);
 // «¿Recomienda este lugar?» opens the form with a suggested rating.
 useEffect(()=>{const on=(e:Event)=>{const r=(e as CustomEvent<{rating:number}>).detail?.rating;if(r)setSuggested(String(r));setWriting(true);};
  window.addEventListener(RECOMMEND_EVENT,on);return()=>window.removeEventListener(RECOMMEND_EVENT,on);},[]);
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
 const count=initial.summary.count,avg=initial.summary.average;
 const max=Math.max(1,...(distribution??[]));
 return <section ref={sectionRef} id="resenas" aria-labelledby="place-reviews" className="scroll-mt-32 space-y-6" data-place-reviews={count}>
  <span id="escribir-resena" className="block scroll-mt-32" aria-hidden="true"/>
  <h2 id="place-reviews" className="text-xl font-extrabold tracking-tight text-[#162543]">{t('Reseñas','Reviews')}</h2>
  {note&&<p role="note" data-place-review-note className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">{note}</p>}
  {/* Summary (2026-11-26 redesign): the big score beside the 5→1 bars, on one soft brand panel. */}
  {count>0&&avg!=null
   ?<div data-rating-summary={count} className="grid gap-5 rounded-2xl bg-gradient-to-br from-[#f3f9fc] to-white p-5 ring-1 ring-[#e5eef4] sm:grid-cols-[170px_1fr] sm:items-center sm:gap-8 sm:p-6">
    <div className="flex items-center gap-4 sm:block sm:space-y-2">
     <p className="text-[52px] font-extrabold leading-none tracking-tight text-[#162543]">{avg.toFixed(1)}</p>
     <div className="space-y-1"><Stars value={avg} size="lg" label={en?`${avg.toFixed(1)} out of 5`:`${avg.toFixed(1)} de 5`}/>
      <p className="text-sm font-medium text-[#526277]">{count} {en?(count===1?'review':'reviews'):(count===1?'reseña':'reseñas')}</p></div>
    </div>
    {distribution&&distribution.length===5&&<ul className="space-y-2" aria-label={t('Calificaciones por estrellas','Ratings by stars')} data-rating-distribution>
     {[5,4,3,2,1].map(st=>{const n=distribution[st-1]??0;return <li key={st} className="grid grid-cols-[64px_1fr_28px] items-center gap-3 text-[13px]" data-rating-bar={st}>
      <span className="whitespace-nowrap font-semibold text-[#334155]">{st} {en?(st===1?'star':'stars'):(st===1?'estrella':'estrellas')}</span>
      <span className="h-2 overflow-hidden rounded-full bg-[#e3eaf0]" aria-hidden="true"><span className="block h-full rounded-full bg-[#f5a623]" style={{width:`${(n/max)*100}%`}}/></span>
      <span className="text-right tabular-nums text-[#526277]">{n}</span></li>;})}
    </ul>}
   </div>
   :<div data-place-reviews-empty className="flex items-center gap-4 rounded-2xl bg-[#f7fafc] p-5"><Stars value={0} size="lg"/><p className="text-base font-semibold text-[#162543]">{t('Todavía no hay reseñas.','No reviews yet.')}</p></div>}
  {items.length>0&&<div className="space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <p className="text-[15px] font-extrabold text-[#162543]">{t('Reseñas recomendadas','Recommended reviews')}</p>
    {/* Sort as a small segmented control of brand chips (2026-11-26) instead of a raw select. */}
    {!initial.nextCursor&&initial.items.length>1&&<div role="radiogroup" aria-label={t('Ordenar por','Sort by')} data-place-review-sort={sort} className="flex gap-1">
     {([['recent',t('Recientes','Newest')],['best',t('Mejores','Highest')],['worst',t('Peores','Lowest')]] as [Sort,string][]).map(([v,label])=><button key={v} type="button" role="radio" aria-checked={sort===v} onClick={()=>setSort(v)}
      className={`${CHIP} border ${sort===v?'border-[#009FD9] !bg-[#EBF5FB] !text-[#00688f]':'border-[#d7e1ea] !bg-white !text-[#162543] hover:!bg-[#f6f9fb]'}`}>{label}</button>)}
    </div>}
   </div>
   <ul className="space-y-3">{items.map(r=>{const initial=r.name.trim().charAt(0).toUpperCase();const hue=AVATAR[(initial.charCodeAt(0)||0)%AVATAR.length]!;
    return <li key={r.id} data-place-review={r.id} className="space-y-3 rounded-2xl border border-[#e8edf2] bg-white p-4 sm:p-5">
    <div className="flex items-center gap-3">
     <span aria-hidden="true" className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-[17px] font-extrabold ${hue}`}>{initial}</span>
     <div className="min-w-0 flex-1"><p className="truncate font-bold text-[#162543]">{r.name}</p>
      {r.guest&&<p className="text-[12.5px] text-slate-600">{t('sin cuenta, contactó a la empresa','no account, contacted the business')}</p>}</div>
    </div>
    <p className="flex flex-wrap items-center gap-2 text-[13px]"><Stars value={r.rating} size="sm" label={t(`${String(r.rating).replace('.',',')} de 5`,`${r.rating} out of 5`)}/><span className="text-slate-600">{date(r.createdAt)}{r.edited?` · ${t('editada','edited')}`:''}</span></p>
    <p className="break-words text-[15px] leading-7 text-[#1f2937]">{r.comment}</p>
    {r.ownerReply&&<div className="rounded-xl border-l-[3px] border-[#009FD9] bg-[#f5fafd] px-4 py-3 text-sm" data-owner-reply>
     <p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-extrabold uppercase tracking-wide text-[#0083b0]">{t('Respuesta de la empresa','Reply from the business')}</p>
     <p className="break-words leading-6 text-[#1f2937]">{r.ownerReply.text}</p>
     <p className="mt-1 text-xs text-slate-600">{date(r.ownerReply.at)}{r.ownerReply.edited?` · ${t('editada','edited')}${r.ownerReply.editedAt?` ${date(r.ownerReply.editedAt)}`:''}`:''}</p></div>}
    {manage?(()=>{const target=manage.find(m=>m.reviewId===r.id);return target?<OwnerReplyEditor target={target} locale={locale}/>:null;})():<FlagReview slug={slug} reviewId={r.id} locale={locale}/>}
   </li>;})}</ul>
  </div>}
  {manage?<p className="rounded-2xl bg-[#F7FAFC] p-4 text-sm text-slate-700" data-place-review-manager>{t('Usted administra esta empresa: puede responder las reseñas, pero no reseñarla.','You manage this business: you can reply to reviews, but not review it.')}</p>
  :state==='sent'
   ?<p role="status" data-place-review-sent className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">{t('Gracias. Su reseña se publicó; recargue la página para verla.','Thank you. Your review was published; reload the page to see it.')}
    {photoResult&&photoResult.pending>0&&<span className="mt-1 block text-sm" data-place-review-photos-pending>{t(`${photoResult.pending===1?'Su foto quedó pendiente':`Sus ${photoResult.pending} fotos quedaron pendientes`} de revisión.`,`${photoResult.pending===1?'Your photo is':`Your ${photoResult.pending} photos are`} awaiting review.`)}</span>}
    {photoResult?.errors.map(e=><span key={e} className="mt-1 block text-sm text-red-800">{e}</span>)}</p>
   // Launch polish: the form opens from one «Escribir reseña» button instead of filling the page from the start.
   :!writing
    // Like the professional profile (owner 2026-11-26): «¿Ya visitó este lugar?» with five stars; a tap opens the form with that rating.
    ?<div data-place-review-open data-ready={ready||undefined} className="flex flex-col gap-2 rounded-2xl bg-[#162543] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
     <p className="text-[16px] font-extrabold">{t('¿Ya visitó este lugar?','Have you been here?')}</p>
     <div className="mt-2 flex gap-1" role="group" aria-label={t('Calificar','Rate')}>
      {[1,2,3,4,5].map(n=><button key={n} type="button" data-place-review-star={n} aria-label={t(`${n} de 5`,`${n} out of 5`)} onClick={()=>{setSuggested(String(n));setWriting(true);}}
       className="peer grid h-11 w-11 place-items-center rounded-lg text-white/35 transition-colors hover:text-[#f5a623] focus-visible:text-[#f5a623] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white [&:has(~:hover)]:text-[#f5a623]"><svg viewBox="0 0 24 24" className="h-8 w-8 fill-current" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/></svg></button>)}
     </div>
    </div>
   :<form ref={form} onSubmit={e=>{e.preventDefault();void submit();}} className="space-y-4 rounded-2xl border border-[#e5e9ee] bg-white p-4 shadow-sm" data-place-review-form data-ready={ready||undefined}>
    <h3 className="text-[15px] font-extrabold text-[#162543]">{t('Su reseña','Your review')}</h3>
    {!signedIn&&<label className="flex flex-col gap-1 text-sm font-medium">{t('Su nombre','Your name')}<input name="authorName" maxLength={80} autoComplete="name" className={input}/></label>}
    <fieldset className="text-sm"><legend className="mb-1 font-medium">{t('Calificación','Rating')}</legend>
     <input type="hidden" name="rating" value={suggested}/>
     <div className="flex gap-1">{[1,2,3,4,5].map(n=><button key={n} type="button" aria-pressed={Number(suggested)>=n} aria-label={t(`${n} de 5`,`${n} out of 5`)} onClick={()=>setSuggested(String(n))}
      className={`grid h-10 w-10 place-items-center rounded-lg ${Number(suggested)>=n?'text-[#f59e0b]':'text-[#cfd8e3]'}`}><svg viewBox="0 0 24 24" className="h-8 w-8 fill-current" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/></svg></button>)}</div></fieldset>
    <label className="flex flex-col gap-1 text-sm font-medium">{t('Comentario (máximo 300 caracteres)','Comment (up to 300 characters)')}<textarea name="comment" maxLength={300} rows={3} required className={`${input} py-2`}/></label>
    {signedIn&&<fieldset className="space-y-1 text-sm"><legend className="font-medium">{t('Fotos (opcional, hasta 5)','Photos (optional, up to 5)')}</legend>
     <PhotoPicker files={photos} onChange={setPhotos} en={en} label={t('Agregar fotos a la reseña','Add photos to the review')} disabled={state==='sending'}/>
     <p className="text-xs text-slate-600">{t('Se revisan antes de publicarse.','They are reviewed before they are published.')}</p></fieldset>}
    <button type="submit" disabled={state==='sending'} className="inline-flex h-11 items-center rounded-full bg-[#009FD9] px-5 text-[13px] font-bold text-white hover:bg-[#0089bb] disabled:opacity-60">{t('Enviar reseña','Submit review')}</button>
    {error&&<p role="alert" className="text-sm font-semibold text-red-800" data-place-review-error>{error}</p>}
   </form>}
 </section>;
}
