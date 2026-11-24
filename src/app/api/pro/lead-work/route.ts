import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {leadTaskInputSchema,leadTasksSchema,leadWorkQuerySchema} from '@/lib/pro/lead-work';
import {leadAnchorExists} from '@/lib/pro/lead-work-server';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Leads area: private tasks of a lead (manual opportunity or ContrataCR request). Add is idempotent by the client id;
 * set_done/edit/remove are guarded by the task revision (409). Nothing is sent to the customer.
 */
type Row={id:string;title:string;due_date:string|null;done:boolean;revision:number;created_at:string};
const cols='id,title,due_date,done,revision,created_at';
const view=(kind:'manual'|'request',leadId:string,rows:Row[])=>leadTasksSchema.parse({kind,leadId,items:rows.map(r=>({id:r.id,title:r.title,dueDate:r.due_date,done:r.done,revision:r.revision,createdAt:r.created_at}))});
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),q=raw?leadWorkQuerySchema.safeParse(raw):null;if(!q?.success)return proFail(400,'Consulta inválida.');
  const access=await leadAnchorExists(a.db,a.user.id,q.data.kind,q.data.leadId);if(access==='forbidden')return proFail(403,'Sin acceso.');if(access==='missing')return proFail(404,'Solicitud no disponible.');
  const r=await a.db.from('pro_lead_tasks').select(cols).eq('owner_id',a.user.id).eq('lead_id',q.data.leadId).order('created_at').order('id').limit(200);if(r.error)throw Error();
  return Response.json(view(q.data.kind,q.data.leadId,r.data as Row[]),{headers});
 }catch{return proFail(503,'No se pudieron cargar las tareas.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'lead-work-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=leadTaskInputSchema.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise el título y la fecha de la tarea.');}
  const access=await leadAnchorExists(a.db,a.user.id,input.kind,input.leadId);if(access==='forbidden')return proFail(403,'Sin acceso.');if(access==='missing')return proFail(404,'Solicitud no disponible.');
  const owner=a.user.id;
  if(input.action==='add'){
   const exists=await a.db.from('pro_lead_tasks').select('id,title,due_date').eq('owner_id',owner).eq('id',input.id).maybeSingle();if(exists.error)throw Error();
   if(exists.data){if(exists.data.title!==input.title||exists.data.due_date!==input.dueDate)return proFail(400,'La tarea ya existe con otro contenido.');}
   else{
    const count=await a.db.from('pro_lead_tasks').select('id',{count:'exact',head:true}).eq('owner_id',owner).eq('lead_id',input.leadId);if(count.error)throw Error();if((count.count??0)>=200)return proFail(429,'Esta solicitud ya tiene el máximo de tareas.');
    const ins=await a.db.from('pro_lead_tasks').insert({owner_id:owner,id:input.id,kind:input.kind,lead_id:input.leadId,manual_id:input.kind==='manual'?input.leadId:null,request_id:input.kind==='request'?input.leadId:null,title:input.title,due_date:input.dueDate});if(ins.error&&ins.error.code!=='23505')throw Error();
   }
  }else{
   const cur=await a.db.from('pro_lead_tasks').select('revision,done,title,due_date').eq('owner_id',owner).eq('lead_id',input.leadId).eq('id',input.id).maybeSingle();if(cur.error)throw Error();if(!cur.data)return proFail(404,'Tarea no disponible.');
   if(cur.data.revision!==input.revision){
    // An exact retry of the change that already landed is not a conflict.
    const same=input.action==='set_done'&&cur.data.revision===input.revision+1&&cur.data.done===input.done;
    if(!same)return proFail(409,'La tarea cambió. Se actualizó la lista; revise e intente de nuevo.');
   }else if(input.action==='remove'){const del=await a.db.from('pro_lead_tasks').delete().eq('owner_id',owner).eq('id',input.id).eq('revision',input.revision);if(del.error)throw Error();}
   else{
    const patch=input.action==='set_done'?{done:input.done}:{title:input.title,due_date:input.dueDate};
    const up=await a.db.from('pro_lead_tasks').update({...patch,revision:input.revision+1,updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('id',input.id).eq('revision',input.revision).select('id');if(up.error)throw Error();if(!up.data?.length)return proFail(409,'La tarea cambió. Se actualizó la lista; revise e intente de nuevo.');
   }
  }
  const r=await a.db.from('pro_lead_tasks').select(cols).eq('owner_id',owner).eq('lead_id',input.leadId).order('created_at').order('id').limit(200);if(r.error)throw Error();
  return Response.json(view(input.kind,input.leadId,r.data as Row[]),{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente: no se duplicará.');}
}
