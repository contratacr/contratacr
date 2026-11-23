'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {crTodayISO} from '@/lib/time-cr';
import {privateEstimateMoney} from './private-estimate-preview';
import {acceptanceEstimateReadSchema,acceptanceResultSchema,recordedAcceptanceMethods,type AcceptanceInput} from '@/lib/pro/quote-recorded-acceptance';
import type {PrivateEstimate} from '@/lib/pro/private-estimates';

/**
 * Row 35: a quote accepted OUTSIDE the platform (signed paper, e-mail, WhatsApp, phone, in person). The professional records who accepted, when,
 * how and an evidence note, and the quote becomes the accepted agreement of the job. It is the professional's statement, shown as such: the
 * platform never presents it as the customer's own acceptance. Colones only (the job's finance readers are in colones).
 */
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
const reasons=(en:boolean):Record<string,string>=>en?{currency:'Only quotes in colones can become the agreement of a job.',job:'Choose the job.',convert_first:'Convert the opportunity into a job first.',other_job:'This quote belongs to another job.',
 job_rules:'This job cannot take the agreement (another customer, cancelled, already agreed or with earlier finances).',already_accepted:'This quote already has an accepted version.',stale:'The draft changed. Reload and try again.',client_archived:'Restore the customer first.',empty:'The quote has no amount to agree.'}
 :{currency:'Solo las cotizaciones en colones pueden quedar como acuerdo del trabajo.',job:'Elija el trabajo.',convert_first:'Convierta primero la oportunidad en trabajo.',other_job:'Esta cotización pertenece a otro trabajo.',
 job_rules:'Este trabajo no admite el acuerdo (otro cliente, cancelado, con otro acuerdo o con finanzas anteriores).',already_accepted:'Esta cotización ya tiene una versión aceptada.',stale:'El borrador cambió. Recargue e intente de nuevo.',client_archived:'Restaure primero al cliente.',empty:'La cotización no tiene un monto que acordar.'};
export function QuoteRecordedAcceptance({actor,estimate,blocked=false}:{actor:string;estimate:PrivateEstimate;blocked?:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,methodNames:Record<string,string>={signed_paper:t('Firma en papel','Signed on paper'),email:t('Correo electrónico','Email'),whatsapp:'WhatsApp',phone:t('Llamada telefónica','Phone call'),in_person:t('En persona','In person'),partial_response:t('Respuesta por partidas en la plataforma','Item-by-item response in the platform')};
 const [data,setData]=useState<ReturnType<typeof acceptanceEstimateReadSchema.parse>|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),attempt=useRef<{key:string;id:string}|null>(null);
 const [form,setForm]=useState({workId:'',method:'signed_paper' as typeof recordedAcceptanceMethods[number],acceptedOn:crTodayISO(),acceptedByName:estimate.client.name.slice(0,120),evidenceNote:''});
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/quote-acceptance?'+new URLSearchParams({estimateId:estimate.id}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error();setData(acceptanceEstimateReadSchema.parse(await r.json()));}catch{setData(null);}},[actor,estimate.id]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load,estimate.revision]);
 if(estimate.status!=='draft'||!data||(data.accepted&&!data.recorded))return null;
 const money=(cents:number)=>privateEstimateMoney(cents,estimate.currency,en),when=(day:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'long',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
 if(data.recorded){const r=data.recorded;return <section data-quote-recorded className="min-w-0 space-y-1 rounded-2xl border border-[#b9e0c8] bg-[#f4fbf7] p-3 text-sm text-[#162543]">
  <h4 className="font-bold">{t('Aceptación registrada','Recorded acceptance')}</h4>
  <p>{t(`Quedó como acuerdo del trabajo ${r.workId} (versión ${r.version}, ${money(r.totalCents)}). Aceptó ${r.acceptedByName} el ${when(r.acceptedOn)} por: ${methodNames[r.method]}.`,`It is the agreement of job ${r.workId} (version ${r.version}, ${money(r.totalCents)}). Accepted by ${r.acceptedByName} on ${when(r.acceptedOn)} via: ${methodNames[r.method]}.`)}</p>
  {r.evidenceNote&&<p className="break-words text-[#52627a]">{t('Evidencia: ','Evidence: ')}{r.evidenceNote}</p>}
  <p className="text-xs text-[#52627a]">{r.kind==='external'?t('Es un registro del profesional; no es una aceptación hecha por el cliente en la plataforma.','This is the professional\'s record; it is not an acceptance made by the customer in the platform.'):t('Viene de la respuesta formal del cliente por partidas.','It comes from the customer\'s formal item-by-item response.')}</p></section>;}
 async function submit(event:FormEvent){
  event.preventDefault();if(busy||blocked)return;const input:AcceptanceInput={action:'external',actionId:'',estimateId:estimate.id,estimateRevision:data!.revision,workId:form.workId,method:form.method,acceptedOn:form.acceptedOn,acceptedByName:form.acceptedByName.trim(),evidenceNote:form.evidenceNote.trim()};
  const key=JSON.stringify({...input,actionId:''});if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};input.actionId=attempt.current.id;
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/pro/quote-acceptance',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify(input)});const body=await r.json().catch(()=>({})) as {reason?:string};
   if(!r.ok){if(r.status===400||r.status===409)attempt.current=null;setError(body.reason&&reasons(en)[body.reason]?reasons(en)[body.reason]:t('Revise los datos: nombre, fecha, forma y una nota de evidencia de al menos 10 caracteres.','Check the details: name, date, method and an evidence note of at least 10 characters.'));return;}
   const result=acceptanceResultSchema.parse(body);attempt.current=null;setOpen(false);setNotice(t(`Listo: la cotización quedó como acuerdo aceptado del trabajo ${result.workId}.`,`Done: the quote is now the accepted agreement of job ${result.workId}.`));await load();
  }catch{setError(t('No se pudo comprobar el guardado. Intente de nuevo; no se registrará dos veces.','Could not confirm the save. Try again; it will not be recorded twice.'));}finally{setBusy(false);}
 }
 return <section data-quote-record-acceptance className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-3">
  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><h4 className="font-bold text-[#162543]">{t('Aceptación fuera de la plataforma','Acceptance outside the platform')}</h4>
   {!open&&<Button type="button" variant="outline" data-pro-write="sales.write" data-quote-record-open disabled={blocked||estimate.currency!=='CRC'} onClick={()=>{setOpen(true);setNotice('');}}>{t('Registrar aceptación','Record acceptance')}</Button>}</div>
  <p className="text-sm text-[#52627a]">{estimate.currency!=='CRC'?t('Solo las cotizaciones en colones pueden quedar como acuerdo del trabajo.','Only quotes in colones can become the agreement of a job.'):t('Si el cliente aceptó por otro medio, regístrelo con quién, cuándo y cómo, y cite la evidencia. La cotización queda como acuerdo del trabajo; es su declaración, no una aceptación del cliente en la plataforma.','If the customer accepted by another means, record who, when and how, and cite the evidence. The quote becomes the job agreement; it is your statement, not an acceptance by the customer in the platform.')}</p>
  {notice&&<p role="status" data-quote-record-notice className="text-sm text-[#175b42]">{notice}</p>}
  {open&&<form data-quote-record-form onSubmit={e=>void submit(e)} className="grid min-w-0 gap-3 rounded-xl border border-[#008fb8] bg-[#f7fbfd] p-3 sm:grid-cols-2">
   {error&&<p role="alert" data-quote-record-error className="text-sm text-red-700 sm:col-span-2">{error}</p>}
   <label className="block min-w-0 text-sm font-bold sm:col-span-2">{t('Trabajo del acuerdo','Job of the agreement')}<select data-quote-record-work required className={field} value={form.workId} onChange={e=>setForm({...form,workId:e.target.value})}>
    <option value="">{t('Elegir trabajo…','Choose a job…')}</option>{data.works.map(w=><option key={w.id} value={w.id}>{w.label}</option>)}</select></label>
   <label className="block min-w-0 text-sm font-bold">{t('Quién aceptó','Who accepted')}<input data-quote-record-name required minLength={2} maxLength={120} className={field} value={form.acceptedByName} onChange={e=>setForm({...form,acceptedByName:e.target.value})}/></label>
   <label className="block min-w-0 text-sm font-bold">{t('Fecha de aceptación','Acceptance date')}<input data-quote-record-date type="date" required max={crTodayISO()} className={field} value={form.acceptedOn} onChange={e=>setForm({...form,acceptedOn:e.target.value})}/></label>
   <label className="block min-w-0 text-sm font-bold sm:col-span-2">{t('Cómo aceptó','How it was accepted')}<select data-quote-record-method className={field} value={form.method} onChange={e=>setForm({...form,method:e.target.value as typeof form.method})}>{recordedAcceptanceMethods.map(m=><option key={m} value={m}>{methodNames[m]}</option>)}</select></label>
   <label className="block min-w-0 text-sm font-bold sm:col-span-2">{t('Evidencia (mínimo 10 caracteres)','Evidence (at least 10 characters)')}<textarea data-quote-record-evidence required minLength={10} maxLength={500} className={field+' min-h-24'} value={form.evidenceNote} onChange={e=>setForm({...form,evidenceNote:e.target.value})} placeholder={t('Ejemplo: Firmó la proforma impresa en la visita del 20 de noviembre.','Example: Signed the printed quote during the November 20 visit.')}/></label>
   <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" data-quote-record-save disabled={busy||blocked}>{t('Registrar y dejar como acuerdo','Record and set as agreement')}</Button><Button type="button" variant="secondary" disabled={busy} onClick={()=>{setOpen(false);setError('');}}>{t('Cancelar','Cancel')}</Button></div>
  </form>}
 </section>;
}
