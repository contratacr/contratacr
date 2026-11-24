import {z} from 'zod';

/**
 * Leads area: private notes, call log entries and tags of a lead (manual opportunity or ContrataCR request).
 * SQL is the authority (pro_lead_log_*). Nothing is sent to the customer.
 */
const id=z.string().uuid(),rev=z.number().int().min(1).max(2147483647),kind=z.enum(['manual','request']);
export const leadCallOutcomes=['good_discussion','no_answer','call_later','not_interested'] as const;
export const leadLogEntrySchema=z.object({
 id,entry:z.enum(['note','call']),outcome:z.enum(leadCallOutcomes).nullable(),body:z.string().max(2000),revision:rev,
 createdAt:z.string().min(10),updatedAt:z.string().min(10),
}).strict().refine(v=>(v.entry==='call')===(v.outcome!==null));
export type LeadLogEntry=z.infer<typeof leadLogEntrySchema>;
export const leadLogSchema=z.object({kind,leadId:id,items:z.array(leadLogEntrySchema).max(200),tags:z.array(z.string().min(1).max(40)).max(20)}).strict();
export type LeadLog=z.infer<typeof leadLogSchema>;
const body=z.string().max(2000).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
export const leadLogInputSchema=z.union([
 z.object({action:z.literal('add'),actionId:id,id,kind,leadId:id,entry:z.literal('note'),outcome:z.null(),body:body.refine(v=>v.trim().length>0)}).strict(),
 z.object({action:z.literal('add'),actionId:id,id,kind,leadId:id,entry:z.literal('call'),outcome:z.enum(leadCallOutcomes),body}).strict(),
 z.object({action:z.literal('edit'),actionId:id,id,kind,leadId:id,revision:rev,body}).strict(),
 z.object({action:z.literal('remove'),actionId:id,id,kind,leadId:id,revision:rev}).strict(),
 z.object({action:z.enum(['tag_add','tag_remove']),kind,leadId:id,tag:z.string().trim().min(1).max(40).refine(v=>!/[\u0000-\u001f\u007f]/.test(v))}).strict(),
]);
export type LeadLogInput=z.infer<typeof leadLogInputSchema>;
export const leadLogQuerySchema=z.object({kind,leadId:id}).strict();
