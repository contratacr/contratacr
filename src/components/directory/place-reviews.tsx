'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {useRouter} from 'next/navigation';
import {PhotoPicker,uploadPlacePhotos} from './place-photo-upload';
import type {PublicPlaceReviews,ReplyTarget} from '@/lib/directory/review-schemas';
import {FlagReview,OwnerReplyEditor} from './place-review-actions';
import {ReviewCard,ReviewsEmpty,ReviewsSummary} from '@/components/professionals/review-section';
import {LeaveReviewModal} from '@/components/professionals/leave-review-modal';

/**
 * LOCAL PRO ONLY (multivertical F5): reviews of a place. Same rules as professional reviews (half stars, 300
 * characters, no links). With an account the profile name is used; without one, only after contacting the business
 * from ContrataCR on this device. After sending, the page refreshes so the new review shows in the list.
 * M1: the business (manage = dir_review_reply_targets, only for its managers) replies once per review and may edit the
 * reply («editada»); everyone else can report a review to the moderators.
 *
 * Look (owner 2026-11-27, «la reseña debe de ser igual a la de los profesionales… sigue siendo diferente»): built from the
 * SAME components as the professional profile's Reseñas tab — ReviewsSummary, the embedded LeaveReviewModal card,
 * ReviewCard and ReviewsEmpty (review-section.tsx / leave-review-modal.tsx). Only the data and the submit call differ:
 * the card posts to /api/lugar/<slug>/resenas through its `enviar` prop.
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

export function PlaceReviews({slug,locale,initial,signedIn,manage=null,note,distribution=null,placeName}:{slug:string;locale:string;initial:PublicPlaceReviews;signedIn:boolean;manage?:ReplyTarget[]|null;note?:string;distribution?:number[]|null;placeName?:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const router=useRouter();
 const [photos,setPhotos]=useState<File[]>([]),[photoNote,setPhotoNote]=useState<string|null>(null);
 const sectionRef=useRef<HTMLElement>(null),action=useRef('');
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 // «Reseñar» (#escribir-resena, bottom bar) brings the write card into view.
 useEffect(()=>{
  const fromHash=()=>{if(window.location.hash!=='#escribir-resena')return;
   requestAnimationFrame(()=>{const box=sectionRef.current?.querySelector('[data-place-review-form]');box?.scrollIntoView({block:'center'});(box?.querySelector('button') as HTMLElement|null)?.focus({preventScroll:true});});};
  fromHash();window.addEventListener('hashchange',fromHash);return()=>window.removeEventListener('hashchange',fromHash);
 },[]);
 const enviar=async({rating,comment,nombre}:{rating:number;comment:string;nombre?:string}):Promise<string|null>=>{
  if(!action.current)action.current=crypto.randomUUID();
  try{
   const r=await fetch(`/api/lugar/${encodeURIComponent(slug)}/resenas`,{method:'POST',headers:{'content-type':'application/json','accept-language':en?'en':'es'},
    body:JSON.stringify({actionId:action.current,rating,comment,...(signedIn?{}:{authorName:nombre??''})})});
   const data=await r.json().catch(()=>({})) as {reason?:string;error?:string};
   action.current=crypto.randomUUID();
   if(r.ok){
    // Photos of the review (launch round 2026-11-18): uploaded after the review exists; they wait for staff approval.
    if(signedIn&&photos.length){const up=await uploadPlacePhotos(slug,photos,{review:true,en});setPhotos([]);
     if(up.pending>0)setPhotoNote(t(`${up.pending===1?'Su foto quedó pendiente':`Sus ${up.pending} fotos quedaron pendientes`} de revisión.`,`${up.pending===1?'Your photo is':`Your ${up.pending} photos are`} awaiting review.`));}
    return null;
   }
   return data.reason==='invalid'&&data.error?data.error:(REASONS[data.reason??'']??REASONS.unavailable)![en?1:0];
  }catch{action.current=crypto.randomUUID();return REASONS.unavailable![en?1:0];}
 };
 const count=initial.summary.count,avg=initial.summary.average??0;
 return <section ref={sectionRef} id="resenas" aria-label={t('Reseñas','Reviews')} className="scroll-mt-32" data-place-reviews={count}>
  <span id="escribir-resena" className="block scroll-mt-32" aria-hidden="true"/>
  <ReviewsSummary reviewCount={count} ratingAvg={avg} distribution={distribution&&distribution.length===5?distribution:null} hooks
   note={note?<p role="note" data-place-review-note className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">{note}</p>:null}/>
  {/* The write card ABOVE the list, the professional profile's own component. */}
  <div className="mb-6">
   {manage?<p className="rounded-2xl bg-[#F7FAFC] p-4 text-sm text-slate-700" data-place-review-manager tabIndex={-1}>{t('Usted administra esta empresa: puede responder las reseñas, pero no reseñarla.','You manage this business: you can reply to reviews, but not review it.')}</p>
   :<div data-place-review-form data-ready={ready||undefined}>
    <LeaveReviewModal professionalId={`lugar:${slug}`} professionalName={placeName??''} embedded isAuthenticated={signedIn} pedirNombre={!signedIn}
     pregunta={t('¿Ya visitó este lugar?','Have you been here?')} enviar={enviar} onClose={()=>undefined} onSuccess={()=>router.refresh()}
     extra={signedIn?<div className="space-y-1 text-sm"><PhotoPicker files={photos} onChange={setPhotos} en={en} label={t('Agregar fotos a la reseña (opcional)','Add photos to the review (optional)')}/>
      <p className="text-xs text-[#68778d]">{t('Se revisan antes de publicarse.','They are reviewed before they are published.')}</p></div>:null}/>
    {photoNote&&<p role="status" className="mt-2 text-sm text-[#526277]" data-place-review-photos-pending>{photoNote}</p>}
   </div>}
  </div>
  {/* Flat list with thin dividers (owner 2026-11-27, «en plano y con divisiones»): the production professional profile's
      review rows (ReviewCard classic), one under the other. */}
  <div className="flex flex-col">
   {initial.items.map(r=><div key={r.id} data-place-review={r.id} className="border-b border-[#eef2f6] py-4 first:pt-0 last:border-b-0">
    <ReviewCard directory={false} wrap name={r.name} rating={r.rating} createdAt={r.createdAt} comment={r.comment}
     subtitle={r.guest?t('Sin cuenta, contactó a la empresa','No account, contacted the business'):null}
     report={manage?null:<FlagReview slug={slug} reviewId={r.id} locale={locale}/>}>
     {r.ownerReply&&<div className="mt-3 rounded-xl border-l-[3px] border-[#009FD9] bg-[#f5fafd] px-4 py-3 text-sm" data-owner-reply>
      <p className="mb-1 text-[12px] font-extrabold uppercase tracking-wide text-[#0083b0]">{t('Respuesta de la empresa','Reply from the business')}</p>
      <p className="break-words leading-6 text-[#1f2937]">{r.ownerReply.text}</p>
      <p className="mt-1 text-xs text-slate-600">{new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(r.ownerReply.at))}{r.ownerReply.edited?` · ${t('editada','edited')}${r.ownerReply.editedAt?` ${new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(r.ownerReply.editedAt))}`:''}`:''}</p></div>}
     {manage?(()=>{const target=manage.find(m=>m.reviewId===r.id);return target?<OwnerReplyEditor target={target} locale={locale}/>:null;})():null}
    </ReviewCard>
   </div>)}
   {initial.items.length===0&&<div data-place-reviews-empty><ReviewsEmpty/></div>}
  </div>
 </section>;
}
