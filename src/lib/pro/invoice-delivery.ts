import {z} from 'zod';

/**
 * Rows 42/44: delivery and lifecycle of a billing document (migration 383). Statuses are derived live from the delivery record, the
 * balance (payments and applied credit notes) and the due date; nothing here issues a fiscal document.
 */
const cents=z.number().int().safe(),stamp=z.string().min(1).max(64),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const invoiceStatuses=['draft','sent','viewed','partial','paid','overdue','void'] as const;
export type InvoiceStatus=typeof invoiceStatuses[number];
export const invoiceLifecycleSchema=z.object({draftId:z.string().uuid(),status:z.enum(invoiceStatuses),totalCents:cents,balanceCents:cents,dueDate:day,daysOverdue:z.number().int().nonnegative(),
 delivered:z.boolean(),sentAt:stamp.nullable(),viewedAt:stamp.nullable()}).strict();
export const invoiceDeliverySchema=invoiceLifecycleSchema.extend({title:z.string(),workId:z.string().nullable(),hasWork:z.boolean(),recipientEmail:z.string().nullable(),clientName:z.string().nullable(),
 events:z.array(z.object({action:z.enum(['send','resend','recall','view','email_sandbox_sent','email_failed']),at:stamp,providerRef:z.string().nullable()}).strict()).max(30)}).strict();
export const invoiceDeliveryMutationSchema=z.union([
 z.object({action:z.literal('send'),actionId:z.string().uuid(),draftId:z.string().uuid(),email:z.boolean()}).strict(),
 z.object({action:z.literal('recall'),actionId:z.string().uuid(),draftId:z.string().uuid()}).strict(),
]);
export const clientInvoiceDeliverySchema=z.union([
 z.object({visible:z.literal(false)}).strict(),
 z.object({visible:z.literal(true),invoices:z.array(z.object({id:z.string().uuid(),title:z.string(),status:z.enum(invoiceStatuses),totalCents:cents,balanceCents:cents,dueDate:day,daysOverdue:z.number().int().nonnegative(),sentAt:stamp}).strict()).max(200)}).strict(),
]);
export type InvoiceDelivery=z.infer<typeof invoiceDeliverySchema>;
export type ClientInvoiceDelivery=z.infer<typeof clientInvoiceDeliverySchema>;
