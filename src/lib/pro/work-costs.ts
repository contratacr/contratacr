import {z} from 'zod';
import {daySchema} from './panel-queries';
export const workCostToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const date=daySchema.refine(value=>value>='1900-01-01'&&value<=workCostToday(),'Indique una fecha válida hasta hoy.');
const common={clientId:z.string().min(1).max(160),workId:z.string().min(1).max(160),requestId:z.string().uuid(),revision:z.number().int().nonnegative()};
const time={date,minutes:z.number().int().min(1).max(1440),hourlyCostCents:z.number().int().min(0).max(10000000000).nullable(),note:z.string().trim().max(300).default('')};
const reason=z.string().trim().min(1).max(300);
export const workCostMutationSchema=z.discriminatedUnion('action',[
 z.object({...common,action:z.literal('add_time'),...time}).strict(),
 z.object({...common,action:z.literal('edit_time'),entryId:z.string().uuid(),reason,...time}).strict(),
 z.object({...common,action:z.literal('void_time'),entryId:z.string().uuid(),reason}).strict(),
 z.object({...common,action:z.literal('link_expense'),expenseId:z.string().uuid(),expenseRevision:z.number().int().nonnegative()}).strict(),
 z.object({...common,action:z.literal('unlink_expense'),entryId:z.string().uuid(),reason}).strict(),
 z.object({...common,action:z.literal('create_expense'),expenseId:z.string().uuid(),supplierId:z.string().uuid(),date,concept:z.string().trim().min(1).max(300),amountCents:z.number().int().positive().max(10000000000),expenseRevision:z.number().int().nonnegative(),
  // Round 7C: same cost fields as «Nuevo gasto» (optional metadata).
  billable:z.boolean().optional(),paymentMethod:z.enum(['cash','transfer','card','sinpe','check','other']).nullable().optional(),vatRateBps:z.union([z.literal(50),z.literal(100),z.literal(200),z.literal(400),z.literal(1300)]).nullable().optional(),category:z.enum(['materials','labor','subcontract','equipment','transport','permits','other']).nullable().optional()}).strict(),
]);
export type WorkCostMutation=z.infer<typeof workCostMutationSchema>;
export type WorkCostEntry={id:string;kind:'time'|'time_void'|'expense'|'expense_unlink';date:string;minutes:number|null;hourlyCostCents:number|null;amountCents:number|null;note:string;expenseId:string|null;supplierName:string|null;reversalId:string|null;reversed:boolean;at:string};
export type WorkCostsPage={revision:number;fingerprint:string;expenseRevision:number;work:{id:string;clientId:string;title:string;cancelled:boolean;clientArchived:boolean};summary:{minutes:number;uncostedMinutes:number;uncostedCount:number;laborCents:number;materialCents:number;expensesCents:number;totalCostCents:number;agreedCents:number|null;resultCents:number|null;agreedSource?:'agreement'|'quote'|'estimate'|null;agreedTaxCents?:number|null;agreedNetCents?:number|null;resultBasis?:'without_tax'|'as_agreed';committedCents?:number;resultWithCommittedCents?:number|null};items:WorkCostEntry[];nextCursor:string|null};
export type WorkExpenseCandidate={id:string;concept:string;supplierName:string;date:string;amountCents:number};
export type WorkExpenseCandidatesPage={revision:number;fingerprint:string;expenseRevision:number;items:WorkExpenseCandidate[];nextCursor:string|null};
export const workCostCursor=z.object({position:z.string().regex(/^\d{1,18}$/)});
export const workExpenseCursor=z.object({id:z.string().uuid()});
export function workTimeCost(minutes:number,hourlyCostCents:number|null):number|null{return hourlyCostCents===null?null:Number((BigInt(minutes)*BigInt(hourlyCostCents)+BigInt(30))/BigInt(60));}
