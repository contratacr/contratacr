import {z} from 'zod';
import {taskDueDate} from './work-tasks';

/** Punch list (family 15): closing items stored as job tasks plus a punch marker. */
const id=z.string().uuid(),workId=z.string().trim().min(1).max(160),rev=z.number().int().positive().max(2147483646);
const content={title:z.string().trim().min(1).max(160),details:z.string().trim().max(2000),dueDate:taskDueDate,assignee:z.string().trim().max(160),photoFileId:id.nullable(),photoRequired:z.boolean()};
const base={actionId:id,workId,taskId:id};
export const punchMutationSchema=z.discriminatedUnion('action',[
 z.object({...base,...content,action:z.literal('create')}).strict(),
 z.object({...base,...content,action:z.literal('update'),revision:rev,taskRevision:rev}).strict(),
 z.object({...base,action:z.enum(['complete','reopen','archive']),taskRevision:rev}).strict(),
 z.object({...base,action:z.literal('mark')}).strict(),
]);
export type PunchMutation=z.infer<typeof punchMutationSchema>;
export const punchItemSchema=z.object({taskId:id,workId,title:z.string().min(1).max(160),details:z.string().max(2000),assignee:z.string().max(160),dueDate:taskDueDate,status:z.enum(['open','done']),archived:z.boolean(),taskRevision:z.number().int().positive(),revision:z.number().int().positive(),photoRequired:z.boolean(),photoFileId:id.nullable(),photoName:z.string().max(160).nullable(),createdAt:z.string(),updatedAt:z.string()}).strict();
export type PunchItem=z.infer<typeof punchItemSchema>;
export const punchlistSchema=z.object({workId,items:z.array(punchItemSchema).max(500),counts:z.object({total:z.number().int().nonnegative(),done:z.number().int().nonnegative()}).strict(),candidates:z.array(z.object({id,title:z.string().min(1).max(160)}).strict()).max(50),showPunchlist:z.boolean()}).strict();
export type Punchlist=z.infer<typeof punchlistSchema>;
export const punchResultSchema=z.object({item:punchItemSchema}).strict();
export const clientPunchlistSchema=z.union([
 z.object({visible:z.literal(false)}).strict(),
 z.object({visible:z.literal(true),items:z.array(z.object({id,title:z.string().min(1).max(160),status:z.enum(['open','done']),dueDate:taskDueDate,hasPhoto:z.boolean()}).strict()).max(500),counts:z.object({total:z.number().int().nonnegative(),done:z.number().int().nonnegative()}).strict()}).strict(),
]);
export type ClientPunchlist=z.infer<typeof clientPunchlistSchema>;
