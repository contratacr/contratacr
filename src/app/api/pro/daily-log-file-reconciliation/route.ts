import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {createHash} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {dailyLogFilesPageSchema} from '@/lib/pro/daily-log-files';
import {dailyLogFileReconciliationMutationSchema,dailyLogFileReconciliationAttemptSchema,dailyLogFileReconciliationReceiptSchema,dailyLogFileReconciliationResponseSchema,dailyLogFileReconciliationHistorySchema} from '@/lib/pro/daily-log-file-reconciliation';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(['40001','54000','23505'].includes(error.code||'')?409:error.code==='42501'?403:error.code==='P0002'?404:['22023','22007','22008','22021','23514','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'El archivo cambió. Actualice antes de continuar.':'No se pudo completar la comprobación.');
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
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>16*1024){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
const id=z.string().uuid(),workId=z.string().min(1).max(160);
const querySchema=z.discriminatedUnion('view',[
 z.object({view:z.literal('action'),actionId:id}).strict(),
 z.object({view:z.enum(['pending','history']),workId,logId:id,after:id.optional()}).strict(),
]);
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await actor(req);if(a.error)return a.error;const raw:Record<string,string>={};for(const[k,v]of new URL(req.url).searchParams){if(k in raw)return fail(400,'Consulta inválida.');raw[k]=v;}const parsed=querySchema.safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');const q=parsed.data;
  if(q.view==='action'){const result=await a.db.rpc('pro_daily_file_reconcile_read',{p_actor:a.user.id,p_action:q.actionId});if(result.error)return dbError(result.error);return Response.json(dailyLogFileReconciliationReceiptSchema.parse(result.data),{headers});}
  if(q.view==='history'){const result=await a.db.rpc('pro_daily_file_reconcile_history',{p_actor:a.user.id,p_work:q.workId,p_log:q.logId,p_after:q.after??null});if(result.error)return dbError(result.error);return Response.json(dailyLogFileReconciliationHistorySchema.parse(result.data),{headers});}
  const check=await a.db.rpc('pro_daily_file_reconcile_owner',{p_actor:a.user.id,p_work:q.workId,p_log:q.logId});if(check.error)return dbError(check.error);
  const result=await a.db.rpc('pro_daily_log_files_read',{p_actor:a.user.id,p_work:q.workId,p_log:q.logId,p_grant:null,p_status:'pending',p_after:q.after??null});if(result.error)return dbError(result.error);return Response.json(dailyLogFilesPageSchema.parse(result.data),{headers});
 }catch{return fail(503,'No se pudo cargar la comprobación.');}
}
const reservationSchema=z.object({attempt:dailyLogFileReconciliationAttemptSchema,objectPath:z.string().regex(new RegExp('^[a-f0-9-]{36}/[a-f0-9-]{36}[.](jpg|pdf)$'))}).strict();
function responseFor(attempt:z.infer<typeof dailyLogFileReconciliationAttemptSchema>){return Response.json(dailyLogFileReconciliationResponseSchema.parse(attempt.result?{state:'confirmed',result:attempt.result,attempt}:{state:'pending',reason:attempt.reason,attempt}),{headers});}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'daily-log-file-reconciliation-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=dailyLogFileReconciliationMutationSchema.parse(await bounded(req));}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise el archivo pendiente.');}
  const reserved=await a.db.rpc('pro_daily_file_reconcile_reserve',{p_actor:a.user.id,p_input:input});if(reserved.error)return dbError(reserved.error);const reservation=reservationSchema.parse(reserved.data),attempt=reservation.attempt,file=attempt.baseline;
  if(JSON.stringify(attempt.input)!==JSON.stringify(input)||file.ownerId!==a.user.id||reservation.objectPath!==a.user.id+'/'+input.fileId+(file.mimeType==='application/pdf'?'.pdf':'.jpg'))return fail(503,'No se pudo comprobar la reserva.');if(attempt.result)return responseFor(attempt);
  let reason:'missing_object'|'mismatch'|'unavailable'|null=null;
  try{
   const object=await a.db.storage.from('pro-daily-log-files').download(reservation.objectPath);
   if(object.error||!object.data){const code=String(object.error?.statusCode??'');reason=code==='404'||code==='400'&&/not found|does not exist/i.test(object.error?.message??'')?'missing_object':'unavailable';}
   else if(object.data.size!==file.sizeBytes)reason='mismatch';
   else{const bytes=new Uint8Array(await object.data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)reason='mismatch';}
  }catch{reason='unavailable';}
  if(reason){const noted=await a.db.rpc('pro_daily_file_reconcile_note',{p_actor:a.user.id,p_action:input.actionId,p_reason:reason});if(noted.error)return dbError(noted.error);return responseFor(dailyLogFileReconciliationAttemptSchema.parse(noted.data));}
  const finished=await a.db.rpc('pro_daily_file_reconcile_finish',{p_actor:a.user.id,p_action:input.actionId});if(finished.error)return dbError(finished.error);return responseFor(dailyLogFileReconciliationAttemptSchema.parse(finished.data));
 }catch{return fail(503,'No se pudo comprobar el resultado. Reintente la misma comprobación.');}
}
