import {createHash} from 'node:crypto';
import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit,enforceRateLimitKey} from '@/lib/rate-limit';
import {decodeDeliveryPhotoBase64} from '@/lib/pro/delivery-photo-base64';
import {normalizeCompanyFile} from '@/lib/pro/company-file-normalize';
import {canonicalWorkFileName} from '@/lib/pro/work-files';
import {BID_PORTAL_FILE_BODY_MAX,bidPortalFileDownloadSchema,bidPortalFileMutationSchema,bidPortalFileSchema} from '@/lib/pro/bid-portal';
import {BidPortalConfigError,bidPortalBucket,bidPortalHash,bidPortalSession} from '@/lib/pro/bid-portal-server';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';

// Round 4B: PUBLIC vendor side of the bid portal attachments (development only, no ContrataCR
// account). Lives under /api/pro/bid-portal so the vendor's httpOnly session cookie (path
// /api/pro/bid-portal) is sent. Same bytes contract as job files; only the vendor of that
// invitation and the owner of the bid can read a file; nothing is e-mailed.
const bucketName='pro-bid-portal-files';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const fail=(status:number,reason:string,error:string)=>Response.json({error,reason},{status,headers});
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const noStore=(limited:Response|null)=>{if(limited)for(const [k,v] of Object.entries(headers))limited.headers.set(k,v);return limited;};
function dbFailure(error:{code?:string;hint?:string}){
 if(error.code==='42501')return fail(401,'session','Esta invitación ya no está disponible. Pida un enlace nuevo.');
 if(error.hint==='pro_bid_portal_closed')return fail(409,'closed','La licitación ya cerró; no se aceptan más adjuntos.');
 if(error.code==='CR429')return fail(429,'limit','Se alcanzó el máximo de adjuntos. Quite uno antes de agregar otro.');
 if(['22023','22P02','23514','23505'].includes(error.code||''))return fail(400,'invalid','Revise el archivo.');
 return fail(503,'unavailable','No se pudo comprobar el adjunto. Reintente la misma operación.');
}
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 const limited=noStore(await enforceRateLimit(req,'bid-portal-file-read',60,60000));if(limited)return limited;
 const q=new URL(req.url).searchParams;
 for(const key of q.keys())if(!['fileId','link'].includes(key))return fail(400,'invalid','Consulta inválida.');
 const file=z.string().uuid().safeParse(q.get('fileId')),link=q.get('link');
 if(!file.success||q.getAll('fileId').length!==1||q.getAll('link').length>1||link!==null&&!z.string().uuid().safeParse(link).success)return fail(400,'invalid','Consulta inválida.');
 const token=bidPortalSession(req,link);if(!token)return fail(401,'session','Abra el enlace de invitación que recibió.');
 const perSession=noStore(await enforceRateLimitKey('bid-portal-file-read-session:'+bidPortalBucket(token),60,60000));if(perSession)return perSession;
 try{
  const db=createAdminClient();
  const access=await db.rpc('pro_bid_portal_file_vendor_download',{p_session_hash:bidPortalHash(token,'session'),p_file:file.data});
  if(access.error)return dbFailure(access.error);
  if(!access.data)return fail(404,'missing','Adjunto no disponible.');
  const meta=bidPortalFileDownloadSchema.parse(access.data),extension=meta.mimeType==='application/pdf'?'.pdf':'.jpg';
  if(meta.objectPath.split('/')[1]!==file.data+extension)return fail(503,'unavailable','No se pudo comprobar el adjunto.');
  const download=await db.storage.from(bucketName).download(meta.objectPath);
  if(download.error||!download.data||download.data.size!==meta.sizeBytes)return fail(503,'unavailable','No se pudo abrir el adjunto.');
  const bytes=new Uint8Array(await download.data.arrayBuffer());if(digest(bytes)!==meta.sha256)return fail(503,'unavailable','No se pudo comprobar el adjunto.');
  const encoded=encodeURIComponent(meta.name).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
  return new Response(bytes,{headers:{...headers,'Content-Type':meta.mimeType,'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="file${extension}"; filename*=UTF-8''${encoded}`,'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'}});
 }catch(cause){return cause instanceof BidPortalConfigError?fail(503,'unavailable','El portal de proveedores no está disponible en este servidor.'):fail(503,'unavailable','No se pudo abrir el adjunto. Reintente.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return fail(403,'origin','Origen no autorizado.');
 const limited=noStore(await enforceRateLimit(req,'bid-portal-file-write',30,60000));if(limited)return limited;
 let input;try{input=bidPortalFileMutationSchema.parse(await proBoundedJson(req,BID_PORTAL_FILE_BODY_MAX));}catch(cause){return fail(cause instanceof RangeError?413:400,'invalid','Use una foto JPG, PNG o WebP, o un PDF de hasta 20 MB.');}
 const token=bidPortalSession(req,input.link);if(!token)return fail(401,'session','Abra el enlace de invitación que recibió.');
 const perSession=noStore(await enforceRateLimitKey('bid-portal-file-write-session:'+bidPortalBucket(token),20,60000));if(perSession)return perSession;
 try{
  const db=createAdminClient(),hash=bidPortalHash(token,'session');
  if(input.action==='remove'){
   const removed=await db.rpc('pro_bid_portal_file_remove',{p_session_hash:hash,p_file:input.fileId});
   return removed.error?dbFailure(removed.error):Response.json(removed.data,{headers});
  }
  let raw:Buffer,canonical:Awaited<ReturnType<typeof normalizeCompanyFile>>;
  try{raw=decodeDeliveryPhotoBase64(input.data);canonical=await normalizeCompanyFile(raw);}catch{return fail(400,'invalid','Use una foto JPG, PNG o WebP, o un PDF de hasta 20 MB.');}
  let name:string;try{name=canonicalWorkFileName(input.name,canonical.mimeType);}catch{return fail(400,'invalid','Revise el nombre del archivo.');}
  const sha256=digest(canonical.bytes);
  const reserved=await db.rpc('pro_bid_portal_file_reserve',{p_session_hash:hash,p_input:{fileId:input.fileId,sourceName:input.name,name,mimeType:canonical.mimeType,rawSha256:digest(raw),sha256,sizeBytes:canonical.bytes.length}});
  if(reserved.error)return dbFailure(reserved.error);
  const reservation=z.object({file:bidPortalFileSchema.extend({ready:z.boolean()}),objectPath:z.string()}).strict().parse(reserved.data);
  const extension=canonical.mimeType==='application/pdf'?'.pdf':'.jpg';
  if(!reservation.objectPath.endsWith('/'+input.fileId+extension)||reservation.file.id!==input.fileId||reservation.file.sha256!==sha256||reservation.file.sizeBytes!==canonical.bytes.length)return fail(503,'unavailable','No se pudo comprobar la reserva del adjunto.');
  const bucket=db.storage.from(bucketName);
  if(!reservation.file.ready){
   const uploaded=await bucket.upload(reservation.objectPath,canonical.bytes,{contentType:canonical.mimeType,upsert:false,cacheControl:'0'});
   if(uploaded.error&&String((uploaded.error as {statusCode?:string|number}).statusCode)!=='409')return fail(503,'unavailable','No se pudo completar la subida. Reintente el mismo archivo.');
   // Existing paths are never trusted or overwritten: verify the stored bytes.
   const stored=await bucket.download(reservation.objectPath);if(stored.error||!stored.data||stored.data.size!==canonical.bytes.length)return fail(503,'unavailable','No se pudo comprobar la subida.');
   if(digest(new Uint8Array(await stored.data.arrayBuffer()))!==sha256)return fail(503,'unavailable','El archivo almacenado no coincide. Se conservó el intento sin sobrescribirlo.');
  }
  const ready=await db.rpc('pro_bid_portal_file_ready',{p_session_hash:hash,p_file:input.fileId,p_sha256:sha256});
  if(ready.error)return dbFailure(ready.error);
  return Response.json(ready.data,{headers});
 }catch(cause){return cause instanceof BidPortalConfigError?fail(503,'unavailable','El portal de proveedores no está disponible en este servidor.'):fail(503,'unavailable','No se pudo comprobar el adjunto. Reintente la misma operación.');}
}
