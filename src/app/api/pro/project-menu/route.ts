import {z} from 'zod';
import {proActor,proDbError,proFail,proQuery,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Area C: pin flag, custom status and custom status list of one project (writes go through /api/pro/projects-hub). */
const schema=z.object({pinned:z.boolean(),statusId:z.string().uuid().nullable(),statuses:z.array(z.object({id:z.string().uuid(),name:z.string().max(40),color:z.string().max(20)})).max(20)});
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');
  const workId=z.string().min(1).max(160).parse(q.workId);
  const r=await a.db.rpc('pro_project_hub_read_one',{p_actor:a.user.id,p_work:workId});
  if(r.error){if(r.error.code==='P0002')return proFail(404,'El proyecto ya no está disponible.');return proDbError(r.error,'El proyecto cambió.');}
  return Response.json(schema.parse(r.data),{headers});
 }catch{return proFail(400,'Consulta inválida.');}
}
