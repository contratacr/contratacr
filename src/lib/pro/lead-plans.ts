import {z} from 'zod';

/**
 * Rows 78 and 79: a task template and/or a schedule template attached to an OPPORTUNITY that is not a job yet. The plan
 * stays pending and is created inside the job when the opportunity is converted (SQL materializes it in the same
 * transaction). A template that no longer applies at that moment is reported as "skipped"; it never blocks the conversion.
 */
const id=z.string().uuid(),civil=z.string().regex(/^\d{4}-\d{2}-\d{2}$/),rev=z.number().int().min(1).max(2147483647);
export const leadPlanItemSchema=z.object({
 id,kind:z.enum(['tasks','schedule']),templateId:id,templateName:z.string().min(1).max(80),startDate:civil,calendar:z.boolean(),
 status:z.enum(['pending','applied','skipped','removed']),note:z.string().max(300),workId:z.string().nullable(),revision:rev,available:z.boolean(),
}).strict();
export type LeadPlanItem=z.infer<typeof leadPlanItemSchema>;
export const leadPlansSchema=z.object({leadId:id,archived:z.boolean(),converted:z.boolean(),items:z.array(leadPlanItemSchema).max(40)}).strict();
export type LeadPlans=z.infer<typeof leadPlansSchema>;
export const leadPlanInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('attach'),actionId:id,leadId:id,kind:z.enum(['tasks','schedule']),templateId:id,startDate:civil,calendar:z.boolean()}).strict(),
 z.object({action:z.literal('remove'),actionId:id,leadId:id,id,revision:rev}).strict(),
]);
export type LeadPlanInput=z.infer<typeof leadPlanInputSchema>;
