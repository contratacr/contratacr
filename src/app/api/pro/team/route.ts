import {createHash} from 'node:crypto';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {teamMutationSchema} from '@/lib/pro/team';
import {PRO_ENABLED} from '@/lib/pro/enabled';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(error.code==='40001'?409:error.code==='42501'?403:error.code==='54000'?429:['22023','23514','23505','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'Los datos cambiaron. Actualice antes de guardar.':'No se pudo completar la operación.');
async function actor(req:Request){
 const user=await safeGetUser(await createClient());if(!user)return{error:fail(401,'Inicie sesión.')};
 const expected=req.headers.get('x-pro-expected-actor');if(expected!==null&&(!z.string().uuid().safeParse(expected).success||expected!==user.id))return{error:fail(403,'La cuenta cambió.')};
 const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled,role').eq('id',user.id).maybeSingle();
 if(profile.error)return{error:fail(503,'No se pudo comprobar el acceso.')};
 if(!profile.data||profile.data.is_disabled||profile.data.role==='admin'&&!await getApiAdmin())return{error:fail(403,'Sin acceso.')};
 return{user,db};
}
const id=z.string().uuid(),work=z.string().min(1).max(160);
const querySchema=z.discriminatedUnion('view',[
 z.object({view:z.literal('owned'),after:work.optional()}).strict(),
 z.object({view:z.literal('owner'),workId:work,kind:z.enum(['invites','members']),after:id.optional()}).strict(),
 z.object({view:z.literal('shared'),after:id.optional()}).strict(),
 z.object({view:z.enum(['tasks','comments']),grantId:id,after:id.optional()}).strict(),
 z.object({view:z.literal('audit'),workId:work,after:id.optional()}).strict(),
 z.object({view:z.literal('action'),actionId:id}).strict(),
]);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await actor(req);if(a.error)return a.error;
  const raw:Record<string,string>={};for(const[key,value]of new URL(req.url).searchParams){if(key in raw)return fail(400,'Consulta inválida.');raw[key]=value;}
  const parsed=querySchema.safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');const q=parsed.data;
  let result;
  if(q.view==='owned')result=await a.db.rpc('pro_team_owned_read',{p_actor:a.user.id,p_after:q.after??null});
  else if(q.view==='owner')result=await a.db.rpc('pro_team_owner_read',{p_actor:a.user.id,p_work:q.workId,p_kind:q.kind,p_after:q.after??null});
  else if(q.view==='shared')result=await a.db.rpc('pro_team_shared_read',{p_actor:a.user.id,p_after:q.after??null});
  else if(q.view==='tasks'||q.view==='comments')result=await a.db.rpc(q.view==='tasks'?'pro_team_tasks_read':'pro_team_comments_read',{p_actor:a.user.id,p_grant:q.grantId,p_after:q.after??null});
  else if(q.view==='audit')result=await a.db.rpc('pro_team_audit_read',{p_actor:a.user.id,p_work:q.workId,p_after:q.after??null});
  else if(q.view==='action')result=await a.db.rpc('pro_team_assignment_action_read',{p_actor:a.user.id,p_action:q.actionId});
  else return fail(400,'Consulta inválida.');
  if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):fail(404,'No disponible.');
 }catch{return fail(503,'No se pudo cargar el equipo.');}
}
async function bounded(req:Request){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error();
 const reader=req.body?.getReader();if(!reader)throw Error();let length=0;const chunks:Uint8Array[]=[];
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>16384){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'team-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=teamMutationSchema.parse(await bounded(req));}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise los datos.');}
  let normalized:Record<string,unknown>=input;
  if('code'in input){const{code,...rest}=input;normalized={...rest,codeHash:createHash('sha256').update(code).digest('hex')};}
  const email=a.user.email_confirmed_at&&a.user.email?a.user.email.trim().toLowerCase():null;
  const result=input.action==='assign'?await a.db.rpc('pro_team_task_assign',{p_actor:a.user.id,p_input:normalized}):await a.db.rpc('pro_team_mutate',{p_actor:a.user.id,p_input:normalized,p_verified_email:email});
  if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
 }catch{return fail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
