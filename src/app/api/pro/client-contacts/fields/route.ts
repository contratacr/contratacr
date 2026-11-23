import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {proActor,proBoundedJson,proDbError,proFail,proInternalFinanceDenied,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {contactPreviewSchema} from '@/lib/pro/round10';
import {contactExtrasExportSchema,contactExtrasReadSchema,contactExtrasRowSchema,contactFieldsInputSchema,contactFieldsReadSchema,contactFieldsResultSchema,definitionActions} from '@/lib/pro/contact-fields';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Ronda F2-B (row 05): customer custom fields (company definitions), values and additional phones/e-mails
 * per customer, and the import preview/import that writes them with the new customers in one transaction.
 * Nested under /api/pro/client-contacts, so the role gate is the same as the existing import: writes =
 * sales.write (Read-only gets 403). Managing the DEFINITIONS is for the owner, Administrator and Manager.
 */
const rowInput=z.object({name:z.string().max(400).optional(),email:z.string().max(400).optional(),phone:z.string().max(100).optional(),identification:z.string().max(100).optional(),tradeName:z.string().max(400).optional(),group:z.string().max(200).optional(),address:z.string().max(1000).optional(),notes:z.string().max(4000).optional(),tags:z.array(z.string().max(100)).max(20).optional()}).strict();
const importInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('preview'),rows:z.array(rowInput).min(1).max(500),extras:z.array(contactExtrasRowSchema).min(1).max(500)}).strict(),
 z.object({action:z.literal('import'),actionId:z.string().uuid(),revision:z.number().int().nonnegative(),fileName:z.string().trim().min(1).max(160),format:z.enum(['csv','vcard']),rows:z.array(rowInput).min(1).max(500),extras:z.array(contactExtrasRowSchema).min(1).max(500)}).strict(),
]).refine(v=>v.rows.length===v.extras.length);
const query=z.discriminatedUnion('view',[z.object({view:z.literal('fields')}).strict(),z.object({view:z.literal('extras'),clientId:z.string().min(1).max(160)}).strict(),z.object({view:z.literal('export')}).strict()]);
const managerOnly=()=>Response.json({error:'Solo la persona dueña, Administración o Gerencia pueden cambiar los campos personalizados.',code:'pro_role',capability:'fields.manage'},{status:403,headers});
const hintMessage:Record<string,string>={pro_contact_field_capacity:'Ya hay 30 campos activos. Archive uno antes de crear otro.',pro_contact_field_kind_in_use:'Ese campo ya tiene datos: no se puede cambiar su tipo.',pro_contact_field_option_in_use:'Hay clientes con esa opción: no se puede quitar.',
 pro_contact_channel_invalid:'Revise los teléfonos y correos adicionales.',pro_contact_channel_repeated:'Ese teléfono o correo ya está en este cliente.'};
function dbError(error:{code?:string;hint?:string},conflict:string){
 const hint=error.hint??'';if(hintMessage[hint])return Response.json({error:hintMessage[hint],reason:hint},{status:400,headers});
 if(hint.startsWith('pro_contact_field_value:'))return Response.json({error:'Revise el valor del campo.',reason:'field_value',fieldId:hint.slice(24)},{status:400,headers});
 if(error.code==='23505')return Response.json({error:'Ya existe un campo con ese nombre.',reason:'field_repeated'},{status:409,headers});
 return proDbError(error,conflict);
}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),parsed=raw?query.safeParse(raw):null;if(!parsed?.success)return proFail(400,'Consulta inválida.');
  if(parsed.data.view==='fields'){const r=await a.db.rpc('pro_contact_fields_read',{p_owner:a.user.id});if(r.error)return dbError(r.error,'Los campos cambiaron.');return Response.json(contactFieldsReadSchema.parse(r.data),{headers});}
  if(parsed.data.view==='extras'){const r=await a.db.rpc('pro_contact_extras_read',{p_owner:a.user.id,p_client:parsed.data.clientId});if(r.error)return dbError(r.error,'El cliente cambió.');return Response.json(contactExtrasReadSchema.parse(r.data),{headers});}
  // Same rule as the customer export it completes: owner, Administrator and Manager.
  const denied=await proInternalFinanceDenied();if(denied)return denied;
  const r=await a.db.rpc('pro_contact_extras_export',{p_owner:a.user.id});if(r.error)return dbError(r.error,'Los clientes cambiaron.');return Response.json(contactExtrasExportSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudieron cargar los campos de clientes.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'client-contact-fields-'+a.user.id,60,60000);if(limited)return limited;
  let body:unknown;try{body=await proBoundedJson(req,1048576);}catch{return proFail(400,'Revise los datos.');}
  const member=await proWorkspaceMember();
  const action=(body as {action?:unknown})?.action;
  if(action==='preview'||action==='import'){
   const parsed=importInput.safeParse(body);if(!parsed.success)return proFail(400,'Revise los datos del archivo.');
   if(parsed.data.action==='preview'){const r=await a.db.rpc('pro_contact_extras_preview',{p_owner:a.user.id,p_rows:parsed.data.rows,p_extras:parsed.data.extras});if(r.error)return dbError(r.error,'Los campos cambiaron. Revise el archivo de nuevo.');return Response.json(contactPreviewSchema.parse(r.data),{headers});}
   const r=await a.db.rpc('pro_contact_extras_import',{p_owner:a.user.id,p_input:parsed.data,p_member:member?.memberId??null});
   if(r.error)return dbError(r.error,'Los clientes o los campos cambiaron mientras revisaba el archivo. Revíselo de nuevo.');return Response.json(r.data,{headers});
  }
  const parsed=contactFieldsInputSchema.safeParse(body);if(!parsed.success)return proFail(400,'Revise los datos.');
  if(definitionActions.has(parsed.data.action)&&member&&member.role!=='admin'&&member.role!=='manager')return managerOnly();
  const r=await a.db.rpc('pro_contact_fields_mutate',{p_owner:a.user.id,p_input:parsed.data,p_member:member?.memberId??null});
  if(r.error)return dbError(r.error,'Los datos cambiaron en otra pestaña. Recargue y vuelva a intentarlo.');
  return Response.json(contactFieldsResultSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo guardar. Reintente: no se duplicará.');}
}
