import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {createHash} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {companyDailyLogFileMutationSchema,companyDailyLogFileResultSchema,companyDailyLogFileReceiptSchema,canonicalCompanyDailyLogFileInput} from '@/lib/pro/company-daily-log-files';
import {companyFileSchema} from '@/lib/pro/company-files';
import {dailyLogFileSchema} from '@/lib/pro/daily-log-files';
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
const querySchema=z.object({view:z.literal('action'),actionId:z.string().uuid()}).strict();
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{const a=await actor(req);if(a.error)return a.error;const raw:Record<string,string>={};for(const[k,v]of new URL(req.url).searchParams){if(k in raw)return fail(400,'Consulta inválida.');raw[k]=v;}const q=querySchema.safeParse(raw);if(!q.success)return fail(400,'Consulta inválida.');const r=await a.db.rpc('pro_company_daily_log_file_read',{p_actor:a.user.id,p_action:q.data.actionId});if(r.error)return dbError(r.error);return Response.json(companyDailyLogFileReceiptSchema.parse(r.data),{headers});}catch{return fail(503,'No se pudo comprobar el archivo.');}
}
const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const path=z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}[.](jpg|pdf)$/);
const pendingSchema=z.object({input:companyDailyLogFileMutationSchema,inputHash:z.string().regex(/^[a-f0-9]{64}$/),source:companyFileSchema,sourcePath:path,file:dailyLogFileSchema,targetPath:path,result:companyDailyLogFileResultSchema.nullable()}).strict();
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'company-daily-log-files-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=companyDailyLogFileMutationSchema.parse(await bounded(req));}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise el archivo seleccionado.');}
  const inputHash=hash(canonicalCompanyDailyLogFileInput(input));
  const reserved=await a.db.rpc('pro_company_daily_log_file_reserve',{p_actor:a.user.id,p_input:input,p_input_hash:inputHash});if(reserved.error)return dbError(reserved.error);const pending=pendingSchema.parse(reserved.data),source=pending.source;
  const ext=source.mimeType==='application/pdf'?'.pdf':'.jpg';
  if(pending.inputHash!==inputHash||canonicalCompanyDailyLogFileInput(pending.input)!==canonicalCompanyDailyLogFileInput(input)||source.id!==input.sourceFileId||source.revision!==input.sourceRevision||source.sha256!==input.sourceSha256||!source.ready||source.archived||pending.file.id!==input.targetFileId||pending.file.ownerId!==a.user.id||pending.file.workId!==input.workId||pending.file.logId!==input.logId||pending.file.sha256!==source.sha256||pending.file.name!==source.name||pending.file.sizeBytes!==source.sizeBytes||pending.file.mimeType!==source.mimeType||pending.sourcePath!==a.user.id+'/'+input.sourceFileId+ext||pending.targetPath!==a.user.id+'/'+input.targetFileId+ext)return fail(503,'No se pudo comprobar la reserva.');
  if(pending.result)return Response.json(pending.result,{headers});
  const original=await a.db.storage.from('pro-company-files').download(pending.sourcePath);if(original.error||!original.data||original.data.size!==source.sizeBytes)return fail(503,'No se pudo leer el archivo de biblioteca.');const bytes=new Uint8Array(await original.data.arrayBuffer());if(bytes.length!==source.sizeBytes||hash(bytes)!==source.sha256)return fail(503,'El archivo de biblioteca no coincide.');
  const recheck=await a.db.rpc('pro_company_daily_log_file_pending',{p_actor:a.user.id,p_action:input.actionId});if(recheck.error)return dbError(recheck.error);const current=pendingSchema.parse(recheck.data);if(current.inputHash!==inputHash||JSON.stringify(current.source)!==JSON.stringify(source))return fail(503,'La reserva cambió.');if(current.result)return Response.json(current.result,{headers});
  const upload=await a.db.storage.from('pro-daily-log-files').upload(pending.targetPath,bytes,{contentType:source.mimeType,upsert:false});if(upload.error&&!['409','400','Duplicate'].includes(String(upload.error.statusCode)))return fail(503,'No se pudo copiar el archivo.');
  const copied=await a.db.storage.from('pro-daily-log-files').download(pending.targetPath);if(copied.error||!copied.data||copied.data.size!==source.sizeBytes)return fail(503,'No se pudo verificar la copia.');const canonical=new Uint8Array(await copied.data.arrayBuffer());if(canonical.length!==source.sizeBytes||hash(canonical)!==source.sha256)return fail(503,'La copia no coincide.');
  // Finalizer reauthorizes after work/head waits and after the ready transition.
  const ready=await a.db.rpc('pro_company_daily_log_file_ready',{p_actor:a.user.id,p_action:input.actionId});if(ready.error)return dbError(ready.error);return Response.json(companyDailyLogFileResultSchema.parse(ready.data),{headers});
 }catch{return fail(503,'No se pudo comprobar la copia. Reintente el mismo archivo.');}
}
