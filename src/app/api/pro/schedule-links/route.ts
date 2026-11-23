import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proAccountRateLimit,proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {multiScheduleSchema,scheduleInputSchema,scheduleLinksSchema,shiftPreviewSchema} from '@/lib/pro/round10';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 13 (calendar): optional working-day variants (calendar=1 preview, shift_cal, calendarize) use the company work calendar.
 * Round 10 (row 13): dependency rules (FS/SS + lag) of the job plan, preview/apply/undo of a date change
 * that pushes dependent tasks, and the combined schedule of every job. SQL is the authority
 * (pro_schedule_*): schedule revision CAS (409), receipts by actionId, immutable action log.
 * Role gate: writes = work.write.
 */
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/),work=z.string().trim().min(1).max(160);
const query=z.discriminatedUnion('view',[
 z.object({view:z.literal('links'),workId:work}).strict(),
 z.object({view:z.literal('preview'),workId:work,taskId:z.string().uuid(),start:day,end:day,calendar:z.enum(['0','1']).optional()}).strict(),
 z.object({view:z.literal('calendarize'),workId:work}).strict(),
 z.object({view:z.literal('multi'),from:day,to:day}).strict(),
]);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),parsed=raw?query.safeParse(raw):null;if(!parsed?.success)return proFail(400,'Consulta inválida.');
  const q=parsed.data;
  if(q.view==='links'){const r=await a.db.rpc('pro_schedule_links_read',{p_owner:a.user.id,p_work:q.workId});if(r.error)return proDbError(r.error,'El cronograma cambió.');return Response.json(scheduleLinksSchema.parse(r.data),{headers});}
  // Fix 13: the preview recomputes the chain on every call; rate limited per account.
  if(q.view==='preview'){const limited=await proAccountRateLimit('schedule-preview',a.user.id,60,60000);if(limited)return limited;const r=await a.db.rpc(q.calendar==='1'?'pro_schedule_shift_preview_cal':'pro_schedule_shift_preview',{p_owner:a.user.id,p_work:q.workId,p_task:q.taskId,p_start:q.start,p_end:q.end});if(r.error)return proDbError(r.error,'El cronograma cambió.');return Response.json(shiftPreviewSchema.parse(r.data),{headers});}
  if(q.view==='calendarize'){const limited=await proAccountRateLimit('schedule-preview',a.user.id,60,60000);if(limited)return limited;const r=await a.db.rpc('pro_schedule_calendarize_preview',{p_owner:a.user.id,p_work:q.workId});if(r.error)return proDbError(r.error,'El cronograma cambió.');return Response.json(shiftPreviewSchema.parse(r.data),{headers});}
  const r=await a.db.rpc('pro_schedule_multi_read',{p_owner:a.user.id,p_from:q.from,p_to:q.to});if(r.error)return proDbError(r.error,'El cronograma cambió.');return Response.json(multiScheduleSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar el cronograma.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'schedule-links-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=scheduleInputSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise los datos del cronograma.');}
  const fn=input.action==='shift_cal'?'pro_schedule_shift_cal_apply':input.action==='calendarize'?'pro_schedule_calendarize_apply':'pro_schedule_mutate';
  const r=await a.db.rpc(fn,{p_owner:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'El cronograma cambió en otra pestaña. Recargue y vuelva a revisar.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo guardar. Reintente: no se duplicará.');}
}
