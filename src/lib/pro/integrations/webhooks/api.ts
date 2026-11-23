import {z} from 'zod';
import {WEBHOOK_EVENTS} from './adapter';
import {MEETING_PROVIDERS} from './meetings';
const id=z.string().uuid(),rev=z.number().int().min(1).max(999999999);
export const webhookMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),name:z.string().trim().min(1).max(80),url:z.string().trim().max(600).regex(/^https:\/\//),events:z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(3)}).strict(),
 z.object({action:z.enum(['pause','resume','revoke']),id,revision:rev}).strict(),
 z.object({action:z.literal('test'),id}).strict(),
]);
export const meetingMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),id,title:z.string().trim().min(1).max(120),provider:z.enum(MEETING_PROVIDERS),workId:z.string().trim().min(1).max(160).nullable(),startsAt:z.string().datetime({offset:true}),durationMinutes:z.number().int().min(15).max(480)}).strict(),
 z.object({action:z.literal('cancel'),id,revision:rev}).strict(),
]);
