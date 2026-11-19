import {z} from 'zod';
import {taskDueDate} from './work-tasks';
const id=z.string().uuid(),workId=z.string().min(1).max(160),revision=z.number().int().positive().max(2147483647),inputRevision=z.number().int().nonnegative().max(2147483646);
export const taskTemplateRowSchema=z.object({id,title:z.string().trim().min(1).max(160),details:z.string().trim().max(2000),assignee:z.string().trim().max(160),dueOffset:z.number().int().min(-80000).max(80000).nullable()}).strict();
const rows=z.array(taskTemplateRowSchema).min(1).max(100).refine(v=>new Set(v.map(r=>r.id)).size===v.length);
export const taskTemplateSummarySchema=z.object({id,name:z.string().trim().min(1).max(80),notes:z.string().trim().max(1000),revision,archived:z.boolean(),count:z.number().int().min(1).max(100)}).strict();
export const taskTemplateDetailSchema=taskTemplateSummarySchema.extend({rows}).strict().refine(v=>v.rows.length===v.count);
export const taskTemplateListSchema=z.object({items:z.array(taskTemplateSummarySchema).max(20),nextCursor:id.nullable()}).strict().refine(v=>new Set(v.items.map(i=>i.id)).size===v.items.length&&(v.nextCursor===null||v.items.at(-1)?.id===v.nextCursor));
const base={actionId:id,templateId:id,revision:inputRevision},identityArray=z.array(id).min(1).max(100).refine(v=>new Set(v).size===v.length);
export const taskTemplateMutationSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('save'),name:z.string().trim().min(1).max(80),notes:z.string().trim().max(1000),rows}).strict(),
 z.object({...base,action:z.literal('capture'),revision:z.literal(0),name:z.string().trim().min(1).max(80),notes:z.string().trim().max(1000),selected:z.array(z.object({workId,taskId:id,revision}).strict()).min(1).max(100).refine(v=>new Set(v.map(r=>r.taskId)).size===v.length),includeDetails:z.boolean().optional(),includeManual:z.boolean().optional(),includeDueDates:z.boolean().optional()}).strict(),
 z.object({...base,action:z.enum(['archive','restore']),revision:z.number().int().positive().max(2147483646)}).strict(),
 z.object({...base,action:z.literal('apply'),revision:z.number().int().positive().max(2147483647),workId,startDate:taskDueDate,newTaskIds:identityArray,taskActionIds:identityArray}).strict(),
]).superRefine((v,c)=>{if(v.action==='apply'&&v.newTaskIds.length!==v.taskActionIds.length)c.addIssue({code:'custom',message:'Task identity arrays must match.'});});
export const taskTemplateResultSchema=z.discriminatedUnion('action',[
 z.object({action:z.enum(['save','capture','archive','restore']),template:taskTemplateSummarySchema}).strict(),
 z.object({action:z.literal('apply'),templateId:id,templateRevision:revision,workId,taskIds:identityArray}).strict(),
]);
export const taskTemplateReceiptSchema=z.object({receipt:z.object({input:taskTemplateMutationSchema,result:taskTemplateResultSchema}).strict().nullable()}).strict().superRefine((v,c)=>{if(!v.receipt)return;const{input,result}=v.receipt;if(input.action!==result.action||(result.action==='apply'?result.templateId!==input.templateId||input.action!=='apply'||result.templateRevision!==input.revision||result.workId!==input.workId||JSON.stringify(result.taskIds)!==JSON.stringify(input.newTaskIds):result.template.id!==input.templateId||result.template.revision!==input.revision+1))c.addIssue({code:'custom',message:'Invalid task template receipt.'});});
export const taskTemplatePreviewSchema=z.object({template:taskTemplateSummarySchema,workId,startDate:taskDueDate,existingCount:z.number().int().min(0).max(500),rows:z.array(z.object({id,title:z.string().min(1).max(160),details:z.string().max(2000),assignee:z.string().max(160),dueDate:taskDueDate}).strict()).min(1).max(100)}).strict().refine(v=>v.rows.length===v.template.count&&new Set(v.rows.map(r=>r.id)).size===v.rows.length&&v.existingCount+v.rows.length<=500);
export type TaskTemplateRow=z.infer<typeof taskTemplateRowSchema>;
export type TaskTemplateSummary=z.infer<typeof taskTemplateSummarySchema>;
export type TaskTemplateDetail=z.infer<typeof taskTemplateDetailSchema>;
export type TaskTemplateMutation=z.infer<typeof taskTemplateMutationSchema>;
export type TaskTemplateResult=z.infer<typeof taskTemplateResultSchema>;
export type TaskTemplatePreview=z.infer<typeof taskTemplatePreviewSchema>;
