import {z} from 'zod';
import {civilAddDays,civilDayDiff} from '@/lib/pro/gantt-edit';

/**
 * Row 13 (work calendar): which weekdays a company works and its holiday / extra-workday exceptions. Used by the Gantt
 * (shading, working-day counts, warnings, "adjust to working days"). It never moves a task by itself: dates stay
 * whatever the person saved; the calendar only informs and offers an explicit adjustment.
 */
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const workCalendarExceptionSchema=z.object({day,kind:z.enum(['holiday','workday']),label:z.string().trim().min(1).max(80)}).strict();
export const workCalendarSchema=z.object({
 revision:z.number().int().min(0),
 workDays:z.array(z.number().int().min(0).max(6)).min(1).max(7),
 exceptions:z.array(workCalendarExceptionSchema).max(200),
}).strict();
export type WorkCalendar=z.infer<typeof workCalendarSchema>;
export type WorkCalendarException=z.infer<typeof workCalendarExceptionSchema>;
export const workCalendarMutationSchema=z.object({
 revision:z.number().int().min(0),
 workDays:z.array(z.number().int().min(0).max(6)).min(1).max(7),
 exceptions:z.array(workCalendarExceptionSchema).max(200),
}).strict();
export const workCalendarResultSchema=z.object({revision:z.number().int().min(1)}).strict();

export const DEFAULT_WORK_DAYS:readonly number[]=[1,2,3,4,5];
export const defaultWorkCalendar=():WorkCalendar=>({revision:0,workDays:[...DEFAULT_WORK_DAYS],exceptions:[]});

/** 0 = Sunday … 6 = Saturday, from a civil day (UTC arithmetic: no time zone shifts). */
export const civilWeekday=(value:string)=>new Date(value+'T00:00:00Z').getUTCDay();

/** True when the company works that day: a listed exception wins, otherwise the weekday decides. */
export function isWorkingDay(calendar:WorkCalendar|null|undefined,value:string){
 const cal=calendar??defaultWorkCalendar();
 const exception=cal.exceptions.find(e=>e.day===value);
 if(exception)return exception.kind==='workday';
 return cal.workDays.includes(civilWeekday(value));
}
/** Working days in the closed period [start, end] (0 when the end is before the start). */
export function workingDaysBetween(calendar:WorkCalendar|null|undefined,start:string,end:string){
 const total=civilDayDiff(start,end)+1;if(total<=0||total>3700)return 0;
 let count=0;for(let i=0;i<total;i++)if(isWorkingDay(calendar,civilAddDays(start,i)))count++;return count;
}
/** First working day at or after (direction 1) / at or before (direction -1) `value`; the same day when none exists within a year. */
export function nearestWorkingDay(calendar:WorkCalendar|null|undefined,value:string,direction:1|-1){
 for(let i=0;i<=366;i++){const candidate=civilAddDays(value,i*direction);if(isWorkingDay(calendar,candidate))return candidate;}
 return value;
}
/** Period with the start moved forward and the end moved back to working days (never crossing; same period when nothing is left). */
export function adjustPeriodToWorkingDays(calendar:WorkCalendar|null|undefined,start:string,end:string){
 const s=nearestWorkingDay(calendar,start,1),e=nearestWorkingDay(calendar,end,-1);
 return s<=e?{start:s,end:e}:{start,end};
}

/** Gregorian Easter Sunday (Anonymous algorithm) as a civil day. */
export function easterSunday(year:number){
 const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
 const month=Math.floor((h+l-7*m+114)/31),dayOfMonth=((h+l-7*m+114)%31)+1;
 return `${year}-${String(month).padStart(2,'0')}-${String(dayOfMonth).padStart(2,'0')}`;
}
/**
 * SUGGESTED Costa Rica holidays of a year (fixed dates plus Holy Thursday and Good Friday). It is only a starting
 * point the person reviews and edits: Costa Rica moves some holidays by law in certain years, so the official
 * calendar of the Ministerio de Trabajo is the reference.
 */
export function crHolidaySuggestions(year:number,en:boolean):WorkCalendarException[]{
 const fixed:[string,string,string][]=[
  ['01-01','Año Nuevo','New Year'],['04-11','Día de Juan Santamaría','Juan Santamaría Day'],['05-01','Día del Trabajo','Labor Day'],
  ['07-25','Anexión del Partido de Nicoya','Annexation of Nicoya'],['08-02','Virgen de los Ángeles','Our Lady of the Angels'],['08-15','Día de la Madre','Mother\'s Day'],
  ['08-31','Día de la Persona Negra y la Cultura Afrocostarricense','Day of Black Persons and Afro-Costa Rican Culture'],['09-15','Independencia','Independence Day'],
  ['12-01','Abolición del Ejército','Abolition of the Army'],['12-25','Navidad','Christmas'],
 ];
 const easter=easterSunday(year);
 return [
  ...fixed.map(([md,es,english])=>({day:`${year}-${md}`,kind:'holiday' as const,label:en?english:es})),
  {day:civilAddDays(easter,-3),kind:'holiday' as const,label:en?'Holy Thursday':'Jueves Santo'},
  {day:civilAddDays(easter,-2),kind:'holiday' as const,label:en?'Good Friday':'Viernes Santo'},
 ].sort((x,y)=>x.day<y.day?-1:1);
}
/** Merge suggestions into the current exceptions without touching a day the person already listed. */
export function mergeExceptions(current:readonly WorkCalendarException[],extra:readonly WorkCalendarException[]){
 const taken=new Set(current.map(e=>e.day));
 return [...current,...extra.filter(e=>!taken.has(e.day))].sort((x,y)=>x.day<y.day?-1:1).slice(0,200);
}

/** Row 13 (migration 561): a civil date a person does not work (vacation, leave); never a working day for their tasks. */
const personDayOff=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v&&v>='2000-01-01'&&v<='2100-12-31';});
/** Row 13: working weekdays per person (0 = Sunday ... 6 = Saturday). `workDays` null = follows the company calendar. */
export const personWorkdaysSchema=z.object({people:z.array(z.object({personId:z.string().uuid(),name:z.string().min(1).max(160),workDays:z.array(z.number().int().min(0).max(6)).min(1).max(7).nullable(),revision:z.number().int().min(0),daysOff:z.array(personDayOff).max(60).default([]),daysOffRevision:z.number().int().min(0).default(0)}).strict()).max(300)}).strict();
export type PersonWorkdays=z.infer<typeof personWorkdaysSchema>;
export const personWorkdaysMutationSchema=z.union([
 z.object({action:z.literal('set'),personId:z.string().uuid(),revision:z.number().int().min(0),workDays:z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(d=>new Set(d).size===d.length)}).strict(),
 z.object({action:z.literal('clear'),personId:z.string().uuid(),revision:z.number().int().min(1)}).strict(),
 z.object({action:z.literal('days_off'),personId:z.string().uuid(),revision:z.number().int().min(0),daysOff:z.array(personDayOff).max(60).refine(d=>new Set(d).size===d.length)}).strict(),
]);
export const personWorkdaysResultSchema=z.object({personId:z.string().uuid(),revision:z.number().int().min(0)}).strict();
