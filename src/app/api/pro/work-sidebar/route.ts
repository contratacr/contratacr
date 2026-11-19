import {z} from 'zod';
import {proActor,proDbError,proFail,proQuery,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {workSidebarSchema} from '@/lib/pro/round8';

/** Round 8: right column of the job page (status, location, customer, collaborators, meetings, tags). Read only. */
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req);const parsed=raw&&z.object({workId:z.string().trim().min(1).max(160)}).strict().safeParse(raw);if(!parsed||!parsed.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_work_sidebar_read',{p_actor:a.user.id,p_work:parsed.data.workId});if(r.error)return proDbError(r.error,'El trabajo cambió.');
  return r.data?Response.json(workSidebarSchema.parse(r.data),{headers}):proFail(404,'Trabajo no disponible.');
 }catch{return proFail(503,'No se pudieron cargar los datos del trabajo.');}
}
