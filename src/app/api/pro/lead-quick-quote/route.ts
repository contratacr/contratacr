import {z} from 'zod';
import {proActor,proDbError,proFail,proQuery,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {leadQuickQuoteContextSchema} from '@/lib/pro/lead-quick-quote';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Ronda F2-B (row 35): read-only context for the one-click "Cotizar" of a lead (customer, source and the
 * catalogue item that best matches the service). Development only; the quote is written by the existing editor.
 */
const query=z.object({kind:z.enum(['manual','request']),id:z.string().uuid()}).strict();
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req),parsed=raw?query.safeParse(raw):null;if(!parsed?.success)return proFail(400,'Consulta inválida.');
  const r=await a.db.rpc('pro_lead_quick_quote_context',{p_actor:a.user.id,p_kind:parsed.data.kind,p_id:parsed.data.id});
  if(r.error)return r.error.code==='P0002'?proFail(404,'Solicitud no disponible.'):proDbError(r.error,'La solicitud cambió. Actualice e intente de nuevo.');
  return Response.json(leadQuickQuoteContextSchema.parse(r.data),{headers});
 }catch{return proFail(503,'No se pudo preparar la cotización. Reintente.');}
}
