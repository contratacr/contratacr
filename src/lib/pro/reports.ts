import {z} from 'zod';
/** Round 7B: financial and jobs reports (read-only; pro_reports_read). CRC cents. */
const cents=z.number().int().min(-1e13).max(1e13);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const proReportJobSchema=z.object({workId:z.string().min(1).max(160),service:z.string().max(400),client:z.string().max(400),stage:z.string().max(40),cancelled:z.boolean(),start:day.nullable(),end:day.nullable(),
 agreedCents:cents.nullable(),agreedNetCents:cents.nullable(),invoicedCents:cents,paidCents:cents,balanceCents:cents.nullable(),costCents:cents,committedCents:cents,resultCents:cents.nullable(),
 /* Round 11: result after costs AND committed purchase orders, and its basis (agreed without IVA or as agreed). */
 resultWithCommittedCents:cents.nullable().optional(),resultBasis:z.enum(['without_tax','as_agreed']).optional()}).strict();
export const proReportSchema=z.object({today:day,from:day.nullable(),to:day.nullable(),invoicedCents:cents,collectedCents:cents,outstandingCents:cents,
 aging:z.object({d0_30:cents,d31_60:cents,d61_90:cents,d90_plus:cents,openInvoices:z.number().int().min(0)}).strict(),jobs:z.array(proReportJobSchema).max(200),truncated:z.boolean()}).strict();
export type ProReport=z.infer<typeof proReportSchema>;
export type ProReportJob=z.infer<typeof proReportJobSchema>;
export const proReportQuerySchema=z.object({from:day.optional(),to:day.optional()}).strict().refine(v=>!v.from||!v.to||v.from<=v.to);
/** RFC 4180 CSV; cells that start like a formula are prefixed so spreadsheets never run them. */
export function proCsv(rows:(string|number|null)[][]){
 const cell=(value:string|number|null)=>{let text=value===null?'':String(value);if(/^[=+\-@\t\r]/.test(text)&&typeof value!=='number')text="'"+text;return /[",\r\n;]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;};
 return '﻿'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
/** Cents as a plain decimal for spreadsheets («1234.50»), never localized. */
export const csvAmount=(value:number|null)=>value===null?null:(value/100).toFixed(2);
