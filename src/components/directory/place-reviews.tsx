'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {useRouter} from 'next/navigation';
import {AlertCircle,Star} from 'lucide-react';
import {PhotoPicker,uploadPlacePhotos,type UploadOutcome} from './place-photo-upload';
import type {PublicPlaceReviews,ReplyTarget} from '@/lib/directory/review-schemas';
import {FlagReview,OwnerReplyEditor} from './place-review-actions';
import {RECOMMEND_EVENT} from './place-recommend';
import {CHIP} from './place-card';
import {Avatar,AvatarFallback} from '@/components/ui/avatar';
import {PanelEmptyState} from '@/components/ui/content-loading';
import {StarRating} from '@/components/ui/star-rating';
import {SuccessIcon} from '@/components/ui/success-icon';
import {formatRelativeTime,getInitials} from '@/lib/utils';

/**
 * LOCAL PRO ONLY (multivertical F5): reviews of a place. Same rules as professional reviews (half stars, 300
 * characters, no links). With an account the profile name is used; without one, only after contacting the business
 * from ContrataCR on this device. After sending, the page refreshes so the new review shows in the list.
 * M1: the business (manage = dir_review_reply_targets, only for its managers) replies once per review and may edit the
 * reply («editada»); everyone else can report a review to the moderators.
 *
 * Look (owner 2026-11-27, «la reseña debe de ser igual a la de los profesionales… para todos los negocios»): the
 * professional profile's Reseñas tab with the directory on (review-section.tsx variant "directory" + the embedded
 * leave-review-modal.tsx card): «Reseñas (N)», the summary panel (big score, stars, 5→1 bars), the white «write a review»
 * card ABOVE the list (stars first; the comment opens once a rating is picked) and one bordered card per review with
 * the avatar initials, stars and relative date. The place keeps its own data, endpoints and test hooks.
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
type Sort='recent'|'best'|'worst';
/** The embedded «write a review» card of the professional profile (leave-review-modal.tsx, embedded). */
const WRITE_CARD='flex flex-col gap-3 rounded-2xl border border-[#dbe7ef] bg-white p-3.5 shadow-[0_10px_26px_-24px_rgba(15,23,42,0.55)] sm:p-4';
const FIELD='w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-3 text-sm text-[#162543] placeholder:text-[#68778d] transition focus:border-[#009FD9] focus:outline-none focus:ring-2 focus:ring-[#009FD9]/20';

/** Five half-step stars (the professional's picker): the left half of each star is n − 0.5, the right half n. */
function StarPicker({value,onPick,en,hooks}:{value:number;onPick:(n:number)=>void;en:boolean;hooks:boolean}){
 const [hovered,setHovered]=useState(0),shown=hovered||value;
 return <div className="flex items-center justify-between gap-3">
  <div className="flex gap-0.5" onMouseLeave={()=>setHovered(0)} role="group" aria-label={en?'Rating':'Calificación'}>
   {[1,2,3,4,5].map(star=>{const full=shown>=star,half=!full&&shown>=star-0.5;
    return <div key={star} className="relative h-7 w-7">
     <Star aria-hidden="true" className="absolute inset-0 h-7 w-7 fill-[#d1d5db] text-[#d1d5db]"/>
     {(full||half)&&<span className="absolute inset-0 overflow-hidden" style={{width:full?'100%':'50%'}}><Star aria-hidden="true" className="h-7 w-7 fill-yellow-400 text-yellow-400"/></span>}
     <button type="button" aria-label={en?`${star-0.5} out of 5`:`${String(star-0.5).replace('.',',')} de 5`} onMouseEnter={()=>setHovered(star-0.5)} onClick={()=>onPick(star-0.5)}
      className="absolute inset-y-0 left-0 z-10 w-1/2 cursor-pointer rounded-l focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]"/>
     <button type="button" {...(hooks?{'data-place-review-star':star}:{})} aria-pressed={value>=star} aria-label={en?`${star} out of 5`:`${star} de 5`} onMouseEnter={()=>setHovered(star)} onClick={()=>onPick(star)}
      className="absolute inset-y-0 right-0 z-10 w-1/2 cursor-pointer rounded-r focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]"/>
    </div>;})}
  </div>
  {shown>0&&<span className="text-sm font-semibold tabular-nums text-[#374151]">{shown.toFixed(1)}</span>}
 </div>;
}

export function PlaceReviews({slug,locale,initial,signedIn,manage=null,note,distribution=null}:{slug:string;locale:string;initial:PublicPlaceReviews;signedIn:boolean;manage?:ReplyTarget[]|null;note?:string;distribution?:number[]|null}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const router=useRouter();
 const [state,setState]=useState<'idle'|'sending'|'sent'>('idle'),[error,setError]=useState<string|null>(null),[writing,setWriting]=useState(false);
 const [photos,setPhotos]=useState<File[]>([]),[photoResult,setPhotoResult]=useState<UploadOutcome|null>(null),[sort,setSort]=useState<Sort>('recent'),[suggested,setSuggested]=useState(5);
 const [comment,setComment]=useState('');
 const sectionRef=useRef<HTMLElement>(null);
 // «Escribir reseña» links (#escribir-resena) open the form here, on arrival and on later clicks.
 useEffect(()=>{
  const fromHash=()=>{if(window.location.hash!=='#escribir-resena')return;setWriting(true);
   requestAnimationFrame(()=>{sectionRef.current?.scrollIntoView({block:'start'});(sectionRef.current?.querySelector('form textarea, form input:not([type=hidden]), [data-place-review-manager], [data-place-review-sent]') as HTMLElement|null)?.focus?.();});};
  fromHash();window.addEventListener('hashchange',fromHash);return()=>window.removeEventListener('hashchange',fromHash);
 },[]);
 // «¿Recomienda este lugar?» opens the form with a suggested rating.
 useEffect(()=>{const on=(e:Event)=>{const r=(e as CustomEvent<{rating:number}>).detail?.rating;if(r)setSuggested(r);setWriting(true);};
  window.addEventListener(RECOMMEND_EVENT,on);return()=>window.removeEventListener(RECOMMEND_EVENT,on);},[]);
 const items=sort==='recent'?initial.items:[...initial.items].sort((a,b)=>sort==='best'?b.rating-a.rating||b.createdAt.localeCompare(a.createdAt):a.rating-b.rating||b.createdAt.localeCompare(a.createdAt));
 const action=useRef(''),form=useRef<HTMLFormElement>(null);
 // data-ready marks the form as interactive (true only after hydration); the action id is created on first submit.
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 const submit=async()=>{
  if(!action.current)action.current=crypto.randomUUID();
  const f=new FormData(form.current!);setState('sending');setError(null);
  try{
   const r=await fetch(`/api/lugar/${encodeURIComponent(slug)}/resenas`,{method:'POST',headers:{'content-type':'application/json','accept-language':en?'en':'es'},
    body:JSON.stringify({actionId:action.current,rating:Number(f.get('rating')),comment:String(f.get('comment')??''),...(signedIn?{}:{authorName:String(f.get('authorName')??'')})})});
   const data=await r.json().catch(()=>({})) as {reason?:string;error?:string};
   // Photos of the review (launch round 2026-11-18): uploaded after the review exists; they wait for staff approval.
   if(r.ok){if(signedIn&&photos.length){setPhotoResult(await uploadPlacePhotos(slug,photos,{review:true,en}));setPhotos([]);}setState('sent');action.current=crypto.randomUUID();router.refresh();return;}
   setState('idle');action.current=crypto.randomUUID();
   setError(data.reason==='invalid'&&data.error?data.error:(REASONS[data.reason??'']??REASONS.unavailable)![en?1:0]);
  }catch{setState('idle');setError(REASONS.unavailable![en?1:0]);}
 };
 const count=initial.summary.count,avg=initial.summary.average;
 const max=Math.max(1,...(distribution??[]));
 const pick=(n:number)=>{setSuggested(n);setWriting(true);};
 const prompt=<p className="truncate text-sm font-extrabold text-[#162543]">{t('¿Ya visitó este lugar?','Have you been here?')}</p>;
 return <section ref={sectionRef} id="resenas" aria-labelledby="place-reviews" className="scroll-mt-32" data-place-reviews={count}>
  <span id="escribir-resena" className="block scroll-mt-32" aria-hidden="true"/>
  <div className="mb-6 space-y-4">
   <h2 id="place-reviews" className="text-xl font-extrabold tracking-tight text-[#162543]">{t('Reseñas','Reviews')} ({count})</h2>
   {note&&<p role="note" data-place-review-note className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">{note}</p>}
   {count>0&&avg!=null&&<div data-rating-summary={count} className="grid gap-5 rounded-2xl bg-gradient-to-br from-[#f3f9fc] to-white p-5 ring-1 ring-[#e5eef4] sm:grid-cols-[170px_1fr] sm:items-center sm:gap-8 sm:p-6">
    <div className="flex items-center gap-4 sm:block sm:space-y-2">
     <p className="text-[52px] font-extrabold leading-none tracking-tight text-[#162543]">{avg.toFixed(1)}</p>
     <div className="space-y-1"><span role="img" aria-label={en?`${avg.toFixed(1)} out of 5`:`${avg.toFixed(1)} de 5`}><StarRating rating={avg} size="md"/></span>
      <p className="text-sm font-medium text-[#526277]">{count} {en?(count===1?'review':'reviews'):(count===1?'reseña':'reseñas')}</p></div>
    </div>
    {distribution&&distribution.length===5&&<ul className="space-y-2" aria-label={t('Calificaciones por estrellas','Ratings by stars')} data-rating-distribution>
     {[5,4,3,2,1].map(st=>{const n=distribution[st-1]??0;return <li key={st} className="grid grid-cols-[64px_1fr_28px] items-center gap-3 text-[13px]" data-rating-bar={st}>
      <span className="whitespace-nowrap font-semibold text-[#334155]">{st} {en?(st===1?'star':'stars'):(st===1?'estrella':'estrellas')}</span>
      <span className="h-2 overflow-hidden rounded-full bg-[#e3eaf0]" aria-hidden="true"><span className="block h-full rounded-full bg-[#f5a623]" style={{width:`${(n/max)*100}%`}}/></span>
      <span className="text-right tabular-nums text-[#526277]">{n}</span></li>;})}
    </ul>}
   </div>}
  </div>

  {/* Writing (or the business's note) goes ABOVE the list, like the professional profile. */}
  <div className="mb-6">
   {manage?<p className="rounded-2xl bg-[#F7FAFC] p-4 text-sm text-slate-700" data-place-review-manager tabIndex={-1}>{t('Usted administra esta empresa: puede responder las reseñas, pero no reseñarla.','You manage this business: you can reply to reviews, but not review it.')}</p>
   :state==='sent'
    ?<div role="status" data-place-review-sent tabIndex={-1} className="flex flex-col items-center gap-2 rounded-2xl border border-[#dbe7ef] bg-white py-4 text-center">
     <SuccessIcon size={40}/>
     <p className="text-base font-semibold text-[#162543]">{t('¡Gracias por su reseña!','Thanks for your review!')}</p>
     <p className="px-4 text-sm text-[#6b7280]">{t('Ya está publicada y ayuda a otras personas a elegir mejor.','It is published and helps other people choose better.')}</p>
     {photoResult&&photoResult.pending>0&&<p className="px-4 text-sm text-[#526277]" data-place-review-photos-pending>{t(`${photoResult.pending===1?'Su foto quedó pendiente':`Sus ${photoResult.pending} fotos quedaron pendientes`} de revisión.`,`${photoResult.pending===1?'Your photo is':`Your ${photoResult.pending} photos are`} awaiting review.`)}</p>}
     {photoResult?.errors.map(e=><p key={e} className="px-4 text-sm text-red-800">{e}</p>)}</div>
    :!writing
     // Stars first; a tap opens the comment with that rating (the professional profile's embedded card).
     ?<div data-place-review-open data-ready={ready||undefined} className={WRITE_CARD}>{prompt}<StarPicker value={0} onPick={pick} en={en} hooks/></div>
     :<form ref={form} onSubmit={e=>{e.preventDefault();void submit();}} className={WRITE_CARD} data-place-review-form data-ready={ready||undefined}>
      {prompt}
      <input type="hidden" name="rating" value={String(suggested)}/>
      <StarPicker value={suggested} onPick={setSuggested} en={en} hooks={false}/>
      <div>
       <div className="mb-1.5 flex items-center justify-end"><span className="text-xs tabular-nums text-[#68778d]" aria-hidden="true">{comment.length}/300</span></div>
       <textarea name="comment" maxLength={300} rows={3} required value={comment} onChange={e=>setComment(e.target.value)} aria-label={t('Comentario (máximo 300 caracteres)','Comment (up to 300 characters)')}
        placeholder={t('Cuéntenos sobre su experiencia en este lugar…','Tell us about your experience at this place…')} className={`${FIELD} resize-none`}/>
      </div>
      {!signedIn&&<div>
       <label htmlFor="place-review-name" className="mb-1.5 block text-sm font-medium text-[#374151]">{t('Su nombre','Your name')}</label>
       <input id="place-review-name" name="authorName" maxLength={80} autoComplete="name" placeholder={t('¿Cómo se llama?','What is your name?')} className={FIELD}/>
       <p className="mt-1.5 text-xs text-[#68778d]">{t('Aparece junto a su reseña. No hace falta crear una cuenta.','It appears next to your review. No account needed.')}</p>
      </div>}
      {signedIn&&<fieldset className="space-y-1 text-sm"><legend className="font-medium text-[#374151]">{t('Fotos (opcional, hasta 5)','Photos (optional, up to 5)')}</legend>
       <PhotoPicker files={photos} onChange={setPhotos} en={en} label={t('Agregar fotos a la reseña','Add photos to the review')} disabled={state==='sending'}/>
       <p className="text-xs text-[#68778d]">{t('Se revisan antes de publicarse.','They are reviewed before they are published.')}</p></fieldset>}
      {error&&<div role="alert" data-place-review-error className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600"><AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0"/>{error}</div>}
      <button type="submit" disabled={state==='sending'} className="ml-auto min-w-[146px] rounded-xl bg-[#009FD9] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0089bb] focus:outline-none focus:ring-2 focus:ring-[#009FD9]/40 disabled:cursor-not-allowed disabled:opacity-60">
       {state==='sending'?<span className="flex items-center justify-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"/>{t('Enviando…','Sending…')}</span>:t('Enviar reseña','Submit review')}</button>
     </form>}
  </div>

  {/* Sort (when every review is on the page): small brand chips, right-aligned above the cards. */}
  {!initial.nextCursor&&initial.items.length>1&&<div role="radiogroup" aria-label={t('Ordenar por','Sort by')} data-place-review-sort={sort} className="mb-3 flex justify-end gap-1">
   {([['recent',t('Recientes','Newest')],['best',t('Mejores','Highest')],['worst',t('Peores','Lowest')]] as [Sort,string][]).map(([v,label])=><button key={v} type="button" role="radio" aria-checked={sort===v} onClick={()=>setSort(v)}
    className={`${CHIP} border ${sort===v?'border-[#009FD9] !bg-[#EBF5FB] !text-[#00688f]':'border-[#d7e1ea] !bg-white !text-[#162543] hover:!bg-[#f6f9fb]'}`}>{label}</button>)}
  </div>}

  <ul className="flex flex-col gap-3">
   {items.map(r=><li key={r.id} data-place-review={r.id} className="flex gap-3 rounded-2xl border border-[#e8edf2] bg-white p-4 sm:p-5">
    <Avatar className="h-11 w-11 shrink-0"><AvatarFallback>{getInitials(r.name)}</AvatarFallback></Avatar>
    <div className="min-w-0 flex-1">
     <span className="block truncate text-sm font-medium text-[#162543]">{r.name}</span>
     <div className="my-1 flex items-center gap-2">
      <span role="img" aria-label={t(`${String(r.rating).replace('.',',')} de 5`,`${r.rating} out of 5`)}><StarRating rating={r.rating} size="sm"/></span>
      {/* Like the professional profile: relative date, «editada» not shown for the review itself. */}
      <span className="text-xs text-[#68778d]" suppressHydrationWarning>· {formatRelativeTime(r.createdAt,locale)}</span>
     </div>
     {r.guest&&<p className="mt-0.5 text-xs text-[#68778d]">{t('sin cuenta, contactó a la empresa','no account, contacted the business')}</p>}
     <p className="mt-1 break-words text-sm leading-relaxed text-[#374151]">{r.comment}</p>
     {r.ownerReply&&<div className="mt-3 rounded-xl border-l-[3px] border-[#009FD9] bg-[#f5fafd] px-4 py-3 text-sm" data-owner-reply>
      <p className="mb-1 text-[12px] font-extrabold uppercase tracking-wide text-[#0083b0]">{t('Respuesta de la empresa','Reply from the business')}</p>
      <p className="break-words leading-6 text-[#1f2937]">{r.ownerReply.text}</p>
      <p className="mt-1 text-xs text-slate-600">{new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(r.ownerReply.at))}{r.ownerReply.edited?` · ${t('editada','edited')}${r.ownerReply.editedAt?` ${new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(r.ownerReply.editedAt))}`:''}`:''}</p></div>}
     {manage?(()=>{const target=manage.find(m=>m.reviewId===r.id);return target?<OwnerReplyEditor target={target} locale={locale}/>:null;})():<FlagReview slug={slug} reviewId={r.id} locale={locale}/>}
    </div>
   </li>)}
  </ul>
  {items.length===0&&<div data-place-reviews-empty><PanelEmptyState plano tamano="compacto" icon={Star} title={t('Todavía no hay reseñas.','No reviews yet.')} className="min-h-[10rem]"/></div>}
 </section>;
}
