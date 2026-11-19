import {z} from 'zod';
import {dailyLogFileSchema} from './daily-log-files';
const id=z.string().uuid(),workId=z.string().min(1).max(160),stamp=z.string().datetime({offset:true}),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const dailyLogFileReconciliationMutationSchema=z.object({action:z.literal('reconcile'),actionId:id,workId,logId:id,fileId:id,sha256:hash}).strict();
export const dailyLogFileReconciliationResultSchema=z.object({action:z.literal('reconcile'),outcome:z.enum(['completed','already_ready']),file:dailyLogFileSchema,revision:z.number().int().positive().max(2147483647),verifiedBy:z.object({id,name:z.string().max(160),at:stamp}).strict()}).strict().refine(v=>v.file.ready&&v.verifiedBy.id===v.file.ownerId);
export const dailyLogFileReconciliationReasonSchema=z.enum(['missing_object','mismatch','unavailable']);
export const dailyLogFileReconciliationAttemptSchema=z.object({input:dailyLogFileReconciliationMutationSchema,baseline:dailyLogFileSchema,phase:z.enum(['pending','confirmed']),result:dailyLogFileReconciliationResultSchema.nullable(),reservedAt:stamp,reason:dailyLogFileReconciliationReasonSchema.nullable()}).strict().superRefine((v,c)=>{if((v.phase==='confirmed')!==(v.result!==null)||v.input.workId!==v.baseline.workId||v.input.logId!==v.baseline.logId||v.input.fileId!==v.baseline.id||v.input.sha256!==v.baseline.sha256||v.result&&(v.result.file.id!==v.input.fileId||v.result.file.workId!==v.input.workId||v.result.file.logId!==v.input.logId||v.result.file.sha256!==v.input.sha256||v.reason!==null))c.addIssue({code:'custom',message:'Invalid reconciliation attempt.'});});
export const dailyLogFileReconciliationReceiptSchema=z.object({attempt:dailyLogFileReconciliationAttemptSchema.nullable()}).strict();
export const dailyLogFileReconciliationResponseSchema=z.discriminatedUnion('state',[
 z.object({state:z.literal('pending'),reason:dailyLogFileReconciliationReasonSchema,attempt:dailyLogFileReconciliationAttemptSchema}).strict().refine(v=>v.attempt.phase==='pending'&&v.reason===v.attempt.reason),
 z.object({state:z.literal('confirmed'),result:dailyLogFileReconciliationResultSchema,attempt:dailyLogFileReconciliationAttemptSchema}).strict().refine(v=>v.attempt.phase==='confirmed'&&JSON.stringify(v.result)===JSON.stringify(v.attempt.result)),
]);
export const dailyLogFileReconciliationHistorySchema=z.object({items:z.array(z.object({actionId:id,fileId:id,fileName:z.string().min(1).max(160),originalActorId:id,originalActorName:z.string().max(160),phase:z.enum(['pending','confirmed']),reason:dailyLogFileReconciliationReasonSchema.nullable(),requestedBy:z.object({id,name:z.string().max(160)}).strict(),reservedAt:stamp,outcome:z.enum(['completed','already_ready']).nullable(),verifiedAt:stamp.nullable(),verifiedByName:z.string().max(160).nullable()}).strict()).max(20),nextCursor:id.nullable()}).strict();
export type DailyLogFileReconciliationMutation=z.infer<typeof dailyLogFileReconciliationMutationSchema>;
export type DailyLogFileReconciliationResult=z.infer<typeof dailyLogFileReconciliationResultSchema>;
export type DailyLogFileReconciliationAttempt=z.infer<typeof dailyLogFileReconciliationAttemptSchema>;
export type DailyLogFileReconciliationReason=z.infer<typeof dailyLogFileReconciliationReasonSchema>;
