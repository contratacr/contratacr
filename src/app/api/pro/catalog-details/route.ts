import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {decodeDeliveryPhotoBase64} from '@/lib/pro/delivery-photo-base64';
import {WORK_FILE_MAX_BYTES} from '@/lib/pro/work-files';
import {productDetailMutationSchema,productDetailSchema} from '@/lib/pro/catalog-details';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 7C: catalog item image and preferred vendor. Image: JSON base64 body (same bounded pattern
 * as company files) → sharp (JPEG/PNG/WebP in, private JPEG out) → bucket pro-catalog-images
 * <owner>/<image>.jpg → SQL writer (CAS + idempotent). Bytes are served only to the owner, checked
 * against the stored SHA-256. A replaced image's previous object is removed after the commit.
 */
const bucket='pro-catalog-images';
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');
  if(q.view==='image'){
   const productId=z.string().min(1).max(160).parse(q.productId);const r=await a.db.rpc('pro_product_image_read',{p_user:a.user.id,p_product:productId});if(r.error)return proDbError(r.error,'El artículo cambió.');if(!r.data)return proFail(404,'Sin imagen.');
   const meta=z.object({objectPath:z.string(),sha256:z.string(),sizeBytes:z.number().int().positive()}).parse(r.data);
   const object=await a.db.storage.from(bucket).download(meta.objectPath);if(object.error||!object.data)return proFail(503,'No se pudo recuperar la imagen.');
   const bytes=new Uint8Array(await object.data.arrayBuffer());if(bytes.length!==meta.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==meta.sha256)return proFail(503,'La imagen no coincide.');
   return new Response(bytes,{headers:{...headers,'Content-Type':'image/jpeg','Content-Length':String(bytes.length),'Cross-Origin-Resource-Policy':'same-origin'}});
  }
  const ids=z.array(z.string().min(1).max(160)).min(1).max(50).parse((q.ids??'').split(',').filter(Boolean));
  const r=await a.db.rpc('pro_product_details_read',{p_user:a.user.id,p_products:ids});if(r.error)return proDbError(r.error,'El catálogo cambió.');
  return Response.json({items:z.record(z.string(),productDetailSchema).parse(r.data)},{headers});
 }catch{return proFail(400,'Consulta inválida.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'catalog-details-'+a.user.id,30,60000);if(limited)return limited;
 let input;try{input=productDetailMutationSchema.parse(await proBoundedJson(req,Math.ceil(WORK_FILE_MAX_BYTES*4/3)+8192));}catch{return proFail(400,'Revise la imagen o el proveedor (máximo '+Math.round(WORK_FILE_MAX_BYTES/1048576)+' MB).');}
 let uploaded:string|null=null;
 try{
  let payload:Record<string,unknown>;
  if(input.action==='upload_image'){
   let jpeg:Buffer;
   try{const raw=decodeDeliveryPhotoBase64(input.data);if(raw.length>WORK_FILE_MAX_BYTES)throw Error();const image=sharp(raw,{limitInputPixels:24_000_000,animated:false}),meta=await image.metadata();if(!['jpeg','png','webp'].includes(meta.format||''))throw Error();jpeg=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:82}).toBuffer();}
   catch{return proFail(400,'Use una imagen JPEG, PNG o WebP de hasta '+Math.round(WORK_FILE_MAX_BYTES/1048576)+' MB.');}
   const imageId=crypto.randomUUID(),objectPath=a.user.id+'/'+imageId+'.jpg';
   const put=await a.db.storage.from(bucket).upload(objectPath,jpeg,{contentType:'image/jpeg',upsert:false,cacheControl:'0'});if(put.error)return proFail(503,'No se pudo guardar la imagen.');uploaded=objectPath;
   payload={action:'set_image',actionId:input.actionId,productId:input.productId,revision:input.revision,imageId,objectPath,sha256:createHash('sha256').update(jpeg).digest('hex'),sizeBytes:jpeg.length};
  }else payload=input;
  const r=await a.db.rpc('pro_product_details_mutate',{p_user:a.user.id,p_input:payload});
  if(r.error){if(uploaded)await a.db.storage.from(bucket).remove([uploaded]);if(r.error.code==='P0002')return proFail(404,'El artículo ya no está disponible.');return proDbError(r.error,'El artículo cambió. Actualice antes de guardar.');}
  const result=r.data as {detail:unknown;previousPath:string|null;replayed?:boolean};
  if(result.replayed&&uploaded)await a.db.storage.from(bucket).remove([uploaded]);
  if(result.previousPath&&!result.replayed)await a.db.storage.from(bucket).remove([result.previousPath]);
  return Response.json({detail:productDetailSchema.parse(result.detail)},{headers});
 }catch{if(uploaded)await a.db.storage.from(bucket).remove([uploaded]).catch(()=>null);return proFail(503,'No se pudo comprobar el guardado. Reintente.');}
}
