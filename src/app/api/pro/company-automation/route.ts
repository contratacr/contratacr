import {randomUUID} from 'node:crypto';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proDbError,proFail,proQuery,proSameOrigin,proRouteHeaders as headers} from '@/lib/pro/route-common';
import {webhookMutationSchema} from '@/lib/pro/integrations/webhooks/api';
import {checkWebhookUrl,webhookMode} from '@/lib/pro/integrations/webhooks/adapter';
import {emitProEvent,newWebhookSecret} from '@/lib/pro/integrations/webhooks/service';
import {PRO_ENABLED} from '@/lib/pro/enabled';

/**
 * Row 72: outgoing webhooks (external automation). Path starts with "company-" so the role gate asks for company.write.
 * The signing secret is returned ONCE, in the answer to "create"; afterwards only its last 4 characters are readable.
 * Sandbox (default) records simulated deliveries; nothing leaves the server unless the server enables live mode.
 */
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);if(!q||Object.keys(q).length)return proFail(400,'Consulta inválida.');
  const read=await a.db.rpc('pro_webhooks_read',{p_actor:a.user.id});if(read.error)return proDbError(read.error,'Los datos cambiaron.');
  return Response.json({...(read.data as object),mode:webhookMode()},{headers});
 }catch{return proFail(503,'No se pudo cargar la automatización.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 const a=await proActor(req);if(a.error)return a.error;
 const limited=await enforceRateLimit(req,'company-automation-'+a.user.id,30,60000);if(limited)return limited;
 let input;try{input=webhookMutationSchema.parse(await proBoundedJson(req,8192));}catch{return proFail(400,'Revise los datos.');}
 try{
  if(input.action==='test'){
   const results=await emitProEvent(a.db,a.user.id,'test.ping',{note:'ContrataCR test event'},input.id);
   if(!results.length)return proFail(404,'La conexión no está activa o ya no existe.');
   return Response.json({result:results[0],mode:webhookMode()},{headers});
  }
  if(input.action==='create'){
   // Static check only (DNS is verified at delivery time): https, no credentials, no private literal, no local names.
   const check=await checkWebhookUrl(input.url,async()=>['93.184.216.34']);
   if(!check.ok)return Response.json({error:'La dirección debe ser https pública (sin credenciales, puertos especiales ni direcciones internas).',reason:check.reason},{status:400,headers});
   const {secret,secretBox,secretHint}=newWebhookSecret();
   const r=await a.db.rpc('pro_webhook_endpoint_set',{p_actor:a.user.id,p_input:{action:'create',id:randomUUID(),name:input.name,url:input.url,events:input.events,secretBox,secretHint}});
   if(r.error)return proDbError(r.error,'Ya existe una conexión igual. Actualice.');
   return Response.json({endpoint:r.data,secret},{headers});
  }
  const r=await a.db.rpc('pro_webhook_endpoint_set',{p_actor:a.user.id,p_input:{action:input.action,id:input.id,revision:input.revision}});
  if(r.error){if(r.error.code==='P0002')return proFail(404,'La conexión ya no está disponible.');return proDbError(r.error,'La conexión cambió. Actualice.');}
  return Response.json({endpoint:r.data},{headers});
 }catch{return proFail(503,'No se pudo comprobar la operación. Reintente.');}
}
