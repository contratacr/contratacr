import {z} from 'zod';

/** Round 4A: one part per widget of the job overview (pro_work_overview_read). */
export const workOverviewParts=['client','schedule','finance','activity','open'] as const;
export type WorkOverviewPart=typeof workOverviewParts[number];
const cents=z.number().int().safe(),count=z.number().int().nonnegative(),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/),stamp=z.string().min(1).max(64),workId=z.string().min(1).max(160);
export const workOverviewSchemas={
 client:z.object({workId,part:z.literal('client'),phase:z.string().max(40).nullable(),
  client:z.object({id:z.string(),name:z.string(),email:z.string().nullable(),phone:z.string().nullable(),address:z.string().nullable(),archived:z.boolean()}).strict().nullable(),
  linked:z.object({requestId:z.string().uuid(),name:z.string(),origin:z.string(),linkedAt:stamp}).strict().nullable(),pendingInvitation:z.boolean()}).strict(),
 schedule:z.object({workId,part:z.literal('schedule'),planStart:day.nullable(),planEnd:day.nullable(),today:day,openTasks:count,
  nextTasks:z.array(z.object({id:z.string().uuid(),title:z.string(),dueDate:day.nullable(),plannedStart:day.nullable().optional(),plannedEnd:day.nullable().optional(),overdue:z.boolean(),punch:z.boolean()}).strict()).max(5),
  keyDates:z.array(z.object({id:z.string().uuid(),title:z.string(),date:day}).strict()).max(3)}).strict(),
 finance:z.object({workId,part:z.literal('finance'),agreedCents:cents.nullable(),agreedSource:z.enum(['agreement','estimate','quote']).nullable(),paidCents:cents,creditNotesCents:cents,balanceCents:cents.nullable(),creditCents:cents,
  invoicedCents:cents,invoiceCount:count,costCents:cents.nullable(),committedCents:cents.nullable(),resultCents:cents.nullable(),resultWithCommittedCents:cents.nullable(),resultBasis:z.enum(['without_tax','as_agreed']).nullable(),
  // Round 7A: agreed amount before VAT when known (accepted quote), so the result compares like with like.
  agreedTaxCents:cents.nullable(),agreedNetCents:cents.nullable(),uncostedCount:count,
  // Closing round (security review M2): Member and Read-only get costs, commitments and result as null.
  costsHidden:z.boolean().optional()}).strict(),
 activity:z.object({workId,part:z.literal('activity'),items:z.array(z.object({kind:z.enum(['file','daily_log','update','change']),id:z.string().uuid(),title:z.string(),at:stamp,shared:z.boolean().optional(),date:day.optional(),status:z.enum(['proposed','accepted','declined','withdrawn']).optional(),deltaCents:cents.optional()}).strict()).max(8)}).strict(),
 open:z.object({workId,part:z.literal('open'),openTasks:count,overdueTasks:count,punchOpen:count,punchTotal:count,selectionsPending:count,changesProposed:count,contractsShared:count,quotesWaiting:count,allowancesPending:count,
  // Round 5: in-app notices of the payment plan (pro_payment_plan_notices); no e-mail or SMS.
  paymentOverdue:count,paymentOverdueCents:cents,paymentUpcoming:count,paymentAwaiting:z.boolean()}).strict(),
};
export type WorkOverview<P extends WorkOverviewPart>=z.infer<typeof workOverviewSchemas[P]>;
