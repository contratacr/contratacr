import {z} from 'zod';
import {proApiAccess} from '@/lib/pro/api-access';
import {projectQuerySchema} from '@/lib/pro/projects';
import {projectsHubV2} from '@/lib/pro/project-hub-v2';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
export async function GET(req:Request){
 const a=await proApiAccess(req);if(a.error)return a.error;
 // A tab opened with another account must not receive this account's projects.
 const expected=req.headers.get('x-pro-expected-actor');
 if(expected!==null&&(!z.string().uuid().safeParse(expected).success||expected!==a.user.id))return Response.json({error:'La cuenta cambió.'},{status:403,headers});
 const params:Record<string,string>={};
 for(const [key,value] of new URL(req.url).searchParams){if(key in params)return Response.json({error:'Consulta inválida.'},{status:400,headers});params[key]=value;}
 // Hub v2 (colour, type, code, tags): only when asked for explicitly.
 if('v' in params){try{return await projectsHubV2(a.db,a.user.id,params);}catch{return Response.json({error:'No se pudieron cargar los proyectos. Reintente.'},{status:503,headers});}}
 const query=projectQuerySchema.safeParse(params);if(!query.success)return Response.json({error:'Consulta inválida.'},{status:400,headers});
 try{
  const result=await a.db.rpc('pro_projects_page',{p_actor:a.user.id,p_status:query.data.status,p_search:query.data.q,p_after:query.data.after??null});
  if(result.error)return Response.json({error:'No se pudieron cargar los proyectos.'},{status:result.error.code==='42501'?403:result.error.code==='22023'?400:503,headers});
  return Response.json(result.data,{headers});
 }catch{return Response.json({error:'No se pudieron cargar los proyectos. Reintente.'},{status:503,headers});}
}
