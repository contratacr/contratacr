import {z} from 'zod';
import {taskDueDate} from './work-tasks';
const id=z.string().uuid(),workId=z.string().min(1).max(160),revision=z.number().int().nonnegative().max(2147483647);
export const workSchedulePhaseSchema=z.object({id,title:z.string().trim().min(1).max(160),position:z.number().int().min(0).max(999),archived:z.boolean()}).strict();
export const workSchedulePlanSchema=z.object({taskId:id,phaseId:id.nullable(),plannedStart:taskDueDate,plannedEnd:taskDueDate,dependsOn:z.array(id).max(5).refine(a=>new Set(a).size===a.length)}).strict().refine(v=>(v.plannedStart===null)===(v.plannedEnd===null)&&(v.plannedStart===null||v.plannedEnd!==null&&v.plannedStart<=v.plannedEnd),'Período inválido.');
const task=z.object({id,title:z.string().min(1).max(160),status:z.enum(['open','done']),dueDate:taskDueDate,revision:z.number().int().positive()}).strict();
export const workScheduleItemSchema=z.object({task,plan:workSchedulePlanSchema,dependencies:z.array(z.object({taskId:id,title:z.string().max(160).nullable(),status:z.enum(['open','done']).nullable(),available:z.boolean()}).strict()).max(5)}).strict().refine(v=>v.task.id===v.plan.taskId);
export const workSchedulePageSchema=z.object({workId,revision,phases:z.array(workSchedulePhaseSchema).max(50),items:z.array(workScheduleItemSchema).max(20),nextCursor:id.nullable()}).strict();
export const workScheduleOptionsPageSchema=z.object({items:z.array(z.object({id,title:z.string().min(1).max(160)}).strict()).max(20),nextCursor:id.nullable()}).strict();
export const workScheduleMilestoneSchema=z.object({id,title:z.string().trim().min(1).max(160),date:taskDueDate.unwrap(),notes:z.string().trim().max(1000),archived:z.boolean()}).strict();
export const workScheduleMilestonesPageSchema=z.object({workId,revision,items:z.array(workScheduleMilestoneSchema).max(20),nextCursor:id.nullable()}).strict();
const base={actionId:id,workId,revision:z.number().int().nonnegative().max(2147483646)};
export const workScheduleMutationSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('phase_save'),phaseId:id,title:z.string().trim().min(1).max(160),position:z.number().int().min(0).max(999)}).strict(),
 z.object({...base,action:z.literal('phase_archive'),phaseId:id}).strict(),
 z.object({...base,action:z.literal('task_plan'),taskId:id,phaseId:id.nullable(),plannedStart:taskDueDate,plannedEnd:taskDueDate,dependsOn:z.array(id).max(5).refine(a=>new Set(a).size===a.length)}).strict(),
 z.object({...base,action:z.literal('task_clear'),taskId:id}).strict(),
 z.object({...base,action:z.literal('milestone_save'),milestoneId:id,title:z.string().trim().min(1).max(160),date:taskDueDate.unwrap(),notes:z.string().trim().max(1000)}).strict(),
 z.object({...base,action:z.enum(['milestone_archive','milestone_restore']),milestoneId:id}).strict(),
]).superRefine((v,c)=>{if(v.action==='task_plan'&&((v.plannedStart===null)!==(v.plannedEnd===null)||v.plannedStart!==null&&v.plannedEnd!==null&&v.plannedStart>v.plannedEnd||v.dependsOn.includes(v.taskId)))c.addIssue({code:'custom',message:'Período o dependencia inválidos.'});});
/** Round 4B: create a job task with its planned period from the timeline (one transaction, idempotent by actionId). */
export const workTimelineTaskCreateSchema=z.object({...base,action:z.literal('timeline_task_create'),taskId:id,title:z.string().trim().min(1).max(160),phaseId:id.nullable(),plannedStart:taskDueDate.unwrap(),plannedEnd:taskDueDate.unwrap()}).strict().refine(v=>v.plannedStart<=v.plannedEnd,'Período inválido.');
export type WorkTimelineTaskCreate=z.infer<typeof workTimelineTaskCreateSchema>;
export const workScheduleResultSchema=z.discriminatedUnion('action',[
 z.object({action:z.enum(['phase_save','phase_archive']),workId,revision,phase:workSchedulePhaseSchema}).strict(),
 z.object({action:z.enum(['task_plan','task_clear']),workId,revision,plan:workSchedulePlanSchema}).strict(),
 z.object({action:z.enum(['milestone_save','milestone_archive','milestone_restore']),workId,revision,milestone:workScheduleMilestoneSchema}).strict(),
]);
export type WorkSchedulePhase=z.infer<typeof workSchedulePhaseSchema>;
export type WorkSchedulePlan=z.infer<typeof workSchedulePlanSchema>;
export type WorkScheduleItem=z.infer<typeof workScheduleItemSchema>;
export type WorkSchedulePage=z.infer<typeof workSchedulePageSchema>;
export type WorkScheduleOptionsPage=z.infer<typeof workScheduleOptionsPageSchema>;
export type WorkScheduleMutation=z.infer<typeof workScheduleMutationSchema>;
export type WorkScheduleResult=z.infer<typeof workScheduleResultSchema>;
export type WorkScheduleMilestone=z.infer<typeof workScheduleMilestoneSchema>;
export type WorkScheduleMilestonesPage=z.infer<typeof workScheduleMilestonesPageSchema>;
