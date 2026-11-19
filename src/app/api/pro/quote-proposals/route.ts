import {z} from 'zod';
import {createHash} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proposalDesignSchema,proposalFileRefSchema,proposalFilesSchema,proposalInputSchema,proposalPublicationSchema,proposalResultSchema,proposalSources} from '@/lib/pro/estimate-proposals';

/**
 * Ronda F2-B (row 39): visual proposal of a private estimate. Owner: design (cover, introduction, closing, photos
 * from existing company/job files) and explicit application to an open shared version. Owner or the version's
 * recipient: read the applied snapshot and its photos (size and SHA-256 verified). Role gate: writes = sales.write.
 */
const conflict='La propuesta cambió en otra pestaña. Se recargó; revise e intente de nuevo.';
const uuid=z.string().uuid();
const query=z.discriminatedUnion('view',[
 z.object({view:z.literal('design'),estimateId:uuid}).strict(),
 z.object({view:z.literal('files'),estimateId:uuid,q:z.string().max(80).optional()}).strict(),
 z.object({view:z.literal('publication'),publicationId:uuid}).strict(),
 z.object({view:z.literal('image'),publicationId:uuid,imageId:uuid}).strict(),
 z.object({view:z.literal('draft-image'),estimateId:uuid,source:z.enum(proposalSources),fileId:uuid}).strict(),
]);
async function jpeg(db:Awaited<ReturnType<typeof proActor>>['db'],raw:unknown){
 const ref=proposalFileRefSchema.parse(raw);const object=await db!.storage.from(ref.bucket).download(ref.objectPath);if(object.error||!object.data)return proFail(404,'Sin imagen.');
 const bytes=new Uint8Array(await object.data.arrayBuffer());if(bytes.length!==ref.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==ref.sha256)return proFail(404,'La imagen cambió.');
 return new Response(bytes,{headers:{...headers,'Content-Type':'image/jpeg','Content-Length':String(bytes.length),'Content-Security-Policy':"sandbox; default-src 'none'",'Cross-Origin-Resource-Policy':'same-origin'}});
}
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),parsed=raw?query.safeParse(raw):null;if(!parsed?.success)return proFail(400,'Consulta inválida.');const q=parsed.data;
  if(q.view==='design'||q.view==='files'){
   const r=await a.db.rpc('pro_estimate_proposal_read',{p_owner:a.user.id,p_query:q.view==='design'?{view:'design',estimateId:q.estimateId}:{view:'files',estimateId:q.estimateId,query:q.q??''}});
   if(r.error)return r.error.code==='P0002'?proFail(404,'Cotización no disponible.'):proDbError(r.error,conflict);
   return Response.json(q.view==='design'?proposalDesignSchema.parse(r.data):proposalFilesSchema.parse(r.data),{headers});
  }
  if(q.view==='publication'){
   const r=await a.db.rpc('pro_estimate_proposal_publication_read',{p_actor:a.user.id,p_publication:q.publicationId});
   if(r.error)return r.error.code==='P0002'?proFail(404,'Cotización no disponible.'):proDbError(r.error,conflict);
   return Response.json(proposalPublicationSchema.parse(r.data),{headers});
  }
  const r=q.view==='image'?await a.db.rpc('pro_estimate_proposal_image',{p_actor:a.user.id,p_publication:q.publicationId,p_image:q.imageId})
   :await a.db.rpc('pro_estimate_proposal_draft_image',{p_owner:a.user.id,p_estimate:q.estimateId,p_source:q.source,p_file:q.fileId});
  if(r.error)return r.error.code==='P0002'?proFail(404,'Sin imagen.'):proDbError(r.error,conflict);if(!r.data)return proFail(404,'Sin imagen.');
  return await jpeg(a.db,r.data);
 }catch{return proFail(503,'No se pudo cargar la propuesta. Reintente.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'quote-proposals-'+a.user.id,120,60000);if(limited)return limited;
  let input;try{input=proposalInputSchema.parse(await proBoundedJson(req,16384));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos de la propuesta.');}
  const r=await a.db.rpc('pro_estimate_proposal_mutate',{p_owner:a.user.id,p_input:input});
  if(r.error){if(r.error.hint==='pro_proposal_photo_limit')return Response.json({error:'Llegó al máximo de fotos para este lugar.',reason:'photo_limit'},{status:400,headers});return proDbError(r.error,conflict);}
  return Response.json(proposalResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo guardar. Reintente: no se duplicará.');}
}
