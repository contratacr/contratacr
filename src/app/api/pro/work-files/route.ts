import {proCustomerReader} from '@/lib/pro/route-common';
import {z} from 'zod';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {PRO_DOC_MIMES,PRO_DOC_PATH,proDocExtension} from '@/lib/pro/file-formats';
import {ProDocRejected,proDocRejectedMessage,sniffProDocument} from '@/lib/pro/file-sniff';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {decodeDeliveryPhotoBase64} from '@/lib/pro/delivery-photo-base64';
import {canonicalWorkFileName,sharedFoldersSchema,workFileMutationSchema,workFileSchema,WORK_FILE_MAX_BYTES} from '@/lib/pro/work-files';
import {PRO_FILE_BODY_MAX} from '@/lib/pro/file-limit';
import {PRO_ENABLED} from '@/lib/pro/enabled';
import {proHiddenDocuments} from '@/lib/pro/client-hidden';
import {verifyStoredObject} from '@/lib/pro/storage-verify';
const bucketName='pro-work-files',headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(error.code==='40001'?409:error.code==='42501'?403:error.code==='54000'?429:['22023','22008','22007','22021','23514','23505','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'El archivo o destinatario cambió. Actualice antes de compartir.':'No se pudo completar la operación.');
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const pathSchema=z.string().regex(PRO_DOC_PATH);
const binarySchema=z.object({objectPath:pathSchema,name:z.string().min(1).max(160),mimeType:z.enum(PRO_DOC_MIMES),sizeBytes:z.number().int().positive().max(WORK_FILE_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
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
// Ronda F2-D: every accepted format (file-formats.ts); the bytes decide the stored type.
async function normalize(raw:Buffer,sourceName:string){return sniffProDocument(raw,sourceName);}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await actor(req);if(a.error)return a.error;const q=new URL(req.url).searchParams;
  if(q.has('fileId')&&q.size===1){
   const id=z.string().uuid().safeParse(q.get('fileId'));if(!id.success)return fail(400,'Archivo inválido.');
   // Reauthorize every binary request; never return a signed or public storage URL.
   const access=await a.db.rpc('pro_work_file_download',{p_actor:a.user.id,p_file:id.data});if(access.error)return dbError(access.error);if(!access.data)return fail(404,'Archivo no disponible.');
   const metadata=binarySchema.parse(access.data),extension=proDocExtension(metadata.mimeType);
   if(metadata.objectPath.split('/')[1]!==id.data+extension||canonicalWorkFileName(metadata.name,metadata.mimeType)!==metadata.name)return fail(503,'No se pudo comprobar el archivo.');
   const download=await a.db.storage.from(bucketName).download(metadata.objectPath);if(download.error||!download.data||download.data.size!==metadata.sizeBytes)return fail(503,'No se pudo abrir el archivo.');
   const bytes=new Uint8Array(await download.data.arrayBuffer());if(digest(bytes)!==metadata.sha256)return fail(503,'No se pudo comprobar el archivo.');
   const encoded=encodeURIComponent(metadata.name).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
   return new Response(bytes,{headers:{...headers,'Content-Type':metadata.mimeType,'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="file${extension}"; filename*=UTF-8''${encoded}`,'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'}});
  }
  const after=q.has('after')?z.string().uuid().safeParse(q.get('after')):null;if(after&&!after.success)return fail(400,'Consulta inválida.');
  // Ronda F2-D (row 33): folders the professional shared with the linked customer. Same reader
  // identity as the shared files (the owner's preview runs as the linked customer, read only).
  if(q.has('requestId')&&(q.get('view')==='folders'||q.has('sharedFileId'))){
   for(const key of q.keys())if(!['requestId','view','sharedFileId'].includes(key))return fail(400,'Consulta inválida.');
   const request=z.string().uuid().safeParse(q.get('requestId'));if(!request.success)return fail(400,'Consulta inválida.');
   const reader=await proCustomerReader(a.db,a.user.id,request.data);
   if(q.get('view')==='folders'&&!q.has('sharedFileId')){
    const result=await a.db.rpc('pro_work_file_folders_client_read',{p_actor:reader,p_request:request.data});
    if(result.error)return dbError(result.error);if(!result.data)return fail(404,'Cita no disponible.');
    // Row 33: files the professional hid from the customer view (presentation only).
    const hidden=await proHiddenDocuments(a.db,reader,request.data),shared=sharedFoldersSchema.parse(result.data);
    if(hidden.file.size)shared.folders=shared.folders.map(fo=>({...fo,files:fo.files.filter(f=>!hidden.file.has(f.id))}));
    return Response.json(shared,{headers});
   }
   const file=z.string().uuid().safeParse(q.get('sharedFileId'));if(!file.success||q.has('view'))return fail(400,'Consulta inválida.');
   const access=await a.db.rpc('pro_work_file_folder_client_download',{p_actor:reader,p_request:request.data,p_file:file.data});if(access.error)return dbError(access.error);if(!access.data)return fail(404,'Archivo no disponible.');
   const metadata=binarySchema.extend({displayName:z.string().min(1).max(160)}).strict().parse(access.data),extension=proDocExtension(metadata.mimeType);
   if(metadata.objectPath.split('/')[1]!==file.data+extension||!metadata.displayName.endsWith(extension))return fail(503,'No se pudo comprobar el archivo.');
   const download=await a.db.storage.from(bucketName).download(metadata.objectPath);if(download.error||!download.data||download.data.size!==metadata.sizeBytes)return fail(503,'No se pudo abrir el archivo.');
   const bytes=new Uint8Array(await download.data.arrayBuffer());if(digest(bytes)!==metadata.sha256)return fail(503,'No se pudo comprobar el archivo.');
   const encoded=encodeURIComponent(metadata.displayName).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
   return new Response(bytes,{headers:{...headers,'Content-Type':metadata.mimeType,'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="file${extension}"; filename*=UTF-8''${encoded}`,'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'}});
  }
  if(q.has('requestId')){
   for(const key of q.keys())if(!['requestId','after'].includes(key))return fail(400,'Consulta inválida.');
   const request=z.string().uuid().safeParse(q.get('requestId'));if(!request.success)return fail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_work_files_client_read',{p_actor:await proCustomerReader(a.db,a.user.id,request.data),p_request:request.data,p_after:after?.success?after.data:null});
   if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):fail(404,'Cita no disponible.');
  }
  for(const key of q.keys())if(!['workId','fileId','metadata','after'].includes(key))return fail(400,'Consulta inválida.');
  const work=z.string().trim().min(1).max(160).safeParse(q.get('workId')),file=q.has('fileId')?z.string().uuid().safeParse(q.get('fileId')):null;
  if(!work.success||file&&!file.success||file&&(after||q.get('metadata')!=='1')||!file&&q.has('metadata'))return fail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_work_files_read',{p_actor:a.user.id,p_work:work.data,p_after:after?.success?after.data:null,p_file:file?.success?file.data:null});
  if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):fail(404,'Trabajo o archivo no disponible.');
 }catch{return fail(503,'No se pudieron cargar los archivos. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'work-files-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=workFileMutationSchema.parse(await bounded(req));}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise el archivo.');}
  if(input.action==='publish'){
   const result=await a.db.rpc('pro_work_file_publish',{p_actor:a.user.id,p_input:input});if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
  }
  let raw:Buffer,canonical:Awaited<ReturnType<typeof normalize>>;
  try{raw=decodeDeliveryPhotoBase64(input.data);canonical=await normalize(raw,input.name);}catch(cause){return Response.json({error:proDocRejectedMessage(cause),reason:cause instanceof ProDocRejected?cause.reason:'type'},{status:400,headers});}
  const sha256=digest(canonical.bytes),name=canonicalWorkFileName(input.name,canonical.mimeType);
  const reserved=await a.db.rpc('pro_work_file_reserve',{p_actor:a.user.id,p_input:{fileId:input.fileId,workId:input.workId,sourceName:input.name,name,mimeType:canonical.mimeType,rawSha256:digest(raw),sha256,sizeBytes:canonical.bytes.length}});
  if(reserved.error)return reserved.error.hint==='pro_file_quota'?Response.json({error:'Se alcanzó el espacio de archivos de la cuenta.',reason:'quota'},{status:429,headers}):dbError(reserved.error);
  const reservation=z.object({file:workFileSchema,objectPath:pathSchema}).strict().parse(reserved.data),file=reservation.file;
  const expectedPath=a.user.id+'/'+input.fileId+proDocExtension(canonical.mimeType);
  if(reservation.objectPath!==expectedPath||file.id!==input.fileId||file.workId!==input.workId||file.name!==name||file.mimeType!==canonical.mimeType||file.sha256!==sha256||file.sizeBytes!==canonical.bytes.length)return fail(503,'No se pudo comprobar la reserva del archivo.');
  const bucket=a.db.storage.from(bucketName),uploaded=await bucket.upload(expectedPath,canonical.bytes,{contentType:canonical.mimeType,upsert:false,cacheControl:'0'});
  if(uploaded.error&&String((uploaded.error as {statusCode?:string|number}).statusCode)!=='409')return fail(503,'No se pudo completar la subida. Reintente el mismo archivo.');
  // Existing paths are never trusted or overwritten: verify stored canonical bytes.
  const stored=await verifyStoredObject(bucket,expectedPath,canonical.bytes.length,sha256);if(stored==='missing')return fail(503,'No se pudo comprobar la subida.');
  if(stored==='mismatch')return fail(503,'El archivo almacenado no coincide. Se conservó el intento sin sobrescribirlo.');
  const ready=await a.db.rpc('pro_work_file_ready',{p_actor:a.user.id,p_file:input.fileId,p_sha256:sha256});if(ready.error)return dbError(ready.error);
  return Response.json(ready.data,{headers});
 }catch{return fail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
