import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {marketingListMutationSchema,marketingListsSchema} from '@/lib/pro/marketing';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Area E: custom email lists (named sets of contacts that already gave consent) and the system list counts. Owner only. */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const r=await a.db.rpc('pro_mkt_lists_read',{p_actor:a.user.id});if(r.error)return proDbError(r.error,'Las listas cambiaron.');
  return Response.json(marketingListsSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar las listas.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'marketing-lists-'+a.user.id,60,60000);if(limited)return limited;
 let input;try{input=marketingListMutationSchema.parse(await proBoundedJson(req,96*1024));}catch{return proFail(400,'Revise el nombre y los contactos de la lista.');}
 try{
  const r=await a.db.rpc('pro_mkt_lists_mutate',{p_actor:a.user.id,p_input:input});
  if(r.error){
   if(r.error.code==='23505')return proFail(409,'Ya tiene una lista con ese nombre.');
   if(r.error.code==='54000')return proFail(409,'Llegó al límite de 30 listas.');
   if(r.error.code==='P0002')return proFail(404,'La lista ya no existe.');
   return proDbError(r.error,'La lista cambió. Actualice.');
  }
  return Response.json(marketingListsSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo guardar la lista. Reintente.');}
}
