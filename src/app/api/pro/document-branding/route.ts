import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {readBoundedBody} from '@/lib/pro/bounded-body';
import {PRO_FILE_BODY_MAX} from '@/lib/pro/file-limit';
import {decodeDeliveryPhotoBase64} from '@/lib/pro/delivery-photo-base64';
import {normalizeCompanyFile} from '@/lib/pro/company-file-normalize';
import {documentBrandingInputSchema,documentBrandingSchema} from '@/lib/pro/document-branding';
import {DOCUMENT_LOGO_BUCKET} from '@/lib/pro/document-branding-server';

/**
 * Round 9: company branding of printed documents (theme, header/footer lines, logo). GET reads (and
 * ?logo=1 serves the stored logo to the owner for the preview); POST saves (settings.write for the role
 * gate). The logo is normalised to JPG (≤ 1 MiB) and stored privately; prints embed it.
 */
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw||Object.keys(raw).some(k=>k!=='logo')||raw.logo!==undefined&&raw.logo!=='1')return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_document_branding_read',{p_actor:a.user.id});if(r.error)return proDbError(r.error,'La marca cambió.');
  const branding=documentBrandingSchema.parse(r.data);
  if(raw.logo==='1'){
   if(!branding.logo)return proFail(404,'Sin logo.');const file=await a.db.storage.from(DOCUMENT_LOGO_BUCKET).download(branding.logo.path);if(file.error||!file.data)return proFail(503,'No se pudo abrir el logo.');
   const bytes=new Uint8Array(await file.data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==branding.logo.sha256)return proFail(503,'No se pudo comprobar el logo.');
   return new Response(bytes,{headers:{...headers,'Content-Type':'image/jpeg','Content-Length':String(bytes.length),'Content-Security-Policy':"sandbox; default-src 'none'",'Cross-Origin-Resource-Policy':'same-origin'}});
  }
  return Response.json(branding,{headers});
 }catch{return proFail(503,'No se pudo cargar la marca de sus documentos.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'document-branding-'+a.user.id,20,60000);if(limited)return limited;
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return proFail(400,'Datos inválidos.');
  let input;try{input=documentBrandingInputSchema.parse(JSON.parse(new TextDecoder().decode(await readBoundedBody(req,PRO_FILE_BODY_MAX))));}catch{return proFail(400,'Revise los datos de la marca.');}
  let logo:unknown=input.logo;
  if(input.logo&&typeof input.logo==='object'){
   let normalized;try{normalized=await normalizeCompanyFile(decodeDeliveryPhotoBase64(input.logo.base64) as Buffer);}catch{return proFail(400,'Use una imagen JPG, PNG o WebP.');}
   if(normalized.mimeType!=='image/jpeg')return proFail(400,'El logo debe ser una imagen (JPG, PNG o WebP).');
   if(normalized.bytes.length>1048576)return proFail(400,'El logo debe pesar como máximo 1 MB.');
   const path=await a.db.rpc('pro_document_branding_logo_path',{p_actor:a.user.id,p_file:input.actionId});if(path.error)return proDbError(path.error,'La marca cambió.');
   const stored=await a.db.storage.from(DOCUMENT_LOGO_BUCKET).upload(String(path.data),normalized.bytes,{contentType:'image/jpeg',upsert:true});if(stored.error)return proFail(503,'No se pudo guardar el logo. Reintente: no se duplicará.');
   logo={path:String(path.data),sha256:createHash('sha256').update(normalized.bytes).digest('hex'),bytes:normalized.bytes.length};
  }
  const r=await a.db.rpc('pro_document_branding_save',{p_actor:a.user.id,p_input:{actionId:input.actionId,revision:input.revision,theme:input.theme,displayName:input.displayName,tagline:input.tagline,footer:input.footer,logo,...(input.template?{template:input.template}:{})}});
  if(r.error)return proDbError(r.error,'La marca cambió en otra pestaña. Recargue antes de guardar.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente: no se duplicará.');}
}
