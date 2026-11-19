import {proCustomerReader} from '@/lib/pro/route-common';
import {z} from 'zod';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {decodeDeliveryPhotoBase64} from '@/lib/pro/delivery-photo-base64';
import {canonicalWorkFileName,workFileMutationSchema,workFileSchema,WORK_FILE_MAX_BYTES} from '@/lib/pro/work-files';
import {PRO_FILE_BODY_MAX,PRO_FILE_MAX_BYTES} from '@/lib/pro/file-limit';
const bucketName='pro-work-files',headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(error.code==='40001'?409:error.code==='42501'?403:error.code==='54000'?429:['22023','22008','22007','22021','23514','23505','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'El archivo o destinatario cambió. Actualice antes de compartir.':'No se pudo completar la operación.');
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const pathSchema=z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|pdf)$/);
const binarySchema=z.object({objectPath:pathSchema,name:z.string().min(1).max(160),mimeType:z.enum(['image/jpeg','application/pdf']),sizeBytes:z.number().int().positive().max(WORK_FILE_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
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
async function normalize(raw:Buffer){
 if(/^%PDF-[12]\.[0-9]/.test(raw.subarray(0,8).toString('latin1'))){
  // A structural boundary check, NOT a PDF sanitizer. Downloads are attachments.
  if(!/%%EOF[\t\r\n ]*$/.test(raw.subarray(Math.max(0,raw.length-1024)).toString('latin1')))throw Error('PDF EOF missing');
  return{bytes:raw,mimeType:'application/pdf' as const};
 }
 const image=sharp(raw,{limitInputPixels:24_000_000,animated:false}),meta=await image.metadata();
 if(!['jpeg','png','webp'].includes(meta.format||'')||(meta.pages??1)>1)throw Error('Unsupported image');
 // Re-encoding strips EXIF/GPS; orientation is applied before metadata removal.
 const bytes=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:80}).toBuffer();
 if(bytes.length>PRO_FILE_MAX_BYTES)throw Error('Normalized image too large');
 return{bytes,mimeType:'image/jpeg' as const};
}
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await actor(req);if(a.error)return a.error;const q=new URL(req.url).searchParams;
  if(q.has('fileId')&&q.size===1){
   const id=z.string().uuid().safeParse(q.get('fileId'));if(!id.success)return fail(400,'Archivo inválido.');
   // Reauthorize every binary request; never return a signed or public storage URL.
   const access=await a.db.rpc('pro_work_file_download',{p_actor:a.user.id,p_file:id.data});if(access.error)return dbError(access.error);if(!access.data)return fail(404,'Archivo no disponible.');
   const metadata=binarySchema.parse(access.data),extension=metadata.mimeType==='application/pdf'?'.pdf':'.jpg';
   if(metadata.objectPath.split('/')[1]!==id.data+extension||canonicalWorkFileName(metadata.name,metadata.mimeType)!==metadata.name)return fail(503,'No se pudo comprobar el archivo.');
   const download=await a.db.storage.from(bucketName).download(metadata.objectPath);if(download.error||!download.data||download.data.size!==metadata.sizeBytes)return fail(503,'No se pudo abrir el archivo.');
   const bytes=new Uint8Array(await download.data.arrayBuffer());if(digest(bytes)!==metadata.sha256)return fail(503,'No se pudo comprobar el archivo.');
   const encoded=encodeURIComponent(metadata.name).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
   return new Response(bytes,{headers:{...headers,'Content-Type':metadata.mimeType,'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="file${extension}"; filename*=UTF-8''${encoded}`,'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'}});
  }
  const after=q.has('after')?z.string().uuid().safeParse(q.get('after')):null;if(after&&!after.success)return fail(400,'Consulta inválida.');
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
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'work-files-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=workFileMutationSchema.parse(await bounded(req));}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise el archivo.');}
  if(input.action==='publish'){
   const result=await a.db.rpc('pro_work_file_publish',{p_actor:a.user.id,p_input:input});if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
  }
  let raw:Buffer,canonical:Awaited<ReturnType<typeof normalize>>;
  try{raw=decodeDeliveryPhotoBase64(input.data);canonical=await normalize(raw);}catch{return fail(400,'Use una foto JPG, PNG o WebP, o un PDF de hasta 20 MB.');}
  const sha256=digest(canonical.bytes),name=canonicalWorkFileName(input.name,canonical.mimeType);
  const reserved=await a.db.rpc('pro_work_file_reserve',{p_actor:a.user.id,p_input:{fileId:input.fileId,workId:input.workId,sourceName:input.name,name,mimeType:canonical.mimeType,rawSha256:digest(raw),sha256,sizeBytes:canonical.bytes.length}});
  if(reserved.error)return dbError(reserved.error);
  const reservation=z.object({file:workFileSchema,objectPath:pathSchema}).strict().parse(reserved.data),file=reservation.file;
  const expectedPath=a.user.id+'/'+input.fileId+(canonical.mimeType==='application/pdf'?'.pdf':'.jpg');
  if(reservation.objectPath!==expectedPath||file.id!==input.fileId||file.workId!==input.workId||file.name!==name||file.mimeType!==canonical.mimeType||file.sha256!==sha256||file.sizeBytes!==canonical.bytes.length)return fail(503,'No se pudo comprobar la reserva del archivo.');
  const bucket=a.db.storage.from(bucketName),uploaded=await bucket.upload(expectedPath,canonical.bytes,{contentType:canonical.mimeType,upsert:false,cacheControl:'0'});
  if(uploaded.error&&String((uploaded.error as {statusCode?:string|number}).statusCode)!=='409')return fail(503,'No se pudo completar la subida. Reintente el mismo archivo.');
  // Existing paths are never trusted or overwritten: verify stored canonical bytes.
  const stored=await bucket.download(expectedPath);if(stored.error||!stored.data||stored.data.size!==canonical.bytes.length)return fail(503,'No se pudo comprobar la subida.');
  const verified=new Uint8Array(await stored.data.arrayBuffer());if(digest(verified)!==sha256)return fail(503,'El archivo almacenado no coincide. Se conservó el intento sin sobrescribirlo.');
  const ready=await a.db.rpc('pro_work_file_ready',{p_actor:a.user.id,p_file:input.fileId,p_sha256:sha256});if(ready.error)return dbError(ready.error);
  return Response.json(ready.data,{headers});
 }catch{return fail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
