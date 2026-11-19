import {z} from 'zod';
/** Round 7C: catalog item image + preferred vendor (side table pro_product_details). */
export const productDetailSchema=z.object({productId:z.string(),revision:z.number().int().nonnegative(),vendorId:z.string().uuid().nullable(),vendorName:z.string().nullable(),imageId:z.string().uuid().nullable(),imageSize:z.number().int().nullable()});
export type ProductDetail=z.infer<typeof productDetailSchema>;
const base={actionId:z.string().uuid(),productId:z.string().min(1).max(160),revision:z.number().int().nonnegative()};
export const productDetailMutationSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('set_vendor'),vendorId:z.string().uuid().nullable()}).strict(),
 z.object({...base,action:z.literal('upload_image'),name:z.string().min(1).max(160),data:z.string().min(4)}).strict(),
 z.object({...base,action:z.literal('remove_image')}).strict(),
]);
