import {z} from 'zod';
import {PRO_FILE_MAX_BYTES} from './file-limit';
import {PRO_DOC_MIMES,proDocExtension,type ProDocMime} from './file-formats';
const workId=z.string().trim().min(1).max(160),stamp=z.string().datetime({offset:true});
export const WORK_FILE_MAX_BYTES=PRO_FILE_MAX_BYTES;
export const workFileNameSchema=z.string().trim().min(1).max(160).refine(value=>!/[\u0000-\u001f\u007f/\\]/u.test(value)&&Array.from(value).every(char=>char.length===2||char.charCodeAt(0)<0xd800||char.charCodeAt(0)>0xdfff),'Nombre inválido.');
/** Ronda F2-D: the extension follows the stored format (file-formats.ts); JPG and PDF names are unchanged. */
export function canonicalWorkFileName(source:string,mimeType:ProDocMime){
 const original=workFileNameSchema.parse(source).normalize('NFC'),extension=proDocExtension(mimeType);
 let stem=original.replace(/\.[^.]*$/u,'').replace(/[. ]+$/u,'')||'archivo';
 while(stem.length>160-extension.length)stem=Array.from(stem).slice(0,-1).join('');
 return stem+extension;
}
export const workFileUploadSchema=z.object({action:z.literal('upload'),workId,fileId:z.string().uuid(),name:workFileNameSchema,data:z.string().min(4).max(4*Math.ceil(WORK_FILE_MAX_BYTES/3))}).strict();
export const workFilePublishSchema=z.object({action:z.literal('publish'),workId,fileId:z.string().uuid(),actionId:z.string().uuid(),revision:z.literal(1),recipientId:z.string().uuid()}).strict();
export const workFileMutationSchema=z.discriminatedUnion('action',[workFileUploadSchema,workFilePublishSchema]);
export type WorkFileMutation=z.infer<typeof workFileMutationSchema>;
const common={id:z.string().uuid(),name:workFileNameSchema,mimeType:z.enum(PRO_DOC_MIMES),sizeBytes:z.number().int().positive().max(WORK_FILE_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)};
export const workFileSchema=z.object({...common,workId,revision:z.union([z.literal(1),z.literal(2)]),ready:z.boolean(),createdAt:stamp,publishedAt:stamp.nullable()}).strict().superRefine((value,context)=>{
 if(value.mimeType==='image/jpeg'&&value.sizeBytes>PRO_FILE_MAX_BYTES||value.revision===2&&(!value.ready||value.publishedAt===null)||value.revision===1&&value.publishedAt!==null||canonicalWorkFileName(value.name,value.mimeType)!==value.name)context.addIssue({code:'custom',message:'Invalid file metadata.'});
});
export type WorkFile=z.infer<typeof workFileSchema>;
const sharing={canShare:z.boolean(),recipientId:z.string().uuid().nullable(),recipientName:z.string().trim().min(1).max(160).nullable()};
export const workFilesPageSchema=z.object({workId,items:z.array(workFileSchema).max(20),nextCursor:z.string().uuid().nullable(),...sharing}).strict().refine(value=>!value.canShare||value.recipientId!==null&&value.recipientName!==null,'Missing file recipient.');
export const workFileDetailSchema=z.object({file:workFileSchema,...sharing}).strict().refine(value=>!value.canShare||value.recipientId!==null&&value.recipientName!==null,'Missing file recipient.');
export const sharedWorkFileSchema=z.object({...common,publishedAt:stamp,service:z.string().min(1).max(160)}).strict().refine(value=>value.mimeType!=='image/jpeg'||value.sizeBytes<=PRO_FILE_MAX_BYTES,'Invalid image size.');
export const appointmentFilesPageSchema=z.object({items:z.array(sharedWorkFileSchema).max(20),nextCursor:z.string().uuid().nullable()}).strict();
export const workFileMetadataSchema=workFileDetailSchema;
export const sharedWorkFilesPageSchema=appointmentFilesPageSchema;
export type WorkFilesPage=z.infer<typeof workFilesPageSchema>;
export type WorkFileDetail=z.infer<typeof workFileDetailSchema>;
export type AppointmentFilesPage=z.infer<typeof appointmentFilesPageSchema>;
export type SharedWorkFile=z.infer<typeof sharedWorkFileSchema>;
/** Round 2: PNG/WebP photos are stored as JPG. Tell the owner the saved name before uploading. */
export function storedPhotoNotice(file:{name:string;type:string}|null,en:boolean){
 if(!file||!/^image\/(png|webp)$/.test(file.type))return null;
 let name:string;try{name=canonicalWorkFileName(file.name,'image/jpeg');}catch{return null;}
 return en?`PNG and WebP photos are saved as JPG: it will be stored as "${name}".`:`Las fotos PNG y WebP se guardan como JPG: quedará como "${name}".`;
}
/** Ronda F2-D (row 33): folders shared with the linked customer (direct files only). */
export const sharedFolderFileSchema=z.object({id:z.string().uuid(),name:workFileNameSchema,mimeType:z.enum(PRO_DOC_MIMES),sizeBytes:z.number().int().positive().max(WORK_FILE_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/),createdAt:stamp}).strict();
export const sharedFoldersSchema=z.object({folders:z.array(z.object({id:z.string().uuid(),name:z.string().min(1).max(80),files:z.array(sharedFolderFileSchema).max(500)}).strict()).max(200)}).strict();
export type SharedFolderFile=z.infer<typeof sharedFolderFileSchema>;
