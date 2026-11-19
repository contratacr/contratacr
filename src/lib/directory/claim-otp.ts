// LOCAL PRO ONLY (multivertical F3). One-time codes for place claims: generation, hashing and sender ADAPTERS.
// 2026-11-17 (owner decision: claim by e-mail, no per-message cost): EmailClaimCodeSender renders the ES/EN e-mail
// and hands it to a transport. Transports: the in-memory mock outbox (default) or, on a developer's request, the
// app's own e-mail path in Brevo SANDBOX mode (claim-code-sender.ts, server only: nothing is delivered). No SMS or
// voice provider is wired. Pure module (no server imports): Web Crypto only; the database stores the hash, never
// the code.

export type ClaimCodeChannel='sms'|'email';
export type ClaimCodeMessage={claimId:string;channel:ClaimCodeChannel;destination:string;code:string;locale:'es'|'en'};
export type ClaimCodeSendResult={accepted:boolean;providerRef?:string};

/** Real providers (SMS gateway, transactional e-mail) implement this behind a sandbox flag; none exists yet. */
export interface ClaimCodeSender{
 readonly name:string;
 send(message:ClaimCodeMessage):Promise<ClaimCodeSendResult>;
}

export type ClaimOutboxEntry=ClaimCodeMessage&{subject?:string;text?:string;sentAt:string};
const OUTBOX_KEY='__ccrClaimCodeOutbox',OUTBOX_MAX=200;
/**
 * Process-wide mock outbox (development server = one Node process): every mock send lands here so the local
 * «test mailbox» route and the E2E can read the code. Bounded; never persisted; never used in production.
 */
export function claimMockOutbox():ClaimOutboxEntry[]{
 const g=globalThis as unknown as Record<string,ClaimOutboxEntry[]|undefined>;
 return g[OUTBOX_KEY]??=[];
}
const pushBounded=(outbox:ClaimOutboxEntry[],entry:ClaimOutboxEntry)=>{outbox.push(entry);if(outbox.length>OUTBOX_MAX)outbox.splice(0,outbox.length-OUTBOX_MAX);return outbox.length;};

/** In-memory sender for tests and local development. Keeps the outbox so a test can read the code. */
export class MockClaimCodeSender implements ClaimCodeSender{
 readonly name='mock';
 readonly outbox:ClaimOutboxEntry[];
 constructor(outbox:ClaimOutboxEntry[]=[]){this.outbox=outbox;}
 async send(message:ClaimCodeMessage){const n=pushBounded(this.outbox,{...message,sentAt:new Date().toISOString()});return {accepted:true,providerRef:`mock-${n}`};}
 last(claimId:string){return [...this.outbox].reverse().find(m=>m.claimId===claimId)??null;}
}

const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Subject, plain text and the inner HTML (the branded shell is added by the transport that owns it). No links. */
export function claimCodeEmail(code:string,locale:'es'|'en'){
 if(!/^\d{6}$/.test(code))throw new Error('Invalid claim code');
 const en=locale==='en';
 const subject=en?'ContrataCR: your code to manage your business':'ContrataCR: su código para administrar su negocio';
 const text=claimCodeText(code,locale)+(en
  ?' Someone asked to manage this business on ContrataCR using the e-mail listed for it. Claiming is free.'
  :' Alguien pidió administrar este negocio en ContrataCR usando el correo que aparece en su ficha. Reclamar es gratis.');
 const bodyHtml=`<h1 style="margin:0 0 16px;font-size:22px;color:#162543">${escapeHtml(en?'Your code':'Su código')}</h1>`
  +`<p class="ccr-email-body" style="margin:0 0 16px;line-height:1.5">${escapeHtml(en?'Type this code on the ContrataCR page where you asked to manage the business. It expires in 10 minutes.':'Escriba este código en la página de ContrataCR donde pidió administrar el negocio. Vence en 10 minutos.')}</p>`
  +`<div class="ccr-email-code" style="margin:0 0 16px;padding:16px;border-radius:12px;background:#eef7fb;text-align:center"><div style="font-size:30px;letter-spacing:8px;font-weight:700;color:#162543">${code}</div></div>`
  +`<p class="ccr-email-muted" style="margin:0;font-size:13px;color:#5b6b7f;line-height:1.5">${escapeHtml(en?'If you did not request it, ignore this message: nothing changes without the code.':'Si usted no lo solicitó, ignore este mensaje: nada cambia sin el código.')}</p>`;
 return {subject,text,bodyHtml};
}

export type ClaimEmail={claimId:string;code:string;to:string;subject:string;text:string;bodyHtml:string;locale:'es'|'en';eventKey:string};
export type ClaimEmailTransport=(mail:ClaimEmail)=>Promise<ClaimCodeSendResult>;
/** E-mail adapter: renders the message and delegates delivery to the transport (mock outbox or sandbox). */
export class EmailClaimCodeSender implements ClaimCodeSender{
 readonly name:string;
 private readonly transport:ClaimEmailTransport;
 constructor(transport:ClaimEmailTransport,name='email-mock'){this.transport=transport;this.name=name;}
 async send(message:ClaimCodeMessage){
  if(message.channel!=='email')throw new Error('EmailClaimCodeSender only sends e-mail');
  const mail=claimCodeEmail(message.code,message.locale);
  return this.transport({claimId:message.claimId,code:message.code,to:message.destination,locale:message.locale,eventKey:`dir-claim-code:${message.claimId}:${crypto.randomUUID()}`,...mail});
 }
}
/** Transport that only records the e-mail (with its code) in an outbox. Default everywhere. */
export function mockEmailTransport(outbox:ClaimOutboxEntry[]=claimMockOutbox()):ClaimEmailTransport{
 return async mail=>{
  const n=pushBounded(outbox,{claimId:mail.claimId,channel:'email',destination:mail.to,code:mail.code,locale:mail.locale,subject:mail.subject,text:mail.text,sentAt:new Date().toISOString()});
  return {accepted:true,providerRef:`mock-email-${n}`};
 };
}

/** Uniform 6-digit code (rejection sampling, no modulo bias). */
export function generateClaimCode():string{
 const buf=new Uint32Array(1);
 for(;;){crypto.getRandomValues(buf);if(buf[0]<4_294_000_000)return String(buf[0]%1_000_000).padStart(6,'0');}
}

/** HMAC-SHA256(pepper, `${claimId}:${code}`) as lowercase hex. The pepper lives only in server configuration. */
export async function hashClaimCode(pepper:string,claimId:string,code:string):Promise<string>{
 if(pepper.length<32)throw new Error('Claim code pepper must have at least 32 characters');
 const enc=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',enc.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(`${claimId.toLowerCase()}:${code}`)));
 return Array.from(sig,b=>b.toString(16).padStart(2,'0')).join('');
}

/** Spanish/English message body. No links: the claimant types the code in the open ContrataCR page. */
export function claimCodeText(code:string,locale:'es'|'en'){
 return locale==='en'
  ?`ContrataCR: your code to manage this business is ${code}. It expires in 10 minutes. If you did not request it, ignore this message.`
  :`ContrataCR: su código para administrar este negocio es ${code}. Vence en 10 minutos. Si usted no lo solicitó, ignore este mensaje.`;
}

/**
 * Route flow (/api/reclamos/[id]/codigo): code=generateClaimCode(); codeHash=await hashClaimCode(pepper,claimId,code);
 * r=dir_claim_send_code(actor,{actionId,claimId,codeHash}); await sender.send({claimId,channel:r.channel,
 * destination:r.destination,code,locale}); respond with r.destinationMasked only (never r.destination).
 * Pure factory: 'mock' (SMS mock) and 'email-mock'. The sandbox transport lives in claim-code-sender.ts (server).
 */
export function createClaimCodeSender(kind:'mock'|'email-mock',outbox?:ClaimOutboxEntry[]):ClaimCodeSender{
 if(kind==='mock')return new MockClaimCodeSender(outbox);
 if(kind==='email-mock')return new EmailClaimCodeSender(mockEmailTransport(outbox??[]),'email-mock');
 throw new Error('Only mock claim code senders exist in this module');
}
