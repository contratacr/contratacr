'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {proCount} from '@/lib/pro/plural';
import {formatMinutes} from '@/lib/pro/time-tracking';
import {paymentToday} from '@/lib/pro/invoice-payments';
import {openProSection} from '@/lib/pro/navigation';
import {timeReportSchema,type TimeReport} from '@/lib/pro/round9';
import {WeeklyTimesheets} from './time-clock';

/**
 * Round 9: hours of every job in one place (Horas). Filters by period, job, person and billable;
 * totals, by person, by job and the rows; CSV export of exactly the filtered rows. Read only: the
 * hours are recorded in each job (Horas / cronómetro) or in Costos y pagos.
 */
type Filters={from:string;to:string;workId:string;person:string;billable:'all'|'billable'|'nonbillable'};
const monthStart=(today:string)=>today.slice(0,8)+'01';
export function TimeReportView(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,today=paymentToday();
 const [filters,setFilters]=useState<Filters>({from:monthStart(today),to:today,workId:'',person:'',billable:'all'});
 const [report,setReport]=useState<TimeReport|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),sequence=useRef(0);
 const query=useCallback((extra:Record<string,string>={})=>new URLSearchParams({from:filters.from,to:filters.to,...(filters.workId?{workId:filters.workId}:{}),...(filters.person?{person:filters.person}:{}),...(filters.billable!=='all'?{billable:filters.billable}:{}),...extra}),[filters]);
 const load=useCallback(async()=>{
  const request=++sequence.current;setLoading(true);setError('');
  try{const r=await fetch('/api/pro/time-report?'+query(),{cache:'no-store'});const body=await r.json();if(!r.ok)throw Error(body.error);if(request===sequence.current)setReport(timeReportSchema.parse(body));}
  catch{if(request===sequence.current)setError(t('No se pudieron cargar las horas. Sus registros se conservan.','Hours could not be loaded. Your entries are preserved.'));}
  finally{if(request===sequence.current)setLoading(false);}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[query]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const valid=/^\d{4}-\d{2}-\d{2}$/.test(filters.from)&&/^\d{4}-\d{2}-\d{2}$/.test(filters.to)&&filters.from<=filters.to;
 const set=(change:Partial<Filters>)=>setFilters(old=>({...old,...change}));
 const date=(value:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
 const money=(cents:number|null)=>cents===null?'—':proMoney(cents/100,en);
 const field='mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base';
 const totals=report?.totals;
 return <section data-time-report className="min-w-0 space-y-5">
  <WeeklyTimesheets/>
  <p className="text-sm text-[#52627a]">{t('Las horas de todos sus trabajos. Se registran en cada trabajo (Horas o cronómetro) o en Costos y pagos; aquí solo se consultan y exportan.','Hours from all your jobs. They are recorded in each job (Time or timer) or in Costs & payments; here they are only reviewed and exported.')}</p>
  <form data-time-report-filters className="grid min-w-0 gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:grid-cols-2 lg:grid-cols-5" onSubmit={event=>event.preventDefault()}>
   <label className="min-w-0 text-sm font-semibold">{t('Desde','From')}<input type="date" aria-label={t('Desde','From')} className={field} value={filters.from} max={filters.to} onChange={e=>set({from:e.target.value})}/></label>
   <label className="min-w-0 text-sm font-semibold">{t('Hasta','To')}<input type="date" aria-label={t('Hasta','To')} className={field} value={filters.to} min={filters.from} onChange={e=>set({to:e.target.value})}/></label>
   <label className="min-w-0 text-sm font-semibold">{t('Trabajo','Job')}<select aria-label={t('Trabajo','Job')} className={field} value={filters.workId} onChange={e=>set({workId:e.target.value})}><option value="">{t('Todos los trabajos','All jobs')}</option>{report?.jobs.map(job=><option key={job.workId} value={job.workId}>{job.title}</option>)}</select></label>
   <label className="min-w-0 text-sm font-semibold">{t('Persona','Person')}<select aria-label={t('Persona','Person')} className={field} value={filters.person} onChange={e=>set({person:e.target.value})}><option value="">{t('Todas las personas','Everyone')}</option>{report?.people.map(person=><option key={person.key} value={person.key}>{person.key==='owner'?t('Propietario','Owner'):person.name}</option>)}</select></label>
   <label className="min-w-0 text-sm font-semibold">{t('Facturable','Billable')}<select aria-label={t('Facturable','Billable')} className={field} value={filters.billable} onChange={e=>set({billable:e.target.value as Filters['billable']})}><option value="all">{t('Todas','All')}</option><option value="billable">{t('Facturables','Billable')}</option><option value="nonbillable">{t('No facturables','Non-billable')}</option></select></label>
  </form>
  {!valid&&<p role="alert" className="text-sm text-red-700">{t('Revise el período: la fecha inicial debe ser anterior a la final (hasta 366 días).','Check the period: the start must be before the end (up to 366 days).')}</p>}
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} <Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></p>}
  {loading&&!report&&<p role="status">{t('Cargando horas…','Loading hours…')}</p>}
  {report&&totals&&<>
   <dl data-time-report-totals aria-busy={loading} className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
    {([[t('Horas registradas','Hours logged'),formatMinutes(totals.minutes),'minutes'],[t('Horas facturables','Billable hours'),formatMinutes(totals.billableMinutes),'billable'],[t('Monto facturable','Billable amount'),money(totals.billableCents),'amount'],[t('Costo','Cost'),money(totals.costCents??0),'cost']] as const).filter(([,,key])=>key!=='cost'||totals.costCents!==null).map(([name,value,key])=><div key={key} data-time-report-total={key} className="min-w-0 rounded-2xl border border-[#e5e7eb] bg-white p-4"><dt className="text-sm text-[#52627a]">{name}</dt><dd className="mt-1 break-words text-xl font-bold text-[#162543]">{value}</dd></div>)}
   </dl>
   <div className="flex flex-wrap items-center justify-between gap-3">
    <p className="text-sm text-[#52627a]">{proCount(totals.entries,en,['registro','registros'],['entry','entries'])} · {date(report.period.from)} – {date(report.period.to)}{totals.uncostedMinutes>0?` · ${t('Horas sin costo asignado','Hours without a cost')}: ${formatMinutes(totals.uncostedMinutes)}`:''}</p>
    <a data-time-report-csv href={'/api/pro/time-report?'+query({format:'csv',lang:en?'en':'es'})} download className="inline-flex min-h-11 items-center rounded-xl border border-[#d7e1ea] bg-white px-4 text-sm font-semibold text-[#162543] hover:bg-[#f3f8fb]" aria-disabled={!valid||!totals.entries} onClick={event=>{if(!valid||!totals.entries)event.preventDefault();}}>{t('Exportar CSV para Excel','Export CSV for Excel')}</a>
   </div>
   {report.truncated&&<p role="status" className="text-sm text-[#52627a]">{t('Se muestran los 1000 registros más recientes; los totales incluyen todos. Acorte el período para verlos todos.','Showing the latest 1000 entries; totals include all of them. Shorten the period to see every entry.')}</p>}
   {totals.entries===0?<p data-time-report-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-white p-6 text-center text-[#52627a]">{t('No hay horas con estos filtros.','No hours match these filters.')}</p>:<>
   <div className="grid min-w-0 gap-4 lg:grid-cols-2">
    {([['person',t('Por persona','By person'),report.byPerson.map(row=>({key:row.key,name:row.key==='owner'?t('Propietario','Owner'):row.name,minutes:row.minutes,cents:row.billableCents}))],['work',t('Por trabajo','By job'),report.byWork.map(row=>({key:row.workId,name:row.title,minutes:row.minutes,cents:row.billableCents}))]] as const).map(([kind,title,rows])=><section key={kind} data-time-report-group={kind} className="min-w-0 rounded-2xl border border-[#e5e7eb] bg-white p-4"><h3 className="font-bold">{title}</h3><ul className="mt-2 divide-y divide-[#eef2f6]">{rows.map(row=><li key={row.key} className="flex min-w-0 items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0 break-words">{row.name}</span><span className="shrink-0 text-right font-semibold">{formatMinutes(row.minutes)}<span className="block text-xs font-normal text-[#68778d]">{money(row.cents)}</span></span></li>)}</ul></section>)}
   </div>
   <ul data-time-report-rows className="min-w-0 space-y-2">
    {report.rows.map(row=><li key={row.source+row.id} data-time-report-row className="grid min-w-0 gap-1 rounded-2xl border border-[#e5e7eb] bg-white p-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)_7rem_8rem] sm:items-center sm:gap-3">
     <span className="text-[#52627a]">{date(row.date)}</span>
     <span className="min-w-0"><button type="button" className="break-words text-left font-semibold text-[#008bb5] underline-offset-2 hover:underline" onClick={()=>openProSection('pro_agenda',{cita:row.workId,vistaTrabajo:'time'},en)}>{row.workTitle}</button><span className="block break-words text-[#52627a]">{[row.personKey==='owner'?t('Propietario','Owner'):row.personName,row.activity,row.source==='ledger'?t('Registrado en Costos','Recorded in Costs'):null,row.note||null].filter(Boolean).join(' · ')}</span></span>
     <span className="font-semibold sm:text-right">{formatMinutes(row.minutes)}</span>
     <span className="sm:text-right">{row.billable?<span className="rounded-full bg-[#eaf7fb] px-2 py-0.5 text-xs font-bold text-[#008bb5]">{t('Facturable','Billable')}</span>:<span className="text-xs text-[#68778d]">{t('No facturable','Non-billable')}</span>}<span className="block text-[#52627a]">{money(row.billableCents)}</span></span>
    </li>)}
   </ul></>}
  </>}
 </section>;
}
