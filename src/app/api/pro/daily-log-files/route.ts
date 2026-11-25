import {proCustomerReader} from '@/lib/pro/route-common';
import {z} from 'zod';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {verifyStoredObject} from '@/lib/pro/storage-verify';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {decodeDeliveryPhotoBase64} from '@/lib/pro/delivery-photo-base64';
import {canonicalWorkFileName,WORK_FILE_MAX_BYTES} from '@/lib/pro/work-files';
import {normalizeCompanyFile} from '@/lib/pro/company-file-normalize';
import {dailyLogDiscussionScopeSchema} from '@/lib/pro/daily-log-discussion';
import {dailyLogFileMutationSchema,dailyLogFileResultSchema,dailyLogFileReceiptSchema,dailyLogFileSchema,dailyLogFileContextSchema,dailyLogFilesPageSchema,dailyLogPublishedFilesPageSchema,canonicalDailyLogFileInput} from '@/lib/pro/daily-log-files';
import {PRO_FILE_BODY_MAX} from '@/lib/pro/file-limit';
import {PRO_ENABLED} from '@/lib/pro/enabled';
const bucketName='pro-daily-log-files',headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(['40001','54000','23505'].includes(error.code||'')?409:error.code==='42501'?403:error.code==='P0002'?404:['22023','22007','22008','22021','23514','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'Los archivos o el acceso cambiaron. Actualice antes de continuar.':'No se pudo completar la operación.');
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const id=z.string().uuid(),path=z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|pdf)$/);
const binarySchema=z.object({objectPath:path,name:z.string().min(1).max(160),mimeType:z.enum(['image/jpeg','application/pdf']),sizeBytes:z.number().int().positive().max(WORK_FILE_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
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
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>PRO_FILE_BODY_MAX){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
const workId=z.string().min(1).max(160),version=z.string().regex(/^[0-9]{1,10}$/).transform(Number).pipe(z.number().int().positive().max(2147483647)),privateScope={workId,logId:id,grantId:id.optional(),generation:id.optional()};
const publicScope={logId:id,version,after:id.optional()};
const querySchema=z.union([
 z.object({view:z.literal('context'),...privateScope}).strict(),
 z.object({view:z.literal('private'),...privateScope,status:z.enum(['ready','pending','all']).default('ready'),after:id.optional()}).strict(),
 z.object({view:z.literal('action'),actionId:id}).strict(),
 z.object({view:z.literal('binary'),access:z.literal('private').optional(),...privateScope,fileId:id}).strict(),
 ...(['published','binary'] as const).flatMap(view=>[
  z.object({view:z.literal(view),access:view==='binary'?z.literal('published'):z.never().optional(),...publicScope,after:view==='binary'?z.never().optional():id.optional(),fileId:view==='binary'?id:z.never().optional(),side:z.literal('owner'),workId,channel:z.enum(['client','team'])}).strict(),
  z.object({view:z.literal(view),access:view==='binary'?z.literal('published'):z.never().optional(),...publicScope,after:view==='binary'?z.never().optional():id.optional(),fileId:view==='binary'?id:z.never().optional(),side:z.literal('client'),requestId:id,channel:z.literal('client')}).strict(),
  z.object({view:z.literal(view),access:view==='binary'?z.literal('published'):z.never().optional(),...publicScope,after:view==='binary'?z.never().optional():id.optional(),fileId:view==='binary'?id:z.never().optional(),side:z.literal('team'),grantId:id,channel:z.literal('team')}).strict(),
 ]),
]);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await actor(req);if(a.error)return a.error;const raw:Record<string,string>={};for(const[k,v]of new URL(req.url).searchParams){if(k in raw)return fail(400,'Consulta inválida.');raw[k]=v;}
  const parsed=querySchema.safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');const q=parsed.data;
  if(q.view==='action'){const result=await a.db.rpc('pro_company_daily_log_legacy_read',{p_actor:a.user.id,p_action:q.actionId});if(result.error)return dbError(result.error);return Response.json(dailyLogFileReceiptSchema.parse(result.data),{headers});}
  if(q.view==='context'||q.view==='private'){
   if(q.generation!==undefined){const check=await a.db.rpc('pro_daily_log_file_context',{p_actor:a.user.id,p_work:q.workId,p_log:q.logId,p_grant:q.grantId??null,p_write:false,p_generation:q.generation,p_check_generation:true,p_allow_missing:q.view==='context'});if(check.error)return dbError(check.error);}
   const result=q.view==='context'?await a.db.rpc('pro_daily_log_file_context',{p_actor:a.user.id,p_work:q.workId,p_log:q.logId,p_grant:q.grantId??null,p_allow_missing:true}):await a.db.rpc('pro_daily_log_files_read',{p_actor:a.user.id,p_work:q.workId,p_log:q.logId,p_grant:q.grantId??null,p_status:q.status,p_after:q.after??null});if(result.error)return dbError(result.error);return Response.json(q.view==='context'?dailyLogFileContextSchema.parse(result.data):dailyLogFilesPageSchema.parse(result.data),{headers});
  }
  let scope:ReturnType<typeof dailyLogDiscussionScopeSchema.parse>|null=null;
  if('side'in q){const {view,access,fileId,after,...rest}=q;void view;void access;void fileId;void after;scope=dailyLogDiscussionScopeSchema.parse(rest);}
  const reader=scope&&'requestId' in scope?await proCustomerReader(a.db,a.user.id,scope.requestId as string):a.user.id;
  if(q.view==='published'){const result=await a.db.rpc('pro_daily_log_published_files_read',{p_actor:reader,p_scope:scope,p_after:q.after??null});if(result.error)return dbError(result.error);return Response.json(dailyLogPublishedFilesPageSchema.parse(result.data),{headers});}
  const privateQuery='side'in q?null:q;
  const args={p_actor:reader,p_file:q.fileId,p_work:privateQuery?.workId??null,p_log:privateQuery?.logId??null,p_grant:privateQuery?.grantId??null,p_generation:privateQuery?.generation??null,p_check_generation:privateQuery?.generation!==undefined,p_scope:scope};
  const access=await a.db.rpc('pro_daily_log_file_download',args);if(access.error)return dbError(access.error);if(!access.data)return fail(404,'Archivo no disponible.');const meta=binarySchema.parse(access.data),extension=meta.mimeType==='application/pdf'?'.pdf':'.jpg';if(meta.objectPath.split('/')[1]!==q.fileId+extension||canonicalWorkFileName(meta.name,meta.mimeType)!==meta.name)return fail(503,'No se pudo comprobar el archivo.');
  const object=await a.db.storage.from(bucketName).download(meta.objectPath);if(object.error||!object.data||object.data.size!==meta.sizeBytes)return fail(503,'No se pudo recuperar el archivo.');const bytes=new Uint8Array(await object.data.arrayBuffer());if(digest(bytes)!==meta.sha256)return fail(503,'El archivo no coincide.');
  const current=await a.db.rpc('pro_daily_log_file_download',args);if(current.error)return dbError(current.error);if(!current.data)return fail(404,'Archivo no disponible.');if(JSON.stringify(binarySchema.parse(current.data))!==JSON.stringify(meta))return fail(409,'El acceso al archivo cambió.');
  const encoded=encodeURIComponent(meta.name).replace(/[!'()*]/g,ch=>'%'+ch.charCodeAt(0).toString(16).toUpperCase());return new Response(bytes,{headers:{...headers,'Content-Type':meta.mimeType,'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="file${extension}"; filename*=UTF-8''${encoded}`,'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'}});
 }catch{return fail(503,'No se pudieron cargar los archivos.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'daily-log-files-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=dailyLogFileMutationSchema.parse(await bounded(req));}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise el archivo seleccionado.');}
  // Authorize before decoding/normalizing user-supplied bytes. The reservation
  // and readiness RPCs recheck again after asynchronous storage operations.
  if(input.action!=='publish'){const retired=await a.db.rpc('pro_daily_file_retirement_guard',{p_actor:a.user.id,p_action:input.actionId,p_file:input.fileId});if(retired.error)return dbError(retired.error);const preflight=await a.db.rpc('pro_daily_log_file_context',{p_actor:a.user.id,p_work:input.workId,p_log:input.logId,p_grant:input.grantId,p_write:true,p_generation:input.generation,p_check_generation:true});if(preflight.error)return dbError(preflight.error);}
  const inputHash=digest(canonicalDailyLogFileInput(input));
  if(input.action==='publish'){const result=await a.db.rpc('pro_daily_log_publish_files',{p_actor:a.user.id,p_input:input,p_input_hash:inputHash});if(result.error)return dbError(result.error);return Response.json(dailyLogFileResultSchema.parse(result.data),{headers});}
  let internal:Record<string,unknown>={...input};let bytes:Buffer|undefined;
  if(input.action==='upload'){try{const rawBytes=decodeDeliveryPhotoBase64(input.data),canonical=await normalizeCompanyFile(rawBytes);bytes=canonical.bytes;internal={action:'upload',actionId:input.actionId,fileId:input.fileId,workId:input.workId,logId:input.logId,grantId:input.grantId,generation:input.generation,sourceName:input.name,name:canonicalWorkFileName(input.name,canonical.mimeType),mimeType:canonical.mimeType,sizeBytes:bytes.length,sha256:digest(bytes),rawSha256:digest(rawBytes)};}catch{return fail(400,'Use una foto JPG, PNG o WebP, o un PDF de hasta 20 MB.');}}
  const reservation=await a.db.rpc('pro_company_daily_log_legacy_reserve',{p_actor:a.user.id,p_input:internal,p_input_hash:inputHash});if(reservation.error)return dbError(reservation.error);
  const state=z.object({result:dailyLogFileResultSchema.nullable(),file:dailyLogFileSchema.optional(),objectPath:path.optional(),source:z.object({file:dailyLogFileSchema,objectPath:path}).strict().nullable().optional()}).strict().parse(reservation.data);if(state.result)return Response.json(state.result,{headers});
  const file=dailyLogFileSchema.parse(state.file),expected=file.ownerId+'/'+input.fileId+(file.mimeType==='application/pdf'?'.pdf':'.jpg');if(file.id!==input.fileId||file.workId!==input.workId||file.logId!==input.logId||file.createdBy!==a.user.id||file.createdGrantId!==input.grantId||file.sourceInviteId!==input.generation||state.objectPath!==expected)return fail(503,'No se pudo comprobar la reserva.');
  if(input.action==='copy'){if(!state.source||state.source.file.id!==input.sourceFileId||state.source.file.logId!==input.sourceLogId||state.source.file.sha256!==input.sourceSha256||file.sha256!==input.sourceSha256||state.source.objectPath!==file.ownerId+'/'+input.sourceFileId+(file.mimeType==='application/pdf'?'.pdf':'.jpg'))return fail(503,'No se pudo comprobar el origen.');const source=await a.db.storage.from(bucketName).download(state.source.objectPath);if(source.error||!source.data||source.data.size!==file.sizeBytes)return fail(503,'No se pudo recuperar el archivo de origen.');bytes=Buffer.from(await source.data.arrayBuffer());}
  if(!bytes||bytes.length!==file.sizeBytes||digest(bytes)!==file.sha256||input.action==='upload'&&file.name!==internal.name)return fail(503,'El contenido de la reserva no coincide.');
  const current=await a.db.rpc('pro_company_daily_log_legacy_pending',{p_actor:a.user.id,p_action:input.actionId});if(current.error)return dbError(current.error);
  const bucket=a.db.storage.from(bucketName),uploaded=await bucket.upload(expected,bytes,{contentType:file.mimeType,upsert:false,cacheControl:'0'});if(uploaded.error&&!['409','400'].includes(String(uploaded.error.statusCode)))return fail(503,'No se pudo subir el archivo.');
  if(await verifyStoredObject(bucket,expected,file.sizeBytes,file.sha256)!=='ok')return fail(503,'El archivo almacenado no coincide.');
  const ready=await a.db.rpc('pro_company_daily_log_legacy_ready',{p_actor:a.user.id,p_action:input.actionId});if(ready.error)return dbError(ready.error);return Response.json(dailyLogFileResultSchema.parse(ready.data),{headers});
 }catch{return fail(503,'No se pudo comprobar la subida. Reintente la misma operación.');}
}
