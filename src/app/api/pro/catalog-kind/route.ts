import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {itemKindMutationSchema,itemKindSchema} from '@/lib/pro/catalog-kind';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Area D: kind (standard, placeholder, assembly) and assembly parts of a catalog item. Owner only. */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');
 const id=q.id;if(!id||id.length>160)return proFail(400,'Consulta inválida.');
 const r=await a.db.rpc('pro_product_kind_read',{p_actor:a.user.id,p_product:id});
 if(r.error){if(r.error.code==='P0002')return proFail(404,'El artículo ya no está disponible.');return proDbError(r.error,'El artículo cambió.');}
 const parsed=itemKindSchema.safeParse(r.data);if(!parsed.success)return proFail(503,'No se pudo leer el artículo.');
 return Response.json({item:parsed.data},{headers});
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'catalog-kind-'+a.user.id,60,60000);if(limited)return limited;
 let input;try{input=itemKindMutationSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise el tipo de artículo y las cantidades de las partes.');}
 try{
  const r=await a.db.rpc('pro_product_kind_set',{p_actor:a.user.id,p_input:input});
  if(r.error){
   if(r.error.code==='P0002')return proFail(404,'El artículo o una de sus partes ya no está disponible.');
   if(r.error.hint==='pro_assembly_nested')return proFail(400,'Un ensamble no puede contener otro ensamble.');
   return proDbError(r.error,'El artículo cambió. Actualice antes de guardar.');
  }
  return Response.json({item:itemKindSchema.parse(r.data)},{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente.');}
}
