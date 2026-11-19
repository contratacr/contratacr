import {z} from 'zod';
import {normalizeQuantityInput} from '@/lib/pro/allowances';

/**
 * Licitaciones privadas por proyecto (parity register row 53). Owner-only bid packages:
 * lines, vendors invited from the directory, offers recorded by hand, side-by-side
 * comparison, award (whole or per line) and draft purchase orders through the existing
 * purchase order writer. Amounts are CRC céntimos. Nothing is sent to any vendor.
 */
const id=z.string().uuid();
const workId=z.string().trim().min(1).max(160);
const revision=z.number().int().min(1).max(2147483646);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents=z.number().int().min(0).max(10000000000);
const quantity=z.number().min(0.001).max(1000000).refine(value=>Math.abs(value*1000-Math.round(value*1000))<1e-6,'three decimals');
const text=(max:number)=>z.string().trim().min(1).max(max);
const optional=(max:number)=>z.string().trim().max(max).nullable().transform(value=>value?value:null);
export const bidStatusSchema=z.enum(['draft','open','closed','awarded','cancelled']);
export type BidStatus=z.infer<typeof bidStatusSchema>;
export const bidLineInputSchema=z.object({id,description:text(300),quantity,unit:text(20),budgetCodeId:id.nullable()}).strict();
const packageFields={title:text(160),scope:optional(4000),dueDate:day.nullable(),lines:z.array(bidLineInputSchema).min(1).max(100)};
const target={actionId:id,workId,id,revision};
export const bidMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),actionId:id,workId,id,...packageFields}).strict(),
 z.object({action:z.literal('update'),...target,...packageFields}).strict(),
 z.object({action:z.literal('invite'),...target,supplierIds:z.array(id).min(1).max(30)}).strict(),
 z.object({action:z.literal('uninvite'),...target,supplierId:id}).strict(),
 z.object({action:z.literal('open'),...target}).strict(),
 z.object({action:z.literal('record_response'),...target,supplierId:id,receivedOn:day,leadDays:z.number().int().min(0).max(3650).nullable(),validUntil:day.nullable(),notes:optional(2000),
  prices:z.array(z.object({lineId:id,unitCents:cents}).strict()).min(1).max(100)}).strict(),
 z.object({action:z.literal('clear_response'),...target,supplierId:id}).strict(),
 z.object({action:z.literal('close'),...target}).strict(),
 z.object({action:z.literal('reopen'),...target,dueDate:day}).strict(),
 z.object({action:z.literal('award'),...target,awards:z.array(z.object({lineId:id,supplierId:id}).strict()).min(1).max(100)}).strict(),
 z.object({action:z.literal('generate_orders'),...target,locale:z.enum(['es','en'])}).strict(),
 z.object({action:z.literal('cancel'),...target,reason:optional(300)}).strict(),
]).superRefine((value,ctx)=>{
 const ids=value.action==='create'||value.action==='update'?value.lines.map(line=>line.id):value.action==='record_response'?value.prices.map(price=>price.lineId):value.action==='award'?value.awards.map(award=>award.lineId):value.action==='invite'?value.supplierIds:[];
 if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'duplicated'});
 if(value.action==='record_response'&&value.validUntil&&value.validUntil<value.receivedOn)ctx.addIssue({code:'custom',message:'validity'});
});
export type BidMutation=z.infer<typeof bidMutationSchema>;
/** The API reads at most 16 KiB (413). 100 lines × 300 characters pass the schema but not the body,
 * so the interface measures the UTF-8 size before sending (same rule as contractBytes). */
export const BID_BODY_MAX=16384;
export const bidBytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length;
export const bidQuerySchema=z.discriminatedUnion('view',[
 z.object({view:z.literal('list'),workId}).strict(),
 z.object({view:z.literal('detail'),workId,id}).strict(),
 z.object({view:z.literal('sources'),workId}).strict(),
 z.object({view:z.literal('action'),actionId:id}).strict(),
]);
const stamp=z.string().min(1);
const total=z.number().int().min(0);
export const bidSummarySchema=z.object({id,workId:z.string(),number:z.number().int().min(1),code:z.string().regex(/^LIC-\d{4,6}$/),title:z.string(),status:bidStatusSchema,dueDate:day.nullable(),pastDue:z.boolean(),
 lineCount:z.number().int().min(0),invitedCount:z.number().int().min(0),responseCount:z.number().int().min(0),awardedCents:total,orderCount:z.number().int().min(0),revision,
 openedAt:stamp.nullable(),closedAt:stamp.nullable(),awardedAt:stamp.nullable(),cancelledAt:stamp.nullable(),createdAt:stamp,updatedAt:stamp}).strict();
const offerSchema=z.object({supplierId:id,unitCents:cents,totalCents:total}).strict();
export const bidLineSchema=z.object({id,position:z.number().int().min(1).max(100),description:z.string(),quantity:z.number(),unit:z.string(),budgetCodeId:id.nullable(),budgetCode:z.string().nullable(),
 quotedCount:z.number().int().min(0),lowestCents:total.nullable(),lowestSupplierIds:z.array(id),offers:z.array(offerSchema),award:offerSchema.nullable()}).strict();
export const bidVendorSchema=z.object({supplierId:id,name:z.string(),kind:z.enum(['supplier','subcontractor']),trade:z.string().nullable(),email:z.string(),phone:z.string(),archived:z.boolean(),invitedAt:stamp,
 response:z.object({receivedOn:day,leadDays:z.number().int().nullable(),validUntil:day.nullable(),notes:z.string().nullable(),recordedAt:stamp,expired:z.boolean()}).strict().nullable(),
 quotedCount:z.number().int().min(0),missingCount:z.number().int().min(0),totalCents:total.nullable(),lowestCount:z.number().int().min(0),awardedCents:total.nullable(),
 order:z.object({orderId:id,code:z.string(),status:z.string(),revision:z.number().int()}).strict().nullable()}).strict();
export const bidPackageSchema=bidSummarySchema.extend({scope:z.string().nullable(),cancelReason:z.string().nullable(),lines:z.array(bidLineSchema).max(100),vendors:z.array(bidVendorSchema).max(30),
 comparison:z.object({bestCombinedCents:total.nullable(),unquotedLineCount:z.number().int().min(0),awardedLineCount:z.number().int().min(0)}).strict()}).strict();
export const bidListSchema=z.object({workId:z.string(),cancelledWork:z.boolean(),items:z.array(bidSummarySchema).max(200),nextNumber:z.number().int().min(1),today:day}).strict();
export const bidHistorySchema=z.object({actionId:id,action:z.string(),at:stamp}).strict();
export const bidDetailSchema=z.object({package:bidPackageSchema,history:z.array(bidHistorySchema).max(20),today:day,cancelledWork:z.boolean()}).strict();
export const bidSourcesSchema=z.object({
 budgetItems:z.array(z.object({id,code:z.string(),title:z.string()}).strict()),
 estimateLines:z.array(z.object({estimateId:id,estimateTitle:z.string(),lineId:z.string(),description:z.string(),quantity:z.number(),unit:z.string()}).strict()).max(200),
 vendors:z.array(z.object({id,name:z.string(),kind:z.enum(['supplier','subcontractor']),trade:z.string().nullable()}).strict()).max(300),
}).strict();
export const bidResultSchema=z.object({package:bidPackageSchema,orders:z.array(z.object({supplierId:id,orderId:id,code:z.string(),totalCents:total}).strict()).optional()}).strict();
export type BidSummary=z.infer<typeof bidSummarySchema>;
export type BidPackage=z.infer<typeof bidPackageSchema>;
export type BidLine=z.infer<typeof bidLineSchema>;
export type BidVendor=z.infer<typeof bidVendorSchema>;
export type BidList=z.infer<typeof bidListSchema>;
export type BidDetail=z.infer<typeof bidDetailSchema>;
export type BidSources=z.infer<typeof bidSourcesSchema>;
export type BidResult=z.infer<typeof bidResultSchema>;

/** Same rounding as the SQL and purchase orders: round(quantity × unit cents), half away from zero. */
export function bidLineTotal(quantityValue:number,unitCents:number){const exact=Math.round(quantityValue*1000)*unitCents;return Math.floor((exact+500)/1000);}
export function parseBidQuantity(value:string,en:boolean){const clean=normalizeQuantityInput(value,en);if(!/^\d{1,7}(\.\d{1,3})?$/.test(clean))return null;const n=Number(clean);return n>=0.001&&n<=1000000?n:null;}
/** Possible next states, used by the UI to show only valid actions. */
export const bidTransitions:Record<BidStatus,BidStatus[]>={draft:['open','cancelled'],open:['closed','awarded','cancelled'],closed:['open','awarded','cancelled'],awarded:[],cancelled:[]};
