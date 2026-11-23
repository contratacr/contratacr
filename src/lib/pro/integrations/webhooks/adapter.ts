import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {signWebhook,SIGNATURE_HEADER} from '../webhook';

/**
 * Row 72: outgoing webhook adapter. SANDBOX (default) never opens a connection: the delivery is recorded as
 * "simulated". LIVE needs PRO_WEBHOOKS_LIVE=1 and PRO_OAUTH_TOKEN_KEY on the server. In live mode only https
 * is accepted, every address the name resolves to must be public (no private, loopback, link-local or
 * metadata ranges), redirects are never followed, the call times out and the body is capped.
 */
export const WEBHOOK_EVENTS=['lead.created','quote.accepted','invoice.paid'] as const;
export type WebhookEvent=typeof WEBHOOK_EVENTS[number]|'test.ping';
export const WEBHOOK_BODY_MAX=16384,WEBHOOK_TIMEOUT_MS=5000;
export type WebhookMode='sandbox'|'live';
export const webhookMode=(env:Record<string,string|undefined>=process.env):WebhookMode=>env.PRO_WEBHOOKS_LIVE==='1'&&!!env.PRO_OAUTH_TOKEN_KEY?'live':'sandbox';
/** True for addresses a webhook must never reach. */
export function isPrivateAddress(address:string):boolean{
 const v=isIP(address);
 if(v===4){const [a,b]=address.split('.').map(Number) as [number,number];
  return a===0||a===10||a===127||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===192&&b===0||a===198&&(b===18||b===19)||a>=224;}
 if(v===6){const x=address.toLowerCase();
  if(x==='::'||x==='::1')return true;
  const mapped=x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);if(mapped)return isPrivateAddress(mapped[1]!);
  return /^f[cd]/.test(x)||/^fe[89ab]/.test(x)||x.startsWith('ff');}
 return true;
}
export type UrlCheck={ok:true;host:string}|{ok:false;reason:'protocol'|'credentials'|'port'|'host'|'private'|'dns'};
export async function checkWebhookUrl(raw:string,resolver:(host:string)=>Promise<string[]>=async h=>(await lookup(h,{all:true})).map(r=>r.address)):Promise<UrlCheck>{
 let u:URL;try{u=new URL(raw);}catch{return{ok:false,reason:'host'};}
 if(u.protocol!=='https:')return{ok:false,reason:'protocol'};
 if(u.username||u.password)return{ok:false,reason:'credentials'};
 if(u.port&&u.port!=='443')return{ok:false,reason:'port'};
 const host=u.hostname.replace(/^\[|\]$/g,'');
 if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal'))return{ok:false,reason:'host'};
 if(isIP(host))return isPrivateAddress(host)?{ok:false,reason:'private'}:{ok:true,host};
 let addresses:string[];try{addresses=await resolver(host);}catch{return{ok:false,reason:'dns'};}
 if(!addresses.length)return{ok:false,reason:'dns'};
 return addresses.some(isPrivateAddress)?{ok:false,reason:'private'}:{ok:true,host};
}
export type Delivery={status:'simulated'|'delivered'|'failed';httpStatus:number|null;error:string|null};
export function buildEnvelope(event:WebhookEvent,data:Record<string,unknown>,id=crypto.randomUUID(),now=new Date()){
 return JSON.stringify({id,type:event,createdAt:now.toISOString(),data});
}
export async function deliverWebhook(input:{mode:WebhookMode;url:string;secret:string;body:string;fetcher?:typeof fetch;resolver?:(host:string)=>Promise<string[]>}):Promise<Delivery>{
 if(input.mode==='sandbox')return{status:'simulated',httpStatus:null,error:null};
 if(Buffer.byteLength(input.body)>WEBHOOK_BODY_MAX)return{status:'failed',httpStatus:null,error:'body_too_large'};
 const check=await checkWebhookUrl(input.url,input.resolver);
 if(!check.ok)return{status:'failed',httpStatus:null,error:'url_'+check.reason};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),WEBHOOK_TIMEOUT_MS);
 try{
  const response=await(input.fetcher??fetch)(input.url,{method:'POST',redirect:'manual',signal:controller.signal,headers:{'Content-Type':'application/json','User-Agent':'ContrataCR-Webhooks/1',[SIGNATURE_HEADER]:signWebhook(input.secret,input.body)},body:input.body});
  const ok=response.status>=200&&response.status<300;
  return{status:ok?'delivered':'failed',httpStatus:response.status,error:ok?null:response.status>=300&&response.status<400?'redirect_refused':'http_'+response.status};
 }catch{return{status:'failed',httpStatus:null,error:'network'};}
 finally{clearTimeout(timer);}
}
