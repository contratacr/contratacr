import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {extrasMutationSchema,extrasRowSchema,parseExtrasData} from '@/lib/pro/project-extras';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Area C: per-project and per-owner extras (task tags, time markup, preferences, statuses, templates). Owner only. */
const keys=z.array(z.string().min(1).max(160)).max(200);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q)return proFail(400,'Consulta inválida.');
  const list=q.keys?keys.parse(q.keys.split(',').filter(Boolean)):null;
  if(q.scope==='owner'){
   const kind=z.enum(['statuses','templates']).parse(q.kind);
   const r=await a.db.rpc('pro_owner_extras_read',{p_actor:a.user.id,p_kind:kind,p_keys:list});if(r.error)return proDbError(r.error,'Los datos cambiaron.');
   return Response.json({items:z.record(z.string(),extrasRowSchema).parse(r.data)},{headers});
  }
  const workId=z.string().min(1).max(160).parse(q.workId),kind=z.enum(['task','time','prefs','activity']).parse(q.kind);
  const r=await a.db.rpc('pro_work_extras_read',{p_actor:a.user.id,p_work:workId,p_kind:kind,p_keys:list});if(r.error){if(r.error.code==='P0002')return proFail(404,'El trabajo ya no está disponible.');return proDbError(r.error,'Los datos cambiaron.');}
  let links:unknown={};
  if(kind==='task'&&list&&list.every(x=>z.string().uuid().safeParse(x).success)){
   const l=await a.db.rpc('pro_work_task_schedule_link',{p_actor:a.user.id,p_work:workId,p_tasks:list});if(l.error)return proDbError(l.error,'Los datos cambiaron.');links=l.data;
  }
  return Response.json({items:z.record(z.string(),extrasRowSchema).parse(r.data),links:z.record(z.string(),z.object({phase:z.string().nullable(),start:z.string().nullable(),end:z.string().nullable()})).parse(links)},{headers});
 }catch{return proFail(400,'Consulta inválida.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'project-extras-'+a.user.id,120,60000);if(limited)return limited;
 let input;try{input=extrasMutationSchema.parse(await proBoundedJson(req,20000));}catch{return proFail(400,'Revise los datos.');}
 const data=parseExtrasData(input.scope,input.kind,input.data);if(!data)return proFail(400,'Revise los datos.');
 try{
  const r=input.scope==='work'
   ?await a.db.rpc('pro_work_extras_set',{p_actor:a.user.id,p_work:input.workId,p_kind:input.kind,p_key:input.key,p_revision:input.revision,p_data:data})
   :await a.db.rpc('pro_owner_extras_set',{p_actor:a.user.id,p_kind:input.kind,p_key:input.key,p_revision:input.revision,p_data:data});
  if(r.error){if(r.error.code==='P0002')return proFail(404,'El registro ya no está disponible.');return proDbError(r.error,'Los datos cambiaron. Actualice antes de guardar.');}
  return Response.json({item:extrasRowSchema.parse(r.data)},{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente.');}
}
