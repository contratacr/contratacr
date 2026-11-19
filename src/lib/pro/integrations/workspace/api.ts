import {z} from 'zod';

/** Round 6B: request schemas of /api/pro/connectors (shared by the route and the UI). */
const provider=z.enum(['google','microsoft']);
const email=z.string().trim().toLowerCase().email().max(254);
export const connectorMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('connect'),provider:z.enum(['google','microsoft','quickbooks']),locale:z.enum(['es','en']),view:z.enum(['conectores','contabilidad'])}).strict(),
 z.object({action:z.literal('disconnect'),actionId:z.string().uuid(),provider:z.enum(['google','microsoft','quickbooks']),revision:z.number().int().min(1)}).strict(),
 // confirmed must be literally true: the UI sends it only from the confirmation dialog of THIS message.
 z.object({action:z.literal('send_email'),actionId:z.string().uuid(),provider,confirmed:z.literal(true),to:z.array(email).min(1).max(10),
  subject:z.string().trim().min(1).max(200),body:z.string().trim().min(1).max(20000),workId:z.string().min(1).max(160).nullable(),attachments:z.array(z.string().min(6).max(200)).max(10)}).strict(),
 z.object({action:z.literal('calendar_sync'),actionId:z.string().uuid(),provider}).strict(),
 z.object({action:z.literal('calendar_resolve'),actionId:z.string().uuid(),provider,kind:z.enum(['appointment','task']),localId:z.string().min(1).max(160),choice:z.enum(['keep_local','keep_remote'])}).strict(),
 // Mock only: changes made «in the calendar» to exercise the inbound half of the sync.
 z.object({action:z.literal('calendar_simulate'),actionId:z.string().uuid(),provider,change:z.enum(['move','external','delete']),remoteId:z.string().min(1).max(200).optional()}).strict(),
 // Round 6C: automatic sync interval (0 = off) and the in-app scheduler tick (runs only what is due).
 z.object({action:z.literal('calendar_autosync_set'),actionId:z.string().uuid(),provider,revision:z.number().int().min(0),intervalMinutes:z.union([z.literal(0),z.literal(15),z.literal(30),z.literal(60),z.literal(120)])}).strict(),
 z.object({action:z.literal('calendar_autosync_tick'),actionId:z.string().uuid()}).strict(),
]);
export type ConnectorMutation=z.infer<typeof connectorMutationSchema>;
