import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {meetingTypeMutationSchema,meetingTypeSchema,meetingTypesSchema} from '@/lib/pro/meeting-types';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Area E: meeting types of the owner (name, length, where, video app, description). Owner only. */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const r=await a.db.rpc('pro_meeting_types_read',{p_actor:a.user.id});if(r.error)return proDbError(r.error,'Los tipos de reunión cambiaron.');
  return Response.json(meetingTypesSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar los tipos de reunión.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'meeting-types-'+a.user.id,40,60000);if(limited)return limited;
 let input;try{input=meetingTypeMutationSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise el nombre, la duración y el lugar de la reunión.');}
 try{
  const r=await a.db.rpc('pro_meeting_types_mutate',{p_actor:a.user.id,p_input:input});
  if(r.error){
   if(r.error.code==='23505')return proFail(409,'Ya tiene un tipo de reunión con ese nombre.');
   if(r.error.code==='54000')return proFail(409,'Llegó al límite de 20 tipos de reunión.');
   if(r.error.code==='P0002')return proFail(404,'El tipo de reunión ya no existe.');
   return proDbError(r.error,'El tipo de reunión cambió. Actualice.');
  }
  return Response.json(input.action==='delete'?{deleted:true}:{type:meetingTypeSchema.parse(r.data)},{headers});
 }catch{return proFail(503,'No se pudo guardar. Reintente.');}
}
