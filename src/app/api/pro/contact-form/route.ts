import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {contactFormAnswersSchema,contactFormMutationSchema,contactFormReadSchema} from '@/lib/pro/contact-form';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Leads area: owner side of the contact form builder (one form per company). SQL is the authority (pro_contact_form_*).
 * GET: the form (or null), or ?leadId= the answers of the submission that created a lead. POST: save / publish / unpublish, guarded by the revision (409).
 */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  const lead=z.object({leadId:z.string().uuid()}).strict().safeParse(raw);
  if(Object.keys(raw).length&&lead.success){
   const r=await a.db.rpc('pro_contact_form_lead_answers',{p_owner:a.user.id,p_lead:lead.data.leadId});if(r.error)return proDbError(r.error,'El formulario cambió.');
   return Response.json(contactFormAnswersSchema.parse(r.data),{headers});
  }
  if(Object.keys(raw).length)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_contact_form_read',{p_owner:a.user.id});if(r.error)return proDbError(r.error,'El formulario cambió.');
  return Response.json(contactFormReadSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar el formulario de contacto.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'contact-form-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=contactFormMutationSchema.parse(await proBoundedJson(req,24576));}catch{return proFail(400,'Revise los campos del formulario.');}
  const r=await a.db.rpc('pro_contact_form_mutate',{p_owner:a.user.id,p_input:input});
  if(r.error)return proDbError(r.error,'El formulario cambió. Actualice y revise.');
  return Response.json(contactFormReadSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente.');}
}
