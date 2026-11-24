import type {GanttMilestone,GanttTask} from '@/lib/pro/project-schedule';

/**
 * Pure helpers for the schedule calendar view (month grid, Monday first), the schedule status
 * filter and the project overview "Upcoming" widget. Dates are civil days (YYYY-MM-DD) handled in
 * UTC so the result never depends on the browser time zone.
 */
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const MS=86400000;
const toUtc=(iso:string)=>Date.UTC(Number(iso.slice(0,4)),Number(iso.slice(5,7))-1,Number(iso.slice(8,10)));
const toIso=(ms:number)=>new Date(ms).toISOString().slice(0,10);

export function addDays(iso:string,days:number){return toIso(toUtc(iso)+days*MS);}
/** 0 = Monday … 6 = Sunday. */
export function mondayIndex(iso:string){return (new Date(toUtc(iso)).getUTCDay()+6)%7;}
export function monthStart(iso:string){return iso.slice(0,8)+'01';}
export function shiftMonth(first:string,delta:number){const d=new Date(toUtc(first));return toIso(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+delta,1));}
export function sameMonth(a:string,b:string){return a.slice(0,7)===b.slice(0,7);}

/** Weeks (Monday first) that cover the month of `first`; always whole weeks, 4 to 6 rows. */
export function monthGrid(first:string):string[][]{
 const start=addDays(first,-mondayIndex(first)),weeks:string[][]=[];
 for(let w=0;w<6;w+=1){const row=Array.from({length:7},(_,i)=>addDays(start,w*7+i));if(w>=4&&!sameMonth(row[0],first))break;weeks.push(row);}
 return weeks;
}

export type StatusFilter='all'|'open'|'done';
export const statusFilters:StatusFilter[]=['all','open','done'];
export function matchesStatus(task:Pick<GanttTask,'status'>,filter:StatusFilter){return filter==='all'||task.status===filter;}

export type CalendarEntry={kind:'task';id:string;title:string;status:'open'|'done';task:GanttTask}|{kind:'milestone';id:string;title:string;milestone:GanttMilestone};
/** Days a task bar can cover in the calendar (guards a corrupt range). */
const SPAN_LIMIT=400;

/** Entries per civil day: a task appears on each day of its planned period, a key date on its date. */
export function calendarEntries(tasks:GanttTask[],milestones:GanttMilestone[],visible:(task:GanttTask)=>boolean=()=>true){
 const map=new Map<string,CalendarEntry[]>();
 const push=(day:string,entry:CalendarEntry)=>{const list=map.get(day);if(list)list.push(entry);else map.set(day,[entry]);};
 for(const task of tasks){
  if(!task.plannedStart||!DAY.test(task.plannedStart)||!visible(task))continue;
  const end=task.plannedEnd&&DAY.test(task.plannedEnd)&&task.plannedEnd>=task.plannedStart?task.plannedEnd:task.plannedStart;
  for(let day=task.plannedStart,n=0;day<=end&&n<SPAN_LIMIT;day=addDays(day,1),n+=1)push(day,{kind:'task',id:task.id,title:task.title,status:task.status,task});
 }
 for(const milestone of milestones)if(DAY.test(milestone.date))push(milestone.date,{kind:'milestone',id:milestone.id,title:milestone.title,milestone});
 return map;
}

export type UpcomingRange='today'|'week'|'next';
export type UpcomingType='all'|'task'|'schedule';
export type UpcomingItem={key:string;type:'task'|'schedule';reason:'due'|'start'|'key_date';id:string;title:string;date:string};

/** Today alone, the rest of this week (tomorrow to Sunday) and next week (Monday to Sunday). */
export function upcomingBounds(today:string):Record<UpcomingRange,{from:string;to:string}>{
 const sunday=addDays(today,6-mondayIndex(today)),nextMonday=addDays(sunday,1);
 return{today:{from:today,to:today},week:{from:addDays(today,1),to:sunday},next:{from:nextMonday,to:addDays(nextMonday,6)}};
}

/** Open work that falls in the three windows: due dates (tasks) and starts or key dates (schedule). */
export function upcomingItems(today:string,tasks:GanttTask[],milestones:GanttMilestone[]):UpcomingItem[]{
 const out:UpcomingItem[]=[];
 for(const task of tasks){
  if(task.status!=='open')continue;
  if(task.dueDate&&DAY.test(task.dueDate))out.push({key:'d'+task.id,type:'task',reason:'due',id:task.id,title:task.title,date:task.dueDate});
  if(task.plannedStart&&DAY.test(task.plannedStart))out.push({key:'s'+task.id,type:'schedule',reason:'start',id:task.id,title:task.title,date:task.plannedStart});
 }
 for(const milestone of milestones)if(DAY.test(milestone.date))out.push({key:'m'+milestone.id,type:'schedule',reason:'key_date',id:milestone.id,title:milestone.title,date:milestone.date});
 return out.filter(item=>item.date>=today).sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
}

export function inRange(items:UpcomingItem[],bounds:{from:string;to:string},type:UpcomingType){
 return items.filter(item=>item.date>=bounds.from&&item.date<=bounds.to&&(type==='all'||item.type===type));
}
