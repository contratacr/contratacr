import {z} from 'zod';

/**
 * Round 6B: accounting model shared by the QuickBooks sync, the CSV export and the UI (pure, browser-safe).
 * Costa Rica IVA codes (Anexos v4.4, CodigoTarifaIVA) and their rates.
 */
export const vatCodes=[['08',13],['04',4],['03',2],['02',1],['09',0.5],['01',0],['10',0],['11',0]] as const;
export type VatCode=typeof vatCodes[number][0];
export const vatLabel=(code:string,en:boolean)=>({'08':'IVA 13 %','04':'IVA 4 %','03':'IVA 2 %','02':'IVA 1 %','09':'IVA 0,5 %','01':en?'0 % (exempt rate)':'Tarifa 0 % (exento)','10':en?'Exempt':'Exento','11':en?'0 % without credit':'0 % sin derecho a crédito'} as Record<string,string>)[code]??code;
export const vatRate=(code:string)=>vatCodes.find(([c])=>c===code)?.[1]??0;
export type SourceLine={line:number;description:string;quantity:number|string;unitPrice:number|string;discountType:'percent'|'amount';discount:number|string;taxTreatment:string;taxRate:number|string;vatCode:string};
export type SourceInvoice={localId:string;number:string;emitted:boolean;clave:string|null;clientId:string;customer:string;customerId:string;title:string;date:string;totalCents:number;taxCents:number;currency:string;lines:SourceLine[];hash:string};
export type SourceCustomer={localId:string;name:string;tradeName:string|null;email:string;phone:string;identification:string|null;address:string|null;hash:string};
export type SourcePayment={localId:string;invoiceId:string;clientId:string;amountCents:number;date:string;method:string;reference:string;hash:string};
export type Sources={scope:'emitted'|'all';customers:SourceCustomer[];invoices:SourceInvoice[];payments:SourcePayment[]};
/** Net amount (cents) of each line and the VAT per code, same arithmetic as the draft (5 decimals, rounded at the end). */
export function invoiceBreakdown(invoice:SourceInvoice){
 const rows=invoice.lines.length?invoice.lines.map(line=>{
  const gross=Number(line.quantity)*Number(line.unitPrice),discount=line.discountType==='percent'?gross*Number(line.discount)/100:Number(line.discount);
  const net=Math.round((gross-discount)*100);return {description:line.description,vatCode:line.vatCode||'10',netCents:net,taxCents:Math.round(net*vatRate(line.vatCode)/100)};
 }):[{description:invoice.title,vatCode:invoice.taxCents>0?'08':'10',netCents:invoice.totalCents-invoice.taxCents,taxCents:invoice.taxCents}];
 const byCode=new Map<string,{netCents:number;taxCents:number}>();
 for(const row of rows){const current=byCode.get(row.vatCode)??{netCents:0,taxCents:0};current.netCents+=row.netCents;current.taxCents+=row.taxCents;byCode.set(row.vatCode,current);}
 return {rows,byCode};
}
export const mappingSchema=z.object({
 incomeAccount:z.string().trim().max(100),depositAccount:z.string().trim().max(100),
 vatMap:z.partialRecord(z.enum(['01','02','03','04','08','09','10','11']),z.string().trim().min(1).max(60)),
 invoiceScope:z.enum(['emitted','all']),
}).strict();
export type AccountingMapping=z.infer<typeof mappingSchema>&{revision:number;updatedAt?:string|null};
export const accountingMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save_mapping'),actionId:z.string().uuid(),revision:z.number().int().min(0)}).extend(mappingSchema.shape).strict(),
 z.object({action:z.literal('sync'),actionId:z.string().uuid()}).strict(),
 z.object({action:z.literal('resolve'),actionId:z.string().uuid(),entity:z.enum(['customer','invoice','payment']),localId:z.string().min(1).max(160),choice:z.enum(['keep_local','keep_remote'])}).strict(),
 // Mock only: an accountant edits the record in QuickBooks (to exercise conflict handling).
 z.object({action:z.literal('simulate_remote_edit'),actionId:z.string().uuid(),entity:z.enum(['customer','invoice']),localId:z.string().min(1).max(160)}).strict(),
]);
export type AccountingMutation=z.infer<typeof accountingMutationSchema>;
/** Which pieces of the mapping a sync needs. Returned as human-readable missing items. */
export function mappingGaps(mapping:{incomeAccount:string;depositAccount:string;vatMap:Record<string,string>},sources:Pick<Sources,'invoices'|'payments'>){
 const gaps:string[]=[];
 if(sources.invoices.length&&!mapping.incomeAccount)gaps.push('income');
 if(sources.payments.length&&!mapping.depositAccount)gaps.push('deposit');
 const used=new Set(sources.invoices.flatMap(invoice=>[...invoiceBreakdown(invoice).byCode.keys()]));
 for(const code of used)if(!mapping.vatMap[code])gaps.push('vat:'+code);
 return gaps;
}
