import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {dailyLogDiscussionScopeSchema,dailyLogDiscussionPageSchema,dailyLogCommentMutationSchema,dailyLogCommentResultSchema,dailyLogCommentReceiptSchema,dailyLogDiscussionVersionsSchema} from '@/lib/pro/daily-log-discussion';
import {PRO_ENABLED} from '@/lib/pro/enabled';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(['40001','54000','23505'].includes(error.code||'')?409:error.code==='42501'?403:error.code==='P0002'?404:['22023','22007','22008','22021','23514','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'El acceso o la conversación cambió. Vuelva a abrirla.':'No se pudo completar la operación.');
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
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>24*1024){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
const id=z.string().uuid(),workId=z.string().min(1).max(160),queryVersion=z.string().regex(/^[0-9]{1,10}$/).transform(Number).pipe(z.number().int().positive().max(2147483647)),base={view:z.literal('thread'),logId:id,version:queryVersion,after:id.optional()};
const querySchema=z.union([
 z.object({...base,side:z.literal('owner'),workId,channel:z.enum(['client','team'])}).strict(),
 z.object({...base,side:z.literal('client'),requestId:id,channel:z.literal('client')}).strict(),
 z.object({...base,side:z.literal('team'),grantId:id,channel:z.literal('team')}).strict(),
 z.object({view:z.literal('action'),actionId:id}).strict(),
 z.object({view:z.literal('versions'),workId,logId:id,afterVersion:queryVersion.optional()}).strict(),
]);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await actor(req);if(a.error)return a.error;
  const raw:Record<string,string>={};for(const[k,v]of new URL(req.url).searchParams){if(k in raw)return fail(400,'Consulta inválida.');raw[k]=v;}const parsed=querySchema.safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');const q=parsed.data;
  if(q.view==='action'){const result=await a.db.rpc('pro_daily_log_comment_action_read',{p_actor:a.user.id,p_action:q.actionId});if(result.error)return dbError(result.error);return Response.json(dailyLogCommentReceiptSchema.parse(result.data),{headers});}
  if(q.view==='versions'){const result=await a.db.rpc('pro_daily_log_discussion_versions',{p_actor:a.user.id,p_work:q.workId,p_log:q.logId,p_after:q.afterVersion??null});if(result.error)return dbError(result.error);if(!result.data)return fail(404,'Publicación no disponible.');return Response.json(dailyLogDiscussionVersionsSchema.parse(result.data),{headers});}
  const {view,after,...rawScope}=q;void view;const scope=dailyLogDiscussionScopeSchema.parse(rawScope);const result=await a.db.rpc('pro_daily_log_discussion_read',{p_actor:a.user.id,p_scope:scope,p_after:after??null});if(result.error)return dbError(result.error);return Response.json(dailyLogDiscussionPageSchema.parse(result.data),{headers});
 }catch{return fail(503,'No se pudo cargar la conversación.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'daily-log-discussion-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=dailyLogCommentMutationSchema.parse(await bounded(req));}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise el comentario.');}
  const result=await a.db.rpc('pro_daily_log_comment_write',{p_actor:a.user.id,p_input:input});if(result.error)return dbError(result.error);return Response.json(dailyLogCommentResultSchema.parse(result.data),{headers});
 }catch{return fail(503,'No se pudo comprobar el comentario. Reintente la misma operación.');}
}
