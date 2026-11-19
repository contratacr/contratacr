import {z} from 'zod';
import {contactFields,type ContactField,type ContactRow} from './round10';

/**
 * Ronda F2-B (row 05, local Pro suite): strict contracts for customer custom fields (text, number, date,
 * select), additional phones/e-mails per customer and the import that writes both with the new customers.
 * SQL (docs/pro/sql/contact-fields-local.sql) is the authority; these schemas only check its answers.
 */
const uuid=z.string().uuid(),nint=z.number().int().nonnegative(),stamp=z.string().min(10);
export const contactFieldKinds=['text','number','date','select'] as const;
export type ContactFieldKind=typeof contactFieldKinds[number];
export const contactFieldSchema=z.object({id:uuid,label:z.string().min(1).max(60),kind:z.enum(contactFieldKinds),options:z.array(z.string().min(1).max(60)).max(20),position:nint,archived:z.boolean(),usage:nint}).strict();
export type ContactFieldDef=z.infer<typeof contactFieldSchema>;
export const contactFieldsReadSchema=z.object({revision:nint,capacity:z.literal(30),fields:z.array(contactFieldSchema).max(500)}).strict();
export type ContactFieldsRead=z.infer<typeof contactFieldsReadSchema>;
export const contactChannelSchema=z.object({id:uuid,kind:z.enum(['phone','email']),value:z.string().min(1).max(254),label:z.string().max(30)}).strict();
export type ContactChannel=z.infer<typeof contactChannelSchema>;
const extrasCore={revision:nint,values:z.array(z.object({fieldId:uuid,value:z.string().min(1).max(500)}).strict()).max(500),channels:z.array(contactChannelSchema).max(10)};
export const contactExtrasHistorySchema=z.object({actionId:uuid,action:z.enum(['extras_save','import']),actorName:z.string().max(160),at:stamp,before:z.unknown(),after:z.unknown()}).strict();
export const contactExtrasReadSchema=z.object({clientId:z.string().min(1).max(160),...extrasCore,history:z.array(contactExtrasHistorySchema).max(20)}).strict();
export type ContactExtrasRead=z.infer<typeof contactExtrasReadSchema>;
export const contactExtrasExportSchema=z.object({fields:z.array(z.object({id:uuid,label:z.string(),kind:z.enum(contactFieldKinds)}).strict()),items:z.record(z.string(),z.object(extrasCore).strict())}).strict();
export type ContactExtrasExport=z.infer<typeof contactExtrasExportSchema>;
export const contactFieldsResultSchema=z.union([
 z.object({action:z.enum(['field_save','field_archive','field_restore','field_reorder']),revision:nint,capacity:z.literal(30),fields:z.array(contactFieldSchema),replayed:z.literal(true).optional()}).strict(),
 z.object({action:z.literal('extras_save'),clientId:z.string(),...extrasCore,replayed:z.literal(true).optional()}).strict(),
]);
const channelInput=z.object({kind:z.enum(['phone','email']),value:z.string().max(254),label:z.string().max(30)}).strict();
export const contactFieldsInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('field_save'),actionId:uuid,revision:nint,id:uuid,label:z.string().max(120),kind:z.enum(contactFieldKinds),options:z.array(z.string().max(120)).max(20)}).strict(),
 z.object({action:z.enum(['field_archive','field_restore']),actionId:uuid,revision:nint,id:uuid}).strict(),
 z.object({action:z.literal('field_reorder'),actionId:uuid,revision:nint,ids:z.array(uuid).max(30)}).strict(),
 z.object({action:z.literal('extras_save'),actionId:uuid,revision:nint,clientId:z.string().min(1).max(160),values:z.record(uuid,z.string().max(500).nullable()),channels:z.array(channelInput).max(10)}).strict(),
]);
export type ContactFieldsInput=z.infer<typeof contactFieldsInputSchema>;
export const definitionActions=new Set(['field_save','field_archive','field_restore','field_reorder']);

// ===== Import mapping beyond the base fields =====
export const contactExtraTargets=['phone2','email2'] as const;
export type ContactMapTarget=ContactField|''|typeof contactExtraTargets[number]|`custom:${string}`;
export type ContactExtrasRow={fields:Record<string,string>;phones:string[];emails:string[]};
export const contactExtrasRowSchema=z.object({fields:z.record(uuid,z.string().max(500)),phones:z.array(z.string().max(100)).max(3),emails:z.array(z.string().max(400)).max(3)}).strict();
/** Base-field part of a mapping (extra targets become "ignore" for the existing import contract). */
export function baseMapping(mapping:ContactMapTarget[]):(ContactField|'')[]{return mapping.map(m=>(contactFields as readonly string[]).includes(m)?m as ContactField:'');}
export function mapContactExtras(rows:string[][],mapping:ContactMapTarget[]):ContactExtrasRow[]{
 return rows.map(r=>{const out:ContactExtrasRow={fields:{},phones:[],emails:[]};mapping.forEach((m,i)=>{const v=(r[i]??'').trim();if(!v||!m)return;
  if(m==='phone2'){for(const p of v.split(/[;|\/]/).map(x=>x.trim()).filter(Boolean))if(out.phones.length<3)out.phones.push(p);}
  else if(m==='email2'){for(const p of v.split(/[;,|\s]+/).map(x=>x.trim()).filter(Boolean))if(out.emails.length<3)out.emails.push(p);}
  else if(m.startsWith('custom:')){const id=m.slice(7);if(!out.fields[id])out.fields[id]=v.slice(0,500);}});return out;});
}
export function hasExtras(rows:ContactExtrasRow[]){return rows.some(r=>Object.keys(r.fields).length||r.phones.length||r.emails.length);}
/** Guess a custom-field target by its label (exact, case and accent insensitive). */
export function guessCustomMapping(headers:string[],mapping:ContactMapTarget[],fields:ContactFieldDef[]):ContactMapTarget[]{
 const key=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase(),used=new Set(mapping);
 return mapping.map((m,i)=>{if(m)return m;const f=fields.find(d=>!d.archived&&key(d.label)===key(headers[i]??'')&&!used.has(`custom:${d.id}`));if(f){used.add(`custom:${f.id}`);return `custom:${f.id}` as const;}
  if(/^(tel[eé]fono|phone|celular|m[oó]vil|mobile|whatsapp) ?(2|adicional|secundario|otro|alterno|additional|other|work|trabajo)$/i.test((headers[i]??'').trim())&&!used.has('phone2')){used.add('phone2');return 'phone2';}
  if(/^(correo|e-?mail) ?(2|adicional|secundario|otro|alterno|additional|other|work|trabajo)$/i.test((headers[i]??'').trim())&&!used.has('email2')){used.add('email2');return 'email2';}
  return m;});
}
/** Canonical value the server will keep (mirror of pro_contact_field_value), or null when invalid. */
export function canonicalFieldValue(kind:ContactFieldKind,options:string[],raw:string):string|null{
 const v=raw.trim();if(!v)return '';
 if(kind==='text')return v.length>500||/[\u0000-\u001f\u007f]/.test(v)?null:v;
 if(kind==='number'){if(!/^-?\d{1,12}([.,]\d{1,4})?$/.test(v))return null;return String(Number(v.replace(',','.')));}
 if(kind==='date'){if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;const d=new Date(v+'T12:00:00Z');return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==v||v<'1900-01-01'||v>'2100-12-31'?null:v;}
 return options.includes(v)?v:null;
}
export type {ContactRow};
