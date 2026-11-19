'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {ProModal as Modal} from '@/components/pro/modal';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {closeProStep,navigatePro} from '@/lib/pro/navigation';
import {proMoney} from '@/lib/pro/money';
import {DOCUMENT_ROOTS,REFERENCE_CODE_LABELS,STATUS_LABELS} from '@/lib/pro/integrations/hacienda/codes';
import {einvoiceReadSchema,type EinvoiceDocument,type EinvoiceRead} from '@/lib/pro/integrations/hacienda/api';
import {useProSearchParams} from './use-pro-search-params';
import {parseTransactionalEmailView,transactionalEmailNotice,type TransactionalEmailView} from '@/lib/pro/transactional-email-copy';

/**
 * Round 6A: «Comprobante electrónico» of an invoice draft (Hacienda v4.4). Validates first (nothing is
 * reserved while something is missing), emits a Factura or a Tiquete, shows the state machine and the
 * files, and issues credit notes against an ACCEPTED document. In mock mode everything is a local
 * simulation and the screen says so; the draft is locked once emitted.
 */
const api='/api/pro/einvoice';
const badge:Record<string,string>={aceptado:'bg-[#e7f5ec] text-[#1d5b33]',rechazado:'bg-[#fdeceb] text-[#8a2a1b]',error:'bg-[#fff6e0] text-[#7a4b00]',recibido:'bg-[#eaf7fb] text-[#00668a]',enviado:'bg-[#eaf7fb] text-[#00668a]',firmado:'bg-[#eef2f6] text-[#38485f]',borrador:'bg-[#eef2f6] text-[#38485f]'};
const linkButton='inline-flex min-h-11 items-center rounded-xl border border-[#d7e1ea] px-3 text-sm font-semibold text-[#162543] hover:bg-[#f6f9fb]';
export function InvoiceEinvoice({id}:{id:string}){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),params=useProSearchParams(),open=params.get('fiscalFactura')===id,{confirm,dialogNode}=useAppDialog();
 const [data,setData]=useState<EinvoiceRead|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[mail,setMail]=useState<TransactionalEmailView|null>(null);
 const [credit,setCredit]=useState<{originalId:string;code:'01'|'02';lines:number[];reason:string}|null>(null);
 const seq=useRef(0),attempt=useRef<{key:string;id:string}|null>(null);
 const invalidate=useCallback(()=>{seq.current++;},[]);
 const load=useCallback(async()=>{const n=++seq.current;setFailed(false);
  try{const response=await fetch(api+'?'+new URLSearchParams({draftId:id}),{cache:'no-store'});if(!response.ok)throw Error();const body=einvoiceReadSchema.parse(await response.json());if(n===seq.current)setData(body);}
  catch{if(n===seq.current)setFailed(true);}},[id]);
 useEffect(()=>{if(!open)return;const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[open,load,invalidate]);
 if(!open)return null;
 const l=(copy:{es:string;en:string})=>en?copy.en:copy.es;
 async function post(key:string,payload:Record<string,unknown>,done:string){
  if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');setNotice('');setMail(null);
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,actionId:attempt.current.id})});
   const body=await response.json().catch(()=>({}));
   if(!response.ok){
    if(response.status!==503)attempt.current=null;
    const issues=Array.isArray(body.issues)&&body.issues.length?' '+body.issues.map((row:{es:string;en:string})=>en?row.en:row.es).join(' '):'';
    setError((en?englishError(body.reason)??body.error:body.error)+issues);
   }else{attempt.current=null;setNotice(done);setCredit(null);/* The route reports the receiver e-mail outcome after an emission (mock: nothing delivered). */setMail(parseTransactionalEmailView(body.email));}
  }catch{setError(t('No se pudo comprobar el resultado. Reintente: no se duplicará.','Could not confirm the result. Retry: it will not be duplicated.'));}
  finally{setBusy(false);await load();}
 }
 const englishError=(reason:string)=>({missing_keys:'The Hacienda keys for the selected mode are missing on the server. Follow the setup guide.',production_refused:'Production is not enabled on this server.',disabled:'The Hacienda integration is disabled in Company › Integrations.',validation:'Check the details before issuing.',pro_einvoice_emitted:'This draft already has an issued document. Correct it with a credit note.'} as Record<string,string>)[reason];
 async function emit(type:'01'|'04'){
  const answer=await confirm({title:type==='01'?t('¿Emitir factura electrónica?','Issue electronic invoice?'):t('¿Emitir tiquete electrónico?','Issue electronic ticket?'),
   description:data?.mode==='mock'?t('Simulación local: se genera el XML v4.4, se firma con una firma simulada y lo «acepta» un Hacienda simulado. No se envía nada real.','Local simulation: the v4.4 XML is generated, signed with a simulated signature and «accepted» by a simulated Hacienda. Nothing real is sent.'):t('Se enviará a Hacienda en el modo elegido.','It will be sent to Hacienda in the selected mode.'),
   detail:t('Después de emitir, el borrador queda bloqueado: para corregirlo se emite una nota de crédito.','After issuing, the draft is locked: corrections are made with a credit note.'),confirmLabel:type==='01'?t('Emitir factura','Issue invoice'):t('Emitir tiquete','Issue ticket')});
  if(answer.confirmed)await post('emit:'+type,{action:'emit',draftId:id,docType:type},t('Comprobante emitido y recibido. Consulte su estado para ver la respuesta.','Document issued and received. Check its status to see the answer.'));
 }
 const docs=data?.documents??[],live=docs.find(doc=>doc.docType!=='03'&&doc.status!=='rechazado');
 const modeBanner=data&&<p data-einvoice-mode={data.mode} className={'rounded-xl p-3 text-sm '+(data.mode==='mock'?'bg-[#fff6e0] text-[#7a4b00]':'bg-[#eaf7fb] text-[#00668a]')}>{data.mode==='mock'?t('Modo simulación local: nada se envía a Hacienda y los comprobantes no tienen validez fiscal.','Local simulation mode: nothing is sent to Hacienda and documents have no fiscal validity.'):data.mode==='sandbox'?t('Ambiente de pruebas de Hacienda (sin validez fiscal).','Hacienda test environment (no fiscal validity).'):t('Producción: comprobantes con validez fiscal.','Production: documents with fiscal validity.')}{data.modeStatus!=='ready'&&<strong className="mt-1 block">{data.modeStatus==='missing_keys'?t('Faltan las claves de este modo en el servidor; la emisión está detenida.','The keys for this mode are missing on the server; issuing is stopped.'):data.modeStatus==='production_refused'?t('Producción no está habilitada en este servidor.','Production is not enabled on this server.'):t('La integración está desactivada.','The integration is disabled.')}</strong>}</p>;
 const issuesFor=(type:'01'|'04')=>data?.issues[type]??[];
 function documentCard(doc:EinvoiceDocument){
  const canPoll=['borrador','firmado','enviado','recibido','error'].includes(doc.status),credited=data?.credited[doc.id]??0,lines=data?.originalLines[doc.id]??[];
  return <article key={doc.id} data-einvoice-doc={doc.consecutivo} data-einvoice-type={doc.docType} className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] p-3">
   <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h4 className="font-bold">{l(DOCUMENT_ROOTS[doc.docType])}</h4><p className="text-sm">{proMoney(doc.totalCents/100,en)} · {t('IVA','VAT')} {proMoney(doc.taxCents/100,en)}</p></div>
    <span data-einvoice-status={doc.status} className={'rounded-lg px-2 py-0.5 text-xs font-bold '+(badge[doc.status]??'')}>{l(STATUS_LABELS[doc.status]!)}</span></div>
   <dl className="grid min-w-0 gap-1 text-xs"><div><dt className="font-bold text-[#52627a]">{t('Consecutivo','Sequence number')}</dt><dd data-einvoice-consecutivo className="break-all font-mono">{doc.consecutivo}</dd></div><div><dt className="font-bold text-[#52627a]">{t('Clave','Key (clave)')}</dt><dd data-einvoice-clave className="break-all font-mono">{doc.clave}</dd></div>
    {doc.referenceCode&&<div><dt className="font-bold text-[#52627a]">{t('Referencia','Reference')}</dt><dd>{l(REFERENCE_CODE_LABELS[doc.referenceCode]!)} · {doc.referenceReason}</dd></div>}</dl>
   {doc.responseMessage&&<p className="text-sm text-[#52627a]">{doc.responseMessage}</p>}
   {doc.status==='error'&&<p className="text-sm text-[#7a4b00]">{t('Envío fallido; se reintenta con espera creciente. Intentos: ','Sending failed; it retries with increasing waits. Attempts: ')}{doc.attempts}{doc.lastError?' · '+doc.lastError:''}</p>}
   <ol data-einvoice-events className="flex flex-wrap gap-1 text-xs text-[#52627a]">{doc.events.map((event,index)=><li key={index} className="rounded bg-[#f3f8fb] px-1.5 py-0.5">{l(STATUS_LABELS[event.to]??{es:event.to,en:event.to})}</li>)}</ol>
   <div className="flex flex-wrap gap-2">
    {canPoll&&<Button type="button" variant="secondary" data-einvoice-poll disabled={busy} onClick={()=>void post('poll:'+doc.id+':'+doc.updatedAt,{action:'poll',documentId:doc.id},t('Estado actualizado.','Status updated.'))}>{doc.status==='error'?t('Reintentar envío','Retry sending'):t('Consultar estado','Check status')}</Button>}
    {doc.hasXml&&<a className={linkButton} data-einvoice-xml href={'/api/pro/einvoice-file?'+new URLSearchParams({id:doc.id,kind:'xml'})}>{t('XML firmado','Signed XML')}</a>}
    {doc.hasResponse&&<a className={linkButton} data-einvoice-response href={'/api/pro/einvoice-file?'+new URLSearchParams({id:doc.id,kind:'response'})}>{t('Respuesta de Hacienda','Hacienda response')}</a>}
    {doc.hasXml&&<a className={linkButton} data-einvoice-print target="_blank" rel="noopener" href={'/api/pro/einvoice-file?'+new URLSearchParams({id:doc.id,kind:'print',lang:en?'en':'es'})}>{t('Imprimir o PDF','Print or PDF')}</a>}
    {doc.docType!=='03'&&doc.status==='aceptado'&&credited<doc.totalCents&&<Button type="button" variant="secondary" data-einvoice-credit disabled={busy} onClick={()=>setCredit({originalId:doc.id,code:'02',lines:[],reason:''})}>{t('Nota de crédito','Credit note')}</Button>}
   </div>
   {credited>0&&<p className="text-xs text-[#52627a]">{t('Acreditado: ','Credited: ')}{proMoney(credited/100,en)}</p>}
   {credit?.originalId===doc.id&&<form data-einvoice-credit-form className="space-y-2 rounded-xl bg-[#f7f9fc] p-3" onSubmit={event=>{event.preventDefault();void post('credit:'+doc.id+':'+credit.code+':'+credit.lines.join(','),{action:'credit_note',draftId:id,originalId:doc.id,code:credit.code,reason:credit.reason,lines:credit.code==='01'?[]:credit.lines},t('Nota de crédito emitida y recibida.','Credit note issued and received.'));}}>
    <fieldset className="space-y-1"><legend className="text-sm font-bold">{t('Tipo de nota','Note type')}</legend>
     <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="credit-code" checked={credit.code==='01'} disabled={credited>0} onChange={()=>setCredit({...credit,code:'01'})}/>{t('Anular el comprobante completo','Cancel the whole document')}</label>
     <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="credit-code" checked={credit.code==='02'} onChange={()=>setCredit({...credit,code:'02'})}/>{t('Acreditar líneas','Credit lines')}</label></fieldset>
    {credit.code==='02'&&<fieldset className="space-y-1"><legend className="text-sm font-bold">{t('Líneas a acreditar','Lines to credit')}</legend>{lines.map(row=><label key={row.number} className="flex min-h-11 min-w-0 items-center gap-2 text-sm"><input type="checkbox" checked={credit.lines.includes(row.number)} onChange={event=>setCredit({...credit,lines:event.target.checked?[...credit.lines,row.number]:credit.lines.filter(n=>n!==row.number)})}/><span className="min-w-0 break-words">{row.number}. {row.detail} · ₡{row.lineTotal.replace(/\.(\d{2})\d*$/,'.$1')}</span></label>)}</fieldset>}
    <label className="block text-sm font-bold">{t('Motivo (5 a 180 caracteres)','Reason (5–180 characters)')}<input data-einvoice-credit-reason required minLength={5} maxLength={180} value={credit.reason} onChange={event=>setCredit({...credit,reason:event.target.value})} className="mt-1 block min-h-11 w-full rounded-xl border border-[#d7e1ea] px-3 text-base font-normal"/></label>
    <div className="flex flex-wrap gap-2"><Button type="submit" data-einvoice-credit-submit disabled={busy||credit.reason.trim().length<5||credit.code==='02'&&!credit.lines.length}>{t('Emitir nota de crédito','Issue credit note')}</Button><Button type="button" variant="secondary" onClick={()=>setCredit(null)}>{t('Cancelar','Cancel')}</Button></div>
   </form>}
  </article>;
 }
 const title=t('Comprobante electrónico','Electronic document');
 return <><Modal title={title} ariaLabel={title} closeLabel={t('Cerrar','Close')} mobilePresentation="fullscreen" onClose={()=>closeProStep('fiscalFactura')} footerNotice={error?<p role="alert" className="text-sm text-red-700">{error}</p>:undefined}>
  <div data-einvoice className="min-w-0 space-y-4">
   {failed&&!data?<div role="alert" className="space-y-2"><p>{t('No se pudo cargar la emisión.','Could not load issuing.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>:!data?<p role="status">{t('Cargando…','Loading…')}</p>:<>
    {modeBanner}
    {notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
    {mail&&<p role="status" data-transactional-email={mail.mode+':'+mail.status} data-einvoice-email className={'rounded-xl p-3 text-sm font-semibold '+(mail.status==='queued'?'bg-[#e7f5ec] text-[#1d5b33]':'bg-[#fff6e0] text-[#7a4b00]')}>{transactionalEmailNotice(mail,en,'customer','pdf')}</p>}
    {!data.settings&&<div data-einvoice-no-settings className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><p>{t('Antes de emitir, complete los datos del emisor (identificación, actividad económica, ubicación, sucursal y terminal).','Before issuing, complete the issuer details (identification, economic activity, location, branch and terminal).')}</p><Button type="button" variant="secondary" onClick={()=>navigatePro('pro_company',{empresa:'integraciones'})}>{t('Ir a Integraciones','Go to Integrations')}</Button></div>}
    {!live&&<section data-einvoice-emit-panel className="space-y-3"><h3 className="font-bold">{t('Emitir desde este borrador','Issue from this draft')}</h3>
     <p className="text-sm text-[#52627a]">{t('Hasta emitir, este borrador sigue siendo interno y editable. Total: ','Until issued, this draft stays internal and editable. Total: ')}<strong>{proMoney(data.draftTotalCents/100,en)}</strong></p>
     {(['01','04'] as const).map(type=>{const issues=issuesFor(type);return <div key={type} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><strong>{l(DOCUMENT_ROOTS[type])}</strong><Button type="button" data-einvoice-emit={type} disabled={busy||issues.length>0||data.modeStatus!=='ready'} onClick={()=>void emit(type)}>{type==='01'?t('Emitir factura','Issue invoice'):t('Emitir tiquete','Issue ticket')}</Button></div>
      {issues.length?<ul data-einvoice-issues={type} className="list-disc space-y-1 pl-5 text-sm text-[#8a2a1b]">{issues.map(row=><li key={row.field}>{en?row.en:row.es}</li>)}</ul>:<p data-einvoice-ready={type} className="text-sm text-[#1d5b33]">{t('Listo para emitir: datos completos y totales verificados.','Ready to issue: details complete and totals verified.')}</p>}
      {type==='04'&&<p className="text-xs text-[#52627a]">{t('El tiquete no exige identificar al receptor.','A ticket does not require an identified recipient.')}</p>}
     </div>;})}
    </section>}
    {live&&<p data-einvoice-locked className="rounded-xl bg-[#f3f8fb] p-3 text-sm">{t('Este borrador ya tiene un comprobante. Su contenido quedó bloqueado; para corregirlo emita una nota de crédito.','This draft already has a document. Its content is locked; issue a credit note to correct it.')}</p>}
    {docs.length>0&&<section className="space-y-2"><h3 className="font-bold">{t('Comprobantes','Documents')}</h3>{docs.map(documentCard)}</section>}
   </>}
  </div>
 </Modal>{dialogNode}</>;
}
