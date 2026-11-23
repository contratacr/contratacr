import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import {proFail} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
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

/**
 * Gate for every library route. Owners pass untouched. A team member working in the company needs the folder permission:
 * `ownerOnly` routes (bulk, purge, tags, versions, trash, daily log picks) are closed to members; the others pass only when
 * every folder and the folder of every file reach `level`. Returns the 403 response, or null when allowed.
 */
export async function libraryMemberGuard(db:SupabaseClient,owner:string,opts:{folders?:string[];files?:string[];level?:'view'|'edit';ownerOnly?:boolean}):Promise<Response|null>{
 const member=await proWorkspaceMember();if(!member)return null;
 if(opts.ownerOnly)return proFail(403,'Esta acción de la biblioteca es solo de la cuenta principal.');
 const r=await db.rpc('pro_company_folder_gate',{p_owner:owner,p_member:member.memberId,p_folders:opts.folders??[],p_files:opts.files??[],p_level:opts.level??'view'});
 if(r.error)return proFail(503,'No se pudo comprobar el permiso de la carpeta.');
 return r.data===true?null:proFail(403,'No tiene permiso sobre esta carpeta. Pídale a la cuenta principal que se la comparta.');
}
