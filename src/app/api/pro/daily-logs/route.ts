import {proCustomerReader} from '@/lib/pro/route-common';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {taskDueDate} from '@/lib/pro/work-tasks';
import {dailyLogMutationSchema,dailyLogResultSchema,dailyLogReceiptSchema,dailyLogsPageSchema,dailyLogDetailSchema,dailyLogPreviewSchema,dailyLogSnapshotSchema,dailyLogOptionsPageSchema,dailyLogDefaultsSchema,dailyLogSharedPageSchema,dailyLogAudiencePageSchema} from '@/lib/pro/daily-logs';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(['40001','54000'].includes(error.code||'')?409:error.code==='42501'?403:['22023','22007','22008','22021','23514','23505','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'Los datos cambiaron. Actualice antes de continuar.':'No se pudo completar la operación.');
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
 const reader=req.body?.getReader();if(!reader)throw Error();let length=0;const chunks:Uint8Array[]=[];
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>128*1024){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
const id=z.string().uuid(),workId=z.string().min(1).max(160),scope={workId,grantId:id.optional()},ids=z.string().max(3699).transform(v=>v===''?[]:v.split(',')).pipe(z.array(id).max(100).refine(a=>new Set(a).size===a.length));
const querySchema=z.discriminatedUnion('view',[
 z.object({view:z.literal('list'),...scope,status:z.enum(['active','archived']).default('active'),after:id.optional()}).strict(),
 z.object({view:z.enum(['detail','preview']),...scope,logId:id}).strict(),
 z.object({view:z.literal('options'),...scope,kind:z.enum(['tasks','plan']),q:z.string().trim().max(100).default(''),after:id.optional()}).strict(),
 z.object({view:z.literal('snapshot'),...scope,date:taskDueDate.unwrap(),taskIds:ids.optional(),planTaskIds:ids.optional(),includeTime:z.literal('1').optional()}).strict(),
 z.object({view:z.literal('defaults')}).strict(),
 z.object({view:z.literal('action'),actionId:id}).strict(),
 z.object({view:z.literal('shared'),grantId:id,after:id.optional()}).strict(),
 z.object({view:z.literal('client'),requestId:id,after:id.optional()}).strict(),
 z.object({view:z.literal('audience'),workId,after:id.optional()}).strict(),
]);
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await actor(req);if(a.error)return a.error;
  const raw:Record<string,string>={};for(const[k,v]of new URL(req.url).searchParams){if(k in raw)return fail(400,'Consulta inválida.');raw[k]=v;}const parsed=querySchema.safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');const q=parsed.data;let result;let schema:z.ZodType;
  if(q.view==='defaults'){result=await a.db.rpc('pro_daily_log_defaults_read',{p_actor:a.user.id});schema=dailyLogDefaultsSchema;}
  else if(q.view==='action'){result=await a.db.rpc('pro_daily_log_file_legacy_action_read',{p_actor:a.user.id,p_action:q.actionId});schema=dailyLogReceiptSchema;}
  else if(q.view==='shared'){result=await a.db.rpc('pro_daily_logs_shared_read',{p_actor:a.user.id,p_grant:q.grantId,p_after:q.after??null});schema=dailyLogSharedPageSchema;}
  else if(q.view==='client'){result=await a.db.rpc('pro_daily_logs_client_read',{p_actor:await proCustomerReader(a.db,a.user.id,q.requestId),p_request:q.requestId,p_after:q.after??null});schema=dailyLogSharedPageSchema;}
  else if(q.view==='audience'){result=await a.db.rpc('pro_daily_log_audience_read',{p_actor:a.user.id,p_work:q.workId,p_after:q.after??null});schema=dailyLogAudiencePageSchema;}
  else if(q.view==='options'){result=await a.db.rpc('pro_daily_log_options',{p_actor:a.user.id,p_work:q.workId,p_grant:q.grantId??null,p_kind:q.kind,p_query:q.q,p_after:q.after??null});schema=dailyLogOptionsPageSchema;}
  else if(q.view==='snapshot'){result=await a.db.rpc('pro_daily_log_snapshot',{p_actor:a.user.id,p_work:q.workId,p_grant:q.grantId??null,p_date:q.date,p_tasks:q.taskIds??[],p_plan:q.planTaskIds??[],p_time:q.includeTime==='1'});schema=dailyLogSnapshotSchema;}
  else{result=await a.db.rpc('pro_daily_logs_read',{p_actor:a.user.id,p_work:q.workId,p_grant:q.grantId??null,p_status:q.view==='list'?q.status:'active',p_after:q.view==='list'?q.after??null:null,p_log:q.view==='list'?null:q.logId,p_preview:q.view==='preview'});schema=q.view==='list'?dailyLogsPageSchema:q.view==='detail'?dailyLogDetailSchema:dailyLogPreviewSchema;}
  if(result.error)return dbError(result.error);if(!result.data)return fail(404,'Bitácora no disponible.');return Response.json(schema.parse(result.data),{headers});
 }catch{return fail(503,'No se pudo cargar la bitácora.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'daily-logs-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=dailyLogMutationSchema.parse(await bounded(req));}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise los datos de la bitácora.');}
  // Preserve every legacy body/receipt. Only publication is forwarded through
  // the additive manifest facade; no default attachment fields are injected.
  const sorted=(v:unknown):unknown=>Array.isArray(v)?v.map(sorted):v!==null&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([x],[y])=>x<y?-1:x>y?1:0).map(([key,value])=>[key,sorted(value)])):v;
  const result=input.action==='publish'?await a.db.rpc('pro_daily_log_publish_files',{p_actor:a.user.id,p_input:input,p_input_hash:createHash('sha256').update(JSON.stringify(sorted(input))).digest('hex')}):await a.db.rpc('pro_daily_logs_mutate',{p_actor:a.user.id,p_input:input});if(result.error)return dbError(result.error);return Response.json(dailyLogResultSchema.parse(input.action==='publish'?result.data?.publication:result.data),{headers});
 }catch{return fail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
