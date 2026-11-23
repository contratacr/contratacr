import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proCustomerReader,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {presentationClientSchema,presentationInputSchema,presentationOwnerSchema,presentationResultSchema,PRESENTATION_VIDEO_PATTERN} from '@/lib/pro/client-presentation';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 33: cover/header, video link, weather widget and hidden documents of the customer view of a job, plus the record
 * of when the customer opened it. SQL is the authority (pro_client_presentation_*): CAS revision (40001 -> 409),
 * idempotent receipts. Hiding is presentation only. The customer read also serves the owner's preview (read only);
 * only the real customer's read records an opening. Role gate: writes = the job tools (work.write).
 */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');
  const keys=Object.keys(q).join();
  if(keys==='requestId'){
   const request=z.string().uuid().safeParse(q.requestId);if(!request.success)return proFail(400,'Consulta inválida.');
   const reader=await proCustomerReader(a.db,a.user.id,request.data);
   const result=await a.db.rpc('pro_client_presentation_client',{p_actor:reader,p_request:request.data});
   if(result.error)return proDbError(result.error,'Los datos cambiaron. Actualice.');
   if(!result.data)return proFail(404,'Cita no disponible.');
   if(reader===a.user.id)await a.db.rpc('pro_client_presentation_open',{p_actor:reader,p_request:request.data});
   return Response.json(presentationClientSchema.parse(result.data),{headers});
  }
  if(keys==='workId'){
   const work=z.string().trim().min(1).max(160).safeParse(q.workId);if(!work.success)return proFail(400,'Consulta inválida.');
   const result=await a.db.rpc('pro_client_presentation_read',{p_actor:a.user.id,p_work:work.data});
   if(result.error)return proDbError(result.error,'Los datos cambiaron. Actualice.');
   if(!result.data)return proFail(404,'Trabajo no disponible.');
   return Response.json(presentationOwnerSchema.parse(result.data),{headers});
  }
  return proFail(400,'Consulta inválida.');
 }catch{return proFail(503,'No se pudo cargar la presentación. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'client-presentation-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=presentationInputSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise los datos.');}
  if(input.action==='save'&&input.videoUrl&&!PRESENTATION_VIDEO_PATTERN.test(input.videoUrl.trim()))return Response.json({error:'El enlace del video debe ser de YouTube o Vimeo (https).',reason:'pro_presentation_video'},{status:400,headers});
  const result=await a.db.rpc('pro_client_presentation_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error){
   if(result.error.hint==='pro_presentation_video')return Response.json({error:'El enlace del video debe ser de YouTube o Vimeo (https).',reason:'pro_presentation_video'},{status:400,headers});
   if(result.error.hint==='pro_presentation_city')return Response.json({error:'Elija una provincia para el clima.',reason:'pro_presentation_city'},{status:400,headers});
   return proDbError(result.error,'La presentación cambió en otra pestaña. Recargue.');
  }
  return Response.json(presentationResultSchema.parse(result.data),{headers});
 }catch{return proFail(503,'No se pudo guardar. Reintente: no se duplicará.');}
}
