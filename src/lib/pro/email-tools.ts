import {z} from 'zod';
/** Family 10: reusable email templates and the synced inbox (migration 370). */
export const TEMPLATE_VARIABLES=[
 {key:'cliente',es:'Nombre del cliente',en:'Client name'},{key:'trabajo',es:'Nombre del trabajo',en:'Job name'},
 {key:'empresa',es:'Su empresa',en:'Your business'},{key:'fecha',es:'Fecha de hoy',en:"Today's date"},
] as const;
export const emailTemplateSchema=z.object({id:z.string().uuid(),name:z.string(),subject:z.string(),body:z.string(),locale:z.enum(['es','en']),archived:z.boolean(),revision:z.number().int().positive(),updatedAt:z.string()});
export type EmailTemplate=z.infer<typeof emailTemplateSchema>;
export const inboxMessageSchema=z.object({provider:z.enum(['google','microsoft']),remoteId:z.string(),mode:z.enum(['mock','sandbox','production']),fromEmail:z.string(),fromName:z.string().nullable(),subject:z.string(),snippet:z.string(),receivedAt:z.string(),workId:z.string().nullable()});
export type InboxMessage=z.infer<typeof inboxMessageSchema>;
export const emailToolsMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('template_save'),id:z.string().uuid().nullable(),revision:z.number().int().min(0).max(999999999),name:z.string().trim().min(1).max(80),
  subject:z.string().trim().min(1).max(200),body:z.string().trim().min(1).max(20000),locale:z.enum(['es','en'])}).strict(),
 z.object({action:z.literal('template_archive'),id:z.string().uuid(),revision:z.number().int().min(1).max(999999999)}).strict(),
 z.object({action:z.literal('inbox_sync'),provider:z.enum(['google','microsoft'])}).strict(),
 z.object({action:z.literal('inbox_link'),provider:z.enum(['google','microsoft']),remoteId:z.string().min(1).max(200),workId:z.string().min(1).max(160).nullable()}).strict(),
]);
export type EmailToolsMutation=z.infer<typeof emailToolsMutationSchema>;
/** Replaces {{variable}} markers; unknown markers and missing values are left visible so nothing is sent half-filled by mistake. */
export function fillTemplate(text:string,values:Partial<Record<typeof TEMPLATE_VARIABLES[number]['key'],string>>){
 return text.replace(/\{\{\s*([a-z]+)\s*\}\}/g,(whole,key:string)=>values[key as keyof typeof values]?.trim()||whole);
}
