import {randomBytes} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit,enforceRateLimitKey} from '@/lib/rate-limit';
import {proBoundedJson,proRequestOrigin,proSameOrigin} from '@/lib/pro/route-common';
import {paymentPublicSchema,paymentPublicViewSchema,sinpeCodeFrom} from '@/lib/pro/integrations/payments/api';
import type {ChargeResult} from '@/lib/pro/integrations/payments/processor';
import {PaymentError,deliver,linkTokenHash,logCharge,payRpc,processorFor} from '@/lib/pro/integrations/payments/service';

// Round 6A: PUBLIC side of a payment link (hosted page /pagar#enlace=…, development only, no account).
// The token travels in the body (never in a URL); only its SHA-256 reaches the database. Card numbers go
// to the processor adapter and are never stored or logged (last 4 digits only). Money is booked only
// when the processor's event goes through the webhook inbox (exactly once).
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const fail=(status:number,reason:string,error:string)=>Response.json({error,reason},{status,headers});
type Owned={attemptId:string;status:string;processorRef:string;amountCents:number;provider:string;mode:'mock'|'sandbox'|'production';ownerId:string;linkId:string;method?:string};
async function view(db:ReturnType<typeof createAdminClient>,hash:string){
 const data=await payRpc<Record<string,unknown>|null>(db,'pro_payment_link_public',{p_token_hash:hash});
 if(!data)return null;
 const {sinpePhone,...rest}=data as {sinpePhone?:string};
 return paymentPublicViewSchema.parse({...rest,sinpe:(rest as {methods:string[]}).methods.includes('sinpe')?{phone:sinpePhone||'',code:sinpeCodeFrom(hash)}:null});
}
export async function POST(req:Request){
 if(process.env.NODE_ENV!=='development')return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return fail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'pay-public',30,60000);if(limited){for(const [k,v] of Object.entries(headers))limited.headers.set(k,v);return limited;}
 let input;try{const parsed=paymentPublicSchema.safeParse(await proBoundedJson(req,4096));if(!parsed.success)return fail(400,'invalid','Revise los datos.');input=parsed.data;}catch{return fail(400,'invalid','Revise los datos.');}
 const hash=linkTokenHash(input.token);
 const perLink=await enforceRateLimitKey('pay-link:'+hash.slice(0,32),input.action==='view'?60:10,60000);if(perLink){for(const [k,v] of Object.entries(headers))perLink.headers.set(k,v);return perLink;}
 try{
  const db=createAdminClient();
  const current=await view(db,hash);
  if(!current)return fail(404,'unknown','Este enlace de pago no existe o ya no está disponible.');
  if(input.action==='view')return Response.json(current,{headers});
  if(current.status!=='active')return Response.json(current,{headers});
  const origin=proRequestOrigin(req),processor=processorFor(current.mode,origin);
  let owner='';
  if(input.action==='card'){
   const started=Date.now(),charge=await processor.chargeCard({attemptId:input.attemptId,amountCents:current.amountCents,card:{number:input.card.number.replace(/\s/g,''),expMonth:input.card.expMonth,expYear:input.card.expYear,cvc:input.card.cvc,name:input.card.name},description:current.description});
   const recorded=await payRpc<Owned>(db,'pro_payment_attempt_record',{p_token_hash:hash,p_input:{attemptId:input.attemptId,processorRef:charge.processorRef,method:'card',status:charge.status,cardLast4:charge.cardLast4??'',cardBrand:charge.cardBrand??'',failureCode:charge.status==='failed'?charge.failureCode:''}});
   owner=recorded.ownerId;await logCharge(db,owner,processor,'charge',charge.status!=='failed',started,charge.processorRef,{method:'card',status:charge.status,last4:charge.cardLast4??null});
  }else if(input.action==='verify'){
   const attempt=await payRpc<Owned|null>(db,'pro_payment_attempt_open',{p_token_hash:hash,p_attempt:input.attemptId});
   if(!attempt||attempt.status!=='requires_action')return fail(409,'attempt','Esta verificación ya no está pendiente.');
   owner=attempt.ownerId;const started=Date.now(),result=await processor.completeAction({processorRef:attempt.processorRef,amountCents:attempt.amountCents,approve:input.approve});
   await logCharge(db,owner,processor,'verify',result.status!=='failed',started,attempt.processorRef,{approve:input.approve,status:result.status});
  }else{
   // Post-security fixes: the order reference is generated HERE and stored with the attempt before the processor is
   // consulted; the processor is asked about that stored reference (not the browser's attemptId) with the attempt's
   // own amount and currency. A refusal (not found / amount_mismatch / unavailable) closes the attempt as failed.
   const started=Date.now();
   const recorded=await payRpc<Owned>(db,'pro_payment_attempt_record',{p_token_hash:hash,p_input:{attemptId:input.attemptId,processorRef:'ccr_sinpe_'+randomBytes(16).toString('hex'),method:'sinpe',status:'pending',sinpeReference:input.reference,failureCode:''}});
   owner=recorded.ownerId;
   let result:ChargeResult;
   try{result=await processor.confirmSinpe({processorRef:recorded.processorRef,amountCents:recorded.amountCents,currency:current.currency,reference:input.reference,code:current.sinpe?.code??''});}
   catch{result={status:'failed',processorRef:recorded.processorRef,failureCode:'processor_unavailable'};}
   if(result.status==='failed')await payRpc(db,'pro_payment_attempt_fail',{p_token_hash:hash,p_attempt:recorded.attemptId,p_failure:result.failureCode});
   await logCharge(db,owner,processor,'sinpe',result.status!=='failed',started,recorded.processorRef,{method:'sinpe',status:result.status});
  }
  await deliver(db,processor);
  return Response.json(await view(db,hash),{headers});
 }catch(error){
  if(error instanceof PaymentError)return fail(error.status===409&&error.reason==='23505'?409:error.status,error.reason,error.reason==='pro_payment_link_closed'?'Este enlace ya no admite pagos.':error.reason==='missing_keys'?'El procesador no está disponible en este servidor.':error.status===409?'Este intento ya se registró. Actualice la página.':'No se pudo procesar el pago. No se cobró nada dos veces: reintente.');
  return fail(503,'unavailable','No se pudo procesar el pago. Reintente.');
 }
}
