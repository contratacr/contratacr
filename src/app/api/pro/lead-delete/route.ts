import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {leadDeleteInputSchema} from '@/lib/pro/lead-work';
import {leadAnchorExists} from '@/lib/pro/lead-work-server';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Leads area: permanently deletes a manual opportunity of the professional (notes, calls, tags, tasks, files and history
 * go with it). ContrataCR requests belong to the customer and are never deleted here (use Archive). A lead that became a
 * job is refused (409): its record is kept. Deleting a lead that is already gone answers 200 (idempotent).
 */
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'lead-delete-'+a.user.id,20,60000);if(limited)return limited;
  let input;try{input=leadDeleteInputSchema.parse(await proBoundedJson(req,1024));}catch{return proFail(400,'Solicitud inválida. Solo se pueden eliminar oportunidades creadas por usted.');}
  const owner=a.user.id,access=await leadAnchorExists(a.db,owner,'manual',input.leadId);if(access==='forbidden')return proFail(403,'Sin acceso.');
  if(access==='missing')return Response.json({deleted:true,leadId:input.leadId},{headers});
  const works=await a.db.from('pro_manual_lead_works').select('lead_id').eq('owner_id',owner).eq('lead_id',input.leadId).limit(1);if(works.error)throw Error();
  if(works.data?.length)return proFail(409,'Esta oportunidad ya se convirtió en trabajo y no se puede eliminar. Puede archivarla.');
  const files=await a.db.from('pro_lead_files').select('object_path').eq('owner_id',owner).eq('lead_id',input.leadId).limit(300);if(files.error)throw Error();
  const del=await a.db.from('pro_lead_center_records').delete().eq('owner_id',owner).eq('kind','manual').eq('id',input.leadId);
  if(del.error)return proFail(del.error.code==='23503'?409:503,del.error.code==='23503'?'Esta oportunidad tiene cotizaciones o trabajos vinculados y no se puede eliminar. Puede archivarla.':'No se pudo eliminar. Reintente.');
  if(files.data?.length)await a.db.storage.from('pro-lead-files').remove(files.data.map(f=>f.object_path));
  return Response.json({deleted:true,leadId:input.leadId},{headers});
 }catch{return proFail(503,'No se pudo comprobar la eliminación. Reintente.');}
}
