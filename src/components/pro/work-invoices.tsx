'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {navigatePro} from '@/lib/pro/navigation';
import {filterWorkInvoices,summarizeWorkInvoices,workInvoicesSchema,type WorkInvoice,type WorkInvoiceFilter} from '@/lib/pro/work-invoices';
import {FinanceFilters,FinanceSummaryCards} from './finance-list-kit';

/** Area D: Invoices of one project (cards Total / Paid / Balance / Overdue, status filters, search). Read only; opening a row goes to Billing. */
export function WorkInvoices({workId}:{workId:string}){const {user,loading}=useAuth();if(loading||!user)return null;return <Session key={user.id+':'+workId} workId={workId} accountId={user.id}/>;}
function Session({workId,accountId}:{workId:string;accountId:string}){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]);
 const [items,setItems]=useState<WorkInvoice[]|null>(null),[error,setError]=useState(false),[filter,setFilter]=useState<WorkInvoiceFilter>('all'),[query,setQuery]=useState(''),active=useRef(true),sequence=useRef(0);
 const load=useCallback(async()=>{
  const n=++sequence.current;setError(false);
  try{
   const response=await fetch('/api/pro/work-invoices?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});
   if(!response.ok)throw Error();const body=workInvoicesSchema.parse(await response.json());if(body.workId!==workId)throw Error();
   if(active.current&&n===sequence.current)setItems(body.items);
  }catch{if(active.current&&n===sequence.current)setError(true);}
 },[workId,accountId]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;sequence.current++;clearTimeout(timer);};},[load]);
 const money=(cents:number)=>proMoney(cents/100,en),label:Record<WorkInvoice['status'],string>={draft:t('Borrador','Draft'),sent:t('Enviada','Sent'),viewed:t('Vista','Viewed'),partial:t('Pago parcial','Partially paid'),overdue:t('Vencida','Overdue'),paid:t('Pagada','Paid'),void:t('Anulada','Void')};
 return <section data-work-invoices className="space-y-4">
  <div className="space-y-1"><h3 className="text-lg font-bold text-[#162543]">{t('Facturas del proyecto','Project invoices')}</h3>
   <p className="text-sm text-[#52627a]">{t('Las facturas y borradores creados para este proyecto, con su saldo y vencimiento. Los borradores y las anuladas no suman en los totales.','Invoices and drafts created for this project, with balance and due date. Drafts and void invoices are left out of the totals.')}</p></div>
  {error&&<div role="alert" className="space-y-2"><p className="text-sm text-red-700">{t('No se pudieron cargar las facturas.','Could not load the invoices.')}</p><Button type="button" variant="secondary" data-work-invoices-retry onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>}
  {!items&&!error&&<p role="status" className="text-sm text-[#52627a]">{t('Cargando facturas…','Loading invoices…')}</p>}
  {items&&(()=>{
   const sum=summarizeWorkInvoices(items),shown=filterWorkInvoices(items,filter,query);
   return <>
    <FinanceSummaryCards label={t('Resumen de facturas','Invoice summary')} cards={[{key:'total',label:t('Total facturado','Total invoiced'),value:money(sum.total)},{key:'paid',label:t('Pagado','Paid'),value:money(sum.paid)},{key:'balance',label:t('Saldo','Balance'),value:money(sum.balance)},{key:'overdue',label:t('Vencido','Overdue'),value:money(sum.overdue)}]}/>
    <FinanceFilters value={filter} onChange={setFilter} query={query} onQuery={setQuery} searchLabel={t('Buscar facturas','Search invoices')} groupLabel={t('Filtrar facturas por estado','Filter invoices by status')} options={[{value:'all',label:t('Todas','All'),count:sum.counts.all},{value:'open',label:t('Por cobrar','Open'),count:sum.counts.open},{value:'overdue',label:t('Vencidas','Overdue'),count:sum.counts.overdue},{value:'paid',label:t('Pagadas','Paid'),count:sum.counts.paid},{value:'draft',label:t('Borradores','Drafts'),count:sum.counts.draft},{value:'void',label:t('Anuladas','Void'),count:sum.counts.void}]}/>
    {!items.length&&<p data-work-invoices-empty className="rounded-xl border border-dashed border-[#d7e1ea] bg-white p-4 text-sm text-[#52627a]">{t('Este proyecto aún no tiene facturas. Use «Facturar desde el trabajo» en Costos y pagos para crear la primera.','This project has no invoices yet. Use "Bill from job" in Costs & payments to create the first one.')}</p>}
    {items.length>0&&!shown.length&&<p data-finance-no-match className="text-sm text-[#52627a]">{t('Ninguna factura coincide con la búsqueda o el filtro.','No invoice matches this search or filter.')}</p>}
    {shown.length>0&&<ul className="space-y-2">{shown.map(item=><li key={item.id} data-work-invoice={item.id} data-work-invoice-status={item.status} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#d7e1ea] bg-white p-3">
     <div className="min-w-0 flex-1 basis-56"><p className="break-words font-semibold text-[#162543]">{item.title}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#52627a]"><span data-work-invoice-badge className="rounded-full bg-[#eaf7fb] px-2 py-0.5 text-xs font-semibold text-[#006f93]">{label[item.status]}</span><span className="break-words">{item.receiver}</span></p>
      <p className="mt-1 text-xs text-[#52627a]">{t('Total','Total')} {money(item.totalCents)} · {t('Saldo','Balance')} {money(item.balanceCents)}{item.dueDate?` · ${t('Vence','Due')} ${item.dueDate}`:''}{item.daysOverdue>0?` · ${t(`${item.daysOverdue} días de atraso`,`${item.daysOverdue} days overdue`)}`:''}</p></div>
     <Button type="button" variant="secondary" aria-label={`${t('Abrir factura','Open invoice')}: ${item.title}`} onClick={()=>navigatePro('pro_billing',{factura:item.id})}>{t('Abrir factura','Open invoice')}</Button>
    </li>)}</ul>}
   </>;
  })()}
 </section>;
}
