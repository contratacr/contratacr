import {proCustomerReader} from '@/lib/pro/route-common';
import {z} from 'zod';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {deliveryMutationSchema} from '@/lib/pro/work-delivery';
import {DELIVERY_PHOTO_LIMIT} from '@/lib/pro/delivery-photo-recovery';
import {decodeDeliveryPhotoBase64} from '@/lib/pro/delivery-photo-base64';
import {PRO_ENABLED} from '@/lib/pro/enabled';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(error.code==='40001'?409:error.code==='42501'?403:error.code==='54000'?429:['22023','23514','23505','22P02'].includes(error.code||'')?400:503,error.code==='40001'?'El informe cambió. Actualice antes de guardar.':'No se pudo completar. Revise los datos y vuelva a intentar.');
async function actor(){const user=await safeGetUser(await createClient());if(!user)return{error:fail(401,'Inicie sesión.')};const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled,role').eq('id',user.id).maybeSingle();if(profile.error)return{error:fail(503,'No se pudo verificar la cuenta.')};if(!profile.data||profile.data.is_disabled||profile.data.role==='admin'&&!await getApiAdmin())return{error:fail(403,'Sin acceso.')};return{user,db};}
// Optional local recovery guard binds a request to its captured account before any RPC.
// This never grants access: the authenticated actor remains authoritative.
function expectedActor(req:Request,actorId:string){
 const expected=req.headers.get('x-pro-expected-actor');if(expected===null)return null;
 if(!/^http:\/\/127\.0\.0\.1:54321\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL??''))return fail(404,'No disponible.');
 if(!z.string().uuid().safeParse(expected).success)return fail(400,'Cuenta inválida.');
 return expected===actorId?null:fail(403,'La cuenta cambió. Vuelva a la cuenta del intento guardado.');
}
async function bounded(req:Request){if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error();const reader=req.body?.getReader();if(!reader)throw Error();let length=0;const chunks:Uint8Array[]=[];try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>4300000){await reader.cancel();throw Error();}chunks.push(part.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}return JSON.parse(new TextDecoder().decode(bytes));}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{const a=await actor();if(a.error)return a.error;const scopeError=expectedActor(req,a.user.id);if(scopeError)return scopeError;const q=new URL(req.url).searchParams;
  if(q.has('photo')){const id=z.string().uuid().parse(q.get('photo')),path=await a.db.rpc('pro_work_delivery_photo_path',{p_actor:a.user.id,p_id:id});if(path.error)return dbError(path.error);if(!path.data)return fail(404,'Fotografía no disponible.');const file=await a.db.storage.from('pro-work-delivery').download(path.data);if(file.error||!file.data)return fail(503,'No se pudo abrir la fotografía.');return new Response(new Uint8Array(await file.data.arrayBuffer()),{headers:{...headers,'Content-Type':'image/jpeg','Content-Security-Policy':"default-src 'none'"}});}
  const requestId=q.has('requestId')?z.string().uuid().parse(q.get('requestId')):null,workId=requestId?null:z.string().min(1).max(160).parse(q.get('workId')),after=q.has('after')?z.coerce.number().int().positive().parse(q.get('after')):null;
  const read=await a.db.rpc('pro_work_delivery_read',{p_actor:await proCustomerReader(a.db,a.user.id,requestId),p_work:workId,p_request:requestId,p_after:after});if(read.error)return dbError(read.error);return read.data?Response.json(read.data,{headers}):fail(404,'Informe no disponible.');
 }catch{return fail(400,'Consulta inválida.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{const a=await actor();if(a.error)return a.error;const scopeError=expectedActor(req,a.user.id);if(scopeError)return scopeError;const limited=await enforceRateLimit(req,'work-delivery-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=deliveryMutationSchema.parse(await bounded(req));}catch{return fail(400,'Revise el informe o la fotografía.');}
  if(input.action==='photo'){
   let jpeg:Buffer;try{const bytes=decodeDeliveryPhotoBase64(input.data);/* Round 7C: the shared decoder now allows 20 MiB; delivery photos keep their 3 MiB input limit. */if(bytes.length>DELIVERY_PHOTO_LIMIT)throw Error('Delivery photo too large');const image=sharp(bytes,{limitInputPixels:24_000_000,animated:false}),meta=await image.metadata();if(!['jpeg','png','webp'].includes(meta.format||'')||(meta.pages??1)>1)throw Error();jpeg=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toBuffer();if(jpeg.length>2097152)throw Error();}catch{return fail(400,'Use una fotografía JPG, PNG o WebP de hasta 3 MB.');}
   const reserved=await a.db.rpc('pro_work_delivery_mutate',{p_actor:a.user.id,p_input:{action:'photo',actionId:input.actionId,workId:input.workId,name:input.name,sha256:createHash('sha256').update(jpeg).digest('hex'),sizeBytes:jpeg.length}});if(reserved.error)return dbError(reserved.error);
   const uploaded=await a.db.storage.from('pro-work-delivery').upload(reserved.data.path,jpeg,{contentType:'image/jpeg',upsert:false,cacheControl:'0'});if(uploaded.error&&String((uploaded.error as {statusCode?:string}).statusCode)!=='409')return fail(503,'No se pudo completar la subida. Reintente la misma fotografía.');
   const ready=await a.db.rpc('pro_work_delivery_photo_ready',{p_actor:a.user.id,p_id:reserved.data.id});if(ready.error||!ready.data)return fail(503,'La fotografía se subió, pero falta confirmar su registro. Reintente.');return Response.json({id:reserved.data.id,ready:true},{headers});
  }
  const saved=await a.db.rpc('pro_work_delivery_mutate',{p_actor:a.user.id,p_input:input});if(saved.error)return dbError(saved.error);return Response.json(saved.data,{headers});
 }catch{return fail(503,'No se pudo confirmar el cambio. Puede reintentar sin duplicarlo.');}
}
