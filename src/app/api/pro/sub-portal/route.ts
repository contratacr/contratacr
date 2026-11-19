import {z} from 'zod';
import {PRO_DOC_MIMES,PRO_DOC_PATH,proDocExtension} from '@/lib/pro/file-formats';
import {createHash} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {subCode,subPortalInputSchema} from '@/lib/pro/round8';

/**
 * Round 8: subcontractor portal. Always the account's own identity (excluded from the company
 * workspace substitution in the role gate). Lists only the linked jobs (service, customer's name,
 * dates, its assigned tasks, key dates and shared files); comments and completes its tasks; accepts
 * an invitation code with the account's verified e-mail. Downloads are reauthorized in SQL.
 */
const bucket='pro-work-files';
const fileHeaders={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'};
// Ronda F2-D: job files can be any accepted document format (file-formats.ts).
const meta=z.object({objectPath:z.string().regex(PRO_DOC_PATH),name:z.string().min(1).max(160),mimeType:z.enum(PRO_DOC_MIMES)}).strict();
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  if(Object.keys(raw).length){
   const parsed=z.object({ownerId:z.string().uuid(),fileId:z.string().uuid()}).strict().safeParse(raw);if(!parsed.success)return proFail(400,'Consulta inválida.');
   const access=await a.db.rpc('pro_sub_file_download',{p_actor:a.user.id,p_owner:parsed.data.ownerId,p_file:parsed.data.fileId});if(access.error)return proDbError(access.error,'El archivo cambió.');if(!access.data)return proFail(404,'Archivo no disponible.');
   const m=meta.parse(access.data),file=await a.db.storage.from(bucket).download(m.objectPath);if(file.error||!file.data)return proFail(503,'No se pudo abrir el archivo.');
   const bytes=new Uint8Array(await file.data.arrayBuffer()),extension=proDocExtension(m.mimeType),encoded=encodeURIComponent(m.name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
   return new Response(bytes,{headers:{...fileHeaders,'Content-Type':m.mimeType,'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="file${extension}"; filename*=UTF-8''${encoded}`}});
  }
  const r=await a.db.rpc('pro_sub_portal_read',{p_actor:a.user.id});if(r.error)return proDbError(r.error,'Los trabajos cambiaron.');return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudieron cargar sus trabajos.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'sub-portal-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=subPortalInputSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise los datos.');}
  if(input.action==='accept'){
   const verified=a.user.email_confirmed_at&&a.user.email?a.user.email:null;
   const r=await a.db.rpc('pro_sub_accept',{p_actor:a.user.id,p_verified_email:verified,p_input:{actionId:input.actionId,tokenSha256:createHash('sha256').update(subCode(input.code)).digest('hex')}});
   if(r.error){if(r.error.code==='P0002')return proFail(404,'El código no es válido o ya venció.');if(r.error.code==='42501')return proFail(403,'Este código es para otro correo. Inicie sesión con la cuenta invitada.');return proDbError(r.error,'Ya tiene acceso con esta empresa.');}
   return Response.json(r.data,{headers});
  }
  const r=await a.db.rpc('pro_sub_portal_mutate',{p_actor:a.user.id,p_input:input});if(r.error)return proDbError(r.error,'La tarea cambió. Recargue.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el cambio. Reintente: no se duplicará.');}
}
