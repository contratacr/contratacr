import 'server-only';
import {createHash} from 'node:crypto';
import type {createAdminClient} from '@/lib/supabase/admin';
import {BidPortalConfigError,bidPortalHash} from '@/lib/pro/bid-portal-server';
import {logOutbound,providerSecrets,resolveMode,storedMode} from '../server';
import {redact} from '../redact';
import {MOCK_WEBHOOK_SECRET,verifyWebhook} from '../webhook';
import {MockProcessor} from './mock';
import {TilopayProcessor} from './tilopay';
import type {PaymentProcessor,ProcessorEvent,SignedEvent} from './processor';

/**
 * Round 6A: payment links, hosted-page actions and the webhook path. Money is booked ONLY by
 * pro_payment_event_apply on an inbox event, so a duplicated, replayed or retried delivery can never
 * create a second ledger payment.
 */
type Db=ReturnType<typeof createAdminClient>;
export class PaymentError extends Error{constructor(readonly status:number,readonly reason:string,message:string){super(message);this.name='PaymentError';}}
export async function payRpc<T>(db:Db,name:string,args:Record<string,unknown>):Promise<T>{
 const result=await db.rpc(name,args);
 if(result.error){const e=result.error as {code?:string;hint?:string;message?:string};throw new PaymentError(e.code==='40001'?409:e.code==='23505'?409:e.code==='42501'?403:e.code==='22023'||e.code==='23514'?400:503,e.hint||e.code||'db',e.message||'db');}
 return result.data as T;
}
export const linkTokenHash=(token:string)=>createHash('sha256').update('ccr-payment-link:v1:'+token,'utf8').digest('hex');
/** Link token: keyed by the server secret and the action id, so a retried «create» returns the same link. */
export function linkTokenFor(owner:string,actionId:string){
 try{return Buffer.from(bidPortalHash(`payment-link:${owner}:${actionId}`,'link'),'hex').toString('base64url');}
 catch(error){if(error instanceof BidPortalConfigError)throw new PaymentError(503,'unavailable','Los enlaces de pago no están disponibles en este servidor.');throw error;}
}
export function paymentLinkUrl(origin:string,en:boolean,token:string){return `${origin}${en?'/en':''}/pagar#enlace=${token}`;}
export async function paymentsMode(db:Db,owner:string){return resolveMode('tilopay',await storedMode(db,owner,'tilopay'));}
export function processorFor(mode:'mock'|'sandbox'|'production',origin:string):PaymentProcessor{
 if(mode==='mock')return new MockProcessor();
 const secrets=providerSecrets('tilopay',mode);
 if(!secrets)throw new PaymentError(409,'missing_keys','Faltan las claves del procesador en el servidor.');
 return new TilopayProcessor(mode,secrets,origin+'/pagar');
}
async function logProcessor(db:Db,owner:string,processor:PaymentProcessor,operation:string,ok:boolean,started:number,correlation:string,summary:Record<string,unknown>){
 if(processor instanceof TilopayProcessor){for(const call of processor.calls.splice(0))await logOutbound(db,owner,{provider:'tilopay',mode:processor.mode,operation:call.operation,url:call.url,statusCode:call.status,outcome:call.outcome,durationMs:call.durationMs,correlation,summary});return;}
 await logOutbound(db,owner,{provider:'tilopay',mode:'mock',operation,url:'https://processor.mock.local/'+operation,statusCode:ok?200:402,outcome:ok?'ok':'error',durationMs:Date.now()-started,correlation,summary});
}
export type WebhookOutcome={status:number;body:{status:string;duplicate?:boolean;review?:string|null;reason?:string}};
/** Inbox + apply for one signed MOCK event (the same path the HTTP webhook route uses). */
export async function receiveMockEvent(db:Db,body:string,signature:string|null):Promise<WebhookOutcome>{
 const check=verifyWebhook(MOCK_WEBHOOK_SECRET,body,signature);
 if(!check.ok){await db.rpc('pro_integration_webhook_reject',{p_provider:'tilopay',p_reason:'signature_'+check.reason});return {status:401,body:{status:'rejected',reason:check.reason}};}
 let event:ProcessorEvent;
 try{event=JSON.parse(body) as ProcessorEvent;if(typeof event.id!=='string'||!/^evt_[a-f0-9]{24}$/.test(event.id)||!['payment.succeeded','payment.failed','payment.refunded'].includes(event.type)||typeof event.processorRef!=='string')throw Error();}
 catch{await db.rpc('pro_integration_webhook_reject',{p_provider:'tilopay',p_reason:'malformed'});return {status:400,body:{status:'rejected',reason:'malformed'}};}
 const owner=await payRpc<{ownerId:string;mode:string}|null>(db,'pro_payment_attempt_by_ref',{p_provider:'tilopay',p_ref:event.processorRef});
 // Mock events can only ever touch attempts made in mock mode.
 if(owner&&owner.mode!=='mock'){await db.rpc('pro_integration_webhook_reject',{p_provider:'tilopay',p_reason:'mock_event_for_real_attempt'});return {status:403,body:{status:'rejected',reason:'mode'}};}
 const inbox=await payRpc<{id:string;duplicate:boolean;status:string}>(db,'pro_integration_webhook_receive',{p_provider:'tilopay',p_mode:'mock',p_event_id:event.id,p_event_type:event.type,p_owner:owner?.ownerId??null,p_payload:redact(event)});
 if(inbox.duplicate&&(inbox.status==='processed'||inbox.status==='ignored'))return {status:200,body:{status:inbox.status,duplicate:true}};
 return applyInbox(db,inbox.id,inbox.duplicate);
}
async function applyInbox(db:Db,webhookId:string,duplicate:boolean):Promise<WebhookOutcome>{
 const applied=await db.rpc('pro_payment_event_apply',{p_webhook:webhookId});
 if(applied.error){
  await db.rpc('pro_integration_webhook_fail',{p_id:webhookId,p_error:(applied.error.message||'error').slice(0,300)});
  return {status:500,body:{status:'failed',reason:'retry'}};
 }
 const data=applied.data as {status:string;duplicate:boolean;review:string|null};
 return {status:200,body:{status:data.status,duplicate:duplicate||data.duplicate,review:data.review}};
}
/** Re-apply inbox rows that failed and are due (retry with backoff); best effort, owner scoped. */
export async function retryDueWebhooks(db:Db,owner:string){
 const due=await db.from('pro_integration_webhooks').select('id').eq('owner_id',owner).eq('status','failed').lte('next_attempt_at',new Date().toISOString()).lt('attempts',8).limit(10);
 for(const row of due.data??[])await applyInbox(db,row.id as string,false);
}
/** Delivers what the processor emitted (mock: immediately, through the same signed-webhook path). */
export async function deliver(db:Db,processor:PaymentProcessor){
 const out:WebhookOutcome[]=[];
 for(const signed of processor.drainEvents() as SignedEvent[])out.push(await receiveMockEvent(db,signed.body,signed.signature));
 return out;
}
export async function logCharge(db:Db,owner:string,processor:PaymentProcessor,operation:string,ok:boolean,started:number,correlation:string,summary:Record<string,unknown>){await logProcessor(db,owner,processor,operation,ok,started,correlation,summary);}
