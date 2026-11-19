import {z} from 'zod';
import {privateEstimateLineSchema,privateEstimateIssuerSchema,calculatePrivateEstimate} from './private-estimates';
const wellFormed=(v:string)=>{for(let i=0;i<v.length;i++){const n=v.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const next=v.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(n>=0xdc00&&n<=0xdfff)return false;}return true;};
const safeText=(max:number)=>z.string().max(max).refine(v=>wellFormed(v)&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v));
const civil=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>v>='1900-01-01'&&v<='2100-12-31'&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v);
const id=z.string().uuid(),revision=z.number().int().positive().max(2147483646),hash=z.string().regex(/^[a-f0-9]{64}$/),stamp=z.string().datetime({offset:true}),note=safeText(1000).transform(v=>v.trim()).refine(v=>v.length>0),code=z.string().max(80).transform(v=>normalizeEstimateAccessCode(v)).pipe(z.string().regex(/^(?:[a-f0-9]{64}|[0-9A-HJKMNP-TV-Z]{20})$/));
/**
 * Customer access code (round 2): 20 Crockford base32 symbols = 100 random bits, shown as
 * «XXXXX-XXXXX-XXXXX-XXXXX». It is only a second factor: the claim also needs the customer's
 * verified e-mail, it expires in 72 h, works once, is rate limited and only SHA-256 of the
 * normalized code is stored. Codes created before (64 hex) keep working.
 */
const CROCKFORD='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function normalizeEstimateAccessCode(value:string){const raw=value.trim();if(/^[a-fA-F0-9]{64}$/.test(raw))return raw.toLowerCase();return raw.toUpperCase().replace(/[\s-]/g,'').replace(/O/g,'0').replace(/[IL]/g,'1');}
export const isEstimateAccessCode=(value:string)=>/^(?:[a-f0-9]{64}|[0-9A-HJKMNP-TV-Z]{20})$/.test(normalizeEstimateAccessCode(value));
export function newEstimateAccessCode(){return [...crypto.getRandomValues(new Uint8Array(20))].map(n=>CROCKFORD[n&31]).join('');}
export const formatEstimateAccessCode=(value:string)=>/^[0-9A-HJKMNP-TV-Z]{20}$/.test(value)?value.match(/.{5}/g)!.join('-'):value;
const money=z.number().int().min(0).max(9000000000000);
export const privateEstimatePublicationContentSchema=z.object({title:safeText(160).min(1),currency:z.enum(['CRC','USD']),validUntil:civil.nullable(),notes:safeText(2000),issuer:privateEstimateIssuerSchema.omit({issuerActivity:true}).superRefine((v,c)=>{for(const[k,w]of Object.entries(v))if(!safeText(500).safeParse(w).success)c.addIssue({code:'custom',path:[k],message:'Invalid issuer text'});}),customer:z.object({name:safeText(160),tradeName:safeText(160).nullable(),identification:safeText(40).nullable(),address:safeText(500).nullable()}).strict(),lines:z.array(privateEstimateLineSchema.omit({catalogProductId:true,unitCostCents:true})).min(1).max(100),subtotalCents:money,discountCents:money,taxCents:money,totalCents:money}).strict().superRefine((v,c)=>{try{const totals=calculatePrivateEstimate(v.lines.map(line=>({...line,catalogProductId:null})));for(const key of ['subtotalCents','discountCents','taxCents','totalCents']as const)if(v[key]!==totals[key])c.addIssue({code:'custom',path:[key],message:'Incorrect published total'});if(new Set(v.lines.map(line=>line.id)).size!==v.lines.length)c.addIssue({code:'custom',message:'Duplicate published line'});}catch{c.addIssue({code:'custom',message:'Invalid published totals'});}});
export const privateEstimatePublicationStatusSchema=z.enum(['awaiting_claim','shared','changes_requested','accepted','declined','withdrawn','superseded']);
export const privateEstimatePublicationSchema=z.object({publicationId:id,estimateId:id.nullable(),version:z.number().int().positive(),estimateRevision:z.number().int().positive(),content:privateEstimatePublicationContentSchema,contentHash:hash,revision:z.number().int().positive().max(2147483647),status:privateEstimatePublicationStatusSchema,recipientBound:z.boolean(),createdAt:stamp}).strict();
export const privateEstimatePublicationRecipientSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('linked'),requestId:id,recipientId:id}).strict(),
 z.object({kind:z.literal('claim'),email:z.string().trim().toLowerCase().email().max(254),code}).strict(),
 z.object({kind:z.literal('existing'),recipientId:id}).strict(),
]);
export const privateEstimatePublicationMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('publish'),actionId:id,publicationId:id,estimateId:id,estimateRevision:revision,recipient:privateEstimatePublicationRecipientSchema}).strict(),
 z.object({action:z.literal('claim'),actionId:id,code}).strict(),
 z.object({action:z.literal('rotate_code'),actionId:id,publicationId:id,revision,contentHash:hash,code}).strict(),
 z.object({action:z.enum(['accept','decline','withdraw']),actionId:id,publicationId:id,revision,contentHash:hash}).strict(),
 z.object({action:z.enum(['request_changes','respond_changes']),actionId:id,publicationId:id,revision,contentHash:hash,note}).strict(),
]);
export const privateEstimatePublicationResultSchema=z.object({action:z.enum(['publish','claim','accept','decline','withdraw','request_changes','respond_changes','rotate_code']),publication:privateEstimatePublicationSchema}).strict();
export const privateEstimatePublicationReceiptSchema=z.object({receipt:z.object({inputHash:hash,result:privateEstimatePublicationResultSchema}).strict().nullable()}).strict();
export const privateEstimatePublicationDetailSchema=z.object({publication:privateEstimatePublicationSchema,side:z.enum(['owner','client']),canRespond:z.boolean(),canWithdraw:z.boolean(),canRespondChanges:z.boolean(),recipient:z.object({recipientId:id.nullable(),email:z.string().nullable()}).strict().nullable()}).strict();
export const privateEstimatePublicationSummarySchema=privateEstimatePublicationSchema.omit({content:true}).extend({title:z.string(),currency:z.enum(['CRC','USD']),totalCents:money});
export const privateEstimatePublicationPageSchema=z.object({items:z.array(privateEstimatePublicationSummarySchema).max(20),nextCursor:id.nullable()}).strict();
export const privateEstimatePublicationEventSchema=z.object({actionId:id,action:z.enum(['publish','claim','accept','decline','withdraw','request_changes','respond_changes','supersede','rotate_code']),revision:z.number().int().positive(),actorSide:z.enum(['owner','client']),note:safeText(1000),at:stamp}).strict();
export const privateEstimatePublicationHistorySchema=z.object({items:z.array(privateEstimatePublicationEventSchema).max(20),nextCursor:id.nullable()}).strict();
export const privateEstimatePublicationContextSchema=z.object({estimateId:id,estimateRevision:z.number().int().positive(),recipientId:id.nullable(),accepted:z.boolean(),canPublish:z.boolean()}).strict();
export function canonicalPrivateEstimatePublicationInput(value:unknown):string{const sorted=(v:unknown):unknown=>Array.isArray(v)?v.map(sorted):v!==null&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,w])=>[k,sorted(w)])):v;return JSON.stringify(sorted(value));}
export type PrivateEstimatePublication=z.infer<typeof privateEstimatePublicationSchema>;
export type PrivateEstimatePublicationMutation=z.infer<typeof privateEstimatePublicationMutationSchema>;
export type PrivateEstimatePublicationResult=z.infer<typeof privateEstimatePublicationResultSchema>;

export const privateEstimatePublicationBindingsSchema=z.object({items:z.array(z.object({requestId:id,recipientId:id,name:z.string().max(160)}).strict()).max(20),nextCursor:id.nullable()}).strict();

/** Round 7A: quotes shared with this customer for one job (customer project page). */
export const privateEstimateProjectQuotesSchema=z.object({items:z.array(z.object({publicationId:id,title:z.string().max(160),version:z.number().int().positive(),status:z.enum(['shared','changes_requested','accepted','declined']),totalCents:money,currency:z.enum(['CRC','USD']),sharedAt:stamp}).strict()).max(50)}).strict();
export type PrivateEstimateProjectQuote=z.infer<typeof privateEstimateProjectQuotesSchema>['items'][number];
