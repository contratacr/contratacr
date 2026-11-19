import {z} from 'zod';
import {canonicalWorkFileName,workFileNameSchema,workFileSchema,WORK_FILE_MAX_BYTES} from './work-files';
import {PRO_FILE_MAX_BYTES} from './file-limit';
const id=z.string().uuid(),revision=z.number().int().positive().max(2147483647),inputRevision=z.number().int().nonnegative().max(2147483646),name=z.string().trim().min(1).max(80).refine(value=>!/[\u0000-\u001f\u007f/\\]/u.test(value)&&Array.from(value).every(char=>char.length===2||char.charCodeAt(0)<0xd800||char.charCodeAt(0)>0xdfff)),stamp=z.string().datetime({offset:true});
export const companyFolderSchema=z.object({id,parentId:id.nullable(),name,revision,archived:z.boolean(),favorite:z.boolean()}).strict();
export const companyFileSchema=z.object({id,folderId:id.nullable(),name:workFileNameSchema,mimeType:z.enum(['image/jpeg','application/pdf']),sizeBytes:z.number().int().positive().max(WORK_FILE_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/),revision,ready:z.boolean(),archived:z.boolean(),favorite:z.boolean(),createdAt:stamp}).strict().refine(v=>canonicalWorkFileName(v.name,v.mimeType)===v.name&&(v.mimeType!=='image/jpeg'||v.sizeBytes<=PRO_FILE_MAX_BYTES));
export const companyFileItemSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('folder'),folder:companyFolderSchema}).strict(),z.object({kind:z.literal('file'),file:companyFileSchema}).strict()]);
export const companyFilesPageSchema=z.object({items:z.array(companyFileItemSchema).max(20),nextCursor:z.string().regex(/^(folder|file):[0-9a-f-]{36}$/).nullable(),ancestors:z.array(companyFolderSchema).max(5)}).strict().refine(v=>new Set(v.items.map(i=>i.kind+':'+(i.kind==='file'?i.file.id:i.folder.id))).size===v.items.length&&(v.nextCursor===null||v.items.length>0&&v.nextCursor===v.items.at(-1)!.kind+':'+(v.items.at(-1)!.kind==='file'?(v.items.at(-1)! as {kind:'file';file:z.infer<typeof companyFileSchema>}).file.id:(v.items.at(-1)! as {kind:'folder';folder:z.infer<typeof companyFolderSchema>}).folder.id)));
export const companyFileDetailSchema=z.object({file:companyFileSchema,ancestors:z.array(companyFolderSchema).max(5)}).strict();
const base={actionId:id};
export const companyFileMutationSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('folder_save'),folderId:id,revision:inputRevision,parentId:id.nullable(),name,favorite:z.boolean()}).strict(),
 z.object({...base,action:z.enum(['folder_archive','folder_restore']),folderId:id,revision:inputRevision.refine(v=>v>0)}).strict(),
 z.object({...base,action:z.literal('file_update'),fileId:id,revision:inputRevision.refine(v=>v>0),folderId:id.nullable(),name:workFileNameSchema,favorite:z.boolean()}).strict(),
 z.object({...base,action:z.enum(['file_archive','file_restore']),fileId:id,revision:inputRevision.refine(v=>v>0)}).strict(),
 z.object({...base,action:z.literal('upload'),fileId:id,folderId:id.nullable(),name:workFileNameSchema,data:z.string().min(4).max(4*Math.ceil(WORK_FILE_MAX_BYTES/3))}).strict(),
 z.object({...base,action:z.literal('copy'),fileId:id,revision,workId:z.string().min(1).max(160),targetFileId:id}).strict(),
]);
export const companyFileResultSchema=z.discriminatedUnion('action',[
 z.object({action:z.enum(['folder_save','folder_archive','folder_restore']),folder:companyFolderSchema}).strict(),
 z.object({action:z.enum(['upload','file_update','file_archive','file_restore']),file:companyFileSchema}).strict(),
 z.object({action:z.literal('copy'),copy:z.object({sourceFileId:id,sourceRevision:revision,workId:z.string().min(1).max(160),file:workFileSchema}).strict()}).strict(),
]);
// Upload receipts bind canonical request hashes rather than retaining base64 bytes in SQL.
export const companyFileReceiptSchema=z.object({receipt:z.object({inputHash:z.string().regex(/^[a-f0-9]{64}$/),result:companyFileResultSchema}).strict().nullable()}).strict();
export type CompanyFolder=z.infer<typeof companyFolderSchema>;
export type CompanyFile=z.infer<typeof companyFileSchema>;
export type CompanyFileMutation=z.infer<typeof companyFileMutationSchema>;
export type CompanyFileResult=z.infer<typeof companyFileResultSchema>;
export type CompanyFilesPage=z.infer<typeof companyFilesPageSchema>;
export function canonicalCompanyFileInput(input:CompanyFileMutation):string{
 const sorted=(value:unknown):unknown=>Array.isArray(value)?value.map(sorted):value!==null&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,sorted(item)])):value;
 return JSON.stringify(sorted(companyFileMutationSchema.parse(input)));
}
