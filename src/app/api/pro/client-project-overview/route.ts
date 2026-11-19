import {z} from 'zod';
import {proActor,proDbError,proFail,proQuery,proRouteHeaders,proCustomerReader} from '@/lib/pro/route-common';
import {clientProjectOverviewSchema} from '@/lib/pro/round12';

// Round 12: overview of the customer's project (linked customer, or the owner's «Customer view» preview).
// Read-only. When the real customer opens it, the professional's payment plan reminders for THIS
// customer are brought up to date in the customer's in-app bell (idempotent; push suppressed; never sent).
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);
  if(!q||Object.keys(q).join()!=='requestId')return proFail(400,'Consulta inválida.');
  const request=z.string().uuid().safeParse(q.requestId);if(!request.success)return proFail(400,'Consulta inválida.');
  const reader=await proCustomerReader(a.db,a.user.id,request.data);
  if(reader===a.user.id){
   const owner=await a.db.from('pro_appointment_requests').select('owner_id').eq('id',request.data).eq('client_user_id',a.user.id).maybeSingle();
   if(!owner.error&&owner.data?.owner_id)await a.db.rpc('pro_client_installment_reminders_run',{p_owner:owner.data.owner_id,p_recipient:a.user.id});
  }
  const result=await a.db.rpc('pro_client_project_overview',{p_actor:reader,p_request:request.data});
  if(result.error)return proDbError(result.error,'Los datos cambiaron. Actualice.');
  if(!result.data)return proFail(404,'Cita no disponible.');
  return Response.json(clientProjectOverviewSchema.parse(result.data),{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo cargar el resumen del proyecto. Reintente.');}
}
