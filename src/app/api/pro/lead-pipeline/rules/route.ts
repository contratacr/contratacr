import {enforceRateLimit} from '@/lib/rate-limit';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {stageRulesInputSchema,stageRulesReadSchema,stageRulesResultSchema} from '@/lib/pro/sales-pipeline';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 07: rules per pipeline stage ("follow up N days after a lead enters the stage") and the work list of leads that
 * reached that follow-up. SQL is the authority (pro_lead_stage_rules_*): CAS revision (40001 -> 409), idempotent
 * action receipts, immutable history. Nothing is sent. Role gate: writes = lead.write (prefix lead-).
 */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const r=await a.db.rpc('pro_lead_stage_rules_read',{p_owner:a.user.id});if(r.error)return proDbError(r.error,'Las solicitudes cambiaron.');
  return Response.json(stageRulesReadSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar las reglas.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'lead-stage-rules-'+a.user.id,120,60000);if(limited)return limited;
  let input;try{input=stageRulesInputSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise los datos de la regla.');}
  const member=await proWorkspaceMember();const r=await a.db.rpc('pro_lead_stage_rules_mutate',{p_owner:a.user.id,p_input:input,p_member:member?.memberId??null});
  if(r.error)return proDbError(r.error,'Las reglas cambiaron en otra pestaña. Recargue.');
  return Response.json(stageRulesResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo guardar. Reintente: no se duplicará.');}
}
