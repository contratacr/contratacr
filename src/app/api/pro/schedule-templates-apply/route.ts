import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {scheduleTemplateMutationSchema} from '@/lib/pro/schedule-templates';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Template role («cargo» typed in the template) -> person on the job. Empty target leaves the task without a manual assignee. */
const scheduleTemplateAssigneeMapSchema=z.record(z.string().min(1).max(160),z.string().max(160)).refine(v=>Object.keys(v).length>=1&&Object.keys(v).length<=20);

/**
 * Row 79 (batch F): apply a schedule template with an assignee mapping in ONE transaction
 * (`pro_schedule_template_apply_mapped`, migration 560): the existing template writer creates the plan, the
 * existing task writer sets each mapped «Responsable», with its own replay-safe receipt. Role gate: company.write.
 */
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'schedule-templates-apply-'+a.user.id,30,60000);if(limited)return limited;
  let input;
  try{
   const raw=await proBoundedJson(req,65536) as Record<string,unknown>;
   const assigneeMap=scheduleTemplateAssigneeMapSchema.parse(raw?.assigneeMap);
   const rest={...raw};delete rest.assigneeMap;
   const apply=scheduleTemplateMutationSchema.parse(rest);if(apply.action!=='apply')throw Error();
   input={...apply,assigneeMap};
  }catch{return proFail(400,'Revise la plantilla y los responsables.');}
  const r=await a.db.rpc('pro_schedule_template_apply_mapped',{p_actor:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'La plantilla o el trabajo cambiaron. Recargue y vuelva a revisar.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo aplicar. Reintente: no se duplicará.');}
}
