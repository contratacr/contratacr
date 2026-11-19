import {enforceRateLimit} from '@/lib/rate-limit';
import {companyVendorMutationSchema,companyVendorQuerySchema} from '@/lib/pro/company-vendors';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';

const conflict='El proveedor cambió. Actualice antes de guardar.';
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  const parsed=companyVendorQuerySchema.safeParse(raw);if(!parsed.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_company_vendors_read',{p_actor:a.user.id,p_query:parsed.data});
  if(result.error)return proDbError(result.error,conflict);
  return result.data?Response.json(result.data,{headers:proRouteHeaders}):proFail(404,'Proveedor no disponible.');
 }catch{return proFail(503,'No se pudieron cargar los proveedores. Reintente.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'company-vendors-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=companyVendorMutationSchema.parse(await proBoundedJson(req,16384));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos del proveedor.');}
  const result=await a.db.rpc('pro_company_vendors_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error){if(result.error.code==='P0002')return proFail(404,'Proveedor no disponible.');return proDbError(result.error,conflict);}
  return Response.json(result.data,{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
