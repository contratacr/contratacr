'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {clientFinancesSchema,type ClientFinances} from '@/lib/pro/client-finances';
import {privateEstimateMoney} from './private-estimate-preview';
import {clientInvoiceDeliverySchema,type InvoiceStatus} from '@/lib/pro/invoice-delivery';

const api='/api/pro/client-finances';
/**
 * Round 4A: «Finances» in the customer view (off by default; the owner turns it on in Customer
 * view). Quotes shared with the customer, invoice documents, payments received and the job balance
 * from the single formula. While loading or after an error nothing financial is shown (with retry).
 */
export function AppointmentFinances({requestId}:{requestId:string}){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <FinancesSession key={user.id+':'+requestId} accountId={user.id} requestId={requestId}/>;
}

function FinancesSession({accountId,requestId}:{accountId:string;requestId:string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [view,setView]=useState<ClientFinances|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),active=useRef(true),sequence=useRef(0);
 const load=useCallback(async()=>{const id=++sequence.current;setLoading(true);setError(false);try{const response=await fetch(api+'?'+new URLSearchParams({requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(response.status===404){if(active.current&&id===sequence.current)setView({visible:false});return;}if(!response.ok)throw Error();const body=clientFinancesSchema.parse(await response.json());if(active.current&&id===sequence.current)setView(body);
   // Rows 42/44: status, due date and balance of the invoices the professional sent (the first opening is recorded). Failure here never hides the finances.
   try{const delivery=await fetch('/api/pro/invoice-delivery?'+new URLSearchParams({requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(delivery.ok){const parsed=clientInvoiceDeliverySchema.parse(await delivery.json());if(active.current&&id===sequence.current)setSent(parsed.visible?Object.fromEntries(parsed.invoices.map(i=>[i.id,i])):{});}}catch{}}catch{if(active.current&&id===sequence.current)setError(true);}finally{if(active.current&&id===sequence.current)setLoading(false);}},[accountId,requestId]);
 const [sent,setSent]=useState<Record<string,{status:InvoiceStatus;dueDate:string;balanceCents:number;daysOverdue:number}>>({});
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);
 if(error&&!view)return <div role="alert" data-client-finances-error className="space-y-2 rounded-2xl border border-[#d7e1ea] p-4 text-sm"><p>{t('No se pudieron cargar las finanzas del trabajo.','Could not load the job finances.')}</p><Button type="button" variant="secondary" disabled={loading} onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!view||!view.visible)return null;
 const money=(cents:number)=>proMoney(cents/100,en);
 const day=(value:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(value.length===10?value+'T12:00:00-06:00':value));
 const status={shared:t('Pendiente de su respuesta','Waiting for your answer'),changes_requested:t('Cambios solicitados','Changes requested'),accepted:t('Aceptada','Accepted'),declined:t('Rechazada','Declined')};
 const method=(value:string|null)=>({cash:t('Efectivo','Cash'),card:t('Tarjeta','Card'),transfer:t('Transferencia','Transfer'),sinpe:'SINPE',other:t('Otro medio','Other method')} as Record<string,string>)[value??'']??t('Medio sin indicar','Method not specified');
 const s=view.summary;
 return <section data-client-finances aria-labelledby={'finances-'+requestId} className="min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] p-4">
  <div><h3 id={'finances-'+requestId} className="text-lg font-bold">{t('Finanzas del trabajo','Job finances')}</h3><p className="mt-1 text-sm text-[#52627a]">{t('Importes en colones registrados por su profesional. Los documentos de cobro no son comprobantes electrónicos.','Amounts in colones recorded by your professional. Billing documents are not electronic invoices.')}</p></div>
  <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-[#f3f8fb] p-4 text-sm sm:grid-cols-4">
   <div><dt className="text-xs text-[#52627a]">{t('Importe acordado','Agreed amount')}</dt><dd data-client-finances-agreed className="break-words text-base font-bold">{s.agreedCents===null?t('Sin definir','Not set'):money(s.agreedCents)}</dd></div>
   <div><dt className="text-xs text-[#52627a]">{t('Facturado','Invoiced')}</dt><dd data-client-finances-invoiced className="break-words text-base font-bold">{money(s.invoicedCents)}</dd></div>
   <div><dt className="text-xs text-[#52627a]">{t('Abonos recibidos','Payments received')}</dt><dd data-client-finances-paid className="break-words text-base font-bold">{money(s.paidCents)}</dd></div>
   <div><dt className="text-xs text-[#52627a]">{t('Saldo pendiente','Balance due')}</dt><dd data-client-finances-balance className="break-words text-base font-bold">{s.balanceCents===null?t('Sin definir','Not set'):money(s.balanceCents)}</dd></div>
  </dl>
  {s.creditNotesCents>0&&<p className="text-xs text-[#52627a]">{t('El saldo ya descuenta las notas de crédito aplicadas: ','The balance already deducts applied credit notes: ')}{money(s.creditNotesCents)}.</p>}
  {s.creditCents>0&&<p className="text-sm">{t('Saldo a su favor: ','Credit in your favour: ')}<strong>{money(s.creditCents)}</strong></p>}
  <div className="space-y-2"><h4 className="font-semibold">{t('Cotizaciones','Quotes')}</h4>
   {view.quotes.length?<ul className="space-y-2">{view.quotes.map(quote=><li key={quote.id} data-client-finances-quote className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-[#e5e7eb] p-3 text-sm"><span className="min-w-0 break-words"><span className="font-semibold">{quote.title}</span> · {t('versión','version')} {quote.version}<span className="block text-xs text-[#52627a]">{status[quote.status]} · {day(quote.sharedAt)}</span></span><strong>{privateEstimateMoney(quote.totalCents,quote.currency,en)}</strong></li>)}</ul>:<p className="text-sm text-[#52627a]">{t('Todavía no hay cotizaciones compartidas para este trabajo.','No quotes have been shared for this job yet.')}</p>}
  </div>
  <div className="space-y-2"><h4 className="font-semibold">{t('Documentos de cobro','Billing documents')}</h4>
   {view.invoices.length?<ul className="space-y-2">{view.invoices.map(invoice=><li key={invoice.id} data-client-finances-invoice className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-[#e5e7eb] p-3 text-sm"><span className="min-w-0 break-words"><span className="font-semibold">{invoice.title}</span><span className="block text-xs text-[#52627a]">{day(invoice.createdAt)}</span></span><span className="text-right"><strong>{money(invoice.totalCents)}</strong>{sent[invoice.id]&&<span data-client-finances-invoice-status={sent[invoice.id].status} className="mt-1 block text-xs text-[#52627a]"><span className="font-semibold">{({draft:'',sent:t('Enviada','Sent'),viewed:t('Vista','Viewed'),partial:t('Pago parcial','Partly paid'),paid:t('Pagada','Paid'),overdue:t('Vencida','Overdue'),void:t('Anulada','Void')} as Record<InvoiceStatus,string>)[sent[invoice.id].status]}</span>{sent[invoice.id].status!=='paid'&&sent[invoice.id].status!=='void'?' · '+t('Vence el ','Due ')+day(sent[invoice.id].dueDate)+' · '+t('Saldo ','Balance ')+money(sent[invoice.id].balanceCents):''}</span>}</span></li>)}</ul>:<p className="text-sm text-[#52627a]">{t('Todavía no hay documentos de cobro.','No billing documents yet.')}</p>}
  </div>
  <div className="space-y-2"><h4 className="font-semibold">{t('Abonos','Payments')}</h4>
   {view.payments.length?<ul className="space-y-2">{view.payments.map(payment=><li key={payment.id} data-client-finances-payment className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-[#e5e7eb] p-3 text-sm"><span className="min-w-0 break-words">{payment.receivedOn?t('Recibido el ','Received on ')+day(payment.receivedOn):t('Registrado el ','Recorded on ')+day(payment.recordedAt)}<span className="block text-xs text-[#52627a]">{method(payment.method)}{payment.voided?' · '+t('Anulado','Voided'):''}</span></span><strong className={payment.voided?'line-through':''}>{money(payment.amountCents)}</strong></li>)}</ul>:<p className="text-sm text-[#52627a]">{t('Todavía no hay abonos registrados.','No payments recorded yet.')}</p>}
  </div>
 </section>;
}
