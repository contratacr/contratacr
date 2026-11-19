import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {workTaskMutationSchema} from '@/lib/pro/work-tasks';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(error.code==='40001'?409:error.code==='42501'?403:error.code==='54000'?429:['22023','22008','22007','23514','23505','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'La tarea cambió. Actualice antes de guardar.':'No se pudo completar la operación.');
async function actor(req:Request){
 const user=await safeGetUser(await createClient());if(!user)return{error:fail(401,'Inicie sesión.')};
 const expected=req.headers.get('x-pro-expected-actor');if(expected!==null&&(!z.string().uuid().safeParse(expected).success||expected!==user.id))return{error:fail(403,'La cuenta cambió.')};
 const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled,role').eq('id',user.id).maybeSingle();
 if(profile.error)return{error:fail(503,'No se pudo comprobar el acceso.')};
 if(!profile.data||profile.data.is_disabled||profile.data.role==='admin'&&!await getApiAdmin())return{error:fail(403,'Sin acceso.')};
 return{user,db};
}
async function bounded(req:Request){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error();
 const reader=req.body?.getReader();if(!reader)throw Error();const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>16384){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await actor(req);if(a.error)return a.error;
  const q=new URL(req.url).searchParams;
  // Round 4B: options of the task "Responsable" selector (team of this job) and the real assignment of listed tasks.
  if(q.get('view')==='assignees'){
   for(const key of q.keys())if(!['view','workId','tasks'].includes(key)||q.getAll(key).length>1)return fail(400,'Consulta inválida.');
   const workId=z.string().trim().min(1).max(160).parse(q.get('workId')),tasks=z.array(z.string().uuid()).max(20).parse((q.get('tasks')??'').split(',').filter(Boolean));
   const result=await a.db.rpc('pro_work_task_assignees',{p_actor:a.user.id,p_work:workId,p_tasks:tasks});
   if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):fail(404,'Trabajo no disponible.');
  }
  for(const key of q.keys())if(!['workId','taskId','status','after','archived'].includes(key))return fail(400,'Consulta inválida.');
  const workId=z.string().trim().min(1).max(160).parse(q.get('workId')),taskId=q.has('taskId')?z.string().uuid().parse(q.get('taskId')):null;
  const status=z.enum(['open','done','all']).parse(q.get('status')??'open'),after=q.has('after')?z.string().uuid().parse(q.get('after')):null;
  if(q.has('archived')&&q.get('archived')!=='1')return fail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_work_tasks_read',{p_actor:a.user.id,p_work:workId,p_status:status,p_after:after,p_archived:q.get('archived')==='1',p_task:taskId});
  if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):fail(404,'Trabajo o tarea no disponible.');
 }catch{return fail(400,'Consulta inválida.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'work-tasks-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=workTaskMutationSchema.parse(await bounded(req));}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise la tarea.');}
  const result=await a.db.rpc('pro_work_tasks_mutate',{p_actor:a.user.id,p_input:input});
  // The punch-list trigger refuses completing an item whose required photo is missing: tell the caller exactly that.
  if(result.error?.code==='22023'&&result.error.message==='Photo required before completing')return Response.json({error:'Agregue una foto antes de completar este pendiente.',code:'photo_required'},{status:400,headers});
  if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
 }catch{return fail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
