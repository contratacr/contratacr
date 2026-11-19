import {createAdminClient} from '@/lib/supabase/admin';
import {projectHubQuerySchema} from '@/lib/pro/project-details';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Projects hub v2 for GET /api/pro/projects?v=2 (development only): v1 rows plus colour,
 * code, type and tags, with type/tag filters. Requests without `v` keep using
 * pro_projects_page (v1) unchanged; outside development this answers 404 and the hub
 * falls back to v1.
 */
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
export async function projectsHubV2(db:ReturnType<typeof createAdminClient>,actor:string,params:Record<string,string>){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const query=projectHubQuerySchema.safeParse(params);if(!query.success)return Response.json({error:'Consulta inválida.'},{status:400,headers});
 const result=await db.rpc('pro_projects_page_v2',{p_actor:actor,p_status:query.data.status,p_search:query.data.q,p_after:query.data.after??null,p_type:query.data.type??null,p_tag:query.data.tag??null});
 if(result.error)return Response.json({error:'No se pudieron cargar los proyectos.'},{status:result.error.code==='42501'?403:result.error.code==='22023'?400:503,headers});
 return Response.json(result.data,{headers});
}
