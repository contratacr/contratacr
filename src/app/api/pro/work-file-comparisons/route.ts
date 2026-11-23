import {z} from 'zod';
import {createHash} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proCustomerReader,proDbError,proFail,proQuery,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';
import {comparisonClientSchema,comparisonInputSchema,comparisonOwnerSchema,comparisonResultSchema} from '@/lib/pro/file-comparisons';
import {PRO_DOC_PATH,proDocExtension} from '@/lib/pro/file-formats';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 33: before/after photo comparisons of a job. SQL is the authority (pro_work_file_comparisons_*): CAS revision
 * (40001 -> 409), idempotent receipts, immutable history. The customer reads (list and each image) run as the linked
 * customer (also the owner's preview, read only) and are reauthorized on EVERY request: no signed or public URL is ever
 * returned; a trashed or hidden photo, the "Files and photos" switch off or an archived comparison answer 404.
 */
const headers={...proRouteHeaders,'Referrer-Policy':'no-referrer','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"};
const fail=(status:number,error:string,reason?:string)=>Response.json(reason?{error,reason}:{error},{status,headers});
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const binary=z.object({objectPath:z.string().regex(PRO_DOC_PATH),name:z.string().min(1).max(160),displayName:z.string().min(1).max(160),mimeType:z.literal('image/jpeg'),sizeBytes:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return fail(400,'Consulta inválida.');
  const keys=Object.keys(q).sort().join();
  if(keys==='workId'){
   const work=z.string().trim().min(1).max(160).safeParse(q.workId);if(!work.success)return fail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_work_file_comparisons_read',{p_actor:a.user.id,p_work:work.data});
   if(result.error)return proDbError(result.error,'Los datos cambiaron. Actualice.');
   if(!result.data)return fail(404,'Trabajo no disponible.');
   return Response.json(comparisonOwnerSchema.parse(result.data),{headers});
  }
  const request=z.string().uuid().safeParse(q.requestId);if(!request.success)return fail(400,'Consulta inválida.');
  const reader=await proCustomerReader(a.db,a.user.id,request.data);
  if(keys==='requestId'){
   const result=await a.db.rpc('pro_work_file_comparisons_client_read',{p_actor:reader,p_request:request.data});
   if(result.error)return proDbError(result.error,'Los datos cambiaron. Actualice.');
   if(!result.data)return fail(404,'Cita no disponible.');
   return Response.json(comparisonClientSchema.parse(result.data),{headers});
  }
  if(keys==='comparisonId,requestId,side'){
   const id=z.string().uuid().safeParse(q.comparisonId),side=z.enum(['before','after']).safeParse(q.side);if(!id.success||!side.success)return fail(400,'Consulta inválida.');
   // Reauthorize every image request; never return a signed or public storage URL.
   const access=await a.db.rpc('pro_work_file_comparison_client_download',{p_actor:reader,p_request:request.data,p_comparison:id.data,p_side:side.data});
   if(access.error)return proDbError(access.error,'Los datos cambiaron. Actualice.');if(!access.data)return fail(404,'Imagen no disponible.');
   const meta=binary.parse(access.data),extension=proDocExtension(meta.mimeType);
   if(!meta.objectPath.endsWith(extension))return fail(503,'No se pudo comprobar el archivo.');
   const download=await a.db.storage.from('pro-work-files').download(meta.objectPath);if(download.error||!download.data||download.data.size!==meta.sizeBytes)return fail(503,'No se pudo abrir el archivo.');
   const bytes=new Uint8Array(await download.data.arrayBuffer());if(digest(bytes)!==meta.sha256)return fail(503,'No se pudo comprobar el archivo.');
   const encoded=encodeURIComponent(meta.displayName).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
   return new Response(bytes,{headers:{...headers,'Content-Type':meta.mimeType,'Content-Length':String(bytes.length),'Content-Disposition':`inline; filename="photo${extension}"; filename*=UTF-8''${encoded}`,'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'}});
  }
  return fail(400,'Consulta inválida.');
 }catch{return fail(503,'No se pudieron cargar las comparaciones. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return fail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'work-file-comparisons-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=comparisonInputSchema.parse(await proBoundedJson(req,4096));}catch{return fail(400,'Revise los datos.');}
  const result=await a.db.rpc('pro_work_file_comparisons_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error){
   if(result.error.hint==='pro_comparison_same')return fail(400,'Elija dos fotos distintas.','pro_comparison_same');
   if(result.error.hint==='pro_comparison_photo')return fail(400,'Una de las fotos ya no está disponible. Elija otra.','pro_comparison_photo');
   if(result.error.hint==='pro_comparison_limit')return fail(400,'Se alcanzó el máximo de 20 comparaciones por trabajo.','pro_comparison_limit');
   return proDbError(result.error,'La comparación cambió en otra pestaña. Recargue.');
  }
  return Response.json(comparisonResultSchema.parse(result.data),{headers});
 }catch{return fail(503,'No se pudo guardar. Reintente: no se duplicará.');}
}
