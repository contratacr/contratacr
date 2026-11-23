import {z} from 'zod';

/**
 * Créditos y anticipos por proyecto (parity register family 50).
 * Internal, non-fiscal records: retainers (ANT), credit notes (NC), overpayments (SP) and
 * refunds (REE). Nothing here charges, moves money or issues a Hacienda document.
 * Received retainers and overpayments are always backed by a payment of the existing
 * project ledger; their applications to invoice drafts go through invoice payments.
 * Amounts are CRC céntimos; dates are Costa Rica calendar days.
 */
const uuid=z.string().uuid(),workId=z.string().trim().min(1).max(160),stamp=z.string().datetime({offset:true});
const revision=z.number().int().positive().max(2147483646);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value&&value>='2000-01-01';});
const text=(max:number)=>z.string().trim().min(1).max(max);
const optionalText=(max:number)=>z.string().trim().max(max).nullable();
const amount=z.number().int().min(1).max(10000000000);
export const CREDIT_PAGE_SIZE=20;
export const creditKinds=['retainer','credit_note','overpayment'] as const;
export const creditTabs=[...creditKinds,'refund'] as const;
export const creditMethods=['transfer','sinpe','cash','card','other'] as const;
export const creditStatuses=['requested','available','partial','used','reversed','cancelled'] as const;
export const refundStatuses=['recorded','voided'] as const;
export type CreditKind=typeof creditKinds[number];
export type CreditTab=typeof creditTabs[number];
export type CreditMethod=typeof creditMethods[number];
export type CreditStatus=typeof creditStatuses[number];
export type RefundStatus=typeof refundStatuses[number];

const target={actionId:uuid,workId,id:uuid};
const paymentDetails={receivedOn:day.nullable(),method:z.enum(creditMethods).nullable(),reference:optionalText(160)};
/** Details are either all given (payment without them in the ledger) or all null (taken from the ledger). */
const detailsShape=(value:{receivedOn:string|null;method:string|null;reference:string|null})=>value.receivedOn===null?value.method===null&&value.reference===null:value.method!==null;
export const creditMutationSchema=z.union([
 z.object({action:z.literal('create_retainer'),...target,title:text(160),amountCents:amount,requestedOn:day,note:optionalText(2000)}).strict(),
 z.object({action:z.literal('receive_retainer'),...target,revision,source:z.literal('existing'),entryId:uuid,amountCents:amount,...paymentDetails}).strict().refine(detailsShape),
 z.object({action:z.literal('receive_retainer'),...target,revision,source:z.literal('manual'),entryId:z.null(),amountCents:amount,receivedOn:day,method:z.enum(creditMethods),reference:optionalText(160)}).strict(),
 z.object({action:z.literal('create_credit_note'),...target,title:text(160),amountCents:amount,reason:text(300),note:optionalText(2000)}).strict(),
 z.object({action:z.literal('create_overpayment'),...target,title:text(160),amountCents:amount,entryId:uuid,...paymentDetails,note:optionalText(2000)}).strict().refine(detailsShape),
 z.object({action:z.literal('update'),...target,revision,title:text(160),amountCents:amount,reason:optionalText(300),note:optionalText(2000)}).strict(),
 z.object({action:z.literal('apply'),...target,revision,draftId:uuid,amountCents:amount}).strict(),
 z.object({action:z.literal('unapply'),...target,revision,applicationId:uuid,reason:text(160)}).strict(),
 z.object({action:z.literal('refund'),...target,revision,amountCents:amount,refundedOn:day,method:z.enum(creditMethods),reference:optionalText(160),note:optionalText(300)}).strict(),
 z.object({action:z.literal('void_refund'),...target,revision,refundId:uuid,reason:text(300)}).strict(),
 z.object({action:z.literal('cancel'),...target,revision,reason:optionalText(300)}).strict(),
]);
export type CreditMutation=z.infer<typeof creditMutationSchema>;

const cents=z.number().int(),count=z.number().int().nonnegative();
export const creditSummarySchema=z.object({
 id:uuid,workId,kind:z.enum(creditKinds),number:z.number().int().positive(),code:z.string().regex(/^(ANT|NC|SP)-\d{4,6}$/),title:z.string(),
 status:z.enum(creditStatuses),baseStatus:z.enum(['requested','active','cancelled']),
 amountCents:cents,appliedCents:cents,refundedCents:cents,balanceCents:cents,availableCents:cents,sourceReversed:z.boolean(),
 recipient:z.string().nullable(),clientId:z.string(),requestedOn:day.nullable(),entryId:uuid.nullable(),receivedOn:day.nullable(),method:z.enum(creditMethods).nullable(),reference:z.string().nullable(),
 reason:z.string().nullable(),note:z.string().nullable(),cancelReason:z.string().nullable(),revision:z.number().int().positive(),
 createdAt:stamp,updatedAt:stamp,receivedAt:stamp.nullable(),cancelledAt:stamp.nullable(),
}).strict();
export type CreditSummary=z.infer<typeof creditSummarySchema>;
export const refundSchema=z.object({
 id:uuid,number:z.number().int().positive(),code:z.string().regex(/^REE-\d{4,6}$/),creditId:uuid,creditCode:z.string(),creditKind:z.enum(creditKinds),title:z.string(),
 status:z.enum(refundStatuses),amountCents:cents,refundedOn:day,method:z.enum(creditMethods),reference:z.string().nullable(),note:z.string().nullable(),
 recipient:z.string().nullable(),voidReason:z.string().nullable(),voidedAt:stamp.nullable(),createdAt:stamp,
}).strict();
export type CreditRefund=z.infer<typeof refundSchema>;
export const creditApplicationSchema=z.object({
 id:uuid,draftId:uuid,draftTitle:z.string().nullable(),amountCents:cents,viaInvoicePayments:z.boolean(),
 state:z.enum(['active','reverted','voided_in_invoice','source_reversed']),reason:z.string().nullable(),revertedAt:stamp.nullable(),createdAt:stamp,
}).strict();
export type CreditApplication=z.infer<typeof creditApplicationSchema>;
export const creditSchema=creditSummarySchema.extend({applications:z.array(creditApplicationSchema),refunds:z.array(refundSchema)}).strict();
export type Credit=z.infer<typeof creditSchema>;
export const creditResultSchema=z.object({credit:creditSchema}).strict();

export const creditReferencesSchema=z.object({
 drafts:z.array(z.object({id:uuid,title:z.string(),totalCents:cents,paymentsCents:cents,creditNotesCents:cents,balanceCents:cents,createdAt:stamp}).strict()).max(100),
 payments:z.array(z.object({entryId:uuid,amountCents:cents,freeCents:cents,label:z.string(),registeredAt:stamp,receivedOn:day.nullable(),method:z.enum(creditMethods).nullable(),reference:z.string().nullable(),hasMetadata:z.boolean(),creditCode:z.string().nullable()}).strict()).max(100),
}).strict();
export type CreditReferences=z.infer<typeof creditReferencesSchema>;
const totals=z.object({count,totalCents:cents,appliedCents:cents,availableCents:cents,refundedCents:cents}).strict();
const listBase={
 workId,workTitle:z.string(),client:z.object({id:z.string(),name:z.string(),archived:z.boolean()}).strict().nullable(),
 canWrite:z.boolean(),readOnlyReason:z.enum(['cancelled','noClient','archivedClient']).nullable(),today:day,
 nextCursor:z.number().int().positive().nullable(),totals,
 tabCounts:z.object({retainer:count,credit_note:count,overpayment:count,refund:count}).strict(),
 account:z.object({agreedCents:cents.nullable(),paidCents:cents,balanceCents:cents.nullable()}).strict(),
 detection:z.object({paidCents:cents,billedCents:cents,reservedCents:cents,excessCents:count}).strict(),
 nextNumbers:z.object({retainer:z.number().int().positive(),credit_note:z.number().int().positive(),overpayment:z.number().int().positive(),refund:z.number().int().positive()}).strict(),
 references:creditReferencesSchema,
};
export const creditListSchema=z.union([
 z.object({...listBase,tab:z.enum(creditKinds),items:z.array(creditSummarySchema).max(CREDIT_PAGE_SIZE)}).strict(),
 z.object({...listBase,tab:z.literal('refund'),items:z.array(refundSchema).max(CREDIT_PAGE_SIZE)}).strict(),
]);
export type CreditList=z.infer<typeof creditListSchema>;
export const creditHistoryActions=['create','receive','update','apply','unapply','refund','void_refund','cancel'] as const;
export const creditHistorySchema=z.object({actionId:uuid,action:z.enum(creditHistoryActions),at:stamp,before:creditSchema.nullable(),after:creditSchema}).strict();
export type CreditHistoryEntry=z.infer<typeof creditHistorySchema>;
export const creditDetailSchema=z.union([
 z.object({workId,credit:z.null()}).strict(),
 z.object({workId,workTitle:z.string(),today:day,credit:creditSchema,history:z.array(creditHistorySchema).max(100)}).strict(),
]);
export type CreditDetail=z.infer<typeof creditDetailSchema>;

/** URL query for GET: list (default) or detail. */
export const creditQuerySchema=z.union([
 z.object({workId,view:z.literal('detail'),id:uuid}).strict(),
 z.object({workId,view:z.literal('list').optional(),tab:z.enum(creditTabs).optional(),status:z.enum(['all',...creditStatuses,...refundStatuses]).optional(),after:z.string().regex(/^\d{1,6}$/).optional()}).strict()
  .refine(value=>{const tab=value.tab??'retainer',status=value.status??'all';if(status==='all')return true;return tab==='refund'?(refundStatuses as readonly string[]).includes(status):(creditStatuses as readonly string[]).includes(status)&&(tab==='retainer'||status!=='requested');}),
]);
export type CreditQuery=z.infer<typeof creditQuerySchema>;

/** Ledger of what the professional holds in favour of a customer (migration 381). Entries are signed, append-only and reconciled with the credit figures. */
export const creditLedgerEvents=['received','apply','unapply','apply_void','refund','void_refund','cancel','source_reversed'] as const;
export type CreditLedgerEvent=typeof creditLedgerEvents[number];
export const creditLedgerQuerySchema=z.union([z.object({workId}).strict(),z.object({clientId:workId}).strict()]);
export const creditLedgerSchema=z.object({
 scope:z.enum(['work','client']),workId:workId.nullable(),client:z.object({id:z.string(),name:z.string(),archived:z.boolean()}).strict(),
 balanceCents:cents,receivedCents:cents,appliedCents:cents,refundedCents:cents,closedCents:cents,entryCount:count,truncated:z.boolean(),reconciled:z.boolean(),
 entries:z.array(z.object({seq:z.number().int().positive(),at:stamp,event:z.enum(creditLedgerEvents),creditId:uuid,code:z.string(),kind:z.enum(creditKinds),title:z.string(),
  workId:z.string(),workTitle:z.string().nullable(),deltaCents:cents,balanceCents:cents,reference:z.string().nullable()}).strict()).max(200),
 credits:z.array(z.object({creditId:uuid,code:z.string(),title:z.string(),workId:z.string(),status:z.enum(['requested','active','cancelled']),ledgerCents:cents,balanceCents:cents,reconciled:z.boolean()}).strict()),
 byWork:z.array(z.object({workId:z.string(),title:z.string().nullable(),balanceCents:cents}).strict()),
}).strict();
export type CreditLedger=z.infer<typeof creditLedgerSchema>;
