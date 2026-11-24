import {z} from 'zod';
/** Area D: invoices of one job (project Invoices view): lifecycle row, cards and filters. */
export const workInvoiceStatuses=['draft','sent','viewed','partial','overdue','paid','void'] as const;
export const workInvoiceSchema=z.object({
 id:z.string().uuid(),title:z.string(),receiver:z.string(),createdAt:z.string(),status:z.enum(workInvoiceStatuses),
 totalCents:z.number().int().nonnegative(),balanceCents:z.number().int().nonnegative(),dueDate:z.string().nullable(),daysOverdue:z.number().int().nonnegative(),
 delivered:z.boolean(),sentAt:z.string().nullable().optional(),viewedAt:z.string().nullable().optional(),linkedDocs:z.number().int().nonnegative().optional(),updatedAt:z.string().nullable().optional(),
}).passthrough();
export type WorkInvoice=z.infer<typeof workInvoiceSchema>;
export const workInvoicesSchema=z.object({workId:z.string().min(1).max(160),items:z.array(workInvoiceSchema).max(100)}).strict();
export type WorkInvoiceFilter='all'|'open'|'overdue'|'paid'|'draft'|'void';
export function invoiceGroup(status:string):Exclude<WorkInvoiceFilter,'all'>{
 return status==='draft'?'draft':status==='void'?'void':status==='paid'?'paid':status==='overdue'?'overdue':'open';
}
export function summarizeWorkInvoices(items:readonly Pick<WorkInvoice,'status'|'totalCents'|'balanceCents'>[]){
 let total=0,paid=0,balance=0,overdue=0;const counts={all:items.length,open:0,overdue:0,paid:0,draft:0,void:0};
 for(const item of items){const group=invoiceGroup(item.status);counts[group]++;
  if(group==='void'||group==='draft')continue;
  total+=item.totalCents;balance+=item.balanceCents;paid+=item.totalCents-item.balanceCents;if(group==='overdue')overdue+=item.balanceCents;}
 return {total,paid,balance,overdue,counts};
}
export function filterWorkInvoices<T extends Pick<WorkInvoice,'status'|'title'|'receiver'>>(items:readonly T[],filter:WorkInvoiceFilter,query:string){
 const needle=query.trim().toLocaleLowerCase('es');
 return items.filter(item=>(filter==='all'||invoiceGroup(item.status)===filter)&&(!needle||`${item.title} ${item.receiver}`.toLocaleLowerCase('es').includes(needle)));
}
