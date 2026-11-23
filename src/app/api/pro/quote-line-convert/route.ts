import {z} from 'zod';
import {proAccountRateLimit,proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';
// Row 39: the professional turns the lines the customer approved in a shared version into a NEW private estimate draft.
// Owner only (checked in SQL: the publication must be owned by the actor); the shared version and its decisions never change.
const schema=z.object({actionId:z.string().uuid(),publicationId:z.string().uuid(),targetEstimateId:z.string().uuid()}).strict();
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await proAccountRateLimit('quote-line-convert',a.user.id,30,60000);if(limited)return limited;
  let input;try{input=schema.parse(await proBoundedJson(req,2048));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise la solicitud.');}
  const r=await a.db.rpc('pro_quote_line_decisions_convert',{p_actor:a.user.id,p_input:{action:'convert_approved',...input}});
  if(r.error)return proDbError(r.error,'Esta cotización cambió. Recargue e intente de nuevo.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
