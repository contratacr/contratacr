import {z} from 'zod';

/**
 * Row 54 (Ronda F1-B): company cost-code library, markup and VAT per budget line, integral forecast and the
 * client-visible budget summary. Contracts of docs/pro/sql/cost-codes-local.sql. Amounts are CRC céntimos.
 */
const uuid=z.string().uuid().transform(value=>value.toLowerCase());
const workId=z.string().min(1).max(160);
const revision=z.number().int().nonnegative().max(2147483646);
const cents=z.number().int().safe();
const stamp=z.string().datetime({offset:true});
const clean=(max:number)=>z.string().trim().max(max).refine(value=>!/[\u0000-\u001f\u007f]/.test(value));
export const costCodeText=z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,29}$/);
/** Hacienda VAT tariffs already used by quotes, invoices and purchase orders (src/lib/pro/invoice-tax.ts). */
export const budgetVatCodeSchema=z.enum(['01','02','03','04','08','09','10','11']);
export type BudgetVatCode=z.infer<typeof budgetVatCodeSchema>;
const vatOrder:BudgetVatCode[]=['08','04','02','03','09','01','10','11'];
export const budgetVatOptions=vatOrder;
export function budgetVatRate(code:BudgetVatCode|null|undefined){return code==='02'?1:code==='03'?2:code==='04'?4:code==='08'?13:code==='09'?0.5:0;}
export function budgetVatLabel(code:BudgetVatCode|null|undefined,en:boolean){
 if(!code)return en?'VAT not set':'IVA sin definir';
 if(code==='10')return en?'Exempt':'Exenta';
 if(code==='11')return en?'Not subject (0% without credit)':'No sujeta (0 % sin crédito)';
 if(code==='01')return en?'0% rate':'Tarifa 0 %';
 const rate=budgetVatRate(code);return en?`${rate}%${code==='08'?' (general)':''}`:`${String(rate).replace('.',',')} %${code==='08'?' (general)':''}`;
}
/** «15», «12,5» / «12.5» → basis points (0–100 000, up to two decimals). */
export function markupInputToBp(raw:string):number|null{
 const value=raw.trim().replace(',','.');if(value==='')return 0;
 if(!/^\d{1,4}(?:\.\d{1,2})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.'),bp=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return bp<=100000?bp:null;
}
export function markupBpToInput(bp:number|null|undefined,en:boolean){if(bp===null||bp===undefined)return '';const text=(bp/100).toFixed(2).replace(/\.?0+$/,'');return en?text:text.replace('.',',');}
export function markupLabel(bp:number|null|undefined,en:boolean){return bp===null||bp===undefined?'—':(en?markupBpToInput(bp,true)+'%':markupBpToInput(bp,false)+' %');}
/** Same rounding as SQL (pro_cost_code_line_figures): half away from zero per line. */
function roundHalfAway(value:number){return Math.sign(value)*Math.round(Math.abs(value));}
export function budgetLineFigures(costCents:number,markupBp:number|null,vat:BudgetVatCode|null){
 const markup=roundHalfAway(costCents*(markupBp??0)/10000),sale=costCents+markup,tax=roundHalfAway(sale*budgetVatRate(vat)/100);
 return {markupCents:markup,saleCents:sale,taxCents:tax,totalCents:sale+tax};
}

export const costCodeSchema=z.object({
 id:uuid,kind:z.enum(['group','item']),code:costCodeText,title:clean(160).min(1),parentId:uuid.nullable(),
 unit:z.string().max(20).nullable(),vatCode:budgetVatCodeSchema.nullable(),markupBp:z.number().int().min(0).max(100000).nullable(),
 archived:z.boolean(),source:z.enum(['manual','starter','work']),
}).strict();
export const costCodeRowSchema=costCodeSchema.extend({parentCode:costCodeText.nullable(),parentTitle:z.string().nullable(),usage:z.number().int().nonnegative()}).strict();
export const costCodeLibrarySchema=z.object({revision,status:z.enum(['active','archived','all']),items:z.array(costCodeRowSchema).max(500),
 activeCount:z.number().int().nonnegative(),archivedCount:z.number().int().nonnegative(),capacity:z.literal(500)}).strict();
export const costCodeStarterSchema=z.object({revision,lang:z.enum(['es','en']),items:z.array(z.object({
 code:costCodeText,kind:z.enum(['group','item']),parentCode:costCodeText.nullable(),title:z.string(),unit:z.string().nullable(),
 vatCode:budgetVatCodeSchema.nullable(),markupBp:z.number().int().nullable(),exists:z.boolean()}).strict()).max(200)}).strict();
const libraryCommon={actionId:uuid,revision};
export const costCodeMutationSchema=z.discriminatedUnion('action',[
 z.object({...libraryCommon,action:z.literal('save'),id:uuid,kind:z.enum(['group','item']),code:costCodeText,title:clean(160).min(1),parentId:uuid.nullable(),
  unit:clean(20).nullable(),vatCode:budgetVatCodeSchema.nullable(),markupBp:z.number().int().min(0).max(100000).nullable()}).strict()
  .refine(value=>value.kind==='item'||value.parentId===null&&value.unit===null&&value.vatCode===null&&value.markupBp===null),
 z.object({...libraryCommon,action:z.enum(['archive','restore']),id:uuid}).strict(),
 z.object({...libraryCommon,action:z.literal('import_starter'),lang:z.enum(['es','en']),codes:z.array(costCodeText).min(1).max(100)}).strict()
  .refine(value=>new Set(value.codes).size===value.codes.length),
 z.object({...libraryCommon,action:z.literal('import_work'),workId}).strict(),
]);
export const costCodeResultSchema=z.object({action:z.enum(['save','archive','restore','import_starter','import_work']),revision:revision.min(1),
 code:costCodeSchema.nullable(),created:z.number().int().nonnegative(),linked:z.number().int().nonnegative(),skipped:z.number().int().nonnegative()}).strict();

const status=z.enum(['ok','watch','over','incomplete','idle']);
const figures={costCents:cents,markupCents:cents,saleCents:cents,taxCents:cents,totalCents:cents,committedCents:cents,actualCents:cents,
 unknownCount:cents,projectedCents:cents,remainingCents:cents,eacCents:cents,varianceCents:cents.nullable(),consumedBp:cents.nullable(),status};
export const budgetForecastRowSchema=z.object({codeId:uuid,kind:z.enum(['group','item']),code:costCodeText,title:z.string(),parentId:uuid.nullable(),
 archived:z.boolean(),libraryId:uuid.nullable(),libraryCode:z.string().nullable(),markupBp:z.number().int().nullable(),vatCode:budgetVatCodeSchema.nullable(),
 childCount:z.number().int().nullable(),...figures}).strict();
export const clientBudgetSnapshotSchema=z.object({title:z.string().nullable(),currency:z.literal('CRC'),
 groups:z.array(z.object({code:costCodeText,title:z.string(),saleCents:cents}).strict()).max(500),
 otherSaleCents:cents.nullable(),lineCount:z.number().int().nonnegative(),saleCents:cents,taxCents:cents,totalCents:cents}).strict();
export const budgetForecastSchema=z.object({
 work:z.object({id:workId,clientId:workId,title:z.string().nullable()}).strict(),currency:z.literal('CRC'),canWrite:z.boolean(),
 budgetRevision:revision,revision,rows:z.array(budgetForecastRowSchema).max(500),
 totals:z.object({...figures,itemCount:z.number().int(),pricedCount:z.number().int(),overCount:z.number().int(),watchCount:z.number().int(),
  uncoded:z.object({committedCents:cents,actualCents:cents,unknownCount:cents,projectedCents:cents}).strict()}).strict(),
 clientPreview:clientBudgetSnapshotSchema,
 share:z.object({id:uuid,sharedAt:stamp,snapshot:clientBudgetSnapshotSchema,stale:z.boolean()}).strict().nullable(),
 shareHistory:z.array(z.object({id:uuid,sharedAt:stamp,revokedAt:stamp.nullable(),reason:z.enum(['revoked','replaced']).nullable(),totalCents:cents}).strict()).max(10),
 customerName:z.string().nullable(),
}).strict();
const workCommon={actionId:uuid,workId,revision};
export const budgetExtrasMutationSchema=z.discriminatedUnion('action',[
 z.object({...workCommon,action:z.literal('price'),codeIds:z.array(uuid).min(1).max(500),markupBp:z.number().int().min(0).max(100000),vatCode:budgetVatCodeSchema.nullable()}).strict()
  .refine(value=>new Set(value.codeIds).size===value.codeIds.length),
 z.object({...workCommon,action:z.literal('apply_library'),budgetRevision:revision,libraryIds:z.array(uuid).min(1).max(500)}).strict()
  .refine(value=>new Set(value.libraryIds).size===value.libraryIds.length),
 z.object({...workCommon,action:z.literal('share')}).strict(),
 z.object({...workCommon,action:z.literal('revoke'),shareId:uuid}).strict(),
]);
export const budgetExtrasResultSchema=z.object({action:z.enum(['price','apply_library','share','revoke']),workId,revision:revision.min(1),budgetRevision:revision,
 created:z.number().int().nonnegative(),linked:z.number().int().nonnegative(),skipped:z.number().int().nonnegative(),shareId:uuid.nullable()}).strict();
export const clientBudgetSummarySchema=z.union([
 z.object({visible:z.literal(false)}).strict(),
 z.object({visible:z.literal(true),sharedAt:stamp,title:z.string().nullable(),currency:z.literal('CRC'),
  groups:z.array(z.object({code:costCodeText,title:z.string(),saleCents:cents}).strict()).max(500),
  otherSaleCents:cents.nullable(),saleCents:cents,taxCents:cents,totalCents:cents}).strict(),
]);
/** Budget synchronisation from an accepted quote / accepted change orders (migration 380). */
export const budgetSyncSourceSchema=z.object({kind:z.enum(['estimate','change']),id:z.string().min(1).max(80),title:z.string().nullable(),at:stamp.nullable(),
 reason:z.enum(['currency','unavailable']).nullable(),groupCount:z.number().int().nonnegative(),itemCount:z.number().int().nonnegative(),
 plannedCents:cents,saleCents:cents,unallocatedCents:cents,applied:z.boolean(),appliedAt:stamp.nullable(),createdCodes:z.number().int().nonnegative().nullable()}).strict();
export const budgetSyncSchema=z.object({work:z.object({id:workId,clientId:workId,title:z.string().nullable()}).strict(),currency:z.literal('CRC'),canWrite:z.boolean(),
 budgetRevision:revision,sources:z.array(budgetSyncSourceSchema).max(600)}).strict();
export const budgetSyncMutationSchema=z.object({action:z.literal('apply'),actionId:uuid,workId,revision,sourceKind:z.enum(['estimate','change']),sourceId:z.string().min(1).max(80)}).strict();
export const budgetSyncResultSchema=z.object({action:z.literal('apply'),workId,sourceKind:z.enum(['estimate','change']),sourceId:z.string(),revision,
 created:z.number().int().nonnegative(),plannedCents:cents,unallocatedCents:cents}).strict();
export type BudgetSync=z.infer<typeof budgetSyncSchema>;
export type BudgetSyncSource=z.infer<typeof budgetSyncSourceSchema>;
export type BudgetSyncMutation=z.infer<typeof budgetSyncMutationSchema>;
export type CostCodeRow=z.infer<typeof costCodeRowSchema>;
export type CostCodeLibrary=z.infer<typeof costCodeLibrarySchema>;
export type CostCodeStarter=z.infer<typeof costCodeStarterSchema>;
export type CostCodeMutation=z.infer<typeof costCodeMutationSchema>;
export type BudgetForecast=z.infer<typeof budgetForecastSchema>;
export type BudgetForecastRow=z.infer<typeof budgetForecastRowSchema>;
export type BudgetExtrasMutation=z.infer<typeof budgetExtrasMutationSchema>;
export type ClientBudgetSummary=z.infer<typeof clientBudgetSummarySchema>;
export type BudgetStatus=z.infer<typeof status>;
