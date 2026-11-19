import {z} from 'zod';

/**
 * Selecciones por área con aprobación del cliente (parity register family 62).
 * Per job: areas → items to choose → options. The owner publishes an item; the
 * linked customer approves one option or asks for changes. Amounts are CRC
 * céntimos. Option images reuse the private job files. Nothing here charges,
 * invoices or notifies anyone.
 */
const uuid=z.string().uuid(),workId=z.string().trim().min(1).max(160),stamp=z.string().datetime({offset:true});
const cents=z.number().int().min(0).max(10000000000);
const revision=z.number().int().positive().max(2147483646);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;});
const text=(max:number)=>z.string().trim().min(1).max(max);
const optionalText=(max:number)=>z.string().trim().max(max).nullable();
const quantity=z.number().min(0.01).max(1000000).refine(value=>Math.abs(value*100-Math.round(value*100))<1e-6);
export const SELECTION_NOTES_MAX=1000;
export const SELECTION_URL_MAX=500;
/** Only absolute https links without spaces or credentials. */
export function isSelectionUrl(value:string){
 if(value.length>SELECTION_URL_MAX||/\s/.test(value)||!/^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#]\S*)?$/.test(value))return false;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}
}
const link=z.string().trim().max(SELECTION_URL_MAX).refine(isSelectionUrl).nullable();

const target={actionId:uuid,workId,id:uuid};
const itemFields={areaId:uuid,name:text(160),dueDate:day.nullable(),notes:optionalText(SELECTION_NOTES_MAX),allowanceId:uuid.nullable()};
const optionFields={optionId:uuid,name:text(160),brand:optionalText(160),url:link,quantity,unitCents:cents,clientNotes:optionalText(SELECTION_NOTES_MAX),imageFileId:uuid.nullable()};
export const selectionMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('area_create'),...target,name:text(80)}).strict(),
 z.object({action:z.literal('area_update'),...target,revision,name:text(80)}).strict(),
 z.object({action:z.enum(['area_archive','area_restore']),...target,revision}).strict(),
 z.object({action:z.literal('item_create'),...target,...itemFields}).strict(),
 z.object({action:z.literal('item_update'),...target,revision,...itemFields}).strict(),
 z.object({action:z.enum(['option_add','option_update']),...target,revision,...optionFields}).strict(),
 z.object({action:z.literal('option_remove'),...target,revision,optionId:uuid}).strict(),
 z.object({action:z.literal('recommend'),...target,revision,optionId:uuid.nullable()}).strict(),
 z.object({action:z.enum(['publish','unpublish','reopen','archive','restore']),...target,revision}).strict(),
]).superRefine((value,context)=>{if((value.action==='option_add'||value.action==='option_update')&&Math.round(value.quantity*value.unitCents)>10000000000)context.addIssue({code:'custom',message:'Total too large.'});});
export type SelectionMutation=z.infer<typeof selectionMutationSchema>;

export const selectionClientMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('approve'),actionId:uuid,requestId:uuid,id:uuid,revision,optionId:uuid}).strict(),
 z.object({action:z.literal('request_changes'),actionId:uuid,requestId:uuid,id:uuid,revision,comment:text(SELECTION_NOTES_MAX)}).strict(),
]);
export type SelectionClientMutation=z.infer<typeof selectionClientMutationSchema>;

export const selectionStateSchema=z.enum(['no_options','draft','pending_client','approved','changes_requested','archived']);
export type SelectionState=z.infer<typeof selectionStateSchema>;
export const selectionAreaSchema=z.object({id:uuid,workId,position:z.number().int().positive(),name:text(80),archived:z.boolean(),revision:z.number().int().positive(),createdAt:stamp,updatedAt:stamp}).strict();
export type SelectionArea=z.infer<typeof selectionAreaSchema>;
export const selectionOptionSchema=z.object({
 id:uuid,position:z.number().int().positive(),name:text(160),brand:z.string().min(1).max(160).nullable(),url:z.string().min(1).max(SELECTION_URL_MAX).nullable(),
 quantity:z.number().positive(),unitCents:cents,totalCents:cents,clientNotes:z.string().min(1).max(SELECTION_NOTES_MAX).nullable(),imageFileId:uuid.nullable(),
}).strict();
export type SelectionOption=z.infer<typeof selectionOptionSchema>;
export const selectionItemSchema=z.object({
 id:uuid,workId,areaId:uuid,position:z.number().int().positive(),name:text(160),dueDate:day.nullable(),notes:z.string().min(1).max(SELECTION_NOTES_MAX).nullable(),
 status:z.enum(['open','approved','changes_requested']),state:selectionStateSchema,published:z.boolean(),publishedAt:stamp.nullable(),
 approvedOptionId:uuid.nullable(),approvedAt:stamp.nullable(),clientComment:z.string().min(1).max(SELECTION_NOTES_MAX).nullable(),changesRequestedAt:stamp.nullable(),
 recommendedOptionId:uuid.nullable(),allowanceId:uuid.nullable(),archived:z.boolean(),overdue:z.boolean(),options:z.array(selectionOptionSchema).max(12),
 revision:z.number().int().positive(),createdAt:stamp,updatedAt:stamp,
}).strict();
export type SelectionItem=z.infer<typeof selectionItemSchema>;
export const selectionAllowanceSchema=z.object({id:uuid,name:text(160),category:z.string().min(1).max(80).nullable(),status:z.enum(['open','decided','reopened']),plannedCents:cents,actualCents:cents.nullable(),revision:z.number().int().positive()}).strict();
export type SelectionAllowance=z.infer<typeof selectionAllowanceSchema>;
const historyActions=['area_create','area_update','area_archive','area_restore','item_create','item_update','option_add','option_update','option_remove','recommend','publish','unpublish','reopen','archive','restore','approve','request_changes'] as const;
export const selectionHistorySchema=z.object({
 actionId:uuid,side:z.enum(['owner','client']),action:z.enum(historyActions),targetKind:z.enum(['area','item']),targetId:uuid,at:stamp,
 before:z.record(z.string(),z.unknown()).nullable(),after:z.record(z.string(),z.unknown()),
}).strict();
export type SelectionHistoryEntry=z.infer<typeof selectionHistorySchema>;
export const selectionDetailSchema=z.object({
 workId,today:day,clientVisible:z.boolean(),areas:z.array(selectionAreaSchema).max(50),items:z.array(selectionItemSchema).max(300),
 allowances:z.array(selectionAllowanceSchema).max(200),history:z.array(selectionHistorySchema).max(100),
}).strict();
export type SelectionDetail=z.infer<typeof selectionDetailSchema>;
export const selectionResultSchema=z.union([z.object({area:selectionAreaSchema}).strict(),z.object({item:selectionItemSchema}).strict()]);

/** Customer view: published items only; no internal notes, allowance link, history or file ids. */
export const clientSelectionOptionSchema=z.object({
 id:uuid,name:text(160),brand:z.string().min(1).max(160).nullable(),url:z.string().min(1).max(SELECTION_URL_MAX).nullable(),quantity:z.number().positive(),
 /* Round 11: null when the professional hides the price of this item from the customer. */
 unitCents:cents.nullable(),totalCents:cents.nullable(),clientNotes:z.string().min(1).max(SELECTION_NOTES_MAX).nullable(),hasImage:z.boolean(),
}).strict();
export const clientSelectionItemSchema=z.object({
 id:uuid,areaId:uuid,name:text(160),dueDate:day.nullable(),state:z.enum(['pending_client','approved','changes_requested']),
 approvedOptionId:uuid.nullable(),approvedAt:stamp.nullable(),clientComment:z.string().min(1).max(SELECTION_NOTES_MAX).nullable(),recommendedOptionId:uuid.nullable(),
 revision:z.number().int().positive(),options:z.array(clientSelectionOptionSchema).max(12),
 priceHidden:z.boolean().optional(),linkHidden:z.boolean().optional(),
}).strict();
export type ClientSelectionItem=z.infer<typeof clientSelectionItemSchema>;
export const clientSelectionsSchema=z.union([
 z.object({visible:z.literal(false)}).strict(),
 z.object({visible:z.literal(true),today:day,areas:z.array(z.object({id:uuid,name:text(80),items:z.array(clientSelectionItemSchema).max(300)}).strict()).max(50)}).strict(),
]);
export type ClientSelections=z.infer<typeof clientSelectionsSchema>;
export const clientSelectionResultSchema=z.object({item:clientSelectionItemSchema}).strict();
