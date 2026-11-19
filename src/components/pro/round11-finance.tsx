'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {proCount} from '@/lib/pro/plural';
import {proCsv,csvAmount} from '@/lib/pro/reports';
import {financeReportSchema,paymentMethodLabel,poLinesFromSources,poSourcesSchema,vatRowLabel,type FinanceReport,type PoSourceLine,type PoSources} from '@/lib/pro/round11';

/**
 * Round 11 (rows 23, 55): accounting reports — receivables aging per customer, payments received and the
 * IVA summary per rate — with CSV for Excel. Same period as the other reports. Read-only.
 */
export type FinanceTab='customers'|'payments'|'vat';
const tile='min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-4';
function download(name:string,rows:(string|number|null)[][]){
 const url=URL.createObjectURL(new Blob([proCsv(rows)],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function FinanceReportTabs({actor,tab,from,to}:{actor:string;tab:FinanceTab;from:string;to:string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,money=(cents:number)=>proMoney(cents/100,en);
 const [data,setData]=useState<FinanceReport|null>(null),[error,setError]=useState(false),[denied,setDenied]=useState(false),[loading,setLoading]=useState(true),sequence=useRef(0);
 const load=useCallback(async()=>{const n=++sequence.current;setLoading(true);setError(false);
  try{const query=new URLSearchParams();if(from)query.set('from',from);if(to)query.set('to',to);
   const response=await fetch('/api/pro/finance-reports'+(query.size?'?'+query:''),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(response.status===403){if(n===sequence.current)setDenied(true);return;}if(!response.ok)throw Error();
   const body=financeReportSchema.parse(await response.json());if(n===sequence.current)setData(body);}
  catch{if(n===sequence.current)setError(true);}finally{if(n===sequence.current)setLoading(false);}},[actor,from,to]);
 useEffect(()=>{const counter=sequence;const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);counter.current++;};},[load]);
 const day=(value:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
 // Fix 13: financial reports are for the owner, Administrator and Manager.
 if(denied)return <p role="status" data-pro-report-denied className="text-sm text-[#52627a]">{t('Su rol en esta empresa no permite ver reportes financieros. Pídale acceso a un Administrador.','Your role in this company does not allow financial reports. Ask an Administrator for access.')}</p>;
 if(error)return <div role="alert" className="space-y-2 text-sm"><p>{t('No se pudo cargar el reporte.','Could not load the report.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!data)return <p role="status" className="text-sm text-[#52627a]">{t('Cargando reporte…','Loading report…')}</p>;
 const stamp=data.today;
 if(tab==='customers'){
  const exportRows=()=>download(`cuentas-por-cobrar-${stamp}.csv`,[[t('Cliente','Customer'),t('Pendiente total','Total outstanding'),'0-30','31-60','61-90',t('Más de 90 días','Over 90 days'),t('Facturas con saldo','Open invoices'),t('Días de la más antigua','Oldest (days)')],
   ...data.customers.map(c=>[c.clientName||c.clientId,csvAmount(c.openCents),csvAmount(c.d0_30),csvAmount(c.d31_60),csvAmount(c.d61_90),csvAmount(c.d90_plus),c.openInvoices,c.oldestDays])]);
  const total=data.customers.reduce((sum,c)=>sum+c.openCents,0);
  return <div data-pro-report-customers className="space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-[#52627a]">{t('Saldo de cada borrador de factura después de pagos y notas de crédito aplicados (el mismo del borrador), por antigüedad desde su fecha. El saldo del trabajo y el estado de cuenta usan otro criterio: importe acordado menos abonos, por eso pueden diferir.','Each invoice draft balance after payments and credit notes applied (the same as the draft), by age from its date. The job balance and the customer statement use another basis (agreed amount minus payments), so they can differ.')}</p>
    <Button type="button" variant="outline" className="min-h-11" data-pro-report-export-customers disabled={loading} onClick={exportRows}>{t('Exportar CSV','Export CSV')}</Button></div>
   <div className={tile+' overflow-x-auto'}>{data.customers.length===0?<p className="text-sm text-[#52627a]">{t('No hay saldos pendientes en este período.','No outstanding balances in this period.')}</p>:
    <table className="w-full min-w-[40rem] text-left text-sm"><thead><tr className="text-[#52627a]"><th className="py-2 pr-3 font-semibold">{t('Cliente','Customer')}</th><th className="py-2 pr-3 text-right font-semibold">0–30</th><th className="py-2 pr-3 text-right font-semibold">31–60</th><th className="py-2 pr-3 text-right font-semibold">61–90</th><th className="py-2 pr-3 text-right font-semibold">{t('Más de 90 días','Over 90 days')}</th><th className="py-2 text-right font-semibold">{t('Total','Total')}</th></tr></thead>
     <tbody>{data.customers.map(c=><tr key={c.clientId} data-pro-report-customer={c.clientId} className="border-t border-[#eef2f6]"><td className="py-2 pr-3"><span className="font-semibold">{c.clientName||t('Cliente','Customer')}</span><span className="block text-xs text-[#52627a]">{proCount(c.openInvoices,en,['borrador con saldo','borradores con saldo'],['open invoice draft','open invoice drafts'])}</span></td>
      <td className="py-2 pr-3 text-right tabular-nums">{money(c.d0_30)}</td><td className="py-2 pr-3 text-right tabular-nums">{money(c.d31_60)}</td><td className="py-2 pr-3 text-right tabular-nums">{money(c.d61_90)}</td><td className={'py-2 pr-3 text-right tabular-nums '+(c.d90_plus>0?'text-[#8a2a1b]':'')}>{money(c.d90_plus)}</td><td className="py-2 text-right font-semibold tabular-nums">{money(c.openCents)}</td></tr>)}
      <tr className="border-t-2 border-[#d7e1ea] font-semibold"><td className="py-2 pr-3">{t('Total','Total')}</td><td colSpan={4}/><td className="py-2 text-right tabular-nums" data-pro-report-customers-total>{money(total)}</td></tr></tbody></table>}</div>
  </div>;
 }
 if(tab==='payments'){
  const exportRows=()=>download(`pagos-recibidos-${stamp}.csv`,[[t('Fecha','Date'),t('Cliente','Customer'),t('Trabajo','Job'),t('Método','Method'),t('Referencia','Reference'),t('Monto (CRC)','Amount (CRC)'),t('Revertido','Reversed')],
   ...data.payments.map(p=>[p.receivedOn,p.clientName,p.workTitle,paymentMethodLabel(p.method,en),p.reference,csvAmount(p.amountCents),p.reversed?t('Sí','Yes'):t('No','No')])]);
  return <div data-pro-report-payments className="space-y-3">
   <div className="grid min-w-0 gap-3 sm:grid-cols-3">
    <div className={tile}><p className="text-sm text-[#52627a]">{t('Cobrado (sin revertidos)','Collected (excluding reversed)')}</p><p className="text-xl font-bold" data-pro-report-payments-collected>{money(data.paymentTotals.collectedCents)}</p><p className="text-xs text-[#52627a]">{proCount(data.paymentTotals.count,en,['pago','pagos'],['payment','payments'])}</p></div>
    <div className={tile}><p className="text-sm text-[#52627a]">{t('Pagos revertidos','Reversed payments')}</p><p className="text-xl font-bold">{money(data.paymentTotals.reversedCents)}</p></div>
    <div className={tile}><p className="text-sm text-[#52627a]">{t('Reembolsos registrados','Refunds recorded')}</p><p className="text-xl font-bold">{money(data.paymentTotals.refundedCents)}</p></div>
   </div>
   <div className="flex justify-end"><Button type="button" variant="outline" className="min-h-11" data-pro-report-export-payments onClick={exportRows}>{t('Exportar CSV','Export CSV')}</Button></div>
   <div className={tile+' overflow-x-auto'}>{data.payments.length===0?<p className="text-sm text-[#52627a]">{t('No hay pagos en este período.','No payments in this period.')}</p>:
    <table className="w-full min-w-[36rem] text-left text-sm"><thead><tr className="text-[#52627a]"><th className="py-2 pr-3 font-semibold">{t('Fecha','Date')}</th><th className="py-2 pr-3 font-semibold">{t('Cliente y trabajo','Customer and job')}</th><th className="py-2 pr-3 font-semibold">{t('Método','Method')}</th><th className="py-2 text-right font-semibold">{t('Monto','Amount')}</th></tr></thead>
     <tbody>{data.payments.map(p=><tr key={p.id} data-pro-report-payment={p.id} className="border-t border-[#eef2f6]"><td className="py-2 pr-3 whitespace-nowrap">{day(p.receivedOn)}</td><td className="py-2 pr-3"><span className="font-semibold">{p.clientName||'—'}</span>{p.workTitle&&<span className="block text-xs text-[#52627a]">{p.workTitle}</span>}</td><td className="py-2 pr-3">{paymentMethodLabel(p.method,en)}{p.reference&&<span className="block text-xs text-[#52627a] break-all">{p.reference}</span>}</td>
      <td className={'py-2 text-right tabular-nums '+(p.reversed?'text-[#52627a] line-through':'font-semibold')}>{money(p.amountCents)}{p.reversed&&<span className="sr-only"> {t('(revertido)','(reversed)')}</span>}</td></tr>)}</tbody></table>}
    {data.paymentsTruncated&&<p className="mt-2 text-xs text-[#52627a]">{t('Se muestran los 500 pagos más recientes del período.','Showing the 500 most recent payments of the period.')}</p>}</div>
  </div>;
 }
 const exportRows=()=>download(`resumen-iva-${stamp}.csv`,[[t('Tarifa','Rate'),t('Base (CRC)','Base (CRC)'),t('IVA (CRC)','VAT (CRC)'),t('Exonerado (CRC)','Exonerated (CRC)'),t('Líneas','Lines')],...data.vat.map(v=>[vatRowLabel(v,en),csvAmount(v.baseCents),csvAmount(v.taxCents),csvAmount(v.exoneratedCents),v.lines]),[t('Total','Total'),csvAmount(data.vatTotals.baseCents),csvAmount(data.vatTotals.taxCents),csvAmount(data.vatTotals.exoneratedCents),null]]);
 return <div data-pro-report-vat className="space-y-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-[#52627a]">{t('IVA de los borradores de factura del período por tarifa (13 %, 4 %, 2 %, 1 %, 0 %, exento). Es un resumen interno para su declaración: no sustituye la información de Hacienda.','VAT of the period’s invoice drafts by rate (13%, 4%, 2%, 1%, 0%, exempt). An internal summary for your return: it does not replace the tax authority’s records.')}</p>
   <Button type="button" variant="outline" className="min-h-11" data-pro-report-export-vat onClick={exportRows}>{t('Exportar CSV','Export CSV')}</Button></div>
  <div className={tile+' overflow-x-auto'}>{data.vat.length===0?<p className="text-sm text-[#52627a]">{t('No hay borradores de factura en este período.','No invoice drafts in this period.')}</p>:
   <table className="w-full min-w-[30rem] text-left text-sm"><thead><tr className="text-[#52627a]"><th className="py-2 pr-3 font-semibold">{t('Tarifa','Rate')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Base','Base')}</th><th className="py-2 pr-3 text-right font-semibold">{t('IVA','VAT')}</th><th className="py-2 text-right font-semibold">{t('Exonerado','Exonerated')}</th></tr></thead>
    <tbody>{data.vat.map(v=><tr key={v.treatment+':'+v.ratePercent} data-pro-report-vat-row={v.treatment+':'+(v.ratePercent??'')} className="border-t border-[#eef2f6]"><td className="py-2 pr-3">{vatRowLabel(v,en)}<span className="block text-xs text-[#52627a]">{proCount(v.lines,en,v.treatment==='source'?['factura','facturas']:['línea','líneas'],v.treatment==='source'?['invoice','invoices']:['line','lines'])}</span></td><td className="py-2 pr-3 text-right tabular-nums">{money(v.baseCents)}</td><td className="py-2 pr-3 text-right font-semibold tabular-nums">{money(v.taxCents)}</td><td className="py-2 text-right tabular-nums">{money(v.exoneratedCents)}</td></tr>)}
     <tr className="border-t-2 border-[#d7e1ea] font-semibold"><td className="py-2 pr-3">{t('Total','Total')}</td><td className="py-2 pr-3 text-right tabular-nums">{money(data.vatTotals.baseCents)}</td><td className="py-2 pr-3 text-right tabular-nums" data-pro-report-vat-total>{money(data.vatTotals.taxCents)}</td><td className="py-2 text-right tabular-nums">{money(data.vatTotals.exoneratedCents)}</td></tr></tbody></table>}</div>
  <p className="text-xs text-[#52627a]">{t('Mismo cálculo que el borrador: base = cantidad × precio − descuento, más los impuestos específicos que forman base del IVA; el IVA de cada borrador coincide con su total. Los impuestos específicos y otros cargos no son IVA y no se suman aquí.','Same calculation as the draft: base = quantity × price − discount, plus the specific taxes that are part of the VAT base; each draft’s VAT matches its total. Specific taxes and other charges are not VAT and are not added here.')}</p>
 </div>;
}

/**
 * Round 11 (rows 51, 62): choose accepted quote lines, approved selections or budget codes of the job and
 * open the usual new-order form with those lines. The supplier price is the internal unit cost when the
 * owner recorded it (never the customer price); otherwise it stays empty to fill in.
 */
export function PoFromSources({actor,workId,disabled,onUse,onCancel}:{actor:string;workId:string;disabled:boolean;onUse:(lines:PoSourceLine[])=>void;onCancel:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,money=(cents:number|null)=>cents===null?t('sin costo interno','no internal cost'):proMoney(cents/100,en);
 const [data,setData]=useState<PoSources|null>(null),[error,setError]=useState(false),[picked,setPicked]=useState<Set<string>>(new Set());
 const load=useCallback(async()=>{setError(false);try{const response=await fetch('/api/pro/purchase-order-sources?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!response.ok)throw Error();setData(poSourcesSchema.parse(await response.json()));}catch{setError(true);}},[actor,workId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const toggle=(key:string)=>setPicked(old=>{const next=new Set(old);if(next.has(key))next.delete(key);else next.add(key);return next;});
 const box='mt-1 h-5 w-5 shrink-0 accent-[#008bb5]';
 const row='flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[#d7e1ea] bg-white p-3 text-sm';
 return <section data-po-from-sources className="space-y-4 rounded-2xl border border-[#d7e1ea] bg-[#f7f9fc] p-4">
  <div><h4 className="font-bold text-[#162543]">{t('Crear orden desde el trabajo','Create order from the job')}</h4><p className="text-sm text-[#52627a]">{t('Marque lo que desea pedir. Se abre el formulario de siempre con esas líneas; el precio del proveedor es su costo interno cuando lo registró.','Check what you want to order. The usual form opens with those lines; the supplier price is your internal cost when you recorded it.')}</p></div>
  {error?<div role="alert" className="space-y-2 text-sm"><p>{t('No se pudieron cargar la cotización, las selecciones ni el presupuesto.','Could not load the quote, selections or budget.')}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>
  :!data?<p role="status" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>:<>
   <fieldset className="space-y-2"><legend className="font-semibold">{t('Cotización aceptada','Accepted quote')}{data.quoteTitle?` · ${data.quoteTitle}`:''}</legend>
    {data.quoteLines.length===0?<p className="text-sm text-[#52627a]">{t('Este trabajo no tiene una cotización aceptada con líneas.','This job has no accepted quote with lines.')}</p>:data.quoteLines.map(line=><label key={line.key} className={row}><input type="checkbox" className={box} data-po-source={line.key} checked={picked.has(line.key)} disabled={disabled} onChange={()=>toggle(line.key)}/><span className="min-w-0"><span className="block font-semibold break-words">{line.description}</span><span className="block text-xs text-[#52627a]">{line.quantity.toLocaleString(en?'en-US':'es-CR')} {line.unit} · {t('costo interno','internal cost')}: {money(line.unitCostCents)}</span></span></label>)}</fieldset>
   <fieldset className="space-y-2"><legend className="font-semibold">{t('Selecciones aprobadas','Approved selections')}</legend>
    {data.selections.length===0?<p className="text-sm text-[#52627a]">{t('No hay selecciones aprobadas por el cliente.','No selections approved by the customer.')}</p>:data.selections.map(option=><label key={option.key} className={row}><input type="checkbox" className={box} data-po-source={option.key} checked={picked.has(option.key)} disabled={disabled} onChange={()=>toggle(option.key)}/><span className="min-w-0"><span className="block font-semibold break-words">{option.itemName} · {option.name}</span><span className="block text-xs text-[#52627a]">{option.quantity.toLocaleString(en?'en-US':'es-CR')} · {t('costo interno','internal cost')}: {money(option.unitCostCents)}{option.orderedQuantity>0?' · '+t('ya pedido: ','already ordered: ')+option.orderedQuantity.toLocaleString(en?'en-US':'es-CR'):''}</span></span></label>)}</fieldset>
   <fieldset className="space-y-2"><legend className="font-semibold">{t('Presupuesto por códigos','Budget by cost code')}</legend>
    {data.budget.length===0?<p className="text-sm text-[#52627a]">{t('El trabajo no tiene códigos de presupuesto. Puede crearlos en la pestaña Presupuesto.','The job has no budget codes. You can create them in the Budget tab.')}</p>:data.budget.map(code=><label key={code.key} className={row}><input type="checkbox" className={box} data-po-source={code.key} checked={picked.has(code.key)} disabled={disabled} onChange={()=>toggle(code.key)}/><span className="min-w-0"><span className="block font-semibold break-words">{code.code} · {code.title}</span><span className="block text-xs text-[#52627a]">{t('Previsto','Planned')} {code.plannedCents===null?'—':proMoney(code.plannedCents/100,en)} · {t('comprometido','committed')} {proMoney(code.committedCents/100,en)}</span></span></label>)}</fieldset>
   <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" data-po-from-sources-use disabled={disabled||picked.size===0} onClick={()=>onUse(poLinesFromSources(data,picked,en))}>{t('Usar en una orden nueva','Use in a new order')}{picked.size?` (${picked.size})`:''}</Button><Button type="button" variant="secondary" className="min-h-11" onClick={onCancel}>{t('Cancelar','Cancel')}</Button></div>
  </>}
 </section>;
}
