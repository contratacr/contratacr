import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {taskCenterJobsQuerySchema,taskCenterQuerySchema,taskCenterPlanningQuerySchema} from '@/lib/pro/task-center';
import {z} from 'zod';
import {PRO_ENABLED} from '@/lib/pro/enabled';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(error.code==='42501'?403:error.code==='22023'?400:503,error.code==='22023'?'La lista cambió. Actualice los resultados.':'No se pudo cargar la lista.');
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const user=await safeGetUser(await createClient());if(!user)return fail(401,'Inicie sesión.');
  const expected=req.headers.get('x-pro-expected-actor');if(expected!==null&&(!z.string().uuid().safeParse(expected).success||expected!==user.id))return fail(403,'La cuenta cambió.');
  const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled,role').eq('id',user.id).maybeSingle();
  if(profile.error)return fail(503,'No se pudo comprobar el acceso.');
  if(!profile.data||profile.data.is_disabled||profile.data.role==='admin'&&!await getApiAdmin())return fail(403,'Sin acceso.');
  const params=new URL(req.url).searchParams,raw:Record<string,string>={};
  for(const [key,value] of params){if(key in raw)return fail(400,'Consulta inválida.');raw[key]=value;}
  if(raw.view==='planning'){
   const query=taskCenterPlanningQuerySchema.safeParse(raw);if(!query.success)return fail(400,'Consulta inválida.');
   // Round 9: same read plus optional job / responsible filters.
   const result=await db.rpc('pro_task_center_filtered_read',{p_actor:user.id,p_status:query.data.status,p_timing:query.data.timing,p_query:query.data.q,p_after:query.data.after??null,p_work:query.data.workId??null,p_assignee:query.data.assignee??null});
   if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
  }
  if(raw.view==='options'){if(Object.keys(raw).length!==1)return fail(400,'Consulta inválida.');const result=await db.rpc('pro_task_center_filter_options',{p_actor:user.id});if(result.error)return dbError(result.error);return Response.json(result.data,{headers});}
  if(params.has('view')){
   const query=taskCenterJobsQuerySchema.safeParse(raw);if(!query.success)return fail(400,'Consulta inválida.');
   const result=await db.rpc('pro_task_center_jobs_read',{p_actor:user.id,p_query:query.data.q,p_after:query.data.after??null});
   if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
  }
  const query=taskCenterQuerySchema.safeParse(raw);if(!query.success)return fail(400,'Consulta inválida.');
  const result=await db.rpc('pro_task_center_read',{p_actor:user.id,p_status:query.data.status,p_timing:query.data.timing,p_query:query.data.q,p_after:query.data.after??null});
  if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
 }catch{return fail(503,'No se pudo cargar la lista. Reintente.');}
}
