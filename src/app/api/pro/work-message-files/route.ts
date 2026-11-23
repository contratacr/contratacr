import {z} from 'zod';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proCustomerReader,proDbError,proFail,proQuery,proSameOrigin} from '@/lib/pro/route-common';
import {decodeDeliveryPhotoBase64} from '@/lib/pro/delivery-photo-base64';
import {normalizeCompanyFile} from '@/lib/pro/company-file-normalize';
import {canonicalWorkFileName} from '@/lib/pro/work-files';
import {PRO_FILE_BODY_MAX} from '@/lib/pro/file-limit';
import {readBoundedBody} from '@/lib/pro/bounded-body';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 8: attachments of the job messages (Round 7C) — photos (PNG/WebP become JPG) and PDF up to
 * 20 MiB in the private bucket `pro-work-message-files`. Only the two sides of the thread can list,
 * upload or download (decided in SQL); downloads are reauthorized and served here, never as a
 * public or signed URL. Nothing is sent outside ContrataCR.
 */
const bucket='pro-work-message-files';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const uuid=z.string().uuid();
const meta=z.object({objectPath:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|pdf)$/),name:z.string().min(1).max(160),mimeType:z.enum(['image/jpeg','application/pdf']),sizeBytes:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const upload=z.object({requestId:uuid,actionId:uuid,body:z.string().max(2000),name:z.string().trim().min(1).max(160),base64:z.string().min(4)}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  if(Object.keys(raw).length===1&&raw.fileId){
   const id=uuid.safeParse(raw.fileId);if(!id.success)return proFail(400,'Archivo inválido.');
   const access=await a.db.rpc('pro_work_message_file_download',{p_actor:a.user.id,p_file:id.data});if(access.error)return proDbError(access.error,'El archivo cambió.');if(!access.data)return proFail(404,'Archivo no disponible.');
   const m=meta.parse(access.data);const file=await a.db.storage.from(bucket).download(m.objectPath);
   if(file.error||!file.data||file.data.size!==m.sizeBytes)return proFail(503,'No se pudo abrir el archivo.');
   const bytes=new Uint8Array(await file.data.arrayBuffer());if(digest(bytes)!==m.sha256)return proFail(503,'No se pudo comprobar el archivo.');
   const extension=m.mimeType==='application/pdf'?'.pdf':'.jpg',encoded=encodeURIComponent(m.name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
   const inline=m.mimeType==='image/jpeg'&&new URL(req.url).searchParams.size===1&&req.headers.get('sec-fetch-dest')==='image';
   return new Response(bytes,{headers:{...headers,'Content-Type':m.mimeType,'Content-Length':String(bytes.length),'Content-Disposition':`${inline?'inline':'attachment'}; filename="file${extension}"; filename*=UTF-8''${encoded}`,'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'}});
  }
  const parsed=z.object({requestId:uuid}).strict().safeParse(raw);if(!parsed.success)return proFail(400,'Consulta inválida.');
  // Same reader identity as the thread (the owner previews the customer side through its own reader).
  const r=await a.db.rpc('pro_work_message_files_read',{p_actor:await proCustomerReader(a.db,a.user.id,parsed.data.requestId),p_request:parsed.data.requestId});
  if(r.error)return proDbError(r.error,'Los adjuntos cambiaron.');return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudieron cargar los adjuntos.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'work-message-files-'+a.user.id,20,60000);if(limited)return limited;
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return proFail(400,'Adjunto inválido.');
  let input;try{input=upload.parse(JSON.parse(new TextDecoder().decode(await readBoundedBody(req,PRO_FILE_BODY_MAX))));}catch{return proFail(400,'Elija una foto o un PDF de hasta 20 MB.');}
  let normalized;try{normalized=await normalizeCompanyFile(decodeDeliveryPhotoBase64(input.base64) as Buffer);}catch{return proFail(400,'Elija una foto JPG, PNG o WebP o un PDF de hasta 20 MB.');}
  const name=canonicalWorkFileName(input.name,normalized.mimeType),sha=digest(normalized.bytes);
  // Side check and path come from SQL before any byte is stored.
  const path=await a.db.rpc('pro_work_message_file_path',{p_actor:a.user.id,p_request:input.requestId,p_file:input.actionId,p_mime:normalized.mimeType});if(path.error)return proDbError(path.error,'El hilo cambió.');
  const stored=await a.db.storage.from(bucket).upload(String(path.data),normalized.bytes,{contentType:normalized.mimeType,upsert:true});if(stored.error)return proFail(503,'No se pudo guardar el archivo. Reintente: no se duplicará.');
  const r=await a.db.rpc('pro_work_message_attach',{p_actor:a.user.id,p_input:{requestId:input.requestId,actionId:input.actionId,body:input.body,name,mimeType:normalized.mimeType,sizeBytes:normalized.bytes.length,sha256:sha}});
  if(r.error)return proDbError(r.error,'Los mensajes cambiaron.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el envío. Reintente: no se duplicará.');}
}
