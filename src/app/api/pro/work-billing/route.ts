import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {workBillingCreateSchema} from '@/lib/pro/work-billing';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';
// Round 4B: invoice drafts from a job's quote lines, progress and billable time/expenses (internal drafts only).
const conflict='Lo que se puede facturar cambió (otro borrador o un cambio reciente). Actualice y revise la selección.';
const querySchema=z.object({workId:z.string().trim().min(1).max(160)}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);const q=raw?querySchema.safeParse(raw):null;if(!q?.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_invoice_billing_sources',{p_user:a.user.id,p_work:q.data.workId});
  if(result.error)return proDbError(result.error,conflict);
  return result.data?Response.json(result.data,{headers}):proFail(404,'Trabajo no disponible.');
 }catch{return proFail(503,'No se pudo cargar lo que se puede facturar.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'work-billing-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=workBillingCreateSchema.parse(await proBoundedJson(req,16384));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise la selección y los porcentajes.');}
  const result=await a.db.rpc('pro_invoice_billing_create',{p_user:a.user.id,p_input:input});
  if(result.error){
   if(result.error.hint==='pro_billing_already')return Response.json({error:conflict,reason:'already_billed'},{status:409,headers});
   if(result.error.code==='22023')return proFail(400,'El trabajo está cancelado, su cliente archivado o la selección no es válida. No se creó ningún borrador.');
   return proDbError(result.error,conflict);
  }
  return Response.json({id:result.data},{headers});
 }catch{return proFail(503,'No se pudo comprobar el borrador. Reintente la misma operación.');}
}
