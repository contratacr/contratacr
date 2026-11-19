import {z} from 'zod';
import {proActor,proDbError,proFail,proQuery,proRouteHeaders} from '@/lib/pro/route-common';

// Round 1: live customer balance of one job, the single formula of client-balance-local.sql
// (agreed − payments − applied credit notes; retainers are payments). Read only, development only.
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req);const parsed=raw&&z.object({workId:z.string().trim().min(1).max(160)}).strict().safeParse(raw);if(!parsed||!parsed.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_client_job_balance',{p_user:a.user.id,p_work:parsed.data.workId});
  if(result.error)return proDbError(result.error,'El saldo cambió. Actualice.');
  return result.data?Response.json(result.data,{headers:proRouteHeaders}):proFail(404,'Trabajo no disponible.');
 }catch{return proFail(503,'No se pudo cargar el saldo. Reintente.');}
}
