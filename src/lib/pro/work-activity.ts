import {z} from 'zod';

/** Per-job activity history (docs/pro/sql/pro-work-activity-local.sql). Read-only; every event comes from an
 * existing immutable history / event / receipt record. */
export const workActivityKinds=['quote_publish','quote_claim','quote_accept','quote_decline','quote_request_changes','quote_respond_changes','quote_withdraw',
 'change_propose','change_accept','change_record_acceptance','change_decline','change_withdraw',
 'payment_recorded','payment_voided','invoice_prepared','invoice_payment_applied','invoice_payment_voided',
 'einvoice_signed','einvoice_sent','einvoice_accepted','einvoice_rejected',
 'file_added','file_shared','file_trashed','file_restored',
 'task_created','task_completed','task_reopened','task_archived',
 'daily_log_published','update_published','client_invited','client_invitation_accepted'] as const;
export type WorkActivityKind=typeof workActivityKinds[number];
export const workActivitySections=['estimates','changes','costs','files','tasks','updates','client'] as const;
/** Exact UTC instant with microseconds as returned by the reader (keyset cursor keeps full precision). */
export const workActivityInstant=z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
const ref=z.record(z.string().regex(/^[a-zA-Z]{1,20}$/),z.string().uuid());
export const workActivityItemSchema=z.object({
 id:z.string().min(1).max(120),kind:z.enum(workActivityKinds),at:workActivityInstant,
 actorName:z.string().max(160).nullable(),actorRole:z.enum(['owner','team','client']),
 section:z.enum(workActivitySections),ref,
 data:z.object({title:z.string().max(500).optional(),amountCents:z.number().int().optional(),version:z.number().int().positive().optional(),number:z.string().max(60).optional()}).strict(),
}).strict();
export const workActivityPageSchema=z.object({
 workId:z.string().min(1).max(160),items:z.array(workActivityItemSchema).max(50),
 nextCursor:z.object({before:workActivityInstant,beforeId:z.string().min(1).max(120)}).strict().nullable(),
}).strict();
export type WorkActivityItem=z.infer<typeof workActivityItemSchema>;
export type WorkActivityPage=z.infer<typeof workActivityPageSchema>;
export const workActivityQuerySchema=z.object({
 workId:z.string().trim().min(1).max(160),before:workActivityInstant.optional(),beforeId:z.string().min(1).max(120).optional(),
 limit:z.enum(['5','20']).optional(),
}).strict().refine(q=>(q.before===undefined)===(q.beforeId===undefined));
