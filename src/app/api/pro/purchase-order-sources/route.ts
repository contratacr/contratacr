import {z} from 'zod';
import {proAccountRateLimit,proActor,proDbError,proFail,proInternalFinanceDenied,proQuery,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {poSourcesSchema} from '@/lib/pro/round11';

/**
 * Round 11 (rows 51, 62): what a new purchase order of the job can be prefilled from — accepted quote lines
 * (with the owner's internal unit cost), approved selection options (internal cost, quantity already
 * ordered) and budget codes (planned and committed). Read-only: the order is created by the existing
 * /api/pro/purchase-orders writer.
 */
const query=z.object({workId:z.string().trim().min(1).max(160)}).strict();
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const denied=await proInternalFinanceDenied();if(denied)return denied;const limited=await proAccountRateLimit('po-sources',a.user.id,60,60000);if(limited)return limited;const raw=proQuery(req),q=raw?query.safeParse(raw):null;if(!q?.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_purchase_order_sources',{p_actor:a.user.id,p_work:q.data.workId});
  if(r.error)return proDbError(r.error,'Los datos cambiaron. Actualice.');
  if(!r.data)return proFail(404,'Trabajo no disponible.');
  return Response.json(poSourcesSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar los orígenes. Reintente.');}
}
