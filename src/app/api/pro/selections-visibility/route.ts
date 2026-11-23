import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {selectionVisibilityInputSchema,selectionVisibilitySchema} from '@/lib/pro/round11';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 11 (row 62): per selection item, hide the price and/or the link of its options from the customer
 * (the customer read returns null for them). CAS per item, idempotent actionId, immutable history.
 * Role gate: writes = sales.write (selections).
 */
const query=z.object({workId:z.string().trim().min(1).max(160)}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),q=raw?query.safeParse(raw):null;if(!q?.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_work_selection_visibility_read',{p_owner:a.user.id,p_work:q.data.workId});if(r.error)return proDbError(r.error,'Las selecciones cambiaron.');
  if(!r.data)return proFail(404,'Trabajo no disponible.');
  return Response.json(selectionVisibilitySchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar la visibilidad.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'selections-visibility-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=selectionVisibilityInputSchema.parse(await proBoundedJson(req,32768));}catch{return proFail(400,'Revise los datos.');}
  const r=await a.db.rpc('pro_work_selection_visibility_mutate',{p_owner:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'Las selecciones cambiaron en otra pestaña. Recargue.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo guardar. Reintente: no se duplicará.');}
}
