import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {taskTemplateMutationSchema} from '@/lib/pro/task-templates';
import {PRO_ENABLED} from '@/lib/pro/enabled';
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
const id=z.string().uuid(),workId=z.string().min(1).max(160);
const civil=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v&&v>='1900-01-01'&&v<='2100-12-31';});
const querySchema=z.discriminatedUnion('view',[
 z.object({view:z.literal('list'),status:z.enum(['active','archived']).default('active'),q:z.string().trim().max(100).default(''),after:id.optional()}).strict(),
 z.object({view:z.literal('detail'),templateId:id}).strict(),
 z.object({view:z.literal('preview'),templateId:id,workId,startDate:civil.optional()}).strict(),
 z.object({view:z.literal('action'),actionId:id}).strict(),
]);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await actor(req);if(a.error)return a.error;
  const raw:Record<string,string>={};for(const[key,value]of new URL(req.url).searchParams){if(key in raw)return fail(400,'Consulta inválida.');raw[key]=value;}
  const parsed=querySchema.safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');const q=parsed.data;let result;
  if(q.view==='list')result=await a.db.rpc('pro_task_templates_read',{p_actor:a.user.id,p_status:q.status,p_query:q.q,p_after:q.after??null,p_template:null});
  else if(q.view==='detail')result=await a.db.rpc('pro_task_templates_read',{p_actor:a.user.id,p_status:'active',p_query:'',p_after:null,p_template:q.templateId});
  else if(q.view==='preview')result=await a.db.rpc('pro_task_template_preview',{p_actor:a.user.id,p_template:q.templateId,p_work:q.workId,p_start:q.startDate??null});
  else result=await a.db.rpc('pro_task_template_action_read',{p_actor:a.user.id,p_action:q.actionId});
  if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):fail(404,'Plantilla no disponible.');
 }catch{return fail(503,'No se pudieron cargar las plantillas.');}
}
async function bounded(req:Request){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error();
 const reader=req.body?.getReader();if(!reader)throw Error();let length=0;const chunks:Uint8Array[]=[];
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>2*1024*1024){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'task-templates-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=taskTemplateMutationSchema.parse(await bounded(req));}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise la plantilla.');}
  const result=await a.db.rpc(input.action==='append'||input.action==='tags'?'pro_task_template_extend':'pro_task_templates_mutate',{p_actor:a.user.id,p_input:input});if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
 }catch{return fail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
