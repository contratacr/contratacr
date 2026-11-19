import {z} from 'zod';
import {createHash} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {punchMutationSchema} from '@/lib/pro/work-punchlist';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin,proCustomerReader} from '@/lib/pro/route-common';
import {PRO_FILE_MAX_BYTES} from '@/lib/pro/file-limit';
// Family 15: owner punch list, the linked customer's opt-in list, and item photos
// served from the existing private job files bucket (reauthorized per request).
const conflict='El pendiente cambió. Actualice antes de guardar.',fileBucket='pro-work-files',uuid=z.string().uuid();
const imageSchema=z.object({objectPath:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/),mimeType:z.literal('image/jpeg'),sizeBytes:z.number().int().positive().max(PRO_FILE_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');const keys=Object.keys(q).sort().join(',');
  if(keys==='image'||keys==='image,requestId'){
   const task=uuid.safeParse(q.image),request=q.requestId===undefined?null:uuid.safeParse(q.requestId);if(!task.success||request&&!request.success)return proFail(400,'Consulta inválida.');
   const access=await a.db.rpc('pro_work_punch_image',{p_actor:await proCustomerReader(a.db,a.user.id,request?.data??null),p_task:task.data,p_request:request?.data??null});
   if(access.error)return proDbError(access.error,conflict);if(!access.data)return proFail(404,'Imagen no disponible.');
   const meta=imageSchema.parse(access.data);
   const download=await a.db.storage.from(fileBucket).download(meta.objectPath);if(download.error||!download.data||download.data.size!==meta.sizeBytes)return proFail(503,'No se pudo abrir la imagen.');
   const bytes=new Uint8Array(await download.data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==meta.sha256)return proFail(503,'No se pudo comprobar la imagen.');
   return new Response(bytes,{headers:{...headers,'Content-Type':'image/jpeg','Content-Length':String(bytes.length),'Content-Disposition':'inline','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer'}});
  }
  if(keys==='requestId'){
   const request=uuid.safeParse(q.requestId);if(!request.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_work_punchlist_client_read',{p_actor:await proCustomerReader(a.db,a.user.id,request.data),p_request:request.data});
   if(result.error)return proDbError(result.error,conflict);return result.data?Response.json(result.data,{headers}):proFail(404,'Cita no disponible.');
  }
  if(keys!=='workId')return proFail(400,'Consulta inválida.');
  const work=z.string().trim().min(1).max(160).safeParse(q.workId);if(!work.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_work_punchlist_read',{p_actor:a.user.id,p_work:work.data});
  if(result.error)return proDbError(result.error,conflict);return result.data?Response.json(result.data,{headers}):proFail(404,'Trabajo no disponible.');
 }catch{return proFail(503,'No se pudieron cargar los pendientes finales.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'work-punchlist-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=punchMutationSchema.parse(await proBoundedJson(req));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise el pendiente.');}
  const result=await a.db.rpc('pro_work_punchlist_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error)return proDbError(result.error,conflict);return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
