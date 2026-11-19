'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {formatMinutes} from '@/lib/pro/time-tracking';
import {paymentToday} from '@/lib/pro/invoice-payments';
import {PRO_TIMER_CHANGED} from '@/lib/pro/round8';
import {timesheetCsv,timesheetDecisionResultSchema,timesheetSchema,weekStartOf,type Timesheet} from '@/lib/pro/operations';

/**
 * Ronda F2-C (row 22): weekly timesheets of the team over the existing hours (timers, manual entries and the
 * Costs ledger) and the people clocked in now. The owner, Administrator and Manager approve or reopen a week;
 * an approval is tied to the week's rows, so a later change shows "Changed after approval". Export CSV.
 * Location at clock-in is optional and off until an Administrator turns it on. No internal cost is shown.
 */
const addDays=(iso:string,n:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export function WeeklyTimesheets(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,today=paymentToday();
 const [week,setWeek]=useState(()=>weekStartOf(today)),[sheet,setSheet]=useState<Timesheet|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [busy,setBusy]=useState(''),[open,setOpen]=useState<string|null>(null),sequence=useRef(0),pending=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async()=>{const request=++sequence.current;setLoading(true);setError('');
  try{const r=await fetch('/api/pro/time-clock?'+new URLSearchParams({week}),{cache:'no-store'});const body=await r.json();if(!r.ok)throw Error(body.error);if(request===sequence.current)setSheet(timesheetSchema.parse(body));}
  catch{if(request===sequence.current)setError(t('No se pudo cargar la hoja de horas. Sus registros se conservan.','The timesheet could not be loaded. Your entries are preserved.'));}
  finally{if(request===sequence.current)setLoading(false);}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[week]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);const changed=()=>void load();window.addEventListener(PRO_TIMER_CHANGED,changed);return()=>{clearTimeout(timer);window.removeEventListener(PRO_TIMER_CHANGED,changed);};},[load]);
 const day=(iso:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
 const weekday=(iso:string,style:'narrow'|'short')=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{weekday:style,timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
 const hours=(minutes:number)=>new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:1}).format(minutes/60);
 const time=(iso:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(iso));
 async function post(body:Record<string,unknown>,done:string){
  const key=JSON.stringify(body);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
  setBusy(key);setError('');setNotice('');
  try{const r=await fetch('/api/pro/time-clock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body.action==='settings'?body:{...body,actionId:pending.current.id})});const data=await r.json().catch(()=>({}));
   if(!r.ok){if(r.status===409)pending.current=null;setError(typeof data.error==='string'?data.error:t('No se pudo guardar.','Could not save.'));if(r.status===409)await load();return;}
   if(body.action!=='settings')timesheetDecisionResultSchema.parse(data);pending.current=null;setNotice(done);await load();}
  catch{setError(t('No se pudo comprobar el cambio. Reintente: no se duplicará.','Could not confirm the change. Retry: it will not be duplicated.'));}
  finally{setBusy('');}
 }
 async function exportCsv(){if(!sheet)return;const {saveFile}=await import('@/lib/file-download');await saveFile(new Blob([timesheetCsv(sheet,en)],{type:'text/csv;charset=utf-8'}),(en?'timesheet-':'hoja-de-horas-')+sheet.weekStart+'.csv');}
 const days=Array.from({length:7},(_,i)=>addDays(week,i));
 return <section data-time-clock className="min-w-0 space-y-4 rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-5">
  <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
   <div className="min-w-0"><h2 className="text-lg font-bold text-[#162543]">{t('Fichaje y hojas de horas','Time clock and timesheets')}</h2><p className="text-sm text-[#52627a]">{t('Cada persona ficha entrada y salida desde el cronómetro de un trabajo (con tarea opcional). Aquí se revisa la semana de cada integrante y se aprueba.','Each person clocks in and out from a job timer (with an optional task). Review and approve each team member’s week here.')}</p></div>
   <Button type="button" variant="secondary" data-time-clock-export disabled={!sheet||!sheet.people.some(p=>p.entries.length)} onClick={()=>void exportCsv()}>{t('Exportar CSV','Export CSV')}</Button>
  </div>
  <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label={t('Semana','Week')}>
   <Button type="button" variant="secondary" className="min-h-11" data-time-clock-prev onClick={()=>setWeek(addDays(week,-7))}>{t('Semana anterior','Previous week')}</Button>
   <p data-time-clock-week className="min-w-0 px-1 text-sm font-semibold text-[#162543]">{day(week)} – {day(addDays(week,6))}</p>
   <Button type="button" variant="secondary" className="min-h-11" data-time-clock-next onClick={()=>setWeek(addDays(week,7))}>{t('Semana siguiente','Next week')}</Button>
   {week!==weekStartOf(today)&&<Button type="button" variant="ghost" className="min-h-11" onClick={()=>setWeek(weekStartOf(today))}>{t('Esta semana','This week')}</Button>}
  </div>
  {error&&<div role="alert" className="space-y-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><p>{error}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>}
  {notice&&<p role="status" className="text-sm text-[#0f7a3d]">{notice}</p>}
  {loading&&!sheet&&<p role="status" className="text-sm text-[#52627a]">{t('Cargando hoja de horas…','Loading timesheet…')}</p>}
  {sheet&&<>
   {!!sheet.open.length&&<div data-time-clock-open className="space-y-2 rounded-xl bg-[#eaf7fb] p-3 text-sm"><p className="font-semibold text-[#162543]">{t('En jornada ahora','Clocked in now')}</p>
    <ul className="space-y-1">{sheet.open.map(o=><li key={o.personKey+o.startedAt} className="break-words text-[#3d5068]"><span className="font-semibold text-[#162543]">{o.personName}</span> · {o.workTitle??''}{o.taskTitle?' · '+o.taskTitle:''} · {o.status==='running'?t('desde las ','since ')+time(o.startedAt):t('por revisar','to review')}{o.location?' · '+t('con ubicación','with location'):''}</li>)}</ul></div>}
   <div className="min-w-0 space-y-3">{sheet.people.map(p=>{const state=p.decision?.decision==='approved'?(p.decision.stale?'stale':'approved'):'pending';const key=JSON.stringify({p:p.personKey,w:sheet.weekStart});return <article key={p.personKey} data-timesheet-person={p.personName} data-timesheet-state={state} className="min-w-0 rounded-2xl border border-[#d7e1ea] p-3">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
     <div className="min-w-0"><h3 className="break-words font-bold text-[#162543]">{p.personName}</h3><p className="text-sm text-[#52627a]"><span data-timesheet-total>{formatMinutes(p.totalMinutes)}</span> · {t('facturable ','billable ')}{formatMinutes(p.billableMinutes)}</p></div>
     <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${state==='approved'?'bg-[#eef8f4] text-[#18573a]':state==='stale'?'bg-[#fff4e5] text-[#8a4b00]':'bg-[#eef2f6] text-[#52627a]'}`}>{state==='approved'?t('Aprobada','Approved'):state==='stale'?t('Cambió después de aprobarse','Changed after approval'):t('Pendiente de aprobar','Pending approval')}</span>
    </div>
    <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs">{days.map((d,i)=><div key={d} className="min-w-0 rounded-lg bg-[#f6f8fa] px-0.5 py-1"><p className="truncate text-[#68778d]"><span className="sm:hidden">{weekday(d,'narrow')}</span><span className="hidden sm:inline">{weekday(d,'short')}</span> {d.slice(8)}</p><p data-timesheet-day={d} className={`font-semibold tabular-nums ${p.days[i]?'text-[#162543]':'text-[#a0abba]'}`}>{hours(p.days[i])}</p></div>)}</div>
    {p.decision&&<p className="mt-2 text-xs text-[#52627a]">{p.decision.decision==='approved'?t('Aprobó ','Approved by '):t('Reabrió ','Reopened by ')}{p.decision.by} · {new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(p.decision.at))}{p.decision.note?' · '+p.decision.note:''}</p>}
    <div className="mt-2 flex flex-wrap gap-2">
     {!!p.entries.length&&<Button type="button" variant="ghost" className="min-h-11" aria-expanded={open===p.personKey} onClick={()=>setOpen(open===p.personKey?null:p.personKey)}>{open===p.personKey?t('Ocultar registros','Hide entries'):t('Ver registros','Show entries')} ({p.entries.length})</Button>}
     {sheet.canApprove&&state!=='approved'&&!!p.entries.length&&<Button type="button" data-timesheet-approve={p.personName} className="min-h-11" disabled={!!busy} onClick={()=>void post({action:'approve',personKey:p.personKey,weekStart:sheet.weekStart,digest:p.digest,note:''},t('Semana aprobada.','Week approved.'))}>{busy===JSON.stringify({action:'approve',personKey:p.personKey,weekStart:sheet.weekStart,digest:p.digest,note:''})?t('Aprobando…','Approving…'):t('Aprobar semana','Approve week')}</Button>}
     {sheet.canApprove&&p.decision?.decision==='approved'&&<Button type="button" variant="secondary" data-timesheet-reopen={p.personName} className="min-h-11" disabled={!!busy} onClick={()=>void post({action:'reopen',personKey:p.personKey,weekStart:sheet.weekStart,digest:p.digest,note:''},t('Semana reabierta.','Week reopened.'))}>{t('Reabrir','Reopen')}</Button>}
    </div>
    {open===p.personKey&&<ul data-timesheet-entries={key} className="mt-2 divide-y divide-[#eef2f6] text-sm">{p.entries.map(e=><li key={e.id} className="flex min-w-0 flex-wrap justify-between gap-x-3 py-2"><span className="min-w-0 break-words"><span className="font-semibold">{day(e.date)}</span> · {e.workTitle??''}{e.taskTitle?' · '+e.taskTitle:''}{e.activityName?' · '+e.activityName:''}{e.note?' · '+e.note:''}</span><span className="tabular-nums text-[#3d5068]">{formatMinutes(e.minutes)}{e.billable?'':' · '+t('no facturable','non-billable')}</span></li>)}</ul>}
   </article>;})}</div>
   {sheet.canConfigure&&<label className="flex min-h-11 items-start gap-2 rounded-xl border border-[#e5e7eb] p-3 text-sm"><input type="checkbox" data-time-clock-gps className="mt-0.5 h-5 w-5" checked={sheet.gpsEnabled} disabled={!!busy} onChange={e=>void post({action:'settings',gpsEnabled:e.target.checked,revision:sheet.settingsRevision},e.target.checked?t('Ubicación al fichar activada.','Location at clock-in turned on.'):t('Ubicación al fichar desactivada.','Location at clock-in turned off.'))}/><span><span className="block font-semibold">{t('Permitir registrar la ubicación al fichar','Allow recording location at clock-in')}</span><span className="block text-[#52627a]">{t('Desactivado de forma predeterminada. Cada persona decide en cada entrada; solo se guarda una posición aproximada en ese momento.','Off by default. Each person decides at each clock-in; only an approximate position at that moment is stored.')}</span></span></label>}
  </>}
 </section>;
}
