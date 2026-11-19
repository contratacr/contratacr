import {normalizeQuantityInput} from './allowances';
import {z} from 'zod';

/**
 * Mediciones sobre planos (parity register row 66). Per job: plans (private job
 * images) → pages with a scale → area, length and count measurements. Geometry
 * is normalized to the page (0–1, six decimals) and the server computes every
 * result in integer thousandths. Private to the professional: the customer view
 * never reads it. "Send to quote" writes draft estimate lines; nothing is
 * shared, charged, invoiced or notified.
 */
const uuid=z.string().uuid(),workId=z.string().trim().min(1).max(160),stamp=z.string().datetime({offset:true});
const revision=z.number().int().positive().max(2147483646);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text=(max:number)=>z.string().trim().min(1).max(max);
export const TAKEOFF_POINTS_MAX=400;
/** Normalized coordinate with at most six decimals (stored as integer millionths). */
export const takeoffCoordinate=z.number().min(0).max(1).refine(value=>Math.abs(value*1e6-Math.round(value*1e6))<1e-6,'Too many decimals.');
export const takeoffPointSchema=z.tuple([takeoffCoordinate,takeoffCoordinate]);
export type TakeoffPoint=z.infer<typeof takeoffPointSchema>;
export const roundCoordinate=(value:number)=>Math.round(Math.min(1,Math.max(0,value))*1e6)/1e6;
export const takeoffKinds=['area','length','count'] as const;
export type TakeoffKind=typeof takeoffKinds[number];
export const takeoffUnits=['m','ft'] as const;
export type TakeoffUnit=typeof takeoffUnits[number];
export const takeoffResultUnits=['m','m2','ft','ft2','u'] as const;
export type TakeoffResultUnit=typeof takeoffResultUnits[number];
export const takeoffMultiplierModes=['none','height','factor'] as const;
export type TakeoffMultiplierMode=typeof takeoffMultiplierModes[number];
/** Colour choices offered in the editor (any #rrggbb is accepted by the server). */
export const takeoffColors=['#0089bb','#d9480f','#2b8a3e','#7048e8','#c2255c','#e67700','#1c7ed6','#495057'] as const;
const milli=(max:number)=>z.number().int().min(1).max(max);

const target={actionId:uuid,workId,id:uuid};
const measurementFields={
 name:text(120),categoryId:uuid.nullable(),color:z.string().regex(/^#[0-9a-f]{6}$/),points:z.array(takeoffPointSchema).max(TAKEOFF_POINTS_MAX),
 manualMilli:milli(1000000000000).nullable(),multiplierMode:z.enum(takeoffMultiplierModes),multiplierMilli:milli(100000000).nullable(),
 wasteBps:z.number().int().min(0).max(10000),productId:z.string().min(1).max(160).nullable(),
};
const pointRule=(kind:TakeoffKind|null,value:{points:TakeoffPoint[];manualMilli:number|null;multiplierMode:TakeoffMultiplierMode;multiplierMilli:number|null},context:z.RefinementCtx)=>{
 if((value.multiplierMode==='none')!==(value.multiplierMilli===null))context.addIssue({code:'custom',message:'Multiplier value.'});
 if(value.manualMilli!==null&&value.points.length>0)context.addIssue({code:'custom',message:'Manual value without points.'});
 if(value.manualMilli===null&&kind&&value.points.length<(kind==='area'?3:kind==='length'?2:1))context.addIssue({code:'custom',message:'Not enough points.'});
 if(kind&&kind!=='length'&&value.multiplierMode==='height')context.addIssue({code:'custom',message:'Height only applies to lengths.'});
};
/** Client input for creating a plan; the server adds the image size it reads from storage. */
export const takeoffPlanCreateSchema=z.object({action:z.literal('plan_create'),...target,fileId:uuid,title:text(160)}).strict();
export const takeoffMutationSchema=z.discriminatedUnion('action',[
 takeoffPlanCreateSchema,
 z.object({action:z.literal('plan_update'),...target,revision,title:text(160)}).strict(),
 z.object({action:z.enum(['plan_archive','plan_restore']),...target,revision}).strict(),
 z.object({action:z.literal('page_calibrate'),...target,revision,pageNumber:z.number().int().min(1).max(200),unit:z.enum(takeoffUnits),
  calibration:z.object({points:z.tuple([takeoffPointSchema,takeoffPointSchema]),lengthMilli:milli(1000000)}).strict().nullable()}).strict(),
 z.object({action:z.literal('measurement_create'),...target,planId:uuid,pageNumber:z.number().int().min(1).max(200),kind:z.enum(takeoffKinds),...measurementFields}).strict()
  .superRefine((value,context)=>pointRule(value.kind,value,context)),
 z.object({action:z.literal('measurement_update'),...target,revision,...measurementFields}).strict().superRefine((value,context)=>pointRule(null,value,context)),
 z.object({action:z.literal('measurement_visibility'),...target,revision,hidden:z.boolean()}).strict(),
 z.object({action:z.enum(['measurement_archive','measurement_restore']),...target,revision}).strict(),
 z.object({action:z.literal('send_estimate'),actionId:uuid,workId,measurementIds:z.array(uuid).min(1).max(100),estimateId:uuid.nullable(),estimateRevision:revision.nullable(),language:z.enum(['es','en'])}).strict()
  .refine(value=>(value.estimateId===null)===(value.estimateRevision===null)&&new Set(value.measurementIds).size===value.measurementIds.length),
]);
export type TakeoffMutation=z.infer<typeof takeoffMutationSchema>;
/** Fix 14 (row 66): mark an area as an opening of another area of the same page, or undo it. */
export const takeoffDeductionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('deduction_set'),...target,revision,parentId:uuid}).strict().refine(value=>value.parentId!==value.id),
 z.object({action:z.literal('deduction_clear'),...target,revision}).strict(),
]);
export type TakeoffDeduction=z.infer<typeof takeoffDeductionSchema>;

export const takeoffResultSchema=z.object({
 baseMilli:z.number().int().nonnegative().nullable(),totalMilli:z.number().int().nonnegative().nullable(),
 baseUnit:z.enum(takeoffResultUnits),unit:z.enum(takeoffResultUnits),needsScale:z.boolean(),
 // Fix 14 (row 66): an area can subtract openings («huecos»); the base/total above are then the NET values.
 deductFrom:uuid.nullable().optional(),grossMilli:z.number().int().nonnegative().optional(),deductedMilli:z.number().int().nonnegative().optional(),openings:z.number().int().positive().optional(),
}).strict();
export type TakeoffResult=z.infer<typeof takeoffResultSchema>;
export const takeoffPageSchema=z.object({
 pageNumber:z.number().int().min(1).max(200),widthPx:z.number().int().min(1).max(20000),heightPx:z.number().int().min(1).max(20000),unit:z.enum(takeoffUnits),
 calibration:z.object({points:z.tuple([takeoffPointSchema,takeoffPointSchema]),lengthMilli:milli(1000000)}).strict().nullable(),
 revision:z.number().int().positive(),updatedAt:stamp,
}).strict();
export type TakeoffPage=z.infer<typeof takeoffPageSchema>;
export const takeoffPlanSchema=z.object({
 id:uuid,workId,fileId:uuid,position:z.number().int().positive(),title:text(160),pageCount:z.number().int().min(1).max(200),
 fileName:z.string().min(1).max(160),mimeType:z.enum(['image/jpeg','application/pdf']),sizeBytes:z.number().int().positive(),uploadedOn:day,
 pages:z.array(takeoffPageSchema).min(1).max(200),archived:z.boolean(),revision:z.number().int().positive(),createdAt:stamp,updatedAt:stamp,
}).strict();
export type TakeoffPlan=z.infer<typeof takeoffPlanSchema>;
export const takeoffMeasurementSchema=z.object({
 id:uuid,workId,planId:uuid,pageNumber:z.number().int().min(1).max(200),position:z.number().int().positive(),kind:z.enum(takeoffKinds),name:text(120),
 categoryId:uuid.nullable(),categoryName:z.string().min(1).max(80).nullable(),color:z.string().regex(/^#[0-9a-f]{6}$/),hidden:z.boolean(),
 points:z.array(takeoffPointSchema).max(TAKEOFF_POINTS_MAX),manualMilli:z.number().int().positive().nullable(),
 multiplierMode:z.enum(takeoffMultiplierModes),multiplierMilli:z.number().int().positive().nullable(),wasteBps:z.number().int().min(0).max(10000),
 productId:z.string().min(1).max(160).nullable(),productName:z.string().max(500).nullable(),result:takeoffResultSchema,
 archived:z.boolean(),revision:z.number().int().positive(),createdAt:stamp,updatedAt:stamp,
}).strict();
export type TakeoffMeasurement=z.infer<typeof takeoffMeasurementSchema>;
export const takeoffCategorySchema=z.object({id:uuid,name:z.string().min(1).max(80),archived:z.boolean()}).strict();
export type TakeoffCategory=z.infer<typeof takeoffCategorySchema>;
export const takeoffEstimateSchema=z.object({id:uuid,title:z.string().min(1).max(160),currency:z.enum(['CRC','USD']),revision:z.number().int().positive(),totalCents:z.number().int().nonnegative(),lineCount:z.number().int().nonnegative()}).strict();
export type TakeoffEstimate=z.infer<typeof takeoffEstimateSchema>;
export const takeoffHistoryActions=['plan_create','plan_update','plan_archive','plan_restore','page_calibrate','measurement_create','measurement_update','measurement_visibility','measurement_archive','measurement_restore','send_estimate'] as const;
export const takeoffHistorySchema=z.object({actionId:uuid,action:z.enum(takeoffHistoryActions),targetKind:z.enum(['plan','page','measurement','estimate']),targetId:z.string().min(1).max(200),at:stamp}).strict();
export type TakeoffHistoryEntry=z.infer<typeof takeoffHistorySchema>;
export const takeoffDetailSchema=z.object({
 workId,today:day,canQuote:z.boolean(),plans:z.array(takeoffPlanSchema).max(50),measurements:z.array(takeoffMeasurementSchema).max(1000),
 categories:z.array(takeoffCategorySchema).max(1000),estimates:z.array(takeoffEstimateSchema).max(500),history:z.array(takeoffHistorySchema).max(100),
}).strict();
export type TakeoffDetail=z.infer<typeof takeoffDetailSchema>;
export const takeoffSendResultSchema=z.object({
 estimateId:uuid,created:z.boolean(),estimateRevision:z.number().int().positive(),title:z.string().min(1).max(160),lineIds:z.array(uuid).min(1).max(100),
 measurementIds:z.array(uuid).min(1).max(100),lineCount:z.number().int().min(1).max(100),totalCents:z.number().int().nonnegative(),currency:z.enum(['CRC','USD']),
}).strict();
export type TakeoffSendResult=z.infer<typeof takeoffSendResultSchema>;
export const takeoffMutationResultSchema=z.union([
 z.object({plan:takeoffPlanSchema}).strict(),z.object({page:takeoffPageSchema}).strict(),
 z.object({measurement:takeoffMeasurementSchema}).strict(),z.object({estimate:takeoffSendResultSchema}).strict(),
]);

// ---- Client-side preview (the server result is the one that is stored and quoted) ----
const distance=(a:TakeoffPoint,b:TakeoffPoint,w:number,h:number)=>Math.hypot((b[0]-a[0])*w,(b[1]-a[1])*h);
export function takeoffPixelLength(points:TakeoffPoint[],w:number,h:number){let total=0;for(let i=1;i<points.length;i++)total+=distance(points[i-1],points[i],w,h);return total;}
/** Shoelace formula in square pixels. */
export function takeoffPixelArea(points:TakeoffPoint[],w:number,h:number){let sum=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=a[0]*b[1]-b[0]*a[1];}return Math.abs(sum)/2*w*h;}
export function previewTakeoff(kind:TakeoffKind,input:{points:TakeoffPoint[];manualMilli:number|null;multiplierMode:TakeoffMultiplierMode;multiplierMilli:number|null;wasteBps:number},page:TakeoffPage):TakeoffResult{
 const baseUnit:TakeoffResultUnit=kind==='count'?'u':kind==='area'?`${page.unit}2`:page.unit;
 const unit:TakeoffResultUnit=input.multiplierMode==='height'?`${page.unit}2`:baseUnit;
 let base:number|null;
 if(kind==='count')base=input.manualMilli??input.points.length*1000;
 else if(input.manualMilli!==null)base=input.manualMilli;
 else if(!page.calibration)return{baseMilli:null,totalMilli:null,baseUnit,unit,needsScale:true};
 else{
  const [a,b]=page.calibration.points,cal=distance(a,b,page.widthPx,page.heightPx),len=page.calibration.lengthMilli;
  base=kind==='length'?Math.round(takeoffPixelLength(input.points,page.widthPx,page.heightPx)*len/cal):Math.round(takeoffPixelArea(input.points,page.widthPx,page.heightPx)*len*len/(cal*cal*1000));
 }
 let total=base;
 if(input.multiplierMode!=='none'&&input.multiplierMilli)total=Math.round(total*input.multiplierMilli/1000);
 if(input.wasteBps>0)total=Math.round(total*(10000+input.wasteBps)/10000);
 return{baseMilli:base,totalMilli:total,baseUnit,unit,needsScale:false};
}
/** Parses a typed decimal into integer thousandths. With the language it follows the same grouping
 * rule as colones and the other Pro quantities (normalizeQuantityInput): in Spanish «1.200» is one
 * thousand two hundred and «2,4» two point four; in English «1,200» / «2.4». Without it (legacy callers)
 * either mark is a decimal separator. */
export function parseMilli(value:string,max:number,en?:boolean){
 const clean=en===undefined?value.trim().replace(/\s/g,''):normalizeQuantityInput(value,en);if(!/^\d{1,12}([.,]\d{1,3})?$/.test(clean))return null;
 const [whole,fraction='']=clean.split(/[.,]/),result=Number(whole)*1000+Number((fraction+'000').slice(0,3));
 return Number.isSafeInteger(result)&&result>=1&&result<=max?result:null;
}
export function milliToInput(value:number,en:boolean){const whole=Math.floor(value/1000),fraction=String(value%1000).padStart(3,'0').replace(/0+$/,'');return fraction?`${whole}${en?'.':','}${fraction}`:String(whole);}
/** Read-only value: es-CR groups thousands with a space (never «.»), so what is shown can be typed back. */
export function formatMilli(value:number,en:boolean){return new Intl.NumberFormat(en?'en-US':'es-CR',{minimumFractionDigits:0,maximumFractionDigits:2}).format(value/1000);}
export function unitLabel(unit:TakeoffResultUnit,en:boolean,milliValue?:number){
 if(unit==='u')return milliValue===1000?(en?'unit':'unidad'):(en?'units':'unidades');
 return unit==='m2'?'m²':unit==='ft2'?'ft²':unit;
}
export function formatQuantity(value:number|null,unit:TakeoffResultUnit,en:boolean){return value===null?null:`${formatMilli(value,en)} ${unitLabel(unit,en,value)}`;}
