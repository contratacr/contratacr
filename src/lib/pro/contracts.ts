import {z} from 'zod';

/**
 * Contracts per job (parity register row 40). Account-level templates and a clause
 * library; per job contracts with merge fields, an immutable shared version (text
 * already resolved + SHA-256) and the linked customer's authenticated acceptance or
 * decline. This is NOT a certified electronic signature (row 41 stays out of scope).
 * Mirrors docs/pro/sql/contracts-local.sql.
 */
export const CONTRACT_BODY_MAX=16384;
export const CONTRACT_TITLE_MAX=160,CONTRACT_CLAUSE_MAX=4000,CONTRACT_CLAUSES_MAX=80,CONTRACT_REASON_MAX=300,CONTRACT_DECLINE_MAX=500;
export const CONTRACT_FIELD_KEYS=['cliente.nombre','cliente.identificacion','proyecto.nombre','proyecto.direccion','empresa.nombre','empresa.identificacion',
 'cotizacion.codigo','cotizacion.total','contrato.codigo','fecha.hoy','anticipo.porcentaje','anticipo.monto'] as const;
export type ContractFieldKey=typeof CONTRACT_FIELD_KEYS[number];
const fieldKey=z.enum(CONTRACT_FIELD_KEYS);

export function contractFieldLabels(en:boolean):Record<ContractFieldKey,string>{
 return en?{'cliente.nombre':'Customer name','cliente.identificacion':'Customer ID number','proyecto.nombre':'Project name','proyecto.direccion':'Project address',
  'empresa.nombre':'Company name','empresa.identificacion':'Company ID number','cotizacion.codigo':'Quote reference','cotizacion.total':'Quote total',
  'contrato.codigo':'Contract number','fecha.hoy':'Date shared','anticipo.porcentaje':'Deposit percentage','anticipo.monto':'Deposit amount'}
 :{'cliente.nombre':'Nombre del cliente','cliente.identificacion':'Identificación del cliente','proyecto.nombre':'Nombre del proyecto','proyecto.direccion':'Dirección del proyecto',
  'empresa.nombre':'Nombre de la empresa','empresa.identificacion':'Identificación de la empresa','cotizacion.codigo':'Referencia de la cotización','cotizacion.total':'Total de la cotización',
  'contrato.codigo':'Número de contrato','fecha.hoy':'Fecha en que se comparte','anticipo.porcentaje':'Porcentaje de anticipo','anticipo.monto':'Monto del anticipo'};
}
/** Where the owner fixes a field without data. */
export function contractFieldHelp(key:ContractFieldKey,en:boolean){
 if(key.startsWith('cliente.'))return en?'Complete it in the customer record.':'Complételo en la ficha del cliente.';
 if(key.startsWith('empresa.'))return en?'Complete it in your issuer details (Finance › Invoicing).':'Complételo en sus datos de emisor (Finanzas › Facturación).';
 if(key==='proyecto.direccion')return en?'Add the address to the customer or the appointment location.':'Agregue la dirección al cliente o al lugar de la cita.';
 if(key.startsWith('cotizacion.'))return en?'Link an accepted or draft quote of this project.':'Vincule una cotización aceptada o en borrador de este proyecto.';
 if(key.startsWith('anticipo.'))return en?'Set the deposit percentage (and link a quote for the amount).':'Indique el porcentaje de anticipo (y vincule una cotización para el monto).';
 return '';
}
const tokenPattern=/\{\{([^{}]*)\}\}/g;
/** Unknown {{tokens}} in a text (the database rejects them on save). */
export function unknownContractTokens(text:string){return [...text.matchAll(tokenPattern)].map(m=>m[1].trim()).filter(k=>!(CONTRACT_FIELD_KEYS as readonly string[]).includes(k));}
/** Split a resolved or raw text into plain parts and still-unresolved field tokens (for highlighting). */
export function contractTextParts(text:string):Array<{text:string;field?:string}>{
 const parts:Array<{text:string;field?:string}>=[];let last=0;
 for(const m of text.matchAll(tokenPattern)){if(m.index!>last)parts.push({text:text.slice(last,m.index)});parts.push({text:m[0],field:m[1].trim()});last=m.index!+m[0].length;}
 if(last<text.length)parts.push({text:text.slice(last)});return parts;
}

const id=z.string().uuid(),stamp=z.string().datetime({offset:true}),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/),hash=z.string().regex(/^[a-f0-9]{64}$/);
const title=z.string().trim().min(1).max(CONTRACT_TITLE_MAX),body=z.string().trim().min(1).max(CONTRACT_CLAUSE_MAX),revision=z.number().int().positive().max(2147483646);
const percent=z.number().gt(0).max(100).refine(v=>Math.abs(Math.round(v*100)-v*100)<1e-9,'Two decimals at most');
const language=z.enum(['es','en']);
export const contractStatuses=['draft','shared','accepted','declined','voided'] as const;
export type ContractStatus=typeof contractStatuses[number];

export const contractClauseSchema=z.object({id,title:z.string(),body:z.string(),sourceClauseId:id.nullable()}).strict();
export type ContractClause=z.infer<typeof contractClauseSchema>;
export const libraryClauseSchema=z.object({id,title:z.string(),body:z.string(),archived:z.boolean(),revision:z.number().int().positive(),createdAt:stamp,updatedAt:stamp}).strict();
export type LibraryClause=z.infer<typeof libraryClauseSchema>;
const templateShape={id,title:z.string(),description:z.string().nullable(),depositPercent:z.number().nullable(),clauseCount:z.number().int().min(0),archived:z.boolean(),revision:z.number().int().positive(),createdAt:stamp,updatedAt:stamp};
export const contractTemplateSummarySchema=z.object(templateShape).strict();
export const contractTemplateSchema=z.object({...templateShape,clauses:z.array(contractClauseSchema).max(CONTRACT_CLAUSES_MAX)}).strict();
export type ContractTemplateSummary=z.infer<typeof contractTemplateSummarySchema>;
export type ContractTemplate=z.infer<typeof contractTemplateSchema>;
export const contractResponseSchema=z.object({action:z.enum(['accept','decline']),typedName:z.string().nullable(),reason:z.string().nullable(),contentHash:hash,at:stamp,atCostaRica:z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)}).strict();
export type ContractResponse=z.infer<typeof contractResponseSchema>;
const contractShape={id,workId:z.string().min(1).max(160),number:z.number().int().positive(),code:z.string().regex(/^CTR-\d{4,6}$/),title:z.string(),language,
 templateId:id.nullable(),estimateId:id.nullable(),depositPercent:z.number().nullable(),status:z.enum(contractStatuses),latestVersion:z.number().int().positive().nullable(),
 clauseCount:z.number().int().min(0),voidReason:z.string().nullable(),voidedAt:stamp.nullable(),sharedAt:stamp.nullable(),response:contractResponseSchema.nullable(),
 revision:z.number().int().positive(),createdAt:stamp,updatedAt:stamp};
export const contractSummarySchema=z.object(contractShape).strict();
export const contractSchema=z.object({...contractShape,clauses:z.array(contractClauseSchema).max(CONTRACT_CLAUSES_MAX)}).strict();
export type ContractSummary=z.infer<typeof contractSummarySchema>;
export type Contract=z.infer<typeof contractSchema>;
const estimateShape={code:z.string(),title:z.string(),status:z.enum(['accepted','draft','shared','other']),currency:z.enum(['CRC','USD']),totalCents:z.number().int().min(0)};
export const contractEstimateSchema=z.object({id,...estimateShape}).strict();
export type ContractEstimate=z.infer<typeof contractEstimateSchema>;
export const contractVersionContentSchema=z.object({
 code:z.string(),title:z.string(),language,sharedOn:day,
 company:z.object({name:z.string().nullable(),identification:z.string().nullable()}).strict(),
 client:z.object({name:z.string().nullable(),identification:z.string().nullable()}).strict(),
 project:z.object({name:z.string().nullable(),address:z.string().nullable()}).strict(),
 estimate:z.object(estimateShape).strict().nullable(),depositPercent:z.number().nullable(),
 clauses:z.array(z.object({position:z.number().int().positive(),title:z.string(),body:z.string()}).strict()).min(1).max(CONTRACT_CLAUSES_MAX),
}).strict();
export type ContractVersionContent=z.infer<typeof contractVersionContentSchema>;
export const contractVersionSchema=z.object({id,version:z.number().int().positive(),recipientName:z.string(),contentHash:hash,sharedAt:stamp,content:contractVersionContentSchema,response:contractResponseSchema.nullable()}).strict();
export type ContractVersion=z.infer<typeof contractVersionSchema>;
export const contractPreviewSchema=z.object({title:z.string(),clauses:z.array(z.object({id,title:z.string(),body:z.string()}).strict()),
 fields:z.record(fieldKey,z.string().nullable()),usedFields:z.array(fieldKey),missingFields:z.array(fieldKey)}).strict();
export type ContractPreview=z.infer<typeof contractPreviewSchema>;
const historySchema=z.object({actionId:id,action:z.string(),at:stamp}).strict();

export const contractListSchema=z.object({workId:z.string(),projectName:z.string(),items:z.array(contractSummarySchema).max(200),estimates:z.array(contractEstimateSchema),
 templates:z.array(contractTemplateSummarySchema),clientVisible:z.boolean(),recipientName:z.string().nullable(),fields:z.array(fieldKey)}).strict();
export type ContractList=z.infer<typeof contractListSchema>;
export const contractDetailSchema=z.object({contract:contractSchema,estimate:contractEstimateSchema.nullable(),preview:contractPreviewSchema,versions:z.array(contractVersionSchema),
 history:z.array(historySchema.extend({byCustomer:z.boolean()}).strict())}).strict();
export type ContractDetail=z.infer<typeof contractDetailSchema>;
export const contractLibrarySchema=z.object({archived:z.boolean(),clauses:z.array(libraryClauseSchema),templates:z.array(contractTemplateSummarySchema),moreClauses:z.boolean(),moreTemplates:z.boolean(),
 counts:z.object({clauses:z.number().int(),archivedClauses:z.number().int(),templates:z.number().int(),archivedTemplates:z.number().int()}).strict(),fields:z.array(fieldKey)}).strict();
export type ContractLibrary=z.infer<typeof contractLibrarySchema>;
export const contractTemplateDetailSchema=z.object({template:contractTemplateSchema,history:z.array(historySchema)}).strict();
export const clientContractSchema=z.object({id,code:z.string(),status:z.enum(['shared','accepted','declined','voided']),canRespond:z.boolean(),voidReason:z.string().nullable(),
 version:z.number().int().positive(),contentHash:hash,sharedAt:stamp,content:contractVersionContentSchema,response:contractResponseSchema.nullable()}).strict();
export type ClientContract=z.infer<typeof clientContractSchema>;
export const clientContractsSchema=z.union([z.object({visible:z.literal(false)}).strict(),z.object({visible:z.literal(true),contracts:z.array(clientContractSchema)}).strict()]);
export type ClientContracts=z.infer<typeof clientContractsSchema>;

const base={actionId:id};
const listTarget={scope:z.enum(['template','contract']),id,revision,clauseId:id};
export const contractMutationSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('library_clause_create'),id,title,body}).strict(),
 z.object({...base,action:z.literal('library_clause_update'),id,revision,title,body}).strict(),
 z.object({...base,action:z.literal('library_clause_archive'),id,revision}).strict(),
 z.object({...base,action:z.literal('library_clause_restore'),id,revision}).strict(),
 z.object({...base,action:z.literal('template_create'),id,title,description:z.string().trim().max(500).nullable(),depositPercent:percent.nullable(),libraryClauseIds:z.array(id).max(CONTRACT_CLAUSES_MAX)}).strict(),
 z.object({...base,action:z.literal('template_update'),id,revision,title,description:z.string().trim().max(500).nullable(),depositPercent:percent.nullable()}).strict(),
 z.object({...base,action:z.literal('template_archive'),id,revision}).strict(),
 z.object({...base,action:z.literal('template_restore'),id,revision}).strict(),
 z.object({...base,action:z.literal('clause_put'),...listTarget,position:z.number().int().min(1).max(CONTRACT_CLAUSES_MAX+1),title,body}).strict(),
 z.object({...base,action:z.literal('clause_remove'),...listTarget}).strict(),
 z.object({...base,action:z.literal('clause_move'),...listTarget,position:z.number().int().min(1).max(CONTRACT_CLAUSES_MAX)}).strict(),
 z.object({...base,action:z.literal('clause_insert_library'),...listTarget,libraryClauseId:id,position:z.number().int().min(1).max(CONTRACT_CLAUSES_MAX+1)}).strict(),
 z.object({...base,action:z.literal('contract_create'),workId:z.string().trim().min(1).max(160),id,templateId:id.nullable(),title:title.nullable(),language,estimateId:id.nullable(),depositPercent:percent.nullable()}).strict(),
 z.object({...base,action:z.literal('contract_update'),id,revision,title,language,estimateId:id.nullable(),depositPercent:percent.nullable()}).strict(),
 z.object({...base,action:z.literal('share'),id,revision}).strict(),
 z.object({...base,action:z.literal('withdraw'),id,revision}).strict(),
 z.object({...base,action:z.literal('void'),id,revision,reason:z.string().trim().min(1).max(CONTRACT_REASON_MAX)}).strict(),
]);
/** Round 7A: ContrataCR starter templates (installed once as an account template, then used). */
export const contractStarterKeys=['renovation','service','maintenance'] as const;
export const contractStarterSchema=z.object({...base,action:z.literal('starter_create'),workId:z.string().trim().min(1).max(160),id,starter:z.enum(contractStarterKeys),language,estimateId:id.nullable()}).strict();
export type ContractStarterMutation=z.infer<typeof contractStarterSchema>;
export type ContractMutation=z.infer<typeof contractMutationSchema>|ContractStarterMutation;
const clientBase={actionId:id,requestId:id,contractId:id,version:z.number().int().positive().max(999999),contentHash:hash};
export const contractClientMutationSchema=z.discriminatedUnion('action',[
 z.object({...clientBase,action:z.literal('accept'),typedName:z.string().trim().min(2).max(160)}).strict(),
 z.object({...clientBase,action:z.literal('decline'),reason:z.string().trim().min(1).max(CONTRACT_DECLINE_MAX)}).strict(),
]);
export type ContractClientMutation=z.infer<typeof contractClientMutationSchema>;
export const isContractClientAction=(value:unknown)=>!!value&&typeof value==='object'&&['accept','decline'].includes(String((value as {action?:unknown}).action));

export const contractResultSchema=z.object({contract:contractSchema,version:contractVersionSchema.optional()}).strict();
export const libraryClauseResultSchema=z.object({clause:libraryClauseSchema}).strict();
export const contractTemplateResultSchema=z.object({template:contractTemplateSchema}).strict();
export const clientContractResultSchema=z.object({contract:clientContractSchema}).strict();

/** UTF-8 byte length (the API rejects bodies over 16 KiB). */
export const contractBytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length;
/** Spanish: «₡1.234.567,50» (unchanged); English: «₡1,234,567.50». */
export function contractMoney(cents:number,currency:'CRC'|'USD',en=false){
 const whole=Math.floor(Math.abs(cents)/100).toString().replace(/\B(?=(\d{3})+(?!\d))/g,en?',':'.'),rest=Math.abs(cents)%100;
 return (cents<0?'−':'')+(currency==='USD'?'US$':'₡')+whole+(rest?(en?'.':',')+String(rest).padStart(2,'0'):'');
}
/** Spanish «12,5 %» (space before the sign), English «12.5%». */
export const contractPercent=(value:number,en:boolean)=>new Intl.NumberFormat(en?'en-US':'es-CR',{maximumFractionDigits:2}).format(value)+(en?'%':' %');
/** Recompute the SHA-256 of a shared version (content::text in PostgreSQL is not reproducible in JS; the server value is shown as is). */
export const shortHash=(value:string)=>value.slice(0,12);
