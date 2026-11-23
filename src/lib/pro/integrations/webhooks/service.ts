import {randomBytes} from 'node:crypto';
import type {createAdminClient} from '@/lib/supabase/admin';
import {open,seal,boxKeyId,type VaultKeyId} from '../oauth/vault';
import {buildEnvelope,deliverWebhook,webhookMode,type WebhookEvent} from './adapter';

type Db=ReturnType<typeof createAdminClient>;
/** New signing secret: shown once to the owner, stored only as a sealed envelope plus its last 4 characters. */
export function newWebhookSecret(env:Record<string,string|undefined>=process.env){
 const secret='whsec_'+randomBytes(24).toString('base64url'),key:VaultKeyId=env.PRO_OAUTH_TOKEN_KEY?'env':'mock';
 return{secret,secretBox:seal(secret,key,env),secretHint:secret.slice(-4)};
}
export type EmitResult={endpointId:string;status:'simulated'|'delivered'|'failed'};
/** Sends (or, in sandbox, simulates) an event to the owner's subscribed endpoints and logs each delivery. Never throws. */
export async function emitProEvent(db:Db,owner:string,event:WebhookEvent,data:Record<string,unknown>,endpointId:string|null=null):Promise<EmitResult[]>{
 const results:EmitResult[]=[];
 try{
  const targets=await db.rpc('pro_webhook_targets',{p_actor:owner,p_event:event,p_endpoint:endpointId});
  if(targets.error||!Array.isArray(targets.data))return results;
  const mode=webhookMode();
  for(const t of targets.data as {id:string;url:string;secretBox:string}[]){
   let outcome:{status:'simulated'|'delivered'|'failed';httpStatus:number|null;error:string|null};
   // A secret sealed with the public mock key may never sign a real call.
   if(mode==='live'&&boxKeyId(t.secretBox)!=='env')outcome={status:'failed',httpStatus:null,error:'secret_mock'};
   else try{outcome=await deliverWebhook({mode,url:t.url,secret:mode==='live'?open(t.secretBox):'',body:buildEnvelope(event,data)});}catch{outcome={status:'failed',httpStatus:null,error:'secret'};}
   await db.rpc('pro_webhook_delivery_log',{p_actor:owner,p_input:{endpointId:t.id,event,mode,status:outcome.status,attempts:1,httpStatus:outcome.httpStatus,error:outcome.error}});
   results.push({endpointId:t.id,status:outcome.status});
  }
 }catch{/* best effort: the business action never fails because of a webhook */}
 return results;
}
