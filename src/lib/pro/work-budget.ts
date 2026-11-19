import {z} from 'zod';

const uuid=z.string().uuid();
const workId=z.string().min(1).max(160);
const revision=z.number().int().nonnegative().max(2147483647);
const inputRevision=revision.max(2147483646);
const cents=z.number().int().safe().nonnegative();
const fingerprint=z.string().regex(/^[a-f0-9]{32}$/);
const stamp=z.string().datetime({offset:true});
const clean=(max:number)=>z.string().trim().max(max).refine(value=>{
  if(/[\u0000-\u001f\u007f]/.test(value))return false;
  for(let i=0;i<value.length;i++){
    const c=value.charCodeAt(i);
    if(c>=0xd800&&c<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}
    else if(c>=0xdc00&&c<=0xdfff)return false;
  }
  return true;
});
const codeText=z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,29}$/);
export const workBudgetCodeSchema=z.object({
  id:uuid,kind:z.enum(['group','item']),code:codeText,title:clean(160).min(1),
  parentId:uuid.nullable(),plannedCents:cents.max(9000000000000).nullable(),archived:z.boolean(),
}).strict().refine(value=>value.kind==='group'?value.parentId===null&&value.plannedCents===null:value.plannedCents!==null);
export const workBudgetSourceSchema=z.object({kind:z.enum(['material','time','expense']),id:uuid,fingerprint}).strict();
export const workBudgetAssignmentSchema=z.object({kind:z.enum(['material','time','expense']),id:uuid,codeId:uuid.nullable()}).strict();
const common={actionId:uuid,workId,clientId:workId,revision:inputRevision};
export const workBudgetMutationSchema=z.discriminatedUnion('action',[
  z.object({...common,action:z.literal('save_group'),id:uuid,code:codeText,title:clean(160).min(1)}).strict(),
  z.object({...common,action:z.literal('save_item'),id:uuid,code:codeText,title:clean(160).min(1),parentId:uuid.nullable(),plannedCents:cents.max(9000000000000)}).strict(),
  z.object({...common,action:z.enum(['archive','restore']),id:uuid}).strict(),
  z.object({...common,action:z.literal('assign'),source:workBudgetSourceSchema,codeId:uuid.nullable()}).strict(),
]);
export const workBudgetResultSchema=z.object({
  action:z.enum(['save_group','save_item','archive','restore','assign']),workId,revision:revision.min(1),
  metadataFingerprint:fingerprint,code:workBudgetCodeSchema.nullable(),assignment:workBudgetAssignmentSchema.nullable(),
}).strict().refine(value=>value.action==='assign'?value.code===null&&value.assignment!==null:value.code!==null&&value.assignment===null);
export const workBudgetReceiptSchema=z.object({receipt:z.object({input:workBudgetMutationSchema,result:workBudgetResultSchema}).strict().refine(({input,result})=>{
  if(input.action!==result.action||input.workId!==result.workId||result.revision!==input.revision+1)return false;
  if(input.action==='assign')return result.assignment?.kind===input.source.kind&&result.assignment.id===input.source.id&&result.assignment.codeId===input.codeId;
  if(result.code?.id!==input.id)return false;
  if(input.action==='archive'||input.action==='restore')return result.code.archived===(input.action==='archive');
  if(input.action==='save_group'||input.action==='save_item')return result.code.kind===(input.action==='save_group'?'group':'item')&&result.code.code===input.code&&result.code.title===input.title&&!result.code.archived
    &&(input.action!=='save_item'||result.code.parentId===input.parentId&&result.code.plannedCents===input.plannedCents);
  return false;
}).nullable()}).strict();
export const workBudgetTotalsSchema=z.object({
  plannedCents:cents.nullable(),actualCents:cents,unknownMinutes:cents,unknownCount:cents,
  sourceCount:cents,varianceCents:z.number().int().safe().nullable(),
}).strict().refine(value=>value.varianceCents===(value.plannedCents===null||value.unknownCount>0?null:value.plannedCents-value.actualCents));
export const workBudgetOverviewSchema=z.object({
  work:z.object({id:workId,clientId:workId,title:z.string(),cancelled:z.boolean(),clientArchived:z.boolean()}).strict(),
  currency:z.literal('CRC'),revision,metadataFingerprint:fingerprint,sourceFingerprint:fingerprint,fingerprint,
  canWrite:z.boolean(),suggestedItemCode:codeText,suggestedGroupCode:codeText,codeCount:cents.max(500),summary:workBudgetTotalsSchema,
  unassigned:workBudgetTotalsSchema,
}).strict();
const pageContext={workId,revision,fingerprint};
export const workBudgetCodesPageSchema=z.object({...pageContext,
  items:z.array(z.object({code:workBudgetCodeSchema,parent:workBudgetCodeSchema.nullable(),totals:workBudgetTotalsSchema}).strict().refine(row=>row.code.parentId===null?row.parent===null:row.parent?.id===row.code.parentId&&row.parent.kind==='group')).max(20),nextCursor:uuid.nullable(),
}).strict().refine(value=>new Set(value.items.map(row=>row.code.id)).size===value.items.length&&(value.nextCursor===null||value.items.length===20&&value.nextCursor===value.items.at(-1)?.code.id));
export const workBudgetCostSchema=z.object({
  kind:z.enum(['material','time','expense']),id:uuid,fingerprint,title:z.string(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountCents:cents.nullable(),minutes:cents.nullable(),unknownMinutes:cents,codeId:uuid.nullable(),code:workBudgetCodeSchema.nullable(),
}).strict().refine(value=>(value.codeId===null?value.code===null:value.code?.id===value.codeId&&value.code.kind==='item')).refine(value=>value.kind==='time'?value.minutes!==null&&value.unknownMinutes===(value.amountCents===null?value.minutes:0):value.minutes===null&&value.unknownMinutes===0&&value.amountCents!==null);
export const workBudgetCostCursorSchema=z.string().regex(/^(material|time|expense):[a-f0-9-]{36}$/).refine(value=>uuid.safeParse(value.slice(value.indexOf(':')+1)).success);
export const workBudgetCostsPageSchema=z.object({...pageContext,
  items:z.array(workBudgetCostSchema).max(20),nextCursor:workBudgetCostCursorSchema.nullable(),
}).strict().refine(value=>new Set(value.items.map(row=>row.kind+':'+row.id)).size===value.items.length&&(value.nextCursor===null||value.items.length===20&&value.nextCursor===value.items.at(-1)?.kind+':'+value.items.at(-1)?.id));
export const workBudgetHistoryContextSchema=z.object({
  source:z.object({kind:z.enum(['material','time','expense']),id:uuid,title:z.string(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),amountCents:cents.nullable(),minutes:cents.nullable()}).strict(),
  fromCode:workBudgetCodeSchema.nullable(),toCode:workBudgetCodeSchema.nullable(),
}).strict();
export const workBudgetHistorySchema=z.object({
  actionId:uuid,at:stamp,input:workBudgetMutationSchema,
  before:z.union([workBudgetCodeSchema,workBudgetAssignmentSchema]).nullable(),
  result:workBudgetResultSchema,context:workBudgetHistoryContextSchema.nullable(),
}).strict().refine(value=>{
  if(value.input.actionId!==value.actionId||!workBudgetReceiptSchema.safeParse({receipt:{input:value.input,result:value.result}}).success)return false;
  if(value.input.action!=='assign')return value.context===null;
  const context=value.context;
  if(!context||context.source.kind!==value.input.source.kind||context.source.id!==value.input.source.id)return false;
  const before=value.before&&'codeId'in value.before?value.before:null;
  return before!==null&&(context.fromCode?.id??null)===before.codeId
    &&(context.toCode?.id??null)===value.input.codeId
    &&(context.fromCode===null||context.fromCode.kind==='item')
    &&(context.toCode===null||context.toCode.kind==='item');
});
export const workBudgetHistoryPageSchema=z.object({workId,items:z.array(workBudgetHistorySchema).max(20),nextCursor:uuid.nullable()}).strict().refine(value=>new Set(value.items.map(row=>row.actionId)).size===value.items.length&&value.items.every((row,index)=>row.input.workId===value.workId&&(index===0||row.result.revision<value.items[index-1].result.revision))&&(value.nextCursor===null||value.items.length===20&&value.nextCursor===value.items.at(-1)?.actionId));
export type WorkBudgetMutation=z.infer<typeof workBudgetMutationSchema>;
export type WorkBudgetResult=z.infer<typeof workBudgetResultSchema>;
export type WorkBudgetCode=z.infer<typeof workBudgetCodeSchema>;
export type WorkBudgetOverview=z.infer<typeof workBudgetOverviewSchema>;
export type WorkBudgetCost=z.infer<typeof workBudgetCostSchema>;
export type WorkBudgetReceipt=z.infer<typeof workBudgetReceiptSchema>;

export const workBudgetCodeDetailSchema=z.object({...pageContext,code:workBudgetCodeSchema,parent:workBudgetCodeSchema.nullable(),totals:workBudgetTotalsSchema}).strict().refine(row=>row.code.parentId===null?row.parent===null:row.parent?.id===row.code.parentId&&row.parent.kind==='group');
export type WorkBudgetCodesPage=z.infer<typeof workBudgetCodesPageSchema>;
export type WorkBudgetCostsPage=z.infer<typeof workBudgetCostsPageSchema>;
export type WorkBudgetCodeDetail=z.infer<typeof workBudgetCodeDetailSchema>;
export type WorkBudgetHistoryPage=z.infer<typeof workBudgetHistoryPageSchema>;

export const workBudgetCostDetailSchema=z.object({...pageContext,item:workBudgetCostSchema.nullable()}).strict();
export type WorkBudgetCostDetail=z.infer<typeof workBudgetCostDetailSchema>;
