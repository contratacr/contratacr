'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {proMoney} from '@/lib/pro/money';
import {navigatePro} from '@/lib/pro/navigation';

/**
 * Round 6B: «Firma electrónica» panel of a contract, a quote publication or a change order. The owner sends a
 * signature request (frozen copy of the shared document), follows its status (sent → viewed → signed /
 * declined / expired), downloads the signed PDF and the audit certificate, cancels or retries. The existing
 * authenticated acceptance in the customer portal stays available as the fallback.
 */
type Kind='contract'|'quote'|'work_change';
type Event={seq:number;status:string;source:string;at:string};
type Request={id:string;documentLabel:string;documentHash:string;signerName:string;signerEmail:string;language:'es'|'en';mode:string;envelopeId:string|null;status:string;expiresAt:string;sentAt:string|null;completedAt:string|null;declineReason:string|null;lastError:string|null;revision:number;events:Event[];artifacts:{kind:string;sha256:string;bytes:number}[];signerUrl:string|null;acceptance?:{outcome:string;reason:string|null;at:string}|null};
type Read={document:{label:string;clientName:string;clientEmail:string;language:'es'|'en';totalCents:number|null;currency:string}|null;blocked:string|null;requests:Request[];mode:string;modeStatus:string};
const card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const tone:Record<string,string>={created:'bg-[#eef2f6] text-[#38485f]',sent:'bg-[#e6f6fb] text-[#00698c]',viewed:'bg-[#e6f6fb] text-[#00698c]',signed:'bg-emerald-50 text-emerald-800',declined:'bg-amber-50 text-amber-900',expired:'bg-[#eef2f6] text-[#52627a]',cancelled:'bg-red-50 text-red-800',error:'bg-red-50 text-red-800'};
export function EsignRequests({kind,documentId,disabled=false}:{kind:Kind;documentId:string;disabled?:boolean}){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),{confirm,dialogNode}=useAppDialog();
 const [data,setData]=useState<Read|null>(null),[hidden,setHidden]=useState(false),[failed,setFailed]=useState(false),[retryable,setRetryable]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[email,setEmail]=useState(''),[language,setLanguage]=useState<'es'|'en'>(en?'en':'es'),[days,setDays]=useState(14);
 const pending=useRef<{actionId:string;body:Record<string,unknown>}|null>(null),seq=useRef(0);
 const status=(value:string)=>(en?{created:'Created',sent:'Sent, waiting for signature',viewed:'Opened by the signer',signed:'Signed',declined:'Declined',expired:'Expired',cancelled:'Cancelled',error:'Sending error'}:{created:'Creada',sent:'Enviada, esperando firma',viewed:'Abierta por quien firma',signed:'Firmada',declined:'Rechazada',expired:'Vencida',cancelled:'Anulada',error:'Error de envío'} as Record<string,string>)[value]??value;
 const when=(value:string)=>new Date(value).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'});
 const load=useCallback(async()=>{const n=++seq.current;setFailed(false);try{const response=await fetch('/api/pro/esign?'+new URLSearchParams({kind,id:documentId}),{cache:'no-store'});if(response.status===403||response.status===404){if(n===seq.current)setHidden(true);return;}if(!response.ok)throw Error();const body=await response.json() as Read;if(n!==seq.current)return;setData(body);if(body.document){setName(old=>old||body.document!.clientName);setEmail(old=>old||body.document!.clientEmail);}}catch{if(n===seq.current)setFailed(true);}},[kind,documentId]);
 useEffect(()=>{const counter=seq,timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);counter.current++;};},[load]);
 async function post(body:Record<string,unknown>,reuse=false){
  if(!reuse||!pending.current)pending.current={actionId:crypto.randomUUID(),body};
  const payload=body.action==='retry'?body:{...pending.current.body,actionId:pending.current.actionId};
  setBusy(true);setError('');setNotice('');
  try{const response=await fetch('/api/pro/esign',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const json=await response.json().catch(()=>({}));
   if(!response.ok){pending.current=null;setRetryable(false);setError(en?({missing_keys:'The signature provider keys are missing on the server.',pro_esign_not_signable:'Share the document first.',pro_esign_open:'A signature request is already open for this document.',production_refused:'Production is not allowed on this server.'} as Record<string,string>)[json.reason]??(response.status===409?'The request changed. It was reloaded.':'Could not complete it.'):json.error??'No se pudo completar.');return false;}
   pending.current=null;setRetryable(false);return true;
  }catch{setRetryable(body.action!=='retry');setError(t('No se pudo comprobar el envío. Reintente: no se duplicará.','Could not confirm it. Retry: it will not be duplicated.'));return false;}
  finally{setBusy(false);await load();}
 }
 async function submit(event:FormEvent){
  event.preventDefault();if(!data?.document)return;
  const answer=await confirm({cancelLabel:t('Cancelar','Cancel'),title:t('¿Enviar a firmar?','Send for signature?'),description:t(`Se enviará una copia congelada de "${data.document.label}" a ${name} (${email}). Si el documento cambia después, deberá enviar una nueva solicitud.`,`A frozen copy of "${data.document.label}" will be sent to ${name} (${email}). If the document changes later, send a new request.`),
   detail:data.mode==='mock'?t('Modo simulación: no se envía ningún correo; usted puede abrir el enlace de firma simulado.','Simulation mode: no email is sent; you can open the simulated signing link.'):undefined,confirmLabel:t('Enviar a firmar','Send for signature')});
  if(!answer.confirmed)return;
  if(await post({action:'create',documentKind:kind,documentId,signerName:name.trim(),signerEmail:email.trim(),language,expiryDays:days})){setOpen(false);setNotice(t('Solicitud de firma enviada.','Signature request sent.'));}
 }
 async function cancel(request:Request){
  const answer=await confirm({cancelLabel:t('Cancelar','Cancel'),title:t('¿Anular la solicitud de firma?','Cancel the signature request?'),description:t('Quien firma ya no podrá firmar este envío. El historial se conserva.','The signer will no longer be able to sign this request. The history is kept.'),confirmLabel:t('Anular solicitud','Cancel request'),tone:'danger'});
  if(answer.confirmed)await post({action:'cancel',id:request.id,revision:request.revision});
 }
 if(hidden)return null;
 if(failed&&!data)return <section className={card} role="alert" data-esign-load-error><p className="text-sm text-red-700">{t('No se pudo cargar la firma electrónica.','Could not load the electronic signature.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></section>;
 if(!data)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{t('Cargando firma electrónica…','Loading electronic signature…')}</p>;
 const live=data.requests.find(r=>['created','sent','viewed','error'].includes(r.status));
 return <section data-esign={kind} data-esign-mode={data.mode} className={card} aria-labelledby={'esign-'+documentId}>
  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><h3 id={'esign-'+documentId} className="font-bold">{t('Firma electrónica','Electronic signature')}</h3>
   <span className="rounded-lg bg-[#f3f8fb] px-2 py-0.5 text-xs font-bold text-[#38485f]">{data.mode==='mock'?t('Simulación local','Local simulation'):data.mode==='sandbox'?t('Pruebas del proveedor','Provider test environment'):t('Producción','Production')}{data.modeStatus!=='ready'?' · '+t('no disponible','unavailable'):''}</span></div>
  <p className="text-xs text-[#52627a]">{t('Alternativa: el cliente también puede aceptar desde su portal con su cuenta (aceptación autenticada). La validez legal de la firma electrónica debe confirmarla un abogado.','Alternative: the customer can also accept from their portal with their account (authenticated acceptance). A lawyer must confirm the legal validity of the electronic signature.')}</p>
  {data.blocked&&<p data-esign-blocked className="text-sm text-[#52627a]">{kind==='contract'?t('Comparta el contrato para poder pedir la firma.','Share the contract to request a signature.'):kind==='quote'?t('Solo una cotización compartida y vigente se puede firmar.','Only a current shared quote can be signed.'):t('Solo los cambios propuestos o aceptados se pueden firmar.','Only proposed or accepted changes can be signed.')}</p>}
  {data.modeStatus!=='ready'&&<div className="space-y-2 text-sm text-amber-900"><p>{t('El proveedor de firma no está disponible en este modo (faltan claves o producción bloqueada).','The signature provider is unavailable in this mode (keys missing or production blocked).')}</p><Button type="button" variant="secondary" onClick={()=>navigatePro('pro_company',{empresa:'integraciones'})}>{t('Ir a Integraciones','Go to Integrations')}</Button></div>}
  {error&&<div role="alert" data-esign-error className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{error}</span>{retryable&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>{if(pending.current)void post(pending.current.body,true);}}>{t('Reintentar la misma solicitud','Retry the same request')}</Button>}</div>}
  {notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
  {data.requests.length>0&&<ul data-esign-requests className="space-y-3">{data.requests.map(request=><li key={request.id} data-esign-request={request.status} className="min-w-0 space-y-2 rounded-xl border border-[#e5e7eb] p-3 text-sm">
   <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-words font-semibold">{request.signerName} · <span className="break-all font-normal">{request.signerEmail}</span></span><span data-esign-status={request.status} className={'rounded-full px-3 py-0.5 text-xs font-bold '+(tone[request.status]??'')}>{status(request.status)}</span></div>
   {request.status==='declined'&&request.declineReason&&<p className="text-amber-900">{t('Motivo: ','Reason: ')}{request.declineReason}</p>}
   {request.acceptance&&<p data-esign-acceptance={request.acceptance.outcome} className={'rounded-lg px-2 py-1 text-xs font-semibold '+(request.acceptance.outcome==='review'?'bg-amber-50 text-amber-900':'bg-emerald-50 text-emerald-800')}>{request.acceptance.outcome==='accepted'?(kind==='work_change'?t('Firmado: el cambio quedó aceptado automáticamente (con registro en su historial).','Signed: the change was accepted automatically (recorded in its history).'):t('Firmado: la aceptación quedó registrada automáticamente con la firma.','Signed: the acceptance was recorded automatically with the signature.')):request.acceptance.outcome==='already_accepted'?t('El documento ya estaba aceptado; no se cambió nada.','The document was already accepted; nothing changed.'):t('Firmado, pero la aceptación no se aplicó sola: ','Signed, but the acceptance was not applied automatically: ')+(({signer_not_customer:t('quien firmó no es el correo del cliente; registre la aprobación manualmente si corresponde.','the signer is not the customer\'s e-mail; record the approval manually if appropriate.'),document_changed:t('el documento cambió después de enviarlo.','the document changed after it was sent.'),document_not_signable:t('el documento ya no está compartido.','the document is no longer shared.'),no_customer_link:t('el cliente no tiene su cuenta vinculada al trabajo.','the customer has no account linked to the job.')} as Record<string,string>)[request.acceptance.reason??'']??t('revísela manualmente.','review it manually.'))}</p>}
   {(request.status==='sent'||request.status==='viewed')&&<p className="text-xs text-[#52627a]">{t('Vence: ','Expires: ')}{when(request.expiresAt)}</p>}
   <ol data-esign-events className="space-y-0.5 text-xs text-[#52627a]">{request.events.map(event=><li key={event.seq}>{when(event.at)} · {status(event.status)}</li>)}</ol>
   <p className="break-all text-[11px] text-[#52627a]">SHA-256: {request.documentHash}</p>
   <div className="flex flex-wrap gap-2">
    <a className="inline-flex min-h-11 items-center rounded-full border border-[#d7e1ea] px-4 text-sm font-semibold text-[#162543]" href={'/api/pro/esign-file?'+new URLSearchParams({id:request.id,kind:'original'})} data-esign-download="original">{t('PDF enviado','PDF sent')}</a>
    {request.artifacts.some(a=>a.kind==='signed_pdf')&&<a className="inline-flex min-h-11 items-center rounded-full border border-emerald-300 px-4 text-sm font-semibold text-emerald-800" href={'/api/pro/esign-file?'+new URLSearchParams({id:request.id,kind:'signed_pdf'})} data-esign-download="signed_pdf">{t('PDF firmado','Signed PDF')}</a>}
    {request.artifacts.some(a=>a.kind==='certificate')&&<a className="inline-flex min-h-11 items-center rounded-full border border-emerald-300 px-4 text-sm font-semibold text-emerald-800" href={'/api/pro/esign-file?'+new URLSearchParams({id:request.id,kind:'certificate'})} data-esign-download="certificate">{t('Certificado de auditoría','Audit certificate')}</a>}
    {request.artifacts.some(a=>a.kind==='certificate')&&<a className="inline-flex min-h-11 items-center rounded-full border border-emerald-300 px-4 text-sm font-semibold text-emerald-800" href={'/api/pro/esign-file?'+new URLSearchParams({id:request.id,kind:'evidence'})} data-esign-download="evidence">{t('Paquete de evidencias (JSON)','Evidence package (JSON)')}</a>}
    {request.signerUrl&&<a className="inline-flex min-h-11 items-center rounded-full border border-[#d7e1ea] px-4 text-sm font-semibold text-[#007aa0]" href={request.signerUrl} target="_blank" rel="noopener noreferrer" data-esign-signer-link>{t('Abrir como firmante (simulación)','Open as signer (simulation)')}</a>}
    {request.status==='error'&&<Button type="button" variant="secondary" disabled={busy||disabled} data-esign-retry onClick={()=>void post({action:'retry',id:request.id})}>{t('Reintentar envío','Retry sending')}</Button>}
    {['created','sent','viewed','error'].includes(request.status)&&<Button type="button" variant="secondary" className="text-red-700" disabled={busy||disabled} data-esign-cancel onClick={()=>void cancel(request)}>{t('Anular','Cancel')}</Button>}
    <Button type="button" variant="secondary" disabled={busy} data-esign-refresh onClick={()=>void load()}>{t('Actualizar estado','Refresh status')}</Button>
   </div>
  </li>)}</ul>}
  {!data.blocked&&!live&&data.modeStatus==='ready'&&!open&&<Button type="button" data-esign-start disabled={busy||disabled} onClick={()=>setOpen(true)}>{t('Pedir firma electrónica','Request electronic signature')}</Button>}
  {open&&<form data-esign-form onSubmit={submit} className="grid min-w-0 gap-3 rounded-xl bg-[#f7f9fc] p-3 sm:grid-cols-2">
   <label className="block min-w-0 text-sm font-bold">{t('Nombre de quien firma','Signer name')}<input data-esign-field="name" className={field} required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label>
   <label className="block min-w-0 text-sm font-bold">{t('Correo de quien firma','Signer email')}<input data-esign-field="email" type="email" className={field} required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label className="block min-w-0 text-sm font-bold">{t('Idioma del documento','Document language')}<select data-esign-field="language" className={field} value={language} onChange={e=>setLanguage(e.target.value as 'es'|'en')}><option value="es">Español</option><option value="en">English</option></select></label>
   <label className="block min-w-0 text-sm font-bold">{t('Días para firmar','Days to sign')}<input data-esign-field="days" type="number" min={1} max={60} className={field} value={days} onChange={e=>setDays(Math.max(1,Math.min(60,Number(e.target.value)||14)))}/></label>
   {data.document?.totalCents!=null&&<p className="text-sm sm:col-span-2">{t('Total del documento: ','Document total: ')}<strong>{proMoney(data.document.totalCents/100,en)}</strong></p>}
   <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" data-esign-send disabled={busy}>{busy?t('Enviando…','Sending…'):t('Revisar y enviar','Review and send')}</Button><Button type="button" variant="secondary" disabled={busy} onClick={()=>setOpen(false)}>{t('Cancelar','Cancel')}</Button></div>
  </form>}
  {dialogNode}
 </section>;
}
