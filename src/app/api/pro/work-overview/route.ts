import {z} from 'zod';
import {proActor,proDbError,proFail,proInternalFinanceAllowed,proQuery,proRouteHeaders} from '@/lib/pro/route-common';
import {workOverviewParts,workOverviewSchemas} from '@/lib/pro/work-overview';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 4A: job overview widgets (owner only, read-only).
const query=z.object({workId:z.string().trim().min(1).max(160),part:z.enum(workOverviewParts)}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);const q=raw?query.safeParse(raw):null;
  if(!q?.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_work_overview_read',{p_actor:a.user.id,p_work:q.data.workId,p_part:q.data.part});
  if(result.error)return proDbError(result.error,'El trabajo cambió. Actualice.');
  if(!result.data)return proFail(404,'Trabajo no disponible.');
  let body=result.data as Record<string,unknown>;
  if(q.data.part==='open'){
   // Round 5: overdue / upcoming installments and a plan waiting for the customer (owner only, read-only).
   const plan=await a.db.rpc('pro_payment_plan_notices',{p_actor:a.user.id,p_work:q.data.workId});
   if(plan.error)return proDbError(plan.error,'El trabajo cambió. Actualice.');
   const n=(plan.data??{}) as {overdueCount?:number;overdueCents?:number;upcomingCount?:number;awaitingAcceptance?:boolean};
   body={...body,paymentOverdue:n.overdueCount??0,paymentOverdueCents:n.overdueCents??0,paymentUpcoming:n.upcomingCount??0,paymentAwaiting:n.awaitingAcceptance??false};
  }
  if(q.data.part==='finance'&&!await proInternalFinanceAllowed())body={...body,costCents:null,committedCents:null,resultCents:null,resultWithCommittedCents:null,resultBasis:null,uncostedCount:0,costsHidden:true};
  return Response.json(workOverviewSchemas[q.data.part].parse(body),{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo cargar el resumen. Reintente.');}
}
