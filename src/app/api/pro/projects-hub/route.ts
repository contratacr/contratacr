import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {hubMutationResultSchema,hubMutationSchema,hubPageSchema,hubQuerySchema} from '@/lib/pro/projects-hub';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Area A: Projects list v3 (multi-status, sort, pin, managers, custom statuses). Owner only. */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req),q=raw?hubQuerySchema.safeParse(raw):null;if(!q?.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_projects_page_v3',{p_actor:a.user.id,p_statuses:q.data.statuses,p_search:q.data.q,p_offset:q.data.after??0,p_type:q.data.type??null,p_tag:q.data.tag??null,p_manager:q.data.manager??null,p_sort:q.data.sort,p_dir:q.data.dir});
  if(r.error)return proDbError(r.error,'Los proyectos cambiaron.');
  return Response.json(hubPageSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar los proyectos. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'projects-hub-'+a.user.id,120,60000);if(limited)return limited;
 let input;try{input=hubMutationSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise los datos del proyecto.');}
 try{
  const r=await a.db.rpc('pro_project_hub_mutate',{p_actor:a.user.id,p_input:input});
  if(r.error){if(r.error.code==='P0002')return proFail(404,'El proyecto o el estado ya no está disponible.');return proDbError(r.error,'Los proyectos cambiaron. Actualice antes de guardar.');}
  return Response.json(hubMutationResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente.');}
}
