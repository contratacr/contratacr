import {z} from 'zod';
import {workTaskSchema,taskDueDate} from './work-tasks';
const workId=z.string().min(1).max(160),stage=z.enum(['new','quoting','scheduled','completed']);
export const taskCenterQuerySchema=z.object({status:z.enum(['open','done','all']).default('open'),timing:z.enum(['all','overdue','today','upcoming']).default('all'),q:z.string().trim().max(100).default(''),after:z.string().uuid().optional()}).strict();
export const taskCenterJobsQuerySchema=z.object({view:z.literal('jobs'),q:z.string().trim().max(100).default(''),after:workId.optional()}).strict();
export type TaskCenterQuery=z.infer<typeof taskCenterQuerySchema>;
export const taskCenterItemSchema=z.object({task:workTaskSchema.strict(),work:z.object({id:workId,service:z.string().max(160),client:z.string().max(160),stage,cancelled:z.boolean()}).strict()}).strict().refine(value=>value.task.workId===value.work.id&&!value.task.archived,'Invalid task/job context.');
export type TaskCenterItem=z.infer<typeof taskCenterItemSchema>;
/** Counts describe the search scope only, independent of selected status/timing. */
export const taskCenterPageSchema=z.object({items:z.array(taskCenterItemSchema).max(20),nextCursor:z.string().uuid().nullable(),counts:z.object({open:z.number().int().nonnegative(),done:z.number().int().nonnegative(),overdue:z.number().int().nonnegative()}).strict()}).strict().superRefine((value,context)=>{
 if(value.counts.overdue>value.counts.open||new Set(value.items.map(item=>item.task.id)).size!==value.items.length||value.nextCursor!==null&&value.items.at(-1)?.task.id!==value.nextCursor)context.addIssue({code:'custom',message:'Invalid task-center page.'});
});
export type TaskCenterPage=z.infer<typeof taskCenterPageSchema>;
export const taskCenterJobSchema=z.object({id:workId,service:z.string().max(160),client:z.string().max(160),start:z.string(),stage,cancelled:z.literal(false)}).strict();
export type TaskCenterJob=z.infer<typeof taskCenterJobSchema>;
export const taskCenterJobsPageSchema=z.object({items:z.array(taskCenterJobSchema).max(20),nextCursor:workId.nullable()}).strict().superRefine((value,context)=>{
 if(new Set(value.items.map(item=>item.id)).size!==value.items.length||value.nextCursor!==null&&value.items.at(-1)?.id!==value.nextCursor)context.addIssue({code:'custom',message:'Invalid job-picker page.'});
});
export type TaskCenterJobsPage=z.infer<typeof taskCenterJobsPageSchema>;

/** Separate read-only metadata; legacy TaskCenterItem remains unchanged for writes/exports. */
// Round 9: optional job and responsible filters (assignee '~none' = unassigned).
export const taskCenterPlanningQuerySchema=taskCenterQuerySchema.extend({view:z.literal('planning'),workId:workId.optional(),assignee:z.string().trim().min(1).max(161).optional()}).strict();
export const taskCenterOptionsSchema=z.object({jobs:z.array(z.object({id:z.string(),service:z.string(),client:z.string()})),assignees:z.array(z.string())});
export type TaskCenterOptions=z.infer<typeof taskCenterOptionsSchema>;
export const taskCenterPlanningContextSchema=z.object({taskId:z.string().uuid(),assignment:z.object({grantId:z.string().uuid(),name:z.string().max(160),active:z.boolean()}).strict().nullable(),plan:z.object({phaseId:z.string().uuid().nullable(),phaseName:z.string().min(1).max(160).nullable(),phaseArchived:z.boolean(),plannedStart:taskDueDate,plannedEnd:taskDueDate}).strict().superRefine((value,context)=>{
 if(value.phaseId===null&&(value.phaseName!==null||value.phaseArchived)||value.phaseId!==null&&value.phaseName===null||(value.plannedStart===null)!==(value.plannedEnd===null)||value.plannedStart!==null&&value.plannedEnd!==null&&value.plannedStart>value.plannedEnd)context.addIssue({code:'custom',message:'Invalid planning context.'});
}).nullable()}).strict();
export const taskCenterPlanningPageSchema=z.object({page:taskCenterPageSchema,context:z.array(taskCenterPlanningContextSchema).max(20)}).strict().superRefine((value,context)=>{
 if(value.context.length!==value.page.items.length||value.context.some((item,index)=>item.taskId!==value.page.items[index]?.task.id))context.addIssue({code:'custom',message:'Planning metadata must match the task page exactly.'});
});
export type TaskCenterPlanningContext=z.infer<typeof taskCenterPlanningContextSchema>;
export type TaskCenterPlanningPage=z.infer<typeof taskCenterPlanningPageSchema>;
