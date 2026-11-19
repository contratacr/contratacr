'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {navigatePro} from '@/lib/pro/navigation';
import {PAYMENT_FAILURES,reconciliationSchema,type ReconciliationRow} from '@/lib/pro/integrations/payments/api';

/**
 * Round 6A: Company › Cobros en línea — reconciliation of processor attempts against the job ledger.
 * matched = booked once; refunded = reversal booked; exception = money and ledger disagree (refund it or
 * record it by hand); pending / failed attempts never touch the ledger.
 */
const style:Record<ReconciliationRow['reconciliation'],string>={matched:'bg-[#e7f5ec] text-[#1d5b33]',refunded:'bg-[#eef2f6] text-[#38485f]',exception:'bg-[#fdeceb] text-[#8a2a1b]',pending:'bg-[#eaf7fb] text-[#00668a]',failed:'bg-[#fff6e0] text-[#7a4b00]'};
export function PaymentReconciliation(){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]);
 const [filter,setFilter]=useState<'all'|'exceptions'>('all'),[data,setData]=useState<ReturnType<typeof reconciliationSchema.parse>|null>(null),[failed,setFailed]=useState(false);
 const seq=useRef(0);
 const invalidate=useCallback(()=>{seq.current++;},[]);
 const load=useCallback(async()=>{const n=++seq.current;setFailed(false);try{const response=await fetch('/api/pro/payment-links?'+new URLSearchParams({view:'reconciliation',filter}),{cache:'no-store'});if(!response.ok)throw Error();const body=reconciliationSchema.parse(await response.json());if(n===seq.current)setData(body);}catch{if(n===seq.current)setFailed(true);}},[filter]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate]);
 const money=(cents:number)=>proMoney(cents/100,en),label=(value:ReconciliationRow['reconciliation'])=>({matched:t('Conciliado','Matched'),refunded:t('Reembolsado','Refunded'),exception:t('Revisar','Review'),pending:t('En proceso','Processing'),failed:t('Rechazado','Declined')})[value];
 const review=(row:ReconciliationRow)=>row.review==='amount_mismatch'?t('El monto del procesador no coincide con el enlace.','The processor amount does not match the link.'):row.review?.startsWith('ledger_refused')?t('El saldo cambió antes de registrarlo: reembólselo o regístrelo a mano.','The balance changed before booking: refund it or record it by hand.'):row.review?.startsWith('link_')?t('El enlace ya no estaba activo.','The link was no longer active.'):row.entryId?t('El abono se anuló a mano pero el dinero sigue en el procesador: reembólselo.','The payment was voided by hand but the money is still at the processor: refund it.'):t('Pago aprobado sin registro en el estado de cuenta.','Approved payment without a ledger booking.');
 return <div data-payment-reconciliation className="min-w-0 space-y-4">
  <div className="flex flex-wrap gap-2" role="group" aria-label={t('Filtro','Filter')}>{(['all','exceptions'] as const).map(value=><button key={value} type="button" aria-pressed={filter===value} data-reconciliation-filter={value} onClick={()=>setFilter(value)} className={'min-h-11 rounded-xl border px-3 text-sm font-semibold '+(filter===value?'border-[#008bb5] bg-[#eaf7fb] text-[#007aa0]':'border-[#d7e1ea] bg-white')}>{value==='all'?t('Todos','All'):t('Solo por revisar','Needs review only')}</button>)}<Button type="button" variant="secondary" onClick={()=>void load()}>{t('Actualizar','Refresh')}</Button></div>
  {failed&&!data?<div role="alert" className="text-sm"><p>{t('No se pudo cargar la conciliación.','Could not load reconciliation.')}</p></div>:!data?<p role="status" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>:<>
   <dl data-reconciliation-summary className="grid min-w-0 grid-cols-2 gap-2 rounded-2xl bg-[#f3f8fb] p-3 text-sm sm:grid-cols-4">
    <div><dt className="text-xs text-[#52627a]">{t('Recibido en línea','Received online')}</dt><dd className="font-bold">{money(data.summary.receivedCents)}</dd></div>
    <div><dt className="text-xs text-[#52627a]">{t('Registrado en estados de cuenta','Booked in ledgers')}</dt><dd className="font-bold" data-reconciliation-booked>{money(data.summary.bookedCents)}</dd></div>
    <div><dt className="text-xs text-[#52627a]">{t('Reembolsado','Refunded')}</dt><dd className="font-bold">{money(data.summary.refundedCents)}</dd></div>
    <div><dt className="text-xs text-[#52627a]">{t('Por revisar','Needs review')}</dt><dd className={'font-bold '+(data.summary.exceptions?'text-[#8a2a1b]':'')} data-reconciliation-exceptions>{data.summary.exceptions}</dd></div>
   </dl>
   {data.items.length===0?<p className="text-sm text-[#52627a]">{filter==='all'?t('Todavía no hay cobros en línea.','No online payments yet.'):t('Nada por revisar.','Nothing to review.')}</p>:
   <ul className="space-y-2">{data.items.map(row=><li key={row.attemptId} data-reconciliation-row={row.reconciliation} className="min-w-0 space-y-1 rounded-xl border border-[#d7e1ea] p-3 text-sm">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><p className="min-w-0 break-words font-semibold">{row.description}</p><span className={'rounded-lg px-2 py-0.5 text-xs font-bold '+style[row.reconciliation]}>{label(row.reconciliation)}</span></div>
    <p className="break-words text-[#52627a]">{money(row.amountCents)} · {row.method==='card'?t('Tarjeta','Card')+(row.cardLast4?' •••• '+row.cardLast4:''):'SINPE Móvil'+(row.sinpeReference?' · '+row.sinpeReference:'')} · {row.mode==='mock'?t('simulación','simulation'):row.mode} · {new Date(row.at).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'short',timeStyle:'short'})}</p>
    <p className="break-all font-mono text-xs text-[#52627a]">{row.processorRef}</p>
    {row.failureCode&&<p className="text-xs">{PAYMENT_FAILURES[row.failureCode]?.[en?'en':'es']??row.failureCode}</p>}
    {row.reconciliation==='exception'&&<p className="text-xs font-semibold text-[#8a2a1b]">{review(row)}</p>}
    {row.draftId&&<Button type="button" variant="outline" className="min-h-11" onClick={()=>navigatePro('pro_billing',{factura:row.draftId!,cobroFactura:row.draftId!})}>{t('Abrir cobro del borrador','Open draft payment')}</Button>}
   </li>)}</ul>}
  </>}
 </div>;
}
