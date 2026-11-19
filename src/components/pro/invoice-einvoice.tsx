'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {ProModal as Modal} from '@/components/pro/modal';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {closeProStep,navigatePro} from '@/lib/pro/navigation';
import {proMoney} from '@/lib/pro/money';
import {DOCUMENT_ROOTS,REFERENCE_CODE_LABELS,STATUS_LABELS} from '@/lib/pro/integrations/hacienda/codes';
import {einvoicePipelineReadSchema,type EinvoiceDocument,type EinvoicePipelineRead} from '@/lib/pro/integrations/hacienda/api';
import {useProSearchParams} from './use-pro-search-params';
import {parseTransactionalEmailView,transactionalEmailNotice,type TransactionalEmailView} from '@/lib/pro/transactional-email-copy';
import {EINVOICE_COPY as C,EINVOICE_ERRORS,EINVOICE_PROVIDER_LABELS,einvoiceResponseLabel} from './einvoice-copy';

/**
 * Round 6A + Ronda F2-A: «Factura electrónica» of an invoice draft (Hacienda v4.4) through the provider adapter
 * (/api/pro/invoice-einvoice; owner, Administrador, Gerente). Validates first (nothing is reserved while something is
 * missing), emits a Factura or a Tiquete, shows Hacienda's asynchronous answer (recibido → en proceso → aceptado o
 * rechazado) as a timeline with every provider response, the files (signed XML, answer, branded print with clave and
 * consecutivo), and issues credit and debit notes against an ACCEPTED document. In test mode the screen and the
 * confirmation say "Modo de prueba: no se envía a Hacienda"; the draft is locked once emitted.
 */
const api='/api/pro/invoice-einvoice';
const badge:Record<string,string>={aceptado:'bg-[#e7f5ec] text-[#1d5b33]',rechazado:'bg-[#fdeceb] text-[#8a2a1b]',error:'bg-[#fff6e0] text-[#7a4b00]',procesando:'bg-[#eaf7fb] text-[#00668a]',recibido:'bg-[#eaf7fb] text-[#00668a]',enviado:'bg-[#eaf7fb] text-[#00668a]',firmado:'bg-[#eef2f6] text-[#38485f]',borrador:'bg-[#eef2f6] text-[#38485f]'};
const dot:Record<string,string>={aceptado:'bg-[#1f7a4d]',rechazado:'bg-[#b42318]',error:'bg-[#b7791f]'};
const linkButton='inline-flex min-h-11 items-center rounded-xl border border-[#d7e1ea] px-3 text-sm font-semibold text-[#162543] hover:bg-[#f6f9fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008bb5]';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
type Copy={es:string;en:string};
type Note={kind:'credit';originalId:string;code:'01'|'02';lines:number[];reason:string}|{kind:'debit';originalId:string;lineNumber:number;amount:string;reason:string};
export function InvoiceEinvoice({id}:{id:string}){
 const en=useLocale()==='en',l=useCallback((copy:Copy)=>en?copy.en:copy.es,[en]),params=useProSearchParams(),open=params.get('fiscalFactura')===id,{confirm,dialogNode}=useAppDialog();
 const [data,setData]=useState<EinvoicePipelineRead|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[mail,setMail]=useState<TransactionalEmailView|null>(null);
 const [note,setNote]=useState<Note|null>(null);
 const seq=useRef(0),attempt=useRef<{key:string;id:string}|null>(null);
 const invalidate=useCallback(()=>{seq.current++;},[]);
 const load=useCallback(async()=>{const n=++seq.current;setFailed(false);
  try{const response=await fetch(api+'?'+new URLSearchParams({draftId:id}),{cache:'no-store'});if(!response.ok)throw Error();const body=einvoicePipelineReadSchema.parse(await response.json());if(n===seq.current)setData(body);}
  catch{if(n===seq.current)setFailed(true);}},[id]);
 useEffect(()=>{if(!open)return;const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[open,load,invalidate]);
 if(!open)return null;
 const when=(at:string)=>new Date(at).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'});
 async function post(key:string,payload:Record<string,unknown>,done:Copy){
  if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');setNotice('');setMail(null);
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,actionId:attempt.current.id})});
   const body=await response.json().catch(()=>({}));
   if(!response.ok){
    if(response.status!==503)attempt.current=null;
    const issues=Array.isArray(body.issues)&&body.issues.length?' '+body.issues.map((row:{es:string;en:string})=>en?row.en:row.es).join(' '):'';
    const known=EINVOICE_ERRORS[body.reason as string];
    setError((known?l(known):body.error??l(C.failed))+issues);
   }else{attempt.current=null;setNotice(l(done));setNote(null);setMail(parseTransactionalEmailView(body.email));}
  }catch{setError(l(C.unconfirmed));}
  finally{setBusy(false);await load();}
 }
 const testMode=data?.pipeline.test??true;
 async function emit(type:'01'|'04'){
  const answer=await confirm({title:l(type==='01'?C.confirmInvoice:C.confirmTicket),description:testMode?l(C.testNotice):l(C.liveNotice),detail:l(C.lockNotice),
   confirmLabel:l(type==='01'?C.issueInvoice:C.issueTicket),tone:testMode?'default':'danger'});
  if(answer.confirmed)await post('emit:'+type,{action:'emit',draftId:id,docType:type},C.issued);
 }
 const docs=data?.documents??[],live=docs.find(doc=>(doc.docType==='01'||doc.docType==='04')&&doc.status!=='rechazado');
 const issuesFor=(type:'01'|'04')=>data?.issues[type]??[];
 const modeBanner=data&&<div data-einvoice-mode={data.mode} data-einvoice-test={testMode?'true':'false'} className={'space-y-1 rounded-xl p-3 text-sm '+(testMode?'bg-[#fff6e0] text-[#7a4b00]':'bg-[#eaf7fb] text-[#00668a]')}>
  <p className="font-bold">{testMode?l(C.testNotice):l(C.liveBanner)}</p>
  <p data-einvoice-provider={data.pipeline.provider}>{l(C.providerLabel)} {l(EINVOICE_PROVIDER_LABELS[data.mode==='mock'?'mock':data.pipeline.provider])} · {l(C.modeLabel)} {l(data.mode==='mock'?C.modeTest:data.mode==='sandbox'?C.modeSandbox:C.modeLive)}</p>
  {data.modeStatus!=='ready'&&<p className="font-bold">{l(data.modeStatus==='missing_keys'?C.missingKeys:data.modeStatus==='production_refused'?C.productionRefused:C.disabled)}</p>}
 </div>;
 function noteForm(doc:EinvoiceDocument){
  if(!note||note.originalId!==doc.id)return null;
  const lines=data?.originalLines[doc.id]??[],credited=data?.credited[doc.id]??0;
  if(note.kind==='credit')return <form data-einvoice-credit-form className="min-w-0 space-y-2 rounded-xl bg-[#f7f9fc] p-3" onSubmit={event=>{event.preventDefault();void post('credit:'+doc.id+':'+note.code+':'+note.lines.join(','),{action:'credit_note',draftId:id,originalId:doc.id,code:note.code,reason:note.reason,lines:note.code==='01'?[]:note.lines},C.creditIssued);}}>
   <fieldset className="space-y-1"><legend className="text-sm font-bold">{l(C.noteType)}</legend>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="credit-code" checked={note.code==='01'} disabled={credited>0} onChange={()=>setNote({...note,code:'01'})}/>{l(C.cancelWhole)}</label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="credit-code" checked={note.code==='02'} onChange={()=>setNote({...note,code:'02'})}/>{l(C.creditLines)}</label></fieldset>
   {note.code==='02'&&<fieldset className="space-y-1"><legend className="text-sm font-bold">{l(C.linesToCredit)}</legend>{lines.map(row=><label key={row.number} className="flex min-h-11 min-w-0 items-center gap-2 text-sm"><input type="checkbox" checked={note.lines.includes(row.number)} onChange={event=>setNote({...note,lines:event.target.checked?[...note.lines,row.number]:note.lines.filter(n=>n!==row.number)})}/><span className="min-w-0 break-words">{row.number}. {row.detail} · {proMoney(Number(row.lineTotal),en)}</span></label>)}</fieldset>}
   <label className="block text-sm font-bold">{l(C.reason)}<input data-einvoice-credit-reason required minLength={5} maxLength={180} value={note.reason} onChange={event=>setNote({...note,reason:event.target.value})} className={field}/></label>
   <div className="flex flex-wrap gap-2"><Button type="submit" data-einvoice-credit-submit disabled={busy||note.reason.trim().length<5||note.code==='02'&&!note.lines.length}>{l(C.issueCredit)}</Button><Button type="button" variant="secondary" onClick={()=>setNote(null)}>{l(C.cancel)}</Button></div>
  </form>;
  const amountOk=/^\d{1,13}(\.\d{1,5})?$/.test(note.amount.trim())&&Number(note.amount)>0;
  return <form data-einvoice-debit-form className="min-w-0 space-y-2 rounded-xl bg-[#f7f9fc] p-3" onSubmit={event=>{event.preventDefault();void post('debit:'+doc.id+':'+note.lineNumber+':'+note.amount,{action:'debit_note',draftId:id,originalId:doc.id,lineNumber:note.lineNumber,amount:note.amount.trim(),reason:note.reason},C.debitIssued);}}>
   <p className="text-sm text-[#52627a]">{l(C.debitHelp)}</p>
   <label className="block min-w-0 text-sm font-bold">{l(C.debitLine)}<select data-einvoice-debit-line value={note.lineNumber} onChange={event=>setNote({...note,lineNumber:Number(event.target.value)})} className={field}>{lines.map(row=><option key={row.number} value={row.number}>{row.number}. {row.detail}</option>)}</select></label>
   <label className="block text-sm font-bold">{l(C.debitAmount)}<input data-einvoice-debit-amount inputMode="decimal" required value={note.amount} onChange={event=>setNote({...note,amount:event.target.value})} className={field}/></label>
   <label className="block text-sm font-bold">{l(C.reason)}<input data-einvoice-debit-reason required minLength={5} maxLength={180} value={note.reason} onChange={event=>setNote({...note,reason:event.target.value})} className={field}/></label>
   <div className="flex flex-wrap gap-2"><Button type="submit" data-einvoice-debit-submit disabled={busy||note.reason.trim().length<5||!amountOk}>{l(C.issueDebit)}</Button><Button type="button" variant="secondary" onClick={()=>setNote(null)}>{l(C.cancel)}</Button></div>
  </form>;
 }
 function documentCard(doc:EinvoiceDocument){
  const canPoll=['borrador','firmado','enviado','recibido','procesando','error'].includes(doc.status),credited=data?.credited[doc.id]??0,debited=(data?.debited??{})[doc.id]??0;
  const original=doc.docType==='01'||doc.docType==='04',cancelled=docs.some(row=>row.docType==='03'&&row.referenceDocumentId===doc.id&&row.referenceCode==='01'&&row.status!=='rechazado');
  return <article key={doc.id} data-einvoice-doc={doc.consecutivo} data-einvoice-type={doc.docType} className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] p-3">
   <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h4 className="font-bold">{l(DOCUMENT_ROOTS[doc.docType])}</h4><p className="text-sm">{proMoney(doc.totalCents/100,en)} · {l(C.vat)} {proMoney(doc.taxCents/100,en)}</p></div>
    <span data-einvoice-status={doc.status} className={'rounded-lg px-2 py-0.5 text-xs font-bold '+(badge[doc.status]??'')}>{l(STATUS_LABELS[doc.status]!)}</span></div>
   <dl className="grid min-w-0 gap-2 text-xs sm:grid-cols-2">
    <div className="min-w-0"><dt className="font-bold text-[#52627a]">{l(C.consecutivo)}</dt><dd data-einvoice-consecutivo className="break-all font-mono">{doc.consecutivo}</dd></div>
    <div className="min-w-0"><dt className="font-bold text-[#52627a]">{l(C.issuedAt)}</dt><dd>{when(doc.issuedAt)}</dd></div>
    <div className="min-w-0 sm:col-span-2"><dt className="font-bold text-[#52627a]">{l(C.clave)}</dt><dd data-einvoice-clave className="break-all font-mono">{doc.clave}</dd></div>
    {doc.referenceCode&&<div className="min-w-0 sm:col-span-2"><dt className="font-bold text-[#52627a]">{l(C.reference)}</dt><dd>{doc.docType==='02'?l(C.debitReference):l(REFERENCE_CODE_LABELS[doc.referenceCode]!)} · {doc.referenceReason}</dd></div>}</dl>
   {doc.responseMessage&&<p data-einvoice-message className={'text-sm '+(doc.status==='rechazado'?'font-semibold text-[#8a2a1b]':'text-[#52627a]')}>{doc.responseMessage}</p>}
   {doc.status==='error'&&<p data-einvoice-retry className="text-sm text-[#7a4b00]">{l(C.retryNotice)} {doc.attempts}{doc.nextAttemptAt?' · '+l(C.nextAttempt)+' '+when(doc.nextAttemptAt):''}{doc.lastError?' · '+doc.lastError:''}</p>}
   <ol data-einvoice-events aria-label={l(C.timeline)} className="min-w-0 space-y-1 border-l-2 border-[#d7e1ea] pl-3 text-xs text-[#52627a]">{doc.events.map((event,index)=><li key={index} className="relative min-w-0">
    <span aria-hidden className={'absolute -left-[17px] top-1 h-2 w-2 rounded-full '+(dot[event.to]??'bg-[#008bb5]')}/>
    <span data-event-label className="font-semibold text-[#162543]">{l(STATUS_LABELS[event.to]??{es:event.to,en:event.to})}</span> <time dateTime={event.at}>{when(event.at)}</time></li>)}</ol>
   {doc.responses.length>0&&<details data-einvoice-responses className="min-w-0 rounded-xl bg-[#f7f9fc] p-2 text-xs"><summary className="min-h-11 cursor-pointer py-3 font-bold text-[#162543]">{l(C.responses)} ({doc.responses.length})</summary>
    <ul className="space-y-1">{doc.responses.map((row,index)=><li key={index} data-einvoice-response-row={row.outcome} className="min-w-0 break-words"><strong>{l(einvoiceResponseLabel(row))}</strong> · {l(C.attempt)} {row.attempt}{row.httpStatus!==null?' · HTTP '+row.httpStatus:''}{row.message?' · '+row.message:''}</li>)}</ul></details>}
   <div className="flex flex-wrap gap-2">
    {canPoll&&<Button type="button" variant="secondary" data-einvoice-poll disabled={busy} onClick={()=>void post('poll:'+doc.id+':'+doc.updatedAt,{action:'poll',documentId:doc.id},C.statusUpdated)}>{doc.status==='error'&&!doc.events.some(event=>event.to==='recibido')?l(C.retrySend):l(C.checkStatus)}</Button>}
    {doc.hasXml&&<a className={linkButton} data-einvoice-xml href={'/api/pro/einvoice-file?'+new URLSearchParams({id:doc.id,kind:'xml'})}>{l(C.downloadXml)}</a>}
    {doc.hasResponse&&<a className={linkButton} data-einvoice-response href={'/api/pro/einvoice-file?'+new URLSearchParams({id:doc.id,kind:'response'})}>{l(C.downloadResponse)}</a>}
    {doc.hasXml&&<a className={linkButton} data-einvoice-print target="_blank" rel="noopener" href={'/api/pro/einvoice-file?'+new URLSearchParams({id:doc.id,kind:'print',lang:en?'en':'es'})}>{l(C.print)}</a>}
    {original&&doc.status==='aceptado'&&credited<doc.totalCents&&<Button type="button" variant="secondary" data-einvoice-credit disabled={busy} onClick={()=>setNote({kind:'credit',originalId:doc.id,code:'02',lines:[],reason:''})}>{l(C.creditNote)}</Button>}
    {original&&doc.status==='aceptado'&&!cancelled&&<Button type="button" variant="secondary" data-einvoice-debit disabled={busy} onClick={()=>setNote({kind:'debit',originalId:doc.id,lineNumber:1,amount:'',reason:''})}>{l(C.debitNote)}</Button>}
   </div>
   {(credited>0||debited>0)&&<p className="text-xs text-[#52627a]">{credited>0?l(C.credited)+' '+proMoney(credited/100,en):''}{credited>0&&debited>0?' · ':''}{debited>0?l(C.debited)+' '+proMoney(debited/100,en):''}</p>}
   {noteForm(doc)}
  </article>;
 }
 const title=l(C.title);
 return <><Modal title={title} ariaLabel={title} closeLabel={l(C.close)} mobilePresentation="fullscreen" onClose={()=>closeProStep('fiscalFactura')} footerNotice={error?<p role="alert" className="text-sm text-red-700">{error}</p>:undefined}>
  <div data-einvoice className="min-w-0 space-y-4">
   {failed&&!data?<div role="alert" className="space-y-2"><p>{l(C.loadFailed)}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{l(C.retry)}</Button></div>:!data?<p role="status">{l(C.loading)}</p>:<>
    {modeBanner}
    {notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
    {mail&&<p role="status" data-transactional-email={mail.mode+':'+mail.status} data-einvoice-email className={'rounded-xl p-3 text-sm font-semibold '+(mail.status==='queued'?'bg-[#e7f5ec] text-[#1d5b33]':'bg-[#fff6e0] text-[#7a4b00]')}>{transactionalEmailNotice(mail,en,'customer','pdf')}</p>}
    {!data.settings&&<div data-einvoice-no-settings className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><p>{l(C.noSettings)}</p><Button type="button" variant="secondary" onClick={()=>navigatePro('pro_company',{empresa:'facturacion'})}>{l(C.goSettings)}</Button></div>}
    {!live&&<section data-einvoice-emit-panel className="space-y-3"><h3 className="font-bold">{l(C.emitTitle)}</h3>
     <p className="text-sm text-[#52627a]">{l(C.emitHelp)} <strong>{proMoney(data.draftTotalCents/100,en)}</strong></p>
     {(['01','04'] as const).map(type=>{const issues=issuesFor(type);return <div key={type} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><strong>{l(DOCUMENT_ROOTS[type])}</strong><Button type="button" data-einvoice-emit={type} disabled={busy||issues.length>0||data.modeStatus!=='ready'} onClick={()=>void emit(type)}>{l(type==='01'?C.emitInvoice:C.emitTicket)}</Button></div>
      {issues.length?<ul data-einvoice-issues={type} className="list-disc space-y-1 pl-5 text-sm text-[#8a2a1b]">{issues.map(row=><li key={row.field}>{en?row.en:row.es}</li>)}</ul>:<p data-einvoice-ready={type} className="text-sm text-[#1d5b33]">{l(C.ready)}</p>}
      {type==='04'&&<p className="text-xs text-[#52627a]">{l(C.ticketHelp)}</p>}
     </div>;})}
    </section>}
    {live&&<p data-einvoice-locked className="rounded-xl bg-[#f3f8fb] p-3 text-sm">{l(C.locked)}</p>}
    {docs.length>0&&<section className="space-y-2"><h3 className="font-bold">{l(C.documents)}</h3>{docs.map(documentCard)}</section>}
   </>}
  </div>
 </Modal>{dialogNode}</>;
}
