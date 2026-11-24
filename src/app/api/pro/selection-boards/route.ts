import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {roomMetaListSchema,roomMetaMutationSchema,roomMetaSchema} from '@/lib/pro/selection-boards';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Area E: budget and assignee per selection room, with approval counters. Owner only. */
const query=z.object({workId:z.string().trim().min(1).max(160)}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),q=raw?query.safeParse(raw):null;if(!q?.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_work_selection_meta_read',{p_owner:a.user.id,p_work:q.data.workId});if(r.error)return proDbError(r.error,'Las selecciones cambiaron.');
  if(!r.data)return proFail(404,'Trabajo no disponible.');
  return Response.json(roomMetaListSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar las habitaciones.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'selection-boards-'+a.user.id,60,60000);if(limited)return limited;
 let input;try{input=roomMetaMutationSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise el presupuesto y el responsable de la habitación.');}
 try{
  const r=await a.db.rpc('pro_work_selection_meta_set',{p_owner:a.user.id,p_input:input});
  if(r.error){if(r.error.code==='P0002')return proFail(404,'La habitación ya no está disponible.');return proDbError(r.error,'La habitación cambió. Actualice antes de guardar.');}
  return Response.json({room:roomMetaSchema.parse(r.data)},{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente.');}
}
