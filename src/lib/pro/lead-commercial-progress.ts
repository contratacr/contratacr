import {z} from 'zod';
import {leadCenterDetailSchema,leadCenterPageSchema,type LeadCenterItem} from './lead-center';
import {leadOriginSchema} from './lead-origins';
import {requestPipelineStageIdSchema} from './request-pipeline';

const id=z.string().uuid(),stage=requestPipelineStageIdSchema;
const conversion=z.object({actionId:id,workId:id,at:z.string().datetime({offset:true})}).strict();
export const leadCommercialProjectionSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('manual'),id,mode:z.enum(['automatic','manual']),automaticStageId:z.enum(['new','estimate_sent','won']),effectiveStageId:stage,conversion:conversion.nullable()}).strict().refine(v=>(v.automaticStageId==='won')===(v.conversion!==null)&&(v.mode!=='automatic'||v.effectiveStageId===v.automaticStageId)),
 z.object({kind:z.literal('request'),id,mode:z.enum(['automatic','manual']),automaticStageId:z.enum(['new','followed_up','connected','meeting_scheduled','estimate_sent','won']),effectiveStageId:stage,conversion:z.null()}).strict(),
]);
export type LeadCommercialProjection=z.infer<typeof leadCommercialProjectionSchema>;
const key=(v:{kind:string;id:string})=>v.kind+':'+v.id;
function matches(item:LeadCenterItem,progress:LeadCommercialProjection){
 if(key(item)!==key(progress))return false;
 if(item.kind==='request')return progress.kind==='request'&&progress.mode===item.request.state.mode&&progress.automaticStageId===item.request.automaticStageId&&progress.effectiveStageId===item.request.effectiveStageId;
 return progress.kind==='manual'&&progress.mode===item.manual.stageMode&&(progress.mode==='automatic'||progress.effectiveStageId===item.manual.stageId);
}
export const leadCommercialPageSchema=z.object({page:leadCenterPageSchema,context:z.array(leadOriginSchema).max(20),stages:z.array(leadCommercialProjectionSchema).max(20)}).strict().refine(v=>
 v.page.items.length===v.context.length&&v.page.items.length===v.stages.length&&v.page.items.every((item,n)=>key(item)===key(v.context[n])&&(item.kind!=='manual'||v.context[n].legacyLabel===item.manual.sourceLabel&&v.context[n].canWrite===(!item.manual.archived&&!item.client.archived))&&matches(item,v.stages[n])&&v.page.catalog.stages.some(stage=>stage.id===v.stages[n].effectiveStageId&&!stage.hidden))&&v.page.counts.every(count=>count.count>=v.stages.filter(stage=>stage.effectiveStageId===count.stageId).length)
);
export const leadCommercialDetailSchema=z.object({detail:leadCenterDetailSchema,stage:leadCommercialProjectionSchema}).strict().refine(v=>matches(v.detail.item,v.stage)&&v.detail.catalog.stages.some(stage=>stage.id===v.stage.effectiveStageId&&!stage.hidden));
