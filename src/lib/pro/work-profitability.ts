import {z} from 'zod';

/** Row 23: estimated vs real profitability per job (CRC céntimos). Read model plus the owner's minimum-margin target. */
const cents=z.number().int(),nullable=cents.nullable();
export const profitAlertSchema=z.object({code:z.enum(['loss','low_margin','no_agreed','cost_over_estimate','over_lines','incomplete']),severity:z.enum(['high','medium','info']),count:z.number().int().optional()}).strict();
export const workProfitabilitySchema=z.object({
 workId:z.string().min(1).max(160),currency:z.literal('CRC'),basis:z.enum(['without_tax','as_agreed','none']),agreedCents:nullable,
 approvedChangesCents:cents,approvedChangesCount:z.number().int(),proposedChangesCents:cents,proposedChangesCount:z.number().int(),
 estimatedCostCents:cents,estimatedMarginCents:nullable,actualCostCents:cents,committedCents:cents,pendingAllowancesCents:cents,budgetEacCents:cents,
 projectedCostCents:cents,currentMarginCents:nullable,projectedMarginCents:nullable,projectedMarginBp:nullable,consumedBp:nullable,
 minMarginBp:z.number().int().min(0).max(10000),settingsRevision:z.number().int().min(0),alerts:z.array(profitAlertSchema).max(10),
}).strict();
export type WorkProfitability=z.infer<typeof workProfitabilitySchema>;
export const profitTargetMutationSchema=z.object({
 action:z.literal('set_target'),actionId:z.string().uuid(),workId:z.string().trim().min(1).max(160),revision:z.number().int().min(0).max(2147483646),minMarginBp:z.number().int().min(0).max(10000),
}).strict();
export type ProfitTargetMutation=z.infer<typeof profitTargetMutationSchema>;
export const profitTargetResultSchema=z.object({workId:z.string(),minMarginBp:z.number().int(),settingsRevision:z.number().int().positive()}).strict();
/** «12,5» / «12.5» percent text → basis points (0–10000), or null when invalid. */
export function percentToBp(value:string){const clean=value.trim().replace('%','').replace(',','.');if(!/^\d{1,3}(\.\d{1,2})?$/.test(clean))return null;const bp=Math.round(Number(clean)*100);return bp>=0&&bp<=10000?bp:null;}
