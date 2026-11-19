import {z} from 'zod';
import {createHash} from 'node:crypto';
import {quoteLineDecideSchema} from '@/lib/pro/quote-line-decisions';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {proAccountRateLimit,proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
// Fix 14 (row 39): per-line customer approval of a shared quote version. Reads for the owner or the
// version's recipient; writes only for the recipient while the version is open (checked in SQL).
const conflict='Esta partida cambió. Se recargó la propuesta; revísela e intente de nuevo.';
const imageSchema=z.object({objectPath:z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/),sha256:z.string().regex(/^[a-f0-9]{64}$/),sizeBytes:z.number().int().positive(),imageId:z.string().uuid()}).strict();
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');
  const publication=z.string().uuid().safeParse(q.publicationId);if(!publication.success||Object.keys(q).some(k=>!['publicationId','image','v'].includes(k)))return proFail(400,'Consulta inválida.');
  if('image' in q){
   const line=z.string().uuid().safeParse(q.image);if(!line.success)return proFail(400,'Consulta inválida.');
   const r=await a.db.rpc('pro_quote_line_image',{p_actor:a.user.id,p_publication:publication.data,p_line:line.data});if(r.error)return proDbError(r.error,conflict);if(!r.data)return proFail(404,'Sin imagen.');
   const meta=imageSchema.parse(r.data);const object=await a.db.storage.from('pro-catalog-images').download(meta.objectPath);if(object.error||!object.data)return proFail(503,'No se pudo recuperar la imagen.');
   const bytes=new Uint8Array(await object.data.arrayBuffer());if(bytes.length!==meta.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==meta.sha256)return proFail(503,'La imagen no coincide.');
   return new Response(bytes,{headers:{...headers,'Content-Type':'image/jpeg','Content-Length':String(bytes.length),'Content-Security-Policy':"sandbox; default-src 'none'",'Cross-Origin-Resource-Policy':'same-origin'}});
  }
  const r=await a.db.rpc('pro_quote_line_decisions_read',{p_actor:a.user.id,p_publication:publication.data});
  if(r.error)return r.error.code==='P0002'?proFail(404,'Cotización no disponible.'):proDbError(r.error,conflict);
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo cargar la propuesta. Reintente.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  // Closing round (security review B3): deciding a line answers «as the customer»; a person working inside
  // another company's Pro space cannot answer for that company (same rule as the e-mail-bound flows).
  if(await proWorkspaceMember())return Response.json({error:'Responda desde su propia cuenta, no desde el espacio de una empresa.',code:'pro_workspace_member'},{status:403,headers});
  const limited=await proAccountRateLimit('quote-line-decisions',a.user.id,120,60000);if(limited)return limited;
  let input;try{input=quoteLineDecideSchema.parse(await proBoundedJson(req,4096));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise la decisión de la partida.');}
  const r=await a.db.rpc('pro_quote_line_decide',{p_actor:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,conflict);
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
