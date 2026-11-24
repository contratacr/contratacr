import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {boardTemplateInputSchema,boardTemplateSchema,boardTemplatesSchema} from '@/lib/pro/selection-boards';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/** Area E: owner templates of selection boards (a name and a list of items to choose). */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const r=await a.db.rpc('pro_selection_board_templates_read',{p_owner:a.user.id});if(r.error)return proDbError(r.error,'Las plantillas cambiaron.');
  return Response.json(boardTemplatesSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo cargar las plantillas.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'selection-templates-'+a.user.id,40,60000);if(limited)return limited;
 let input;try{input=boardTemplateInputSchema.parse(await proBoundedJson(req,16384));}catch{return proFail(400,'Revise el nombre y los ítems de la plantilla.');}
 try{
  if(input.action==='delete'){
   const r=await a.db.rpc('pro_selection_board_template_delete',{p_owner:a.user.id,p_id:input.id});
   if(r.error){if(r.error.code==='P0002')return proFail(404,'La plantilla ya no existe.');return proDbError(r.error,'La plantilla cambió.');}
   return Response.json({deleted:true},{headers});
  }
  const r=await a.db.rpc('pro_selection_board_template_save',{p_owner:a.user.id,p_input:{name:input.name,items:input.items}});
  if(r.error){if(r.error.code==='54000')return proFail(409,'Llegó al límite de 30 plantillas.');return proDbError(r.error,'La plantilla cambió.');}
  return Response.json({template:boardTemplateSchema.parse(r.data)},{headers});
 }catch{return proFail(503,'No se pudo guardar la plantilla. Reintente.');}
}
