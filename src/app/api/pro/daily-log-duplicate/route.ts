import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {createHash} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {dailyLogDuplicateMutationSchema,dailyLogDuplicateAttemptSchema,dailyLogDuplicateReceiptSchema,dailyLogDuplicateResponseSchema,dailyLogDuplicateRetireInputSchema,dailyLogDuplicateRetireReceiptSchema,dailyLogDuplicatePendingPageSchema} from '@/lib/pro/daily-log-duplicate';
import {PRO_FILE_MAX_BYTES} from '@/lib/pro/file-limit';
import {PRO_ENABLED} from '@/lib/pro/enabled';
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
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>24*1024){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
const query=z.discriminatedUnion('view',[z.object({view:z.enum(['action','retirement']),actionId:z.string().uuid()}).strict(),z.object({view:z.literal('pending'),workId:z.string().min(1).max(160),after:z.string().regex(/^[a-f0-9-]{36}:[a-f0-9-]{36}$/).optional()}).strict()]);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{const a=await actor(req);if(a.error)return a.error;const raw:Record<string,string>={};for(const[k,v]of new URL(req.url).searchParams){if(k in raw)return fail(400,'Consulta inválida.');raw[k]=v;}const q=query.safeParse(raw);if(!q.success)return fail(400,'Consulta inválida.');if(q.data.view==='pending'){const r=await a.db.rpc('pro_daily_log_duplicate_pending',{p_actor:a.user.id,p_work:q.data.workId,p_after:q.data.after??null});if(r.error)return dbError(r.error);return Response.json(dailyLogDuplicatePendingPageSchema.parse(r.data),{headers});}
 const r=await a.db.rpc(q.data.view==='retirement'?'pro_daily_log_duplicate_retire_read':'pro_daily_log_duplicate_read',{p_actor:a.user.id,p_action:q.data.actionId});if(r.error)return dbError(r.error);return Response.json((q.data.view==='retirement'?dailyLogDuplicateRetireReceiptSchema:dailyLogDuplicateReceiptSchema).parse(r.data),{headers});}catch{return fail(503,'No se pudo comprobar la copia.');}
}
const stageSchema=z.object({attempt:dailyLogDuplicateAttemptSchema,objects:z.array(z.object({fileId:z.string().uuid(),sourcePath:z.string(),targetPath:z.string(),file:z.object({sizeBytes:z.number().int().positive().max(PRO_FILE_MAX_BYTES),sha256:z.string(),mimeType:z.enum(['image/jpeg','application/pdf']),ownerId:z.string().uuid(),id:z.string().uuid()}).passthrough()}).strict()).max(20)}).strict();
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;const limit=await enforceRateLimit(req,'daily-log-duplicate-'+a.user.id,30,60000);if(limit)return limit;
  let input;try{input=z.union([dailyLogDuplicateMutationSchema,dailyLogDuplicateRetireInputSchema]).parse(await bounded(req));}catch(e){return fail(e instanceof RangeError?413:400,'Revise la copia seleccionada.');}
  if(input.action==='retire'){const r=await a.db.rpc('pro_daily_log_duplicate_retire',{p_actor:a.user.id,p_input:input});if(r.error)return dbError(r.error);return Response.json(dailyLogDuplicateRetireReceiptSchema.parse(r.data),{headers});}
  if(input.action==='abort'){const r=await a.db.rpc('pro_daily_log_duplicate_abort',{p_actor:a.user.id,p_input:input});if(r.error)return dbError(r.error);return Response.json(dailyLogDuplicateResponseSchema.parse(r.data),{headers});}
  const begun=await a.db.rpc('pro_daily_log_duplicate_reserve',{p_actor:a.user.id,p_input:input});if(begun.error)return dbError(begun.error);
  const proof=async()=>{const r=await a.db.rpc('pro_daily_log_duplicate_read',{p_actor:a.user.id,p_action:input.actionId});if(r.error)return dbError(r.error);return Response.json(dailyLogDuplicateResponseSchema.parse(r.data),{headers});};
  if(!begun.data||dailyLogDuplicateAttemptSchema.parse(begun.data).phase!=='pending')return await proof();
  const staged=await a.db.rpc('pro_daily_log_duplicate_stage',{p_actor:a.user.id,p_action:input.actionId});if(staged.error)return dbError(staged.error);let stage=stageSchema.parse(staged.data);
  for(const object of stage.objects){
   // Refresh authorization and abort state immediately before every Storage call.
   const check=await a.db.rpc('pro_daily_log_duplicate_stage',{p_actor:a.user.id,p_action:input.actionId});if(check.error)return dbError(check.error);stage=stageSchema.parse(check.data);if(stage.attempt.phase!=='pending')return await proof();
   const expected=stage.attempt.input.files.find(f=>f.targetFileId===object.fileId),owner=stage.attempt.source.ownerId;
   const ext=object.file.mimeType==='application/pdf'?'.pdf':'.jpg';if(!expected||object.sourcePath!==owner+'/'+expected.sourceFileId+ext||object.targetPath!==owner+'/'+object.fileId+ext||object.file.sha256!==expected.sha256||object.file.ownerId!==owner)return fail(503,'No se pudo verificar la reserva.');
   const source=await a.db.storage.from('pro-daily-log-files').download(object.sourcePath);if(source.error||!source.data)return fail(503,'No se pudo leer el archivo original.');if(source.data.size!==object.file.sizeBytes)return fail(503,'El archivo original no coincide.');const bytes=new Uint8Array(await source.data.arrayBuffer());if(bytes.length!==object.file.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==expected.sha256)return fail(503,'El archivo original no coincide.');
   const beforePut=await a.db.rpc('pro_daily_log_duplicate_stage',{p_actor:a.user.id,p_action:input.actionId});if(beforePut.error)return dbError(beforePut.error);if(stageSchema.parse(beforePut.data).attempt.phase!=='pending')return await proof();
   const put=await a.db.storage.from('pro-daily-log-files').upload(object.targetPath,bytes,{contentType:object.file.mimeType,upsert:false});
   if(put.error&&!['409','Duplicate','400'].includes(String(put.error.statusCode)))return fail(503,'No se pudo preparar la copia.');
   // Verify also on success: lost ACK/colliding path never authorizes overwrite/delete.
   const copied=await a.db.storage.from('pro-daily-log-files').download(object.targetPath);if(copied.error||!copied.data)return fail(503,'No se pudo verificar la copia.');if(copied.data.size!==object.file.sizeBytes)return fail(503,'La copia no coincide.');const canonical=new Uint8Array(await copied.data.arrayBuffer());if(canonical.length!==object.file.sizeBytes||createHash('sha256').update(canonical).digest('hex')!==expected.sha256)return fail(503,'La copia no coincide.');
   const verified=await a.db.rpc('pro_daily_log_duplicate_stage',{p_actor:a.user.id,p_action:input.actionId,p_file:object.fileId,p_verified:true});if(verified.error)return dbError(verified.error);if(stageSchema.parse(verified.data).attempt.phase!=='pending')return await proof();
  }
  const finished=await a.db.rpc('pro_daily_log_duplicate_finish',{p_actor:a.user.id,p_action:input.actionId});if(finished.error)return dbError(finished.error);return await proof();
 }catch{return fail(503,'No se pudo comprobar la copia. Reintente la misma operación.');}
}
