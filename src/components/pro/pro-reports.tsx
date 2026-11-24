'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {proCount} from '@/lib/pro/plural';
import {proCsv,csvAmount,proReportSchema,type ProReport,type ProReportJob} from '@/lib/pro/reports';
import {FinanceReportTabs} from './round11-finance';
import {ExtraReportTabs} from './pro-reports-extra';
import {LedgerReportTabs} from './payables-cashflow';
import {SavedReports} from './saved-reports';

/** Round 7B (Houzz parity: Reports): financial and jobs reports with CSV export. Read-only. */
const stages:Record<string,{es:string;en:string}>={new:{es:'Nuevo',en:'New'},quoting:{es:'Cotizando',en:'Quoting'},scheduled:{es:'Programado',en:'Scheduled'},completed:{es:'Finalizado',en:'Completed'}};
export function ProReports(){const {user}=useAuth();if(!user)return null;return <ReportsSession key={user.id} actor={user.id}/>;}
function ReportsSession({actor}:{actor:string}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,money=(cents:number|null)=>cents===null?'—':proMoney(cents/100,en);
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[data,setData]=useState<ProReport|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),[denied,setDenied]=useState(false),[tab,setTab]=useState<'financial'|'customers'|'payments'|'vat'|'payables'|'cashflow'|'income'|'jobs'|'timeMember'|'timeProject'|'selections'>('financial');
 /* Round 11: the result next to «Costs and committed» subtracts both (falls back to the cost-only result for older answers). */
 const result=(job:ProReportJob)=>job.resultWithCommittedCents!==undefined?job.resultWithCommittedCents:job.resultCents;
 const sequence=useRef(0);
 const load=useCallback(async()=>{
  const id=++sequence.current;setLoading(true);setError(false);
  try{const query=new URLSearchParams();if(from)query.set('from',from);if(to)query.set('to',to);
   const response=await fetch('/api/pro/reports'+(query.size?'?'+query:''),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(response.status===403){if(id===sequence.current)setDenied(true);return;}if(!response.ok)throw Error();
   const body=proReportSchema.parse(await response.json());if(id===sequence.current)setData(body);}
  catch{if(id===sequence.current)setError(true);}
  finally{if(id===sequence.current)setLoading(false);}
 },[actor,from,to]);
 useEffect(()=>{const counter=sequence;const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);counter.current++;};},[load]);
 const day=(value:string|null)=>value?new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'—';
 const period=data?(data.from||data.to?`${day(data.from)} – ${day(data.to)}`:t('Todo el período','All time')):'';
 function download(name:string,rows:(string|number|null)[][]){
  const url=URL.createObjectURL(new Blob([proCsv(rows)],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function exportFinancial(){if(!data)return;download(`reporte-financiero-${data.today}.csv`,[
  [t('Concepto','Item'),t('Monto (CRC)','Amount (CRC)')],
  [t('Facturado','Invoiced'),csvAmount(data.invoicedCents)],[t('Cobrado','Collected'),csvAmount(data.collectedCents)],[t('Pendiente de cobro','Outstanding'),csvAmount(data.outstandingCents)],
  [t('Pendiente 0-30 días','Outstanding 0-30 days'),csvAmount(data.aging.d0_30)],[t('Pendiente 31-60 días','Outstanding 31-60 days'),csvAmount(data.aging.d31_60)],[t('Pendiente 61-90 días','Outstanding 61-90 days'),csvAmount(data.aging.d61_90)],[t('Pendiente más de 90 días','Outstanding over 90 days'),csvAmount(data.aging.d90_plus)],
  [],[t('Trabajo','Job'),t('Cliente','Customer'),t('Acordado sin IVA','Agreed before tax'),t('Costos','Costs'),t('Comprometido','Committed'),t('Resultado','Result')],
  ...data.jobs.map(job=>[job.service,job.client,csvAmount(job.agreedNetCents),csvAmount(job.costCents),csvAmount(job.committedCents),csvAmount(result(job))]),
 ]);}
 function exportJobs(){if(!data)return;download(`reporte-trabajos-${data.today}.csv`,[
  [t('Trabajo','Job'),t('Cliente','Customer'),t('Etapa','Stage'),t('Cancelado','Cancelled'),t('Inicio','Start'),t('Fin','End'),t('Acordado','Agreed'),t('Facturado','Invoiced'),t('Cobrado','Paid'),t('Saldo','Balance'),t('Costos','Costs'),t('Resultado','Result')],
  ...data.jobs.map(job=>[job.service,job.client,stages[job.stage]?.[en?'en':'es']??job.stage,job.cancelled?t('Sí','Yes'):t('No','No'),job.start,job.end,csvAmount(job.agreedCents),csvAmount(job.invoicedCents),csvAmount(job.paidCents),csvAmount(job.balanceCents),csvAmount(job.costCents),csvAmount(result(job))]),
 ]);}
 const tile='min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-4';
 const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 font-normal';
 return <section data-pro-reports className="min-w-0 space-y-4">
  <div className="flex flex-wrap items-end justify-between gap-3"><div className="min-w-0"><h2 className="text-lg font-semibold">{t('Reportes','Reports')}</h2><p className="text-sm text-[#52627a]">{t('Facturado, cobrado, pendiente por antigüedad y resultado de cada trabajo. Montos en colones, con los mismos cálculos de cada trabajo.','Invoiced, collected, outstanding by age and the result of each job. Amounts in colones, with the same figures as each job.')}</p></div>
   <div role="tablist" aria-label={t('Tipo de reporte','Report type')} className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-[#e9eff5] p-1 sm:flex-wrap">{(['financial','customers','payments','vat','payables','cashflow','income','jobs','timeMember','timeProject','selections'] as const).map(value=><button key={value} type="button" role="tab" aria-selected={tab===value} data-pro-report-tab={value} onClick={()=>setTab(value)} className={`min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${tab===value?'bg-white text-[#008bb5] shadow-sm':'text-[#52627a]'}`}>{({financial:t('Financiero','Financial'),customers:t('Por cliente','By customer'),payments:t('Pagos recibidos','Payments received'),vat:t('IVA','VAT'),payables:t('Cuentas por pagar','Payables'),cashflow:t('Flujo de caja','Cash flow'),income:t('Estado de resultados','Income statement'),jobs:t('Trabajos','Jobs'),timeMember:t('Horas por miembro','Time by member'),timeProject:t('Horas por proyecto','Time by project'),selections:t('Seguimiento de selecciones','Selections tracker')})[value]}</button>)}</div></div>
  <div className="grid min-w-0 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
   <label className="block min-w-0 text-sm font-semibold">{t('Desde','From')}<input type="date" aria-label={t('Desde','From')} min="2000-01-01" max="2100-12-31" value={from} onChange={event=>{const v=event.target.value;if(!v||!to||v<=to)setFrom(v);}} className={field}/></label>
   <label className="block min-w-0 text-sm font-semibold">{t('Hasta','To')}<input type="date" aria-label={t('Hasta','To')} min="2000-01-01" max="2100-12-31" value={to} onChange={event=>{const v=event.target.value;if(!v||!from||v>=from)setTo(v);}} className={field}/></label>
   {(tab==='financial'||tab==='jobs')&&<Button type="button" variant="outline" data-pro-report-export disabled={!data||loading} onClick={tab==='financial'?exportFinancial:exportJobs}>{t('Exportar CSV','Export CSV')}</Button>}
  </div>
  {!denied&&<SavedReports actor={actor} en={en} tab={tab} from={from} to={to} today={new Date().toLocaleDateString('en-CA')} labels={{financial:t('Financiero','Financial'),customers:t('Por cliente','By customer'),payments:t('Pagos recibidos','Payments received'),vat:t('IVA','VAT'),payables:t('Cuentas por pagar','Payables'),cashflow:t('Flujo de caja','Cash flow'),income:t('Estado de resultados','Income statement'),jobs:t('Trabajos','Jobs'),timeMember:t('Horas por miembro','Time by member'),timeProject:t('Horas por proyecto','Time by project'),selections:t('Seguimiento de selecciones','Selections tracker')}} onApply={(nextTab,nextFrom,nextTo)=>{setTab(nextTab);setFrom(nextFrom);setTo(nextTo);}}/>}
  {denied?<p role="status" data-pro-report-denied className="text-sm text-[#52627a]">{t('Su rol en esta empresa no permite ver reportes financieros. Pídale acceso a un Administrador.','Your role in this company does not allow financial reports. Ask an Administrator for access.')}</p>
  :error?<div role="alert" className="space-y-2 text-sm"><p>{t('No se pudo cargar el reporte.','Could not load the report.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>
  :!data?<p role="status" className="text-sm text-[#52627a]">{t('Cargando reporte…','Loading report…')}</p>
  :<>
   {tab!=='cashflow'&&tab!=='income'&&<p className="text-xs text-[#52627a]">{t('Período','Period')}: {period}{data.truncated?' · '+t('Se muestran los 200 trabajos más recientes.','Showing the 200 most recent jobs.'):''}</p>}
   {tab==='timeMember'||tab==='timeProject'||tab==='selections'?<ExtraReportTabs actor={actor} tab={tab} from={from} to={to} en={en}/>:tab==='payables'||tab==='cashflow'||tab==='income'?<LedgerReportTabs actor={actor} tab={tab} from={from} to={to}/>:tab==='customers'||tab==='payments'||tab==='vat'?<FinanceReportTabs actor={actor} tab={tab} from={from} to={to}/>:tab==='financial'?<div className="space-y-4">
    <div className="grid min-w-0 gap-3 sm:grid-cols-3">
     <div className={tile} data-pro-report-invoiced><p className="text-sm text-[#52627a]">{t('Facturado','Invoiced')}</p><p className="text-xl font-bold">{money(data.invoicedCents)}</p></div>
     <div className={tile} data-pro-report-collected><p className="text-sm text-[#52627a]">{t('Cobrado','Collected')}</p><p className="text-xl font-bold">{money(data.collectedCents)}</p></div>
     <div className={tile} data-pro-report-outstanding><p className="text-sm text-[#52627a]">{t('Pendiente de cobro','Outstanding')}</p><p className="text-xl font-bold">{money(data.outstandingCents)}</p><p className="text-xs text-[#52627a]">{proCount(data.aging.openInvoices,en,['borrador de factura con saldo','borradores de factura con saldo'],['open invoice draft','open invoice drafts'])}</p><p data-pro-report-outstanding-basis className="mt-1 text-xs text-[#52627a]">{t('Solo lo facturado: borradores menos pagos y notas de crédito. El saldo del trabajo y el estado de cuenta usan el importe acordado menos abonos.','Invoiced only: drafts minus payments and credit notes. The job balance and the customer statement use the agreed amount minus payments.')}</p></div>
    </div>
    <div className={tile}><h3 className="font-semibold">{t('Pendiente por antigüedad','Outstanding by age')}</h3><dl data-pro-report-aging className="mt-2 grid gap-2 text-sm sm:grid-cols-4">{([['0–30',data.aging.d0_30],['31–60',data.aging.d31_60],['61–90',data.aging.d61_90],[t('Más de 90','Over 90'),data.aging.d90_plus]] as const).map(([label,value])=><div key={label} className="rounded-xl bg-[#f7f9fc] p-3"><dt className="text-[#52627a]">{label} {t('días','days')}</dt><dd className="font-semibold">{money(value)}</dd></div>)}</dl></div>
    <div className={tile+' overflow-x-auto'}><h3 className="font-semibold">{t('Resultado por trabajo','Job profitability')}</h3>{data.jobs.length===0?<p className="mt-2 text-sm text-[#52627a]">{t('Todavía no hay trabajos.','No jobs yet.')}</p>:<table data-pro-report-profitability className="mt-2 w-full min-w-[36rem] text-left text-sm"><thead><tr className="text-[#52627a]"><th className="py-2 pr-3 font-semibold">{t('Trabajo','Job')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Acordado sin IVA','Agreed before tax')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Costos y comprometido','Costs and committed')}</th><th className="py-2 text-right font-semibold">{t('Resultado','Result')}</th></tr></thead><tbody>{data.jobs.map(job=><tr key={job.workId} className="border-t border-[#eef2f6]"><td className="py-2 pr-3"><span className="font-semibold">{job.service||t('Trabajo','Job')}</span><span className="block text-xs text-[#52627a]">{job.client}</span></td><td className="py-2 pr-3 text-right">{money(job.agreedNetCents)}</td><td className="py-2 pr-3 text-right">{money(job.costCents+job.committedCents)}</td><td className={'py-2 text-right font-semibold '+((result(job)??0)<0?'text-[#8a2a1b]':'')}>{money(result(job))}{job.resultBasis==='as_agreed'&&result(job)!==null&&<span className="block text-xs font-normal text-[#52627a]">{t('IVA no desglosado','VAT not itemized')}</span>}</td></tr>)}</tbody></table>}</div>
   </div>
   :<div className={tile+' overflow-x-auto'}>{data.jobs.length===0?<p className="text-sm text-[#52627a]">{t('Todavía no hay trabajos.','No jobs yet.')}</p>:<table data-pro-report-jobs className="w-full min-w-[44rem] text-left text-sm"><thead><tr className="text-[#52627a]"><th className="py-2 pr-3 font-semibold">{t('Trabajo','Job')}</th><th className="py-2 pr-3 font-semibold">{t('Etapa','Stage')}</th><th className="py-2 pr-3 font-semibold">{t('Fechas','Dates')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Acordado','Agreed')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Facturado','Invoiced')}</th><th className="py-2 pr-3 text-right font-semibold">{t('Cobrado','Paid')}</th><th className="py-2 text-right font-semibold">{t('Saldo','Balance')}</th></tr></thead><tbody>{data.jobs.map(job=><tr key={job.workId} className="border-t border-[#eef2f6]"><td className="py-2 pr-3"><span className="font-semibold">{job.service||t('Trabajo','Job')}</span><span className="block text-xs text-[#52627a]">{job.client}</span></td><td className="py-2 pr-3">{job.cancelled?t('Cancelado','Cancelled'):stages[job.stage]?.[en?'en':'es']??job.stage}</td><td className="py-2 pr-3 text-xs">{job.start||job.end?`${day(job.start)} – ${day(job.end)}`:t('Sin fechas','No dates')}</td><td className="py-2 pr-3 text-right">{money(job.agreedCents)}</td><td className="py-2 pr-3 text-right">{money(job.invoicedCents)}</td><td className="py-2 pr-3 text-right">{money(job.paidCents)}</td><td className="py-2 text-right font-semibold">{money(job.balanceCents)}</td></tr>)}</tbody></table>}</div>}
  </>}
 </section>;
}
