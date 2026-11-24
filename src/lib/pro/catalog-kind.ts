import {z} from 'zod';
/** Area D (price book): item kind (standard, placeholder, assembly) and the parts of an assembly (side tables pro_product_kind / pro_product_assembly_parts). */
export const ITEM_KINDS=['standard','placeholder','assembly'] as const;
export const ITEM_KIND_LABELS:Record<typeof ITEM_KINDS[number],{es:string;en:string}>={standard:{es:'Artículo normal',en:'Standard item'},placeholder:{es:'Provisional (precio por definir)',en:'Placeholder (price to be set)'},assembly:{es:'Ensamble (varios artículos)',en:'Assembly (several items)'}};
export const assemblyPartSchema=z.object({partId:z.string(),name:z.string(),sku:z.string(),qtyMilli:z.number().int().min(1).max(999999999),unitCostCents:z.number().int().nonnegative(),lineCostCents:z.number().int().nonnegative()}).strict();
export const itemKindSchema=z.object({productId:z.string(),revision:z.number().int().nonnegative(),kind:z.enum(ITEM_KINDS),parts:z.array(assemblyPartSchema).max(40),costCents:z.number().int().nonnegative().nullable()}).strict();
export type ItemKind=z.infer<typeof itemKindSchema>;
export const itemKindMutationSchema=z.object({
 productId:z.string().min(1).max(160),revision:z.number().int().min(0).max(999999999),kind:z.enum(ITEM_KINDS),
 parts:z.array(z.object({partId:z.string().min(1).max(160),qtyMilli:z.number().int().min(1).max(999999999)}).strict()).max(40),
}).strict().superRefine((value,ctx)=>{
 if(value.kind!=='assembly'&&value.parts.length)ctx.addIssue({code:'custom',message:'Only an assembly has parts.'});
 if(new Set(value.parts.map(part=>part.partId)).size!==value.parts.length||value.parts.some(part=>part.partId===value.productId))ctx.addIssue({code:'custom',message:'Invalid parts.'});
});
/** "1,5" or "1.5" to thousandths; null when not a positive quantity with at most 3 decimals. */
export function parseQtyMilli(text:string):number|null{
 const normalized=text.trim().replace(',','.');if(!/^\d{1,6}(\.\d{1,3})?$/.test(normalized))return null;
 const milli=Math.round(Number(normalized)*1000);return milli>=1?milli:null;
}
export function assemblyCostCents(parts:ReadonlyArray<{unitCostCents:number;qtyMilli:number}>){return parts.reduce((sum,part)=>sum+Math.round(part.unitCostCents*part.qtyMilli/1000),0);}
