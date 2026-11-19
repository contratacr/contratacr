import {z} from 'zod';
/**
 * Round F1-A (register row 55): accounts payable, cash flow and a simple income statement
 * (docs/pro/sql/payables-cashflow-local.sql). Management reports in CRC cents and Costa Rica days:
 * not accounting, not a tax filing, nothing is paid or sent.
 */
const cents=z.number().int().min(-1e13).max(1e13);
const nint=z.number().int().min(0);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const realDay=day.refine(value=>{const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;},'Fecha inválida');
const uuid=z.string().uuid();
export const payableKinds=['purchase_order','expense'] as const;
export const payableStatuses=['pending','partial','paid','void'] as const;
export const payableRowSchema=z.object({sourceKind:z.enum(payableKinds),sourceId:uuid,supplierKey:z.string().max(400),supplierId:uuid.nullable(),supplierName:z.string().max(200),vendorKind:z.enum(['supplier','subcontractor']),
 workId:z.string().max(160).nullable(),workTitle:z.string().max(400),reference:z.string().max(40),concept:z.string().max(400),docDate:day,dueDate:day,
 amountCents:cents,paidCents:cents,balanceCents:cents,status:z.enum(payableStatuses),overdue:z.boolean(),daysOverdue:nint,
 billNumber:z.string().max(60).nullable(),note:z.string().max(300).nullable(),voidReason:z.string().max(300).nullable(),billRevision:nint,sourceRevision:nint}).strict();
export type PayableRow=z.infer<typeof payableRowSchema>;
const aging={d0_30:cents,d31_60:cents,d61_90:cents,d90_plus:cents};
export const payablesPageSchema=z.object({today:day,from:day.nullable(),to:day.nullable(),status:z.enum(['open','all','paid','void']),supplier:z.string().nullable(),overdue:z.boolean(),
 totals:z.object({openCents:cents,openCount:nint,overdueCents:cents,overdueCount:nint,billedCents:cents,paidCents:cents}).strict(),
 aging:z.object(aging).strict(),
 suppliers:z.array(z.object({supplierKey:z.string(),supplierId:uuid.nullable(),supplierName:z.string(),vendorKind:z.enum(['supplier','subcontractor']),openCents:cents,...aging,overdueCents:cents,openBills:nint,oldestDays:z.number().int().nullable()}).strict()),
 items:z.array(payableRowSchema).max(200),matched:nint,truncated:z.boolean(),
 toRegister:z.array(z.object({purchaseOrderId:uuid,workId:z.string(),workTitle:z.string(),reference:z.string(),title:z.string(),supplierName:z.string(),issueDate:day,status:z.enum(['issued','partial','received']),totalCents:cents,paidCents:cents}).strict()).max(50)}).strict();
export type PayablesPage=z.infer<typeof payablesPageSchema>;
export const payablesQuerySchema=z.object({from:realDay.optional(),to:realDay.optional(),status:z.enum(['open','all','paid','void']).optional(),supplier:z.string().min(1).max(200).optional(),overdue:z.enum(['0','1']).optional()}).strict()
 .refine(v=>!v.from||!v.to||v.from<=v.to);
const optionalText=(max:number)=>z.string().trim().max(max).nullable().transform(v=>v===''?null:v);
const common={actionId:uuid,sourceKind:z.enum(payableKinds),sourceId:uuid,revision:z.number().int().min(0).max(2147483646)};
export const expensePayMethods=['transfer','cash','card','other'] as const;
export const orderPayMethods=['transfer','sinpe','cash','card','check','other'] as const;
export const payableMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),...common,billNumber:optionalText(60),billDate:realDay.nullable(),dueDate:realDay.nullable(),note:optionalText(300)}).strict(),
 z.object({action:z.literal('void'),...common,reason:z.string().trim().min(1).max(300)}).strict(),
 z.object({action:z.literal('restore'),...common}).strict(),
 z.object({action:z.literal('pay'),...common,sourceRevision:z.number().int().min(0).max(1e15),amountCents:z.number().int().min(1).max(10000000000),paidOn:realDay,method:z.enum(orderPayMethods),reference:optionalText(160),note:optionalText(300)}).strict(),
]);
export type PayableMutation=z.input<typeof payableMutationSchema>;
export const payableMutationResultSchema=z.object({payable:payableRowSchema}).strict();
// ===== Cash flow =====
export const cashFlowQuerySchema=z.object({from:realDay,to:realDay,grain:z.enum(['week','month']).default('month')}).strict().refine(v=>v.from<=v.to);
const flowPeriod=z.object({start:day,end:day,current:z.boolean(),actualInCents:cents,actualOutCents:cents,expectedInCents:cents,expectedOutCents:cents,overdueInCents:cents,overdueOutCents:cents,netCents:cents,cumulativeCents:cents}).strict();
export const cashFlowSchema=z.object({today:day,from:day,to:day,grain:z.enum(['week','month']),periods:z.array(flowPeriod).max(106),
 totals:z.object({actualInCents:cents,actualOutCents:cents,expectedInCents:cents,expectedOutCents:cents,netCents:cents,undatedInCents:cents}).strict(),
 overdue:z.object({inCents:cents,outCents:cents,count:nint,items:z.array(z.object({direction:z.enum(['in','out']),kind:z.enum(['invoice','installment','expense','purchase_order']),id:z.string(),party:z.string(),workTitle:z.string(),label:z.string(),dueDate:day,amountCents:cents,daysOverdue:nint}).strict()).max(100)}).strict()}).strict();
export type CashFlow=z.infer<typeof cashFlowSchema>;
// ===== Income statement =====
export const incomeQuerySchema=z.object({from:realDay,to:realDay,grain:z.enum(['month','quarter','year']).default('month')}).strict().refine(v=>v.from<=v.to);
const incomeFigures={incomeCents:cents,collectedCents:cents,expensesCents:cents,laborCents:cents,purchaseBillsCents:cents,costCents:cents,resultCents:cents};
export const incomeStatementSchema=z.object({today:day,from:day,to:day,grain:z.enum(['month','quarter','year']),basis:z.literal('management'),
 periods:z.array(z.object({start:day,end:day,...incomeFigures}).strict()).max(60),totals:z.object(incomeFigures).strict(),
 categories:z.array(z.object({category:z.string(),cents:cents}).strict()),
 jobs:z.array(z.object({workId:z.string().nullable(),service:z.string(),client:z.string(),...incomeFigures}).strict()).max(200),jobsTruncated:z.boolean(),taxUnknownInvoices:nint}).strict();
export type IncomeStatement=z.infer<typeof incomeStatementSchema>;

export const payableStatusLabel=(status:string,en:boolean)=>({pending:en?'Pending':'Pendiente',partial:en?'Partially paid':'Parcial',paid:en?'Paid':'Pagada',void:en?'Void':'Anulada'} as Record<string,string>)[status]??status;
export const payableKindLabel=(kind:string,en:boolean)=>({expense:en?'Expense':'Gasto',purchase_order:en?'Purchase order':'Orden de compra',invoice:en?'Invoice':'Factura',installment:en?'Installment':'Cuota'} as Record<string,string>)[kind]??kind;
/** Costa Rica calendar day (UTC-6, no DST), like the SQL readers. */
export function crToday(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function addMonths(dayValue:string,months:number){const [y,m]=dayValue.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+months,1));return d.toISOString().slice(0,10);}
export function monthEnd(dayValue:string){const [y,m]=dayValue.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);}
/** Default windows when the shared period is empty: cash flow = previous month to three months ahead; income = this year to date. */
export function defaultCashWindow(today:string){const first=today.slice(0,8)+'01';return {from:addMonths(first,-1),to:monthEnd(addMonths(first,3))};}
export function defaultIncomeWindow(today:string){return {from:today.slice(0,4)+'-01-01',to:today};}
