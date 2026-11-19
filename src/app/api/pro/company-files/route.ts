import {z} from 'zod';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {decodeDeliveryPhotoBase64} from '@/lib/pro/delivery-photo-base64';
import {canonicalWorkFileName,WORK_FILE_MAX_BYTES} from '@/lib/pro/work-files';
import {PRO_DOC_MIMES,PRO_DOC_PATH,proDocExtension,type ProDocMime} from '@/lib/pro/file-formats';
import {ProDocRejected,proDocRejectedMessage,sniffProDocument} from '@/lib/pro/file-sniff';
import {companyFileMutationSchema,companyFileResultSchema,companyFileReceiptSchema,companyFileDetailSchema,companyFilesPageSchema,companyFileSchema,canonicalCompanyFileInput} from '@/lib/pro/company-files';
import {PRO_FILE_BODY_MAX} from '@/lib/pro/file-limit';
const bucketName='pro-company-files',headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(['40001','54000'].includes(error.code||'')?409:error.code==='42501'?403:['22023','22008','22007','22021','23514','23505','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'Los datos cambiaron. Actualice antes de continuar.':'No se pudo completar la operación.');
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const id=z.string().uuid(),path=z.string().regex(PRO_DOC_PATH);
const binarySchema=z.object({objectPath:path,name:z.string().min(1).max(160),mimeType:z.enum(PRO_DOC_MIMES),sizeBytes:z.number().int().positive().max(WORK_FILE_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
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
const querySchema=z.discriminatedUnion('view',[
 z.object({view:z.literal('list'),scope:z.enum(['folder','all']).default('folder'),folderId:id.optional(),status:z.enum(['active','archived']).default('active'),q:z.string().trim().max(100).default(''),type:z.enum(['all','image','pdf']).default('all'),starred:z.literal('1').optional(),after:z.string().regex(/^(folder|file):[a-f0-9-]{36}$/).optional()}).strict().refine(v=>v.scope!=='all'||v.folderId===undefined),
 z.object({view:z.literal('detail'),fileId:id}).strict(),
 z.object({view:z.literal('binary'),fileId:id}).strict(),
 z.object({view:z.literal('action'),actionId:id}).strict(),
]);
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await actor(req);if(a.error)return a.error;
  const raw:Record<string,string>={};for(const[k,v]of new URL(req.url).searchParams){if(k in raw)return fail(400,'Consulta inválida.');raw[k]=v;}
  const parsed=querySchema.safeParse(raw);if(!parsed.success)return fail(400,'Consulta inválida.');const q=parsed.data;
  if(q.view==='binary'){
   const access=await a.db.rpc('pro_company_file_download',{p_actor:a.user.id,p_file:q.fileId});if(access.error)return dbError(access.error);if(!access.data)return fail(404,'Archivo no disponible.');const meta=binarySchema.parse(access.data),expected=a.user.id+'/'+q.fileId+proDocExtension(meta.mimeType);if(meta.objectPath!==expected||canonicalWorkFileName(meta.name,meta.mimeType)!==meta.name)return fail(503,'No se pudo comprobar el archivo.');
   const object=await a.db.storage.from(bucketName).download(expected);if(object.error||!object.data||object.data.size!==meta.sizeBytes)return fail(503,'No se pudo descargar el archivo.');const bytes=new Uint8Array(await object.data.arrayBuffer());if(digest(bytes)!==meta.sha256)return fail(503,'No se pudo comprobar el archivo.');
   // Storage may be slow. Reauthorize current membership after retrieving bytes.
   const current=await a.db.rpc('pro_company_file_download',{p_actor:a.user.id,p_file:q.fileId});if(current.error)return dbError(current.error);if(!current.data)return fail(404,'Archivo no disponible.');if(JSON.stringify(binarySchema.parse(current.data))!==JSON.stringify(meta))return fail(409,'El archivo cambió. Vuelva a abrirlo.');
   const ext=proDocExtension(meta.mimeType),encoded=encodeURIComponent(meta.name).replace(/[!'()*]/g,ch=>'%'+ch.charCodeAt(0).toString(16).toUpperCase());return new Response(bytes,{headers:{...headers,'Content-Type':meta.mimeType,'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="file${ext}"; filename*=UTF-8''${encoded}`,'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'}});
  }
  if(q.view==='action'){const result=await a.db.rpc('pro_company_file_action_read',{p_actor:a.user.id,p_action:q.actionId});if(result.error)return dbError(result.error);return Response.json(companyFileReceiptSchema.parse(result.data),{headers});}
  const result=await a.db.rpc('pro_company_files_read',{p_actor:a.user.id,p_scope:q.view==='list'?q.scope:'folder',p_folder:q.view==='list'?q.folderId??null:null,p_status:q.view==='list'?q.status:'active',p_query:q.view==='list'?q.q:'',p_type:q.view==='list'?q.type:'all',p_starred:q.view==='list'?q.starred==='1':false,p_after:q.view==='list'?q.after??null:null,p_file:q.view==='detail'?q.fileId:null});if(result.error)return dbError(result.error);if(!result.data)return fail(404,'Archivo no disponible.');return Response.json(q.view==='detail'?companyFileDetailSchema.parse(result.data):companyFilesPageSchema.parse(result.data),{headers});
 }catch{return fail(503,'No se pudo cargar la biblioteca.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'company-files-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=companyFileMutationSchema.parse(await bounded(req));}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise los datos del archivo.');}
  const inputHash=digest(canonicalCompanyFileInput(input));let internal:Record<string,unknown>={...input};let uploadBytes:Buffer|undefined;
  if(input.action==='upload'){
   try{const raw=decodeDeliveryPhotoBase64(input.data),canonical=await sniffProDocument(raw,input.name);uploadBytes=canonical.bytes;internal={action:'upload',actionId:input.actionId,fileId:input.fileId,folderId:input.folderId,sourceName:input.name,name:canonicalWorkFileName(input.name,canonical.mimeType),mimeType:canonical.mimeType,rawSha256:digest(raw),sha256:digest(canonical.bytes),sizeBytes:canonical.bytes.length};}catch(cause){return Response.json({error:proDocRejectedMessage(cause),reason:cause instanceof ProDocRejected?cause.reason:'type'},{status:400,headers});}
  }else if(input.action==='file_update'){
   const existing=await a.db.rpc('pro_company_files_read',{p_actor:a.user.id,p_scope:'folder',p_folder:null,p_status:'active',p_query:'',p_type:'all',p_starred:false,p_after:null,p_file:input.fileId});if(existing.error)return dbError(existing.error);if(!existing.data)return fail(403,'Archivo no disponible.');const meta=companyFileDetailSchema.parse(existing.data);internal={...input,name:canonicalWorkFileName(input.name,meta.file.mimeType)};
  }
  const reserved=await a.db.rpc('pro_company_files_mutate',{p_actor:a.user.id,p_input:internal,p_input_hash:inputHash});if(reserved.error)return reserved.error.hint==='pro_file_quota'?Response.json({error:'Se alcanzó el espacio de archivos de la cuenta.',reason:'quota'},{status:429,headers}):dbError(reserved.error);
  const state=z.object({result:companyFileResultSchema.nullable(),upload:z.object({file:companyFileSchema,objectPath:path}).strict().optional(),copy:z.object({sourcePath:path,source:companyFileSchema,target:z.object({objectPath:path,file:z.unknown()}).strict()}).strict().optional()}).strict().parse(reserved.data);
  if(state.result)return Response.json(state.result,{headers});
  let bytes:Buffer;let objectPath:string;let destination:string;let expectedHash:string;let expectedSize:number;let mimeType:ProDocMime;
  if(input.action==='upload'&&state.upload&&uploadBytes){const meta=state.upload.file;objectPath=a.user.id+'/'+input.fileId+proDocExtension(meta.mimeType);if(state.upload.objectPath!==objectPath||meta.id!==input.fileId||meta.folderId!==input.folderId||meta.sha256!==digest(uploadBytes)||meta.sizeBytes!==uploadBytes.length||meta.name!==internal.name)return fail(503,'No se pudo comprobar la reserva.');bytes=uploadBytes;destination=bucketName;expectedHash=meta.sha256;expectedSize=meta.sizeBytes;mimeType=meta.mimeType;
  }else if(input.action==='copy'&&state.copy){const source=state.copy.source;if(source.id!==input.fileId||source.revision!==input.revision||state.copy.sourcePath!==a.user.id+'/'+input.fileId+proDocExtension(source.mimeType))return fail(503,'No se pudo comprobar el origen.');objectPath=a.user.id+'/'+input.targetFileId+proDocExtension(source.mimeType);if(state.copy.target.objectPath!==objectPath)return fail(503,'No se pudo comprobar el destino.');const object=await a.db.storage.from(bucketName).download(state.copy.sourcePath);if(object.error||!object.data||object.data.size!==source.sizeBytes)return fail(503,'No se pudo recuperar el archivo.');bytes=Buffer.from(await object.data.arrayBuffer());if(digest(bytes)!==source.sha256)return fail(503,'No se pudo comprobar el archivo.');destination='pro-work-files';expectedHash=source.sha256;expectedSize=source.sizeBytes;mimeType=source.mimeType;
  }else return fail(503,'No se pudo comprobar la operación pendiente.');
  const current=await a.db.rpc('pro_company_action_state',{p_actor:a.user.id,p_action:input.actionId});if(current.error)return dbError(current.error);
  const bucket=a.db.storage.from(destination),stored=await bucket.upload(objectPath,bytes,{contentType:mimeType,upsert:false,cacheControl:'0'});if(stored.error&&String(stored.error.statusCode)!=='409'&&String(stored.error.statusCode)!=='400')return fail(503,'No se pudo subir el archivo.');
  const verify=await bucket.download(objectPath);if(verify.error||!verify.data||verify.data.size!==expectedSize)return fail(503,'No se pudo comprobar la subida.');if(digest(new Uint8Array(await verify.data.arrayBuffer()))!==expectedHash)return fail(503,'El archivo almacenado no coincide.');
  const ready=await a.db.rpc('pro_company_file_ready',{p_actor:a.user.id,p_action:input.actionId});if(ready.error)return dbError(ready.error);return Response.json(companyFileResultSchema.parse(ready.data),{headers});
 }catch{return fail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
