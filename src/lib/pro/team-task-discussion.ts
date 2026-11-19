import {z} from 'zod';
import {teamCommentSchema,teamSharedGrantSchema,teamSharedTaskSchema} from './team';
import {workFileNameSchema,canonicalWorkFileName,WORK_FILE_MAX_BYTES} from './work-files';
export {canonicalWorkFileName as canonicalTeamTaskFileName,WORK_FILE_MAX_BYTES as TEAM_TASK_FILE_MAX_BYTES} from './work-files';
import {teamTaskMentionInputSchema,teamTaskMentionSnapshotSchema} from './team-task-mentions';
import {PRO_FILE_MAX_BYTES} from './file-limit';
const id=z.string().uuid();
export const teamTaskCommentSchema=teamCommentSchema.extend({mentions:z.array(teamTaskMentionSnapshotSchema).max(5).default([])});
export type TeamTaskComment=z.infer<typeof teamTaskCommentSchema>;
export const teamTaskFileSchema=z.object({id,taskId:id,name:workFileNameSchema,mimeType:z.enum(['image/jpeg','application/pdf']),sizeBytes:z.number().int().positive().max(WORK_FILE_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/),ready:z.boolean(),actorId:id,actorName:z.string().max(160),createdAt:z.string().datetime({offset:true}),
 /* Round 11: shown name and trash flag (the stored file and its download name never change). */
 displayName:z.string().min(1).max(160).optional(),trashed:z.boolean().optional(),metaRevision:z.number().int().min(0).optional()}).strict().refine(v=>(v.mimeType!=='image/jpeg'||v.sizeBytes<=PRO_FILE_MAX_BYTES)&&canonicalWorkFileName(v.name,v.mimeType)===v.name);
export type TeamTaskFile=z.infer<typeof teamTaskFileSchema>;
export const teamTaskDiscussionMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('comment'),actionId:id,grantId:id,taskId:id,text:z.string().trim().min(1).max(1000),mentions:z.array(teamTaskMentionInputSchema).max(5).refine(items=>new Set(items.map(v=>v.userId)).size===items.length).optional()}).strict(),
 z.object({action:z.literal('upload'),fileId:id,grantId:id,taskId:id,name:workFileNameSchema,data:z.string().min(4).max(4*Math.ceil(WORK_FILE_MAX_BYTES/3))}).strict(),
]);
export type TeamTaskDiscussionMutation=z.infer<typeof teamTaskDiscussionMutationSchema>;
/** Round 11: rename / trash / restore a task file (outside the upload-and-comment recovery journal). */
export const teamTaskFileManageSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('file_rename'),actionId:id,grantId:id,taskId:id,fileId:id,revision:z.number().int().min(0),name:z.string().trim().min(1).max(160).refine(v=>!/[\u0000-\u001f\u007f]/.test(v))}).strict(),
 z.object({action:z.enum(['file_trash','file_restore']),actionId:id,grantId:id,taskId:id,fileId:id,revision:z.number().int().min(0)}).strict(),
]);
const page={grant:teamSharedGrantSchema,task:teamSharedTaskSchema,nextCursor:id.nullable()};
export const teamTaskCommentsPageSchema=z.object({...page,items:z.array(teamTaskCommentSchema).max(20)}).strict();
export const teamTaskFilesPageSchema=z.object({...page,items:z.array(teamTaskFileSchema).max(20)}).strict();
export const teamTaskCommentResultSchema=z.object({comment:teamTaskCommentSchema}).strict();
export const teamTaskFileResultSchema=z.object({file:teamTaskFileSchema}).strict();
export const teamTaskFileManageResultSchema=z.object({action:z.enum(['file_rename','file_trash','file_restore']),file:teamTaskFileSchema,replayed:z.boolean().optional()}).strict();
export type TeamTaskCommentsPage=z.infer<typeof teamTaskCommentsPageSchema>;
export type TeamTaskFilesPage=z.infer<typeof teamTaskFilesPageSchema>;
