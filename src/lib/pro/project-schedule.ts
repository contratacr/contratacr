import {z} from 'zod';
import {taskDueDate} from './work-tasks';

/** Project schedule (Gantt) over the existing plan, with immutable baselines (families 13/79). */
const day=taskDueDate.unwrap(),optionalDay=taskDueDate,id=z.string().uuid(),workId=z.string().min(1).max(160),variance=z.number().int().nullable();
export const scheduleBaselineSchema=z.object({id,title:z.string().min(1).max(120),capturedAt:z.string(),scheduleRevision:z.number().int().nonnegative(),taskCount:z.number().int().nonnegative(),milestoneCount:z.number().int().nonnegative()}).strict();
export const ganttTaskSchema=z.object({id,title:z.string().min(1).max(160),status:z.enum(['open','done']),revision:z.number().int().positive(),dueDate:optionalDay,phaseId:id.nullable(),plannedStart:optionalDay,plannedEnd:optionalDay,dependsOn:z.array(id).max(5),baselineStart:optionalDay,baselineEnd:optionalDay,startVarianceDays:variance,endVarianceDays:variance}).strict();
export const ganttPhaseSchema=z.object({id,title:z.string().min(1).max(160),position:z.number().int(),plannedStart:optionalDay,plannedEnd:optionalDay,taskCount:z.number().int().nonnegative(),doneCount:z.number().int().nonnegative(),baselineStart:optionalDay,baselineEnd:optionalDay,endVarianceDays:variance}).strict();
export const ganttMilestoneSchema=z.object({id,title:z.string().min(1).max(160),date:day,notes:z.string().max(1000),baselineDate:optionalDay,varianceDays:variance}).strict();
export const ganttSchema=z.object({workId,revision:z.number().int().nonnegative(),today:day,plannedStart:optionalDay,plannedEnd:optionalDay,baseline:scheduleBaselineSchema.nullable(),baselineEnd:optionalDay,endVarianceDays:variance,baselines:z.array(scheduleBaselineSchema).max(20),phases:z.array(ganttPhaseSchema).max(50),tasks:z.array(ganttTaskSchema).max(500),milestones:z.array(ganttMilestoneSchema).max(500),showSchedule:z.boolean()}).strict();
export type Gantt=z.infer<typeof ganttSchema>;
export type GanttTask=z.infer<typeof ganttTaskSchema>;
export type GanttPhase=z.infer<typeof ganttPhaseSchema>;
export type GanttMilestone=z.infer<typeof ganttMilestoneSchema>;
export type ScheduleBaseline=z.infer<typeof scheduleBaselineSchema>;

export const baselineMutationSchema=z.object({action:z.literal('baseline_save'),actionId:id,workId,revision:z.number().int().nonnegative().max(2147483646),title:z.string().trim().min(1).max(120)}).strict();
export type BaselineMutation=z.infer<typeof baselineMutationSchema>;
export const baselineResultSchema=z.object({baseline:scheduleBaselineSchema}).strict();

const clientRow={plannedStart:optionalDay,plannedEnd:optionalDay,total:z.number().int().nonnegative(),done:z.number().int().nonnegative()};
export const clientScheduleSchema=z.union([
 z.object({visible:z.literal(false)}).strict(),
 z.object({visible:z.literal(true),today:day,phases:z.array(z.object({title:z.string().min(1).max(160),...clientRow}).strict()).max(50),general:z.object(clientRow).strict().nullable(),milestones:z.array(z.object({title:z.string().min(1).max(160),date:day}).strict()).max(200)}).strict(),
]);
export type ClientSchedule=z.infer<typeof clientScheduleSchema>;

/** Signed civil-day difference, e.g. +3 = three days later than the baseline. */
export function dayDiff(from:string,to:string){return Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000);}
export function addDays(value:string,days:number){const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
