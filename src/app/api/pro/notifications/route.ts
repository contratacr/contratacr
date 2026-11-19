import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {paymentToday} from '@/lib/pro/invoice-payments';
import {notificationInputSchema,notificationPageSchema,notificationQuerySchema} from '@/lib/pro/round9';

/**
 * Round 9: notification center per person (owner, or a company member: id ONLY from the signed gate
 * headers). Notifications are derived in SQL from existing records (idempotent); email is a mock draft
 * that is never sent. Marking read and one's own preferences are personal ('read' for the gate).
 */
async function person(){return (await proWorkspaceMember())?.memberId??null;}
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),parsed=raw?notificationQuerySchema.safeParse(raw):null;if(!parsed?.success)return proFail(400,'Consulta inválida.');
  const who=(await person())??a.user.id,today=paymentToday();
  // Round 12: the owner's visit also brings the customers' payment plan reminders up to date (in-app only, idempotent, best effort).
  if(parsed.data.view==='count'&&who===a.user.id){const reminders=await a.db.rpc('pro_client_installment_reminders_run',{p_owner:a.user.id,p_today:today});void reminders;}
  if(parsed.data.view==='count'){const r=await a.db.rpc('pro_notifications_unread',{p_owner:a.user.id,p_person:who,p_today:today});if(r.error)return proDbError(r.error,'Los avisos cambiaron.');return Response.json({unread:Number(r.data)||0},{headers});}
  const after=parsed.data.afterAt&&parsed.data.afterId?{at:parsed.data.afterAt,id:parsed.data.afterId}:null;
  const r=await a.db.rpc('pro_notifications_read',{p_owner:a.user.id,p_person:who,p_filter:parsed.data.view,p_after:after,p_today:today});if(r.error)return proDbError(r.error,'Los avisos cambiaron.');
  return Response.json(notificationPageSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar los avisos.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'notifications-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=notificationInputSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise los datos de los avisos.');}
  const r=await a.db.rpc('pro_notifications_mutate',{p_owner:a.user.id,p_person:(await person())??a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'Sus preferencias cambiaron en otra pestaña. Recargue.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo guardar. Reintente: no se duplicará.');}
}
