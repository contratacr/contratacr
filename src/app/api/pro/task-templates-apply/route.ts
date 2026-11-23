import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {templateApplyMappedSchema} from '@/lib/pro/round10';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 10 (row 78): apply a task template with an assignee mapping in ONE transaction: the existing
 * template writer creates the tasks and the existing task writer sets each mapped «Responsable»
 * (task history kept), with its own receipt (replay-safe). Role gate: company.write (task-templates).
 */
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'task-templates-apply-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=templateApplyMappedSchema.parse(await proBoundedJson(req,32768));}catch{return proFail(400,'Revise la plantilla y los responsables.');}
  const r=await a.db.rpc('pro_task_template_apply_mapped',{p_owner:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'La plantilla o el trabajo cambiaron. Recargue y vuelva a revisar.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo aplicar. Reintente: no se duplicará.');}
}
