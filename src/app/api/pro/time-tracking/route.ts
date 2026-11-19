import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {taskDueDate} from '@/lib/pro/work-tasks';
import {timeMutationSchema,type TimeMutation} from '@/lib/pro/time-tracking';
import {proInternalFinanceAllowed,proWithoutInternalCost,proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
// Families 21/22: own timer and time entries; stopped entries become job-cost lines.
const conflict='Las horas cambiaron. Actualice antes de continuar.';
const querySchema=z.object({workId:z.string().trim().min(1).max(160),from:taskDueDate.unwrap(),to:taskDueDate.unwrap()}).strict();
/** True when the job of a time operation is cancelled or its customer archived (read only, own rows). */
async function inactiveJob(db:Awaited<ReturnType<typeof proActor>>['db'],owner:string,input:TimeMutation){
 try{
  let workId:string|null='workId' in input?input.workId:null;
  if(!workId&&'entryId' in input){const entry=await db!.from('pro_time_entries').select('work_id').eq('owner_id',owner).eq('id',input.entryId).maybeSingle();workId=entry.data?.work_id??null;}
  if(!workId)return false;
  const work=await db!.from('pro_work').select('cancelled,clientId').eq('user_id',owner).eq('id',workId).maybeSingle();if(!work.data)return false;
  if(work.data.cancelled)return true;
  const client=await db!.from('pro_clients').select('archived').eq('user_id',owner).eq('id',work.data.clientId).maybeSingle();return client.data?.archived===true;
 }catch{return false;}
}
export async function GET(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);const q=raw?querySchema.safeParse(raw):null;if(!q?.success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_time_read',{p_actor:a.user.id,p_work:q.data.workId,p_from:q.data.from,p_to:q.data.to});
  if(result.error)return proDbError(result.error,conflict);if(!result.data)return proFail(404,'Trabajo no disponible.');
  // Round 4B: people who can be credited with an entry (owner + active team members of this job).
  const people=await a.db.rpc('pro_time_people',{p_actor:a.user.id,p_work:q.data.workId});if(people.error)return proDbError(people.error,conflict);
  const read={...result.data,people:people.data??[]} as Record<string,unknown>&{totals?:Record<string,unknown>};
  if(!await proInternalFinanceAllowed())return Response.json({...proWithoutInternalCost(read,{nullify:['costCents']}),totals:{...proWithoutInternalCost(read.totals??{},{nullify:['costCents']}),uncostedMinutes:0},costsHidden:true},{headers});
  return Response.json(read,{headers});
 }catch{return proFail(503,'No se pudieron cargar las horas.');}
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'time-tracking-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=timeMutationSchema.parse(await proBoundedJson(req,8192));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise las horas.');}
  // An activity carries the internal cost per hour: Member and Read-only (who never see it) cannot overwrite it.
  if(input.action==='activity_save'&&!await proInternalFinanceAllowed())return Response.json({error:'Su rol en esta empresa no permite cambiar tarifas ni costos por hora.',code:'pro_role',capability:'finance.read'},{status:403,headers});
  const result=await a.db.rpc('pro_time_mutate_person',{p_actor:a.user.id,p_input:input});
  if(result.error){
   // A job that was cancelled (or whose customer was archived) cannot receive hours: say so instead of a generic 400.
   if(result.error.hint==='pro_billing_invoiced')return Response.json({error:'Estas horas están en un borrador de factura activo. Archive ese borrador en Facturas para poder anularlas.',code:'invoiced'},{status:400,headers});
   if(result.error.code==='22023'&&(input.action==='stop'||input.action==='start'||input.action==='manual')&&await inactiveJob(a.db,a.user.id,input))return Response.json({error:'El trabajo está cancelado o su cliente está archivado.',code:'inactive_job'},{status:400,headers});
   return proDbError(result.error,conflict);
  }
  return Response.json(result.data,{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
