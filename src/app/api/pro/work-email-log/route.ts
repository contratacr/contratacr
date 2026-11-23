import {z} from 'zod';
import {proActor,proDbError,proFail,proQuery,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {inboxMessageSchema} from '@/lib/pro/email-tools';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 10: received emails that the owner linked to ONE job (read-only copy of the synced inbox). The job screen
 * merges them with the emails sent or simulated from that job into one conversation log. Read only.
 */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const q=proQuery(req),parsed=z.object({workId:z.string().trim().min(1).max(160)}).strict().safeParse(q);if(!parsed.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_inbox_work_read',{p_actor:a.user.id,p_work:parsed.data.workId,p_limit:30});
  if(r.error)return r.error.code==='P0002'?proFail(404,'El trabajo ya no está disponible.'):proDbError(r.error,'Los datos cambiaron.');
  return Response.json({messages:z.array(inboxMessageSchema).parse((r.data as {messages:unknown}).messages)},{headers});
 }catch{return proFail(503,'No se pudo cargar el registro de correo.');}
}
