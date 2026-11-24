import {z} from 'zod';
import {notificationEvents} from '@/lib/pro/round9';

/** Area A: "daily digest" and "push" columns of the per-event notification matrix (stored, nothing is delivered outside the app). */
const flags=z.partialRecord(z.enum(notificationEvents),z.boolean());
export const notificationExtrasSchema=z.object({revision:z.number().int().min(0),delivery:z.literal('stored_not_sent'),digest:z.record(z.string(),z.boolean()),push:z.record(z.string(),z.boolean())}).strict();
export const notificationExtrasSaveSchema=z.object({revision:z.number().int().min(0).max(999999999),digest:flags,push:flags}).strict();
export type NotificationExtras=z.infer<typeof notificationExtrasSchema>;
