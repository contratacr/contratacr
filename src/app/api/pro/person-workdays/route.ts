import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {personWorkdaysMutationSchema,personWorkdaysResultSchema,personWorkdaysSchema} from '@/lib/pro/work-calendar';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 13: working weekdays per person. The owner and the current team read them; only the owner writes (the database
 * refuses anyone else). Revision per person: a change from another tab answers 409. Holidays stay company-wide.
 */
async function person(){return (await proWorkspaceMember())?.memberId??null;}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw||Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_person_workdays_read',{p_owner:a.user.id,p_person:(await person())??a.user.id});if(r.error)return proDbError(r.error,'Las jornadas cambiaron.');
  return Response.json(personWorkdaysSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar las jornadas.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'person-workdays-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=personWorkdaysMutationSchema.parse(await proBoundedJson(req,2048));}catch{return proFail(400,'Revise los días laborables.');}
  const r=await a.db.rpc('pro_person_workdays_save',{p_owner:a.user.id,p_person:(await person())??a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'Las jornadas cambiaron en otra pestaña. Recargue.');
  return Response.json(personWorkdaysResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente.');}
}
