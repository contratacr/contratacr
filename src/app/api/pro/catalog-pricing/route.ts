import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {productPricingMutationSchema,productPricingSchema} from '@/lib/pro/catalog-pricing';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Area D: cost type, MSRP, URL and favorite of catalog items. Owner only. */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');
  const ids=z.array(z.string().min(1).max(160)).min(1).max(50).parse((q.ids??'').split(',').filter(Boolean));
  const r=await a.db.rpc('pro_product_pricing_read',{p_actor:a.user.id,p_products:ids});if(r.error)return proDbError(r.error,'El artículo cambió.');
  return Response.json({items:z.record(z.string(),productPricingSchema).parse(r.data)},{headers});
 }catch{return proFail(400,'Consulta inválida.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'catalog-pricing-'+a.user.id,60,60000);if(limited)return limited;
 let input;try{input=productPricingMutationSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise el precio, el enlace y el tipo de costo del artículo.');}
 try{
  const r=await a.db.rpc('pro_product_pricing_set',{p_actor:a.user.id,p_input:input});
  if(r.error){if(r.error.code==='P0002')return proFail(404,'El artículo ya no está disponible.');return proDbError(r.error,'El artículo cambió. Actualice antes de guardar.');}
  return Response.json({pricing:productPricingSchema.parse(r.data)},{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente.');}
}
