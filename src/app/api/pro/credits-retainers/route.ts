import {enforceRateLimit} from '@/lib/rate-limit';
import {creditMutationSchema,creditQuerySchema} from '@/lib/pro/credits-retainers';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Family 50: retainers, credit notes, overpayments and refunds per project. Internal,
// non-fiscal records: no charges, no money movement, no Hacienda documents.
const conflict='El crédito cambió. Actualice antes de guardar.';
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  const parsed=creditQuerySchema.safeParse(raw);if(!parsed.success)return proFail(400,'Consulta inválida.');
  const query=Object.fromEntries(Object.entries(parsed.data).filter(([,value])=>value!==undefined));
  const result=await a.db.rpc('pro_credits_read',{p_actor:a.user.id,p_query:query});
  if(result.error)return proDbError(result.error,conflict);
  return result.data?Response.json(result.data,{headers:proRouteHeaders}):proFail(404,'Trabajo no disponible.');
 }catch{return proFail(503,'No se pudieron cargar los créditos. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'credits-retainers-'+a.user.id,120,60000);if(limited)return limited;
  let input;try{input=creditMutationSchema.parse(await proBoundedJson(req,16384));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos del crédito.');}
  const result=await a.db.rpc('pro_credits_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error)return proDbError(result.error,conflict);
  return Response.json(result.data,{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
