import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {clipperUrlSchema} from '@/lib/pro/integrations/clipper/parse';
import {readProductLink} from '@/lib/pro/integrations/clipper/service';

// Round 6D (row 60): «Agregar desde enlace». The server reads the link with the product_clipper adapter (mock
// fixture locally; the real reader is inactive) and stores a CLIP for review. Nothing is written to the catalog
// here: the owner edits the values and saves the product with the catalog writer, then the clip is marked.
// The browser extension (extensions/clipper/) opens the app with ?clip=<url>, which calls this same endpoint.
const id=z.string().uuid();
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('read'),actionId:id,id,url:clipperUrlSchema,source:z.enum(['app','extension'])}).strict(),
 z.object({action:z.literal('review'),id,decision:z.enum(['saved','discarded']),productId:z.string().min(1).max(160).nullable()}).strict(),
]);
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{const a=await proActor(req);if(a.error)return a.error;const result=await a.db.rpc('pro_clip_read',{p_actor:a.user.id});if(result.error)return proDbError(result.error,'Los datos cambiaron.');return Response.json(result.data,{headers});}
 catch{return proFail(503,'No se pudieron cargar los enlaces.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'catalog-clipper-'+a.user.id,20,60000);if(limited)return limited;
  let input;try{input=schema.parse(await proBoundedJson(req,4096));}catch(cause){return Response.json({error:'Pegue un enlace https de una página pública de producto.',reason:'invalid_url'},{status:cause instanceof RangeError?413:400,headers});}
  if(input.action==='review'){const result=await a.db.rpc('pro_clip_review',{p_actor:a.user.id,p_input:input});if(result.error)return proDbError(result.error,'El enlace ya se revisó.');return Response.json(result.data,{headers});}
  const read=await readProductLink(a.db,a.user.id,input.url);
  if(!read.result.ok)return Response.json({error:read.result.reason==='robots'?'Ese sitio no permite leer la página (robots.txt).':read.result.reason==='no_data'?'La página no publica datos de producto (Open Graph / schema.org).':'No se pudo leer la página.',reason:read.result.reason,mode:read.mode},{status:422,headers});
  const result=await a.db.rpc('pro_clip_create',{p_actor:a.user.id,p_input:{actionId:input.actionId,id:input.id,url:input.url,host:new URL(input.url).hostname,source:input.source,mode:read.mode,metadata:read.result.metadata}});
  if(result.error)return proDbError(result.error,'Ese enlace ya se agregó.');
  return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo leer el enlace. Reintente.');}
}
