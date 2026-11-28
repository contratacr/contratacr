'use client';
import {useMemo,useState} from 'react';
import {Button} from '@/components/ui/button';
import type {Gantt,GanttMilestone,GanttTask} from '@/lib/pro/project-schedule';
import {calendarEntries,monthGrid,monthStart,sameMonth,shiftMonth} from '@/lib/pro/schedule-views';

/** Month calendar of the job schedule (Monday first): tasks on each planned day, key dates as diamonds. */
export function ScheduleCalendar({data,en,disabled,visible,onTask,onMilestone}:{data:Gantt;en:boolean;disabled:boolean;visible:(t:GanttTask)=>boolean;onTask?:(t:GanttTask)=>void;onMilestone?:(m:GanttMilestone)=>void}){
 const t=(es:string,english:string)=>en?english:es;
 const [first,setFirst]=useState(()=>monthStart(data.today));
 const weeks=useMemo(()=>monthGrid(first),[first]);
 const entries=useMemo(()=>calendarEntries(data.tasks,data.milestones,visible),[data.tasks,data.milestones,visible]);
 const title=new Intl.DateTimeFormat(en?'en-US':'es-CR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(first+'T12:00:00Z'));
 const names=Array.from({length:7},(_,i)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{weekday:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2024,0,1+i,12))));
 return <div data-schedule-calendar className="min-w-0 space-y-2">
  <div className="flex flex-wrap items-center gap-2">
   <Button type="button" variant="secondary" className="min-h-11" data-calendar-prev aria-label={t('Mes anterior','Previous month')} onClick={()=>setFirst(shiftMonth(first,-1))}>‹</Button>
   <Button type="button" variant="secondary" className="min-h-11" data-calendar-next aria-label={t('Mes siguiente','Next month')} onClick={()=>setFirst(shiftMonth(first,1))}>›</Button>
   <h4 data-calendar-title className="min-w-0 flex-1 text-base font-semibold capitalize text-[#162543]">{title}</h4>
   <Button type="button" variant="secondary" className="min-h-11" data-calendar-today onClick={()=>setFirst(monthStart(data.today))}>{t('Hoy','Today')}</Button>
  </div>
  <div role="grid" aria-label={t('Calendario del cronograma','Schedule calendar')} className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-[#d7e1ea] bg-[#d7e1ea]">
   {names.map(n=><div key={n} role="columnheader" className="min-w-0 bg-[#f7f9fc] p-1 text-center text-xs font-semibold capitalize text-[#52627a]">{n}</div>)}
   {weeks.flat().map(day=>{const list=entries.get(day)??[],shown=list.slice(0,3),isToday=day===data.today;
    return <div key={day} role="gridcell" data-calendar-day={day} className={`min-h-16 min-w-0 space-y-0.5 p-1 sm:min-h-24 ${sameMonth(day,first)?'bg-white':'bg-[#f7f9fc] text-[#7a879a]'}`}>
     <p className={`text-xs font-semibold ${isToday?'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#008bb5] px-1 text-white':''}`}>{Number(day.slice(8))}</p>
     {shown.map(e=>{const label=e.title,cls=e.kind==='milestone'?'bg-[#fff1e3] text-[#7a3a06]':e.status==='done'?'bg-[#eef8f4] text-[#18573a] line-through':'bg-[#eaf5fb] text-[#006e90]';
      const click=e.kind==='task'?(onTask?()=>onTask(e.task):undefined):(onMilestone?()=>onMilestone(e.milestone):undefined);
      return click?<button key={e.kind+e.id} type="button" disabled={disabled} data-calendar-entry={e.kind} title={label} onClick={click} className={`block w-full min-w-0 whitespace-normal break-words rounded px-1 [overflow-wrap:anywhere] text-left text-[11px] ${cls}`}>{label}</button>:<span key={e.kind+e.id} data-calendar-entry={e.kind} title={label} className={`block min-w-0 whitespace-normal break-words rounded px-1 [overflow-wrap:anywhere] text-[11px] ${cls}`}>{label}</span>;})}
     {list.length>3&&<p className="text-[11px] text-[#52627a]">{t(`+${list.length-3} más`,`+${list.length-3} more`)}</p>}
    </div>;})}
  </div>
 </div>;
}
