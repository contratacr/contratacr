import {z} from 'zod';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {enforceRateLimit} from '@/lib/rate-limit';
import {takeoffDeductionSchema,takeoffMutationSchema} from '@/lib/pro/takeoffs';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_FILE_MAX_BYTES} from '@/lib/pro/file-limit';
import {PRO_ENABLED} from '@/lib/pro/enabled';
// Row 66: plan measurements per job. Plan images are the existing private job files
// (bucket pro-work-files), served only to their owner and reauthorized per request.
const bucket='pro-work-files',conflict='Las mediciones cambiaron. Actualice antes de guardar.';
const storedSchema=z.object({objectPath:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|pdf)$/),mimeType:z.enum(['image/jpeg','application/pdf']),sizeBytes:z.number().int().positive().max(PRO_FILE_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
type Db=NonNullable<Awaited<ReturnType<typeof proActor>>['db']>;
/** Downloads a stored job file and checks its size and digest before using it. */
async function storedBytes(db:Db,meta:z.infer<typeof storedSchema>){
 const download=await db.storage.from(bucket).download(meta.objectPath);if(download.error||!download.data||download.data.size!==meta.sizeBytes)return null;
 const bytes=new Uint8Array(await download.data.arrayBuffer());return createHash('sha256').update(bytes).digest('hex')===meta.sha256?bytes:null;
}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req),keys=q?Object.keys(q):[];
  if(!q||keys.length!==1)return proFail(400,'Consulta inválida.');
  if('image' in q){
   const plan=z.string().uuid().safeParse(q.image);if(!plan.success)return proFail(400,'Consulta inválida.');
   const access=await a.db.rpc('pro_work_takeoff_image',{p_actor:a.user.id,p_plan:plan.data});
   if(access.error)return proDbError(access.error,conflict);if(!access.data)return proFail(404,'Plano no disponible.');
   const meta=storedSchema.parse(access.data);if(meta.mimeType!=='image/jpeg')return proFail(404,'Plano no disponible.');
   const bytes=await storedBytes(a.db,meta);if(!bytes)return proFail(503,'No se pudo abrir el plano.');
   return new Response(bytes,{headers:{...headers,'Content-Type':'image/jpeg','Content-Length':String(bytes.length),'Content-Disposition':'inline','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer'}});
  }
  if(!('workId' in q))return proFail(400,'Consulta inválida.');
  const work=z.string().trim().min(1).max(160).safeParse(q.workId);if(!work.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_work_takeoffs_read',{p_actor:a.user.id,p_work:work.data});
  if(result.error)return proDbError(result.error,conflict);return result.data?Response.json(result.data,{headers}):proFail(404,'Trabajo no disponible.');
 }catch{return proFail(503,'No se pudieron cargar las mediciones. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'takeoffs-'+a.user.id,240,60000);if(limited)return limited;
  // The plan image itself goes through the work-files upload; this body stays small.
  let raw:unknown;try{raw=await proBoundedJson(req,16384);}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos de la medición.');}
  // Fix 14 (row 66): openings («huecos») subtracted from an area of the same page.
  const deduction=takeoffDeductionSchema.safeParse(raw);
  if(deduction.success){const result=await a.db.rpc('pro_work_takeoff_deduction_mutate',{p_actor:a.user.id,p_input:deduction.data});if(result.error)return proDbError(result.error,conflict);return Response.json(result.data,{headers});}
  let input;try{input=takeoffMutationSchema.parse(raw);}catch{return proFail(400,'Revise los datos de la medición.');}
  // Closing round (security review B2): «an opening is not quoted on its own» is checked inside
  // pro_work_takeoffs_mutate (send_estimate), under the same per-job lock as marking an opening.
  let payload:Record<string,unknown>=input;
  if(input.action==='plan_create'){
   // The page size comes from the stored image, never from the browser.
   const access=await a.db.rpc('pro_work_takeoff_file',{p_actor:a.user.id,p_work:input.workId,p_file:input.fileId});
   if(access.error)return proDbError(access.error,conflict);if(!access.data)return proFail(400,'Elija una imagen de este trabajo.');
   const meta=storedSchema.parse(access.data);if(meta.mimeType!=='image/jpeg')return proFail(400,'Por ahora el plano debe ser una imagen JPG o PNG.');
   const bytes=await storedBytes(a.db,meta);if(!bytes)return proFail(503,'No se pudo comprobar el plano. Reintente la misma operación.');
   const size=await sharp(bytes,{limitInputPixels:24_000_000}).metadata();
   if(!size.width||!size.height)return proFail(400,'No se pudo leer el tamaño del plano.');
   payload={...input,widthPx:size.width,heightPx:size.height};
  }
  const result=await a.db.rpc('pro_work_takeoffs_mutate',{p_actor:a.user.id,p_input:payload});
  if(result.error)return result.error.hint==='pro_takeoff_opening'?proFail(400,'Un hueco no se cotiza solo: ya se resta del área que lo contiene.'):proDbError(result.error,conflict);
  return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
