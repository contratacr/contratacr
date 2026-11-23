import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proFail,proQuery,proRequestOrigin,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {paymentLinkMutationSchema,paymentLinksReadSchema,reconciliationSchema} from '@/lib/pro/integrations/payments/api';
import {PaymentError,deliver,linkTokenFor,linkTokenHash,logCharge,payRpc,paymentLinkUrl,paymentsMode,processorFor,retryDueWebhooks} from '@/lib/pro/integrations/payments/service';
import {providerConfig} from '@/lib/pro/integrations/registry';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6A: owner side of online payments. GET ?draftId= | ?planId= (links, attempts, bookings)
// · GET ?view=reconciliation[&filter=exceptions]. POST create | cancel | refund. The link URL (token in
// the fragment) is returned only by «create»: only its SHA-256 is stored.
const draftQuery=z.object({draftId:z.string().uuid()}).strict(),planQuery=z.object({planId:z.string().uuid()}).strict(),reconQuery=z.object({view:z.literal('reconciliation'),filter:z.enum(['all','exceptions']).optional()}).strict();
const MESSAGES:Record<string,string>={pro_payment_link_no_work:'Este borrador no está vinculado a un trabajo: el pago en línea necesita el saldo del trabajo para registrarse.',pro_payment_link_nothing_due:'No hay saldo pendiente para cobrar en línea.',
 pro_payment_link_inactive:'El borrador está archivado, el trabajo cancelado o el cliente archivado.',pro_payment_link_exists:'Ya hay un enlace activo. Anúlelo antes de crear otro.',pro_payment_link_in_progress:'Hay un pago en curso en este enlace. Espere unos minutos.',
 pro_payment_refund_exists:'Ese pago ya tiene un reembolso solicitado.',missing_keys:'Faltan las claves del procesador en el servidor para el modo elegido.',production_refused:'Producción no está habilitada en este servidor.',disabled:'Los cobros en línea están desactivados en Empresa › Integraciones.',unavailable:'Los enlaces de pago no están disponibles en este servidor.'};
function failure(error:unknown){
 if(error instanceof PaymentError)return Response.json({error:MESSAGES[error.reason]??(error.status===409?'Los datos cambiaron. Actualice y vuelva a intentarlo.':error.status===403?'Sin acceso.':'No se pudo completar la operación.'),reason:error.reason},{status:error.status,headers});
 return proFail(503,'No se pudo comprobar la operación. Reintente: no se duplicará.');
}
async function context(db:Parameters<typeof paymentsMode>[0],owner:string){
 const [mode,read]=await Promise.all([paymentsMode(db,owner),db.rpc('pro_integration_read',{p_actor:owner})]);
 const tilopay=(read.data as {connections?:{provider:string;config:Record<string,unknown>}[]}|null)?.connections?.find(row=>row.provider==='tilopay');
 return {mode:mode.mode,modeStatus:mode.status,sinpePhone:String(providerConfig('tilopay',tilopay?.config).sinpePhone??'')};
}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;const raw=proQuery(req);if(!raw)return proFail(400,'Consulta inválida.');
  const recon=reconQuery.safeParse(raw);
  if(recon.success){await retryDueWebhooks(a.db,a.user.id);return Response.json(reconciliationSchema.parse(await payRpc(a.db,'pro_payment_reconciliation',{p_actor:a.user.id,p_filter:recon.data.filter??'all'})),{headers});}
  const draft=draftQuery.safeParse(raw),plan=planQuery.safeParse(raw);if(!draft.success&&!plan.success)return proFail(400,'Consulta inválida.');
  const data=await payRpc<Record<string,unknown>|null>(a.db,'pro_payment_links_read',{p_actor:a.user.id,p_scope:draft.success?{draftId:draft.data.draftId}:{planId:plan.success?plan.data.planId:null}});
  if(!data)return proFail(404,'No encontrado.');
  return Response.json(paymentLinksReadSchema.parse({...data,...await context(a.db,a.user.id)}),{headers});
 }catch(error){return failure(error);}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'payment-links-'+a.user.id,30,60000);if(limited)return limited;
  let raw:unknown;try{raw=await proBoundedJson(req,4096);}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise los datos.');}
  const input=paymentLinkMutationSchema.safeParse(raw);if(!input.success)return proFail(400,'Revise los datos del enlace.');
  const body=input.data,origin=proRequestOrigin(req);
  if(body.action==='create'){
   const mode=await paymentsMode(a.db,a.user.id);
   if(mode.status!=='ready')throw new PaymentError(mode.status==='production_refused'?403:409,mode.status,'not ready');
   const token=linkTokenFor(a.user.id,body.actionId);
   const link=await payRpc(a.db,'pro_payment_link_mutate',{p_actor:a.user.id,p_input:{...body,linkId:body.actionId,tokenHash:linkTokenHash(token),mode:mode.mode}});
   return Response.json({link,url:paymentLinkUrl(origin,body.language==='en',token)},{headers});
  }
  if(body.action==='cancel')return Response.json({link:await payRpc(a.db,'pro_payment_link_mutate',{p_actor:a.user.id,p_input:body})},{headers});
  // Refund: record the request (once), ask the processor of the payment's mode, deliver its event.
  const request=await payRpc<{processorRef:string;mode:'mock'|'sandbox'|'production';amountCents:number;status:string}>(a.db,'pro_payment_refund_request',{p_actor:a.user.id,p_input:body});
  if(request.status==='refunded')return Response.json({status:'refunded'},{headers});
  if(request.mode!=='mock'){const mode=await paymentsMode(a.db,a.user.id);if(mode.mode!==request.mode||mode.status!=='ready')throw new PaymentError(409,'missing_keys','not ready');}
  const processor=processorFor(request.mode,origin),started=Date.now(),refund=await processor.refund({processorRef:request.processorRef,amountCents:request.amountCents});
  await logCharge(a.db,a.user.id,processor,'refund',refund.ok,started,request.processorRef,{amountCents:request.amountCents,ok:refund.ok});
  if(!refund.ok)return proFail(502,'El procesador no aceptó el reembolso. Reintente más tarde.');
  const delivered=await deliver(a.db,processor);
  return Response.json({status:delivered.every(row=>row.status===200)?'refunded':'pending',delivered:delivered.map(row=>row.body)},{headers});
 }catch(error){return failure(error);}
}
