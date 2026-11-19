import {z} from 'zod';
import {taskDueDate} from './work-tasks';
const identity={requestId:z.string().uuid(),actionId:z.string().uuid(),revision:z.number().int().min(0).max(2147483646)};
export const requestFollowupMutationSchema=z.discriminatedUnion('action',[
 z.object({...identity,action:z.literal('save'),dueDate:taskDueDate,note:z.string().trim().max(1000)}).strict(),
 z.object({...identity,action:z.enum(['complete','reopen']),revision:z.number().int().positive().max(2147483646)}).strict(),
]);
export type RequestFollowupMutation=z.infer<typeof requestFollowupMutationSchema>;
export const requestFollowupSchema=z.object({requestId:z.string().uuid(),dueDate:taskDueDate,note:z.string().max(1000),status:z.enum(['open','done']),revision:z.number().int().nonnegative(),updatedAt:z.string().datetime({offset:true}).nullable()}).strict().superRefine((value,context)=>{
 if(value.revision===0&&(value.dueDate!==null||value.note!==''||value.status!=='open'||value.updatedAt!==null)||value.revision>0&&value.updatedAt===null)context.addIssue({code:'custom',message:'Invalid follow-up revision.'});
});
export type RequestFollowup=z.infer<typeof requestFollowupSchema>;
export const requestFollowupHistorySchema=z.object({actionId:z.string().uuid(),action:z.enum(['save','complete','reopen']),at:z.string().datetime({offset:true}),before:requestFollowupSchema.nullable(),after:requestFollowupSchema}).strict();
export const requestFollowupDetailSchema=z.object({followup:requestFollowupSchema,history:z.array(requestFollowupHistorySchema).max(20)}).strict();
export type RequestFollowupDetail=z.infer<typeof requestFollowupDetailSchema>;
export const requestFollowupPageSchema=z.object({items:z.array(z.object({requestId:z.string().uuid(),dueDate:taskDueDate.unwrap(),note:z.string().max(1000),status:z.literal('open'),revision:z.number().int().positive(),updatedAt:z.string().datetime({offset:true}),service:z.string().min(1).max(160),clientName:z.string().min(1).max(160)}).strict()).max(20),nextCursor:z.string().uuid().nullable()}).strict();
export type RequestFollowupPage=z.infer<typeof requestFollowupPageSchema>;
