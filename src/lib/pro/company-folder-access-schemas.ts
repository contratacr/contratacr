import {z} from 'zod';
/**
 * Row 31 (Ronda F2-E): permissions per folder of the company library for current team members. Default: only the owner.
 * A grant ("view" or "edit") on a folder covers its subfolders and files; the root is never open to members. Contracts
 * shared by /api/pro/company-folder-access, the library screen and the specs; the SQL is migration 416.
 */
const id=z.string().uuid();
export const folderAccessLevelSchema=z.enum(['view','edit']);
export const folderAccessReadSchema=z.object({folder:z.object({id,name:z.string()}).strict(),members:z.array(z.object({userId:id,name:z.string(),role:z.string(),level:folderAccessLevelSchema.nullable(),effective:folderAccessLevelSchema.nullable()}).strict()).max(200)}).strict();
export type FolderAccessRead=z.infer<typeof folderAccessReadSchema>;
export const folderAccessMineSchema=z.object({isMember:z.boolean(),folders:z.array(z.object({id,name:z.string(),level:folderAccessLevelSchema,archived:z.boolean()}).strict()).max(500)}).strict();
export const folderAccessMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('grant'),actionId:id,folderId:id,memberUserId:id,level:folderAccessLevelSchema}).strict(),
 z.object({action:z.literal('revoke'),actionId:id,folderId:id,memberUserId:id}).strict(),
]);
export const folderAccessResultSchema=z.object({replayed:z.boolean(),access:folderAccessReadSchema}).strict();
export const folderAccessQuerySchema=z.union([z.object({view:z.literal('mine')}).strict(),z.object({folderId:id}).strict()]);
