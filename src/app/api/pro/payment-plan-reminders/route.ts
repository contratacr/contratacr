import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';
import {paymentPlanMoraSchema} from '@/lib/pro/payment-plan';
import {resolveReminderChannel} from '@/lib/pro/reminders/channel';
import {reminderMessage} from '@/lib/pro/reminders/message';

// Row 57: delinquency (mora) state and reminders of the professional's installment plans. The tray (app) is recorded in the database;
// e-mail and SMS go through the reminder adapter, which is the sandbox here: nothing is sent to a real person.
const query=z.union([z.object({}).strict(),z.object({workId:z.string().trim().min(1).max(160)}).strict()]);
const body=z.object({action:z.literal('prepare'),workId:z.string().trim().min(1).max(160).optional()}).strict();
const conflict='Los recordatorios cambiaron. Actualice.';
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  const parsed=query.safeParse(raw);if(!parsed.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_payment_plan_mora_read',{p_actor:a.user.id,p_query:parsed.data});
  if(r.error)return proDbError(r.error,conflict);
  if(!r.data)return proFail(404,'Trabajo no disponible.');
  return Response.json(paymentPlanMoraSchema.parse(r.data),{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo cargar la mora. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'plan-reminders-'+a.user.id,30,60000);if(limited)return limited;
  let input;try{input=body.parse(await proBoundedJson(req,2048));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise la solicitud.');}
  const prepared=await a.db.rpc('pro_payment_plan_reminders_prepare',{p_actor:a.user.id,p_input:input.workId?{workId:input.workId}:{}});
  if(prepared.error)return proDbError(prepared.error,conflict);
  // Hand the queued e-mail/SMS to the adapter (sandbox unless explicitly live) and record each result.
  const queue=await a.db.rpc('pro_payment_plan_reminders_queue',{p_actor:a.user.id});
  if(queue.error)return proDbError(queue.error,conflict);
  const channel=resolveReminderChannel();let sent=0,failed=0;
  for(const row of (Array.isArray(queue.data)?queue.data:[]) as Array<{id:string;channel:'email'|'sms';kind:'upcoming'|'late_light'|'late_moderate'|'late_severe';dueDate:string;pendingCents:number;daysOverdue:number;workTitle:string|null;clientName:string|null;to:string|null}>){
   const result=row.to?await channel.send(reminderMessage({...row,workTitle:row.workTitle??'',to:row.to})):{ok:false as const,error:'invalid_target'};
   const marked=await a.db.rpc('pro_payment_plan_reminders_mark',{p_actor:a.user.id,p_input:{id:row.id,status:result.ok?'sandbox_sent':'failed',providerRef:result.ok?result.providerRef:null}});
   if(marked.error)return proDbError(marked.error,conflict);
   if(result.ok)sent++;else failed++;
  }
  return Response.json({...(prepared.data as object),mode:channel.mode,sent,failed},{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudieron preparar los recordatorios. Reintente.');}
}
