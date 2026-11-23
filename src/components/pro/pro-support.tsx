'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {SLA_TARGET_HOURS} from '@/lib/pro/help-content';

/**
 * Row 74: Pro support. Writes a ticket in the platform's own support thread (topic "pro") and reads the thread and
 * replies through the existing support routes. The answer times are TARGETS, not a commitment, until a service level
 * is approved.
 */
type Ticket={id:string;caseNumber:number;subject:string;status:string;priority:'normal'|'urgent'|null;createdAt:string;dueAt:string|null;firstResponseAt:string|null;sla:'met'|'late'|'overdue'|'pending';lastReplyRole:string|null};
type Message={id:string;sender_role:'user'|'admin';sender_name:string|null;body:string;created_at:string};
const card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
export function ProSupport(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,alive=useRef(true);
 const [tickets,setTickets]=useState<Ticket[]|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [form,setForm]=useState({subject:'',message:'',priority:'normal' as 'normal'|'urgent'}),[openId,setOpenId]=useState<string|null>(null),[thread,setThread]=useState<Message[]|null>(null),[reply,setReply]=useState('');
 const fmt=(iso:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'}).format(new Date(iso));
 const load=useCallback(async()=>{setFailed(false);try{const r=await fetch('/api/pro/company-support',{cache:'no-store'});if(!r.ok)throw Error();const body=await r.json() as {tickets:Ticket[]};if(alive.current)setTickets(body.tickets);}catch{if(alive.current)setFailed(true);}},[]);
 useEffect(()=>{alive.current=true;const timer=setTimeout(()=>void load(),0);return()=>{alive.current=false;clearTimeout(timer);};},[load]);
 async function send(e:FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/pro/company-support',{method:'POST',headers:{'Content-Type':'application/json',Origin:location.origin},body:JSON.stringify(form)});
   if(!r.ok){const b=await r.json().catch(()=>({})) as {error?:string};throw Error(b.error||'x');}
   setForm({subject:'',message:'',priority:'normal'});setNotice(t('Recibimos su consulta. Le responderemos en esta misma pantalla y por correo.','We received your request. We will answer on this screen and by email.'));await load();
  }catch(err){setError(err instanceof Error&&err.message!=='x'?err.message:t('No se pudo enviar la consulta. Reintente.','Could not send your request. Retry.'));}finally{setBusy(false);}
 }
 async function openThread(id:string){
  if(openId===id){setOpenId(null);return;}setOpenId(id);setThread(null);setReply('');
  try{const r=await fetch('/api/support?id='+encodeURIComponent(id),{cache:'no-store'});if(!r.ok)throw Error();const b=await r.json() as {messages:Message[]};setThread(b.messages);}catch{setThread([]);setError(t('No se pudo abrir la conversación.','Could not open the conversation.'));}
 }
 async function sendReply(id:string){
  if(busy||!reply.trim())return;setBusy(true);setError('');
  try{const r=await fetch('/api/support',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticketId:id,body:reply})});if(!r.ok)throw Error();setReply('');setOpenId(null);await openThread(id);await load();}
  catch{setError(t('No se pudo enviar el mensaje.','Could not send the message.'));}finally{setBusy(false);}
 }
 const slaText=(x:Ticket)=>x.sla==='met'?t('Respondido dentro del objetivo','Answered within target'):x.sla==='late'?t('Respondido fuera del objetivo','Answered after target'):x.sla==='overdue'?t('Objetivo de respuesta vencido: lo estamos revisando','Response target passed: we are looking into it'):t('Esperando la primera respuesta','Waiting for the first answer');
 const statusText=(s:string)=>s==='open'?t('Abierta','Open'):s==='in_progress'?t('En proceso','In progress'):s==='resolved'?t('Resuelta','Resolved'):t('Cerrada','Closed');
 return <div data-pro-support className="min-w-0 space-y-4">
  <section className={card} aria-labelledby="ps-new"><h3 id="ps-new" className="font-bold">{t('Escribir a soporte','Write to support')}</h3>
   <p data-sla-target className="text-sm text-[#52627a]">{t(`Objetivo de primera respuesta: ${SLA_TARGET_HOURS.urgent} horas si no puede trabajar, ${SLA_TARGET_HOURS.normal} horas en las demás consultas. Es una meta de atención, no una garantía.`,`First-response target: ${SLA_TARGET_HOURS.urgent} hours if you cannot work, ${SLA_TARGET_HOURS.normal} hours for other requests. It is a service goal, not a guarantee.`)}</p>
   <form onSubmit={e=>void send(e)} className="space-y-3">
    <label className="block text-sm font-bold">{t('Asunto','Subject')}<input required minLength={3} maxLength={150} value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} className={field}/></label>
    <label className="block text-sm font-bold">{t('Prioridad','Priority')}<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value as 'normal'|'urgent'})} className={field}><option value="normal">{t('Normal','Normal')}</option><option value="urgent">{t('Urgente: no puedo trabajar','Urgent: I cannot work')}</option></select></label>
    <label className="block text-sm font-bold">{t('Mensaje','Message')}<textarea required minLength={5} maxLength={4000} value={form.message} onChange={e=>setForm({...form,message:e.target.value})} className={field+' min-h-28 py-2'}/></label>
    <Button type="submit" disabled={busy}>{busy?t('Enviando…','Sending…'):t('Enviar consulta','Send request')}</Button></form>
   {error&&<p role="alert" data-support-error className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" data-support-notice className="text-sm text-[#18794e]">{notice}</p>}
  </section>
  <section className={card} aria-labelledby="ps-list"><h3 id="ps-list" className="font-bold">{t('Sus consultas','Your requests')}</h3>
   {failed?<div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{t('No se pudo cargar el soporte.','Could not load support.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>
   :!tickets?<p role="status" aria-busy="true" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>
   :!tickets.length?<p className="text-sm text-[#52627a]">{t('Todavía no ha escrito a soporte.','You have not written to support yet.')}</p>
   :<ul className="divide-y divide-[#e6edf3]">{tickets.map(x=><li key={x.id} data-support-ticket={x.id} data-sla={x.sla} className="space-y-2 py-3">
    <button type="button" aria-expanded={openId===x.id} onClick={()=>void openThread(x.id)} className="min-h-11 w-full min-w-0 text-left"><div className="break-words text-sm font-semibold text-[#162543]">SUP-{x.caseNumber} · {x.subject}</div>
     <div className="text-xs text-[#52627a]">{statusText(x.status)} · {x.priority==='urgent'?t('Urgente','Urgent'):t('Normal','Normal')} · {fmt(x.createdAt)}</div><div data-sla-state className="text-xs text-[#52627a]">{slaText(x)}{x.sla==='pending'&&x.dueAt?t(`. Objetivo: ${fmt(x.dueAt)}`,`. Target: ${fmt(x.dueAt)}`):''}</div></button>
    {openId===x.id&&<div className="space-y-2" data-support-thread>{thread===null?<p role="status" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>
     :<ul className="space-y-2">{thread.map(m=><li key={m.id} className={'min-w-0 rounded-xl p-3 text-sm '+(m.sender_role==='admin'?'bg-[#eaf7fb]':'bg-[#f3f6f9]')}><div className="text-xs font-semibold text-[#52627a]">{m.sender_role==='admin'?t('Soporte ContrataCR','ContrataCR Support'):t('Usted','You')} · {fmt(m.created_at)}</div><p className="whitespace-pre-wrap break-words">{m.body}</p></li>)}</ul>}
     {x.status!=='closed'&&<div className="space-y-2"><label className="block text-sm font-bold">{t('Responder','Reply')}<textarea maxLength={4000} value={reply} onChange={e=>setReply(e.target.value)} className={field+' min-h-20 py-2'}/></label><Button type="button" variant="secondary" disabled={busy||!reply.trim()} onClick={()=>void sendReply(x.id)}>{t('Enviar respuesta','Send reply')}</Button></div>}</div>}
   </li>)}</ul>}
  </section></div>;
}
