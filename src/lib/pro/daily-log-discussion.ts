import {z} from 'zod';
import {dailyLogVersionSchema} from './daily-logs';
const id=z.string().uuid(),workId=z.string().min(1).max(160),version=z.number().int().positive().max(2147483647);
export const dailyLogDiscussionScopeSchema=z.discriminatedUnion('side',[
 z.object({side:z.literal('owner'),workId,logId:id,version,channel:z.enum(['client','team'])}).strict(),
 z.object({side:z.literal('client'),requestId:id,logId:id,version,channel:z.literal('client')}).strict(),
 z.object({side:z.literal('team'),grantId:id,logId:id,version,channel:z.literal('team')}).strict(),
]);
export const dailyLogDiscussionThreadSchema=z.object({ownerId:id,workId,logId:id,version,channel:z.enum(['client','team']),generation:id.nullable()}).strict();
export const dailyLogCommentSchema=z.object({id,actorId:id,actorName:z.string().max(160),text:z.string().trim().min(1).max(1000),at:z.string().datetime({offset:true})}).strict();
export const dailyLogDiscussionContextSchema=dailyLogDiscussionThreadSchema.extend({canComment:z.boolean()}).strict();
export const dailyLogDiscussionPageSchema=z.object({context:dailyLogDiscussionContextSchema,publication:dailyLogVersionSchema,items:z.array(dailyLogCommentSchema).max(20),nextCursor:id.nullable()}).strict().superRefine((v,c)=>{if(v.publication.id!==v.context.logId||v.publication.version!==v.context.version)c.addIssue({code:'custom',message:'Wrong publication.'});if(new Set(v.items.map(x=>x.id)).size!==v.items.length||v.nextCursor!==null&&v.items.at(-1)?.id!==v.nextCursor)c.addIssue({code:'custom',message:'Invalid discussion page.'});});
export const dailyLogCommentMutationSchema=z.object({action:z.literal('comment'),actionId:id,commentId:id,scope:dailyLogDiscussionScopeSchema,generation:id.nullable(),text:z.string().trim().min(1).max(1000)}).strict().refine(v=>(v.scope.side==='team')===(v.generation!==null),'Capture the current team generation.');
export const dailyLogCommentResultSchema=z.object({action:z.literal('comment'),comment:dailyLogCommentSchema,thread:dailyLogDiscussionThreadSchema}).strict();
export const dailyLogCommentReceiptSchema=z.object({receipt:z.object({input:dailyLogCommentMutationSchema,result:dailyLogCommentResultSchema}).strict().nullable()}).strict().superRefine((v,c)=>{if(!v.receipt)return;const {input,result}=v.receipt,s=input.scope;if(result.comment.id!==input.commentId||result.comment.text!==input.text||result.thread.logId!==s.logId||result.thread.version!==s.version||result.thread.channel!==s.channel||result.thread.generation!==input.generation||s.side==='owner'&&result.thread.workId!==s.workId)c.addIssue({code:'custom',message:'Invalid comment receipt.'});});
export const dailyLogDiscussionVersionsSchema=z.object({items:z.array(z.object({version,title:z.string().min(1).max(160),publishedAt:z.string().datetime({offset:true}),channels:z.array(z.enum(['client','team'])).min(1).max(2).refine(a=>new Set(a).size===a.length)}).strict()).max(20),nextCursor:version.nullable()}).strict();
export type DailyLogDiscussionScope=z.infer<typeof dailyLogDiscussionScopeSchema>;
export type DailyLogDiscussionThread=z.infer<typeof dailyLogDiscussionThreadSchema>;
export type DailyLogDiscussionContext=z.infer<typeof dailyLogDiscussionContextSchema>;
export type DailyLogComment=z.infer<typeof dailyLogCommentSchema>;
export type DailyLogCommentMutation=z.infer<typeof dailyLogCommentMutationSchema>;
export type DailyLogCommentResult=z.infer<typeof dailyLogCommentResultSchema>;
