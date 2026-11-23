import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {floorLibraryItemSchema,floorLibraryMutationSchema} from '@/lib/pro/floor-library';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Row 63: per-owner library of custom 3D objects for floor plans (name, width/depth/height, colour; origin manual, OBJ bounding box or catalog item).
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const r=await a.db.rpc('pro_floor_library_read',{p_actor:a.user.id});if(r.error)return proDbError(r.error,'La biblioteca cambió.');
  return Response.json({items:z.array(floorLibraryItemSchema).parse((r.data as {items:unknown}).items)},{headers});
 }catch{return proFail(503,'No se pudo cargar la biblioteca de objetos.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'floor-library-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=floorLibraryMutationSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise el objeto de la biblioteca.');}
  const r=await a.db.rpc('pro_floor_library_mutate',{p_actor:a.user.id,p_input:input});
  if(r.error){if(r.error.code==='P0002')return proFail(404,'El objeto o el artículo ya no está disponible.');if(r.error.code==='23505')return proFail(409,'Ya existe un objeto con ese nombre.');return proDbError(r.error,'El objeto cambió. Actualice antes de guardar.');}
  return Response.json({item:floorLibraryItemSchema.parse((r.data as {item:unknown}).item)},{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente.');}
}
