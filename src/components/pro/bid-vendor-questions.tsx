'use client';

import {useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {BID_PORTAL_QUESTION_LIMIT,type BidPortalQuestion} from '@/lib/pro/bid-portal';

/**
 * Row 53: the vendor asks questions about the bid and reads the owner's answers. Private to that invitation (no other
 * vendor sees it); a retried send reuses the same question id so nothing is duplicated; nothing is e-mailed.
 */
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal text-[#162543]';
const copy=(en:boolean)=>en?{
 title:'Questions for the professional',help:'Ask about scope, quantities or deadlines before you send your offer. Only the professional sees your question and answers it here.',
 closed:'The bid no longer accepts questions.',none:'You have not asked anything yet.',label:'Your question',send:'Send question',sending:'Sending…',asked:'Question sent.',
 answer:'Answer',pending:'Waiting for an answer.',limit:`You reached the maximum of ${BID_PORTAL_QUESTION_LIMIT} questions.`,
 invalid:'Write your question on a single line, up to 1000 characters.',session:'This invitation is no longer available. Ask the professional for a new link.',
 closedError:'The bid has closed; questions are no longer accepted.',uncertain:'Could not confirm the question. Retry: it is not duplicated.',retry:'Retry',
}:{
 title:'Preguntas para el profesional',help:'Consulte sobre alcance, cantidades o plazos antes de enviar su oferta. Solo el profesional ve su pregunta y la responde aquí.',
 closed:'La licitación ya no recibe preguntas.',none:'Todavía no ha hecho preguntas.',label:'Su pregunta',send:'Enviar pregunta',sending:'Enviando…',asked:'Pregunta enviada.',
 answer:'Respuesta',pending:'Esperando respuesta.',limit:`Llegó al máximo de ${BID_PORTAL_QUESTION_LIMIT} preguntas.`,
 invalid:'Escriba su pregunta en una sola línea, de hasta 1000 caracteres.',session:'Esta invitación ya no está disponible. Pida un enlace nuevo al profesional.',
 closedError:'La licitación ya cerró; no se aceptan más preguntas.',uncertain:'No se pudo confirmar la pregunta. Reintente: no se duplica.',retry:'Reintentar',
};
export function BidVendorQuestions({link,en,canAsk,questions,onChanged,onSession}:{link:string|null;en:boolean;canAsk:boolean;questions:BidPortalQuestion[];onChanged:()=>Promise<unknown>;onSession:()=>void}){
 const c=copy(en);
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState<{id:string;text:string}|null>(null);
 async function send(payload:{id:string;text:string}){
  setBusy(true);setError('');setNotice('');setPending(payload);
  try{
   const response=await fetch('/api/pro/bid-portal/questions',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({link:link??undefined,questionId:payload.id,text:payload.text})});
   const data=await response.json().catch(()=>({}));
   if(response.status>=500||response.status===429&&data.reason!=='limit'){setError(c.uncertain);return;}
   setPending(null);
   if(!response.ok){const why=data.reason as string;setError(why==='limit'?c.limit:why==='closed'?c.closedError:why==='session'?c.session:c.invalid);if(why==='session')onSession();return;}
   setText('');setNotice(c.asked);await onChanged();
  }catch{setError(c.uncertain);}
  finally{setBusy(false);}
 }
 function submit(event:FormEvent){event.preventDefault();if(busy)return;const value=text.trim();if(!value)return;void send(pending&&pending.text===value?pending:{id:crypto.randomUUID(),text:value});}
 const full=questions.length>=BID_PORTAL_QUESTION_LIMIT;
 return <section data-bid-portal-questions className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] p-4">
  <h2 className="text-base font-semibold">{c.title}</h2>
  <p className="text-sm text-[#52627a]">{canAsk?c.help:c.closed}</p>
  {questions.length===0?<p className="text-sm text-[#52627a]">{c.none}</p>:<ul className="space-y-2">{questions.map(q=><li key={q.id} data-bid-portal-question className="min-w-0 space-y-1 rounded-xl border border-[#e5e7eb] p-3 text-sm">
   <p className="break-words font-semibold">{q.question}</p>
   {q.answer?<p data-bid-portal-answer className="break-words rounded-lg bg-[#eef8f4] p-2 text-[#18573a]"><span className="font-semibold">{c.answer}:</span> {q.answer}</p>:<p className="text-[#52627a]">{c.pending}</p>}
  </li>)}</ul>}
  {canAsk&&!full&&<form onSubmit={submit} className="space-y-2">
   <label className="block text-sm font-semibold">{c.label}<input type="text" value={text} maxLength={1000} onChange={event=>{setText(event.target.value);}} className={field} data-bid-portal-question-input/></label>
   <Button type="submit" className="min-h-11" disabled={busy||!text.trim()}>{busy?c.sending:pending&&error===c.uncertain?c.retry:c.send}</Button>
  </form>}
  {canAsk&&full&&<p className="text-sm text-[#52627a]">{c.limit}</p>}
  {notice&&<p role="status" data-bid-portal-question-notice className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
  {error&&<p role="alert" data-bid-portal-question-error className="rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]">{error}</p>}
 </section>;
}
