'use client';
import {SELECT_CLASS,SELECT_STYLE} from './select-style';
import {useRef,useState,useSyncExternalStore} from 'react';
import {REVIEW_FLAG_LABELS,REVIEW_FLAG_REASONS} from '@/lib/directory/moderation-schemas';
import type {ReplyTarget} from '@/lib/directory/review-schemas';

/**
 * LOCAL PRO ONLY (multivertical M1): actions under one review of a place page.
 * - OwnerReplyEditor: the business (active owner/manager of the claimed place, or an admin/manager of its Pro team)
 *   posts ONE public reply and may edit it; the revision shown travels with the edit (another edit first → reload).
 * - FlagReview: anyone may report a review to the moderators (the review stays visible until staff decide).
 */
const field='min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543]';
const noSubscribe=()=>()=>{};
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const REPLY_REASONS:Record<string,[string,string]>={
 reload:['La respuesta cambió en otra pestaña o por otra persona. Recargue la página.','The reply was changed in another tab or by someone else. Please reload the page.'],
 reply_not_manager:['Solo el negocio que administra este lugar puede responder.','Only the business that manages this place can reply.'],
 reply_role:['Su rol en el equipo no permite publicar respuestas. Pida a un administrador o gerente.','Your team role cannot publish replies. Ask an admin or manager.'],
 not_found:['Esta reseña ya no está disponible.','This review is no longer available.'],
 unavailable:['No se pudo guardar. Intente de nuevo.','Could not save. Please try again.'],
};
export function OwnerReplyEditor({target,locale}:{target:ReplyTarget;locale:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const [open,setOpen]=useState(false),[state,setState]=useState<'idle'|'sending'|'saved'>('idle'),[error,setError]=useState<string|null>(null),[saved,setSaved]=useState<{text:string;revision:number}|null>(null);
 const action=useRef(''),text=useRef<HTMLTextAreaElement>(null);
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 const current=saved??(target.reply?{text:target.reply,revision:target.replyRevision}:null);
 if(target.own)return null;
 const submit=async()=>{
  if(!action.current)action.current=crypto.randomUUID();
  setState('sending');setError(null);
  const reply=text.current?.value??'';
  try{
   const r=await fetch('/api/negocio/respuestas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actionId:action.current,reviewId:target.reviewId,reply,replyRevision:current?.revision??0})});
   const j=await r.json().catch(()=>({})) as {reason?:string;error?:string;replyRevision?:number};
   action.current='';
   if(r.ok){setSaved({text:reply.trim(),revision:Number(j.replyRevision)});setState('saved');setOpen(false);return;}
   setState('idle');setError(j.reason==='invalid'&&j.error?j.error:(REPLY_REASONS[j.reason??'']??REPLY_REASONS.unavailable)![en?1:0]);
  }catch{setState('idle');setError(REPLY_REASONS.unavailable![en?1:0]);}
 };
 return <div className="mt-3 space-y-2" data-owner-reply-editor={target.reviewId} data-ready={ready||undefined}>
  {saved&&<p role="status" className="rounded-xl bg-emerald-50 p-2 text-sm text-emerald-900" data-owner-reply-saved>{t('Respuesta publicada: ','Reply published: ')}<span className="break-words">&quot;{saved.text}&quot;</span></p>}
  {target.replyStatus==='hidden'&&!saved&&<p className="text-sm text-slate-700">{t('El equipo de ContrataCR ocultó su respuesta. Puede corregirla; seguirá oculta hasta que la revisen.','The ContrataCR team hid your reply. You may correct it; it stays hidden until they review it.')}</p>}
  {!open?<button type="button" onClick={()=>{setOpen(true);setState('idle');}} className={`inline-flex min-h-11 items-center rounded-full border border-[#162543] px-4 text-sm font-semibold ${ring}`}>
    {current?t('Editar respuesta','Edit reply'):t('Responder como el negocio','Reply as the business')}</button>
   :<form className="space-y-2" onSubmit={e=>{e.preventDefault();void submit();}}>
    <label className="flex flex-col gap-1 text-sm font-medium">{t('Respuesta pública del negocio (máximo 1000 caracteres, sin enlaces)','Public reply from the business (up to 1000 characters, no links)')}
     <textarea ref={text} name="reply" rows={3} maxLength={1000} required defaultValue={current?.text??''} onChange={()=>{action.current='';}} className={`${field} py-2`}/></label>
    <div className="flex flex-wrap gap-2"><button type="submit" disabled={state==='sending'} className={`inline-flex min-h-11 items-center rounded-full bg-[#162543] px-5 text-sm font-semibold text-white disabled:opacity-60 ${ring}`}>{current?t('Guardar cambios','Save changes'):t('Publicar respuesta','Post reply')}</button>
     <button type="button" onClick={()=>setOpen(false)} className={`inline-flex min-h-11 items-center rounded-full border border-slate-300 px-4 text-sm font-semibold ${ring}`}>{t('Cancelar','Cancel')}</button></div>
    {current&&<p className="text-xs text-slate-600">{t('Cada versión queda guardada en el historial de la respuesta.','Every version is kept in the reply history.')}</p>}
   </form>}
  {error&&<p role="alert" className="text-sm font-semibold text-red-800" data-owner-reply-error>{error}</p>}
 </div>;
}

export function FlagReview({slug,reviewId,locale}:{slug:string;reviewId:string;locale:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const flagId=useRef(''),[state,setState]=useState<'idle'|'sending'|'sent'|'error'|'limit'|'own'>('idle'),[reason,setReason]=useState<string>('spam');
 if(state==='sent')return <p role="status" className="mt-2 text-sm text-emerald-900" data-review-flag-sent>{t('Gracias. El equipo de ContrataCR revisará esta reseña.','Thank you. The ContrataCR team will look into this report..')}</p>;
 const submit=async(form:HTMLFormElement)=>{
  if(!flagId.current)flagId.current=crypto.randomUUID();
  const message=String(new FormData(form).get('message')??'').trim();setState('sending');
  try{
   const r=await fetch(`/api/lugar/${encodeURIComponent(slug)}/resenas/reporte`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({flagId:flagId.current,reviewId,reason,...(message?{message}:{})})});
   const j=await r.json().catch(()=>({})) as {reason?:string};
   if(r.ok){setState('sent');return;}
   flagId.current='';setState(r.status===429?'limit':j.reason==='flag_own_review'?'own':'error');
  }catch{setState('error');}
 };
 return <details className="mt-2 text-sm" data-review-flag={reviewId}>
  <summary className={`inline-flex min-h-11 cursor-pointer items-center text-slate-700 underline underline-offset-2 ${ring}`}>{t('Reportar esta reseña','Report this review')}</summary>
  <form className="mt-2 space-y-2 rounded-xl border border-slate-200 p-3" onSubmit={e=>{e.preventDefault();void submit(e.currentTarget);}}>
   <label className="flex flex-col gap-1 font-medium">{t('Motivo','Reason')}
    <select aria-label={t('Motivo','Reason')} value={reason} onChange={e=>{setReason(e.target.value);flagId.current='';}} className={`${field} ${SELECT_CLASS}`} style={SELECT_STYLE}>{REVIEW_FLAG_REASONS.map(r=><option key={r} value={r}>{REVIEW_FLAG_LABELS[r][en?1:0]}</option>)}</select></label>
   <label className="flex flex-col gap-1 font-medium">{reason==='other'?t('Detalle (obligatorio)','Details (required)'):t('Detalle (opcional)','Details (optional)')}
    <textarea name="message" rows={2} maxLength={500} required={reason==='other'} minLength={reason==='other'?5:undefined} onChange={()=>{flagId.current='';}} className={`${field} py-2`}/></label>
   <button type="submit" disabled={state==='sending'} className={`inline-flex min-h-11 items-center rounded-full bg-[#162543] px-4 font-semibold text-white disabled:opacity-60 ${ring}`}>{t('Enviar reporte','Send report')}</button>
   {state==='error'&&<p role="alert" className="font-semibold text-red-800">{t('No se pudo enviar. Intente de nuevo.','Could not send. Please try again.')}</p>}
   {state==='limit'&&<p role="alert" className="font-semibold text-red-800">{t('Alcanzó el máximo de reportes por hoy.','You reached the daily limit of reports.')}</p>}
   {state==='own'&&<p role="alert" className="font-semibold text-red-800">{t('No puede reportar su propia reseña.','You cannot report your own review.')}</p>}
  </form>
 </details>;
}
