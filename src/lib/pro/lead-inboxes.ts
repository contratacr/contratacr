import {z} from 'zod';
import {leadCommercialPageSchema} from './lead-commercial-progress';
import {requestPipelineCatalogSchema,requestPipelineStageIdSchema} from './request-pipeline';
import {parseCatalogCsv} from './catalog-import';

const id=z.string().uuid(),stamp=z.string().datetime({offset:true}),count=z.number().int().nonnegative(),kind=z.enum(['manual','request']);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v);
export const leadInboxBoxSchema=z.enum(['active','snoozed','archived']);
export type LeadInboxBox=z.infer<typeof leadInboxBoxSchema>;
export const leadSnoozeSchema=z.object({kind,id,revision:z.number().int().nonnegative(),active:z.boolean(),until:day.nullable(),note:z.string().max(500),snoozed:z.boolean(),updatedAt:stamp.nullable()}).strict().refine(v=>(v.active===(v.until!==null))&&(!v.snoozed||v.active)&&(v.revision===0)===(v.updatedAt===null));
export type LeadSnooze=z.infer<typeof leadSnoozeSchema>;
export const leadInboxCountsSchema=z.object({active:count,snoozed:count,archived:count,imports:count,stages:z.array(z.object({stageId:requestPipelineStageIdSchema,count}).strict()).min(6).max(18)}).strict();
export type LeadInboxCounts=z.infer<typeof leadInboxCountsSchema>;
const commercialKey=(v:{kind:string;id:string})=>v.kind+':'+v.id;
export const leadInboxPageSchema=z.object({page:leadCommercialPageSchema.shape.page,context:leadCommercialPageSchema.shape.context,stages:leadCommercialPageSchema.shape.stages,snoozes:z.array(leadSnoozeSchema).max(20),inboxes:leadInboxCountsSchema,services:z.array(z.string().min(1).max(160)).max(100),assignments:z.record(z.string(),z.object({assigneeId:z.string().uuid().nullable(),revision:z.number().int().nonnegative()}).strict()).optional()}).strict().superRefine((v,c)=>{
 if(!leadCommercialPageSchema.safeParse({page:v.page,context:v.context,stages:v.stages}).success)c.addIssue({code:'custom',message:'Invalid lead page.'});
 if(v.snoozes.length!==v.page.items.length||v.page.items.some((item,n)=>commercialKey(item)!==commercialKey(v.snoozes[n])))c.addIssue({code:'custom',message:'Invalid snooze rows.'});
 if(JSON.stringify(v.inboxes.stages.map(s=>s.stageId))!==JSON.stringify(v.page.catalog.stages.map(s=>s.id))||v.inboxes.stages.reduce((n,s)=>n+s.count,0)>v.inboxes.active)c.addIssue({code:'custom',message:'Invalid inbox counters.'});
});
export type LeadInboxPage=z.infer<typeof leadInboxPageSchema>;
export const leadSnoozeHistorySchema=z.object({actionId:id,action:z.enum(['snooze','wake']),at:stamp,before:leadSnoozeSchema,after:leadSnoozeSchema}).strict();
export const leadSnoozeReadSchema=z.object({snooze:leadSnoozeSchema,history:z.array(leadSnoozeHistorySchema).max(20)}).strict();
export const leadSnoozeMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('snooze'),actionId:id,kind,id,revision:z.number().int().nonnegative().max(2147483646),until:day,note:z.string().trim().max(500)}).strict(),
 z.object({action:z.literal('wake'),actionId:id,kind,id,revision:z.number().int().positive().max(2147483646)}).strict(),
]);
export type LeadSnoozeMutation=z.infer<typeof leadSnoozeMutationSchema>;
export const leadSnoozeResultSchema=z.object({action:z.enum(['snooze','wake']),snooze:leadSnoozeSchema,before:leadSnoozeSchema}).strict().refine(v=>v.snooze.revision===v.before.revision+1&&v.snooze.active===(v.action==='snooze'));

/** Columns accepted in a lead file (Spanish or English headers, accents and case ignored). */
export const leadImportColumns=['name','email','phone','service','projectType','channel','address','description'] as const;
export type LeadImportRow=Record<typeof leadImportColumns[number],string>;
export const leadImportTemplateHeaders={es:['nombre','correo','telefono','servicio','tipo_proyecto','canal','direccion','descripcion'],en:['name','email','phone','service','project_type','channel','address','description']} as const;
const headerAliases:Record<string,typeof leadImportColumns[number]>={nombre:'name',name:'name',cliente:'name','nombre completo':'name',correo:'email','correo electronico':'email',email:'email','e-mail':'email',telefono:'phone',phone:'phone',celular:'phone',servicio:'service',service:'service','tipo de proyecto':'projectType',tipo_proyecto:'projectType','tipo proyecto':'projectType','project type':'projectType',project_type:'projectType',canal:'channel',channel:'channel',origen:'channel',source:'channel',direccion:'address',address:'address',descripcion:'description',description:'description',notas:'description',notes:'description'};
export class LeadImportFileError extends Error{constructor(public code:'empty'|'format'|'too_many'|'unknown_column'|'duplicate_column'|'missing_column',public column=''){super(code);}}
const normalizeHeader=(v:string)=>v.normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
/** Parses CSV text into fixed row objects. Never evaluates formulas; at most 200 rows. */
export function parseLeadImportCsv(text:string):LeadImportRow[]{
 let table:string[][];
 try{table=parseCatalogCsv(text);}catch{throw new LeadImportFileError('format');}
 const header=table.shift();if(!header||table.length===0)throw new LeadImportFileError('empty');
 if(table.length>200)throw new LeadImportFileError('too_many');
 const map:(typeof leadImportColumns[number])[]=[];
 for(const raw of header){const key=headerAliases[normalizeHeader(raw)];if(!key)throw new LeadImportFileError('unknown_column',raw.trim().slice(0,40));if(map.includes(key))throw new LeadImportFileError('duplicate_column',raw.trim().slice(0,40));map.push(key);}
 if(!map.includes('name')||!map.includes('service')||(!map.includes('email')&&!map.includes('phone')))throw new LeadImportFileError('missing_column');
 return table.map(cells=>{if(cells.length>map.length&&cells.slice(map.length).some(v=>v.trim()))throw new LeadImportFileError('format');const row=Object.fromEntries(leadImportColumns.map(k=>[k,''])) as LeadImportRow;map.forEach((key,n)=>{row[key]=(cells[n]??'').replace(/^'(?=[=+@-])/,'').trim();});return row;});
}
const fileName=z.string().trim().min(1).max(160).refine(v=>!/[\u0000-\u001f\u007f]/.test(v));
const csv=z.string().min(1).max(400_000);
export const leadImportRequestSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('preview'),fileName,csv}).strict(),
 z.object({action:z.literal('import'),actionId:id,fileName,csv}).strict(),
 z.object({action:z.literal('undo_import'),actionId:id,importId:id,revision:z.number().int().positive().max(2147483646)}).strict(),
]);
export const leadImportErrorCodes=['name_required','name_too_long','service_required','service_too_long','contact_required','email_invalid','phone_invalid','project_type_too_long','address_too_long','description_too_long','invalid_characters','duplicate_in_file','channel_unknown','client_archived'] as const;
export type LeadImportErrorCode=typeof leadImportErrorCodes[number];
export const leadImportPreviewRowSchema=z.object({row:z.number().int().min(1).max(200),status:z.enum(['new','existing_client','duplicate','error']),errors:z.array(z.enum(leadImportErrorCodes)),name:z.string().max(160),service:z.string().max(160),client:z.object({id:z.string().min(1).max(160),name:z.string().max(160),archived:z.boolean()}).strict().nullable(),channel:z.object({id:z.string().min(1).max(64),revision:z.number().int().nonnegative()}).strict().nullable()}).strict().refine(v=>(v.status==='error')===(v.errors.length>0)&&(v.status!=='existing_client'&&v.status!=='duplicate'||v.client!==null)&&(v.status!=='new'||v.client===null));
const summary=z.object({total:count,new:count,existingClient:count,duplicate:count,error:count}).strict().refine(v=>v.total===v.new+v.existingClient+v.duplicate+v.error);
export const leadImportPreviewSchema=z.object({rows:z.array(leadImportPreviewRowSchema).min(1).max(200),summary}).strict().refine(v=>v.rows.length===v.summary.total&&v.rows.every((r,n)=>r.row===n+1));
export type LeadImportPreview=z.infer<typeof leadImportPreviewSchema>;
export const leadImportSchema=z.object({id,fileName:z.string().min(1).max(160),totalRows:z.number().int().min(1).max(200),createdLeads:count,createdClients:count,reusedClients:count,skippedDuplicates:count,revision:z.number().int().positive(),createdAt:stamp,undoneAt:stamp.nullable(),archivedOnUndo:count.nullable(),activeLeads:count}).strict().refine(v=>v.createdLeads+v.skippedDuplicates===v.totalRows&&v.reusedClients+v.createdClients===v.createdLeads&&(v.undoneAt===null)===(v.archivedOnUndo===null)&&v.activeLeads<=v.createdLeads);
export type LeadImport=z.infer<typeof leadImportSchema>;
export const leadImportResultSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('import'),import:leadImportSchema,summary}).strict(),
 z.object({action:z.literal('undo_import'),import:leadImportSchema,archived:count}).strict(),
]);
export const leadImportsPageSchema=z.object({items:z.array(leadImportSchema).max(20),nextCursor:id.nullable(),total:count}).strict().refine(v=>v.nextCursor===null||v.items.length===20&&v.nextCursor===v.items.at(-1)!.id);
export const leadInboxFunnelSchema=z.object({from:day,to:day,catalog:requestPipelineCatalogSchema,received:count,manual:count,request:count,open:count,snoozed:count,archived:count,converted:count,conversionRate:z.number().min(0).max(100).nullable(),stages:z.array(z.object({stageId:requestPipelineStageIdSchema,count}).strict()).min(6).max(18)}).strict().refine(v=>v.manual+v.request===v.received&&v.open+v.archived===v.received&&v.converted<=v.received&&v.snoozed<=v.open&&(v.received===0)===(v.conversionRate===null)&&v.stages.reduce((n,s)=>n+s.count,0)===v.open);
export type LeadInboxFunnel=z.infer<typeof leadInboxFunnelSchema>;
export const leadInboxReceiptSchema=z.object({receipt:z.object({kind:z.enum(['snooze','wake','import','undo_import']),input:z.record(z.string(),z.unknown()),result:z.record(z.string(),z.unknown())}).strict().nullable()}).strict();
