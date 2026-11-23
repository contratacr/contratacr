import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 05: an additional phone/e-mail of a customer becomes the main one (the previous main one stays as an
 * additional channel). SQL is the authority (pro_contact_channel_promote): one transaction, idempotent by action id,
 * written through the catalog writer. Role gate: sales.write (same segment as the other client-contacts routes).
 */
const input=z.object({action:z.literal('channel_promote'),actionId:z.string().uuid(),clientId:z.string().min(1).max(160),channelId:z.string().uuid()}).strict();
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;const limited=await enforceRateLimit(req,'client-contact-promote-'+a.user.id,60,60000);if(limited)return limited;
  let body;try{body=input.parse(await proBoundedJson(req,4096));}catch{return proFail(400,'Revise los datos.');}
  const r=await a.db.rpc('pro_contact_channel_promote',{p_owner:a.user.id,p_input:body});
  if(r.error)return proDbError(r.error,'El cliente cambió en otra pestaña. Recargue y vuelva a intentar.');
  return Response.json(r.data,{headers});
 }catch{return proFail(503,'No se pudo guardar. Reintente: no se duplicará.');}
}
