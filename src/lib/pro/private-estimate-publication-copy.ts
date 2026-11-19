import {z} from 'zod';
import {privateEstimateSchema} from './private-estimates';

const id=z.string().uuid();
const revision=z.number().int().positive().max(2147483647);
const hash=z.string().regex(/^[a-f0-9]{64}$/);

export const privateEstimatePublicationCopyInputSchema=z.object({
  action:z.literal('copy_from_publication'),
  actionId:id,
  publicationId:id,
  version:revision,
  estimateRevision:revision,
  contentHash:hash,
  targetEstimateId:id,
}).strict();

export const privateEstimatePublicationCopyPublicationSchema=z.object({
  publicationId:id,
  estimateId:id,
  version:revision,
  estimateRevision:revision,
  contentHash:hash,
}).strict();

export const privateEstimatePublicationCopyResultSchema=z.object({
  action:z.literal('copy_from_publication'),
  publication:privateEstimatePublicationCopyPublicationSchema,
  estimate:privateEstimateSchema,
}).strict().refine(value=>
  value.estimate.id!==value.publication.estimateId
  &&value.estimate.revision===1
  &&value.estimate.status==='draft',
);

export const privateEstimatePublicationCopyReceiptSchema=z.object({
  receipt:z.object({
    input:privateEstimatePublicationCopyInputSchema,
    result:privateEstimatePublicationCopyResultSchema,
  }).strict().refine(({input,result})=>
    input.publicationId===result.publication.publicationId
    &&input.version===result.publication.version
    &&input.estimateRevision===result.publication.estimateRevision
    &&input.contentHash===result.publication.contentHash
    &&input.targetEstimateId===result.estimate.id,
  ).nullable(),
}).strict();

export type PrivateEstimatePublicationCopyInput=z.infer<typeof privateEstimatePublicationCopyInputSchema>;
export type PrivateEstimatePublicationCopyResult=z.infer<typeof privateEstimatePublicationCopyResultSchema>;
export type PrivateEstimatePublicationCopyReceipt=z.infer<typeof privateEstimatePublicationCopyReceiptSchema>;
