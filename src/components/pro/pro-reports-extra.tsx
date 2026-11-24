'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {csvAmount,proCsv} from '@/lib/pro/reports';
import {timeReportSchema,type TimeReport} from '@/lib/pro/round9';
import {globalTrackerSchema,type GlobalRow} from '@/lib/pro/selection-boards';

/**
 * Area E: three more report tabs. Time billing by team member and by project (same time ledger as the Hours view, through
 * /api/pro/time-report) and the global selections tracker report (every item of every job, filtered by the report period).
 */
export type ExtraReportTab='timeMember'|'timeProject'|'selections';
const tile='min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-4 overflow-x-auto';
const crDay=(offset=0)=>new Date(Date.now()-6*3600000+offset*86400000).toISOString().slice(0,10);
function download(name:string,rows:(string|number|null)[][]){const url=URL.createObjectURL(new Blob([proCsv(rows)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function ExtraReportTabs({actor,tab,from,to,en}:{actor:string;tab:ExtraReportTab;from:string;to:string;en:boolean}){
 return tab==='selections'?<SelectionsReport actor={actor} from={from} to={to} en={en}/>:<TimeBilling actor={actor} by={tab==='timeMember'?'member':'project'} from={from} to={to} en={en}/>;
}
function TimeBilling({actor,by,from,to,en}:{actor:string;by:'member'|'project';from:string;to:string;en:boolean}){
 const t=(es:string,english:string)=>en?english:es,[report,setReport]=useState<TimeReport|null>(null),[failed,setFailed]=useState(false);
 const start=from||crDay(-29),end=to||crDay(),money=(c:number|null)=>c===null?'—':proMoney(c/100,en);
 const load=useCallback(async()=>{setFailed(false);try{const r=await fetch('/api/pro/time-report?'+new URLSearchParams({from:start,to:end}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error();setReport(timeReportSchema.parse(await r.json()));}catch{setFailed(true);}},[actor,start,end]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 if(failed)return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{t('No se pudo cargar el reporte de horas.','Could not load the time report.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!report)return <p role="status" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>;
 const rows=by==='member'?report.byPerson.map(x=>({key:x.key,name:x.name,minutes:x.minutes,cents:x.billableCents})):report.byWork.map(x=>({key:x.workId,name:x.title,minutes:x.minutes,cents:x.billableCents}));
 const hours=(m:number)=>(m/60).toFixed(2).replace(/\.00$/,'');
 return <div data-report-time={by} className="space-y-3">
  <p className="text-xs text-[#52627a]">{t(`Horas facturables por ${by==='member'?'miembro del equipo':'proyecto'} del ${start} al ${end}.`,`Billable time by ${by==='member'?'team member':'project'} from ${start} to ${end}.`)}</p>
  <div className={tile}>{!rows.length?<p data-report-empty className="text-sm text-[#52627a]">{t('No hay horas registradas en este período.','There is no time logged in this period.')}</p>:
   <table className="w-full min-w-[28rem] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-[#52627a]"><tr><th className="py-2">{by==='member'?t('Miembro','Member'):t('Proyecto','Project')}</th><th className="py-2 text-right">{t('Horas','Hours')}</th><th className="py-2 text-right">{t('Facturable','Billable')}</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.key} data-report-row className="border-t border-[#e5e7eb]"><td className="break-words py-2">{r.name}</td><td className="py-2 text-right tabular-nums">{hours(r.minutes)}</td><td className="py-2 text-right tabular-nums">{money(r.cents)}</td></tr>)}</tbody>
    <tfoot><tr className="border-t-2 border-[#d7e1ea] font-semibold"><td className="py-2">{t('Total','Total')}</td><td className="py-2 text-right tabular-nums">{hours(report.totals.minutes)}</td><td className="py-2 text-right tabular-nums">{money(report.totals.billableCents)}</td></tr></tfoot></table>}</div>
  <Button type="button" variant="outline" className="min-h-11" data-report-time-export disabled={!rows.length} onClick={()=>download((by==='member'?'horas-por-miembro-':'horas-por-proyecto-')+start+'.csv',[[by==='member'?t('Miembro','Member'):t('Proyecto','Project'),t('Horas','Hours'),t('Facturable (CRC)','Billable (CRC)')],...rows.map(r=>[r.name,hours(r.minutes),csvAmount(r.cents)])])}>{t('Exportar CSV','Export CSV')}</Button>
 </div>;
}
function SelectionsReport({actor,from,to,en}:{actor:string;from:string;to:string;en:boolean}){
 const t=(es:string,english:string)=>en?english:es,[rows,setRows]=useState<GlobalRow[]|null>(null),[failed,setFailed]=useState(false);
 const load=useCallback(async()=>{setFailed(false);try{const r=await fetch('/api/pro/selections-global',{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});if(!r.ok)throw Error();setRows(globalTrackerSchema.parse(await r.json()).items);}catch{setFailed(true);}},[actor]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const shown=useMemo(()=>(rows??[]).filter(r=>{if(!from&&!to)return true;return [r.dueDate,r.orderedOn,r.deliveredOn].some(d=>!!d&&(!from||d>=from)&&(!to||d<=to));}),[rows,from,to]);
 if(failed)return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{t('No se pudo cargar el reporte.','Could not load the report.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!rows)return <p role="status" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>;
 const money=(c:number|null)=>c===null?'—':proMoney(c/100,en),approved=shown.filter(r=>r.state==='approved'),total=approved.reduce((s,r)=>s+(r.totalCents??0),0);
 return <div data-report-selections className="space-y-3">
  <p className="text-xs text-[#52627a]">{t('Todos los ítems de selección de todos sus trabajos. Con un período elegido, se incluyen los ítems con fecha límite, de pedido o de entrega dentro del período.','Every selection item of all your jobs. With a period chosen, items with a due, order or delivery date inside the period are included.')}</p>
  <ul className="grid gap-3 sm:grid-cols-3"><li className={tile}><p className="text-sm text-[#52627a]">{t('Ítems','Items')}</p><p data-report-count className="text-xl font-bold">{shown.length}</p></li><li className={tile}><p className="text-sm text-[#52627a]">{t('Aprobados','Approved')}</p><p className="text-xl font-bold">{approved.length}</p></li><li className={tile}><p className="text-sm text-[#52627a]">{t('Total aprobado','Approved total')}</p><p className="text-xl font-bold">{money(total)}</p></li></ul>
  <Button type="button" variant="outline" className="min-h-11" data-report-selections-export disabled={!shown.length} onClick={()=>download('reporte-seguimiento-global.csv',[[t('Trabajo','Job'),t('Habitación','Room'),t('Ítem','Item'),t('Estado','Status'),t('Pedido','Order'),t('Total (CRC)','Total (CRC)'),t('Fecha límite','Due date'),t('Fecha del pedido','Order date'),t('Fecha de entrega','Delivery date')],...shown.map(r=>[r.workName,r.areaName,r.name,r.state,r.order,csvAmount(r.totalCents),r.dueDate,r.orderedOn,r.deliveredOn])])}>{t('Exportar CSV','Export CSV')}</Button>
 </div>;
}
