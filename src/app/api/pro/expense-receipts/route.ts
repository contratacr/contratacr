import {z} from 'zod';
import {createHash} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {decodeDeliveryPhotoBase64} from '@/lib/pro/delivery-photo-base64';
import {normalizeCompanyFile} from '@/lib/pro/company-file-normalize';
import {canonicalWorkFileName,workFileNameSchema,WORK_FILE_MAX_BYTES} from '@/lib/pro/work-files';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_FILE_BODY_MAX} from '@/lib/pro/file-limit';
import {PRO_ENABLED} from '@/lib/pro/enabled';
// Round 4B: one receipt (photo or PDF, same limits/normalization as job files) per internal expense.
// Private bucket; every download is reauthorized in SQL (owner only) and never returns a storage URL.
const bucketName='pro-expense-receipts';
const headers={...proRouteHeaders,'Referrer-Policy':'no-referrer','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"};
const conflict='El comprobante cambió. Actualice el gasto.';
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const id=z.string().uuid();
const mutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('attach'),expenseId:id,receiptId:id,name:workFileNameSchema,data:z.string().min(4).max(4*Math.ceil(WORK_FILE_MAX_BYTES/3))}).strict(),
 z.object({action:z.literal('remove'),expenseId:id,receiptId:id}).strict(),
]);
const metadataSchema=z.object({objectPath:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|pdf)$/),name:z.string().min(1).max(160),mimeType:z.enum(['image/jpeg','application/pdf']),sizeBytes:z.number().int().positive().max(WORK_FILE_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);const receipt=raw&&Object.keys(raw).length===1?id.safeParse(raw.receiptId):null;
  if(!receipt?.success)return proFail(400,'Comprobante inválido.');
  const access=await a.db.rpc('pro_expense_receipt_download',{p_user:a.user.id,p_receipt:receipt.data});if(access.error)return proDbError(access.error,conflict);if(!access.data)return proFail(404,'Comprobante no disponible.');
  const meta=metadataSchema.parse(access.data),extension=meta.mimeType==='application/pdf'?'.pdf':'.jpg';
  if(meta.objectPath!==a.user.id+'/'+receipt.data+extension)return proFail(503,'No se pudo comprobar el comprobante.');
  const download=await a.db.storage.from(bucketName).download(meta.objectPath);if(download.error||!download.data||download.data.size!==meta.sizeBytes)return proFail(503,'No se pudo abrir el comprobante.');
  const bytes=new Uint8Array(await download.data.arrayBuffer());if(digest(bytes)!==meta.sha256)return proFail(503,'No se pudo comprobar el comprobante.');
  const encoded=encodeURIComponent(meta.name).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
  return new Response(bytes,{headers:{...headers,'Content-Type':meta.mimeType,'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="comprobante${extension}"; filename*=UTF-8''${encoded}`,'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'}});
 }catch{return proFail(503,'No se pudo abrir el comprobante.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'expense-receipts-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=mutationSchema.parse(await proBoundedJson(req,PRO_FILE_BODY_MAX));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise el comprobante.');}
  if(input.action==='remove'){const result=await a.db.rpc('pro_expense_receipt_mutate',{p_user:a.user.id,p_input:input});if(result.error)return proDbError(result.error,conflict);return Response.json(result.data,{headers});}
  let canonical:Awaited<ReturnType<typeof normalizeCompanyFile>>;
  try{canonical=await normalizeCompanyFile(decodeDeliveryPhotoBase64(input.data));}catch{return proFail(400,'Use una foto JPG, PNG o WebP, o un PDF de hasta 20 MB.');}
  const sha256=digest(canonical.bytes),name=canonicalWorkFileName(input.name,canonical.mimeType),objectPath=a.user.id+'/'+input.receiptId+(canonical.mimeType==='application/pdf'?'.pdf':'.jpg');
  const bucket=a.db.storage.from(bucketName),uploaded=await bucket.upload(objectPath,canonical.bytes,{contentType:canonical.mimeType,upsert:false,cacheControl:'0'});
  if(uploaded.error&&String((uploaded.error as {statusCode?:string|number}).statusCode)!=='409')return proFail(503,'No se pudo completar la subida. Reintente el mismo archivo.');
  // An existing path is never overwritten: verify the stored bytes are this exact receipt.
  const stored=await bucket.download(objectPath);if(stored.error||!stored.data||stored.data.size!==canonical.bytes.length||digest(new Uint8Array(await stored.data.arrayBuffer()))!==sha256)return proFail(503,'No se pudo comprobar la subida.');
  const result=await a.db.rpc('pro_expense_receipt_mutate',{p_user:a.user.id,p_input:{action:'attach',expenseId:input.expenseId,receiptId:input.receiptId,objectPath,name,mimeType:canonical.mimeType,sizeBytes:canonical.bytes.length,sha256}});
  if(result.error)return proDbError(result.error,conflict);
  return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
