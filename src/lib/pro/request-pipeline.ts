import {z} from 'zod';
import {requestFollowupSchema} from './request-followups';
const id=z.string().uuid(),inputRevision=z.number().int().nonnegative().max(2147483646),revision=z.number().int().nonnegative().max(2147483647),stamp=z.string().datetime({offset:true});
export const requestPipelineBuiltins=['new','followed_up','connected','meeting_scheduled','estimate_sent','won'] as const;
export const requestPipelineStageIdSchema=z.union([z.enum(requestPipelineBuiltins),id]);
const stageId=requestPipelineStageIdSchema,name=z.string().trim().min(1).max(50).refine(v=>Array.from(v).length<=25&&!/[\u0000-\u001f\u007f]/u.test(v)&&Array.from(v).every(c=>c.length===2||c.charCodeAt(0)<0xd800||c.charCodeAt(0)>0xdfff));
export const requestPipelineStageSchema=z.object({id:stageId,builtin:z.boolean(),name:name.nullable(),position:z.number().int().min(0).max(17),hidden:z.boolean(),reassignToId:stageId.nullable()}).strict().refine(v=>v.builtin===requestPipelineBuiltins.includes(v.id as typeof requestPipelineBuiltins[number])&&(v.builtin?v.name===null:v.name!==null)&&v.hidden===(v.reassignToId!==null)&&v.reassignToId!==v.id&&(!['new','won'].includes(v.id)||!v.hidden));
export const requestPipelineCatalogSchema=z.object({revision,stages:z.array(requestPipelineStageSchema).min(6).max(18)}).strict().superRefine((v,c)=>{const sorted=[...v.stages].sort((a,b)=>a.position-b.position),ids=v.stages.map(s=>s.id);if(new Set(ids).size!==ids.length||v.stages.some((s,i)=>s.position!==i)||JSON.stringify(sorted.filter(s=>s.builtin).map(s=>s.id))!==JSON.stringify(requestPipelineBuiltins)||v.stages.some(s=>s.hidden&&!v.stages.some(t=>t.id===s.reassignToId&&!t.hidden))||v.revision===0&&(v.stages.length!==6||v.stages.some(s=>s.hidden)))c.addIssue({code:'custom',message:'Invalid lead-stage catalogue.'});});
export const requestPipelineStateSchema=z.object({requestId:id,mode:z.enum(['automatic','manual']),stageId:stageId.nullable(),revision,updatedAt:stamp.nullable()}).strict().refine(v=>(v.mode==='manual')===(v.stageId!==null)&&(v.revision===0?v.mode==='automatic'&&v.updatedAt===null:v.updatedAt!==null));
export const requestPipelineEvidenceSchema=z.object({kind:z.enum(['new','provider_response','client_response','meeting','shared_quote','accepted_quote']),sourceId:z.string().min(1).max(160),at:stamp}).strict();
export const requestPipelineLeadSchema=z.object({requestId:id,position:z.number().int().positive(),service:z.string().min(1).max(160),clientName:z.string().min(1).max(160),publicStatus:z.enum(['requested','proposed','confirmed','declined','cancelled','completed']),requestRevision:revision,createdAt:stamp,updatedAt:stamp,start:stamp.nullable(),workId:z.string().min(1).max(160).nullable(),workCancelled:z.boolean(),state:requestPipelineStateSchema,effectiveStageId:stageId,automaticStageId:z.enum(requestPipelineBuiltins),evidence:requestPipelineEvidenceSchema,followup:requestFollowupSchema}).strict().refine(v=>v.state.requestId===v.requestId&&v.followup.requestId===v.requestId);
const base={actionId:id,catalogRevision:inputRevision};
export const requestPipelineMutationSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('stage_retire'),stageId:id,reassignToId:stageId}).strict().refine(v=>v.stageId!==v.reassignToId),
 z.object({...base,action:z.literal('stage_save'),stageId:id,name}).strict(),
 z.object({...base,action:z.literal('stage_reorder'),stageIds:z.array(stageId).min(6).max(18).refine(v=>new Set(v).size===v.length&&JSON.stringify(v.filter(s=>requestPipelineBuiltins.includes(s as typeof requestPipelineBuiltins[number])))===JSON.stringify(requestPipelineBuiltins))}).strict(),
 z.object({...base,action:z.literal('stage_visibility'),stageId,hidden:z.boolean(),reassignToId:stageId.nullable()}).strict().refine(v=>v.hidden===(v.reassignToId!==null)&&v.stageId!==v.reassignToId&&(!['new','won'].includes(v.stageId)||!v.hidden)),
 z.object({...base,action:z.literal('set_stage'),requestId:id,revision:inputRevision,stageId}).strict(),
 z.object({...base,action:z.literal('return_auto'),requestId:id,revision:inputRevision}).strict(),
]);
export const requestPipelineHistorySchema=z.object({actionId:id,action:z.enum(['set_stage','return_auto','reassign_stage']),at:stamp,before:requestPipelineStateSchema,after:requestPipelineStateSchema,beforeName:name.nullable(),afterName:name.nullable()}).strict().refine(v=>v.before.requestId===v.after.requestId&&v.after.revision===v.before.revision+1);
export const requestPipelineResultSchema=z.discriminatedUnion('action',[
 z.object({action:z.enum(['stage_save','stage_reorder','stage_visibility','stage_retire']),catalog:requestPipelineCatalogSchema,reassigned:z.number().int().nonnegative()}).strict(),
 z.object({action:z.enum(['set_stage','return_auto']),catalogRevision:revision,state:requestPipelineStateSchema,before:requestPipelineStateSchema,stage:requestPipelineStageSchema,evidence:requestPipelineEvidenceSchema}).strict().refine(v=>v.state.requestId===v.before.requestId&&v.state.revision===v.before.revision+1&&(v.action==='set_stage'?v.state.mode==='manual'&&v.state.stageId===v.stage.id:v.state.mode==='automatic')),
]);
export const requestPipelineReceiptSchema=z.object({receipt:z.object({input:requestPipelineMutationSchema,result:requestPipelineResultSchema}).strict().refine(({input,result})=>input.action===result.action&&('catalog'in result?result.catalog.revision===input.catalogRevision+1:'requestId'in input&&result.catalogRevision===input.catalogRevision&&result.state.requestId===input.requestId&&result.before.revision===input.revision&&result.state.revision===input.revision+1&&(input.action!=='set_stage'||result.state.stageId===input.stageId))).nullable()}).strict();
function validLeadCatalog(catalog:z.infer<typeof requestPipelineCatalogSchema>,lead:z.infer<typeof requestPipelineLeadSchema>){return catalog.stages.some(s=>s.id===lead.effectiveStageId&&!s.hidden)&&(lead.state.mode!=='manual'||lead.state.stageId===lead.effectiveStageId);}
export const requestPipelinePageSchema=z.object({catalog:requestPipelineCatalogSchema,items:z.array(requestPipelineLeadSchema).max(20),counts:z.array(z.object({stageId,count:z.number().int().nonnegative()}).strict()).min(6).max(18),nextCursor:id.nullable(),snapshotToken:z.string().regex(/^[a-f0-9]{32}$/)}).strict().refine(v=>new Set(v.items.map(i=>i.requestId)).size===v.items.length&&v.items.every(i=>validLeadCatalog(v.catalog,i))&&JSON.stringify(v.counts.map(c=>c.stageId))===JSON.stringify(v.catalog.stages.map(s=>s.id))&&(v.nextCursor===null||v.items.length===20&&v.nextCursor===v.items.at(-1)!.requestId));
export const requestPipelineHistoryPageSchema=z.object({items:z.array(requestPipelineHistorySchema).max(20),nextCursor:id.nullable()}).strict();
export const requestPipelineDetailSchema=z.object({catalog:requestPipelineCatalogSchema,lead:requestPipelineLeadSchema,history:z.array(requestPipelineHistorySchema).max(20),nextCursor:id.nullable()}).strict().refine(v=>validLeadCatalog(v.catalog,v.lead)&&v.history.every(h=>h.after.requestId===v.lead.requestId)&&(v.nextCursor===null||v.history.length===20&&v.nextCursor===v.history.at(-1)!.actionId));
export type RequestPipelineMutation=z.infer<typeof requestPipelineMutationSchema>;
export type RequestPipelineCatalog=z.infer<typeof requestPipelineCatalogSchema>;
export type RequestPipelineLead=z.infer<typeof requestPipelineLeadSchema>;
export type RequestPipelineState=z.infer<typeof requestPipelineStateSchema>;
export type RequestPipelineResult=z.infer<typeof requestPipelineResultSchema>;

export type RequestPipelineStage=z.infer<typeof requestPipelineStageSchema>;
export type RequestPipelinePage=z.infer<typeof requestPipelinePageSchema>;
export type RequestPipelineDetail=z.infer<typeof requestPipelineDetailSchema>;
