import {z} from 'zod';

/**
 * Ronda F2-C (rows 13, 15, 17, 20, 22, 24): contracts of docs/pro/sql/operations-schedule-time-local.sql.
 * Estimate -> schedule proposal and apply, saved task-center views, time clock and weekly timesheets,
 * notification channels (WhatsApp stored, never sent), daily log crew from the team and custom roles.
 */
const id=z.string().uuid(),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/),rev=z.number().int().min(0).max(2147483646);
const wellFormed=(v:string)=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v);
const text=(min:number,max:number)=>z.string().refine(v=>v.trim().length>=min&&v.trim().length<=max&&wellFormed(v));

// ---- Estimate -> schedule ----
export const estimateScheduleLineSchema=z.object({lineId:z.string().nullable(),title:z.string(),group:z.string().nullable(),unit:z.string(),qtyMilli:z.number().int(),days:z.number().int().min(1).max(365)}).strict();
export const estimateScheduleSourceSchema=z.object({workId:z.string(),revision:rev,today:day,existingTasks:z.number().int(),existingPhases:z.number().int(),
 estimates:z.array(z.object({id,title:z.string(),revision:z.number().int().positive(),updatedAt:z.string(),lines:z.array(estimateScheduleLineSchema)}).strict())}).strict();
export type EstimateScheduleSource=z.infer<typeof estimateScheduleSourceSchema>;
export const estimateScheduleTaskSchema=z.object({lineId:z.string().max(80).nullable(),title:text(1,160),days:z.number().int().min(1).max(365),lagDays:z.number().int().min(0).max(60)}).strict();
export const estimateScheduleApplySchema=z.object({action:z.literal('apply'),actionId:id,workId:z.string().min(1).max(160),estimateId:id,estimateRevision:z.number().int().positive(),revision:rev,startDate:day,
 phases:z.array(z.object({title:text(1,160),tasks:z.array(estimateScheduleTaskSchema).min(1).max(100)}).strict()).min(1).max(30)}).strict()
 .refine(v=>v.phases.reduce((n,p)=>n+p.tasks.length,0)<=200);
export type EstimateScheduleApply=z.infer<typeof estimateScheduleApplySchema>;
export const estimateScheduleResultSchema=z.object({action:z.literal('apply'),workId:z.string(),estimateId:id,revision:rev,startDate:day,endDate:day,phaseIds:z.array(id),taskIds:z.array(id),replayed:z.boolean().optional()}).strict();

/** Sequential finish-to-start plan: the first task starts on the start date; each next one the day after the previous ends plus its lag. */
export function estimateSchedulePlan(start:string,phases:{tasks:{days:number;lagDays:number}[]}[]){
 const add=(iso:string,n:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 let prior:string|null=null;
 return phases.map(phase=>phase.tasks.map(task=>{const begin:string=prior===null?start:add(prior,1+task.lagDays);const end=add(begin,task.days-1);prior=end;return {start:begin,end};}));
}

// ---- Saved task-center views ----
export const taskViewFiltersSchema=z.object({status:z.enum(['open','done','all']),timing:z.enum(['all','overdue','today','upcoming']),q:z.string().max(100),job:z.string().max(160),assignee:z.string().max(161)}).strict();
export type TaskViewFilters=z.infer<typeof taskViewFiltersSchema>;
export const taskViewsSchema=z.object({revision:rev,capacity:z.number().int(),items:z.array(z.object({id,name:z.string(),filters:taskViewFiltersSchema}).strict())}).strict();
export type TaskViews=z.infer<typeof taskViewsSchema>;
export const taskViewMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),actionId:id,viewId:id,revision:rev,name:text(1,60),filters:taskViewFiltersSchema}).strict(),
 z.object({action:z.literal('delete'),actionId:id,viewId:id,revision:rev}).strict(),
]);
export const taskViewResultSchema=z.object({action:z.enum(['save','delete']),viewId:id,revision:rev,replayed:z.boolean().optional()}).strict();

// ---- Time clock and timesheets ----
export const timeClockInSchema=z.object({action:z.literal('clock_in'),actionId:id,workId:z.string().min(1).max(160),taskId:id.nullable(),activityId:id.nullable(),billable:z.boolean(),note:z.string().max(300),
 gps:z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180),accuracy:z.number().min(0).max(100000)}).strict().nullable()}).strict();
export const timeClockOptionsSchema=z.object({workId:z.string(),gpsEnabled:z.boolean(),tasks:z.array(z.object({id,title:z.string()}).strict())}).strict();
export const timeClockSettingsSchema=z.object({action:z.literal('settings'),gpsEnabled:z.boolean(),revision:rev}).strict();
export const timesheetDecisionSchema=z.object({action:z.enum(['approve','reopen']),actionId:id,personKey:z.string().min(1).max(200),weekStart:day,digest:z.string().regex(/^[a-f0-9]{32}$/),note:z.string().max(300)}).strict();
export const timeClockMutationSchema=z.union([timeClockInSchema,timeClockSettingsSchema,timesheetDecisionSchema]);
export const timesheetEntrySchema=z.object({id,date:day,workId:z.string(),workTitle:z.string().nullable(),activityName:z.string().nullable(),taskTitle:z.string().nullable(),minutes:z.number().int(),billable:z.boolean(),source:z.string(),note:z.string().nullable()}).strict();
export const timesheetSchema=z.object({weekStart:day,weekEnd:day,canApprove:z.boolean(),canConfigure:z.boolean(),personKey:z.string(),gpsEnabled:z.boolean(),settingsRevision:rev,
 people:z.array(z.object({personKey:z.string(),personName:z.string(),days:z.array(z.number().int()).length(7),totalMinutes:z.number().int(),billableMinutes:z.number().int(),digest:z.string(),entries:z.array(timesheetEntrySchema),
  decision:z.object({decision:z.enum(['approved','reopened']),at:z.string(),by:z.string(),minutes:z.number().int(),note:z.string(),stale:z.boolean()}).strict().nullable()}).strict()),
 open:z.array(z.object({personKey:z.string(),personName:z.string(),workTitle:z.string().nullable(),status:z.string(),startedAt:z.string(),taskTitle:z.string().nullable(),location:z.boolean()}).strict())}).strict();
export type Timesheet=z.infer<typeof timesheetSchema>;
export const timesheetDecisionResultSchema=z.object({action:z.enum(['approve','reopen']),personKey:z.string(),weekStart:day,minutes:z.number().int(),digest:z.string(),replayed:z.boolean().optional()}).strict();
/** Monday (ISO week start) of the Costa Rica day `iso`. */
export function weekStartOf(iso:string){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
/** CSV of a timesheet (UTF-8 with BOM, ; separated so spreadsheets in Spanish open it in columns). */
export function timesheetCsv(sheet:Timesheet,en:boolean){
 const q=(v:string|number|null)=>{const s=String(v??'');return /[";\n\r]/.test(s)||/^[=+\-@]/.test(s)?'"'+(/^[=+\-@]/.test(s)?"'":'')+s.replace(/"/g,'""')+'"':s;};
 const head=en?['Person','Date','Job','Task','Activity','Hours','Minutes','Billable','Source','Note','Week status']:['Persona','Fecha','Trabajo','Tarea','Actividad','Horas','Minutos','Facturable','Origen','Nota','Estado de la semana'];
 const rows=sheet.people.flatMap(p=>p.entries.map(e=>[p.personName,e.date,e.workTitle??'',e.taskTitle??'',e.activityName??'',en?(e.minutes/60).toFixed(2):(e.minutes/60).toFixed(2).replace('.',','),e.minutes,e.billable?(en?'Yes':'Sí'):'No',e.source,e.note??'',
  p.decision?.decision==='approved'&&!p.decision.stale?(en?'Approved':'Aprobada'):(en?'Pending':'Pendiente')]));
 return '﻿'+[head,...rows].map(r=>r.map(q).join(';')).join('\r\n')+'\r\n';
}

// ---- Notification channels ----
export const notificationChannelsSchema=z.object({revision:rev,delivery:z.literal('stored_not_sent'),whatsapp:z.record(z.string(),z.boolean())}).strict();
export const notificationChannelsSaveSchema=z.object({actionId:id,revision:rev,channelRevision:rev,dueSoonDays:z.number().int().min(0).max(14),overdueGraceDays:z.number().int().min(0).max(30),
 prefs:z.record(z.string(),z.object({inApp:z.boolean(),email:z.boolean(),whatsapp:z.boolean()}).strict())}).strict();

// ---- Daily log crew ----
export const teamPersonSchema=z.object({key:z.string(),personId:id,name:z.string(),role:z.string()}).strict();
export const dailyLogCrewSchema=z.object({logId:id,workId:z.string(),revision:z.number().int().positive(),clientVisible:z.boolean(),crewCount:z.number().int().nullable(),crewMinutes:z.number().int().nullable(),
 people:z.array(teamPersonSchema),crew:z.array(z.object({personKey:z.string(),personName:z.string(),minutes:z.number().int().nullable()}).strict())}).strict();
export type DailyLogCrew=z.infer<typeof dailyLogCrewSchema>;
export const dailyLogCrewSaveSchema=z.object({actionId:id,workId:z.string().min(1).max(160),logId:id,revision:z.number().int().positive(),
 crew:z.array(z.object({personKey:z.string().regex(/^person:[0-9a-f-]{36}$/),minutes:z.number().int().min(0).max(1440).nullable()}).strict()).max(50)}).strict();
export const dailyLogCrewResultSchema=z.object({logId:id,workId:z.string(),revision:z.number().int().positive(),crewCount:z.number().int().nullable(),crewMinutes:z.number().int().nullable(),replayed:z.boolean().optional()}).strict();

// ---- Custom roles ----
export const PRO_CAPABILITIES=['read','work.write','lead.write','sales.write','finance.write','company.write','settings.write','team.manage','inventory.write','listing.publish','price.write','menu.write'] as const;
export const baseRoleSchema=z.enum(['admin','manager','member','read_only']);
export const customRolesSchema=z.object({capabilities:z.array(z.string()),matrix:z.record(z.string(),z.array(z.string())),canManage:z.boolean(),
 roles:z.array(z.object({id,name:z.string(),baseRole:baseRoleSchema,capabilities:z.array(z.string()),archived:z.boolean(),revision:z.number().int().positive(),members:z.number().int()}).strict()),
 assignments:z.array(z.object({memberId:id,memberName:z.string(),role:z.string(),customRoleId:id.nullable()}).strict())}).strict();
export type CustomRoles=z.infer<typeof customRolesSchema>;
export const customRoleMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),actionId:id,roleId:id,revision:rev,name:text(1,40),baseRole:baseRoleSchema,capabilities:z.array(z.enum(PRO_CAPABILITIES)).min(1).max(12)}).strict(),
 z.object({action:z.enum(['archive','restore']),actionId:id,roleId:id,revision:rev}).strict(),
 z.object({action:z.literal('assign'),actionId:id,memberId:id,roleId:id.nullable()}).strict(),
]);
export const customRoleResultSchema=z.object({action:z.enum(['save','archive','restore','assign']),roleId:id.nullable(),revision:z.number().int().optional(),memberId:id.optional(),replayed:z.boolean().optional()}).strict();
