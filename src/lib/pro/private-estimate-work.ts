import {z} from 'zod';
import {privateEstimateSourceSchema} from './private-estimates';
const id=z.string().uuid(),textId=z.string().min(1).max(160),hash=z.string().regex(/^[a-f0-9]{64}$/),fingerprint=z.string().regex(/^[a-f0-9]{32}$/),revision=z.number().int().positive().max(2147483647),stamp=z.string().datetime({offset:true});
export const privateEstimateWorkSnapshotSchema=z.object({id:textId,client:z.string().max(160),service:z.string().min(1).max(160),stage:z.enum(['new','quoting','scheduled','completed']),start:z.string(),end:z.string(),clientId:textId,cancelled:z.boolean(),bookingClientId:z.string().nullable(),quoteId:z.string().nullable(),externalQuoteId:z.string().nullable()}).strict();
export const privateEstimateWorkInputSchema=z.object({action:z.literal('continue'),actionId:id,publicationId:id,contentHash:hash,publicationRevision:revision,target:z.discriminatedUnion('kind',[
 z.object({kind:z.literal('existing'),workId:textId,fingerprint}).strict(),
 z.object({kind:z.literal('new'),workId:id,conversionActionId:id.nullable(),leadRevision:revision.nullable()}).strict().refine(v=>(v.conversionActionId===null)===(v.leadRevision===null)),
])}).strict();
export const privateEstimateWorkAgreementSchema=z.object({publicationId:id,estimateId:id,version:revision,estimateRevision:revision,workId:textId,clientId:textId,title:z.string().min(1).max(160),currency:z.enum(['CRC','USD']),totalCents:z.number().int().min(0).max(9000000000000),contentHash:hash,acceptedActionId:id,acceptedActorId:id,acceptedAt:stamp,source:privateEstimateSourceSchema,createdAt:stamp}).strict();
export const privateEstimateWorkResultSchema=z.object({action:z.literal('continue'),agreement:privateEstimateWorkAgreementSchema,work:privateEstimateWorkSnapshotSchema}).strict().refine(v=>v.work.id===v.agreement.workId&&v.work.clientId===v.agreement.clientId);
export const privateEstimateWorkReceiptSchema=z.object({receipt:z.object({input:privateEstimateWorkInputSchema,result:privateEstimateWorkResultSchema}).strict().refine(v=>v.input.publicationId===v.result.agreement.publicationId&&v.input.contentHash===v.result.agreement.contentHash&&v.input.target.workId===v.result.work.id).nullable()}).strict();
export const privateEstimateWorkMappingSchema=z.object({agreement:privateEstimateWorkAgreementSchema.nullable(),work:privateEstimateWorkSnapshotSchema.nullable()}).strict().refine(v=>(v.agreement===null)===(v.work===null)&&(!v.agreement||v.agreement.workId===v.work?.id&&v.agreement.clientId===v.work?.clientId));
export const privateEstimateWorkContextSchema=z.object({publicationId:id,contentHash:hash,publicationRevision:revision,version:revision,currency:z.enum(['CRC','USD']),totalCents:z.number().int().min(0).max(9000000000000),accepted:z.object({actionId:id,actorId:id,at:stamp}).strict(),source:privateEstimateSourceSchema,client:z.object({id:textId,name:z.string().max(160),archived:z.boolean()}).strict(),mapping:privateEstimateWorkAgreementSchema.nullable(),requiredWork:z.object({work:privateEstimateWorkSnapshotSchema,fingerprint,reason:z.enum(['source_work','converted_manual'])}).strict().nullable(),manual:z.object({id,currentRevision:revision,canConvert:z.boolean()}).strict().nullable(),canCreate:z.boolean(),reason:z.enum(['client_archived','source_unavailable','source_customer_changed','source_archived','work_cancelled','work_customer_changed','legacy_finance','work_already_linked']).nullable()}).strict();
export const privateEstimateWorkCandidatesSchema=z.object({items:z.array(z.object({work:privateEstimateWorkSnapshotSchema,fingerprint}).strict()).max(20),nextCursor:textId.nullable()}).strict();
export type PrivateEstimateWorkInput=z.infer<typeof privateEstimateWorkInputSchema>;
export type PrivateEstimateWorkResult=z.infer<typeof privateEstimateWorkResultSchema>;
export type PrivateEstimateWorkAgreement=z.infer<typeof privateEstimateWorkAgreementSchema>;

export type PrivateEstimateWorkContext=z.infer<typeof privateEstimateWorkContextSchema>;
export type PrivateEstimateWorkMapping=z.infer<typeof privateEstimateWorkMappingSchema>;
export type PrivateEstimateWorkCandidates=z.infer<typeof privateEstimateWorkCandidatesSchema>;
export type PrivateEstimateWorkReceipt=z.infer<typeof privateEstimateWorkReceiptSchema>;
