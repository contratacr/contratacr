import {z} from 'zod';
import {taskDueDate} from './work-tasks';

/** Own time tracking (families 21/22): activities, one server-side timer, manual entries. */
const id=z.string().uuid(),day=taskDueDate.unwrap(),cents=z.number().int().min(0).max(10000000000),note=z.string().trim().max(300);
const activityRev=z.number().int().nonnegative().max(2147483646);
export const timeMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('activity_save'),actionId:id,activityId:id,revision:activityRev,name:z.string().trim().min(1).max(80),rateCents:cents,costCents:cents.nullable(),billable:z.boolean()}).strict(),
 z.object({action:z.enum(['activity_archive','activity_restore']),actionId:id,activityId:id,revision:activityRev.min(1)}).strict(),
 z.object({action:z.literal('start'),actionId:id,entryId:id,workId:z.string().min(1).max(160),activityId:id.nullable(),billable:z.boolean(),note,personGrantId:id.nullable().optional()}).strict(),
 z.object({action:z.literal('stop'),actionId:id,entryId:id,minutes:z.number().int().min(1).max(1440).nullable(),note}).strict(),
 z.object({action:z.literal('discard'),actionId:id,entryId:id}).strict(),
 z.object({action:z.literal('manual'),actionId:id,entryId:id,workId:z.string().min(1).max(160),activityId:id.nullable(),billable:z.boolean(),date:day,minutes:z.number().int().min(1).max(1440),note,personGrantId:id.nullable().optional()}).strict(),
 z.object({action:z.literal('void'),actionId:id,entryId:id,revision:z.number().int().min(1).max(2147483646),reason:z.string().trim().min(1).max(300)}).strict(),
]);
export type TimeMutation=z.infer<typeof timeMutationSchema>;
export const timeActivitySchema=z.object({id,name:z.string().min(1).max(80),rateCents:cents,costCents:cents.nullable(),billable:z.boolean(),archived:z.boolean(),revision:z.number().int().positive()}).strict();
export type TimeActivity=z.infer<typeof timeActivitySchema>;
export const timeEntrySchema=z.object({id,workId:z.string(),workTitle:z.string().nullable(),activityId:id.nullable(),activityName:z.string().nullable(),source:z.enum(['timer','manual','ledger']),status:z.enum(['running','stopped','discarded']),startedAt:z.string().nullable(),stoppedAt:z.string().nullable(),minutes:z.number().int().nullable(),recordedOn:taskDueDate,billable:z.boolean(),rateCents:cents.nullable(),costCents:cents.nullable(),note:z.string().max(300),costEntryId:id.nullable(),billableCents:z.number().int().nullable(),voided:z.boolean(),adjusted:z.boolean(),revision:z.number().int().positive(),
 // Round 4B: person (owner or team member of the job) and the active invoice draft that bills it.
 personGrantId:id.nullable().optional(),personName:z.string().max(160).nullable().optional(),invoicedDraftId:id.nullable().optional()}).strict();
export type TimeEntry=z.infer<typeof timeEntrySchema>;
export const timeTotalsSchema=z.object({entries:z.number().int().nonnegative(),minutes:z.number().int().nonnegative(),billableMinutes:z.number().int().nonnegative(),billableCents:z.number().int().nonnegative(),costCents:z.number().int().nonnegative().nullable(),uncostedMinutes:z.number().int().nonnegative(),byActivity:z.array(z.object({activityId:id.nullable(),name:z.string().nullable(),minutes:z.number().int().nonnegative(),billableCents:z.number().int().nonnegative()}).strict())}).strict();
/** Round 4B: who did the work — the owner or an active team member of the job (Equipo). */
export const timePersonSchema=z.object({grantId:id.nullable(),name:z.string().min(1).max(160),self:z.boolean(),memberUserId:id.optional()}).strict();
export type TimePerson=z.infer<typeof timePersonSchema>;
export const timeReadSchema=z.object({workId:z.string(),serverNow:z.string(),period:z.object({from:day,to:day}).strict(),running:timeEntrySchema.nullable(),activities:z.array(timeActivitySchema).max(100),entries:z.array(timeEntrySchema).max(200),totals:timeTotalsSchema,people:z.array(timePersonSchema).max(101).optional(),
 // Closing round (security review M2): Member and Read-only get every cost (per hour, per entry, total) as null.
 costsHidden:z.boolean().optional()}).strict();
export type TimeRead=z.infer<typeof timeReadSchema>;
export const timeResultSchema=z.union([z.object({activity:timeActivitySchema}).strict(),z.object({entry:timeEntrySchema,alreadyStopped:z.boolean()}).strict()]);

/** "1 h 05 min" style duration for minutes. */
export function formatMinutes(total:number){const h=Math.floor(total/60),m=total%60;return h?`${h} h${m?` ${String(m).padStart(2,'0')} min`:''}`:`${m} min`;}
/** Elapsed clock text (h:mm:ss) between an ISO start and a millisecond instant. */
export function formatElapsed(startIso:string,nowMs:number){const s=Math.max(0,Math.floor((nowMs-Date.parse(startIso))/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;return `${h}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;}
/** Hours text such as "1,5" / "1.5" typed by the user → whole minutes (1–1440). */
export function hoursToMinutes(value:string){const clean=value.trim().replace(',','.');if(!/^\d{1,2}(\.\d{1,2})?$/.test(clean))return null;const minutes=Math.round(Number(clean)*60);return minutes>=1&&minutes<=1440?minutes:null;}
