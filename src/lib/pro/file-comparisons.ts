import {z} from 'zod';

/**
 * Row 33: before/after photo comparisons of a job. The owner picks two photos from the job files; the linked customer
 * (and the owner's preview) sees the visible ones with a slider. Strict contracts shared by the route, the UI and the specs.
 */
export const COMPARISON_MAX=20;
const uuid=z.string().uuid(),workId=z.string().trim().min(1).max(160),stamp=z.string().min(1).max(40);
const text=(max:number)=>z.string().max(max).nullable();
export const comparisonItemSchema=z.object({id:uuid,workId,beforeFileId:uuid,afterFileId:uuid,title:z.string().min(1).max(120).nullable(),caption:z.string().min(1).max(300).nullable(),
 clientVisible:z.boolean(),archived:z.boolean(),revision:z.number().int().positive(),createdAt:stamp,updatedAt:stamp,
 beforeName:z.string().nullable(),afterName:z.string().nullable(),available:z.boolean()}).strict();
export const comparisonOwnerSchema=z.object({workId,max:z.number().int().positive(),items:z.array(comparisonItemSchema).max(400),
 photos:z.array(z.object({id:uuid,name:z.string().min(1).max(160)}).strict()).max(300),
 history:z.array(z.object({comparisonId:uuid,action:z.enum(['create','update','visibility','archive','restore']),at:stamp,title:z.string().nullable()}).strict()).max(40)}).strict();
const side=z.object({name:z.string().min(1).max(160),sizeBytes:z.number().int().positive()}).strict();
export const comparisonClientSchema=z.object({items:z.array(z.object({id:uuid,title:z.string().nullable(),caption:z.string().nullable(),updatedAt:stamp,before:side,after:side}).strict()).max(COMPARISON_MAX)}).strict();
export type ComparisonItem=z.infer<typeof comparisonItemSchema>;
export type ComparisonOwner=z.infer<typeof comparisonOwnerSchema>;
export type ComparisonClient=z.infer<typeof comparisonClientSchema>;
const base={actionId:uuid,workId};
const content={beforeFileId:uuid,afterFileId:uuid,title:text(120),caption:text(300)};
export const comparisonInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),...base,...content}).strict(),
 z.object({action:z.literal('update'),...base,comparisonId:uuid,revision:z.number().int().positive().max(2147483646),...content}).strict(),
 z.object({action:z.literal('visibility'),...base,comparisonId:uuid,revision:z.number().int().positive().max(2147483646),visible:z.boolean()}).strict(),
 z.object({action:z.literal('archive'),...base,comparisonId:uuid,revision:z.number().int().positive().max(2147483646)}).strict(),
 z.object({action:z.literal('restore'),...base,comparisonId:uuid,revision:z.number().int().positive().max(2147483646)}).strict(),
]);
export type ComparisonInput=z.infer<typeof comparisonInputSchema>;
export const comparisonResultSchema=z.object({action:z.enum(['create','update','visibility','archive','restore']),item:comparisonItemSchema,replayed:z.boolean().optional()}).strict();
