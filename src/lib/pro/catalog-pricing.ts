import {z} from 'zod';
/** Area D (price book): cost type, MSRP, URL and favorite of a catalog item (side table pro_product_pricing). */
export const COST_TYPES=['material','labor','material_labor'] as const;
export const COST_TYPE_LABELS:Record<typeof COST_TYPES[number],{es:string;en:string}>={material:{es:'Material',en:'Material'},labor:{es:'Mano de obra',en:'Labor'},material_labor:{es:'Material y mano de obra',en:'Material & labor'}};
const url=z.string().trim().min(8).max(500).regex(/^https?:\/\/\S+$/i);
export const productPricingSchema=z.object({
 productId:z.string(),revision:z.number().int().nonnegative(),costType:z.enum(COST_TYPES).nullable(),
 msrpCents:z.number().int().min(0).max(100000000000).nullable(),url:url.nullable(),favorite:z.boolean(),
});
export type ProductPricing=z.infer<typeof productPricingSchema>;
export const productPricingMutationSchema=z.object({
 productId:z.string().min(1).max(160),revision:z.number().int().min(0).max(999999999),costType:z.enum(COST_TYPES).nullable(),
 msrpCents:z.number().int().min(0).max(100000000000).nullable(),url:url.nullable(),favorite:z.boolean(),
}).strict();
