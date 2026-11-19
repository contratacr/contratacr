import {z} from 'zod';
import {taskDueDate} from './work-tasks';
import {workScheduleItemSchema,workScheduleMilestoneSchema,workSchedulePhaseSchema} from './work-schedule';
const day=taskDueDate.unwrap(),id=z.string().uuid(),revision=z.number().int().nonnegative().max(2147483647);
export const workTimelineCursorSchema=z.string().max(48).refine(v=>/^(task|milestone):/.test(v)&&id.safeParse(v.slice(v.indexOf(':')+1)).success,'Invalid timeline cursor.');
const dayNumber=(value:string)=>Date.parse(value+'T00:00:00Z')/86400000;
export const workTimelineQuerySchema=z.object({view:z.literal('timeline'),workId:z.string().min(1).max(160).optional(),grantId:id.optional(),from:day,to:day,after:workTimelineCursorSchema.optional(),atSnapshot:z.string().regex(/^[a-f0-9]{32}$/).optional(),atRevision:z.string().regex(/^(0|[1-9][0-9]{0,9})$/).transform(Number).pipe(revision).optional()}).strict().superRefine((v,c)=>{
 if((v.workId===undefined)===(v.grantId===undefined)||v.after!==undefined&&(v.atRevision===undefined||v.atSnapshot===undefined))c.addIssue({code:'custom',message:'Invalid timeline scope or revision.'});
 const days=dayNumber(v.to)-dayNumber(v.from)+1;if(!Number.isInteger(days)||days<1||days>93)c.addIssue({code:'custom',message:'Invalid timeline window.'});
});
const clipping={visibleStart:day,visibleEnd:day,clippedStart:z.boolean(),clippedEnd:z.boolean()};
export const workTimelineEntrySchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('task'),id,item:workScheduleItemSchema,...clipping}).strict(),
 z.object({kind:z.literal('milestone'),id,milestone:workScheduleMilestoneSchema,...clipping,clippedStart:z.literal(false),clippedEnd:z.literal(false)}).strict(),
]).superRefine((v,c)=>{
 if(v.visibleStart>v.visibleEnd)c.addIssue({code:'custom',message:'Invalid visible period.'});
 if(v.kind==='task'){const p=v.item.plan;if(v.id!==v.item.task.id||!p.plannedStart||!p.plannedEnd||p.plannedStart>v.visibleStart||p.plannedEnd<v.visibleEnd||v.clippedStart!==(p.plannedStart<v.visibleStart)||v.clippedEnd!==(p.plannedEnd>v.visibleEnd))c.addIssue({code:'custom',message:'Invalid task source or clipping.'});}
 else if(v.id!==v.milestone.id||v.milestone.archived||v.visibleStart!==v.milestone.date||v.visibleEnd!==v.milestone.date)c.addIssue({code:'custom',message:'Invalid milestone source.'});
});
export const workTimelinePageSchema=z.object({workId:z.string().min(1).max(160),revision,snapshotToken:z.string().regex(/^[a-f0-9]{32}$/),window:z.object({from:day,to:day,days:z.number().int().min(1).max(93)}).strict(),phases:z.array(workSchedulePhaseSchema.refine(v=>!v.archived)).max(50),items:z.array(workTimelineEntrySchema).max(20),nextCursor:workTimelineCursorSchema.nullable(),counts:z.object({plannedTasks:z.number().int().nonnegative(),milestones:z.number().int().nonnegative(),unscheduledTasks:z.number().int().nonnegative()}).strict()}).strict().superRefine((v,c)=>{
 if(dayNumber(v.window.to)-dayNumber(v.window.from)+1!==v.window.days||new Set(v.items.map(i=>i.kind+':'+i.id)).size!==v.items.length)c.addIssue({code:'custom',message:'Invalid timeline window or entries.'});
 for(const i of v.items){if(i.visibleStart<v.window.from||i.visibleEnd>v.window.to)c.addIssue({code:'custom',message:'Entry outside window.'});if(i.kind==='task'){const p=i.item.plan;if(i.visibleStart!==(p.plannedStart!<v.window.from?v.window.from:p.plannedStart)||i.visibleEnd!==(p.plannedEnd!>v.window.to?v.window.to:p.plannedEnd))c.addIssue({code:'custom',message:'Clipping differs from window.'});}}
});
export type WorkTimelineQuery=z.infer<typeof workTimelineQuerySchema>;
export type WorkTimelineEntry=z.infer<typeof workTimelineEntrySchema>;
export type WorkTimelinePage=z.infer<typeof workTimelinePageSchema>;
