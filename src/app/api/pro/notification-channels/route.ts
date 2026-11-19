import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {notificationChannelsSaveSchema,notificationChannelsSchema} from '@/lib/pro/operations';

/**
 * Ronda F2-C (row 24): channel preferences per event and person. In-app and email go through the existing
 * settings writer of /api/pro/notifications; WhatsApp is stored only (ContrataCR sends nothing).
 */
async function person(){return (await proWorkspaceMember())?.memberId??null;}
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw||Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_notification_channels_read',{p_owner:a.user.id,p_person:(await person())??a.user.id});if(r.error)return proDbError(r.error,'Las preferencias cambiaron.');
  return Response.json(notificationChannelsSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar los canales.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'notification-channels-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=notificationChannelsSaveSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise las preferencias.');}
  const r=await a.db.rpc('pro_notification_channels_save',{p_owner:a.user.id,p_person:(await person())??a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'Sus preferencias cambiaron en otra pestaña. Recargue antes de guardar.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudieron guardar las preferencias.');}
}
