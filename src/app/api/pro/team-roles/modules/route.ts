import {cookies} from 'next/headers';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_WS_COOKIE} from '@/lib/pro/workspace-gate';
import {modulePermissionsMutationSchema,modulePermissionsResultSchema,modulePermissionsSchema} from '@/lib/pro/module-permissions';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 17 (404): module x action permission matrix. Denials only (view, edit, delete, export per module) for each
 * role or custom role; the Administrator is never restricted. Like /api/pro/team-roles it always runs as the signed-in account (outside the gate
 * substitution): the owner manages its own company, an Administrator member the company in the cookie.
 * SQL re-checks team.manage for every write (pro_role_require) and the gate enforces the result.
 */
async function session(req:Request){
 const user=await safeGetUser(await createClient());if(!user)return{error:proFail(401,'Inicie sesión.')} as const;
 const expected=req.headers.get('x-pro-expected-actor');if(expected!==null&&expected!==user.id)return{error:proFail(403,'La cuenta cambió.')} as const;
 const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled').eq('id',user.id).maybeSingle();
 if(profile.error)return{error:proFail(503,'No se pudo comprobar el acceso.')} as const;
 if(!profile.data||profile.data.is_disabled)return{error:proFail(403,'Sin acceso.')} as const;
 const owner=(await cookies()).get(PRO_WS_COOKIE)?.value;let company=user.id;
 if(owner&&owner!==user.id){const r=await db.rpc('pro_team_workspace_resolve',{p_member:user.id,p_owner:owner});if(!r.error&&r.data)company=owner;}
 return{user,db,company,error:null} as const;
}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const raw=proQuery(req);if(!raw||Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const a=await session(req);if(a.error)return a.error;
  const r=await a.db.rpc('pro_module_permissions_read',{p_actor:a.user.id,p_owner:a.company});if(r.error)return proDbError(r.error,'Los permisos cambiaron.');
  return Response.json(modulePermissionsSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar los permisos.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await session(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'team-module-perms-'+a.user.id,40,60000);if(limited)return limited;
  let input;try{input=modulePermissionsMutationSchema.parse(await proBoundedJson(req,16384));}catch{return proFail(400,'Revise los permisos.');}
  const r=await a.db.rpc('pro_module_permissions_mutate',{p_actor:a.user.id,p_owner:a.company,p_input:input});
  if(r.error)return r.error.code==='42501'?proFail(403,'Solo un Administrador puede cambiar los permisos.'):r.error.code==='23505'?proFail(409,'Permiso duplicado.'):proDbError(r.error,'Los permisos cambiaron. Recargue.');
  return Response.json(modulePermissionsResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente: no se duplicará.');}
}
