import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proAccountRateLimit,proActor,proBoundedJson,proDbError,proFail,proInternalFinanceDenied,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {contactExportSchema,contactPreviewSchema,contactsInputSchema,contactsReadSchema} from '@/lib/pro/round10';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Round 10 (row 05): customer import with mapping preview and duplicate check, tags, duplicate groups,
 * merges and export. SQL is the authority (pro_contacts_*): it creates customers only through the
 * existing catalog writer with the workspace revision (stale screen → 409) and never archives a
 * customer that has jobs, quotes, invoices or leads. Role gate: writes = sales.write.
 */
const query=z.discriminatedUnion('view',[z.object({view:z.literal('read')}).strict(),z.object({view:z.literal('export'),tag:z.string().max(40).optional(),group:z.string().max(80).optional(),archived:z.enum(['0','1']).optional()}).strict()]);
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),parsed=raw?query.safeParse(raw):null;if(!parsed?.success)return proFail(400,'Consulta inválida.');
  if(parsed.data.view==='read'){const r=await a.db.rpc('pro_contacts_read',{p_owner:a.user.id});if(r.error)return proDbError(r.error,'Los clientes cambiaron.');return Response.json(contactsReadSchema.parse(r.data),{headers});}
  // Fix 13: exporting the whole customer list is for the owner, Administrator and Manager; rate limited.
  const denied=await proInternalFinanceDenied();if(denied)return denied;const limited=await proAccountRateLimit('contacts-export',a.user.id,10,60000);if(limited)return limited;
  const r=await a.db.rpc('pro_contacts_export',{p_owner:a.user.id,p_tag:parsed.data.tag??null,p_group:parsed.data.group??null,p_archived:parsed.data.archived==='1'});if(r.error)return proDbError(r.error,'Los clientes cambiaron.');
  return Response.json({items:contactExportSchema.parse(r.data)},{headers});
 }catch{return proFail(503,'No se pudieron cargar los clientes.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'client-contacts-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=contactsInputSchema.parse(await proBoundedJson(req,1048576));}catch{return proFail(400,'Revise los datos del archivo.');}
  if(input.action==='preview'){const r=await a.db.rpc('pro_contacts_preview',{p_owner:a.user.id,p_rows:input.rows});if(r.error)return proDbError(r.error,'Los clientes cambiaron.');return Response.json(contactPreviewSchema.parse(r.data),{headers});}
  const r=await a.db.rpc('pro_contacts_mutate',{p_owner:a.user.id,p_input:input});
  if(r.error){if(r.error.hint==='pro_contact_merge_records')return Response.json({error:'Ese cliente tiene trabajos, cotizaciones, facturas u oportunidades: consérvelo a él y combine el otro.',reason:'merge_records'},{status:400,headers});return proDbError(r.error,'Los clientes cambiaron en otra pestaña. Recargue y vuelva a revisar.');}
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo guardar. Reintente: no se duplicará.');}
}
