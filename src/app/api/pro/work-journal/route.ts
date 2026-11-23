import {createHash} from 'node:crypto';
import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proCustomerReader,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {clientJournalSchema,workJournalMutationSchema,workJournalSchema} from '@/lib/pro/work-journal';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 7C: Daily Log («Bitácora»). Owner: journal fields per entry (visible to the customer,
 * crew/hours) and the «journal_set» write (CAS + idempotent actionId). Customer (or the owner's
 * preview of that customer): visible entries of the job of `requestId` and their JPEG photos.
 */
const id=z.string().uuid();
const query=z.discriminatedUnion('view',[
 z.object({view:z.literal('owner'),workId:z.string().min(1).max(160)}).strict(),
 z.object({view:z.literal('client'),requestId:id}).strict(),
 z.object({view:z.literal('photo'),requestId:id,fileId:id}).strict(),
]);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);const parsed=raw&&query.safeParse(raw);if(!parsed||!parsed.success)return proFail(400,'Consulta inválida.');const q=parsed.data;
  if(q.view==='owner'){const r=await a.db.rpc('pro_work_journal_read',{p_actor:a.user.id,p_work:q.workId});if(r.error)return proDbError(r.error,'La bitácora cambió.');if(!r.data)return proFail(404,'Trabajo no disponible.');return Response.json(workJournalSchema.parse(r.data),{headers});}
  const reader=await proCustomerReader(a.db,a.user.id,q.requestId);
  if(q.view==='client'){const r=await a.db.rpc('pro_client_journal_read',{p_actor:reader,p_request:q.requestId});if(r.error)return proDbError(r.error,'La bitácora cambió.');return Response.json(clientJournalSchema.parse(r.data),{headers});}
  const r=await a.db.rpc('pro_client_journal_photo',{p_actor:reader,p_request:q.requestId,p_file:q.fileId});if(r.error)return proDbError(r.error,'La bitácora cambió.');if(!r.data)return proFail(404,'Foto no disponible.');
  const meta=z.object({objectPath:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/),name:z.string().min(1).max(160),mimeType:z.literal('image/jpeg'),sizeBytes:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).parse(r.data);
  const object=await a.db.storage.from('pro-daily-log-files').download(meta.objectPath);if(object.error||!object.data||object.data.size!==meta.sizeBytes)return proFail(503,'No se pudo recuperar la foto.');
  const bytes=new Uint8Array(await object.data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==meta.sha256)return proFail(503,'La foto no coincide.');
  return new Response(bytes,{headers:{...headers,'Content-Type':'image/jpeg','Content-Length':String(bytes.length),'Content-Disposition':'inline; filename="foto.jpg"','Cross-Origin-Resource-Policy':'same-origin'}});
 }catch{return proFail(503,'No se pudo cargar la bitácora.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'work-journal-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=workJournalMutationSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise la entrada.');}
  const r=await a.db.rpc('pro_work_journal_mutate',{p_actor:a.user.id,p_input:input});if(r.error){if(r.error.code==='P0002')return proFail(404,'La entrada ya no está disponible.');return proDbError(r.error,'La entrada cambió. Actualice antes de guardar.');}
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente.');}
}
