import {z} from 'zod';
const id=z.string().uuid(),revision=z.number().int().positive().max(2147483647),clientId=z.string().min(1).max(160);
export const manualLeadWorkInputSchema=z.object({action:z.literal('convert'),actionId:id,leadId:id,leadRevision:revision,workId:id}).strict();
export const manualLeadWorkResultSchema=z.object({action:z.literal('convert'),link:z.object({leadId:id,sourceLeadRevision:revision,sourceClientId:clientId,workId:id,createdAt:z.string().datetime({offset:true})}).strict(),work:z.object({id,client:z.string().min(1).max(160),service:z.string().min(1).max(160),stage:z.literal('new'),start:z.literal(''),end:z.literal(''),clientId,cancelled:z.literal(false)}).strict()}).strict().refine(v=>v.link.workId===v.work.id&&v.link.sourceClientId===v.work.clientId);
export const manualLeadWorkReceiptSchema=z.object({receipt:z.object({input:manualLeadWorkInputSchema,result:manualLeadWorkResultSchema}).strict().refine(v=>v.input.leadId===v.result.link.leadId&&v.input.leadRevision===v.result.link.sourceLeadRevision&&v.input.workId===v.result.link.workId).nullable()}).strict();
export const manualLeadWorkMappingSchema=z.object({mapping:manualLeadWorkResultSchema.nullable()}).strict();
export const manualLeadWorkContextSchema=z.object({source:z.object({leadId:id,leadRevision:revision,clientId}).strict(),client:z.object({id:clientId,name:z.string().min(1).max(160),archived:z.boolean()}).strict(),service:z.string().min(1).max(160),mapping:manualLeadWorkResultSchema.nullable()}).strict().refine(v=>v.source.clientId===v.client.id&&(!v.mapping||v.mapping.link.leadId===v.source.leadId));
export type ManualLeadWorkInput=z.infer<typeof manualLeadWorkInputSchema>;
export type ManualLeadWorkResult=z.infer<typeof manualLeadWorkResultSchema>;
