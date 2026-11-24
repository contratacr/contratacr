import {z} from 'zod';
import {prefijoDeIdioma} from '@/lib/prefijo-de-idioma';
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
/** Boards grid toolbar (area E row 12): search by room name, sort (custom order or name) and multi-select assignee filter. */
export const boardSorts=['custom','name'] as const;
export type BoardSort=(typeof boardSorts)[number];
/** Sentinel used by the assignee filter for rooms without an assignee. */
export const UNASSIGNED_FILTER='__unassigned__';
export function filterBoards<T extends {id:string;name:string;position:number}>(areas:T[],meta:Map<string,{assignee:string|null}>,opts:{query:string;sort:BoardSort;assignees:ReadonlySet<string>}):T[]{
 const q=opts.query.trim().toLowerCase();
 const kept=areas.filter(a=>{
  if(q&&!a.name.toLowerCase().includes(q))return false;
  if(!opts.assignees.size)return true;
  const who=meta.get(a.id)?.assignee?.trim()||'';
  return who?opts.assignees.has(who):opts.assignees.has(UNASSIGNED_FILTER);
 });
 return opts.sort==='name'?[...kept].sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'})):[...kept].sort((a,b)=>a.position-b.position);
}
/** Team member names that can be assigned: active members of the job, unique, trimmed, sorted. */
export function assigneeNames(members:{displayName:string;active:boolean}[]):string[]{
 return [...new Set(members.filter(m=>m.active).map(m=>m.displayName.trim().slice(0,80)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
}
/** Link to the owner's selections page of a job (to share with teammates who have access), never the customer's. */
export function selectionsDeepLink(origin:string,locale:'es'|'en',workId:string):string{
 return `${origin}${prefijoDeIdioma(locale)}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'selections'}).toString();
}
