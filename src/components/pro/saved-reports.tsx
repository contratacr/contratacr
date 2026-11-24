'use client';
import {useCallback,useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {reportRanges,resolveReportRange,savedReportsSchema,type SavedReport} from '@/lib/pro/saved-reports';

/** Area E: saved custom reports. Remembers a report type and a period under a name; opening one restores both. */
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
type Tab=SavedReport['report'];
export function SavedReports({actor,en,tab,from,to,today,labels,onApply}:{actor:string;en:boolean;tab:Tab;from:string;to:string;today:string;labels:Record<Tab,string>;onApply:(tab:Tab,from:string,to:string)=>void}){
 const t=(es:string,english:string)=>en?english:es,[reports,setReports]=useState<SavedReport[]|null>(null),[failed,setFailed]=useState(false),[name,setName]=useState(''),[range,setRange]=useState<SavedReport['range']|'current'>('current'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const headers={'X-Pro-Expected-Actor':actor};
 const load=useCallback(async()=>{setFailed(false);try{const r=await fetch('/api/pro/saved-reports',{cache:'no-store',headers});if(!r.ok)throw Error();setReports(savedReportsSchema.parse(await r.json()).reports);}catch{setFailed(true);}},[actor]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const rangeLabel:Record<SavedReport['range'],string>={all:t('Todo el período','All time'),fixed:t('Fechas fijas','Fixed dates'),this_month:t('Este mes','This month'),last_month:t('Mes pasado','Last month'),this_year:t('Este año','This year'),last_30:t('Últimos 30 días','Last 30 days'),last_90:t('Últimos 90 días','Last 90 days')};
 async function send(body:Record<string,unknown>){
  setBusy(true);setError('');
  try{const r=await fetch('/api/pro/saved-reports',{method:'POST',cache:'no-store',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(r.status===409){setError(t('Ya existe un reporte con ese nombre o llegó al límite de 30.','A report with that name already exists or you reached the limit of 30.'));return false;}
   if(!r.ok){setError(t('No se pudo guardar el reporte. Revise los datos.','Could not save the report. Check the details.'));return false;}
   setReports(savedReportsSchema.parse(await r.json()).reports);return true;
  }catch{setError(t('No se pudo guardar el reporte. Reintente.','Could not save the report. Retry.'));return false;}finally{setBusy(false);}
 }
 const kind:SavedReport['range']=range==='current'?(from||to?'fixed':'all'):range;
 const save=()=>void send({action:'save',id:crypto.randomUUID(),name,report:tab,range:kind,from:kind==='fixed'?(from||null):null,to:kind==='fixed'?(to||null):null}).then(ok=>{if(ok)setName('');});
 return <section data-saved-reports className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4" aria-labelledby="saved-reports-title">
  <h3 id="saved-reports-title" className="font-semibold">{t('Reportes guardados','Saved reports')}</h3>
  {failed?<div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{t('No se pudieron cargar los reportes guardados.','Could not load the saved reports.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>
  :!reports?<p role="status" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>
  :!reports.length?<p data-saved-reports-empty className="text-sm text-[#52627a]">{t('Todavía no tiene reportes guardados. Elija un reporte y un período, póngale nombre y guárdelo para abrirlo con un clic.','You have no saved reports yet. Choose a report and a period, name it and save it to open it with one click.')}</p>
  :<ul className="grid gap-2 sm:grid-cols-2">{reports.map(r=><li key={r.id} data-saved-report={r.id} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-[#d7e1ea] p-2 text-sm">
   <button type="button" data-saved-report-open className="min-h-11 min-w-0 flex-1 text-left" onClick={()=>{const d=resolveReportRange(r.range,today,r.from,r.to);onApply(r.report,d.from,d.to);}}><span className="block break-words font-semibold">{r.name}</span><span className="block text-xs text-[#52627a]">{labels[r.report]} · {rangeLabel[r.range]}</span></button>
   <Button type="button" size="sm" variant="ghost" className="min-h-11" data-saved-report-delete disabled={busy} aria-label={t('Eliminar reporte guardado ','Delete saved report ')+r.name} onClick={()=>void send({action:'delete',id:r.id})}>{t('Eliminar','Delete')}</Button></li>)}</ul>}
  <div className="grid min-w-0 gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
   <label className="block min-w-0 text-sm font-medium">{t('Guardar esta vista como','Save this view as')}<input data-saved-report-name maxLength={80} value={name} onChange={e=>setName(e.target.value)} className={field}/></label>
   <label className="block min-w-0 text-sm font-medium">{t('Período al abrir','Period when opened')}<select data-saved-report-range value={range} onChange={e=>setRange(e.target.value as typeof range)} className={field}><option value="current">{from||to?t('Fechas actuales','Current dates'):t('Todo el período','All time')}</option>{reportRanges.filter(k=>k!=='fixed'&&(from||to||k!=='all')).map(k=><option key={k} value={k}>{rangeLabel[k]}</option>)}</select></label>
   <Button type="button" className="min-h-11" data-saved-report-save disabled={busy||!name.trim()||!reports} onClick={save}>{t('Guardar reporte','Save report')}</Button></div>
  {error&&<p role="alert" className="text-sm text-[#8a2a1b]">{error}</p>}
 </section>;
}
