import {z} from 'zod';
import {createHash} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {MOOD_BODY_MAX,moodBoardMutationSchema,moodClientMutationSchema} from '@/lib/pro/mood-boards';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin,proCustomerReader} from '@/lib/pro/route-common';
import {PRO_FILE_MAX_BYTES} from '@/lib/pro/file-limit';
import {PRO_ENABLED} from '@/lib/pro/enabled';
// Row 61: idea boards per job, the linked customer's published copy and comments.
// Images are the existing private job files (bucket pro-work-files), reauthorized
// on every request and never exposed as public or signed URLs. Photos are uploaded
// through /api/pro/work-files, so every body here stays at or below 16 KiB.
const bucket='pro-work-files',conflict='El tablero cambió. Actualice antes de guardar.';
const storedSchema=z.object({objectPath:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/),mimeType:z.literal('image/jpeg'),sizeBytes:z.number().int().positive().max(PRO_FILE_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const uuid=z.string().uuid(),work=z.string().trim().min(1).max(160);
const same=(keys:string[],expected:string[])=>keys.length===expected.length&&[...keys].sort().join()===[...expected].sort().join();

export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');const keys=Object.keys(q);
  if(same(keys,['image'])||same(keys,['publication','page','element'])){
   const owner=same(keys,['image']);
   const file=owner?uuid.safeParse(q.image):null,publication=owner?null:uuid.safeParse(q.publication),pageId=owner?null:uuid.safeParse(q.page),element=owner?null:uuid.safeParse(q.element);
   if(file&&!file.success||publication&&!publication.success||pageId&&!pageId.success||element&&!element.success)return proFail(400,'Consulta inválida.');
   const access=await a.db.rpc('pro_mood_board_image',{p_actor:a.user.id,p_file:file?.data??null,p_publication:publication?.data??null,p_page:pageId?.data??null,p_element:element?.data??null});
   if(access.error)return proDbError(access.error,conflict);if(!access.data)return proFail(404,'Imagen no disponible.');
   const meta=storedSchema.parse(access.data);
   const download=await a.db.storage.from(bucket).download(meta.objectPath);if(download.error||!download.data||download.data.size!==meta.sizeBytes)return proFail(503,'No se pudo abrir la imagen.');
   const bytes=new Uint8Array(await download.data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==meta.sha256)return proFail(503,'No se pudo comprobar la imagen.');
   return new Response(bytes,{headers:{...headers,'Content-Type':'image/jpeg','Content-Length':String(bytes.length),'Content-Disposition':'inline','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer'}});
  }
  if(same(keys,['requestId'])){
   const request=uuid.safeParse(q.requestId);if(!request.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_mood_boards_client_read',{p_actor:await proCustomerReader(a.db,a.user.id,request.data),p_request:request.data});
   if(result.error)return proDbError(result.error,conflict);return result.data?Response.json(result.data,{headers}):proFail(404,'Cita no disponible.');
  }
  if(same(keys,['products'])){
   const search=z.string().max(80).safeParse(q.products);if(!search.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_mood_board_products',{p_actor:a.user.id,p_search:search.data});
   if(result.error)return proDbError(result.error,conflict);return Response.json(result.data,{headers});
  }
  if(same(keys,['workId','boardId'])){
   const workId=work.safeParse(q.workId),board=uuid.safeParse(q.boardId);if(!workId.success||!board.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_mood_board_read',{p_actor:a.user.id,p_work:workId.data,p_board:board.data});
   if(result.error)return proDbError(result.error,conflict);return result.data?Response.json(result.data,{headers}):proFail(404,'Tablero no disponible.');
  }
  if(same(keys,['workId'])||same(keys,['workId','archived'])){
   const workId=work.safeParse(q.workId);if(!workId.success||'archived' in q&&q.archived!=='1')return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_mood_boards_read',{p_actor:a.user.id,p_work:workId.data,p_archived:q.archived==='1'});
   if(result.error)return proDbError(result.error,conflict);return result.data?Response.json(result.data,{headers}):proFail(404,'Trabajo no disponible.');
  }
  return proFail(400,'Consulta inválida.');
 }catch{return proFail(503,'No se pudieron cargar los tableros. Reintente.');}
}

export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  // Page saves happen often while arranging a board; comments far less.
  const limited=await enforceRateLimit(req,'mood-boards-'+a.user.id,240,60000);if(limited)return limited;
  let raw:unknown;try{raw=await proBoundedJson(req,MOOD_BODY_MAX);}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos del tablero.');}
  // Customer comments carry the request id; owner actions never do.
  if(raw&&typeof raw==='object'&&'requestId' in raw){
   const commentLimited=await enforceRateLimit(req,'mood-board-comments-'+a.user.id,30,60000);if(commentLimited)return commentLimited;
   const input=moodClientMutationSchema.safeParse(raw);if(!input.success)return proFail(400,'Revise su comentario.');
   const result=await a.db.rpc('pro_mood_boards_client_mutate',{p_actor:a.user.id,p_input:input.data});
   if(result.error)return proDbError(result.error,'El tablero cambió. Recárguelo antes de comentar.');return Response.json(result.data,{headers});
  }
  const input=moodBoardMutationSchema.safeParse(raw);if(!input.success)return proFail(400,'Revise los datos del tablero.');
  const result=await a.db.rpc('pro_mood_boards_mutate',{p_actor:a.user.id,p_input:input.data});
  if(result.error)return proDbError(result.error,conflict);return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
