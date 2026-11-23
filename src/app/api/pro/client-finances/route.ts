import {z} from 'zod';
import {proActor,proDbError,proFail,proQuery,proRouteHeaders,proCustomerReader} from '@/lib/pro/route-common';
import {clientFinancesSchema} from '@/lib/pro/client-finances';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 4A: read-only «Finances» of the customer view (linked customer, or the owner's preview).
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);
  if(!q||Object.keys(q).join()!=='requestId')return proFail(400,'Consulta inválida.');
  const request=z.string().uuid().safeParse(q.requestId);if(!request.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_client_finances_client_read',{p_actor:await proCustomerReader(a.db,a.user.id,request.data),p_request:request.data});
  if(result.error)return proDbError(result.error,'Los datos cambiaron. Actualice.');
  if(!result.data)return proFail(404,'Cita no disponible.');
  return Response.json(clientFinancesSchema.parse(result.data),{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudieron cargar las finanzas. Reintente.');}
}
