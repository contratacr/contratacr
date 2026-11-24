'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {PersonWorkdaysPanel} from './person-workdays';
import {crHolidaySuggestions,defaultWorkCalendar,mergeExceptions,workCalendarResultSchema,workCalendarSchema,type WorkCalendar,type WorkCalendarException} from '@/lib/pro/work-calendar';

/**
 * Row 13: work calendar of the company, inside the schedule. Everyone on the team reads it (the Gantt shades non-working
 * days with it); only the owner edits: working weekdays, holidays and extra working days, plus a button that adds the
 * SUGGESTED Costa Rica holidays for the review of the owner. A change from another tab is detected by revision (409).
 */
const WEEKDAYS:[number,string,string][]=[[1,'Lun','Mon'],[2,'Mar','Tue'],[3,'Mié','Wed'],[4,'Jue','Thu'],[5,'Vie','Fri'],[6,'Sáb','Sat'],[0,'Dom','Sun']];
const input='min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base';
export function WorkCalendarPanel({accountId,canEdit,onLoaded}:{accountId:string;canEdit:boolean;onLoaded:(calendar:WorkCalendar)=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [saved,setSaved]=useState<WorkCalendar|null>(null),[draft,setDraft]=useState<WorkCalendar|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [form,setForm]=useState<{day:string;kind:'holiday'|'workday';label:string}>({day:'',kind:'holiday',label:''});
 const load=useCallback(async()=>{
  try{const r=await fetch('/api/pro/work-calendar',{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();const body=workCalendarSchema.parse(await r.json());setSaved(body);setDraft(body);onLoaded(body);}
  catch{setSaved(null);setError(t('No se pudo cargar el calendario laboral.','Could not load the work calendar.'));}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[accountId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const dirty=!!saved&&!!draft&&JSON.stringify([saved.workDays,saved.exceptions])!==JSON.stringify([draft.workDays,draft.exceptions]);
 function toggleDay(day:number){if(!draft)return;const next=draft.workDays.includes(day)?draft.workDays.filter(d=>d!==day):[...draft.workDays,day].sort((a,b)=>a-b);if(!next.length){setError(t('Elija al menos un día laborable.','Choose at least one working day.'));return;}setError('');setDraft({...draft,workDays:next});}
 function addException(event:FormEvent){event.preventDefault();if(!draft)return;const label=form.label.trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(form.day)||!label){setError(t('Indique la fecha y el nombre.','Enter the date and the name.'));return;}
  if(draft.exceptions.some(e=>e.day===form.day)){setError(t('Esa fecha ya está en la lista.','That date is already in the list.'));return;}
  if(draft.exceptions.length>=200){setError(t('Puede guardar hasta 200 excepciones.','You can keep up to 200 exceptions.'));return;}
  setError('');setDraft({...draft,exceptions:mergeExceptions(draft.exceptions,[{day:form.day,kind:form.kind,label:label.slice(0,80)}])});setForm({day:'',kind:'holiday',label:''});}
 function suggest(){if(!draft)return;const year=new Date().getUTCFullYear();const extra=[...crHolidaySuggestions(year,en),...crHolidaySuggestions(year+1,en)];setError('');setNotice('');setDraft({...draft,exceptions:mergeExceptions(draft.exceptions,extra)});}
 function remove(day:string){if(!draft)return;setDraft({...draft,exceptions:draft.exceptions.filter(e=>e.day!==day)});}
 async function save(){
  if(!draft||!saved||busy||!dirty)return;setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/pro/work-calendar',{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({revision:saved.revision,workDays:draft.workDays,exceptions:draft.exceptions})});
   const data=await r.json().catch(()=>({}));
   if(!r.ok){setError(typeof data.error==='string'?data.error:t('No se pudo guardar.','Could not save.'));if(r.status===409)await load();return;}
   const result=workCalendarResultSchema.parse(data),next={...draft,revision:result.revision};setSaved(next);setDraft(next);onLoaded(next);setNotice(t('Calendario guardado. El cronograma ya lo usa.','Calendar saved. The schedule now uses it.'));}
  catch{setError(t('No se pudo comprobar el guardado. Revise y reintente.','Could not confirm the save. Check and retry.'));}
  finally{setBusy(false);}
 }
 const cal=draft??defaultWorkCalendar();
 return <details data-work-calendar className="rounded-2xl border border-[#d7e1ea] bg-white p-3">
  <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-[#162543]">{t('Calendario laboral','Work calendar')}<span className="ml-2 font-normal text-[#68778d]">{draft?`${cal.workDays.length} ${t('días por semana','days a week')} · ${cal.exceptions.length} ${t('excepciones','exceptions')}`:''}</span></summary>
  {!draft?<p className="py-2 text-sm text-[#68778d]">{error||t('Cargando…','Loading…')}</p>:<div className="space-y-4 pt-2">
   <p className="text-sm text-[#52627a]">{t('El cronograma sombrea los días no laborables y cuenta los días hábiles de cada tarea. No mueve ninguna fecha por sí solo.','The schedule shades non-working days and counts the working days of each task. It never moves a date by itself.')}</p>
   <fieldset disabled={!canEdit||busy} className="min-w-0"><legend className="text-sm font-semibold">{t('Días laborables','Working days')}</legend>
    <div className="mt-2 flex flex-wrap gap-2">{WEEKDAYS.map(([day,es,english])=><label key={day} className={`inline-flex min-h-11 min-w-[3.5rem] cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${cal.workDays.includes(day)?'border-[#009FD9] bg-[#EAF7FD] text-[#007fae]':'border-[#d7e1ea] text-[#52627a]'}`}>
     <input type="checkbox" data-work-day={day} className="sr-only" checked={cal.workDays.includes(day)} onChange={()=>toggleDay(day)}/>{en?english:es}</label>)}</div>
   </fieldset>
   <div className="min-w-0"><h4 className="text-sm font-semibold">{t('Feriados y excepciones','Holidays and exceptions')}</h4>
    {cal.exceptions.length?<ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">{cal.exceptions.map((e:WorkCalendarException)=><li key={e.day} data-work-exception={e.day} className="flex min-w-0 items-center justify-between gap-2 rounded-xl bg-[#f7f9fc] px-3 py-1.5 text-sm">
     <span className="min-w-0 break-words"><span className="font-semibold">{e.day}</span> · {e.label} <span className="text-[#68778d]">({e.kind==='holiday'?t('no laborable','non-working'):t('día laborable extra','extra working day')})</span></span>
     {canEdit&&<button type="button" aria-label={t('Quitar ','Remove ')+e.day} disabled={busy} onClick={()=>remove(e.day)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#68778d] hover:text-[#9b1c1c]"><X aria-hidden="true" className="h-4 w-4"/></button>}</li>)}</ul>
    :<p className="mt-1 text-sm text-[#68778d]">{t('Todavía no hay excepciones.','No exceptions yet.')}</p>}
   </div>
   {canEdit&&<form onSubmit={addException} className="grid min-w-0 gap-2 sm:grid-cols-[10rem_11rem_minmax(0,1fr)_auto] sm:items-end">
    <label className="block text-sm font-semibold">{t('Fecha','Date')}<input type="date" required min="1900-01-01" max="2100-12-31" value={form.day} onChange={e=>setForm({...form,day:e.target.value})} className={input}/></label>
    <label className="block text-sm font-semibold">{t('Tipo','Type')}<select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value as 'holiday'|'workday'})} className={input}><option value="holiday">{t('Feriado (no laborable)','Holiday (non-working)')}</option><option value="workday">{t('Día laborable extra','Extra working day')}</option></select></label>
    <label className="block text-sm font-semibold">{t('Nombre','Name')}<input required maxLength={80} value={form.label} onChange={e=>setForm({...form,label:e.target.value})} className={input}/></label>
    <Button type="submit" variant="secondary" className="min-h-11" disabled={busy}>{t('Agregar','Add')}</Button></form>}
   {canEdit&&<div className="flex flex-wrap items-center gap-2"><Button type="button" variant="secondary" data-work-calendar-suggest className="h-auto min-h-11 max-w-full whitespace-normal py-2 text-center" disabled={busy} onClick={suggest}>{t('Agregar feriados sugeridos de Costa Rica','Add suggested Costa Rica holidays')}</Button>
    <span className="text-xs text-[#68778d]">{t('Es una sugerencia: confirme las fechas con el calendario oficial del Ministerio de Trabajo antes de guardar.','This is a suggestion: confirm the dates with the official Ministry of Labor calendar before saving.')}</span></div>}
   {canEdit&&<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" className="min-h-11" disabled={busy||!dirty} onClick={()=>{setDraft(saved);setError('');}}>{t('Descartar cambios','Discard changes')}</Button><Button type="button" data-work-calendar-save className="min-h-11" disabled={busy||!dirty} onClick={()=>void save()}>{busy?t('Guardando…','Saving…'):t('Guardar calendario','Save calendar')}</Button></div>}
   {!canEdit&&<p className="text-xs text-[#68778d]">{t('Solo el propietario puede cambiar el calendario.','Only the owner can change the calendar.')}</p>}
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-[#0b6b3a]">{notice}</p>}
   <PersonWorkdaysPanel accountId={accountId} canEdit={canEdit}/>
  </div>}
 </details>;
}
