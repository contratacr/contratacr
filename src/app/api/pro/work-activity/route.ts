import {proAccountRateLimit,proActor,proDbError,proFail,proQuery,proRouteHeaders} from '@/lib/pro/route-common';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {workActivityPageSchema,workActivityQuerySchema} from '@/lib/pro/work-activity';

// Per-job «Actividad» history (read-only; docs/pro/sql/pro-work-activity-local.sql). The owner, or a company
// member whose role allows reading (the gate already ran; the SQL checks the role again with the member id).
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);const q=raw?workActivityQuerySchema.safeParse(raw):null;
  if(!q?.success)return proFail(400,'Consulta inválida.');
  const limited=await proAccountRateLimit('work-activity',a.user.id,120,60000);if(limited)return limited;
  const member=await proWorkspaceMember(),actor=member&&member.ownerId===a.user.id?member.memberId:a.user.id;
  const result=await a.db.rpc('pro_work_activity_read',{p_actor:actor,p_owner:a.user.id,p_work:q.data.workId,p_before_at:q.data.before??null,p_before_id:q.data.beforeId??null,p_limit:Number(q.data.limit??20)});
  if(result.error)return proDbError(result.error,'El trabajo cambió. Actualice.');
  if(!result.data)return proFail(404,'Trabajo no disponible.');
  const page=workActivityPageSchema.parse(result.data);if(page.workId!==q.data.workId)return proFail(503,'No se pudo cargar la actividad. Reintente.');
  return Response.json(page,{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo cargar la actividad. Reintente.');}
}
