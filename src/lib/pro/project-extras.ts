import {z} from 'zod';
/** Area C: side stores for task tags, time markup/taxable, project preferences, statuses and templates. */
const tag=z.string().trim().min(1).max(30).regex(/^[^\u0000-\u001f<>"]+$/);
export const taskExtrasSchema=z.object({tags:z.array(tag).max(8)}).strict();
export const timeExtrasSchema=z.object({markupBps:z.number().int().min(0).max(100000),taxable:z.boolean()}).strict();
export const activityExtrasSchema=z.object({costCents:z.number().int().min(0).max(10000000000).nullable(),rateCents:z.number().int().min(0).max(10000000000).nullable(),markupBps:z.number().int().min(0).max(100000),taxable:z.boolean(),billable:z.boolean()}).strict();
export const OVERVIEW_WIDGETS=['upcoming','files','tasks','schedule','activity'] as const;
export const prefsExtrasSchema=z.object({pinned:z.boolean(),statusId:z.string().max(40).nullable(),layout:z.object({hidden:z.array(z.enum(OVERVIEW_WIDGETS)).max(5),order:z.array(z.enum(OVERVIEW_WIDGETS)).max(5)}).strict().nullable()}).strict();
export const BUILTIN_STATUSES=['open','in_progress','done','closed'] as const;
const statusColor=z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const statusesExtrasSchema=z.object({items:z.array(z.object({id:z.string().regex(/^[a-z0-9_-]{1,40}$/),name:z.string().trim().min(1).max(40),color:statusColor}).strict()).max(20)}).strict();
export const templatesExtrasSchema=z.object({items:z.array(z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(80),type:z.string().trim().max(80),tags:z.array(tag).max(8),tasks:z.array(z.string().trim().min(1).max(160)).max(40),savedAt:z.string().max(40)}).strict()).max(20)}).strict();
export const WORK_KINDS={task:taskExtrasSchema,time:timeExtrasSchema,prefs:prefsExtrasSchema,activity:activityExtrasSchema} as const;
export const OWNER_KINDS={statuses:statusesExtrasSchema,templates:templatesExtrasSchema} as const;
export const extrasRowSchema=z.object({revision:z.number().int().nonnegative(),data:z.record(z.string(),z.unknown())});
export const extrasMutationSchema=z.discriminatedUnion('scope',[
 z.object({scope:z.literal('work'),workId:z.string().min(1).max(160),kind:z.enum(['task','time','prefs','activity']),key:z.string().max(160),revision:z.number().int().min(0).max(999999999),data:z.record(z.string(),z.unknown())}).strict(),
 z.object({scope:z.literal('owner'),kind:z.enum(['statuses','templates']),key:z.string().max(160),revision:z.number().int().min(0).max(999999999),data:z.record(z.string(),z.unknown())}).strict(),
]);
/** Validate the kind-specific shape; returns null when invalid. */
export function parseExtrasData(scope:'work'|'owner',kind:string,data:unknown){
 const schema=(scope==='work'?WORK_KINDS:OWNER_KINDS)[kind as never] as z.ZodType|undefined;
 if(!schema)return null;const r=schema.safeParse(data);return r.success?r.data as Record<string,unknown>:null;
}
/** Markup applied to an hourly rate (basis points), in cents. */
export const markupCents=(baseCents:number,markupBps:number)=>Math.round(baseCents*markupBps/10000);
/** Distinct sorted tags from free text "a, b". */
export function parseTags(text:string){return [...new Set(text.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean))].slice(0,8).map(x=>x.slice(0,30));}
