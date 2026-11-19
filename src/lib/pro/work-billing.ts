import {z} from 'zod';

/**
 * Round 4B: invoice drafts from a job's accepted quote lines (full or % per line), progress % of the
 * agreed amount and unbilled billable time/expenses. Server: work-billing-local.sql. Each source used is
 * marked as invoiced while its draft is active; archiving the draft releases it.
 */
const id=z.string().uuid(),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/),cents=z.number().int().min(0).max(10000000000),bps=z.number().int().min(0).max(10000);
const vatSchema=z.object({t:z.enum(['vat','exempt','not_subject']),r:z.string()}).strict().nullable();
export const workBillingLineSchema=z.object({key:z.string().min(1).max(200),description:z.string(),unit:z.string().nullable(),qtyMilli:z.number().int().positive(),unitPriceCents:cents,discountBps:bps,taxBps:bps,totalCents:cents,billedBps:bps}).strict();
export const workBillingTimeSchema=z.object({id,date:day,minutes:z.number().int().positive(),rateCents:cents,amountCents:cents,activityName:z.string().nullable(),personName:z.string().nullable(),note:z.string(),invoicedDraftId:id.nullable()}).strict();
export const workBillingExpenseSchema=z.object({id,date:day,concept:z.string(),supplierName:z.string(),amountCents:cents,vatRateBps:z.number().int().nullable(),netCents:cents.nullable(),invoicedDraftId:id.nullable()}).strict();
export const workBillingSourcesSchema=z.object({
 workId:z.string(),clientId:z.string(),title:z.string(),cancelled:z.boolean(),clientArchived:z.boolean(),
 agreedCents:cents.nullable(),agreedSource:z.string().nullable(),customerBalanceCents:cents.nullable(),paidCents:z.number().int(),billedContractCents:cents,
 lines:z.array(workBillingLineSchema).max(100),
 agreement:z.object({key:z.string(),totalCents:cents,source:z.string().nullable(),billedBps:bps}).strict().nullable(),
 time:z.array(workBillingTimeSchema).max(200),expenses:z.array(workBillingExpenseSchema).max(200),defaultVat:vatSchema,
 fingerprint:z.string().regex(/^[a-f0-9]{32}$/),
 drafts:z.array(z.object({id,title:z.string(),totalCents:cents,archived:z.boolean(),createdAt:z.string()}).strict()).max(200),
}).strict();
export type WorkBillingSources=z.infer<typeof workBillingSourcesSchema>;
export type WorkBillingLine=z.infer<typeof workBillingLineSchema>;
export const workBillingCreateSchema=z.object({
 action:z.literal('create_billing'),requestId:id,workId:z.string().min(1).max(160),fingerprint:z.string().regex(/^[a-f0-9]{32}$/),
 title:z.string().trim().min(1).max(160),notes:z.string().max(2000),
 lines:z.array(z.object({key:z.string().min(1).max(200),bps:z.number().int().min(1).max(10000)}).strict()).max(100),
 agreementBps:z.number().int().min(1).max(10000).nullable(),
 timeIds:z.array(id).max(100),expenseIds:z.array(id).max(100),
}).strict().refine(v=>v.lines.length+v.timeIds.length+v.expenseIds.length+(v.agreementBps?1:0)>0,'Elija qué facturar.')
 .refine(v=>new Set(v.lines.map(l=>l.key)).size===v.lines.length&&new Set(v.timeIds).size===v.timeIds.length&&new Set(v.expenseIds).size===v.expenseIds.length,'Selección repetida.')
 .refine(v=>v.lines.length+v.timeIds.length+v.expenseIds.length+(v.agreementBps?1:0)<=100,'Máximo 100 líneas por borrador.');
export type WorkBillingCreate=z.infer<typeof workBillingCreateSchema>;

/** "40" / "12,5" / "12.5" (0 < p ≤ 100, two decimals) → basis points; null when invalid. */
export function percentToBps(value:string){const clean=value.trim().replace(',','.');if(!/^\d{1,3}(\.\d{1,2})?$/.test(clean))return null;const [whole,fraction='']=clean.split('.');const result=Number(whole)*100+Number(fraction.padEnd(2,'0'));return result>=1&&result<=10000?result:null;}
/** Basis points → "40 %" (es) / "40%" (en). */
export function bpsLabel(value:number,en:boolean){const text=(value/100).toLocaleString(en?'en-US':'es-CR',{maximumFractionDigits:2});return en?text+'%':text+' %';}
/** Contract value of a share of a line/amount (cents, half up) — the same rounding as the server. */
export function shareCents(totalCents:number,share:number){return Math.round(totalCents*share/10000);}
/** VAT-included split of an expense (amount → net + VAT) at a rate in basis points. */
export function vatIncludedSplit(amountCents:number,rateBps:number){const net=Math.round(amountCents*10000/(10000+rateBps));return{netCents:net,vatCents:amountCents-net};}
