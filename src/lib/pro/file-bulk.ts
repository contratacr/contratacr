import {z} from 'zod';
/**
 * Ronda F2-E (row 29): bulk file operations (1 to 50 files) and the explicit purge of what expired.
 * Contracts shared by the routes (/api/pro/work-file-bulk, /api/pro/company-file-bulk, /api/pro/file-purge),
 * the screens and the specs. The SQL (migration 414) wraps the existing writers item by item.
 */
export const BULK_MAX=50;
const id=z.string().uuid(),item=z.object({fileId:id,revision:z.number().int().min(0).max(2147483647)}).strict(),items=z.array(item).min(1).max(BULK_MAX);
export const workBulkInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.enum(['trash','restore','purge']),batchId:id,workId:z.string().min(1).max(160),items}).strict(),
 z.object({action:z.literal('move'),batchId:id,workId:z.string().min(1).max(160),folderId:id.nullable(),items}).strict(),
 z.object({action:z.literal('favorite'),batchId:id,workId:z.string().min(1).max(160),on:z.boolean(),items}).strict(),
]);
export const companyBulkInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.enum(['archive','restore','purge']),batchId:id,items}).strict(),
 z.object({action:z.literal('move'),batchId:id,folderId:id.nullable(),items}).strict(),
 z.object({action:z.literal('favorite'),batchId:id,on:z.boolean(),items}).strict(),
 z.object({action:z.enum(['tags_add','tags_remove']),batchId:id,tags:z.array(z.string().trim().toLowerCase().min(1).max(30).refine(v=>!/[\u0000-\u001f\u007f/\\,]/u.test(v))).min(1).max(6),items}).strict(),
]);
export const bulkItemErrorSchema=z.enum(['conflict','forbidden','in_use','invalid','error']);
export type BulkItemError=z.infer<typeof bulkItemErrorSchema>;
export const bulkResultSchema=z.object({action:z.string(),ok:z.number().int().nonnegative(),failed:z.number().int().nonnegative(),
 items:z.array(z.object({fileId:z.string(),ok:z.boolean(),replayed:z.boolean().optional(),error:bulkItemErrorSchema.nullish()}).passthrough())}).passthrough();
export type BulkResult=z.infer<typeof bulkResultSchema>;
export const purgeReceiptSchema=z.object({id:id,scope:z.enum(['company','work']),workId:z.string().nullable(),mode:z.enum(['file','entry','expired']),purgedFiles:z.number().int(),purgedFolders:z.number().int(),keptFiles:z.number().int(),bytesFreed:z.number(),
 items:z.array(z.object({name:z.string(),sizeBytes:z.number(),sha256:z.string()}).passthrough()),at:z.string()}).passthrough();
export type PurgeReceipt=z.infer<typeof purgeReceiptSchema>;
export const purgePreviewSchema=z.object({scope:z.enum(['company','work']),workId:z.string().nullable(),expiredFiles:z.number().int(),deletableFiles:z.number().int(),keptFiles:z.number().int(),bytes:z.number(),expiredFolders:z.number().int(),today:z.string()}).passthrough();
export const purgeStateSchema=z.object({preview:purgePreviewSchema,receipts:z.array(purgeReceiptSchema)});
export const purgeQuerySchema=z.object({scope:z.enum(['company','work']),workId:z.string().min(1).max(160).optional()}).strict().refine(v=>v.scope==='company'?v.workId===undefined:v.workId!==undefined);
export const purgeInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('purge_expired'),scope:z.literal('work'),actionId:id,workId:z.string().min(1).max(160),confirm:z.literal(true)}).strict(),
 z.object({action:z.literal('purge_expired'),scope:z.literal('company'),actionId:id,confirm:z.literal(true)}).strict(),
 z.object({action:z.literal('purge_entry'),scope:z.literal('company'),actionId:id,trashId:id}).strict(),
]);
export const purgeResultSchema=z.object({receipt:purgeReceiptSchema,replayed:z.boolean().optional()}).passthrough();
/** Folders of a file list that the same user can pick as destination are plain ids; the item error text lives in the UI. */
export function bulkErrorText(error:BulkItemError|null|undefined,en:boolean){
 switch(error){
  case 'conflict':return en?'It changed in another tab.':'Cambió en otra pestaña.';
  case 'in_use':return en?'It is used elsewhere (copies, versions, comments or proposals); it was kept.':'Se usa en otra parte (copias, versiones, comentarios o propuestas); se conservó.';
  case 'forbidden':return en?'Not available.':'No disponible.';
  case 'invalid':return en?'Not allowed for this file.':'No se permite para este archivo.';
  default:return en?'Could not complete it.':'No se pudo completar.';
 }
}
