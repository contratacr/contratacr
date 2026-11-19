import {z} from 'zod';
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;},'Fecha inválida');
const text=(max:number)=>z.string().trim().max(max);
const common={actionId:z.string().uuid(),revision:z.number().int().nonnegative()};
const cents=z.number().int().positive().max(10000000000);
export const expensePaymentMethods=['cash','transfer','card','sinpe','check','other'] as const;
const expensePaymentMethod=z.enum(expensePaymentMethods);
export const expenseVatRates=[1300,400,200,100,50] as const;
// Round 7C: category of a cost (same list in Expenses and in a job's «Registrar gasto»).
export const expenseCategories=['materials','labor','subcontract','equipment','transport','permits','other'] as const;
export function expenseCategoryLabel(value:string,en:boolean){return ({materials:en?'Materials':'Materiales',labor:en?'Labor':'Mano de obra',subcontract:en?'Subcontract':'Subcontrato',equipment:en?'Equipment and rentals':'Equipo y alquileres',transport:en?'Transport':'Transporte',permits:en?'Permits and fees':'Permisos y trámites',other:en?'Other':'Otro'} as Record<string,string>)[value]??value;}
export const expenseMutationSchema=z.discriminatedUnion('action',[
 z.object({...common,action:z.literal('supplier'),id:z.string().uuid(),name:text(160).min(1),identification:text(40),email:z.union([z.literal(''),z.string().email().max(254)]),phone:text(40),archived:z.boolean()}),
 z.object({...common,action:z.literal('expense'),id:z.string().uuid(),supplierId:z.string().uuid(),date:day,dueDate:day.nullable(),currency:z.literal('CRC'),concept:text(300).min(1),amountCents:cents,
  // Round 4B (optional): billable to the customer, how it was paid, VAT included in the amount.
  billable:z.boolean().optional(),paymentMethod:expensePaymentMethod.nullable().optional(),vatRateBps:z.union([z.literal(50),z.literal(100),z.literal(200),z.literal(400),z.literal(1300)]).nullable().optional(),category:z.enum(['materials','labor','subcontract','equipment','transport','permits','other']).nullable().optional()}).refine(value=>!value.dueDate||value.dueDate>=value.date,'El vencimiento no puede ser anterior al gasto'),
 z.object({...common,action:z.literal('payment'),expenseId:z.string().uuid(),amountCents:cents,date:day,method:z.enum(['cash','transfer','card','other']),reference:text(160),note:text(300)}),
 z.object({...common,action:z.literal('reverse'),expenseId:z.string().uuid(),paymentId:z.string().uuid(),date:day,note:text(300).min(1)}),
]);
export type ExpenseMutation=z.infer<typeof expenseMutationSchema>;
export type ExpenseSupplier={id:string;name:string;identification:string;email:string;phone:string;archived:boolean};
export type InternalExpense={id:string;supplierId:string;supplierName:string;date:string;dueDate:string|null;currency:'CRC';concept:string;amountCents:number;paidCents:number;balanceCents:number;status:'pending'|'partial'|'paid';
 billable?:boolean;paymentMethod?:typeof expensePaymentMethods[number]|null;vatRateBps?:number|null;category?:typeof expenseCategories[number]|null;netCents?:number|null;vatCents?:number|null;workId?:string|null;invoicedDraftId?:string|null;receipt?:ExpenseReceipt|null};
export type ExpenseReceipt={id:string;name:string;mimeType:'image/jpeg'|'application/pdf';sizeBytes:number;createdAt:string};
export function expenseMethodLabel(method:string,en:boolean){const labels:Record<string,[string,string]>={cash:['Efectivo','Cash'],transfer:['Transferencia','Transfer'],card:['Tarjeta','Card'],sinpe:['SINPE Móvil','SINPE Móvil'],check:['Cheque','Check'],other:['Otro','Other']};const pair=labels[method];return pair?pair[en?1:0]:method;}
export type ExpensePayment={id:string;kind:'payment'|'reverse';paymentId:string|null;amountCents:number;date:string;method:string;reference:string;note:string;createdAt:string;reversed:boolean};
export type ExpensePage={revision:number;items:(ExpenseSupplier|InternalExpense)[];nextCursor:string|null;expense?:InternalExpense|null;payments?:ExpensePayment[]};
/** Parse internal CRC amounts directly to integer cents, without float multiplication. */
export function expenseCents(value:string):number|null{if(!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(value))return null;const [whole,fraction='']=value.replace(',','.').split('.');const result=Number(whole)*100+Number(fraction.padEnd(2,'0'));return result>0&&result<=10000000000?result:null;}
export function expenseAmount(cents:number):string{return (Math.trunc(cents/100))+'.'+String(cents%100).padStart(2,'0');}
