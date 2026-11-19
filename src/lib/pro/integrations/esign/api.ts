import {z} from 'zod';

/** Round 6B: request schemas of /api/pro/esign (shared by the route and the UI). */
export const esignDocumentKinds=['contract','quote','work_change'] as const;
export const esignQuerySchema=z.object({kind:z.enum(esignDocumentKinds),id:z.string().uuid()}).strict();
export const esignMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),actionId:z.string().uuid(),documentKind:z.enum(esignDocumentKinds),documentId:z.string().uuid(),
  signerName:z.string().trim().min(2).max(160),signerEmail:z.string().trim().toLowerCase().email().max(254),language:z.enum(['es','en']),expiryDays:z.number().int().min(1).max(60).optional()}).strict(),
 z.object({action:z.literal('cancel'),actionId:z.string().uuid(),id:z.string().uuid(),revision:z.number().int().min(1)}).strict(),
 z.object({action:z.literal('retry'),id:z.string().uuid()}).strict(),
]);
export type EsignMutation=z.infer<typeof esignMutationSchema>;
