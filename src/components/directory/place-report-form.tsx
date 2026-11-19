'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {REPORT_KINDS,type ReportKind} from '@/lib/directory/types';

/**
 * LOCAL PRO ONLY (multivertical F1/F2): «Reportar o pedir el retiro» form of a place page. Posts to
 * /api/lugar/<slug>/reporte (draft route, not wired yet). The reportId is kept across retries so a double submit
 * or a network retry creates a single report (the database answers the same for the same reportId).
 */
const LABELS:Record<ReportKind,[string,string]>={
 wrong_info:['La información es incorrecta','The information is wrong'],
 closed:['El lugar cerró','The place has closed'],
 duplicate:['Es un duplicado','It is a duplicate'],
 removal_request:['Solicito retirar esta ficha','I request removal of this listing'],
 abuse:['Contenido abusivo','Abusive content'],
 other:['Otro','Other'],
};
export function PlaceReportForm({slug,locale}:{slug:string;locale:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const reportId=useRef<string|null>(null),[state,setState]=useState<'idle'|'sending'|'sent'|'error'|'limit'>('idle');
 const box=useRef<HTMLDetailsElement>(null);
 // «Sugerir un cambio» (side card, 2026-11-19) links to #reportar: open the form and move focus to it.
 useEffect(()=>{const open=()=>{if(window.location.hash!=='#reportar'||!box.current)return;box.current.open=true;box.current.querySelector('summary')?.focus();};
  open();window.addEventListener('hashchange',open);return()=>window.removeEventListener('hashchange',open);},[]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(state==='sending')return;
  const form=new FormData(event.currentTarget);reportId.current??=crypto.randomUUID();setState('sending');
  try{
   const response=await fetch(`/api/lugar/${encodeURIComponent(slug)}/reporte`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({reportId:reportId.current,kind:form.get('kind'),message:form.get('message'),email:form.get('email')??''})});
   setState(response.ok?'sent':response.status===429?'limit':'error');
  }catch{setState('error');}
 }
 if(state==='sent')return <section id="reportar" aria-live="polite" data-place-report="sent" className="rounded-2xl bg-emerald-50 p-5 text-emerald-900">
  {t('Gracias. Revisaremos su reporte. Si pidió el retiro, le escribiremos al correo indicado.','Thank you. We will review your report. If you requested removal, we will write to the e-mail you provided.')}</section>;
 return <details ref={box} id="reportar" className="scroll-mt-24 rounded-2xl border border-[#e3e9ef] bg-white px-5 py-3 text-[#162543]" data-place-report={state}>
  <summary className="flex min-h-11 cursor-pointer items-center font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]">{t('Reportar un problema o pedir el retiro','Report a problem or request removal')}</summary>
  <form onSubmit={submit} className="mt-4 space-y-3">
   <label className="block text-sm font-medium" htmlFor="place-report-kind">{t('Motivo','Reason')}</label>
   <select id="place-report-kind" name="kind" required className="min-h-11 w-full rounded-lg border border-slate-300 px-3" onChange={()=>{reportId.current=null;}}>
    {REPORT_KINDS.map(k=><option key={k} value={k}>{LABELS[k][en?1:0]}</option>)}
   </select>
   <label className="block text-sm font-medium" htmlFor="place-report-message">{t('Detalle','Details')}</label>
   <textarea id="place-report-message" name="message" required minLength={5} maxLength={2000} rows={4} className="w-full rounded-lg border border-slate-300 p-3" onChange={()=>{reportId.current=null;}}/>
   <label className="block text-sm font-medium" htmlFor="place-report-email">{t('Correo para responderle (opcional)','E-mail for our reply (optional)')}</label>
   <input id="place-report-email" name="email" type="email" maxLength={254} autoComplete="email" className="min-h-11 w-full rounded-lg border border-slate-300 px-3" onChange={()=>{reportId.current=null;}}/>
   <p className="text-xs text-slate-600">{t('Usaremos su correo solo para atender este reporte.','We will use your e-mail only to handle this report.')}</p>
   {state==='error'&&<p role="alert" className="text-sm text-red-700">{t('No pudimos enviar el reporte. Revise los datos e intente de nuevo.','We could not send the report. Please check the details and try again.')}</p>}
   {state==='limit'&&<p role="alert" className="text-sm text-red-700">{t('Se recibieron demasiados reportes. Intente más tarde.','Too many reports were received. Please try again later.')}</p>}
   <button type="submit" disabled={state==='sending'} className="inline-flex min-h-11 items-center rounded-full bg-[#162543] px-5 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">
    {state==='sending'?t('Enviando…','Sending…'):t('Enviar reporte','Send report')}</button>
  </form>
 </details>;
}
