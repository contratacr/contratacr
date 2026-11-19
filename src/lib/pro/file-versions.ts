import {z} from 'zod';
import {workFileSchema} from './work-files';
/** «Versiones y comentarios por documento» (fila 30). Contract of docs/pro/sql/file-versions-local.sql. */
export const FILE_COMMENT_MAX=2000,FILE_VERSION_NOTE_MAX=500;
const uuid=z.string().uuid(),workId=z.string().trim().min(1).max(160),stamp=z.string().datetime({offset:true}),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const revision=z.number().int().min(0).max(2147483646),versionNo=z.number().int().min(1).max(100);
const body=z.string().max(FILE_COMMENT_MAX*2).refine(value=>{const text=value.trim();return text.length>=1&&text.length<=FILE_COMMENT_MAX;},'Comentario inválido.');
const note=z.string().max(FILE_VERSION_NOTE_MAX*2).nullable().refine(value=>value===null||value.trim().length<=FILE_VERSION_NOTE_MAX,'Nota inválida.');
// Owner actions.
export const fileVersionAddSchema=z.object({action:z.literal('add_version'),actionId:uuid,workId,fileId:uuid,newFileId:uuid,note,revision}).strict();
export const fileVersionRestoreSchema=z.object({action:z.literal('restore'),actionId:uuid,workId,fileId:uuid,versionNo,note,revision}).strict();
export const fileCommentCreateSchema=z.object({action:z.literal('comment_create'),actionId:uuid,workId,fileId:uuid,commentId:uuid,thread:z.enum(['team','client']),versionNo:versionNo.nullable(),body}).strict()
 .refine(value=>value.thread==='team'||value.versionNo!==null,'Customer comments refer to a shared version.');
export const fileCommentEditSchema=z.object({action:z.literal('comment_edit'),actionId:uuid,workId,commentId:uuid,body,revision:revision.min(1)}).strict();
export const fileCommentArchiveSchema=z.object({action:z.enum(['comment_archive','comment_restore']),actionId:uuid,workId,commentId:uuid,revision:revision.min(1)}).strict();
// Customer actions (linked customer of requestId, on a version shared with them).
export const clientFileCommentCreateSchema=z.object({action:z.literal('create'),actionId:uuid,requestId:uuid,fileId:uuid,commentId:uuid,body}).strict();
export const clientFileCommentEditSchema=z.object({action:z.literal('edit'),actionId:uuid,requestId:uuid,commentId:uuid,body,revision:revision.min(1)}).strict();
export const clientFileCommentArchiveSchema=z.object({action:z.literal('archive'),actionId:uuid,requestId:uuid,commentId:uuid,revision:revision.min(1)}).strict();
export const fileVersionOwnerMutationSchema=z.union([fileVersionAddSchema,fileVersionRestoreSchema,fileCommentCreateSchema,fileCommentEditSchema,fileCommentArchiveSchema]);
export const fileVersionClientMutationSchema=z.union([clientFileCommentCreateSchema,clientFileCommentEditSchema,clientFileCommentArchiveSchema]);
export const fileVersionMutationSchema=z.union([fileVersionOwnerMutationSchema,fileVersionClientMutationSchema]);
export type FileVersionOwnerMutation=z.infer<typeof fileVersionOwnerMutationSchema>;
export type FileVersionClientMutation=z.infer<typeof fileVersionClientMutationSchema>;
// Reads.
export const fileVersionSchema=z.object({versionNo,fileId:uuid,kind:z.enum(['original','upload','restore']),restoredFrom:versionNo.nullable(),note:z.string().min(1).max(FILE_VERSION_NOTE_MAX).nullable(),
 createdAt:stamp,dayCr:day,shared:z.boolean(),file:workFileSchema}).strict()
 .refine(value=>(value.kind==='restore')===(value.restoredFrom!==null)&&value.file.id===value.fileId&&value.shared===(value.file.revision===2),'Invalid version.');
export type FileVersion=z.infer<typeof fileVersionSchema>;
const counts=z.object({team:z.number().int().min(0),client:z.number().int().min(0),teamArchived:z.number().int().min(0),clientArchived:z.number().int().min(0)}).strict();
export const fileFamilySchema=z.object({familyId:uuid,workId,revision,currentVersionNo:versionNo,currentFileId:uuid,versionCount:versionNo,versions:z.array(fileVersionSchema).min(1).max(100),counts,
 canShare:z.boolean(),recipientId:uuid.nullable(),recipientName:z.string().trim().min(1).max(160).nullable()}).strict()
 .refine(value=>value.versions.length===value.versionCount&&value.versions[0]?.versionNo===value.versionCount&&value.versions.some(version=>version.versionNo===value.currentVersionNo&&version.fileId===value.currentFileId)
  &&(!value.canShare||value.recipientId!==null&&value.recipientName!==null),'Invalid version list.');
export type FileFamily=z.infer<typeof fileFamilySchema>;
export const fileCommentSchema=z.object({id:uuid,familyId:uuid,thread:z.enum(['team','client']),versionNo:versionNo.nullable(),authorKind:z.enum(['owner','client']),authorName:z.string().max(160),
 body:z.string().min(1).max(FILE_COMMENT_MAX),revision:z.number().int().min(1),edited:z.boolean(),editedAt:stamp.nullable(),archived:z.boolean(),archivedAt:stamp.nullable(),createdAt:stamp,dayCr:day}).strict();
export type FileComment=z.infer<typeof fileCommentSchema>;
export const fileCommentPageSchema=z.object({familyId:uuid,thread:z.enum(['team','client']),archived:z.boolean(),items:z.array(fileCommentSchema).max(20),nextCursor:uuid.nullable()}).strict();
export type FileCommentPage=z.infer<typeof fileCommentPageSchema>;
const historyEntry=z.object({actionId:uuid,action:z.enum(['create','edit','archive','restore']),at:stamp,dayCr:day,before:fileCommentSchema.nullable(),after:fileCommentSchema}).strict();
export const fileCommentDetailSchema=z.object({comment:fileCommentSchema,history:z.array(historyEntry).max(50)}).strict();
export type FileCommentDetail=z.infer<typeof fileCommentDetailSchema>;
export const fileVersionIndexSchema=z.object({workId,items:z.array(z.object({fileId:uuid,familyId:uuid,versionNo,versionCount:versionNo,currentVersionNo:versionNo,current:z.boolean(),
 teamComments:z.number().int().min(0),clientComments:z.number().int().min(0)}).strict()).max(20)}).strict();
export type FileVersionIndex=z.infer<typeof fileVersionIndexSchema>;
export const fileVersionMutationResultSchema=z.union([z.object({family:fileFamilySchema}).strict(),z.object({comment:fileCommentSchema}).strict()]);
// Customer side.
export const clientFileCommentSchema=z.object({id:uuid,versionNo,mine:z.boolean(),authorName:z.string().max(160),fromTeam:z.boolean(),body:z.string().min(1).max(FILE_COMMENT_MAX),
 revision:z.number().int().min(1),edited:z.boolean(),createdAt:stamp,dayCr:day}).strict();
export type ClientFileComment=z.infer<typeof clientFileCommentSchema>;
export const clientFileDiscussionSchema=z.object({fileId:uuid,versionNo,sharedVersions:z.array(z.object({versionNo,fileId:uuid,name:z.string().min(1).max(160),publishedAt:stamp,dayCr:day}).strict()).max(100),
 items:z.array(clientFileCommentSchema).max(20),nextCursor:uuid.nullable(),canComment:z.boolean()}).strict();
export type ClientFileDiscussion=z.infer<typeof clientFileDiscussionSchema>;
export const clientFileCommentResultSchema=z.object({comment:clientFileCommentSchema.extend({archived:z.boolean()})}).strict();
/** Metadata comparison between two versions (no byte diff: JPEG/PDF only). */
export function compareFileVersions(left:FileVersion,right:FileVersion){
 return{sameName:left.file.name===right.file.name,sameType:left.file.mimeType===right.file.mimeType,sameContent:left.file.sha256===right.file.sha256,
  sizeDelta:right.file.sizeBytes-left.file.sizeBytes,sameShared:left.shared===right.shared};
}
