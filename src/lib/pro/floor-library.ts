import {z} from 'zod';
/** Row 63: library of custom 3D objects per owner (sizes in metres; the plan converts to its own unit when placing). */
const dim=(min:number,max:number)=>z.number().min(min).max(max);
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const floorLibraryItemSchema=z.object({
 id:z.string().uuid(),name:z.string(),w:z.coerce.number(),d:z.coerce.number(),h:z.coerce.number(),color:z.string(),source:z.enum(['manual','obj','catalog']),
 productId:z.string().nullable(),fileSha256:z.string().nullable(),archived:z.boolean(),revision:z.number().int(),updatedAt:z.string(),
});
export type FloorLibraryItem=z.infer<typeof floorLibraryItemSchema>;
const base={id:z.string().uuid(),name:z.string().trim().min(1).max(60),w:dim(0.05,50),d:dim(0.05,50),h:dim(0.05,20),color:color.optional()};
export const floorLibraryMutationSchema=z.union([
 z.object({action:z.literal('create'),...base,source:z.literal('manual')}).strict(),
 z.object({action:z.literal('create'),...base,source:z.literal('obj'),fileSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({action:z.literal('create'),...base,source:z.literal('catalog'),productId:z.string().min(1).max(160)}).strict(),
 z.object({action:z.literal('update'),...base,revision:z.number().int().min(0).max(2147483646)}).strict(),
 z.object({action:z.enum(['archive','restore']),id:z.string().uuid(),revision:z.number().int().min(0).max(2147483646)}).strict(),
]);
