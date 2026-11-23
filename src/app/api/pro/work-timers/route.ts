import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {timerInputSchema,timerPageSchema} from '@/lib/pro/round8';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 8: person timer (clock-in). One open timer per person (owner or company member; the member
 * id comes only from the signed gate headers). Saving goes through the single time writer in SQL.
 */
async function person(){return (await proWorkspaceMember())?.memberId??null;}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw||Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_work_timer_read',{p_actor:a.user.id,p_person:(await person())??a.user.id});if(r.error)return proDbError(r.error,'El cronómetro cambió.');
  return Response.json(timerPageSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar el cronómetro.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'work-timers-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=timerInputSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise los datos del cronómetro.');}
  const r=await a.db.rpc('pro_work_timer_mutate',{p_actor:a.user.id,p_person:(await person())??a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,r.error.message==='A timer is already open'?'Ya tiene un cronómetro abierto. Deténgalo o guárdelo antes de iniciar otro.':'El cronómetro cambió en otra pestaña. Recargue.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el cronómetro. Reintente: no se duplicará.');}
}
