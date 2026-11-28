import {z} from 'zod';

/**
 * Montos previstos para materiales por elegir (parity register family 75).
 * A provisional budget line per job that is later defined with the actual choice
 * and reconciled against the planned amount. Amounts are CRC céntimos, like the
 * job budget and the extras/changes module. Nothing here charges or invoices.
 */
const uuid=z.string().uuid(),workId=z.string().trim().min(1).max(160),stamp=z.string().datetime({offset:true});
const cents=z.number().int().min(0).max(10000000000);
const revision=z.number().int().positive().max(2147483646);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;});
const text=(max:number)=>z.string().trim().min(1).max(max);
const optionalText=(max:number)=>z.string().trim().max(max).nullable();
const quantity=z.number().min(0.01).max(1000000).refine(value=>Math.abs(value*100-Math.round(value*100))<1e-6);
export const ALLOWANCE_NOTES_MAX=1000;

const details={name:text(160),category:optionalText(80),plannedCents:cents,dueDate:day.nullable(),notes:optionalText(ALLOWANCE_NOTES_MAX)};
const target={actionId:uuid,workId,id:uuid};
export const allowanceMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),...target,...details}).strict(),
 z.object({action:z.literal('update'),...target,revision,...details}).strict(),
 z.object({action:z.literal('decide'),...target,revision,choiceDescription:text(300),supplier:optionalText(160),quantity,actualCents:cents}).strict(),
 z.object({action:z.enum(['reopen','archive','restore']),...target,revision}).strict(),
 z.object({action:z.literal('link_change'),...target,revision,changeId:uuid}).strict(),
]);
export type AllowanceMutation=z.infer<typeof allowanceMutationSchema>;

const variance=z.enum(['over','under','equal']).nullable(),status=z.enum(['open','decided','reopened']);
export const allowanceItemSchema=z.object({
 id:uuid,workId,position:z.number().int().positive(),name:text(160),category:z.string().min(1).max(80).nullable(),plannedCents:cents,
 dueDate:day.nullable(),notes:z.string().min(1).max(ALLOWANCE_NOTES_MAX).nullable(),status,
 choice:z.object({description:text(300),supplier:z.string().min(1).max(160).nullable(),quantity:z.number().positive(),actualCents:cents,decidedAt:stamp}).strict().nullable(),
 differenceCents:z.number().int().nullable(),variance,overdue:z.boolean(),changeId:uuid.nullable(),archived:z.boolean(),
 revision:z.number().int().positive(),createdAt:stamp,updatedAt:stamp,
}).strict();
export type AllowanceItem=z.infer<typeof allowanceItemSchema>;

const count=z.number().int().nonnegative(),sum=z.number().int();
export const allowanceTotalsSchema=z.object({count,plannedCents:sum,decidedPlannedCents:sum,actualCents:sum,differenceCents:sum,projectedCents:sum,decidedCount:count,pendingCount:count,overdueCount:count}).strict();
export type AllowanceTotals=z.infer<typeof allowanceTotalsSchema>;
export const allowanceHistorySchema=z.object({actionId:uuid,allowanceId:uuid,action:z.enum(['create','update','decide','reopen','archive','restore','link_change']),at:stamp,before:allowanceItemSchema.nullable(),after:allowanceItemSchema}).strict();
export type AllowanceHistoryEntry=z.infer<typeof allowanceHistorySchema>;
/** Live status of each linked extra in Extras y cambios, keyed by change id. */
export const allowanceChangeStatusSchema=z.enum(['proposed','accepted','declined','withdrawn']);
export type AllowanceChangeStatus=z.infer<typeof allowanceChangeStatusSchema>;
/** Purchase-order lines linked to one allowance (migration 562): issued/partial/received count as committed, drafts apart, cancelled never. */
export const allowanceCommitmentSchema=z.object({committedCents:cents,draftCents:cents,receivedCents:cents,
 orders:z.array(z.object({id:uuid,number:z.number().int().positive(),status:z.enum(['draft','issued','partial','received'])}).strict()).max(500)}).strict();
export type AllowanceCommitment=z.infer<typeof allowanceCommitmentSchema>;
export const allowanceCommitmentTotalsSchema=z.object({committedCents:sum,draftCents:sum,receivedCents:sum}).strict();
export const allowanceDetailSchema=z.object({workId,today:day,items:z.array(allowanceItemSchema).max(200),totals:allowanceTotalsSchema,history:z.array(allowanceHistorySchema).max(100),changeStatuses:z.record(uuid,allowanceChangeStatusSchema),
 commitments:z.record(uuid,allowanceCommitmentSchema),commitmentTotals:allowanceCommitmentTotalsSchema}).strict();
/**
 * What a commitment means for one allowance: the reference is the chosen total once decided, the planned amount before.
 * 'over' = the issued orders already exceed it; 'within' = they fit; null = nothing committed.
 */
export function allowanceCommitmentState(item:Pick<AllowanceItem,'status'|'plannedCents'|'choice'>,commitment:AllowanceCommitment|undefined){
 if(!commitment||commitment.committedCents===0)return null;
 const reference=item.status==='decided'&&item.choice?item.choice.actualCents:item.plannedCents;
 return {reference,remainingCents:reference-commitment.committedCents,state:commitment.committedCents>reference?'over' as const:'within' as const};
}
export type AllowanceDetail=z.infer<typeof allowanceDetailSchema>;
export const allowanceResultSchema=z.object({item:allowanceItemSchema}).strict();

/** Customer view: no internal notes, revisions, linked change ids or history. */
export const clientAllowanceItemSchema=z.object({
 id:uuid,name:text(160),category:z.string().min(1).max(80).nullable(),plannedCents:cents,dueDate:day.nullable(),status,
 choice:z.object({description:text(300),supplier:z.string().min(1).max(160).nullable(),quantity:z.number().positive(),actualCents:cents}).strict().nullable(),
 differenceCents:z.number().int().nullable(),variance,
}).strict();
export const clientAllowancesSchema=z.union([
 z.object({visible:z.literal(false)}).strict(),
 z.object({visible:z.literal(true),items:z.array(clientAllowanceItemSchema).max(200),totals:z.object({plannedCents:sum,actualCents:sum,decidedPlannedCents:sum,differenceCents:sum,pendingCount:count,decidedCount:count}).strict()}).strict(),
]);
export type ClientAllowances=z.infer<typeof clientAllowancesSchema>;

/** Colones typed by the user (dots or spaces as thousands, comma or dot with up to 2 decimals) → céntimos. */
export function colonesToCents(value:string){
 const clean=value.trim().replace(/[₡\s]/g,'');
 if(!clean)return null;
 let normalized=clean;
 if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(clean))normalized=clean.replace(/\./g,'').replace(',','.');
 else if(/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(clean))normalized=clean.replace(/,/g,'');
 else normalized=clean.replace(',','.');
 if(!/^\d{1,8}(\.\d{1,2})?$/.test(normalized))return null;
 const [whole,fraction='']=normalized.split('.');const result=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return result<=10000000000?result:null;
}
export function centsToInput(value:number){return value%100===0?String(value/100):(value/100).toFixed(2).replace('.',',');}
/** Quantities follow the same grouping rule as colones in each language, so «1.000»
 * typed in Spanish means one thousand (as «₡1.000» does), never 1. */
export function normalizeQuantityInput(value:string,en:boolean){
 const raw=value.trim().replace(/\s/g,'');
 if(!en&&/^\d{1,3}(\.\d{3})+(,\d{1,3})?$/.test(raw))return raw.replace(/\./g,'').replace(',','.');
 if(en&&/^\d{1,3}(,\d{3})+(\.\d{1,3})?$/.test(raw))return raw.replace(/,/g,'');
 return raw.replace(',','.');
}
/** Edit value for a stored quantity: no padding zeros and the language's decimal mark («1,5» / «1.5»). */
export function quantityToInput(value:number,en:boolean,decimals=3){const text=String(Number(value.toFixed(decimals)));return en?text:text.replace('.',',');}
/** Read-only quantity: no padding zeros («1», «1,5» / «1.5»); thousands never use «.» in Spanish output. */
export function formatQuantity(value:number|string,en:boolean,decimals=3){const n=typeof value==='number'?value:Number(String(value).trim());if(!Number.isFinite(n))return String(value);return new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:decimals}).format(n);}
export function parseQuantity(value:string,en:boolean){const clean=normalizeQuantityInput(value,en);if(!/^\d{1,7}(\.\d{1,2})?$/.test(clean))return null;const n=Number(clean);return n>=0.01&&n<=1000000?n:null;}

/** Row 75: positive difference of a defined allowance sent to a DRAFT estimate of the same job as a surcharge line. */
export const surchargeSendSchema=z.object({
 action:z.literal('send_to_estimate'),actionId:uuid,workId,id:uuid,revision,estimateId:uuid,estimateRevision:revision,lineId:uuid,taxBps:z.number().int().min(0).max(10000),
}).strict();
export type SurchargeSend=z.infer<typeof surchargeSendSchema>;
export const surchargeResultSchema=z.object({allowanceId:uuid,estimateId:uuid,estimateRevision:revision,lineId:uuid,amountCents:z.number().int().positive(),taxBps:z.number().int(),estimateTotalCents:z.number().int()}).strict();
export const surchargeDetailSchema=z.object({
 workId,
 estimates:z.array(z.object({id:uuid,title:z.string(),revision,totalCents:z.number().int(),lineCount:z.number().int()}).strict()).max(200),
 links:z.array(z.object({allowanceId:uuid,estimateId:uuid,estimateTitle:z.string(),lineId:uuid,amountCents:z.number().int(),taxBps:z.number().int(),sentAt:stamp,present:z.boolean()}).strict()).max(200),
}).strict();
export type SurchargeDetail=z.infer<typeof surchargeDetailSchema>;
