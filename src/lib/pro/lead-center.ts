import {z} from 'zod';
import {taskDueDate} from './work-tasks';
import {requestPipelineCatalogSchema,requestPipelineLeadSchema,requestPipelineStageIdSchema} from './request-pipeline';
const id=z.string().uuid(),revision=z.number().int().nonnegative().max(2147483647),inputRevision=z.number().int().nonnegative().max(2147483646),stamp=z.string().datetime({offset:true}),clientId=z.string().min(1).max(160).refine(v=>!v.includes('\u0000')&&Array.from(v).every(c=>c.length===2||c.charCodeAt(0)<0xd800||c.charCodeAt(0)>0xdfff)),stageId=requestPipelineStageIdSchema;
const clean=(limit:number)=>z.string().trim().max(limit).refine(v=>!v.includes('\u0000')&&Array.from(v).every(c=>c.length===2||c.charCodeAt(0)<0xd800||c.charCodeAt(0)>0xdfff));
export const leadCenterForecastSchema=z.object({projectType:clean(80),expectedStart:taskDueDate,currency:z.enum(['CRC','USD']),revenueCents:z.number().int().min(0).max(1e12).nullable(),budgetCents:z.number().int().min(0).max(1e12).nullable(),profitCents:z.number().int().min(-1e12).max(1e12).nullable()}).strict();
export const leadCenterClientSchema=z.object({id:clientId,name:z.string().max(160),archived:z.boolean()}).strict();
export const leadCenterManualSchema=z.object({id,clientId,title:clean(160).min(1),description:clean(2000),address:clean(500),sourceLabel:clean(80),forecast:leadCenterForecastSchema,stageMode:z.enum(['automatic','manual']),stageId:stageId.nullable(),revision:revision.refine(v=>v>0),archived:z.boolean(),createdAt:stamp,updatedAt:stamp}).strict().refine(v=>(v.stageMode==='manual')===(v.stageId!==null));
export const leadCenterRequestPreferenceSchema=z.object({revision,archived:z.boolean(),updatedAt:stamp.nullable()}).strict().refine(v=>v.revision===0?!v.archived&&v.updatedAt===null:v.updatedAt!==null);
export const leadCenterItemSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('manual'),id,manual:leadCenterManualSchema,client:leadCenterClientSchema}).strict().refine(v=>v.id===v.manual.id&&v.manual.clientId===v.client.id),
 z.object({kind:z.literal('request'),id,request:requestPipelineLeadSchema,preference:leadCenterRequestPreferenceSchema}).strict().refine(v=>v.id===v.request.requestId),
]);
const fields={clientId,title:clean(160).min(1),description:clean(2000),address:clean(500),sourceLabel:clean(80),forecast:leadCenterForecastSchema};
export const leadCenterMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),actionId:id,kind:z.literal('manual'),id,revision:z.literal(0),catalogRevision:inputRevision,...fields,stageMode:z.enum(['automatic','manual']),stageId:stageId.nullable()}).strict().refine(v=>(v.stageMode==='manual')===(v.stageId!==null)),
 z.object({action:z.literal('update'),actionId:id,kind:z.literal('manual'),id,revision:inputRevision.refine(v=>v>0),...fields}).strict(),
 z.object({action:z.literal('set_stage'),actionId:id,kind:z.literal('manual'),id,revision:inputRevision.refine(v=>v>0),catalogRevision:inputRevision,stageId}).strict(),
 z.object({action:z.literal('return_auto'),actionId:id,kind:z.literal('manual'),id,revision:inputRevision.refine(v=>v>0),catalogRevision:inputRevision}).strict(),
 z.object({action:z.enum(['archive','restore']),actionId:id,kind:z.enum(['manual','request']),id,revision:inputRevision}).strict().refine(v=>v.kind==='request'||v.revision>0),
]);
export const leadCenterResultSchema=z.object({action:z.enum(['create','update','set_stage','return_auto','archive','restore']),item:leadCenterItemSchema,before:leadCenterItemSchema.nullable(),catalogRevision:revision}).strict().superRefine((v,c)=>{const beforeRev=v.before?(v.before.kind==='manual'?v.before.manual.revision:v.before.preference.revision):0,afterRev=v.item.kind==='manual'?v.item.manual.revision:v.item.preference.revision;if(v.action==='create'?(v.before!==null||v.item.kind!=='manual'||afterRev!==1):(!v.before||v.before.id!==v.item.id||v.before.kind!==v.item.kind||afterRev!==beforeRev+1))c.addIssue({code:'custom',message:'Invalid lead revision.'});});
export const leadCenterReceiptSchema=z.object({receipt:z.object({input:leadCenterMutationSchema,result:leadCenterResultSchema}).strict().refine(v=>v.input.action===v.result.action&&v.input.kind===v.result.item.kind&&v.input.id===v.result.item.id).nullable()}).strict();
const itemKey=(item:z.infer<typeof leadCenterItemSchema>)=>item.kind+':'+item.id;
const itemRevision=(item:z.infer<typeof leadCenterItemSchema>)=>item.kind==='manual'?item.manual.revision:item.preference.revision;
const privateRecord=(item:z.infer<typeof leadCenterItemSchema>)=>item.kind==='manual'?item.manual:item.preference;
function visibleItem(catalog:z.infer<typeof requestPipelineCatalogSchema>,item:z.infer<typeof leadCenterItemSchema>){const selected=item.kind==='request'?item.request.effectiveStageId:item.manual.stageId??'new';return catalog.stages.some(stage=>stage.id===selected&&!stage.hidden);}
export const leadCenterHistorySchema=z.object({actionId:id,action:z.enum(['create','update','set_stage','return_auto','archive','restore','reassign_stage']),at:stamp,before:leadCenterItemSchema.nullable(),after:leadCenterItemSchema,beforeName:clean(50).nullable(),afterName:clean(50).nullable()}).strict().refine(v=>v.action==='create'?v.before===null&&v.after.kind==='manual'&&itemRevision(v.after)===1:v.before!==null&&itemKey(v.before)===itemKey(v.after)&&itemRevision(v.after)===itemRevision(v.before)+1&&(v.after.kind==='manual'||['archive','restore'].includes(v.action)));
type HistoryEntry=z.infer<typeof leadCenterHistorySchema>;
function validHistory(items:HistoryEntry[],nextCursor:string|null){return new Set(items.map(i=>i.actionId)).size===items.length&&items.every((event,index)=>itemKey(event.after)===itemKey(items[0].after)&&(index===0||itemRevision(items[index-1].after)>itemRevision(event.after)))&&(nextCursor===null||items.length===20&&nextCursor===items.at(-1)!.actionId);}
export const leadCenterHistoryPageSchema=z.object({items:z.array(leadCenterHistorySchema).max(20),nextCursor:id.nullable()}).strict().refine(v=>validHistory(v.items,v.nextCursor));
const cursor=z.string().regex(/^(manual|request):[a-f0-9-]{36}$/);
export const leadCenterPageSchema=z.object({catalog:requestPipelineCatalogSchema,items:z.array(leadCenterItemSchema).max(20),counts:z.array(z.object({stageId,count:z.number().int().nonnegative()}).strict()).min(6).max(18),nextCursor:cursor.nullable(),snapshotToken:z.string().regex(/^[a-f0-9]{32}$/)}).strict().refine(v=>new Set(v.items.map(itemKey)).size===v.items.length&&v.items.every(item=>visibleItem(v.catalog,item))&&JSON.stringify(v.counts.map(c=>c.stageId))===JSON.stringify(v.catalog.stages.map(s=>s.id))&&v.counts.reduce((n,c)=>n+c.count,0)>=v.items.length&&v.counts.every(c=>!v.catalog.stages.find(s=>s.id===c.stageId)!.hidden||c.count===0)&&(v.nextCursor===null||v.items.length===20&&v.nextCursor===itemKey(v.items.at(-1)!)));
export const leadCenterDetailSchema=z.object({catalog:requestPipelineCatalogSchema,item:leadCenterItemSchema,history:z.array(leadCenterHistorySchema).max(20),nextCursor:id.nullable()}).strict().refine(v=>visibleItem(v.catalog,v.item)&&validHistory(v.history,v.nextCursor)&&v.history.every(h=>itemKey(h.after)===itemKey(v.item))&&(itemRevision(v.item)===0?v.history.length===0:v.history.length>0&&JSON.stringify(privateRecord(v.history[0].after))===JSON.stringify(privateRecord(v.item))));
export type LeadCenterMutation=z.infer<typeof leadCenterMutationSchema>;
export type LeadCenterItem=z.infer<typeof leadCenterItemSchema>;
export type LeadCenterManual=z.infer<typeof leadCenterManualSchema>;
export type LeadCenterResult=z.infer<typeof leadCenterResultSchema>;
export type LeadCenterForecast=z.infer<typeof leadCenterForecastSchema>;
export type LeadCenterPage=z.infer<typeof leadCenterPageSchema>;
