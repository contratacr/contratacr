import {z} from 'zod';

/** Area A: default markup and taxable flag of a time activity. */
export const activityDefaultsSchema=z.object({revision:z.number().int().min(0),markupBps:z.number().int().min(0).max(100000),taxable:z.boolean()}).strict();
export const activityDefaultsMapSchema=z.object({items:z.record(z.string().uuid(),activityDefaultsSchema)}).strict();
export const activityDefaultsSaveSchema=z.object({activityId:z.string().uuid(),revision:z.number().int().min(0).max(999999999),markupBps:z.number().int().min(0).max(100000),taxable:z.boolean()}).strict();
export type ActivityDefaults=z.infer<typeof activityDefaultsSchema>;
/** "12,5" or "12.5" percent to basis points; null when invalid. */
export function percentToBps(text:string):number|null{
 const value=text.trim().replace(',','.');if(!value)return 0;if(!/^\d{1,4}(\.\d{1,2})?$/.test(value))return null;const bps=Math.round(Number(value)*100);return bps<=100000?bps:null;
}
export const bpsToPercent=(bps:number)=>bps?String(bps/100):'';

/** Area A: team permissions per activity. No restriction for an activity means the whole team can take it. */
export const activityMembersReadSchema=z.object({
 restrictions:z.record(z.string().uuid(),z.array(z.string().uuid()).max(100)),
 members:z.array(z.object({userId:z.string().uuid(),name:z.string().min(1).max(160)}).strict()).max(100)
}).strict();
export const activityMembersSaveSchema=z.object({activityId:z.string().uuid(),memberUserIds:z.array(z.string().uuid()).max(100)}).strict();
export type ActivityMembers=z.infer<typeof activityMembersReadSchema>;
