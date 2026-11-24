import {z} from 'zod';
/** Area E: per-room budget and assignee, board templates, server-side tracker views and the global tracker. */
const cents=z.number().int().min(0).max(100000000000);
export const roomMetaSchema=z.object({areaId:z.string().uuid(),budgetCents:cents.nullable(),assignee:z.string().nullable(),revision:z.number().int().nonnegative(),
 approvedCents:z.number().int().nonnegative(),pending:z.number().int().nonnegative(),declined:z.number().int().nonnegative(),approved:z.number().int().nonnegative()});
export const roomMetaListSchema=z.object({workId:z.string(),areas:z.array(roomMetaSchema)});
export const roomMetaMutationSchema=z.object({areaId:z.string().uuid(),revision:z.number().int().min(0).max(999999999),budgetCents:cents.nullable(),assignee:z.string().trim().max(80).nullable()}).strict();
export type RoomMeta=z.infer<typeof roomMetaSchema>;
export const boardTemplateSchema=z.object({id:z.string().uuid(),name:z.string(),items:z.array(z.string())});
export const boardTemplatesSchema=z.object({templates:z.array(boardTemplateSchema)});
export const boardTemplateInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),name:z.string().trim().min(1).max(80),items:z.array(z.string().trim().min(1).max(160)).max(40)}).strict(),
 z.object({action:z.literal('delete'),id:z.string().uuid()}).strict(),
]);
export const trackerViewSchema=z.object({id:z.string().uuid(),name:z.string(),columns:z.array(z.string())});
export const trackerViewsSchema=z.object({views:z.array(trackerViewSchema)});
export const trackerViewInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),name:z.string().trim().min(1).max(40),columns:z.array(z.string().regex(/^[A-Za-z]{1,24}$/)).min(1).max(40)}).strict(),
 z.object({action:z.literal('delete'),id:z.string().uuid()}).strict(),
]);
export const globalRowSchema=z.object({workId:z.string(),workName:z.string(),areaName:z.string(),itemId:z.string(),name:z.string(),state:z.string(),dueDate:z.string().nullable(),
 optionName:z.string().nullable(),brand:z.string().nullable(),url:z.string().nullable(),quantity:z.number().nullable(),unitCents:z.number().nullable(),totalCents:z.number().nullable(),
 order:z.string(),orderedOn:z.string().nullable(),deliveredOn:z.string().nullable(),supplierRef:z.string()});
export const globalTrackerSchema=z.object({items:z.array(globalRowSchema),total:z.number().int(),truncated:z.boolean()});
export type GlobalRow=z.infer<typeof globalRowSchema>;
/** Budget bar: percent used (0-100, capped) and whether the approved total exceeds the budget. */
export function budgetUse(budgetCents:number|null,approvedCents:number){if(!budgetCents)return {percent:0,over:false};return {percent:Math.min(100,Math.round(approvedCents*100/budgetCents)),over:approvedCents>budgetCents};}
