import {z} from 'zod';

/**
 * Notas y llamadas del proyecto: private log per job (owner only). Mirrors
 * docs/pro/sql/project-notes-details-local.sql. Dates are Costa Rica wall time
 * ('YYYY-MM-DDTHH:MM', UTC-6 without DST); the server rejects future entries.
 */
const id=z.string().uuid();
const workId=z.string().trim().min(1).max(160);
const revision=z.number().int().min(1).max(2147483646);
export const crLocalMinute=z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const NOTE_BODY_MAX=4000;
export const noteKindSchema=z.enum(['note','call']);
export type NoteKind=z.infer<typeof noteKindSchema>;
export const noteFilterSchema=z.enum(['all','note','call']);
export type NoteFilter=z.infer<typeof noteFilterSchema>;
export const noteStateSchema=z.enum(['active','archived']);
export type NoteState=z.infer<typeof noteStateSchema>;
export const callDirectionSchema=z.enum(['inbound','outbound']);
export type CallDirection=z.infer<typeof callDirectionSchema>;
const body=z.string().trim().max(NOTE_BODY_MAX).nullable().transform(value=>value?value:null);
const contact=z.string().trim().max(160).nullable().transform(value=>value?value:null);
const duration=z.number().int().min(0).max(1440).nullable();
const fields={body,occurredAt:crLocalMinute.nullable(),durationMinutes:duration,direction:callDirectionSchema.nullable(),contact};
const target={actionId:id,workId,id,revision};
type NoteFields={body:string|null;occurredAt:string|null;durationMinutes:number|null;direction:CallDirection|null;contact:string|null};
/** Field rules per kind (same as SQL): a note needs text and has no call fields; a call needs date, duration and direction. */
export function noteKindIssues(kind:NoteKind,value:NoteFields){
 const issues:Array<keyof NoteFields|'callFields'>=[];
 if(kind==='note'){if(!value.body)issues.push('body');if(value.durationMinutes!==null||value.direction!==null||value.contact!==null)issues.push('callFields');}
 else{if(!value.occurredAt)issues.push('occurredAt');if(value.durationMinutes===null)issues.push('durationMinutes');if(value.direction===null)issues.push('direction');}
 return issues;
}
const createSchema=z.object({action:z.literal('create'),actionId:id,workId,id,kind:noteKindSchema,...fields}).strict();
const updateSchema=z.object({action:z.literal('update'),...target,...fields}).strict();
export const noteMutationSchema=z.discriminatedUnion('action',[
 createSchema,updateSchema,
 z.object({action:z.literal('pin'),...target}).strict(),
 z.object({action:z.literal('unpin'),...target}).strict(),
 z.object({action:z.literal('archive'),...target}).strict(),
 z.object({action:z.literal('restore'),...target}).strict(),
]).superRefine((value,ctx)=>{if(value.action==='create')for(const issue of noteKindIssues(value.kind,value))ctx.addIssue({code:'custom',path:[issue],message:'required'});});
export type NoteMutation=z.infer<typeof noteMutationSchema>;

const cursor=z.string().regex(/^\d{20}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const noteQuerySchema=z.discriminatedUnion('view',[
 z.object({view:z.literal('list'),workId,kind:noteFilterSchema.default('all'),state:noteStateSchema.default('active'),q:z.string().max(160).default(''),after:cursor.nullable().default(null)}).strict(),
 z.object({view:z.literal('history'),workId,id}).strict(),
 z.object({view:z.literal('action'),actionId:id}).strict(),
]);
export type NoteQuery=z.infer<typeof noteQuerySchema>;
const stamp=z.string().min(1);
export const projectNoteSchema=z.object({
 id,workId:z.string(),kind:noteKindSchema,body:z.string().nullable(),occurredAt:stamp,occurredLocal:crLocalMinute,
 durationMinutes:z.number().int().nullable(),direction:callDirectionSchema.nullable(),contact:z.string().nullable(),
 pinned:z.boolean(),archived:z.boolean(),archivedAt:stamp.nullable(),revision,edited:z.boolean(),createdAt:stamp,updatedAt:stamp,
}).strict();
export type ProjectNote=z.infer<typeof projectNoteSchema>;
const count=z.number().int().nonnegative();
export const noteProjectSchema=z.object({workId:z.string(),name:z.string(),client:z.string(),status:z.enum(['open','in_progress','completed','cancelled'])}).strict();
export const notePageSchema=z.object({
 items:z.array(projectNoteSchema).max(20),pinned:z.array(projectNoteSchema).max(10),nextCursor:cursor.nullable(),
 counts:z.object({all:count,note:count,call:count,archived:count}).strict(),project:noteProjectSchema,
}).strict();
export type NotePage=z.infer<typeof notePageSchema>;
export const noteHistorySchema=z.object({note:projectNoteSchema,versions:z.array(z.object({actionId:id,action:z.enum(['create','update','pin','unpin','archive','restore']),at:stamp,before:projectNoteSchema.nullable(),after:projectNoteSchema}).strict()).max(50)}).strict();
export type NoteHistory=z.infer<typeof noteHistorySchema>;
export const noteResultSchema=z.object({note:projectNoteSchema}).strict();

/** Current Costa Rica minute as 'YYYY-MM-DDTHH:MM' (default for the composer). */
export function crNowMinute(now=new Date()){return new Date(now.getTime()-6*3600000).toISOString().slice(0,16);}
