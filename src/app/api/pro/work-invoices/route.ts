import {z} from 'zod';
import {proActor,proDbError,proFail,proQuery,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {workInvoicesSchema} from '@/lib/pro/work-invoices';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Area D: invoices of one job with their lifecycle (read only). Owner only. */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const a=await proActor(req);if(a.error)return a.error;
 const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');
 const workId=z.string().trim().min(1).max(160).safeParse(q.workId);if(!workId.success)return proFail(400,'Consulta inválida.');
 const r=await a.db.rpc('pro_work_invoices_read',{p_actor:a.user.id,p_work:workId.data});
 if(r.error){if(r.error.code==='P0002')return proFail(404,'El trabajo ya no está disponible.');return proDbError(r.error,'El trabajo cambió.');}
 const parsed=workInvoicesSchema.safeParse(r.data);if(!parsed.success)return proFail(503,'No se pudieron leer las facturas.');
 return Response.json(parsed.data,{headers});
}
