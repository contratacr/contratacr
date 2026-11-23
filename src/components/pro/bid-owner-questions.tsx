'use client';

import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {bidPortalOwnerQuestionsSchema,type BidPortalOwnerQuestions} from '@/lib/pro/bid-portal';
import type {BidPackage} from '@/lib/pro/bids';

/**
 * Row 53, owner side: questions the invited vendors asked about the bid, each answered once. A vendor sees only its own
 * question and answer (never other vendors'); nothing is e-mailed, so the owner tells the vendor in the usual channel if needed.
 */
const api='/api/pro/bid-portal-links';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal text-[#162543]';
const copy=(en:boolean)=>en?{
 title:'Questions from vendors',help:'Each answer is visible only to the vendor that asked. Answer once; it cannot be edited afterwards.',none:'No questions yet.',
 loading:'Loading questions…',loadError:'Could not load the questions.',retry:'Retry',asked:'Asked',answerLabel:'Your answer',send:'Send answer',sending:'Saving…',
 answered:'Answered',saved:'Answer saved.',changed:'The question changed. Updated; try again.',failed:'Could not save the answer. Try again.',uncertain:'Could not confirm. Retry the same answer; it is not duplicated.',
 from:(name:string)=>`From ${name}`,
}:{
 title:'Preguntas de proveedores',help:'Cada respuesta la ve solo el proveedor que preguntó. Se responde una vez; después no se puede editar.',none:'Todavía no hay preguntas.',
 loading:'Cargando preguntas…',loadError:'No se pudieron cargar las preguntas.',retry:'Reintentar',asked:'Preguntó',answerLabel:'Su respuesta',send:'Enviar respuesta',sending:'Guardando…',
 answered:'Respondida',saved:'Respuesta guardada.',changed:'La pregunta cambió. Ya se actualizó; vuelva a intentarlo.',failed:'No se pudo guardar la respuesta. Vuelva a intentarlo.',uncertain:'No se pudo confirmar. Reintente la misma respuesta; no se duplica.',
 from:(name:string)=>`De ${name}`,
};
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
export function BidOwnerQuestions({accountId,workId,pkg,en,readOnly}:{accountId:string;workId:string;pkg:BidPackage;en:boolean;readOnly:boolean}){
 const c=copy(en);
 const [data,setData]=useState<BidPortalOwnerQuestions|null>(null),[loadError,setLoadError]=useState(false),[drafts,setDrafts]=useState<Record<string,string>>({}),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const sequence=useRef(0);
 const load=useCallback(async()=>{
  const id=++sequence.current;setLoadError(false);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({view:'questions',workId,id:pkg.id}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});
   if(!response.ok)throw Error();
   const body=bidPortalOwnerQuestionsSchema.parse(await response.json());if(id===sequence.current)setData(body);
  }catch{if(id===sequence.current)setLoadError(true);}
 },[accountId,workId,pkg.id]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{sequence.current++;clearTimeout(timer);};},[load,pkg.revision]);
 async function answer(event:FormEvent,questionId:string){
  event.preventDefault();const text=(drafts[questionId]??'').trim();if(!text||busy)return;
  setBusy(questionId);setError('');setNotice('');
  try{
   const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({action:'answer_question',workId,questionId,answer:text})});
   if(response.status>=500){setError(c.uncertain);return;}
   if(!response.ok){setError(response.status===409?c.changed:c.failed);if(response.status===409)await load();return;}
   setDrafts(current=>{const next={...current};delete next[questionId];return next;});setNotice(c.saved);await load();
  }catch{setError(c.uncertain);}
  finally{setBusy(null);}
 }
 const nameOf=(supplierId:string)=>pkg.vendors.find(vendor=>vendor.supplierId===supplierId)?.name??'—';
 return <section data-bid-owner-questions className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <h4 className="text-base font-semibold">{c.title}</h4>
  <p className="text-sm text-[#52627a]">{c.help}</p>
  {loadError&&!data?<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{c.retry}</Button></div>
  :!data?<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>
  :data.questions.length===0?<p className="text-sm text-[#52627a]">{c.none}</p>
  :<ul className="space-y-3">{data.questions.map(q=><li key={q.id} data-bid-owner-question={q.id} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] p-3 text-sm">
   <p className="text-xs text-[#52627a]">{c.from(nameOf(q.supplierId))} · {c.asked} {stamp(q.askedAt,en)}</p>
   <p className="break-words font-semibold">{q.question}</p>
   {q.answer?<p data-bid-owner-answer className="break-words rounded-lg bg-[#eef8f4] p-2 text-[#18573a]"><span className="font-semibold">{c.answered}:</span> {q.answer}</p>
   :!readOnly&&<form onSubmit={event=>void answer(event,q.id)} className="space-y-2">
    <label className="block text-sm font-semibold">{c.answerLabel}<input type="text" maxLength={2000} value={drafts[q.id]??''} onChange={event=>setDrafts({...drafts,[q.id]:event.target.value})} className={field} data-bid-owner-answer-input/></label>
    <Button type="submit" className="min-h-11" disabled={busy!==null||!(drafts[q.id]??'').trim()}>{busy===q.id?c.sending:c.send}</Button>
   </form>}
  </li>)}</ul>}
  {notice&&<p role="status" className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
  {error&&<p role="alert" className="rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]">{error}</p>}
 </section>;
}
