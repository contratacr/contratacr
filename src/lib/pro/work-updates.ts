import {z} from 'zod';
const workId=z.string().trim().min(1).max(160),stamp=z.string().datetime({offset:true});
const content={title:z.string().trim().min(1).max(160),text:z.string().trim().min(1).max(2000)};
const identity={workId,entryId:z.string().uuid(),actionId:z.string().uuid(),revision:z.number().int().nonnegative().max(2147483646)};
export const workUpdateMutationSchema=z.discriminatedUnion('action',[
 z.object({...identity,...content,action:z.literal('create'),revision:z.literal(0)}).strict(),
 z.object({...identity,...content,action:z.literal('update'),revision:z.number().int().positive().max(2147483646)}).strict(),
 z.object({...identity,action:z.literal('publish'),recipientId:z.string().uuid(),revision:z.number().int().positive().max(2147483646)}).strict(),
]);
export type WorkUpdateMutation=z.infer<typeof workUpdateMutationSchema>;
export const workUpdateSchema=z.object({id:z.string().uuid(),workId,...content,revision:z.number().int().positive(),createdAt:stamp,updatedAt:stamp,publishedRevision:z.number().int().positive().nullable()}).strict().refine(value=>value.publishedRevision===null||value.publishedRevision<=value.revision,'Invalid published revision.');
export type WorkUpdate=z.infer<typeof workUpdateSchema>;
export const workUpdateHistorySchema=z.object({actionId:z.string().uuid(),action:z.enum(['create','update','publish']),at:stamp,before:workUpdateSchema.nullable(),after:workUpdateSchema}).strict();
export const workUpdatesPageSchema=z.object({workId,items:z.array(workUpdateSchema).max(20),nextCursor:z.string().uuid().nullable(),canShare:z.boolean(),recipientId:z.string().uuid().nullable(),recipientName:z.string().trim().min(1).max(160).nullable()}).strict().refine(value=>!value.canShare||value.recipientId!==null&&value.recipientName!==null,'Missing share recipient.');
export const workUpdateDetailSchema=z.object({entry:workUpdateSchema,history:z.array(workUpdateHistorySchema).max(20),canShare:z.boolean(),recipientId:z.string().uuid().nullable(),recipientName:z.string().trim().min(1).max(160).nullable()}).strict().refine(value=>!value.canShare||value.recipientId!==null&&value.recipientName!==null,'Missing share recipient.');
export const appointmentUpdateSchema=z.object({id:z.string().uuid(),version:z.number().int().positive(),title:content.title,text:content.text,publishedAt:stamp,service:z.string().min(1).max(160)}).strict();
export const appointmentUpdatesPageSchema=z.object({items:z.array(appointmentUpdateSchema).max(20),nextCursor:z.string().uuid().nullable()}).strict();
export type WorkUpdatesPage=z.infer<typeof workUpdatesPageSchema>;
export type WorkUpdateDetail=z.infer<typeof workUpdateDetailSchema>;
export type AppointmentUpdate=z.infer<typeof appointmentUpdateSchema>;
export type AppointmentUpdatesPage=z.infer<typeof appointmentUpdatesPageSchema>;

/** Fit the title limit without leaving a split UTF-16 surrogate pair. */
export function workUpdateTitleFromText(text:string){return text.trim().split('\n')[0].trim().slice(0,160).replace(/[\uD800-\uDBFF]$/u,'');}
