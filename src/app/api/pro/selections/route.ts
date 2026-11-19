import {proCustomerReader} from '@/lib/pro/route-common';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {selectionClientMutationSchema,selectionMutationSchema} from '@/lib/pro/selections';
import {PRO_FILE_MAX_BYTES} from '@/lib/pro/file-limit';
// Family 62: owner selections per job, the linked customer's view and decisions,
// and option images served from the existing private job files bucket.
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fileBucket='pro-work-files';
// Round 9: private copies of catalog images used by catalog options; source: the catalog image bucket.
const catalogCopyBucket='pro-selection-catalog-images',catalogBucket='pro-catalog-images';
const catalogOptionSchema=z.object({action:z.literal('option_from_catalog'),actionId:z.string().uuid(),workId:z.string().trim().min(1).max(160),id:z.string().uuid(),revision:z.number().int().positive().max(2147483646),productId:z.string().min(1).max(160),quantity:z.number().positive().max(1000000)}).strict();
const prepareSchema=z.object({productId:z.string(),sku:z.string(),name:z.string(),unit:z.string().nullable(),unitCents:z.number().int().min(0),vendor:z.string().nullable(),image:z.object({objectPath:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/),sha256:z.string().regex(/^[a-f0-9]{64}$/),sizeBytes:z.number().int().positive()}).nullable(),targetPath:z.string().nullable()});
const fail=(status:number,error:string)=>Response.json({error},{status,headers});
const dbError=(error:{code?:string})=>fail(error.code==='40001'||error.code==='23505'?409:error.code==='42501'?403:error.code==='54000'?429:['22023','22008','22007','23514','22P02','22003','23503'].includes(error.code||'')?400:503,error.code==='40001'?'La selección cambió. Actualice antes de guardar.':error.code==='23505'?'Ese elemento ya existe.':'No se pudo completar la operación.');
const imageSchema=z.object({objectPath:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/),mimeType:z.literal('image/jpeg'),sizeBytes:z.number().int().positive().max(PRO_FILE_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
async function actor(req:Request){
 const user=await safeGetUser(await createClient());if(!user)return{error:fail(401,'Inicie sesión.')};
 const expected=req.headers.get('x-pro-expected-actor');if(expected!==null&&(!z.string().uuid().safeParse(expected).success||expected!==user.id))return{error:fail(403,'La cuenta cambió.')};
 const db=createAdminClient(),profile=await db.from('profiles').select('is_disabled,role').eq('id',user.id).maybeSingle();
 if(profile.error)return{error:fail(503,'No se pudo comprobar el acceso.')};
 if(!profile.data||profile.data.is_disabled||profile.data.role==='admin'&&!await getApiAdmin())return{error:fail(403,'Sin acceso.')};
 return{user,db};
}
async function bounded(req:Request){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error();
 const reader=req.body?.getReader();if(!reader)throw Error();const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>16384){await reader.cancel();throw new RangeError();}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await actor(req);if(a.error)return a.error;const q=new URL(req.url).searchParams,keys=[...q.keys()];
  if(keys.length!==1||new Set(keys).size!==keys.length)return fail(400,'Consulta inválida.');
  if(q.has('image')){
   const option=z.string().uuid().safeParse(q.get('image'));if(!option.success)return fail(400,'Consulta inválida.');
   // Reauthorized on every request (owner, or linked customer of a published item); never a public or signed URL.
   let access=await a.db.rpc('pro_work_selection_image',{p_actor:a.user.id,p_option:option.data}),bucket=fileBucket;
   // Round 9: options added from the catalog carry a private copy of the catalog image (same authorisation).
   if(!access.error&&!access.data){access=await a.db.rpc('pro_work_selection_catalog_image',{p_actor:a.user.id,p_option:option.data});bucket=catalogCopyBucket;}
   if(access.error)return dbError(access.error);if(!access.data)return fail(404,'Imagen no disponible.');
   const meta=imageSchema.parse(access.data);
   const download=await a.db.storage.from(bucket).download(meta.objectPath);if(download.error||!download.data||download.data.size!==meta.sizeBytes)return fail(503,'No se pudo abrir la imagen.');
   const bytes=new Uint8Array(await download.data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==meta.sha256)return fail(503,'No se pudo comprobar la imagen.');
   return new Response(bytes,{headers:{...headers,'Content-Type':'image/jpeg','Content-Length':String(bytes.length),'Content-Disposition':'inline','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer'}});
  }
  if(q.has('catalogSources')){
   const work=z.string().trim().min(1).max(160).safeParse(q.get('catalogSources'));if(!work.success)return fail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_work_selection_sources_read',{p_actor:a.user.id,p_work:work.data});if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
  }
  if(q.has('requestId')){
   const request=z.string().uuid().safeParse(q.get('requestId'));if(!request.success)return fail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_work_selections_client_read',{p_actor:await proCustomerReader(a.db,a.user.id,request.data),p_request:request.data});
   if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):fail(404,'Cita no disponible.');
  }
  if(!q.has('workId'))return fail(400,'Consulta inválida.');
  const work=z.string().trim().min(1).max(160).safeParse(q.get('workId'));if(!work.success)return fail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_work_selections_read',{p_actor:a.user.id,p_work:work.data});
  if(result.error)return dbError(result.error);return result.data?Response.json(result.data,{headers}):fail(404,'Trabajo no disponible.');
 }catch{return fail(503,'No se pudieron cargar las selecciones. Reintente.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(req.headers.get('origin')!==`${new URL(req.url).protocol}//${req.headers.get('host')||new URL(req.url).host}`)return fail(403,'Origen no autorizado.');
 try{
  const a=await actor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'selections-'+a.user.id,120,60000);if(limited)return limited;
  let raw:unknown;try{raw=await bounded(req);}catch(cause){return fail(cause instanceof RangeError?413:400,'Revise los datos de la selección.');}
  // Customer decisions carry the request id; owner actions never do.
  if(raw&&typeof raw==='object'&&'requestId' in raw){
   const input=selectionClientMutationSchema.safeParse(raw);if(!input.success)return fail(400,'Revise su respuesta.');
   const result=await a.db.rpc('pro_work_selections_client_mutate',{p_actor:a.user.id,p_input:input.data});
   if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
  }
  // Round 9: an option from the catalog (name, price, vendor and a private copy of its image).
  if(raw&&typeof raw==='object'&&(raw as {action?:unknown}).action==='option_from_catalog'){
   const input=catalogOptionSchema.safeParse(raw);if(!input.success)return fail(400,'Revise el artículo del catálogo.');
   const prepared=await a.db.rpc('pro_work_selection_catalog_prepare',{p_actor:a.user.id,p_work:input.data.workId,p_product:input.data.productId,p_option:input.data.actionId});
   if(prepared.error)return dbError(prepared.error);
   let image:{path:string;sha256:string;sizeBytes:number}|null=null;
   if(prepared.data){const prep=prepareSchema.parse(prepared.data);
    if(prep.image&&prep.targetPath){const source=await a.db.storage.from(catalogBucket).download(prep.image.objectPath);
     if(!source.error&&source.data){const bytes=new Uint8Array(await source.data.arrayBuffer());const sha=createHash('sha256').update(bytes).digest('hex');
      if(sha===prep.image.sha256&&bytes.length===prep.image.sizeBytes){const stored=await a.db.storage.from(catalogCopyBucket).upload(prep.targetPath,bytes,{contentType:'image/jpeg',upsert:true});if(stored.error)return fail(503,'No se pudo copiar la imagen del catálogo. Reintente: no se duplicará.');image={path:prep.targetPath,sha256:sha,sizeBytes:bytes.length};}}}}
   const result=await a.db.rpc('pro_work_selection_option_from_catalog',{p_actor:a.user.id,p_input:{...input.data,action:undefined,image}});
   if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
  }
  const input=selectionMutationSchema.safeParse(raw);if(!input.success)return fail(400,'Revise los datos de la selección.');
  const result=await a.db.rpc('pro_work_selections_mutate',{p_actor:a.user.id,p_input:input.data});
  if(result.error)return dbError(result.error);return Response.json(result.data,{headers});
 }catch{return fail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
