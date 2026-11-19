import {z} from 'zod';
/**
 * Round 11 (local Pro suite): schemas and pure helpers for the accounting reports (aging per customer,
 * payments received, IVA per rate), purchase-order sources (quote lines, approved selections, budget
 * codes) and the per-item selection visibility for the customer. CRC cents everywhere. No network calls.
 */
const id=z.string().uuid();
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents=z.number().int().min(-1e13).max(1e13);
const nint=z.number().int().nonnegative();
// ===== Accounting reports =====
export const financeReportSchema=z.object({today:day,from:day.nullable(),to:day.nullable(),
 customers:z.array(z.object({clientId:z.string(),clientName:z.string(),openCents:cents,d0_30:cents,d31_60:cents,d61_90:cents,d90_plus:cents,openInvoices:nint,oldestDays:z.number().int().nullable()}).strict()),
 payments:z.array(z.object({id,receivedOn:day,clientName:z.string(),workTitle:z.string(),method:z.string(),reference:z.string(),amountCents:cents,reversed:z.boolean()}).strict()).max(500),
 paymentTotals:z.object({count:nint,collectedCents:cents,reversedCents:cents,refundedCents:cents}).strict(),
 vat:z.array(z.object({treatment:z.enum(['vat','exempt','not_subject','pending','source']),ratePercent:z.number().nullable(),baseCents:cents,taxCents:cents,exoneratedCents:cents,lines:nint}).strict()),
 vatTotals:z.object({baseCents:cents,taxCents:cents,exoneratedCents:cents}).strict(),paymentsTruncated:z.boolean()}).strict();
export type FinanceReport=z.infer<typeof financeReportSchema>;
export const paymentMethodLabel=(method:string,en:boolean)=>({transfer:en?'Bank transfer':'Transferencia',sinpe:'SINPE Móvil',cash:en?'Cash':'Efectivo',card:en?'Card':'Tarjeta',check:en?'Check':'Cheque',other:en?'Other':'Otro'} as Record<string,string>)[method]??(method||'—');
/** «13 %» in Spanish, «13%» in English (same rule as the invoice VAT labels). */
export function vatRowLabel(row:{treatment:string;ratePercent:number|null},en:boolean){
 if(row.treatment==='vat'){const rate=String(row.ratePercent??0).replace('.',en?'.':',');return en?`VAT ${rate}%`:`IVA ${rate} %`;}
 return ({exempt:en?'Exempt':'Exento',not_subject:en?'Not subject':'No sujeto',pending:en?'VAT not defined yet':'IVA por definir',source:en?'Invoices without line detail':'Facturas sin detalle por línea'} as Record<string,string>)[row.treatment]??row.treatment;
}
// ===== Purchase-order sources =====
export const poSourcesSchema=z.object({workId:z.string(),quoteTitle:z.string().nullable(),
 quoteLines:z.array(z.object({key:z.string(),lineId:z.string(),description:z.string(),unit:z.string(),quantity:z.number(),priceCents:z.number().int(),taxPercent:z.number(),unitCostCents:z.number().int().nullable(),group:z.string().nullable()}).strict()),
 selections:z.array(z.object({key:z.string(),optionId:id,itemName:z.string(),name:z.string(),brand:z.string().nullable(),quantity:z.number(),unitCents:z.number().int(),unitCostCents:z.number().int().nullable(),orderedQuantity:z.number()}).strict()),
 budget:z.array(z.object({key:z.string(),codeId:id,code:z.string(),title:z.string(),plannedCents:z.number().int().nullable(),committedCents:z.number().int()}).strict())}).strict();
export type PoSources=z.infer<typeof poSourcesSchema>;
export type PoSourceLine={description:string;quantity:number;unit:string;unitCents:number|null;selectionOptionId:string|null;budgetCodeId:string|null};
/**
 * Lines proposed for a new purchase order from the chosen sources. The supplier price is the owner's
 * internal unit cost when known (never the customer price); otherwise it is left empty to be filled in.
 * A budget code proposes one line for what is still not committed (planned − committed, never negative).
 */
export function poLinesFromSources(sources:PoSources,keys:Set<string>,en=false):PoSourceLine[]{
 const unitWord=en?'unit':'unid',lumpSum=en?'lump sum':'global';
 const out:PoSourceLine[]=[];
 for(const line of sources.quoteLines)if(keys.has(line.key))out.push({description:line.description.slice(0,300),quantity:line.quantity,unit:(line.unit||unitWord).slice(0,20),unitCents:line.unitCostCents,selectionOptionId:null,budgetCodeId:null});
 for(const option of sources.selections)if(keys.has(option.key))out.push({description:[option.itemName,option.name,option.brand].filter(Boolean).join(' · ').slice(0,300),quantity:Math.max(option.quantity-option.orderedQuantity,0)||option.quantity,unit:unitWord,unitCents:option.unitCostCents,selectionOptionId:option.optionId,budgetCodeId:null});
 for(const code of sources.budget)if(keys.has(code.key)){const left=code.plannedCents===null?null:Math.max(code.plannedCents-code.committedCents,0);out.push({description:`${code.code} · ${code.title}`.slice(0,300),quantity:1,unit:lumpSum,unitCents:left,selectionOptionId:null,budgetCodeId:code.codeId});}
 return out.slice(0,100);
}
// ===== Selection visibility =====
export const selectionVisibilitySchema=z.object({workId:z.string(),items:z.array(z.object({itemId:id,name:z.string(),areaName:z.string(),published:z.boolean(),hidePrice:z.boolean(),hideLink:z.boolean(),revision:nint}).strict())}).strict();
export type SelectionVisibility=z.infer<typeof selectionVisibilitySchema>;
export const selectionVisibilityInputSchema=z.object({action:z.literal('visibility_set'),actionId:id,workId:z.string().min(1).max(160),items:z.array(z.object({itemId:id,revision:nint,hidePrice:z.boolean(),hideLink:z.boolean()}).strict()).min(1).max(100)}).strict();
// ===== Payment plan reminder (customer view, computed from the plan items it already receives) =====
export function nextInstallment(items:{dueDate:string|null;amountCents:number;appliedCents:number;status:string}[]){
 const open=items.filter(i=>i.status!=='paid'&&i.dueDate);const overdue=open.filter(i=>i.status==='overdue');
 const next=open.filter(i=>i.status!=='overdue').sort((a,b)=>a.dueDate!.localeCompare(b.dueDate!))[0]??null;
 return {overdueCount:overdue.length,overdueCents:overdue.reduce((sum,i)=>sum+i.amountCents-i.appliedCents,0),next:next?{dueDate:next.dueDate!,cents:next.amountCents-next.appliedCents}:null};
}
