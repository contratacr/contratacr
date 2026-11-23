import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proSameOrigin,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {meetingMutationSchema} from '@/lib/pro/integrations/webhooks/api';
import {mockMeetingUrl} from '@/lib/pro/integrations/webhooks/meetings';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Row 72: meetings with a video link (mock adapter: fictitious ".invalid" link; no real meeting is created). */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q||Object.keys(q).length)return proFail(400,'Consulta inválida.');
  const read=await a.db.rpc('pro_meetings_read',{p_actor:a.user.id});if(read.error)return proDbError(read.error,'Los datos cambiaron.');
  return Response.json({...(read.data as object),mode:'mock'},{headers});
 }catch{return proFail(503,'No se pudieron cargar las reuniones.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'company-meetings-'+a.user.id,30,60000);if(limited)return limited;
 let input;try{input=meetingMutationSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise los datos.');}
 try{
  const payload=input.action==='create'?{...input,joinUrl:mockMeetingUrl(input.provider)}:input;
  const r=await a.db.rpc('pro_meeting_set',{p_actor:a.user.id,p_input:payload});
  if(r.error){if(r.error.code==='P0002')return proFail(404,'La reunión o el trabajo ya no está disponible.');return proDbError(r.error,'La reunión cambió. Actualice.');}
  return Response.json({meeting:r.data},{headers});
 }catch{return proFail(503,'No se pudo comprobar la operación. Reintente.');}
}
