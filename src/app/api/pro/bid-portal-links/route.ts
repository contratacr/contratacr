import {enforceRateLimit} from '@/lib/rate-limit';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {createAdminClient} from '@/lib/supabase/admin';
import {BID_PORTAL_BODY_MAX,bidPortalFileDownloadSchema,bidPortalOwnerFilesQuerySchema,bidPortalOwnerMutationSchema,bidPortalOwnerQuerySchema} from '@/lib/pro/bid-portal';
import {BidPortalConfigError,bidPortalHash,bidPortalNewToken} from '@/lib/pro/bid-portal-server';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';

// Row 53: owner side of the vendor portal (development only). Links are copied by the owner;
// nothing is e-mailed. The token is random, returned to the owner once and only its keyed hash
// is stored. A retried create (same actionId) replays the receipt WITHOUT a token: the owner
// replaces the link to get a new one. Without PRO_BID_PORTAL_SECRET: 503 reason 'config'.
const conflict='El enlace cambió. Actualice antes de continuar.';
const notConfigured=()=>Response.json({error:'El portal de proveedores no está configurado en este servidor (falta PRO_BID_PORTAL_SECRET). No se creó ningún enlace.',reason:'config'},{status:503,headers:proRouteHeaders});
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
async function ownerDownload(db:ReturnType<typeof createAdminClient>,actor:string,raw:Record<string,string>){
 const file=z.object({fileId:z.string().uuid()}).strict().safeParse(raw);if(!file.success)return proFail(400,'Consulta inválida.');
 const access=await db.rpc('pro_bid_portal_file_owner_download',{p_actor:actor,p_file:file.data.fileId});
 if(access.error)return proDbError(access.error,conflict);if(!access.data)return proFail(404,'Adjunto no disponible.');
 const meta=bidPortalFileDownloadSchema.parse(access.data),extension=meta.mimeType==='application/pdf'?'.pdf':'.jpg';
 if(meta.objectPath.split('/')[0]!==actor||meta.objectPath.split('/')[1]!==file.data.fileId+extension)return proFail(503,'No se pudo comprobar el adjunto.');
 const download=await db.storage.from('pro-bid-portal-files').download(meta.objectPath);
 if(download.error||!download.data||download.data.size!==meta.sizeBytes)return proFail(503,'No se pudo abrir el adjunto.');
 const bytes=new Uint8Array(await download.data.arrayBuffer());if(digest(bytes)!==meta.sha256)return proFail(503,'No se pudo comprobar el adjunto.');
 const encoded=encodeURIComponent(meta.name).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
 return new Response(bytes,{headers:{...proRouteHeaders,'Content-Type':meta.mimeType,'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="file${extension}"; filename*=UTF-8''${encoded}`,'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'}});
}
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  // Round 4B: vendor attachments of a package, and the reauthorized download of one of them.
  if('fileId' in raw)return await ownerDownload(a.db,a.user.id,raw);
  if(raw.view==='files'){
   const files=bidPortalOwnerFilesQuerySchema.safeParse(raw);if(!files.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_bid_portal_files_owner_read',{p_actor:a.user.id,p_query:{workId:files.data.workId,id:files.data.id}});
   if(result.error)return proDbError(result.error,conflict);
   return result.data?Response.json(result.data,{headers:proRouteHeaders}):proFail(404,'Licitación no disponible.');
  }
  const parsed=bidPortalOwnerQuerySchema.safeParse(raw);if(!parsed.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_bid_portal_owner_read',{p_actor:a.user.id,p_query:parsed.data});
  if(result.error)return proDbError(result.error,conflict);
  return result.data?Response.json(result.data,{headers:proRouteHeaders}):proFail(404,'Licitación no disponible.');
 }catch{return proFail(503,'No se pudieron cargar los enlaces. Reintente.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'bid-portal-links-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=bidPortalOwnerMutationSchema.parse(await proBoundedJson(req,BID_PORTAL_BODY_MAX));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos del enlace.');}
  let token:string|null=null,tokenHash:string|null=null;
  if(input.action==='create_link'){try{token=bidPortalNewToken();tokenHash=bidPortalHash(token,'link');}catch(cause){if(cause instanceof BidPortalConfigError)return notConfigured();throw cause;}}
  const result=await a.db.rpc('pro_bid_portal_owner_mutate',{p_actor:a.user.id,p_input:tokenHash?{...input,tokenHash}:input});
  if(result.error)return proDbError(result.error,conflict);
  // Only a fresh create carries the token; a replay never shows it again.
  const data=result.data as {replayed?:boolean};
  return Response.json(token&&!data?.replayed?{...result.data,token}:result.data,{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo comprobar el enlace. Reintente la misma operación.');}
}
