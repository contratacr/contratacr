import 'server-only';
import {z} from 'zod';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proDbError,proFail,proQuery,proSameOrigin} from '@/lib/pro/route-common';
import {decodeDeliveryPhotoBase64} from '@/lib/pro/delivery-photo-base64';
import {normalizeCompanyFile} from '@/lib/pro/company-file-normalize';
import {canonicalWorkFileName} from '@/lib/pro/work-files';
import {PRO_FILE_BODY_MAX} from '@/lib/pro/file-limit';
import {readBoundedBody} from '@/lib/pro/bounded-body';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 9: attachments of subcontractor task comments, shared by the owner route
 * (/api/pro/subcontractors/files, through the role gate: team.manage to write) and the subcontractor
 * route (/api/pro/sub-portal/files, outside the substitution: always the real identity). SQL decides the
 * scope on every call (pro_sub_comment_scope); bytes live in the private bucket and are served here
 * after reauthorization and a SHA-256 check — never a public or signed URL.
 */
const bucket='pro-sub-comment-files';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const uuid=z.string().uuid();
const meta=z.object({objectPath:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|pdf)$/),name:z.string().min(1).max(160),mimeType:z.enum(['image/jpeg','application/pdf']),sizeBytes:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const upload=z.object({ownerId:uuid,accessId:uuid,taskId:uuid,actionId:uuid,body:z.string().max(1000),name:z.string().trim().min(1).max(160),base64:z.string().min(4)}).strict();
/** ownerSide: the owner route uses the (gate-substituted) account as owner, never a client value. */
export async function subCommentFilesGet(req:Request,ownerSide=false){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');if(ownerSide)raw.ownerId=a.user.id;
  const download=z.object({ownerId:uuid,fileId:uuid}).strict().safeParse(raw);
  if(download.success){
   const access=await a.db.rpc('pro_sub_comment_file_download',{p_actor:a.user.id,p_owner:download.data.ownerId,p_file:download.data.fileId});if(access.error)return proDbError(access.error,'El archivo cambió.');if(!access.data)return proFail(404,'Archivo no disponible.');
   const m=meta.parse(access.data);const file=await a.db.storage.from(bucket).download(m.objectPath);
   if(file.error||!file.data||file.data.size!==m.sizeBytes)return proFail(503,'No se pudo abrir el archivo.');
   const bytes=new Uint8Array(await file.data.arrayBuffer());if(digest(bytes)!==m.sha256)return proFail(503,'No se pudo comprobar el archivo.');
   const extension=m.mimeType==='application/pdf'?'.pdf':'.jpg',encoded=encodeURIComponent(m.name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
   const inline=m.mimeType==='image/jpeg'&&req.headers.get('sec-fetch-dest')==='image';
   return new Response(bytes,{headers:{...headers,'Content-Type':m.mimeType,'Content-Length':String(bytes.length),'Content-Disposition':`${inline?'inline':'attachment'}; filename="file${extension}"; filename*=UTF-8''${encoded}`,'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'}});
  }
  const list=z.object({ownerId:uuid,accessId:uuid}).strict().safeParse(raw);if(!list.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_sub_comment_files_read',{p_actor:a.user.id,p_owner:list.data.ownerId,p_access:list.data.accessId});
  if(r.error)return proDbError(r.error,'Los adjuntos cambiaron.');return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudieron cargar los adjuntos.');}
}
export async function subCommentFilesPost(req:Request,ownerSide=false){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'sub-comment-files-'+a.user.id,20,60000);if(limited)return limited;
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return proFail(400,'Adjunto inválido.');
  let input;try{const body=JSON.parse(new TextDecoder().decode(await readBoundedBody(req,PRO_FILE_BODY_MAX)));if(ownerSide&&body&&typeof body==='object')body.ownerId=a.user.id;input=upload.parse(body);}catch{return proFail(400,'Elija una foto o un PDF de hasta 20 MB.');}
  let normalized;try{normalized=await normalizeCompanyFile(decodeDeliveryPhotoBase64(input.base64) as Buffer);}catch{return proFail(400,'Elija una foto JPG, PNG o WebP o un PDF de hasta 20 MB.');}
  const name=canonicalWorkFileName(input.name,normalized.mimeType),sha=digest(normalized.bytes);
  // Scope and object path come from SQL before any byte is stored.
  const path=await a.db.rpc('pro_sub_comment_file_path',{p_actor:a.user.id,p_owner:input.ownerId,p_access:input.accessId,p_task:input.taskId,p_file:input.actionId,p_mime:normalized.mimeType});if(path.error)return proDbError(path.error,'La tarea cambió.');
  const stored=await a.db.storage.from(bucket).upload(String(path.data),normalized.bytes,{contentType:normalized.mimeType,upsert:true});if(stored.error)return proFail(503,'No se pudo guardar el archivo. Reintente: no se duplicará.');
  const r=await a.db.rpc('pro_sub_comment_attach',{p_actor:a.user.id,p_input:{ownerId:input.ownerId,accessId:input.accessId,taskId:input.taskId,actionId:input.actionId,body:input.body,name,mimeType:normalized.mimeType,sizeBytes:normalized.bytes.length,sha256:sha}});
  if(r.error)return proDbError(r.error,'Los comentarios cambiaron.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el envío. Reintente: no se duplicará.');}
}
