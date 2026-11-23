import {enforceRateLimit} from '@/lib/rate-limit';
import {noteMutationSchema,noteQuerySchema} from '@/lib/pro/project-notes';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Notas y llamadas del proyecto: owner-private log per job (development only). Nothing is sent or dialled.
const conflict='La nota cambió en otra ventana. Actualice antes de guardar.';
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  const parsed=noteQuerySchema.safeParse(raw);if(!parsed.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_project_notes_read',{p_actor:a.user.id,p_query:parsed.data});
  if(result.error)return proDbError(result.error,conflict);
  return result.data?Response.json(result.data,{headers:proRouteHeaders}):proFail(404,'Proyecto o nota no disponible.');
 }catch{return proFail(503,'No se pudieron cargar las notas. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'project-notes-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=noteMutationSchema.parse(await proBoundedJson(req,16384));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos de la nota.');}
  const result=await a.db.rpc('pro_project_notes_mutate',{p_actor:a.user.id,p_input:input});
  if(result.error)return result.error.code==='P0002'?proFail(404,'Nota no disponible.'):proDbError(result.error,conflict);
  return Response.json(result.data,{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
