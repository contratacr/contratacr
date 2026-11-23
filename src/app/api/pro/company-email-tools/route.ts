import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proSameOrigin,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {emailTemplateSchema,emailToolsMutationSchema,inboxMessageSchema} from '@/lib/pro/email-tools';
import {syncInbox} from '@/lib/pro/integrations/workspace/inbox';
import {OAuthError} from '@/lib/pro/integrations/oauth/service';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Family 10: email templates (owner CRUD with archive) and the synced inbox of the connected mailbox (read-only copy,
 * linkable to a job). The path starts with «company-» so the role gate asks for company.write (Administrador/Gerente).
 * Mock mode never touches the network; nothing here sends mail.
 */
const reasons:Record<string,string>={not_connected:'Conecte la cuenta primero.',pro_oauth_not_connected:'Conecte la cuenta primero.',scope:'Vuelva a conectar la cuenta para permitir leer el correo.',disabled:'La integración está desactivada.',missing_keys:'Faltan claves de este proveedor en el servidor.',production_refused:'Producción no está permitida en este servidor.',provider:'El proveedor no respondió. Reintente.',store:'No se pudo guardar el correo recibido.'};
const oauthFail=(error:OAuthError)=>Response.json({error:reasons[error.reason]??'No se pudo completar la operación.',reason:error.reason},{status:error.status,headers});
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q||Object.keys(q).length)return proFail(400,'Consulta inválida.');
  const [templates,inbox]=await Promise.all([a.db.rpc('pro_email_templates_read',{p_actor:a.user.id}),a.db.rpc('pro_inbox_read',{p_actor:a.user.id,p_limit:50})]);
  if(templates.error)return proDbError(templates.error,'Los datos cambiaron.');if(inbox.error)return proDbError(inbox.error,'Los datos cambiaron.');
  return Response.json({
   templates:z.array(emailTemplateSchema).parse((templates.data as {templates:unknown}).templates),
   inbox:z.array(inboxMessageSchema).parse((inbox.data as {messages:unknown}).messages),
  },{headers});
 }catch{return proFail(503,'No se pudo cargar el correo.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'company-email-tools-'+a.user.id,60,60000);if(limited)return limited;
 let input;try{input=emailToolsMutationSchema.parse(await proBoundedJson(req,32768));}catch{return proFail(400,'Revise los datos.');}
 try{
  if(input.action==='template_save'){
   const r=await a.db.rpc('pro_email_template_set',{p_actor:a.user.id,p_input:{action:'save',id:input.id,revision:input.revision,name:input.name,subject:input.subject,body:input.body,locale:input.locale}});
   if(r.error)return proDbError(r.error,'La plantilla cambió o ya existe una con ese nombre. Actualice antes de guardar.');
   return Response.json({template:emailTemplateSchema.parse(r.data)},{headers});
  }
  if(input.action==='template_archive'){
   const r=await a.db.rpc('pro_email_template_set',{p_actor:a.user.id,p_input:{action:'archive',id:input.id,revision:input.revision}});
   if(r.error){if(r.error.code==='P0002')return proFail(404,'La plantilla ya no está disponible.');return proDbError(r.error,'La plantilla cambió. Actualice antes de archivar.');}
   return Response.json({template:emailTemplateSchema.parse(r.data)},{headers});
  }
  if(input.action==='inbox_sync')return Response.json(await syncInbox(a.db,a.user.id,input.provider),{headers});
  const r=await a.db.rpc('pro_inbox_link',{p_actor:a.user.id,p_provider:input.provider,p_remote:input.remoteId,p_work:input.workId});
  if(r.error){if(r.error.code==='P0002')return proFail(404,'El mensaje o el trabajo ya no está disponible.');return proDbError(r.error,'No se pudo vincular el mensaje.');}
  return Response.json({link:r.data},{headers});
 }catch(error){
  if(error instanceof OAuthError)return oauthFail(error);
  return proFail(503,'No se pudo comprobar la operación. Reintente.');
 }
}
