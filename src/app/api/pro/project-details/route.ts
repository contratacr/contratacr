import {enforceRateLimit} from '@/lib/rate-limit';
import {detailsMutationSchema,detailsQuerySchema} from '@/lib/pro/project-details';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';

// Detalles del proyecto y catálogo de tipos y etiquetas de la cuenta (development only).
const conflict='Los detalles cambiaron en otra ventana. Actualice antes de guardar.';
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  const parsed=detailsQuerySchema.safeParse(raw);if(!parsed.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_project_details_read',{p_actor:a.user.id,p_query:parsed.data});
  if(result.error)return proDbError(result.error,conflict);
  return result.data?Response.json(result.data,{headers:proRouteHeaders}):proFail(404,'Proyecto no disponible.');
 }catch{return proFail(503,'No se pudieron cargar los detalles. Reintente.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'project-details-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=detailsMutationSchema.parse(await proBoundedJson(req,16384));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los detalles del proyecto.');}
  const result=await a.db.rpc('pro_project_details_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error){
   // A repeated project code is a field error, not a concurrent edit.
   if(result.error.code==='23505'&&/code/i.test(result.error.message??''))return Response.json({error:'Ese código ya lo usa otro proyecto.',field:'code'},{status:409,headers:proRouteHeaders});
   return result.error.code==='P0002'?proFail(404,'Elemento no disponible.'):proDbError(result.error,conflict);
  }
  return Response.json(result.data,{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
