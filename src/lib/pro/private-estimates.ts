import {z} from 'zod';
import {invoiceIssuerSchema} from './invoice-preparation';
const id=z.string().uuid(),rev=z.number().int().min(0).max(2147483646),stamp=z.string().datetime({offset:true});
const wellFormed=(v:string)=>{for(let i=0;i<v.length;i++){const n=v.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const next=v.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(n>=0xdc00&&n<=0xdfff)return false;}return true;};
const text=(max:number)=>z.string().trim().max(max).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v)&&wellFormed(v));
export const privateEstimateIssuerSchema=invoiceIssuerSchema.extend({issuerName:text(160).min(1)}).strict();
export const privateEstimateSourceSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('manual'),id,revision:z.number().int().positive().max(2147483647)}).strict(),
 z.object({kind:z.literal('work'),id:z.string().min(1).max(160),fingerprint:z.string().regex(/^[a-f0-9]{32}$/)}).strict(),
]).nullable();
export const privateEstimateLineSchema=z.object({id,description:text(2000).min(1),unit:text(30),qtyMilli:z.number().int().min(1).max(100000000),unitPriceCents:z.number().int().min(0).max(10000000000),discountBps:z.number().int().min(0).max(10000),taxBps:z.number().int().min(0).max(10000),catalogProductId:z.string().min(1).max(160).nullable(),
 /** Round 4A, owner only: internal unit cost (never in publications, client reads, exports or print). */
 unitCostCents:z.number().int().min(0).max(10000000000).optional(),
 /** Round 4A: optional section name; consecutive lines with the same name form a group with a subtotal. */
 group:text(80).min(1).optional()}).strict();
/** Fields a customer may ever see: everything except the internal cost (and the catalog link). */
export type PrivateEstimateCustomerLine=Omit<z.infer<typeof privateEstimateLineSchema>,'unitCostCents'|'catalogProductId'>;
/** Internal cost and margin of one line (owner only). Margin is over the net amount (after discount, before tax). */
export function privateEstimateLineMargin(line:{qtyMilli:number;unitCostCents?:number},netCents:number){if(line.unitCostCents===undefined)return null;const cost=Number((BigInt(line.qtyMilli)*BigInt(line.unitCostCents)+BigInt(500))/BigInt(1000));return {costCents:cost,marginCents:netCents-cost,marginBps:netCents>0?Math.round((netCents-cost)*10000/netCents):null};}
/** Consecutive lines with the same section name, with the subtotal (total with tax) of each section. */
export function privateEstimateGroups<L extends {group?:string}>(lines:L[],rows:{totalCents:number}[]){const groups:{name:string|null;start:number;end:number;totalCents:number}[]=[];lines.forEach((line,index)=>{const name=line.group??null,last=groups.at(-1);if(last&&last.name===name){last.end=index;last.totalCents+=rows[index]?.totalCents??0;}else groups.push({name,start:index,end:index,totalCents:rows[index]?.totalCents??0});});return groups;}
export function calculatePrivateEstimate(lines:z.infer<typeof privateEstimateLineSchema>[]){let subtotal=BigInt(0),discount=BigInt(0),tax=BigInt(0),total=BigInt(0);const round=(n:bigint,d:bigint)=>(n+d/BigInt(2))/d;const rows=lines.map(l=>{const base=round(BigInt(l.qtyMilli)*BigInt(l.unitPriceCents),BigInt(1000)),off=round(base*BigInt(l.discountBps),BigInt(10000)),net=base-off,t=round(net*BigInt(l.taxBps),BigInt(10000));subtotal+=base;discount+=off;tax+=t;total+=net+t;return{baseCents:Number(base),discountCents:Number(off),netCents:Number(net),taxCents:Number(t),totalCents:Number(net+t)};});if([subtotal,discount,tax,total].some(n=>n>BigInt(9000000000000)))throw new Error('Estimate total exceeds supported range');return{subtotalCents:Number(subtotal),discountCents:Number(discount),taxCents:Number(tax),totalCents:Number(total),rows};}
const lines=z.array(privateEstimateLineSchema).min(1).max(100).superRefine((v,c)=>{if(new Set(v.map(l=>l.id)).size!==v.length)c.addIssue({code:'custom',message:'Duplicate line identity'});try{calculatePrivateEstimate(v);}catch{c.addIssue({code:'custom',message:'Estimate total exceeds supported range'});}});
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>v>='1900-01-01'&&v<='2100-12-31'&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v);
const base={actionId:id,estimateId:id,revision:rev};
export const privateEstimateMutationSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('save'),clientId:z.string().min(1).max(160),refreshClient:z.boolean(),clientFingerprint:z.string().regex(/^[a-f0-9]{32}$/),source:privateEstimateSourceSchema,issuer:privateEstimateIssuerSchema,title:text(160).min(1),notes:text(2000),currency:z.enum(['CRC','USD']),validUntil:day.nullable(),lines}).strict(),
 z.object({...base,action:z.literal('duplicate'),targetEstimateId:id}).strict(),
 z.object({...base,action:z.enum(['archive','restore'])}).strict(),
]);
export const privateEstimateClientSchema=z.object({id:z.string().min(1).max(160),name:z.string().max(160),email:z.string().max(254),phone:z.string().max(40),identification:z.string().nullable(),address:z.string().nullable(),tradeName:z.string().nullable()}).strict();
const money=z.number().int().min(0).max(9000000000000);
export const privateEstimateSchema=z.object({kind:z.literal('private_estimate'),id,ownerId:id,revision:z.number().int().positive().max(2147483647),status:z.enum(['draft','archived']),clientId:z.string().min(1).max(160),client:privateEstimateClientSchema,clientFingerprint:z.string().regex(/^[a-f0-9]{32}$/),source:privateEstimateSourceSchema,issuer:privateEstimateIssuerSchema,title:text(160).min(1),notes:text(2000),currency:z.enum(['CRC','USD']),validUntil:day.nullable(),lines,subtotalCents:money,discountCents:money,taxCents:money,totalCents:money,createdAt:stamp,updatedAt:stamp}).strict().superRefine((v,c)=>{if(v.client.id!==v.clientId)c.addIssue({code:'custom',message:'Client identity mismatch'});try{const t=calculatePrivateEstimate(v.lines);for(const k of ['subtotalCents','discountCents','taxCents','totalCents'] as const)if(t[k]!==v[k])c.addIssue({code:'custom',path:[k],message:'Incorrect server total'});}catch{c.addIssue({code:'custom',message:'Invalid total'});}});
export const privateEstimateResultSchema=z.object({action:z.enum(['save','duplicate','archive','restore']),estimate:privateEstimateSchema}).strict();
export const privateEstimateReceiptSchema=z.object({receipt:z.object({input:privateEstimateMutationSchema,result:privateEstimateResultSchema}).strict().refine(v=>v.input.action===v.result.action&&v.result.estimate.id===(v.input.action==='duplicate'?v.input.targetEstimateId:v.input.estimateId)&&v.result.estimate.revision===(v.input.action==='duplicate'?1:v.input.revision+1)&&v.result.estimate.status===(v.input.action==='archive'?'archived':'draft')).nullable()}).strict();
export const privateEstimateHistorySchema=z.object({actionId:id,action:z.enum(['save','duplicate','archive','restore']),at:stamp,before:privateEstimateSchema.nullable(),after:privateEstimateSchema}).strict();
export const privateEstimateDetailSchema=z.object({estimate:privateEstimateSchema,history:z.array(privateEstimateHistorySchema).max(20),nextCursor:id.nullable()}).strict();
export const privateEstimateSummarySchema=z.object({id,ownerId:id,revision:z.number().int().positive().max(2147483647),status:z.enum(['draft','archived']),clientId:z.string().min(1).max(160),clientName:z.string().max(160),source:privateEstimateSourceSchema,title:text(160).min(1),currency:z.enum(['CRC','USD']),validUntil:day.nullable(),subtotalCents:money,discountCents:money,taxCents:money,totalCents:money,createdAt:stamp,updatedAt:stamp}).strict();
export type PrivateEstimateSummary=z.infer<typeof privateEstimateSummarySchema>;
export const privateEstimatePageSchema=z.object({items:z.array(privateEstimateSummarySchema).max(20),nextCursor:id.nullable()}).strict().refine(v=>new Set(v.items.map(i=>i.id)).size===v.items.length&&(v.nextCursor===null||v.items.length===20&&v.items.at(-1)?.id===v.nextCursor));
export const privateEstimateContextSchema=z.object({client:privateEstimateClientSchema,clientFingerprint:z.string().regex(/^[a-f0-9]{32}$/),source:privateEstimateSourceSchema,issuer:invoiceIssuerSchema.strict(),issuerRevision:z.number().int().min(0),title:z.string(),currency:z.literal('CRC')}).strict();
export type PrivateEstimate=z.infer<typeof privateEstimateSchema>;
export type PrivateEstimateMutation=z.infer<typeof privateEstimateMutationSchema>;
export type PrivateEstimateResult=z.infer<typeof privateEstimateResultSchema>;

export const privateEstimateSalesPublicationSchema=z.object({publicationId:id,version:z.number().int().positive().max(2147483647),estimateRevision:z.number().int().positive().max(2147483647),revision:z.number().int().positive().max(2147483647),status:z.enum(['awaiting_claim','shared','changes_requested','accepted','declined','withdrawn','superseded']),contentHash:z.string().regex(/^[a-f0-9]{64}$/),createdAt:stamp}).strict();
export const privateEstimateSalesDraftSchema=z.object({revision:z.number().int().positive().max(2147483647),status:z.enum(['draft','archived'])}).strict();
export const privateEstimateSalesRowSchema=z.object({kind:z.enum(['private_estimate','standard','legacy']),id:z.string().min(1),key:z.string().min(1),title:z.string(),client:z.string(),clientId:z.string().nullable(),status:z.enum(['draft','sent','accepted','declined','withdrawn','archived']),currency:z.enum(['CRC','USD']),totalCents:z.number().finite().nonnegative(),at:z.string(),publication:privateEstimateSalesPublicationSchema.nullable().optional(),draft:privateEstimateSalesDraftSchema.optional()}).strict().refine(v=>{
 if(v.key!==v.kind+':'+v.id||v.kind==='private_estimate'&&!money.safeParse(v.totalCents).success)return false;
 if(v.kind!=='private_estimate')return v.publication===undefined&&v.draft===undefined;
 if(v.publication===undefined&&v.draft===undefined)return true; // Existing compact rows remain readable.
 if(v.publication===undefined||v.draft===undefined||v.publication!==null&&v.publication.estimateRevision>v.draft.revision)return false;
 const commercial=v.draft.status==='archived'?'archived':v.publication===null?'draft':['awaiting_claim','shared','changes_requested'].includes(v.publication.status)?'sent':['withdrawn','superseded'].includes(v.publication.status)?'withdrawn':v.publication.status;
 return v.status===commercial;
});
export const privateEstimateSalesPageSchema=z.object({items:z.array(privateEstimateSalesRowSchema).max(20),nextCursor:z.object({at:z.string(),key:z.string()}).strict().nullable()}).strict().refine(v=>new Set(v.items.map(i=>i.key)).size===v.items.length&&(v.nextCursor===null||v.items.length===20&&v.items.at(-1)?.key===v.nextCursor.key&&v.items.at(-1)?.at===v.nextCursor.at));
export const privateEstimateSalesQuerySchema=z.object({status:z.enum(['all','draft','sent','accepted','declined','withdrawn','archived']).default('all'),q:z.string().max(100).default(''),clientId:z.string().max(160).optional(),after:z.object({at:z.string(),key:z.string()}).strict().optional()}).strict();

export type PrivateEstimateSalesPublication=z.infer<typeof privateEstimateSalesPublicationSchema>;
