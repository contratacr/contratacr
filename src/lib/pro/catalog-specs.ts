import {z} from 'zod';
/** Family 59: specifications of a catalog item (side table pro_product_specs). */
const spec=(max:number)=>z.string().trim().max(max).nullable();
export const productSpecsSchema=z.object({
 productId:z.string(),revision:z.number().int().nonnegative(),
 brand:z.string().nullable(),model:z.string().nullable(),finish:z.string().nullable(),color:z.string().nullable(),
 material:z.string().nullable(),dimensions:z.string().nullable(),warranty:z.string().nullable(),
});
export type ProductSpecs=z.infer<typeof productSpecsSchema>;
export const productSpecsMutationSchema=z.object({
 productId:z.string().min(1).max(160),revision:z.number().int().min(0).max(999999999),
 brand:spec(80),model:spec(80),finish:spec(80),color:spec(80),material:spec(80),dimensions:spec(120),warranty:spec(120),
}).strict();
export const SPEC_FIELDS=[
 {key:'brand',es:'Marca',en:'Brand',max:80},{key:'model',es:'Modelo',en:'Model',max:80},
 {key:'finish',es:'Acabado',en:'Finish',max:80},{key:'color',es:'Color',en:'Color',max:80},
 {key:'material',es:'Material',en:'Material',max:80},{key:'dimensions',es:'Medidas',en:'Dimensions',max:120},
 {key:'warranty',es:'Garantía',en:'Warranty',max:120},
] as const;
