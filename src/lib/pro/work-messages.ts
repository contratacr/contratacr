import {z} from 'zod';
/** Round 7C: «Mensajes» between the professional and the customer of a job (no external send). */
export const workMessageSchema=z.object({id:z.string().uuid(),side:z.enum(['pro','client']),authorName:z.string(),body:z.string().min(1).max(2000),createdAt:z.string()});
export type WorkMessage=z.infer<typeof workMessageSchema>;
export const workMessagePageSchema=z.object({requestId:z.string().uuid(),workId:z.string(),side:z.enum(['pro','client']),items:z.array(workMessageSchema).max(30),hasMore:z.boolean(),unread:z.number().int().nonnegative(),counterpart:z.string()});
export const workMessageThreadsSchema=z.object({workId:z.string(),threads:z.array(z.object({requestId:z.string().uuid(),clientName:z.string(),unread:z.number().int().nonnegative(),lastAt:z.string().nullable()}))});
export const workMessageMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('post'),actionId:z.string().uuid(),requestId:z.string().uuid(),body:z.string().trim().min(1).max(2000)}).strict(),
 z.object({action:z.literal('read'),requestId:z.string().uuid()}).strict(),
]);
