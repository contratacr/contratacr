import {z} from 'zod';
import {privateEstimateSchema,privateEstimateSourceSchema,privateEstimateClientSchema} from './private-estimates';

const id=z.string().uuid();
const revision=z.number().int().positive().max(2147483647);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const fingerprint=z.string().regex(/^[a-f0-9]{32}$/);
const textId=z.string().min(1).max(160);
export const privateEstimateDestinationCopySourceSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('draft'),estimateId:id,revision}).strict(),
  z.object({kind:z.literal('publication'),publicationId:id,version:revision,estimateRevision:revision,contentHash:hash}).strict(),
]);
export const privateEstimateDestinationCopySourceReferenceSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('draft'),estimateId:id,revision}).strict(),
  z.object({kind:z.literal('publication'),publicationId:id,estimateId:id,version:revision,estimateRevision:revision,contentHash:hash}).strict(),
]);
export const privateEstimateDestinationCopyDestinationSchema=z.object({
  clientId:textId,clientFingerprint:fingerprint,source:privateEstimateSourceSchema,
}).strict();
export const privateEstimateDestinationCopyInputSchema=z.object({
  action:z.literal('copy_to_destination'),actionId:id,targetEstimateId:id,
  source:privateEstimateDestinationCopySourceSchema,destination:privateEstimateDestinationCopyDestinationSchema,
}).strict().refine(value=>value.source.kind!=='draft'||value.source.estimateId!==value.targetEstimateId);
export const privateEstimateDestinationCopyResultSchema=z.object({
  action:z.literal('copy_to_destination'),source:privateEstimateDestinationCopySourceReferenceSchema,estimate:privateEstimateSchema,
}).strict().refine(value=>value.estimate.revision===1&&value.estimate.status==='draft'&&value.estimate.id!==value.source.estimateId);
export const privateEstimateDestinationCopyReceiptSchema=z.object({receipt:z.object({
  input:privateEstimateDestinationCopyInputSchema,result:privateEstimateDestinationCopyResultSchema,
}).strict().refine(({input,result})=>{
  if(input.targetEstimateId!==result.estimate.id||input.source.kind!==result.source.kind
    ||input.destination.clientId!==result.estimate.clientId||input.destination.clientFingerprint!==result.estimate.clientFingerprint
    ||JSON.stringify(input.destination.source)!==JSON.stringify(result.estimate.source))return false;
  if(input.source.kind==='draft'&&result.source.kind==='draft')return input.source.estimateId===result.source.estimateId&&input.source.revision===result.source.revision;
  return input.source.kind==='publication'&&result.source.kind==='publication'
    &&input.source.publicationId===result.source.publicationId&&input.source.version===result.source.version
    &&input.source.estimateRevision===result.source.estimateRevision&&input.source.contentHash===result.source.contentHash;
}).nullable()}).strict();
export const privateEstimateDestinationCopyContextSchema=z.object({
  client:privateEstimateClientSchema,clientFingerprint:fingerprint,source:privateEstimateSourceSchema,
}).strict();
export const privateEstimateDestinationCopyPreviewSchema=z.object({
  source:privateEstimateDestinationCopySourceReferenceSchema,estimate:privateEstimateSchema,
}).strict().refine(value=>value.source.estimateId===value.estimate.id
  &&(value.source.kind==='draft'?value.source.revision:value.source.estimateRevision)===value.estimate.revision);
export const privateEstimateDestinationCopyOptionsSchema=z.object({
  fingerprint,items:z.array(z.object({id:textId,name:z.string(),clientId:textId,clientName:z.string(),date:z.string().nullable().optional(),hasLinkedWork:z.boolean().optional()}).strict()).max(20),nextCursor:textId.nullable(),
}).strict().refine(value=>new Set(value.items.map(row=>row.id)).size===value.items.length
  &&(value.nextCursor===null||value.items.length===20&&value.items.at(-1)?.id===value.nextCursor));
export type PrivateEstimateDestinationCopyInput=z.infer<typeof privateEstimateDestinationCopyInputSchema>;
export type PrivateEstimateDestinationCopyResult=z.infer<typeof privateEstimateDestinationCopyResultSchema>;
export type PrivateEstimateDestinationCopyReceipt=z.infer<typeof privateEstimateDestinationCopyReceiptSchema>;
export type PrivateEstimateDestinationCopyContext=z.infer<typeof privateEstimateDestinationCopyContextSchema>;
export type PrivateEstimateDestinationCopyPreview=z.infer<typeof privateEstimateDestinationCopyPreviewSchema>;
export type PrivateEstimateDestinationCopySource=z.infer<typeof privateEstimateDestinationCopySourceSchema>;
export type PrivateEstimateDestinationCopyOptions=z.infer<typeof privateEstimateDestinationCopyOptionsSchema>;
