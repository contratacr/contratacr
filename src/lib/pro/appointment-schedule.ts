import {z} from 'zod';
const time=z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v;});
const block=z.object({weekday:z.number().int().min(1).max(7),start:time,end:time}).strict().refine(v=>v.end>v.start);
export const scheduleInput=z.object({revision:z.number().int().nonnegative(),actionId:z.string().uuid(),durationMinutes:z.number().int().min(15).max(480).multipleOf(15),weekly:z.array(block).max(28),closedDates:z.array(date).max(90)}).strict().superRefine((v,c)=>{if(new Set(v.closedDates).size!==v.closedDates.length)c.addIssue({code:'custom',message:'Duplicate date'});for(let i=0;i<v.weekly.length;i++)for(let j=0;j<i;j++){const a=v.weekly[i],b=v.weekly[j];if(a.weekday===b.weekday&&a.start<b.end&&b.start<a.end)c.addIssue({code:'custom',message:'Overlapping hours'});}});
export type AppointmentSchedule=Omit<z.infer<typeof scheduleInput>,'actionId'>;
