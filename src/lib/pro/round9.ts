import {z} from 'zod';

/**
 * Round 9 (2026-11-15, local): shared schemas of the global hours view, the task center bulk
 * actions, the notification center, company library organizer, subcontractor comment files,
 * selections from the catalog and document branding. SQL functions are the authority.
 */
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const timeReportQuerySchema=z.object({from:day,to:day,workId:z.string().min(1).max(160).optional(),person:z.string().min(1).max(200).optional(),billable:z.enum(['all','billable','nonbillable']).optional(),format:z.enum(['json','csv']).optional(),lang:z.enum(['es','en']).optional()}).strict();
const timeRow=z.object({id:z.string(),workId:z.string(),workTitle:z.string(),date:day,minutes:z.number().int(),billable:z.boolean(),billableCents:z.number().int().nullable(),costCents:z.number().int().nullable(),activity:z.string().nullable(),personKey:z.string(),personName:z.string(),source:z.string(),note:z.string()});
export const timeReportSchema=z.object({
 period:z.object({from:day,to:day}),filters:z.object({workId:z.string().nullable(),person:z.string().nullable(),billable:z.string()}),
 rows:z.array(timeRow),truncated:z.boolean(),
 totals:z.object({entries:z.number().int(),minutes:z.number().int(),billableMinutes:z.number().int(),billableCents:z.number().int(),costCents:z.number().int().nullable(),uncostedMinutes:z.number().int()}),
 byPerson:z.array(z.object({key:z.string(),name:z.string(),minutes:z.number().int(),billableCents:z.number().int()})),
 byWork:z.array(z.object({workId:z.string(),title:z.string(),minutes:z.number().int(),billableCents:z.number().int()})),
 people:z.array(z.object({key:z.string(),name:z.string()})),jobs:z.array(z.object({workId:z.string(),title:z.string()})),
 // Closing round (security review M2): Member and Read-only get every cost as null and no cost column in the CSV.
 costsHidden:z.boolean().optional(),
});
export type TimeReport=z.infer<typeof timeReportSchema>;
/** CSV for Excel: «;» separated, BOM, formulas neutralised, minutes and hours, CRC in colones with 2 decimals. */
export function timeReportCsv(report:TimeReport,en:boolean){
 const cell=(value:string|number|null)=>{let text=value===null?'':String(value);if(/^[=+\-@\t\r]/.test(text))text="'"+text;return /[;"\n\r]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;};
 const crc=(cents:number|null)=>cents===null?'':(cents/100).toFixed(2);
 const head=en?['Date','Job','Person','Activity','Minutes','Hours','Billable','Billable amount (CRC)','Cost (CRC)','Source','Note']:['Fecha','Trabajo','Persona','Actividad','Minutos','Horas','Facturable','Monto facturable (CRC)','Costo (CRC)','Origen','Nota'];
 const keep=<T,>(cells:T[])=>report.costsHidden?cells.filter((_,i)=>i!==8):cells;
 const yes=en?'Yes':'Sí',no='No',source=(value:string)=>value==='ledger'?(en?'Costs':'Costos'):value==='timer'?(en?'Timer':'Cronómetro'):(en?'Manual':'Manual');
 const lines=[keep(head).map(cell).join(';'),...report.rows.map(row=>keep([row.date,row.workTitle,row.personName,row.activity,row.minutes,(row.minutes/60).toFixed(2),row.billable?yes:no,crc(row.billableCents),crc(row.costCents),source(row.source),row.note]).map(cell).join(';'))];
 lines.push(keep([en?'Total':'Total','','','',report.totals.minutes,(report.totals.minutes/60).toFixed(2),'',crc(report.totals.billableCents),crc(report.totals.costCents),'','']).map(cell).join(';'));
 return '﻿'+lines.join('\r\n')+'\r\n';
}

export const notificationEvents=['task_assigned','task_due','client_message','quote_accepted','quote_changes','invoice_paid','invoice_overdue','bid_received','daily_log_missing','payment_plan_due'] as const;
export type NotificationEvent=typeof notificationEvents[number];
const pref=z.object({inApp:z.boolean(),email:z.boolean()}).strict();
export const notificationSettingsSchema=z.object({revision:z.number().int().min(0),dueSoonDays:z.number().int().min(0).max(14),overdueGraceDays:z.number().int().min(0).max(30),prefs:z.record(z.enum(notificationEvents),pref)});
export const notificationSchema=z.object({id:z.string().uuid(),event:z.enum(notificationEvents),title:z.string(),body:z.string(),link:z.record(z.string(),z.unknown()),createdAt:z.string(),read:z.boolean(),emailDraft:z.boolean()});
export const notificationPageSchema=z.object({items:z.array(notificationSchema),unread:z.number().int(),hasMore:z.boolean(),next:z.object({at:z.string(),id:z.string()}).nullable(),settings:notificationSettingsSchema});
export type NotificationItem=z.infer<typeof notificationSchema>;
export type NotificationSettings=z.infer<typeof notificationSettingsSchema>;
export const notificationQuerySchema=z.object({view:z.enum(['unread','all','count']),afterAt:z.string().max(40).optional(),afterId:z.string().uuid().optional()}).strict();
export const notificationInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.enum(['read','unread']),actionId:z.string().uuid(),ids:z.array(z.string().uuid()).min(1).max(100)}).strict(),
 z.object({action:z.literal('read_all'),actionId:z.string().uuid()}).strict(),
 z.object({action:z.literal('settings'),actionId:z.string().uuid(),revision:z.number().int().min(0),dueSoonDays:z.number().int().min(0).max(14),overdueGraceDays:z.number().int().min(0).max(30),prefs:z.partialRecord(z.enum(notificationEvents),pref)}).strict(),
]);

export const companyTrashItemSchema=z.object({id:z.string().uuid(),folderId:z.string().uuid(),name:z.string(),folders:z.number().int(),files:z.number().int(),trashedAt:z.string(),restoreUntil:day,restoredAt:z.string().nullable(),restoredToRoot:z.boolean().nullable()});
export const companyTrashPageSchema=z.object({items:z.array(companyTrashItemSchema)});
export type CompanyTrashItem=z.infer<typeof companyTrashItemSchema>;
export const companyTrashInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('trash'),actionId:z.string().uuid(),folderId:z.string().uuid(),revision:z.number().int().min(1)}).strict(),
 z.object({action:z.literal('restore'),actionId:z.string().uuid(),trashId:z.string().uuid()}).strict(),
]);
