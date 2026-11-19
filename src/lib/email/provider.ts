// LOCAL PRO ONLY (directory launch e-mail, 2026-11-18): ONE provider adapter for the directory launch e-mails
// (claim codes, reservation notices, waitlist calls). The owner only has to create the provider account and paste the
// key; nothing else changes in code. Guide: docs/directorio/correo.md.
//
// Env (names only, values live in the hosting dashboard, never in the repo):
//   EMAIL_PROVIDER = brevo | resend    (anything else → mock). 2026-11-19: production already sends every app
//                                      e-mail through Brevo (BREVO_API_KEY, src/lib/email/send.ts → outbox.ts, with
//                                      the daily quota, receipts and webhook), so «brevo» is the launch choice: the
//                                      directory reuses that same path and needs no new account. Resend stays as an
//                                      alternative.
//   BREVO_API_KEY  = xkeysib-…         (server only; already set in production)
//   EMAIL_MODE     = mock | sandbox | live   (default mock)
//   RESEND_API_KEY = re_…              (server only)
//   EMAIL_FROM     = "ContrataCR <avisos@contratacr.com>"  (must be on the verified domain)
//
// Mode gating (pure, see resolveEmailMode):
//  * mock    — default, and ALWAYS in development/test unless sandbox is asked for. Never touches the network.
//  * sandbox — EMAIL_MODE=sandbox + EMAIL_PROVIDER=resend + key. The real API is called, but the recipient is
//              REPLACED by a Resend test address (delivered@resend.dev etc.): nobody real gets anything.
//  * live    — ONLY EMAIL_MODE=live AND NODE_ENV=production AND provider+key+from. Any missing piece → mock.
// Privacy: logs carry the masked address and the status only, never codes, links or bodies.

export type EmailMode='mock'|'sandbox'|'live';
export type EmailEnv=Record<string,string|undefined>;
export type OutgoingEmail={to:string;subject:string;html:string;text:string;idempotencyKey:string;tags?:Record<string,string>;headers?:Record<string,string>};
export type ProviderResult={ok:boolean;status:'sent'|'recorded'|'failed'|'rate_limited'|'duplicate';retryable?:boolean;providerId?:string|null;httpStatus?:number};
export interface EmailProvider{readonly name:string;readonly mode:EmailMode;send(mail:OutgoingEmail):Promise<ProviderResult>}

/** Resend's documented test inboxes: accepted by the API, never delivered to a real person. */
export const RESEND_TEST_ADDRESSES={delivered:'delivered@resend.dev',bounced:'bounced@resend.dev',complained:'complained@resend.dev'} as const;
const RESEND_URL='https://api.resend.com/emails';

export function resolveEmailMode(env:EmailEnv=process.env):EmailMode{
 const brevo=env.EMAIL_PROVIDER==='brevo'&&!!env.BREVO_API_KEY;
 const configured=brevo||(env.EMAIL_PROVIDER==='resend'&&!!env.RESEND_API_KEY);
 // Brevo's From is the app's verified default sender (send.ts); Resend needs EMAIL_FROM.
 if(env.EMAIL_MODE==='live')return configured&&env.NODE_ENV==='production'&&(brevo||!!env.EMAIL_FROM)?'live':'mock';
 if(env.EMAIL_MODE==='sandbox')return configured?'sandbox':'mock';
 return 'mock';
}

/** «isaac.rojas@gmail.com» → «is***@g***.com». Used in every log line and in any UI echo. */
export function maskEmail(address:string):string{
 const v=String(address??'').trim();const at=v.lastIndexOf('@');
 if(at<1)return '***';
 const local=v.slice(0,at),domain=v.slice(at+1),dot=domain.lastIndexOf('.');
 const host=dot>0?domain.slice(0,dot):domain,tld=dot>0?domain.slice(dot):'';
 return `${local.slice(0,Math.min(2,local.length-1))}***@${host.slice(0,1)}***${tld}`;
}

export type MockOutboxEntry={to:string;subject:string;text:string;idempotencyKey:string;at:string};
const MOCK_KEY='__ccrEmailProviderMockOutbox',MOCK_MAX=200;
export function providerMockOutbox():MockOutboxEntry[]{const g=globalThis as unknown as Record<string,MockOutboxEntry[]|undefined>;return g[MOCK_KEY]??=[];}

export class MockEmailProvider implements EmailProvider{
 readonly name='mock';readonly mode='mock' as const;
 private readonly outbox:MockOutboxEntry[];
 constructor(outbox:MockOutboxEntry[]=providerMockOutbox()){this.outbox=outbox;}
 async send(mail:OutgoingEmail):Promise<ProviderResult>{
  if(this.outbox.some(e=>e.idempotencyKey===mail.idempotencyKey))return {ok:true,status:'duplicate'};
  this.outbox.push({to:mail.to,subject:mail.subject,text:mail.text,idempotencyKey:mail.idempotencyKey,at:new Date().toISOString()});
  if(this.outbox.length>MOCK_MAX)this.outbox.splice(0,this.outbox.length-MOCK_MAX);
  return {ok:true,status:'recorded'};
 }
}

type FetchLike=(url:string,init:{method:string;headers:Record<string,string>;body:string})=>Promise<{status:number;ok:boolean;json():Promise<unknown>}>;

/** Resend HTTP API (POST /emails) with fetch. Idempotency-Key header: Resend drops a repeat within 24 h. */
export class ResendEmailProvider implements EmailProvider{
 readonly name='resend';
 readonly mode:'sandbox'|'live';
 private readonly cfg:{apiKey:string;from:string;fetch?:FetchLike};
 constructor(mode:'sandbox'|'live',cfg:{apiKey:string;from:string;fetch?:FetchLike}){this.mode=mode;this.cfg=cfg;}
 async send(mail:OutgoingEmail):Promise<ProviderResult>{
  const to=this.mode==='sandbox'?RESEND_TEST_ADDRESSES.delivered:mail.to;
  const body={from:this.cfg.from,to:[to],subject:mail.subject,html:mail.html,text:mail.text,
   ...(mail.headers?{headers:mail.headers}:{}),
   ...(mail.tags?{tags:Object.entries(mail.tags).map(([name,value])=>({name,value:value.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,256)}))}:{})};
  const f=this.cfg.fetch??(globalThis.fetch as unknown as FetchLike);
  let res;
  try{res=await f(RESEND_URL,{method:'POST',headers:{Authorization:`Bearer ${this.cfg.apiKey}`,'Content-Type':'application/json','Idempotency-Key':mail.idempotencyKey.slice(0,256)},body:JSON.stringify(body)});}
  catch{return {ok:false,status:'failed',retryable:true};}
  if(res.ok){const j=await res.json().catch(()=>null) as {id?:string}|null;return {ok:true,status:'sent',providerId:j?.id??null,httpStatus:res.status};}
  // 409 = same idempotency key already processed → treat as delivered once.
  if(res.status===409)return {ok:true,status:'duplicate',httpStatus:409};
  return {ok:false,status:'failed',retryable:res.status===429||res.status>=500,httpStatus:res.status};
 }
}

type BrevoSend=(opts:{to:string;subject:string;html:string;eventKey:string;purpose:'security'|'activity';nivel:'critico'|'normal';campana?:string;sandbox?:boolean})=>Promise<{ok:boolean;status:string;detail:string|null}>;
async function defaultBrevoSend(opts:Parameters<BrevoSend>[0]){
 const {sendBrevoEmail}=await import('@/lib/email/send');
 return sendBrevoEmail({to:opts.to,subject:opts.subject,html:opts.html,eventKey:opts.eventKey,purpose:opts.purpose,nivel:opts.nivel,campana:opts.campana,sandbox:opts.sandbox});
}
/**
 * Brevo through the app's existing send path (send.ts → outbox.ts): same verified sender, same daily quota and
 * receipts as every other ContrataCR e-mail; the outbox de-duplicates on `eventKey` and retries on its own, so a
 * «queued» answer counts as accepted and is never retried here. Sandbox = Brevo's `X-Sib-Sandbox: drop` header:
 * the request is validated and NOTHING is delivered.
 */
export class BrevoEmailProvider implements EmailProvider{
 readonly name='brevo';
 readonly mode:'sandbox'|'live';
 private readonly sendFn:BrevoSend;
 constructor(mode:'sandbox'|'live',sendFn?:BrevoSend){this.mode=mode;this.sendFn=sendFn??defaultBrevoSend;}
 async send(mail:OutgoingEmail):Promise<ProviderResult>{
  const r=await this.sendFn({to:mail.to,subject:mail.subject,html:mail.html,eventKey:mail.idempotencyKey,
   purpose:mail.tags?.kind==='claim_code'?'security':'activity',nivel:'critico',campana:mail.tags?.kind,sandbox:this.mode==='sandbox'});
  if(r.ok)return {ok:true,status:'sent'};
  if(r.status==='queued'||r.status==='uncertain')return {ok:true,status:'recorded'};
  return {ok:false,status:'failed',retryable:false};
 }
}

export function emailProviderFor(env:EmailEnv=process.env,opts:{fetch?:FetchLike;outbox?:MockOutboxEntry[];brevoSend?:BrevoSend}={}):EmailProvider{
 const mode=resolveEmailMode(env);
 if(mode==='mock')return new MockEmailProvider(opts.outbox);
 if(env.EMAIL_PROVIDER==='brevo')return new BrevoEmailProvider(mode,opts.brevoSend);
 const from=env.EMAIL_FROM||'ContrataCR <avisos@contratacr.com>';
 return new ResendEmailProvider(mode,{apiKey:env.RESEND_API_KEY as string,from,fetch:opts.fetch});
}

export type DispatchDeps={
 provider?:EmailProvider;env?:EmailEnv;
 /** Returns true when the recipient may receive one more message now. Default: src/lib/rate-limit.ts (fails closed). */
 allowRecipient?:(to:string)=>Promise<boolean>;
 sleep?:(ms:number)=>Promise<void>;
 log?:(line:Record<string,unknown>)=>void;
 maxAttempts?:number;
};
const sent=new Set<string>();const SENT_MAX=2000;
const defaultSleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
async function defaultAllow(to:string){
 const {enforceRateLimitKey}=await import('@/lib/rate-limit');
 // 8 messages per recipient per 10 minutes, across every instance (hashed key, raw address never stored).
 return (await enforceRateLimitKey(`email-rcpt:${to.trim().toLowerCase()}`,8,600_000))===null;
}

/** Sends one message: per-process idempotency, per-recipient rate limit, retries with exponential backoff, masked log. */
export async function dispatchEmail(mail:OutgoingEmail,deps:DispatchDeps={}):Promise<ProviderResult>{
 const provider=deps.provider??emailProviderFor(deps.env);
 const log=deps.log??(line=>console.info('[email]',JSON.stringify(line)));
 const base={provider:provider.name,mode:provider.mode,to:maskEmail(mail.to),key:mail.idempotencyKey.replace(/:[^:]*$/,':…')};
 if(sent.has(mail.idempotencyKey)){log({...base,status:'duplicate'});return {ok:true,status:'duplicate'};}
 let allowed=true;
 try{allowed=await (deps.allowRecipient??defaultAllow)(mail.to);}catch{allowed=false;}
 if(!allowed){log({...base,status:'rate_limited'});return {ok:false,status:'rate_limited'};}
 const max=Math.max(1,deps.maxAttempts??3),sleep=deps.sleep??defaultSleep;
 let r:ProviderResult={ok:false,status:'failed'};
 for(let attempt=1;attempt<=max;attempt++){
  try{r=await provider.send(mail);}catch{r={ok:false,status:'failed',retryable:true};}
  if(r.ok||!r.retryable||attempt===max)break;
  await sleep(500*2**(attempt-1));
 }
 if(r.ok){sent.add(mail.idempotencyKey);if(sent.size>SENT_MAX)sent.delete(sent.values().next().value as string);}
 log({...base,status:r.status,http:r.httpStatus??null});
 return r;
}
/** Test helper: forget the per-process idempotency memory. */
export function resetEmailDispatchMemory(){sent.clear();}
