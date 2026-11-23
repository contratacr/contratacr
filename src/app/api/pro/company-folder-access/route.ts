import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {folderAccessMineSchema,folderAccessMutationSchema,folderAccessQuerySchema,folderAccessReadSchema,folderAccessResultSchema} from '@/lib/pro/company-folder-access';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 31 (Ronda F2-E): who can open each folder of the company library. Default: only the owner. The owner (never a team
 * member) reads and changes the grants of a folder; a member reads which folders were shared with them (?view=mine).
 * A grant covers subfolders and files, only current members count, and every change is idempotent and audited.
 */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req),parsed=raw?folderAccessQuerySchema.safeParse(raw):null;if(!parsed||!parsed.success)return proFail(400,'Consulta inválida.');
  const member=await proWorkspaceMember();
  if('view' in parsed.data){
   if(!member)return Response.json(folderAccessMineSchema.parse({isMember:false,folders:[]}),{headers});
   const r=await a.db.rpc('pro_company_folder_access_mine',{p_owner:a.user.id,p_member:member.memberId});if(r.error)return proDbError(r.error,'Los permisos cambiaron.');
   return Response.json(folderAccessMineSchema.parse({isMember:true,folders:(r.data as {folders:unknown[]}).folders}),{headers});
  }
  if(member)return proFail(403,'Solo la cuenta principal administra los permisos de carpeta.');
  const r=await a.db.rpc('pro_company_folder_access_read',{p_actor:a.user.id,p_folder:parsed.data.folderId});if(r.error)return proDbError(r.error,'Los permisos cambiaron.');if(!r.data)return proFail(404,'Carpeta no disponible.');
  return Response.json(folderAccessReadSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar los permisos.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  if(await proWorkspaceMember())return proFail(403,'Solo la cuenta principal administra los permisos de carpeta.');
  const limited=await enforceRateLimit(req,'company-folder-access-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=folderAccessMutationSchema.parse(await proBoundedJson(req,2048));}catch{return proFail(400,'Revise el permiso.');}
  const r=await a.db.rpc('pro_company_folder_access_mutate',{p_actor:a.user.id,p_input:input});
  if(r.error)return r.error.code==='42501'?proFail(403,'La carpeta o el integrante no están disponibles.'):proDbError(r.error,'Los permisos cambiaron. Recargue.');
  return Response.json(folderAccessResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente: no se duplicará.');}
}
