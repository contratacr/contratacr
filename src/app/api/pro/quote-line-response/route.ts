import {z} from 'zod';
import {lineResponseInputSchema,lineResponseSchema} from '@/lib/pro/quote-recorded-acceptance';
import {proWorkspaceMember} from '@/lib/pro/workspace-user';
import {proAccountRateLimit,proActor,proBoundedJson,proDbError,proFail,proQuery,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';
// Row 39: the customer's per-line approval sent as the FORMAL partial response of the shared version (once; freezes the line decisions).
// Reads for the owner or the recipient; the write only for the recipient (checked in SQL: pro_quote_line_respond).
const conflict='La respuesta de esta cotización cambió. Recargue e intente de nuevo.';
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);
  const publication=z.string().uuid().safeParse(q?.publicationId);if(!q||!publication.success||Object.keys(q).some(k=>k!=='publicationId'))return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_quote_line_response_read',{p_actor:a.user.id,p_publication:publication.data});
  if(r.error)return r.error.code==='P0002'?proFail(404,'Cotización no disponible.'):proDbError(r.error,conflict);
  return Response.json({response:r.data?lineResponseSchema.parse(r.data):null},{headers});
 }catch{return proFail(503,'No se pudo cargar la respuesta. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  // Answering is done «as the customer»: a person working inside a company's Pro space cannot answer for it.
  if(await proWorkspaceMember())return Response.json({error:'Responda desde su propia cuenta, no desde el espacio de una empresa.',code:'pro_workspace_member'},{status:403,headers});
  const limited=await proAccountRateLimit('quote-line-response',a.user.id,30,60000);if(limited)return limited;
  let input;try{input=lineResponseInputSchema.parse(await proBoundedJson(req,2048));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise la respuesta.');}
  const r=await a.db.rpc('pro_quote_line_respond',{p_actor:a.user.id,p_input:input});
  if(r.error){
   if(r.error.code==='22023'&&/every line decided/i.test((r.error as {message?:string}).message??''))return Response.json({error:'Decida todas las partidas: al menos una aprobada y una no aprobada.',reason:'incomplete'},{status:400,headers});
   return proDbError(r.error,conflict);
  }
  return Response.json({response:lineResponseSchema.parse(r.data)},{headers});
 }catch{return proFail(503,'No se pudo comprobar el guardado. Reintente la misma operación.');}
}
