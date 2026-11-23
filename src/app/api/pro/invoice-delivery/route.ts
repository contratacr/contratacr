import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proCustomerReader,proDbError,proFail,proQuery,proRouteHeaders,proSameOrigin} from '@/lib/pro/route-common';
import {PRO_ENABLED} from '@/lib/pro/enabled';
import {clientInvoiceDeliverySchema,invoiceDeliveryMutationSchema,invoiceDeliverySchema,invoiceLifecycleSchema} from '@/lib/pro/invoice-delivery';
import {resolveReminderChannel} from '@/lib/pro/reminders/channel';

// Rows 42/44: delivery and lifecycle of a billing document. The owner sends / recalls an invoice draft of a job; the linked customer reads
// the sent ones (?requestId=) and the first opening is recorded (never for the owner's preview). Optional e-mail goes through the reminder
// adapter (sandbox): nothing is sent to a real person. No fiscal issuance here.
const conflict='La factura cambió. Actualice.';
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 try{
  const a=await proActor(req);if(a.error)return a.error;const q=proQuery(req);
  if(!q)return proFail(400,'Consulta inválida.');
  if(Object.keys(q).join()==='requestId'){
   const request=z.string().uuid().safeParse(q.requestId);if(!request.success)return proFail(400,'Consulta inválida.');
   const reader=await proCustomerReader(a.db,a.user.id,request.data);
   const result=await a.db.rpc('pro_invoice_delivery_client_read',{p_actor:reader,p_request:request.data,p_record:reader===a.user.id});
   if(result.error)return proDbError(result.error,conflict);
   if(!result.data)return proFail(404,'Cita no disponible.');
   return Response.json(clientInvoiceDeliverySchema.parse(result.data),{headers:proRouteHeaders});
  }
  if(Object.keys(q).join()!=='draftId'||!z.string().uuid().safeParse(q.draftId).success)return proFail(400,'Consulta inválida.');
  const result=await a.db.rpc('pro_invoice_delivery_read',{p_actor:a.user.id,p_draft:q.draftId});
  if(result.error)return proDbError(result.error,conflict);
  if(!result.data)return proFail(404,'Factura no disponible.');
  return Response.json(invoiceDeliverySchema.parse(result.data),{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo cargar el estado de la factura. Reintente.');}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers:proRouteHeaders});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'invoice-delivery-'+a.user.id,60,60000);if(limited)return limited;
  let input;try{input=invoiceDeliveryMutationSchema.parse(await proBoundedJson(req,2048));}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise la solicitud.');}
  let emailRef:string|null=null;
  if(input.action==='send'&&input.email){
   const current=await a.db.rpc('pro_invoice_delivery_read',{p_actor:a.user.id,p_draft:input.draftId});
   if(current.error)return proDbError(current.error,conflict);
   const parsed=invoiceDeliverySchema.safeParse(current.data);
   if(!parsed.success)return proFail(404,'Factura no disponible.');
   if(!parsed.data.recipientEmail)return proFail(400,'El cliente no tiene correo guardado.');
   const result=await resolveReminderChannel().send({channel:'email',to:parsed.data.recipientEmail,subject:'Factura '+parsed.data.title,
    body:`Estimado(a) ${parsed.data.clientName??'cliente'}:\n\nSu profesional le compartió la factura "${parsed.data.title}" por un monto pendiente de ₡${(parsed.data.balanceCents/100).toLocaleString('es-CR')}, con vencimiento el ${parsed.data.dueDate}. Puede verla en su proyecto.`,idempotencyKey:'invoice-delivery:'+input.actionId});
   emailRef=result.ok?result.providerRef:null;
  }
  const result=await a.db.rpc('pro_invoice_delivery_mutate',{p_actor:a.user.id,p_input:input.action==='send'?{...input,emailRef}:input});
  if(result.error)return proDbError(result.error,conflict);
  return Response.json(invoiceLifecycleSchema.parse(result.data),{headers:proRouteHeaders});
 }catch{return proFail(503,'No se pudo comprobar el envío. Reintente la misma operación.');}
}
