import type {SupabaseClient} from '@supabase/supabase-js';
import {proFail} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
export * from '@/lib/pro/company-folder-access-schemas';

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
