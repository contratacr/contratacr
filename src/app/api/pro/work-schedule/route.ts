import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {workScheduleMutationSchema,workTimelineTaskCreateSchema} from '@/lib/pro/work-schedule';
import {workTimelineQuerySchema} from '@/lib/pro/work-timeline';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(error.code==='40001'?409:error.code==='42501'?403:error.code==='54000'?429:['22023','22007','22008','23514','23505','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'Los datos cambiaron. Actualice antes de guardar.':'No se pudo completar la operación.');
async function actor(req:Request){
 const user=await safeGetUser(await createClient());if(!user)return{error:fail(401,'Inicie sesión.')};
 const expected=req.headers.get('x-pro-expected-actor');if(expected!==null&&(!z.string().uuid().safeParse(expected).success||expected!==user.id))return{error:fail(403,'La cuenta cambió.')};
 const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled,role').eq('id',user.id).maybeSingle();
 if(profile.error)return{error:fail(503,'No se pudo comprobar el acceso.')};
 if(!profile.data||profile.data.is_disabled||profile.data.role==='admin'&&!await getApiAdmin())return{error:fail(403,'Sin acceso.')};
 return{user,db};
}
const id=z.string().uuid(),work=z.string().min(1).max(160);
const querySchema=z.union([
 z.object({workId:work,after:id.optional()}).strict(),
 z.object({grantId:id,after:id.optional()}).strict(),
 z.object({view:z.literal('options'),workId:work,q:z.string().max(100).default(''),after:id.optional()}).strict(),
 z.object({view:z.literal('options'),grantId:id,q:z.string().max(100).default(''),after:id.optional()}).strict(),
 z.object({view:z.literal('action'),workId:work,actionId:id}).strict(),
 z.object({view:z.literal('milestones'),workId:work,status:z.enum(['active','archived']).default('active'),after:id.optional()}).strict(),
 z.object({view:z.literal('milestones'),grantId:id,status:z.enum(['active','archived']).default('active'),after:id.optional()}).strict(),
]);
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await actor(req);if(a.error)return a.error;
  const raw:Record<string,string>={};for(const[key,value]of new URL(req.url).searchParams){if(key in raw)return fail(400,'Consulta inválida.');raw[key]=value;}
  if(raw.view==='timeline'){
   const parsed=workTimelineQuerySchema.safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');const q=parsed.data;
   const result=await a.db.rpc('pro_work_timeline_read',{p_actor:a.user.id,p_work:q.workId??null,p_grant:q.grantId??null,p_from:q.from,p_to:q.to,p_after:q.after??null,p_revision:q.atRevision??null,p_snapshot:q.atSnapshot??null});
   if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):fail(404,'Cronograma no disponible.');
  }
  const parsed=querySchema.safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');const q=parsed.data;
  if('view'in q&&q.view==='action'){
   const result=await a.db.rpc('pro_work_schedule_action_v2_read',{p_actor:a.user.id,p_work:q.workId,p_action:q.actionId});if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):fail(404,'Plan no disponible.');
  }
  if('view'in q&&q.view==='milestones'){
   const result=await a.db.rpc('pro_work_milestones_read',{p_actor:a.user.id,p_work:'workId'in q?q.workId:null,p_grant:'grantId'in q?q.grantId:null,p_status:q.status,p_after:q.after??null});if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):fail(404,'Plan no disponible.');
  }
  const result=await a.db.rpc('pro_work_schedule_read',{p_actor:a.user.id,p_work:'workId'in q?q.workId:null,p_grant:'grantId'in q?q.grantId:null,p_after:'after'in q?q.after??null:null,p_options:'view'in q&&q.view==='options',p_query:'q'in q?q.q:''});
  if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):fail(404,'Plan no disponible.');
 }catch{return fail(503,'No se pudo cargar el plan.');}
}
async function bounded(req:Request){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error();
 const reader=req.body?.getReader();if(!reader)throw Error();let length=0;const chunks:Uint8Array[]=[];
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>8192){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'work-schedule-'+a.user.id,60,60000);if(limited)return limited;
  let body:unknown;try{body=await bounded(req);}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise el plan.');}
  if(body&&typeof body==='object'&&(body as {action?:unknown}).action==='timeline_task_create'){
   const created=workTimelineTaskCreateSchema.safeParse(body);if(!created.success)return fail(400,'Revise la tarea y sus fechas.');
   const result=await a.db.rpc('pro_work_timeline_task_create',{p_actor:a.user.id,p_input:created.data});if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
  }
  let input;try{input=workScheduleMutationSchema.parse(body);}catch{return fail(400,'Revise el plan.');}
  const result=await a.db.rpc(input.action.startsWith('milestone_')?'pro_work_milestones_mutate':'pro_work_schedule_mutate',{p_actor:a.user.id,p_input:input});if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
 }catch{return fail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
