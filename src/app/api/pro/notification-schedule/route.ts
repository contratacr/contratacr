import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {digestRequestSchema,scheduleSaveSchema,scheduleSchema} from '@/lib/pro/notification-adapters';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 24: quiet hours, digest frequency and the sandbox outbox, per person. POST with `channels` simulates the digest
 * through the sandbox adapter (records only, nothing is sent); POST with the schedule fields saves it (CAS by revision).
 */
async function person(){return (await proWorkspaceMember())?.memberId??null;}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw||Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_notification_schedule_read',{p_owner:a.user.id,p_person:(await person())??a.user.id});if(r.error)return proDbError(r.error,'Los horarios cambiaron.');
  return Response.json(scheduleSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar los horarios.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'notification-schedule-'+a.user.id,30,60000);if(limited)return limited;
  let body:unknown;try{body=await proBoundedJson(req,4096);}catch{return proFail(400,'Revise los datos.');}
  const who=(await person())??a.user.id;
  if(body&&typeof body==='object'&&'channels' in body){
   const input=digestRequestSchema.safeParse(body);if(!input.success)return proFail(400,'Revise los canales.');
   const r=await a.db.rpc('pro_notification_digest_simulate',{p_owner:a.user.id,p_person:who,p_input:input.data});
   if(r.error)return proDbError(r.error,'No se pudo simular el resumen.');return Response.json(scheduleSchema.parse(r.data),{headers});
  }
  const input=scheduleSaveSchema.safeParse(body);if(!input.success)return proFail(400,'Revise los horarios.');
  const r=await a.db.rpc('pro_notification_schedule_save',{p_owner:a.user.id,p_person:who,p_input:input.data});
  if(r.error)return proDbError(r.error,'Sus horarios cambiaron en otra pestaña. Recargue antes de guardar.');
  return Response.json(scheduleSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente: no se duplicará.');}
}
