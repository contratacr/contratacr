'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {ProModal as Modal} from '@/components/pro/modal';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {closeProStep} from '@/lib/pro/navigation';
import {proMoney} from '@/lib/pro/money';
import {PAYMENT_FAILURES,paymentLinksReadSchema,type PaymentLink,type PaymentLinksRead} from '@/lib/pro/integrations/payments/api';
import {useProSearchParams} from './use-pro-search-params';

/**
 * Round 6A: online payment link for an invoice draft or a payment-plan installment. The link URL is
 * shown ONCE at creation (only its hash is stored). Payments are booked by the processor's event,
 * exactly once; a refund books the ledger reversal. Mock mode is a local simulation and says so.
 */
const api='/api/pro/payment-links';
/** Row 49: QR of the payment link, made in the browser (no third party sees the link) and downloadable as PNG or SVG. */
function PaymentLinkQr({url}:{url:string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,[png,setPng]=useState(''),[failed,setFailed]=useState(false);
 useEffect(()=>{let alive=true;setPng('');setFailed(false);void import('qrcode').then(m=>m.toDataURL(url,{width:320,margin:2,errorCorrectionLevel:'M'})).then(data=>{if(alive)setPng(data);},()=>{if(alive)setFailed(true);});return()=>{alive=false;};},[url]);
 async function svg(){const m=await import('qrcode'),text=await m.toString(url,{type:'svg',margin:2,errorCorrectionLevel:'M'}),link=document.createElement('a');link.href=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'}));link.download='qr-cobro.svg';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
 if(failed)return <p role="alert" className="text-sm text-red-700">{t('No se pudo generar el código QR.','Could not generate the QR code.')}</p>;
 return <div data-payment-link-qr className="flex min-w-0 flex-wrap items-center gap-3">
  {png?<img data-payment-link-qr-image src={png} width={160} height={160} alt={t('Código QR del enlace de pago','QR code of the payment link')} className="h-40 w-40 rounded-xl border border-[#d7e1ea] bg-white p-1"/>:<span role="status" className="text-sm text-[#52627a]">{t('Generando QR...','Generating QR...')}</span>}
  <div className="flex flex-wrap gap-2"><a data-payment-link-qr-png href={png||undefined} download="qr-cobro.png" aria-disabled={!png} className="inline-flex min-h-11 items-center rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-semibold text-[#007aa0]">{t('Descargar PNG','Download PNG')}</a><Button type="button" variant="secondary" data-payment-link-qr-svg disabled={!png} onClick={()=>void svg()}>{t('Descargar SVG','Download SVG')}</Button></div>
 </div>;
}
export type PaymentLinkTarget={target:'invoice';draftId:string}|{target:'installment';planId:string;planRevision:number;seq:number;amountCents:number};
const statusStyle:Record<string,string>={active:'bg-[#eaf7fb] text-[#00668a]',paid:'bg-[#e7f5ec] text-[#1d5b33]',cancelled:'bg-[#eef2f6] text-[#38485f]',expired:'bg-[#fff6e0] text-[#7a4b00]'};
export function PaymentLinkPanel({scope,disabled=false}:{scope:PaymentLinkTarget;disabled?:boolean}){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),{confirm,dialogNode}=useAppDialog();
 const [data,setData]=useState<PaymentLinksRead|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [methods,setMethods]=useState<('card'|'sinpe')[]>(['card','sinpe']),[days,setDays]=useState(7),[created,setCreated]=useState<{url:string;id:string}|null>(null),[copied,setCopied]=useState(false);
 const seq=useRef(0),attempt=useRef<{key:string;id:string}|null>(null);
 const invalidate=useCallback(()=>{seq.current++;},[]);
 const query:Record<string,string>=scope.target==='invoice'?{draftId:scope.draftId}:{planId:scope.planId};
 const load=useCallback(async()=>{const n=++seq.current;setFailed(false);
  try{const response=await fetch(api+'?'+new URLSearchParams(query),{cache:'no-store'});if(!response.ok)throw Error();const body=paymentLinksReadSchema.parse(await response.json());if(n===seq.current)setData(body);}
  catch{if(n===seq.current)setFailed(true);}
 // eslint-disable-next-line react-hooks/exhaustive-deps -- the query is derived from the stable scope ids
 },[scope.target==='invoice'?scope.draftId:scope.planId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate]);
 const money=(cents:number)=>proMoney(cents/100,en);
 async function post(key:string,payload:Record<string,unknown>){
  if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,actionId:attempt.current.id})});
   const body=await response.json().catch(()=>({}));
   if(!response.ok){if(response.status!==503)attempt.current=null;setError(en?englishReason(body.reason)??body.error:body.error??t('No se pudo completar.','Could not complete.'));return null;}
   attempt.current=null;return body as Record<string,unknown>;
  }catch{setError(t('No se pudo comprobar el resultado. Reintente: no se duplicará.','Could not confirm the result. Retry: it will not be duplicated.'));return null;}
  finally{setBusy(false);await load();}
 }
 const englishReason=(reason:string)=>({pro_payment_link_no_work:'This draft is not linked to a job: an online payment needs the job balance to be recorded.',pro_payment_link_nothing_due:'Nothing is left to collect online.',pro_payment_link_exists:'There is already an active link. Cancel it before creating another.',pro_payment_link_in_progress:'A payment is in progress on this link. Wait a few minutes.',missing_keys:'The processor keys for the selected mode are missing on the server.',production_refused:'Production is not enabled on this server.',pro_payment_refund_exists:'That payment already has a refund request.'} as Record<string,string>)[reason];
 async function create(){
  const scopeInput=scope.target==='invoice'?{target:'invoice',draftId:scope.draftId}:{target:'installment',planId:scope.planId,planRevision:scope.planRevision,seq:scope.seq};
  const body=await post('create:'+JSON.stringify(scopeInput)+methods.join()+days,{action:'create',...scopeInput,methods,expiresInDays:days,language:en?'en':'es'});
  if(body&&typeof body.url==='string'){setCreated({url:body.url,id:(body.link as {id:string}).id});setCopied(false);setNotice(t('Enlace creado. Cópielo ahora: por seguridad no se vuelve a mostrar.','Link created. Copy it now: for security it is not shown again.'));}
 }
 async function cancel(link:PaymentLink){
  const answer=await confirm({title:t('¿Anular este enlace?','Cancel this link?'),description:t('El cliente ya no podrá pagar con él. Los pagos ya recibidos se conservan.','The customer can no longer pay with it. Payments already received are kept.'),confirmLabel:t('Anular enlace','Cancel link'),tone:'danger',input:{label:t('Motivo','Reason'),defaultValue:t('Se acordó otro medio de pago','Another payment method was agreed')}});
  if(!answer.confirmed||!answer.value?.trim())return;
  if(await post('cancel:'+link.id,{action:'cancel',linkId:link.id,reason:answer.value.trim().slice(0,160)})){setNotice(t('Enlace anulado.','Link cancelled.'));if(created?.id===link.id)setCreated(null);}
 }
 async function refund(transactionId:string,amount:number){
  const answer=await confirm({title:t('¿Reembolsar este pago?','Refund this payment?'),description:t('Se pide el reembolso al procesador y se registra la anulación del abono en el estado de cuenta (no se borra nada).','The refund is requested from the processor and the payment reversal is recorded in the ledger (nothing is deleted).'),detail:money(amount),confirmLabel:t('Reembolsar','Refund'),tone:'danger',input:{label:t('Motivo del reembolso','Refund reason'),defaultValue:''}});
  if(!answer.confirmed||!answer.value?.trim())return;
  if(await post('refund:'+transactionId,{action:'refund',transactionId,reason:answer.value.trim().slice(0,160)}))setNotice(t('Reembolso registrado: el abono quedó anulado en el estado de cuenta.','Refund recorded: the payment was reversed in the ledger.'));
 }
 const active=data?.links.find(link=>link.status==='active'),due=scope.target==='invoice'?data?.dueCents??0:scope.amountCents;
 const methodLabel=(method:string)=>method==='card'?t('Tarjeta','Card'):'SINPE Móvil';
 const statusLabel=(status:string)=>({active:t('Activo','Active'),paid:t('Pagado','Paid'),cancelled:t('Anulado','Cancelled'),expired:t('Vencido','Expired'),pending:t('En proceso','Processing'),requires_action:t('Verificación del banco','Bank verification'),succeeded:t('Aprobado','Approved'),failed:t('Rechazado','Declined'),refunded:t('Reembolsado','Refunded')} as Record<string,string>)[status]??status;
 return <div data-payment-link-panel className="min-w-0 space-y-3">
  {failed&&!data?<div role="alert" className="space-y-2 text-sm"><p>{t('No se pudieron cargar los enlaces de pago.','Could not load payment links.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>:!data?<p role="status" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>:<>
   <p data-payment-link-mode={data.mode} className={'rounded-xl p-3 text-sm '+(data.mode==='mock'?'bg-[#fff6e0] text-[#7a4b00]':'bg-[#eaf7fb] text-[#00668a]')}>{data.mode==='mock'?t('Simulación local: el cliente verá una página de pago de prueba; no se cobra dinero real. Los pagos simulados sí se registran en este borrador local.','Local simulation: the customer sees a test payment page; no real money is charged. Simulated payments are recorded in this local draft.'):data.mode==='sandbox'?t('Ambiente de pruebas del procesador.','Processor test environment.'):t('Producción: cobros reales.','Production: real charges.')}{data.modeStatus!=='ready'&&<strong className="mt-1 block">{t('Faltan claves en el servidor para este modo.','Keys for this mode are missing on the server.')}</strong>}</p>
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
   {created&&<div data-payment-link-created className="min-w-0 space-y-2 rounded-xl border border-[#9fd8e8] bg-[#f3fbfd] p-3"><label className="block text-sm font-bold">{t('Enlace para su cliente','Link for your customer')}<input data-payment-link-url readOnly value={created.url} onFocus={event=>event.currentTarget.select()} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 font-mono text-xs"/></label>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={()=>{void navigator.clipboard?.writeText(created.url).then(()=>setCopied(true),()=>setCopied(false));}}>{copied?t('Copiado','Copied'):t('Copiar enlace','Copy link')}</Button><a data-payment-link-open href={created.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-[#d7e1ea] px-4 text-sm font-semibold text-[#162543] hover:bg-[#f6f9fb]">{t('Abrir página de pago','Open payment page')}</a></div>
    <PaymentLinkQr url={created.url}/>
    <p className="text-xs text-[#52627a]">{t('Envíelo usted por WhatsApp o correo. ContrataCR no lo envía.','Send it yourself by WhatsApp or email. ContrataCR does not send it.')}</p></div>}
   {!active&&(scope.target==='installment'||data.hasWork!==false)&&due>0&&<div data-payment-link-new className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] p-3">
    <p className="text-sm">{t('Monto a cobrar: ','Amount to collect: ')}<strong data-payment-link-due>{money(due)}</strong></p>
    <fieldset className="flex flex-wrap gap-3"><legend className="sr-only">{t('Medios de pago','Payment methods')}</legend>{(['card','sinpe'] as const).map(method=><label key={method} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={methods.includes(method)} onChange={event=>setMethods(old=>event.target.checked?[...old,method]:old.filter(m=>m!==method))}/>{methodLabel(method)}</label>)}</fieldset>
    <label className="block text-sm font-bold">{t('Vence en (días)','Expires in (days)')}<input type="number" min={1} max={60} value={days} onChange={event=>setDays(Math.max(1,Math.min(60,Number(event.target.value)||7)))} className="mt-1 block min-h-11 w-28 rounded-xl border border-[#d7e1ea] px-3 text-base font-normal"/></label>
    <Button type="button" data-payment-link-create disabled={disabled||busy||!methods.length||data.modeStatus!=='ready'} onClick={()=>void create()}>{t('Crear enlace de pago','Create payment link')}</Button></div>}
   {scope.target==='invoice'&&data.hasWork===false&&<p className="text-sm text-[#52627a]">{t('Este borrador no está vinculado a un trabajo: el cobro en línea necesita el saldo del trabajo para registrar el pago.','This draft is not linked to a job: online collection needs the job balance to record the payment.')}</p>}
   {!active&&due<=0&&<p data-payment-link-nothing className="text-sm text-[#52627a]">{t('No hay saldo pendiente para cobrar en línea.','Nothing is left to collect online.')}</p>}
   {data.links.map(link=><article key={link.id} data-payment-link={link.status} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] p-3">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold">{link.description}</p><p className="text-sm">{money(link.amountCents)} · {link.methods.map(methodLabel).join(' · ')}</p></div><span className={'rounded-lg px-2 py-0.5 text-xs font-bold '+(statusStyle[link.status]??'')}>{statusLabel(link.status)}</span></div>
    <p className="text-xs text-[#52627a]">{link.status==='active'?t('Vence: ','Expires: '):t('Creado: ','Created: ')}{new Date(link.status==='active'?link.expiresAt:link.createdAt).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'})}{link.cancelReason?' · '+link.cancelReason:''}</p>
    {link.attempts.length>0&&<ul className="space-y-1 text-sm">{link.attempts.map(attemptRow=><li key={attemptRow.id} data-payment-attempt={attemptRow.status} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f7f9fc] px-2 py-1"><span className="min-w-0 break-words">{methodLabel(attemptRow.method)}{attemptRow.cardLast4?' •••• '+attemptRow.cardLast4:''}{attemptRow.sinpeReference?' · '+attemptRow.sinpeReference:''} · {statusLabel(attemptRow.status)}{attemptRow.failureCode?' · '+(PAYMENT_FAILURES[attemptRow.failureCode]?.[en?'en':'es']??attemptRow.failureCode):''}</span>
     {attemptRow.status==='succeeded'&&attemptRow.transactions.filter(tx=>tx.kind==='payment').map(tx=><Button key={tx.id} type="button" variant="secondary" data-payment-refund disabled={busy||disabled} onClick={()=>void refund(tx.id,tx.amountCents)}>{t('Reembolsar','Refund')}</Button>)}</li>)}</ul>}
    {link.status==='active'&&<Button type="button" variant="secondary" data-payment-link-cancel disabled={busy||disabled} onClick={()=>void cancel(link)}>{t('Anular enlace','Cancel link')}</Button>}
   </article>)}
  </>}
  {dialogNode}
 </div>;
}
/** Draft modal step (?cobroFactura=<id>). */
export function InvoicePaymentLinkStep({id}:{id:string}){
 const en=useLocale()==='en',params=useProSearchParams();
 if(params.get('cobroFactura')!==id)return null;
 const title=en?'Online payment':'Cobro en línea';
 return <Modal title={title} ariaLabel={title} closeLabel={en?'Close':'Cerrar'} mobilePresentation="fullscreen" onClose={()=>closeProStep('cobroFactura')}><PaymentLinkPanel scope={{target:'invoice',draftId:id}}/></Modal>;
}
