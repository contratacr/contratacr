'use client';
import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import type {z} from 'zod';
import {Button} from '@/components/ui/button';
import {Modal} from '@/components/ui/modal';
import {proMoney} from '@/lib/pro/money';
import {proCount} from '@/lib/pro/plural';
import {proCsv,csvAmount} from '@/lib/pro/reports';
import {expenseCents,expenseCategoryLabel} from '@/lib/pro/expenses';
import {paymentMethodLabel} from '@/lib/pro/round11';
import {cashFlowSchema,crToday,defaultCashWindow,defaultIncomeWindow,expensePayMethods,incomeStatementSchema,orderPayMethods,payableKindLabel,payableMutationResultSchema,payableStatusLabel,payablesPageSchema,
 type CashFlow,type IncomeStatement,type PayableRow,type PayablesPage} from '@/lib/pro/payables';

/**
 * Round F1-A (register row 55): «Cuentas por pagar», «Flujo de caja» and «Estado de resultados» tabs of
 * Statistics › Reports. Same period filter as the other reports (empty = a sensible default window), CRC,
 * Costa Rica days, CSV for Excel. Payments made are recorded by the Expenses / Purchase-order writers; nothing
 * is paid, sent or filed. Management reports only.
 */
export type LedgerTab='payables'|'cashflow'|'income';
const tile='min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-4';
const card='min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-4';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 font-normal';
const muted='text-[#52627a]';
function download(name:string,rows:(string|number|null)[][]){
 const url=URL.createObjectURL(new Blob([proCsv(rows)],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function useText(){
 const en=useLocale()==='en';
 const t=(es:string,english:string)=>en?english:es;
 const money=(cents:number)=>proMoney(cents/100,en);
 const day=(value:string|null)=>value?new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'—';
 return {en,t,money,day};
}
/** One GET reader with the same states as the other report tabs (loading, retry, role denied). */
function useReport<S extends z.ZodTypeAny>(actor:string,url:string|null,schema:S){
 const [data,setData]=useState<z.infer<S>|null>(null),[dataUrl,setDataUrl]=useState<string|null>(null),[error,setError]=useState(false),[denied,setDenied]=useState(false),[loading,setLoading]=useState(true),sequence=useRef(0);
 const load=useCallback(async()=>{if(!url)return;const n=++sequence.current;setLoading(true);setError(false);
  try{const response=await fetch(url,{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(response.status===403){if(n===sequence.current)setDenied(true);return;}if(!response.ok)throw Error();
   const body=schema.parse(await response.json());if(n===sequence.current){setData(body);setDataUrl(url);}}
  catch{if(n===sequence.current)setError(true);}finally{if(n===sequence.current)setLoading(false);}},[actor,url,schema]);
 useEffect(()=>{const counter=sequence;const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);counter.current++;};},[load]);
 // Busy from the moment the query changes (not only once the request starts), so the shown list is never mistaken for the new one.
 return {data,error,denied,loading:loading||dataUrl!==url,load};
}
function States({denied,error,data,load,children}:{denied:boolean;error:boolean;data:unknown;load:()=>void;children:()=>ReactNode}){
 const {t}=useText();
 if(denied)return <p role="status" data-pro-report-denied className={'text-sm '+muted}>{t('Su rol en esta empresa no permite ver reportes financieros. Pídale acceso a un Administrador.','Your role in this company does not allow financial reports. Ask an Administrator for access.')}</p>;
 if(error)return <div role="alert" className="space-y-2 text-sm"><p>{t('No se pudo cargar el reporte.','Could not load the report.')}</p><Button type="button" variant="secondary" onClick={load}>{t('Reintentar','Retry')}</Button></div>;
 if(!data)return <p role="status" className={'text-sm '+muted}>{t('Cargando reporte…','Loading report…')}</p>;
 return <>{children()}</>;
}
function Segmented<T extends string>({label,value,options,onChange,name}:{label:string;value:T;options:[T,string][];onChange:(v:T)=>void;name:string}){
 return <div role="radiogroup" aria-label={label} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-[#e9eff5] p-1">{options.map(([v,text])=><button key={v} type="button" role="radio" aria-checked={value===v} data-pro-ledger-option={name+':'+v} onClick={()=>onChange(v)}
  className={`min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${value===v?'bg-white text-[#008bb5] shadow-sm':muted}`}>{text}</button>)}</div>;
}
const Tile=({label,value,note,tone,data}:{label:string;value:string;note?:ReactNode;tone?:'alert';data:string})=><div className={tile+(tone==='alert'?' border-[#f1c9c2] bg-[#fff8f6]':'')} {...{[data]:''}}>
 <p className={'text-sm '+muted}>{label}</p><p className={'text-xl font-bold tabular-nums '+(tone==='alert'?'text-[#8a2a1b]':'')}>{value}</p>{note&&<p className={'text-xs '+muted}>{note}</p>}</div>;
const errorText=async(response:Response,fallback:string)=>{try{const body=await response.json() as {error?:string};return body.error||fallback;}catch{return fallback;}};

export function LedgerReportTabs({actor,tab,from,to}:{actor:string;tab:LedgerTab;from:string;to:string}){
 return tab==='payables'?<Payables actor={actor} from={from} to={to}/>:tab==='cashflow'?<CashFlowView actor={actor} from={from} to={to}/>:<IncomeView actor={actor} from={from} to={to}/>;
}

// ============================================================ Accounts payable
type Dialog={kind:'pay';row:PayableRow}|{kind:'void';row:PayableRow}|{kind:'bill';row:PayableRow}|{kind:'register';po:PayablesPage['toRegister'][number]}|null;
function Payables({actor,from,to}:{actor:string;from:string;to:string}){
 const {en,t,money,day}=useText();
 const [status,setStatus]=useState<'open'|'all'|'paid'|'void'>('open'),[supplier,setSupplier]=useState(''),[overdue,setOverdue]=useState(false),[dialog,setDialog]=useState<Dialog>(null),[notice,setNotice]=useState('');
 const url=useMemo(()=>{const q=new URLSearchParams();if(from)q.set('from',from);if(to)q.set('to',to);if(status!=='open')q.set('status',status);if(supplier)q.set('supplier',supplier);if(overdue)q.set('overdue','1');return '/api/pro/payables'+(q.size?'?'+q:'');},[from,to,status,supplier,overdue]);
 const {data,error,denied,loading,load}=useReport(actor,url,payablesPageSchema);
 const done=(message:string)=>{setDialog(null);setNotice(message);void load();};
 return <States denied={denied} error={error} data={data} load={()=>void load()}>{()=>{const page=data!;const stamp=page.today;
  const supplierRows=()=>download(`cuentas-por-pagar-por-proveedor-${stamp}.csv`,[[t('Proveedor','Supplier'),t('Tipo','Type'),t('Pendiente total','Total open'),'0-30','31-60','61-90',t('Más de 90 días','Over 90 days'),t('Vencido','Overdue'),t('Facturas con saldo','Open bills'),t('Días de la más antigua','Oldest (days)')],
   ...page.suppliers.map(s=>[s.supplierName,s.vendorKind==='subcontractor'?t('Subcontratista','Subcontractor'):t('Proveedor','Supplier'),csvAmount(s.openCents),csvAmount(s.d0_30),csvAmount(s.d31_60),csvAmount(s.d61_90),csvAmount(s.d90_plus),csvAmount(s.overdueCents),s.openBills,s.oldestDays])]);
  const billRows=()=>download(`cuentas-por-pagar-${stamp}.csv`,[[t('Tipo','Type'),t('Referencia','Reference'),t('Factura del proveedor','Supplier bill'),t('Proveedor','Supplier'),t('Trabajo','Job'),t('Concepto','Description'),t('Fecha','Date'),t('Vence','Due'),t('Total (CRC)','Total (CRC)'),t('Pagado (CRC)','Paid (CRC)'),t('Saldo (CRC)','Balance (CRC)'),t('Estado','Status'),t('Días vencida','Days overdue')],
   ...page.items.map(r=>[payableKindLabel(r.sourceKind,en),r.reference,r.billNumber,r.supplierName,r.workTitle,r.concept,r.docDate,r.dueDate,csvAmount(r.amountCents),csvAmount(r.paidCents),csvAmount(r.balanceCents),payableStatusLabel(r.status,en),r.daysOverdue])]);
  const supplierOptions=page.suppliers.map(s=>[s.supplierKey,s.supplierName] as const);
  if(supplier&&!supplierOptions.some(([k])=>k===supplier))supplierOptions.push([supplier,page.items[0]?.supplierName??t('Proveedor elegido','Chosen supplier')]);
  return <div className="space-y-4" data-pro-payables>
   <p role="status" aria-live="polite" data-pro-payables-notice className={notice?'rounded-xl bg-[#eef8f3] px-3 py-2 text-sm text-[#1f6b45]':'sr-only'}>{notice}</p>
   <div className="grid min-w-0 gap-3 sm:grid-cols-3">
    <Tile data="data-pro-payables-open" label={t('Por pagar','Payable')} value={money(page.totals.openCents)} note={proCount(page.totals.openCount,en,['factura con saldo','facturas con saldo'],['open bill','open bills'])}/>
    <Tile data="data-pro-payables-overdue" tone={page.totals.overdueCents>0?'alert':undefined} label={t('Vencido','Overdue')} value={money(page.totals.overdueCents)} note={proCount(page.totals.overdueCount,en,['factura vencida','facturas vencidas'],['overdue bill','overdue bills'])}/>
    <Tile data="data-pro-payables-billed" label={t('Facturado por proveedores','Billed by suppliers')} value={money(page.totals.billedCents)} note={t('Pagado: ','Paid: ')+money(page.totals.paidCents)}/>
   </div>
   <div className={card}><h3 className="font-semibold">{t('Por pagar por antigüedad','Payable by age')}</h3><p className={'text-xs '+muted}>{t('Días desde la fecha de la factura o del gasto, como en las cuentas por cobrar.','Days since the bill or expense date, like receivables.')}</p>
    <dl data-pro-payables-aging className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">{([['0–30',page.aging.d0_30],['31–60',page.aging.d31_60],['61–90',page.aging.d61_90],[t('Más de 90','Over 90'),page.aging.d90_plus]] as const).map(([label,value])=><div key={label} className="rounded-xl bg-[#f7f9fc] p-3"><dt className={muted}>{label} {t('días','days')}</dt><dd className="font-semibold tabular-nums">{money(value)}</dd></div>)}</dl></div>
   <div className={card+' space-y-3'}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{t('Por proveedor','By supplier')}</h3><Button type="button" variant="outline" className="min-h-11" data-pro-payables-export-suppliers onClick={supplierRows}>{t('Exportar CSV','Export CSV')}</Button></div>
    {page.suppliers.length===0?<p className={'text-sm '+muted}>{t('No hay saldos por pagar en este período.','Nothing payable in this period.')}</p>:<div className="overflow-x-auto">
     <table data-pro-payables-suppliers className="w-full min-w-[42rem] text-left text-sm"><thead><tr className={muted}><th className="py-2 pr-3 font-semibold">{t('Proveedor','Supplier')}</th><th className="py-2 pr-3 text-right font-semibold">0–30</th><th className="py-2 pr-3 text-right font-semibold">31–60</th><th className="py-2 pr-3 text-right font-semibold">61–90</th><th className="py-2 pr-3 text-right font-semibold">{t('Más de 90','Over 90')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Vencido','Overdue')}</th><th className="py-2 text-right font-semibold">{t('Total','Total')}</th></tr></thead>
      <tbody>{page.suppliers.map(s=><tr key={s.supplierKey} data-pro-payables-supplier={s.supplierKey} className="border-t border-[#eef2f6]"><td className="py-2 pr-3"><span className="font-semibold">{s.supplierName}</span><span className={'block text-xs '+muted}>{s.vendorKind==='subcontractor'?t('Subcontratista','Subcontractor'):t('Proveedor','Supplier')} · {proCount(s.openBills,en,['factura','facturas'],['bill','bills'])}</span></td>
       <td className="py-2 pr-3 text-right tabular-nums">{money(s.d0_30)}</td><td className="py-2 pr-3 text-right tabular-nums">{money(s.d31_60)}</td><td className="py-2 pr-3 text-right tabular-nums">{money(s.d61_90)}</td><td className={'py-2 pr-3 text-right tabular-nums '+(s.d90_plus>0?'text-[#8a2a1b]':'')}>{money(s.d90_plus)}</td>
       <td className={'py-2 pr-3 text-right tabular-nums '+(s.overdueCents>0?'font-semibold text-[#8a2a1b]':'')}>{money(s.overdueCents)}</td><td className="py-2 text-right font-semibold tabular-nums">{money(s.openCents)}</td></tr>)}
       <tr className="border-t-2 border-[#d7e1ea] font-semibold"><td className="py-2 pr-3">{t('Total','Total')}</td><td colSpan={4}/><td className="py-2 pr-3 text-right tabular-nums">{money(page.totals.overdueCents)}</td><td className="py-2 text-right tabular-nums" data-pro-payables-suppliers-total>{money(page.totals.openCents)}</td></tr></tbody></table></div>}
   </div>
   {page.toRegister.length>0&&<div className={card+' space-y-2'} data-pro-payables-to-register><h3 className="font-semibold">{t('Órdenes de compra sin factura registrada','Purchase orders without a recorded bill')}</h3>
    <p className={'text-xs '+muted}>{t('Cuando el proveedor le entregue su factura, regístrela para que la orden pase a cuentas por pagar con su vencimiento.','When the supplier gives you the bill, record it so the order becomes payable with its due date.')}</p>
    <ul className="divide-y divide-[#eef2f6]">{page.toRegister.map(po=><li key={po.purchaseOrderId} data-pro-payables-po={po.purchaseOrderId} className="flex flex-wrap items-center justify-between gap-2 py-2">
     <div className="min-w-0"><p className="font-semibold">{po.reference} · {po.supplierName}</p><p className={'text-xs '+muted}>{po.title}{po.workTitle?' · '+po.workTitle:''} · {t('Emitida','Issued')} {day(po.issueDate)}</p></div>
     <div className="flex items-center gap-3"><span className="font-semibold tabular-nums">{money(po.totalCents)}</span><Button type="button" variant="secondary" className="min-h-11" data-pro-payables-register={po.purchaseOrderId} onClick={()=>{setNotice('');setDialog({kind:'register',po});}}>{t('Registrar factura','Record bill')}</Button></div></li>)}</ul></div>}
   <div className={card+' space-y-3'} data-pro-payables-bills aria-busy={loading}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{t('Facturas de proveedores y gastos','Supplier bills and expenses')}</h3><Button type="button" variant="outline" className="min-h-11" data-pro-payables-export onClick={billRows}>{t('Exportar CSV','Export CSV')}</Button></div>
    <div className="grid min-w-0 gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
     <Segmented name="status" label={t('Estado','Status')} value={status} onChange={setStatus} options={[['open',t('Con saldo','Open')],['paid',t('Pagadas','Paid')],['void',t('Anuladas','Void')],['all',t('Todas','All')]]}/>
     <label className="block min-w-0 text-sm font-semibold">{t('Proveedor','Supplier')}<select data-pro-payables-filter-supplier value={supplier} onChange={e=>setSupplier(e.target.value)} className={field}><option value="">{t('Todos los proveedores','All suppliers')}</option>{supplierOptions.map(([k,name])=><option key={k} value={k}>{name}</option>)}</select></label>
     <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" data-pro-payables-filter-overdue className="h-5 w-5 accent-[#008bb5]" checked={overdue} onChange={e=>setOverdue(e.target.checked)}/>{t('Solo vencidas','Overdue only')}</label>
    </div>
    {page.items.length===0?<p className={'text-sm '+muted+(loading?' opacity-60':'')} data-pro-payables-empty>{t('No hay facturas con estos filtros.','No bills match these filters.')}</p>:<ul className={'divide-y divide-[#eef2f6] transition-opacity '+(loading?'opacity-60':'')} data-pro-payables-list>{page.items.map(r=><li key={r.sourceKind+r.sourceId} data-pro-payable={r.sourceId} data-status={r.status} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
     <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-2"><span className="font-semibold">{r.supplierName}</span><StatusBadge status={r.status}/>{r.overdue&&<span data-pro-payable-overdue className="rounded-full bg-[#fde8e4] px-2 py-0.5 text-xs font-semibold text-[#8a2a1b]">{en?`Overdue ${r.daysOverdue} ${r.daysOverdue===1?'day':'days'}`:`Vencida hace ${r.daysOverdue} ${r.daysOverdue===1?'día':'días'}`}</span>}</p>
      <p className={'break-words text-sm '+muted}>{[payableKindLabel(r.sourceKind,en)+(r.reference?' '+r.reference:''),r.concept,r.billNumber?t('Factura ','Bill ')+r.billNumber:null,r.workTitle||null].filter(Boolean).join(' · ')}</p>
      <p className={'text-xs '+muted}>{t('Fecha','Date')} {day(r.docDate)} · {t('Vence','Due')} {day(r.dueDate)}{r.status==='void'&&r.voidReason?' · '+r.voidReason:''}</p>
     </div>
     <div className="flex flex-wrap items-center gap-2 sm:justify-end">
      <p className="mr-2 text-right"><span className="block font-semibold tabular-nums" data-pro-payable-balance>{money(r.status==='void'?0:r.balanceCents)}</span><span className={'block text-xs tabular-nums '+muted}>{t('de','of')} {money(r.amountCents)}</span></p>
      {(r.status==='pending'||r.status==='partial')&&<Button type="button" className="min-h-11" data-pro-payable-pay={r.sourceId} onClick={()=>{setNotice('');setDialog({kind:'pay',row:r});}}>{t('Registrar pago','Record payment')}</Button>}
      {r.status!=='void'&&<Button type="button" variant="secondary" className="min-h-11" data-pro-payable-bill={r.sourceId} onClick={()=>{setNotice('');setDialog({kind:'bill',row:r});}}>{t('Editar factura','Edit bill')}</Button>}
      {r.status!=='void'&&r.paidCents===0&&<Button type="button" variant="ghost" className="min-h-11" data-pro-payable-void={r.sourceId} onClick={()=>{setNotice('');setDialog({kind:'void',row:r});}}>{t('Anular','Void')}</Button>}
      {r.status==='void'&&r.billRevision>0&&<RestoreButton actor={actor} row={r} onDone={()=>done(t('Factura restaurada.','Bill restored.'))}/>}
     </div></li>)}</ul>}
    {page.truncated&&<p className={'text-xs '+muted}>{t('Se muestran las primeras 200 por vencimiento. Ajuste los filtros o exporte el CSV.','Showing the first 200 by due date. Narrow the filters or export the CSV.')}</p>}
    <p className={'text-xs '+muted}>{t('Registro interno: ContrataCR no hace pagos ni avisa al proveedor. Para revertir un pago, ábralo en Gastos u Órdenes de compra.','Internal record: ContrataCR does not pay or notify the supplier. To reverse a payment, open it in Expenses or Purchase orders.')}</p>
   </div>
   {dialog?.kind==='pay'&&<PayDialog actor={actor} row={dialog.row} today={page.today} onClose={()=>setDialog(null)} onDone={()=>done(t('Pago registrado.','Payment recorded.'))} onStale={()=>void load()}/>}
   {(dialog?.kind==='bill'||dialog?.kind==='register')&&<BillDialog actor={actor} dialog={dialog} today={page.today} onClose={()=>setDialog(null)} onDone={()=>done(t('Factura guardada.','Bill saved.'))} onStale={()=>void load()}/>}
   {dialog?.kind==='void'&&<VoidDialog actor={actor} row={dialog.row} onClose={()=>setDialog(null)} onDone={()=>done(t('Factura anulada.','Bill voided.'))} onStale={()=>void load()}/>}
  </div>;}}</States>;
}
function StatusBadge({status}:{status:PayableRow['status']}){
 const {en}=useText();
 const tone={pending:'bg-[#eef3f8] text-[#33475b]',partial:'bg-[#fff4e0] text-[#8a5a00]',paid:'bg-[#e6f6ee] text-[#1f6b45]',void:'bg-[#f1f1f1] text-[#5f6368] line-through'}[status];
 return <span data-pro-payable-status={status} className={'rounded-full px-2 py-0.5 text-xs font-semibold '+tone}>{payableStatusLabel(status,en)}</span>;
}
async function postPayable(actor:string,body:Record<string,unknown>){
 return fetch('/api/pro/payables',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':actor},body:JSON.stringify(body)});
}
function useSubmit(actor:string,onDone:()=>void,onStale:()=>void){
 const {t}=useText();const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const submit=async(body:Record<string,unknown>)=>{setBusy(true);setMessage('');
  try{const response=await postPayable(actor,body);
   if(response.ok){payableMutationResultSchema.parse(await response.json());onDone();return;}
   if(response.status===409){setMessage(t('Los datos cambiaron mientras tanto. Se actualizó la lista; revise y vuelva a intentarlo.','The data changed in the meantime. The list was refreshed; check it and try again.'));onStale();return;}
   setMessage(await errorText(response,t('No se pudo guardar. Revise los datos.','Could not save. Check the details.')));}
  catch{setMessage(t('No se pudo comprobar el guardado. Reintente: la misma operación no se registra dos veces.','Could not confirm the save. Retry: the same operation is never recorded twice.'));}
  finally{setBusy(false);}};
 return {busy,message,setMessage,submit};
}
const Footer=({busy,onClose,label,form}:{busy:boolean;onClose:()=>void;label:string;form:string})=>{const {t}=useText();return <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" className="min-h-11" onClick={onClose}>{t('Cancelar','Cancel')}</Button><Button type="submit" form={form} className="min-h-11" disabled={busy} data-pro-payable-submit>{busy?t('Guardando…','Saving…'):label}</Button></div>;};
const Message=({text}:{text:string})=>text?<p role="alert" data-pro-payable-error className="rounded-xl bg-[#fde8e4] px-3 py-2 text-sm text-[#8a2a1b]">{text}</p>:null;
function Summary({row}:{row:PayableRow}){const {t,money,en}=useText();return <div className="rounded-xl bg-[#f7f9fc] p-3 text-sm"><p className="font-semibold">{row.supplierName}</p><p className={muted}>{[payableKindLabel(row.sourceKind,en)+(row.reference?' '+row.reference:''),row.concept].filter(Boolean).join(' · ')}</p><p className="mt-1">{t('Saldo','Balance')}: <span className="font-semibold tabular-nums">{money(row.balanceCents)}</span> {t('de','of')} {money(row.amountCents)}</p></div>;}

function PayDialog({actor,row,today,onClose,onDone,onStale}:{actor:string;row:PayableRow;today:string;onClose:()=>void;onDone:()=>void;onStale:()=>void}){
 const {t,en}=useText();const actionId=useRef(crypto.randomUUID());
 const methods=row.sourceKind==='expense'?expensePayMethods:orderPayMethods;
 const [amount,setAmount]=useState((row.balanceCents/100).toFixed(2).replace(/\.00$/,'').replace('.',en?'.':',')),[paidOn,setPaidOn]=useState(today<row.docDate?row.docDate:today),[method,setMethod]=useState<string>('transfer'),[reference,setReference]=useState(''),[note,setNote]=useState('');
 const {busy,message,setMessage,submit}=useSubmit(actor,onDone,onStale);
 const edit=()=>{actionId.current=crypto.randomUUID();};
 return <Modal manageFocus open onClose={onClose} title={t('Registrar pago al proveedor','Record supplier payment')} ariaLabel={t('Registrar pago al proveedor','Record supplier payment')} closeLabel={t('Cerrar','Close')} mobilePresentation="sheet-compact" footer={<Footer busy={busy} onClose={onClose} form="pro-payable-pay" label={t('Registrar pago','Record payment')}/>}>
  <form id="pro-payable-pay" className="space-y-3" data-pro-payable-pay-form onSubmit={e=>{e.preventDefault();const cents=expenseCents(amount.replace(/[₡\s]/g,'').replace(en?/,/g:/\./g,''));
   if(cents===null){setMessage(t('Escriba un monto válido, por ejemplo 25000 o 25000,50.','Enter a valid amount, for example 25000 or 25000.50.'));return;}
   if(cents>row.balanceCents){setMessage(t('El pago supera el saldo pendiente.','The payment exceeds the open balance.'));return;}
   void submit({action:'pay',actionId:actionId.current,sourceKind:row.sourceKind,sourceId:row.sourceId,revision:row.billRevision,sourceRevision:row.sourceRevision,amountCents:cents,paidOn,method,reference:reference.trim()||null,note:note.trim()||null});}}>
   <Summary row={row}/>
   <label className="block text-sm font-semibold">{t('Monto (CRC)','Amount (CRC)')}<input inputMode="decimal" data-pro-payable-amount value={amount} onChange={e=>{setAmount(e.target.value);edit();}} className={field}/></label>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="block text-sm font-semibold">{t('Fecha del pago','Payment date')}<input type="date" data-pro-payable-date min={row.docDate} max={today} value={paidOn} onChange={e=>{setPaidOn(e.target.value);edit();}} className={field}/></label>
    <label className="block text-sm font-semibold">{t('Método','Method')}<select data-pro-payable-method value={method} onChange={e=>{setMethod(e.target.value);edit();}} className={field}>{methods.map(m=><option key={m} value={m}>{paymentMethodLabel(m,en)}</option>)}</select></label>
   </div>
   <label className="block text-sm font-semibold">{t('Referencia (opcional)','Reference (optional)')}<input maxLength={160} data-pro-payable-reference value={reference} onChange={e=>{setReference(e.target.value);edit();}} className={field}/></label>
   <label className="block text-sm font-semibold">{t('Nota (opcional)','Note (optional)')}<input maxLength={300} value={note} onChange={e=>{setNote(e.target.value);edit();}} className={field}/></label>
   <p className={'text-xs '+muted}>{t('Solo queda anotado: ContrataCR no mueve dinero.','It is only recorded: ContrataCR does not move money.')}</p>
   <Message text={message}/>
  </form></Modal>;
}
function BillDialog({actor,dialog,today,onClose,onDone,onStale}:{actor:string;dialog:{kind:'bill';row:PayableRow}|{kind:'register';po:PayablesPage['toRegister'][number]};today:string;onClose:()=>void;onDone:()=>void;onStale:()=>void}){
 const {t}=useText();const actionId=useRef(crypto.randomUUID());
 const row=dialog.kind==='bill'?dialog.row:null,po=dialog.kind==='register'?dialog.po:null;
 const order=po!==null||row?.sourceKind==='purchase_order';
 const plus30=(()=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+30);return d.toISOString().slice(0,10);})();
 const [number,setNumber]=useState(row?.billNumber??''),[billDate,setBillDate]=useState(row&&order?row.docDate:today),[dueDate,setDueDate]=useState(row&&order?row.dueDate:plus30),[note,setNote]=useState(row?.note??'');
 const {busy,message,setMessage,submit}=useSubmit(actor,onDone,onStale);
 const edit=()=>{actionId.current=crypto.randomUUID();};
 const minDate=po?.issueDate??(row&&order?undefined:undefined);
 return <Modal manageFocus open onClose={onClose} title={po?t('Registrar factura del proveedor','Record supplier bill'):t('Editar factura','Edit bill')} ariaLabel={po?t('Registrar factura del proveedor','Record supplier bill'):t('Editar factura','Edit bill')} closeLabel={t('Cerrar','Close')} mobilePresentation="sheet-compact" footer={<Footer busy={busy} onClose={onClose} form="pro-payable-bill" label={t('Guardar factura','Save bill')}/>}>
  <form id="pro-payable-bill" className="space-y-3" data-pro-payable-bill-form onSubmit={e=>{e.preventDefault();
   if(order&&(!billDate||(dueDate&&dueDate<billDate))){setMessage(t('El vencimiento no puede ser anterior a la fecha de la factura.','The due date cannot be before the bill date.'));return;}
   void submit({action:'save',actionId:actionId.current,sourceKind:po?'purchase_order':row!.sourceKind,sourceId:po?po.purchaseOrderId:row!.sourceId,revision:po?0:row!.billRevision,
    billNumber:number.trim()||null,billDate:order?billDate:null,dueDate:order?(dueDate||null):null,note:note.trim()||null});}}>
   {po?<div className="rounded-xl bg-[#f7f9fc] p-3 text-sm"><p className="font-semibold">{po.reference} · {po.supplierName}</p><p className={muted}>{po.title}</p></div>:<Summary row={row!}/>}
   <label className="block text-sm font-semibold">{t('Número de factura del proveedor (opcional)','Supplier bill number (optional)')}<input maxLength={60} data-pro-payable-bill-number value={number} onChange={e=>{setNumber(e.target.value);edit();}} className={field}/></label>
   {order?<div className="grid gap-3 sm:grid-cols-2">
    <label className="block text-sm font-semibold">{t('Fecha de la factura','Bill date')}<input type="date" required data-pro-payable-bill-date min={minDate} max={today} value={billDate} onChange={e=>{setBillDate(e.target.value);edit();}} className={field}/></label>
    <label className="block text-sm font-semibold">{t('Vence','Due date')}<input type="date" data-pro-payable-due-date min={billDate||undefined} value={dueDate} onChange={e=>{setDueDate(e.target.value);edit();}} className={field}/></label>
   </div>:<p className={'text-xs '+muted}>{t('La fecha y el vencimiento de un gasto se cambian en Gastos.','The date and due date of an expense are changed in Expenses.')}</p>}
   <label className="block text-sm font-semibold">{t('Nota (opcional)','Note (optional)')}<input maxLength={300} value={note} onChange={e=>{setNote(e.target.value);edit();}} className={field}/></label>
   <Message text={message}/>
  </form></Modal>;
}
function VoidDialog({actor,row,onClose,onDone,onStale}:{actor:string;row:PayableRow;onClose:()=>void;onDone:()=>void;onStale:()=>void}){
 const {t}=useText();const actionId=useRef(crypto.randomUUID());const [reason,setReason]=useState('');
 const {busy,message,setMessage,submit}=useSubmit(actor,onDone,onStale);
 return <Modal manageFocus open onClose={onClose} title={t('Anular factura','Void bill')} ariaLabel={t('Anular factura','Void bill')} closeLabel={t('Cerrar','Close')} mobilePresentation="sheet-compact" footer={<Footer busy={busy} onClose={onClose} form="pro-payable-void" label={t('Anular','Void')}/>}>
  <form id="pro-payable-void" className="space-y-3" data-pro-payable-void-form onSubmit={e=>{e.preventDefault();if(!reason.trim()){setMessage(t('Escriba el motivo.','Enter the reason.'));return;}
   void submit({action:'void',actionId:actionId.current,sourceKind:row.sourceKind,sourceId:row.sourceId,revision:row.billRevision,reason:reason.trim()});}}>
   <Summary row={row}/>
   <p className="text-sm">{t('Una factura anulada sale de las cuentas por pagar, del flujo de caja y del estado de resultados. Puede restaurarla después.','A voided bill leaves accounts payable, cash flow and the income statement. You can restore it later.')}</p>
   <label className="block text-sm font-semibold">{t('Motivo','Reason')}<input maxLength={300} data-pro-payable-void-reason value={reason} onChange={e=>{setReason(e.target.value);actionId.current=crypto.randomUUID();}} className={field}/></label>
   <Message text={message}/>
  </form></Modal>;
}
function RestoreButton({actor,row,onDone}:{actor:string;row:PayableRow;onDone:()=>void}){
 const {t}=useText();const actionId=useRef(crypto.randomUUID());const {busy,message,submit}=useSubmit(actor,onDone,()=>{});
 return <><Button type="button" variant="secondary" className="min-h-11" disabled={busy} data-pro-payable-restore={row.sourceId} onClick={()=>void submit({action:'restore',actionId:actionId.current,sourceKind:row.sourceKind,sourceId:row.sourceId,revision:row.billRevision})}>{t('Restaurar','Restore')}</Button>{message&&<span role="alert" className="text-xs text-[#8a2a1b]">{message}</span>}</>;
}

// ============================================================ Cash flow
function periodLabel(start:string,end:string,grain:string,en:boolean){
 const d=(v:string)=>new Date(v+'T12:00:00Z');const loc=en?'en-US':'es-CR';
 if(grain==='month')return new Intl.DateTimeFormat(loc,{month:'long',year:'numeric',timeZone:'UTC'}).format(d(start));
 if(grain==='quarter'){const q=Math.floor(d(start).getUTCMonth()/3)+1;return (en?'Q':'T')+q+' '+start.slice(0,4);}
 if(grain==='year')return start.slice(0,4);
 const f=new Intl.DateTimeFormat(loc,{day:'numeric',month:'short',timeZone:'UTC'});return f.format(d(start))+' – '+f.format(d(end));
}
function CashFlowView({actor,from,to}:{actor:string;from:string;to:string}){
 const {en,t,money,day}=useText();
 const [grain,setGrain]=useState<'month'|'week'>('month'),[opening,setOpening]=useState('');
 const range=useMemo(()=>from&&to?{from,to}:{...defaultCashWindow(crToday()),...(from?{from}:{}),...(to?{to}:{})},[from,to]);
 const url='/api/pro/cash-flow?'+new URLSearchParams({from:range.from,to:range.to,grain});
 const {data,error,denied,load}=useReport(actor,range.from<=range.to?url:null,cashFlowSchema);
 const openingCents=opening.trim()?expenseCents(opening.replace(/[₡\s]/g,'').replace(en?/,/g:/\./g,'').replace(/^-/,'')):0;
 const negative=/^\s*-/.test(opening),start=(openingCents??0)*(negative?-1:1);
 return <States denied={denied} error={error} data={data} load={()=>void load()}>{()=>{const cf=data as CashFlow;
  const exportRows=()=>download(`flujo-de-caja-${cf.from}-${cf.to}.csv`,[[t('Desde','From'),t('Hasta','To'),t('Entradas reales','Actual in'),t('Entradas esperadas','Expected in'),t('Salidas reales','Actual out'),t('Salidas esperadas','Expected out'),t('Vencido por cobrar','Overdue receivable'),t('Vencido por pagar','Overdue payable'),t('Neto','Net'),t('Saldo acumulado','Running balance')],
   ...cf.periods.map(p=>[p.start,p.end,csvAmount(p.actualInCents),csvAmount(p.expectedInCents),csvAmount(p.actualOutCents),csvAmount(p.expectedOutCents),csvAmount(p.overdueInCents),csvAmount(p.overdueOutCents),csvAmount(p.netCents),csvAmount(start+p.cumulativeCents)]),
   [t('Total','Total'),null,csvAmount(cf.totals.actualInCents),csvAmount(cf.totals.expectedInCents),csvAmount(cf.totals.actualOutCents),csvAmount(cf.totals.expectedOutCents),null,null,csvAmount(cf.totals.netCents),csvAmount(start+cf.totals.netCents)]]);
  return <div className="space-y-4" data-pro-cashflow>
   <div className="flex flex-wrap items-end justify-between gap-3">
    <Segmented name="grain" label={t('Agrupar por','Group by')} value={grain} onChange={setGrain} options={[['month',t('Mes','Month')],['week',t('Semana','Week')]]}/>
    <div className="flex flex-wrap items-end gap-2"><label className="block w-56 max-w-full text-sm font-semibold">{t('Saldo inicial (opcional)','Opening balance (optional)')}<input inputMode="decimal" data-pro-cashflow-opening placeholder="₡0" value={opening} onChange={e=>setOpening(e.target.value)} className={field}/></label>
     <Button type="button" variant="outline" className="min-h-11" data-pro-cashflow-export onClick={exportRows}>{t('Exportar CSV','Export CSV')}</Button></div>
   </div>
   <p className={'text-xs '+muted}>{t('Período','Period')}: {day(cf.from)} – {day(cf.to)}{!from&&!to?' · '+t('sin fechas elegidas se muestra del mes anterior a tres meses adelante','with no dates chosen it shows the previous month to three months ahead'):''}</p>
   <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <Tile data="data-pro-cashflow-in" label={t('Entradas','Money in')} value={money(cf.totals.actualInCents+cf.totals.expectedInCents)} note={t('Reales ','Actual ')+money(cf.totals.actualInCents)+' · '+t('esperadas ','expected ')+money(cf.totals.expectedInCents)}/>
    <Tile data="data-pro-cashflow-out" label={t('Salidas','Money out')} value={money(cf.totals.actualOutCents+cf.totals.expectedOutCents)} note={t('Reales ','Actual ')+money(cf.totals.actualOutCents)+' · '+t('esperadas ','expected ')+money(cf.totals.expectedOutCents)}/>
    <Tile data="data-pro-cashflow-net" label={t('Saldo al final del período','Balance at period end')} value={money(start+cf.totals.netCents)} note={start?t('Incluye el saldo inicial de ','Includes the opening balance of ')+money(start):t('Neto del período, sin saldo inicial','Net of the period, without an opening balance')}/>
    <Tile data="data-pro-cashflow-overdue" tone={cf.overdue.inCents+cf.overdue.outCents>0?'alert':undefined} label={t('Vencido a hoy','Overdue today')} value={money(cf.overdue.inCents)+' / '+money(cf.overdue.outCents)} note={t('Por cobrar / por pagar','Receivable / payable')}/>
   </div>
   <div className={card+' overflow-x-auto'}>
    <table data-pro-cashflow-periods className="w-full min-w-[46rem] text-left text-sm"><thead><tr className={muted}><th className="py-2 pr-3 font-semibold">{t('Período','Period')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Entradas reales','Actual in')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Entradas esperadas','Expected in')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Salidas reales','Actual out')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Salidas esperadas','Expected out')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Neto','Net')}</th><th className="py-2 text-right font-semibold">{t('Saldo acumulado','Running balance')}</th></tr></thead>
     <tbody>{cf.periods.map(p=>{const running=start+p.cumulativeCents;return <tr key={p.start} data-pro-cashflow-period={p.start} data-current={p.current?'1':undefined} className={'border-t border-[#eef2f6] '+(p.current?'bg-[#f0f9fc]':'')}>
      <td className="py-2 pr-3"><span className="font-semibold">{periodLabel(p.start,p.end,cf.grain,en)}</span>{p.current&&<span className="ml-2 rounded-full bg-[#dff3fa] px-2 py-0.5 text-xs font-semibold text-[#006f91]">{t('Actual','Current')}</span>}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{money(p.actualInCents)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{money(p.expectedInCents)}{p.overdueInCents>0&&<span data-pro-cashflow-overdue-in className="block text-xs font-semibold text-[#8a2a1b]">{t('incluye ','incl. ')+money(p.overdueInCents)+t(' vencido',' overdue')}</span>}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{money(p.actualOutCents)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{money(p.expectedOutCents)}{p.overdueOutCents>0&&<span data-pro-cashflow-overdue-out className="block text-xs font-semibold text-[#8a2a1b]">{t('incluye ','incl. ')+money(p.overdueOutCents)+t(' vencido',' overdue')}</span>}</td>
      <td className={'py-2 pr-3 text-right font-semibold tabular-nums '+(p.netCents<0?'text-[#8a2a1b]':'')}>{money(p.netCents)}</td>
      <td className={'py-2 text-right font-semibold tabular-nums '+(running<0?'text-[#8a2a1b]':'')} data-pro-cashflow-running>{money(running)}</td></tr>;})}</tbody></table>
   </div>
   <div className={card+' space-y-2'} data-pro-cashflow-overdue-list><h3 className="font-semibold">{t('Vencido a hoy','Overdue today')}</h3>
    {cf.overdue.items.length===0?<p className={'text-sm '+muted}>{t('No hay cobros ni pagos vencidos.','Nothing overdue to collect or pay.')}</p>:<ul className="divide-y divide-[#eef2f6]">{cf.overdue.items.map(i=><li key={i.direction+i.kind+i.id} data-pro-cashflow-overdue-item={i.kind} className="flex flex-wrap items-center justify-between gap-2 py-2">
     <div className="min-w-0"><p className="flex flex-wrap items-center gap-2"><span className={'rounded-full px-2 py-0.5 text-xs font-semibold '+(i.direction==='in'?'bg-[#e6f6ee] text-[#1f6b45]':'bg-[#fde8e4] text-[#8a2a1b]')}>{i.direction==='in'?t('Por cobrar','Receivable'):t('Por pagar','Payable')}</span><span className="font-semibold">{i.kind==='installment'?t('Cuota ','Installment ')+i.label:i.label||payableKindLabel(i.kind,en)}</span></p>
      <p className={'text-xs '+muted}>{[payableKindLabel(i.kind,en),i.party,i.workTitle].filter(Boolean).join(' · ')} · {t('Venció','Due')} {day(i.dueDate)} ({en?`${i.daysOverdue} ${i.daysOverdue===1?'day':'days'} ago`:`hace ${i.daysOverdue} ${i.daysOverdue===1?'día':'días'}`})</p></div>
     <span className="font-semibold tabular-nums text-[#8a2a1b]">{money(i.amountCents)}</span></li>)}</ul>}
    {cf.overdue.count>cf.overdue.items.length&&<p className={'text-xs '+muted}>{t('Se muestran los 100 más antiguos.','Showing the 100 oldest.')}</p>}
   </div>
   <p className={'text-xs '+muted} data-pro-cashflow-basis>{t('Entradas reales: pagos recibidos. Esperadas: saldos de facturas por su vencimiento (fecha prevista más días de crédito) y cuotas de planes de pago. Salidas reales: pagos a proveedores y devoluciones a clientes. Esperadas: cuentas por pagar por su vencimiento. Lo vencido se cuenta hoy. Es una proyección de gestión, no un estado bancario.','Actual in: payments received. Expected: invoice balances by due date (planned date plus credit days) and payment-plan installments. Actual out: supplier payments and customer refunds. Expected: payables by due date. Overdue items are counted today. This is a management projection, not a bank statement.')}
    {cf.totals.undatedInCents>0?' '+t('Hay ','There are ')+money(cf.totals.undatedInCents)+t(' en cuotas sin fecha (esperan un hito o una tarea) que no se incluyen.',' in installments without a date (waiting for a key date or a task) that are not included.'):''}</p>
  </div>;}}</States>;
}

// ============================================================ Income statement
function IncomeView({actor,from,to}:{actor:string;from:string;to:string}){
 const {en,t,money,day}=useText();
 const [grain,setGrain]=useState<'month'|'quarter'|'year'>('month');
 const range=useMemo(()=>from&&to?{from,to}:{...defaultIncomeWindow(crToday()),...(from?{from}:{}),...(to?{to}:{})},[from,to]);
 const url='/api/pro/income-statement?'+new URLSearchParams({from:range.from,to:range.to,grain});
 const {data,error,denied,load}=useReport(actor,range.from<=range.to?url:null,incomeStatementSchema);
 const margin=(income:number,result:number)=>income>0?(Math.round(result*1000/income)/10).toLocaleString(en?'en-US':'es-CR')+(en?'%':' %'):'—';
 const category=(c:string)=>c==='uncategorized'?t('Sin categoría','Uncategorized'):expenseCategoryLabel(c,en);
 return <States denied={denied} error={error} data={data} load={()=>void load()}>{()=>{const is=data as IncomeStatement;const tot=is.totals;
  const exportRows=()=>download(`estado-de-resultados-${is.from}-${is.to}.csv`,[[t('Reporte de gestión, no es una declaración de impuestos','Management report, not a tax filing')],[t('Desde','From'),is.from],[t('Hasta','To'),is.to],[],
   [t('Concepto','Item'),t('Monto (CRC)','Amount (CRC)')],[t('Ingresos facturados sin IVA','Invoiced income before VAT'),csvAmount(tot.incomeCents)],[t('Gastos sin IVA','Expenses before VAT'),csvAmount(tot.expensesCents)],
   ...is.categories.map(c=>['  '+category(c.category),csvAmount(c.cents)]),[t('Horas registradas (costo interno)','Recorded hours (internal cost)'),csvAmount(tot.laborCents)],[t('Facturas de órdenes de compra sin impuesto','Purchase-order bills before tax'),csvAmount(tot.purchaseBillsCents)],
   [t('Total de costos','Total costs'),csvAmount(tot.costCents)],[t('Resultado','Result'),csvAmount(tot.resultCents)],[t('Cobrado en el período (informativo)','Collected in the period (informational)'),csvAmount(tot.collectedCents)],[],
   [t('Período','Period'),t('Desde','From'),t('Hasta','To'),t('Ingresos','Income'),t('Costos','Costs'),t('Resultado','Result')],...is.periods.map(p=>[periodLabel(p.start,p.end,is.grain,en),p.start,p.end,csvAmount(p.incomeCents),csvAmount(p.costCents),csvAmount(p.resultCents)]),[],
   [t('Trabajo','Job'),t('Cliente','Customer'),t('Ingresos','Income'),t('Gastos','Expenses'),t('Horas','Hours'),t('Órdenes de compra','Purchase orders'),t('Resultado','Result')],
   ...is.jobs.map(j=>[j.workId===null?t('Sin trabajo asignado','No job assigned'):j.service,j.client,csvAmount(j.incomeCents),csvAmount(j.expensesCents),csvAmount(j.laborCents),csvAmount(j.purchaseBillsCents),csvAmount(j.resultCents)])]);
  const line=(label:ReactNode,value:number,opts:{strong?:boolean;indent?:boolean;data?:string;minus?:boolean}={})=><div className={'flex items-baseline justify-between gap-3 py-1.5 '+(opts.strong?'border-t border-[#d7e1ea] pt-2 font-semibold':'')+(opts.indent?' pl-4 text-sm '+muted:'')} {...(opts.data?{[opts.data]:''}:{})}><span className="min-w-0">{label}</span><span className={'shrink-0 whitespace-nowrap tabular-nums '+(value<0&&opts.strong?'text-[#8a2a1b]':'')}>{opts.minus&&value>0?'−'+money(value).replace(/^−/,''):money(value)}</span></div>;
  return <div className="space-y-4" data-pro-income>
   <div className="flex flex-wrap items-end justify-between gap-3"><Segmented name="grain" label={t('Agrupar por','Group by')} value={grain} onChange={setGrain} options={[['month',t('Mes','Month')],['quarter',t('Trimestre','Quarter')],['year',t('Año','Year')]]}/>
    <Button type="button" variant="outline" className="min-h-11" data-pro-income-export onClick={exportRows}>{t('Exportar CSV','Export CSV')}</Button></div>
   <p role="note" data-pro-income-disclaimer className="rounded-xl border border-[#f3dfb5] bg-[#fffaf0] px-3 py-2 text-sm text-[#6b4e00]">{t('Reporte de gestión para su negocio. No es una declaración de impuestos ni un estado financiero contable: revise las cifras con su contador.','Management report for your business. It is not a tax filing or an accounting financial statement: review the figures with your accountant.')}</p>
   <p className={'text-xs '+muted}>{t('Período','Period')}: {day(is.from)} – {day(is.to)}{!from&&!to?' · '+t('sin fechas elegidas se muestra el año en curso','with no dates chosen it shows the current year'):''}</p>
   <div className="grid min-w-0 gap-3 sm:grid-cols-3">
    <Tile data="data-pro-income-income" label={t('Ingresos sin IVA','Income before VAT')} value={money(tot.incomeCents)} note={t('Cobrado: ','Collected: ')+money(tot.collectedCents)}/>
    <Tile data="data-pro-income-costs" label={t('Costos','Costs')} value={money(tot.costCents)}/>
    <Tile data="data-pro-income-result" tone={tot.resultCents<0?'alert':undefined} label={t('Resultado','Result')} value={money(tot.resultCents)} note={t('Margen ','Margin ')+margin(tot.incomeCents,tot.resultCents)}/>
   </div>
   <div className={card} data-pro-income-statement><h3 className="font-semibold">{t('Estado de resultados','Income statement')}</h3>
    <div className="mt-2">
     {line(t('Ingresos facturados (sin IVA)','Invoiced income (before VAT)'),tot.incomeCents,{data:'data-pro-income-line-income'})}
     {line(t('Gastos (sin IVA cuando se conoce la tarifa)','Expenses (before VAT when the rate is known)'),tot.expensesCents,{minus:true,data:'data-pro-income-line-expenses'})}
     {is.categories.map(c=><div key={c.category}>{line(category(c.category),c.cents,{indent:true})}</div>)}
     {line(t('Horas registradas (costo interno)','Recorded hours (internal cost)'),tot.laborCents,{minus:true})}
     {line(t('Facturas de órdenes de compra (sin impuesto)','Purchase-order bills (before tax)'),tot.purchaseBillsCents,{minus:true})}
     {line(t('Resultado','Result'),tot.resultCents,{strong:true,data:'data-pro-income-line-result'})}
     {line(t('Cobrado en el período (informativo, no suma)','Collected in the period (informational, not added)'),tot.collectedCents,{indent:true})}
    </div>
    {is.taxUnknownInvoices>0&&<p className={'mt-2 text-xs '+muted}>{proCount(is.taxUnknownInvoices,en,['factura sin IVA definido se cuenta completa','facturas sin IVA definido se cuentan completas'],['invoice without a defined VAT is counted in full','invoices without a defined VAT are counted in full'])}.</p>}
   </div>
   <div className={card+' overflow-x-auto'}><h3 className="font-semibold">{t('Por período','By period')}</h3>
    <table data-pro-income-periods className="mt-2 w-full min-w-[32rem] text-left text-sm"><thead><tr className={muted}><th className="py-2 pr-3 font-semibold">{t('Período','Period')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Ingresos','Income')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Costos','Costs')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Resultado','Result')}</th><th className="py-2 text-right font-semibold">{t('Margen','Margin')}</th></tr></thead>
     <tbody>{is.periods.map(p=><tr key={p.start} data-pro-income-period={p.start} className="border-t border-[#eef2f6]"><td className="py-2 pr-3 font-semibold">{periodLabel(p.start,p.end,is.grain,en)}</td><td className="py-2 pr-3 text-right tabular-nums">{money(p.incomeCents)}</td><td className="py-2 pr-3 text-right tabular-nums">{money(p.costCents)}</td><td className={'py-2 pr-3 text-right font-semibold tabular-nums '+(p.resultCents<0?'text-[#8a2a1b]':'')}>{money(p.resultCents)}</td><td className="py-2 text-right tabular-nums">{margin(p.incomeCents,p.resultCents)}</td></tr>)}</tbody></table></div>
   <div className={card+' overflow-x-auto'}><h3 className="font-semibold">{t('Por trabajo','By job')}</h3>
    {is.jobs.length===0?<p className={'mt-2 text-sm '+muted}>{t('No hay ingresos ni costos en este período.','No income or costs in this period.')}</p>:<table data-pro-income-jobs className="mt-2 w-full min-w-[44rem] text-left text-sm"><thead><tr className={muted}><th className="py-2 pr-3 font-semibold">{t('Trabajo','Job')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Ingresos','Income')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Gastos','Expenses')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Horas','Hours')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Órdenes de compra','Purchase orders')}</th><th className="py-2 text-right font-semibold">{t('Resultado','Result')}</th></tr></thead>
     <tbody>{is.jobs.map(j=><tr key={j.workId??'none'} data-pro-income-job={j.workId??'none'} className="border-t border-[#eef2f6]"><td className="py-2 pr-3"><span className="font-semibold">{j.workId===null?t('Sin trabajo asignado','No job assigned'):j.service||t('Trabajo','Job')}</span>{j.client&&<span className={'block text-xs '+muted}>{j.client}</span>}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{money(j.incomeCents)}</td><td className="py-2 pr-3 text-right tabular-nums">{money(j.expensesCents)}</td><td className="py-2 pr-3 text-right tabular-nums">{money(j.laborCents)}</td><td className="py-2 pr-3 text-right tabular-nums">{money(j.purchaseBillsCents)}</td>
      <td className={'py-2 text-right font-semibold tabular-nums '+(j.resultCents<0?'text-[#8a2a1b]':'')}>{money(j.resultCents)}</td></tr>)}</tbody></table>}
    {is.jobsTruncated&&<p className={'mt-2 text-xs '+muted}>{t('Se muestran 200 trabajos.','Showing 200 jobs.')}</p>}
   </div>
   <p className={'text-xs '+muted} data-pro-income-basis>{t('Ingresos: borradores de factura (no archivados) por su fecha de creación, sin IVA. Costos: gastos por su fecha (sin IVA cuando se conoce la tarifa; los anulados no cuentan), costo interno de las horas registradas y facturas de órdenes de compra por su fecha. Si registra la misma compra como gasto y como factura de una orden, se cuenta dos veces.','Income: invoice drafts (not archived) by creation date, before VAT. Costs: expenses by date (before VAT when the rate is known; voided ones do not count), internal cost of recorded hours and purchase-order bills by their date. If you record the same purchase as an expense and as an order bill, it is counted twice.')}</p>
  </div>;}}</States>;
}
