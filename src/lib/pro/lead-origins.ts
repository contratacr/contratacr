import {z} from 'zod';
import {leadCenterPageSchema} from './lead-center';
const id=z.string().uuid(),revision=z.number().int().nonnegative().max(2147483647),inputRevision=z.number().int().nonnegative().max(2147483646),stamp=z.string().datetime({offset:true}),kind=z.enum(['manual','request']);
export const leadOriginBuiltins=['direct','referral','website','social','advertising','other'] as const;
export const leadOriginChannelIdSchema=z.union([z.enum(leadOriginBuiltins),id]);
const clean=z.string().trim().min(1).max(80).refine(v=>!/[\u0000-\u001f\u007f]/.test(v)&&Array.from(v).every(c=>c.length===2||c.charCodeAt(0)<0xd800||c.charCodeAt(0)>0xdfff));
export const leadOriginChannelSchema=z.object({id:leadOriginChannelIdSchema,name:clean,customName:z.boolean(),builtin:z.boolean(),archived:z.boolean(),revision,createdAt:stamp.nullable(),updatedAt:stamp.nullable()}).strict().refine(v=>v.builtin===leadOriginBuiltins.some(k=>k===v.id)&&(!v.builtin||v.revision>0||!v.customName)&&(!v.builtin?v.customName:true)&&(v.revision===0?v.builtin&&!v.archived&&!v.customName&&v.createdAt===null&&v.updatedAt===null:v.createdAt!==null&&v.updatedAt!==null));
export const leadOriginSchema=z.object({kind,id,entryKind:z.enum(['manual','contratacr']),channel:leadOriginChannelSchema.nullable(),legacyLabel:z.string().max(80),revision,updatedAt:stamp.nullable(),canWrite:z.boolean()}).strict().refine(v=>v.entryKind===(v.kind==='manual'?'manual':'contratacr')&&(v.kind==='manual'||v.legacyLabel==='')&&(v.revision===0?v.channel===null&&v.updatedAt===null:v.updatedAt!==null));
export const leadOriginMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('channel_create'),actionId:id,channelId:id,revision:z.literal(0),name:clean}).strict(),
 z.object({action:z.literal('channel_rename'),actionId:id,channelId:leadOriginChannelIdSchema,revision:inputRevision,name:clean}).strict(),
 z.object({action:z.enum(['channel_archive','channel_restore']),actionId:id,channelId:leadOriginChannelIdSchema,revision:inputRevision}).strict(),
 z.object({action:z.literal('assign'),actionId:id,kind,id,revision:inputRevision,channelId:leadOriginChannelIdSchema,channelRevision:revision}).strict(),
 z.object({action:z.literal('clear'),actionId:id,kind,id,revision:inputRevision}).strict(),
]);
export const leadOriginResultSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('channel'),action:z.enum(['channel_create','channel_rename','channel_archive','channel_restore']),channel:leadOriginChannelSchema,before:leadOriginChannelSchema.nullable()}).strict().refine(v=>v.action==='channel_create'?v.before===null&&v.channel.revision===1:v.before!==null&&v.before.id===v.channel.id&&v.channel.revision===v.before.revision+1),
 z.object({type:z.literal('origin'),action:z.enum(['assign','clear']),origin:leadOriginSchema,before:leadOriginSchema}).strict().refine(v=>v.origin.kind===v.before.kind&&v.origin.id===v.before.id&&v.origin.revision===v.before.revision+1&&(v.action!=='clear'||v.origin.channel===null)),
]);
export const leadOriginChannelDetailSchema=z.object({channel:leadOriginChannelSchema}).strict();
export const leadOriginReceiptSchema=z.object({receipt:z.object({input:leadOriginMutationSchema,result:leadOriginResultSchema}).strict().refine(v=>v.input.action===v.result.action&&(v.result.type==='channel'?'channelId'in v.input&&v.input.channelId===v.result.channel.id:'kind'in v.input&&v.input.kind===v.result.origin.kind&&v.input.id===v.result.origin.id)).nullable()}).strict();
const token=z.string().regex(/^[a-f0-9]{32}$/),key=(v:{kind:string;id:string})=>v.kind+':'+v.id;
export const leadOriginChannelsPageSchema=z.object({items:z.array(leadOriginChannelSchema).max(20),nextCursor:leadOriginChannelIdSchema.nullable(),fingerprint:token}).strict().refine(v=>new Set(v.items.map(i=>i.id)).size===v.items.length&&(v.nextCursor===null||v.items.length===20&&v.nextCursor===v.items.at(-1)!.id));
export const leadOriginBatchSchema=z.object({items:z.array(leadOriginSchema).max(20)}).strict().refine(v=>new Set(v.items.map(key)).size===v.items.length);
export const leadOriginHistorySchema=z.object({actionId:id,action:z.enum(['assign','clear']),at:stamp,before:leadOriginSchema,after:leadOriginSchema}).strict().refine(v=>key(v.before)===key(v.after)&&v.after.revision===v.before.revision+1&&v.before.entryKind===v.after.entryKind&&v.before.legacyLabel===v.after.legacyLabel&&v.before.canWrite&&v.after.canWrite&&(v.action==='assign'?v.after.channel!==null:v.after.channel===null));
const historyFields={items:z.array(leadOriginHistorySchema).max(20),nextCursor:id.nullable()};
function validHistory(v:{items:z.infer<typeof leadOriginHistorySchema>[];nextCursor:string|null}){return new Set(v.items.map(i=>i.actionId)).size===v.items.length&&v.items.every((e,n)=>key(e.after)===key(v.items[0].after)&&(n===0||v.items[n-1].after.revision>e.after.revision))&&(v.nextCursor===null||v.items.length===20&&v.nextCursor===v.items.at(-1)!.actionId);}
export const leadOriginHistoryPageSchema=z.object(historyFields).strict().refine(validHistory);
export const leadOriginContextSchema=z.object({origin:leadOriginSchema,history:historyFields.items,nextCursor:historyFields.nextCursor}).strict().refine(v=>validHistory({items:v.history,nextCursor:v.nextCursor})&&v.history.every(e=>key(e.after)===key(v.origin))&&(v.origin.revision===0?v.history.length===0:!!v.history[0]&&v.history[0].after.revision===v.origin.revision&&v.history[0].after.updatedAt===v.origin.updatedAt&&v.history[0].after.channel?.id===v.origin.channel?.id));
export const leadOriginPageSchema=z.object({page:leadCenterPageSchema,context:z.array(leadOriginSchema).max(20)}).strict().refine(v=>v.page.items.length===v.context.length&&v.context.every((o,n)=>key(o)===key(v.page.items[n])));
const metric=z.object({channel:leadOriginChannelSchema.nullable(),manual:z.number().int().nonnegative(),request:z.number().int().nonnegative(),total:z.number().int().nonnegative(),won:z.number().int().nonnegative()}).strict().refine(v=>v.manual+v.request===v.total&&v.won<=v.total);
export const leadOriginMetricsSchema=z.object({items:z.array(metric).max(20),totals:z.object({manual:z.number().int().nonnegative(),request:z.number().int().nonnegative(),total:z.number().int().nonnegative(),won:z.number().int().nonnegative()}).strict(),nextCursor:z.union([z.literal('unspecified'),leadOriginChannelIdSchema]).nullable(),fingerprint:token}).strict().refine(v=>v.totals.manual+v.totals.request===v.totals.total&&v.totals.won<=v.totals.total&&(['manual','request','total','won']as const).every(k=>v.totals[k]>=v.items.reduce((sum,i)=>sum+i[k],0))&&new Set(v.items.map(i=>i.channel?.id??'unspecified')).size===v.items.length&&(v.nextCursor===null||v.items.length===20&&v.nextCursor===(v.items.at(-1)!.channel?.id??'unspecified')));
export type LeadOrigin=z.infer<typeof leadOriginSchema>;
export type LeadOriginChannel=z.infer<typeof leadOriginChannelSchema>;
export type LeadOriginMutation=z.infer<typeof leadOriginMutationSchema>;
export type LeadOriginResult=z.infer<typeof leadOriginResultSchema>;
