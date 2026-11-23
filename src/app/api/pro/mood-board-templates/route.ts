import {enforceRateLimit} from '@/lib/rate-limit';
import {moodTemplateMutationSchema} from '@/lib/pro/mood-board-templates';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';
// Row 61: the owner's own idea-board page templates (layout only: no photos, no items). Owner-only; the SQL
// functions (migration 423) enforce the strict element validation, the optimistic revision, the 50 template limit
// and idempotency by actionId.
const conflict='La plantilla cambió. Actualice la lista.',BODY_MAX=64*1024;

export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q||Object.keys(q).length)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_mood_template_read',{p_actor:a.user.id});
  if(result.error)return proDbError(result.error,conflict);return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudieron cargar las plantillas. Reintente.');}
}

export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'mood-board-templates-'+a.user.id,60,60000);if(limited)return limited;
  let raw:unknown;try{raw=await proBoundedJson(req,BODY_MAX);}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos de la plantilla.');}
  const input=moodTemplateMutationSchema.safeParse(raw);if(!input.success)return proFail(400,'Revise los datos de la plantilla.');
  const result=await a.db.rpc('pro_mood_template_mutate',{p_actor:a.user.id,p_input:input.data});
  if(result.error)return proDbError(result.error,conflict);return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
