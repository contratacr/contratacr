import {enforceRateLimit} from '@/lib/rate-limit';
import {BID_BODY_MAX,bidMutationSchema,bidQuerySchema} from '@/lib/pro/bids';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';

// Row 53: private bid packages per job (owner only, development only). Nothing is sent to vendors.
const conflict='La licitación cambió. Actualice antes de guardar.';
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  const parsed=bidQuerySchema.safeParse(raw);if(!parsed.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_bids_read',{p_actor:a.user.id,p_query:parsed.data});
  if(result.error)return proDbError(result.error,conflict);
  return result.data?Response.json(result.data,{headers:proRouteHeaders}):proFail(404,'Licitación no disponible.');
 }catch{return proFail(503,'No se pudieron cargar las licitaciones. Reintente.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'bids-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=bidMutationSchema.parse(await proBoundedJson(req,BID_BODY_MAX));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos de la licitación.');}
  const result=await a.db.rpc('pro_bids_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error)return proDbError(result.error,conflict);
  return Response.json(result.data,{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
