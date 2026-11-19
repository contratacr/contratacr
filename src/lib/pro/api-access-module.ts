// LOCAL PRO ONLY (multivertical F4). Module gate on top of the Pro access helpers.
// Wraps proApiAccess with the SQL module check. The workspace gate already substituted the owner's
// account for team members (workspace-user.ts), so `access.user.id` is the workspace owner here.
// Authorization is the SQL decision (pro_has_module, same rules as pro_module_require); editions.ts is UI only.
import {proApiAccess} from '@/lib/pro/api-access';
import {isProModule,type ProModule} from '@/lib/pro/editions';
import type {createAdminClient} from '@/lib/supabase/admin';

const noStore={'Cache-Control':'private, no-store'};

export function moduleDisabledResponse(module:ProModule){
 return Response.json({error:'Este módulo no está activo en su edición de Pro.',code:'module_disabled',module},{status:403,headers:noStore});
}

/** proApiAccess + module gate. Usage: `const a=await proModuleAccess(req,'auto_inventory');if('error' in a)return a.error;` */
export async function proModuleAccess(req:Request,module:ProModule,adminOnly=false){
 if(!isProModule(module))throw new Error('Unknown Pro module: '+module);
 const access=await proApiAccess(req,adminOnly);
 if('error' in access)return access;
 const {data,error}=await access.db.rpc('pro_has_module',{p_owner:access.user.id,p_module:module});
 if(error)return {error:Response.json({error:'No se pudo comprobar el módulo. Intente de nuevo.'},{status:503,headers:noStore})};
 if(data!==true)return {error:moduleDisabledResponse(module)};
 return {...access,module};
}

/** Map RPC errors of module-gated routes: 42501 + hint module_disabled → 403 code module_disabled. */
export function proModuleDbFailure(error:{code?:string;hint?:string;details?:string}|null,module?:ProModule){
 if(error?.code==='42501'&&error.hint==='module_disabled')return moduleDisabledResponse((module??error.details) as ProModule);
 if(error?.code==='42501')return Response.json({error:'Sin acceso'},{status:403,headers:noStore});
 if(error?.code==='40001')return Response.json({error:'Los datos cambiaron. Recargue antes de guardar.'},{status:409,headers:noStore});
 return Response.json({error:'No se pudo guardar. Revise la base local de Pro.'},{status:503,headers:noStore});
}

/**
 * Module check for routes that already resolved the effective actor with proActor (service-role db). The SQL
 * decision (pro_has_module) builds on pro_entitled, so a banned/expired account never passes. Fails closed.
 */
export async function proHasModule(db:ReturnType<typeof createAdminClient>,owner:string,module:ProModule):Promise<boolean>{
 if(!isProModule(module))throw new Error('Unknown Pro module: '+module);
 const {data,error}=await db.rpc('pro_has_module',{p_owner:owner,p_module:module});
 return !error&&data===true;
}
