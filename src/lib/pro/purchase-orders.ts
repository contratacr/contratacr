import {z} from 'zod';
import {normalizeQuantityInput} from './allowances';

/**
 * Órdenes de compra por proyecto (parity register families 51, 52 and 54).
 * Owner-private purchase orders per job with lines, per-line receipts and manual
 * supplier payments. Amounts are CRC céntimos, like the job budget. Nothing here
 * sends e-mail, moves money or records an expense: an order is a commitment.
 */
const uuid=z.string().uuid(),workId=z.string().trim().min(1).max(160),stamp=z.string().datetime({offset:true});
const revision=z.number().int().positive().max(2147483646);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;});
const text=(max:number)=>z.string().trim().min(1).max(max);
const optionalText=(max:number)=>z.string().trim().max(max).nullable();
const decimals=(places:number)=>(value:number)=>Math.abs(value*10**places-Math.round(value*10**places))<1e-6;
export const PO_LINES_MAX=100,PO_PAGE_SIZE=20,PO_LINE_SUBTOTAL_MAX=10000000000;
export const poQuantity=z.number().min(0.001).max(1000000).refine(decimals(3));
export const poTaxRate=z.number().min(0).max(100).refine(decimals(2));
export const poMethods=['transfer','sinpe','cash','card','check','other'] as const;
export const poStatuses=['draft','issued','partial','received','cancelled'] as const;
export type PurchaseOrderStatus=typeof poStatuses[number];

export const purchaseOrderLineInputSchema=z.object({
 id:uuid,description:text(300),quantity:poQuantity,unit:text(20),unitCents:z.number().int().min(0).max(10000000000),taxRate:poTaxRate,
 budgetCodeId:uuid.nullable(),selectionOptionId:uuid.nullable(),allowanceId:uuid.nullable(),
}).strict().refine(line=>line.selectionOptionId===null||line.allowanceId===null).refine(line=>Math.round(line.quantity*line.unitCents)<=PO_LINE_SUBTOTAL_MAX);
const details={supplierId:uuid.nullable(),supplierName:optionalText(160),supplierContact:optionalText(200),title:text(160),issueDate:day,expectedDate:day.nullable(),notes:optionalText(2000),lines:z.array(purchaseOrderLineInputSchema).min(1).max(PO_LINES_MAX)};
const target={actionId:uuid,workId,id:uuid};
type DetailsShape={supplierId:string|null;supplierName:string|null;issueDate:string;expectedDate:string|null;lines:Array<{id:string}>};
const detailsValid=(value:DetailsShape)=>(value.supplierId===null?!!value.supplierName:value.supplierName===null)
 &&(value.expectedDate===null||value.expectedDate>=value.issueDate)&&new Set(value.lines.map(line=>line.id)).size===value.lines.length;
export const purchaseOrderMutationSchema=z.union([
 z.object({action:z.literal('create'),...target,...details}).strict().refine(detailsValid),
 z.object({action:z.literal('update'),...target,revision,...details}).strict().refine(detailsValid),
 z.object({action:z.literal('issue'),...target,revision}).strict(),
 z.object({action:z.literal('cancel'),...target,revision,reason:optionalText(300)}).strict(),
 z.object({action:z.literal('receive'),...target,revision,receivedOn:day,note:optionalText(300),entries:z.array(z.object({lineId:uuid,quantity:poQuantity}).strict()).min(1).max(PO_LINES_MAX)}).strict()
  .refine(value=>new Set(value.entries.map(entry=>entry.lineId)).size===value.entries.length),
 z.object({action:z.literal('pay'),...target,revision,amountCents:z.number().int().min(1).max(10000000000000),paidOn:day,method:z.enum(poMethods),reference:optionalText(160),note:optionalText(300)}).strict(),
 z.object({action:z.literal('reverse_payment'),...target,revision,paymentId:uuid,note:text(300)}).strict(),
]);
export type PurchaseOrderMutation=z.infer<typeof purchaseOrderMutationSchema>;

const cents=z.number().int(),count=z.number().int().nonnegative();
export const purchaseOrderSummarySchema=z.object({
 id:uuid,workId,number:z.number().int().positive(),code:z.string().regex(/^OC-\d{4,6}$/),title:z.string(),supplierId:uuid.nullable(),supplierName:z.string(),supplierContact:z.string().nullable(),
 status:z.enum(poStatuses),issueDate:day,expectedDate:day.nullable(),subtotalCents:cents,taxCents:cents,totalCents:cents,paidCents:cents,balanceCents:cents,lineCount:count,
 overdue:z.boolean(),revision:z.number().int().positive(),issuedAt:stamp.nullable(),cancelledAt:stamp.nullable(),createdAt:stamp,updatedAt:stamp,
}).strict();
export type PurchaseOrderSummary=z.infer<typeof purchaseOrderSummarySchema>;
export const purchaseOrderLineSchema=z.object({
 id:uuid,position:z.number().int().positive(),description:z.string(),quantity:z.number(),unit:z.string(),unitCents:cents,taxRate:z.number(),
 subtotalCents:cents,taxCents:cents,totalCents:cents,budgetCodeId:uuid.nullable(),selectionOptionId:uuid.nullable(),allowanceId:uuid.nullable(),receivedQuantity:z.number(),
}).strict();
export type PurchaseOrderLine=z.infer<typeof purchaseOrderLineSchema>;
export const purchaseOrderSchema=purchaseOrderSummarySchema.extend({
 notes:z.string().nullable(),cancelReason:z.string().nullable(),lines:z.array(purchaseOrderLineSchema),
 receipts:z.array(z.object({id:uuid,lineId:uuid,quantity:z.number(),receivedOn:day,note:z.string().nullable(),createdAt:stamp}).strict()),
 payments:z.array(z.object({id:uuid,kind:z.enum(['payment','reverse']),paymentId:uuid.nullable(),amountCents:cents,paidOn:day,method:z.enum(poMethods),reference:z.string().nullable(),note:z.string().nullable(),createdAt:stamp,reversed:z.boolean()}).strict()),
}).strict();
export type PurchaseOrder=z.infer<typeof purchaseOrderSchema>;
export const purchaseOrderResultSchema=z.object({order:purchaseOrderSchema}).strict();

export const purchaseOrderReferencesSchema=z.object({
 budgetCodes:z.array(z.object({id:uuid,code:z.string(),title:z.string()}).strict()),
 selectionOptions:z.array(z.object({id:uuid,itemName:z.string(),name:z.string(),brand:z.string().nullable(),quantity:z.number(),unitCents:cents}).strict()),
 allowances:z.array(z.object({id:uuid,name:z.string(),plannedCents:cents}).strict()),
 suppliers:z.array(z.object({id:uuid,name:z.string(),email:z.string(),phone:z.string()}).strict()),
}).strict();
export type PurchaseOrderReferences=z.infer<typeof purchaseOrderReferencesSchema>;
export const purchaseOrderListSchema=z.object({
 workId,workTitle:z.string(),canWrite:z.boolean(),today:day,items:z.array(purchaseOrderSummarySchema).max(PO_PAGE_SIZE),nextCursor:z.number().int().positive().nullable(),
 totals:z.object({count,totalCents:cents,paidCents:cents,balanceCents:cents,overdueCount:count,cancelledCount:count}).strict(),
 supplierNames:z.array(z.string()),nextNumber:z.number().int().positive(),references:purchaseOrderReferencesSchema,
}).strict();
export type PurchaseOrderList=z.infer<typeof purchaseOrderListSchema>;
export const purchaseOrderHistorySchema=z.object({actionId:uuid,action:z.enum(['create','update','issue','receive','pay','reverse_payment','cancel']),at:stamp,before:purchaseOrderSchema.nullable(),after:purchaseOrderSchema}).strict();
export type PurchaseOrderHistoryEntry=z.infer<typeof purchaseOrderHistorySchema>;
export const purchaseOrderDetailSchema=z.union([
 z.object({workId,order:z.null()}).strict(),
 z.object({workId,workTitle:z.string(),today:day,order:purchaseOrderSchema,history:z.array(purchaseOrderHistorySchema).max(100)}).strict(),
]);
export type PurchaseOrderDetail=z.infer<typeof purchaseOrderDetailSchema>;

const nullableCents=cents.nullable();
export const purchaseOrderBudgetSchema=z.object({
 workId,currency:z.literal('CRC'),
 rows:z.array(z.object({codeId:uuid,kind:z.enum(['group','item']),code:z.string(),title:z.string(),parentId:uuid.nullable(),archived:z.boolean(),plannedCents:nullableCents,committedCents:cents,actualCents:cents,unknownCount:count,projectedCents:cents,varianceCents:nullableCents}).strict()).max(500),
 totals:z.object({plannedCents:nullableCents,committedCents:cents,actualCents:cents,unknownCount:count,uncodedCommittedCents:cents,unassignedActualCents:cents,projectedCents:cents,varianceCents:nullableCents}).strict(),
}).strict();
export type PurchaseOrderBudget=z.infer<typeof purchaseOrderBudgetSchema>;

/** URL filters accepted by GET ?view=list (all optional except workId). */
export const purchaseOrderListQuerySchema=z.object({
 workId,view:z.literal('list').optional(),status:z.enum(['all','open',...poStatuses]).optional(),supplier:z.string().trim().min(1).max(160).optional(),
 overdue:z.enum(['0','1']).optional(),from:day.optional(),to:day.optional(),after:z.string().regex(/^\d{1,6}$/).optional(),
}).strict().refine(value=>!value.from||!value.to||value.from<=value.to);

/** Same rounding as the SQL generated columns (half away from zero on non-negative values). */
export function poLineFigures(quantity:number,unitCents:number,taxRate:number){
 const subtotal=Math.round(Math.round(quantity*1000)*unitCents/1000);
 const tax=Math.round(subtotal*Math.round(taxRate*100)/10000);
 return {subtotal,tax,total:subtotal+tax};
}
export function parsePoQuantity(value:string,en:boolean){const clean=normalizeQuantityInput(value,en);if(!/^\d{1,7}(\.\d{1,3})?$/.test(clean))return null;const n=Number(clean);return n>=0.001&&n<=1000000?n:null;}
export function parsePoTaxRate(value:string){const clean=value.trim().replace(',','.').replace(/%$/,'');if(!clean)return 0;if(!/^\d{1,3}(\.\d{1,2})?$/.test(clean))return null;const n=Number(clean);return n<=100?n:null;}
