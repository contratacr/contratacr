import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proSameOrigin,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 74: Pro support. Tickets are the platform's own support tickets (same thread, same admin panel) tagged topic "pro"
 * with a priority and a first-response TARGET. Replies and thread reading use the existing /api/support routes.
 */
const create=z.object({subject:z.string().trim().min(3).max(150),message:z.string().trim().min(5).max(4000),priority:z.enum(['normal','urgent'])}).strict();
const list=z.object({tickets:z.array(z.object({id:z.string().uuid(),caseNumber:z.number().int(),subject:z.string(),status:z.enum(['open','in_progress','resolved','closed']),priority:z.enum(['normal','urgent']).nullable(),
 createdAt:z.string(),dueAt:z.string().nullable(),firstResponseAt:z.string().nullable(),sla:z.enum(['met','late','overdue','pending']),lastReplyRole:z.string().nullable()}).strict()).max(50)}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q||Object.keys(q).length)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_support_read',{p_actor:a.user.id});if(r.error)return proDbError(r.error,'Los datos cambiaron.');
  return Response.json(list.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar el soporte.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'company-support-'+a.user.id,10,3600000);if(limited)return limited;
 let input;try{input=create.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise los datos.');}
 try{
  const r=await a.db.rpc('pro_support_create',{p_actor:a.user.id,p_input:input});
  if(r.error){if(r.error.code==='54000')return proFail(429,'Ya tiene 5 consultas abiertas. Espere la respuesta o ciérrelas.');return proDbError(r.error,'Los datos cambiaron.');}
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo enviar la consulta. Reintente.');}
}
