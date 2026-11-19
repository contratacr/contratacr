import 'server-only';
import {escaparHtml} from '@/lib/email/escape';
import type {createAdminClient} from '@/lib/supabase/admin';

// LOCAL PRO ONLY (launch fix I5, 2026-11-17). ONE module for the Pro transactional e-mails:
//  (a) quote shared with a customer, (b) quote accepted / declined (to the Pro), (c) customer invited to a job,
//  (d) team invitation, (e) electronic invoice issued.
// Delivery mode:
//  * «mock» (default, everywhere): the e-mail is rendered and recorded in an in-memory, process-wide outbox. Nothing
//    touches the network. The dev-only «test mailbox» route (/api/pro/correos-prueba) and the E2E read it.
//  * «sandbox»: ONLY when PRO_TRANSACTIONAL_EMAIL_MODE=sandbox, NODE_ENV is not production and the app's Brevo key
//    exists. The same e-mail goes through the app's single send path (src/lib/email/send.ts) with Brevo's sandbox
//    header (X-Sib-Sandbox: drop): Brevo validates the request and delivers nothing. Fired after the response.
//  * Production delivery is NOT enabled in this build: any other value stays on «mock».
// Rules: sending never blocks or fails the business action (callers use settleTransactionalEmail, everything is
// caught); event keys are idempotent (actionId / publicationId / invitation id); no notifications rows; no logs
// with links, codes or addresses; the quote access CODE never goes into an e-mail (only the access link).

export type TransactionalEmailMode='mock'|'sandbox';
export type TransactionalEmailLocale='es'|'en';
export type TransactionalEmailKind='quote_shared'|'quote_accepted'|'quote_declined'|'project_invite'|'team_invite'|'invoice_issued';
/** What the route returns to the UI. `to` is only filled when the actor already knows the address. */
export type TransactionalEmailReport={mode:TransactionalEmailMode;status:'recorded'|'queued'|'no_recipient'|'failed';to:string|null};

export function transactionalEmailMode(env:Record<string,string|undefined>=process.env):TransactionalEmailMode{
 return env.PRO_TRANSACTIONAL_EMAIL_MODE==='sandbox'&&env.NODE_ENV!=='production'&&!!env.BREVO_API_KEY?'sandbox':'mock';
}

/** Stable identity of one e-mail event: the same business action never produces two e-mails. */
export function transactionalEmailKey(kind:TransactionalEmailKind,id:string){
 if(!/^[A-Za-z0-9:_-]{1,200}$/.test(id))throw new Error('Invalid e-mail event id');
 return `pro-tx:${kind}:${id}`;
}

export type TransactionalEmailData={
 /** Who acts (professional/company name, or customer name for accept/decline). */
 actorName:string;
 /** Quote / job / company / invoice title shown in the message. */
 subjectName:string;
 /** Absolute https/http link the recipient opens. */
 link:string;
 /** Optional extra lines (already plain text; escaped when rendered). */
 extra?:string[];
};

const safeLink=(link:string)=>{const url=new URL(link);if(url.protocol!=='https:'&&url.protocol!=='http:')throw new Error('Invalid e-mail link');return url.toString();};
const clip=(value:string,max=160)=>{const v=String(value??'').replace(/\s+/g,' ').trim();return v.length>max?v.slice(0,max-1)+'…':v;};

/** Subject, plain text and the inner HTML (the branded shell is added by `renderTransactionalEmail`). */
export function transactionalEmailContent(kind:TransactionalEmailKind,locale:TransactionalEmailLocale,data:TransactionalEmailData){
 const en=locale==='en',who=clip(data.actorName)||'ContrataCR',what=clip(data.subjectName),link=safeLink(data.link);
 const t:{subject:string;title:string;lines:string[];button:string}=(()=>{switch(kind){
  case 'quote_shared':return en
   ?{subject:`${who} shared a quote with you`,title:'You have a new quote',lines:[`${who} shared the quote "${what}" with you on ContrataCR.`,'Open it with the link below and sign in with this e-mail. If the professional gave you an access code, enter it when asked.'],button:'View quote'}
   :{subject:`${who} le compartió una cotización`,title:'Tiene una cotización nueva',lines:[`${who} le compartió la cotización "${what}" en ContrataCR.`,'Ábrala con el enlace de abajo e inicie sesión con este correo. Si el profesional le dio un código de acceso, ingréselo cuando se le pida.'],button:'Ver cotización'};
  case 'quote_accepted':return en
   ?{subject:`Quote accepted: ${what}`,title:'Your quote was accepted',lines:[`${who} accepted the quote "${what}".`,'Open your quotes to see the details and plan the next step.'],button:'Open quotes'}
   :{subject:`Cotización aceptada: ${what}`,title:'Su cotización fue aceptada',lines:[`${who} aceptó la cotización "${what}".`,'Abra sus cotizaciones para ver el detalle y planear el siguiente paso.'],button:'Abrir cotizaciones'};
  case 'quote_declined':return en
   ?{subject:`Quote declined: ${what}`,title:'Your quote was declined',lines:[`${who} declined the quote "${what}".`,'Open your quotes to review it or prepare a new version.'],button:'Open quotes'}
   :{subject:`Cotización rechazada: ${what}`,title:'Su cotización fue rechazada',lines:[`${who} rechazó la cotización "${what}".`,'Abra sus cotizaciones para revisarla o preparar una versión nueva.'],button:'Abrir cotizaciones'};
  case 'project_invite':return en
   ?{subject:`${who} invited you to follow your project`,title:'Invitation to your project',lines:[`${who} invited you to follow the job "${what}" on ContrataCR: updates, files and documents in one place.`,'Open the link and sign in (or create a free account). The invitation works once.'],button:'Join the project'}
   :{subject:`${who} le invitó a seguir su proyecto`,title:'Invitación a su proyecto',lines:[`${who} le invitó a seguir el trabajo "${what}" en ContrataCR: avances, archivos y documentos en un solo lugar.`,'Abra el enlace e inicie sesión (o cree una cuenta gratis). La invitación sirve una sola vez.'],button:'Unirme al proyecto'};
  case 'team_invite':return en
   ?{subject:`Invitation to join ${what} on ContrataCR Pro`,title:'Team invitation',lines:[`${what} invites you to its team on ContrataCR Pro.`,'Sign in with this e-mail, open Pro › Team › "Join a company" and enter the code the company gives you separately. The code expires in 72 hours.'],button:'Open Team'}
   :{subject:`Invitación para unirse a ${what} en ContrataCR Pro`,title:'Invitación al equipo',lines:[`${what} le invita a su equipo en ContrataCR Pro.`,'Inicie sesión con este correo, abra Pro › Equipo › "Unirse a una empresa" e ingrese el código que la empresa le dará por separado. El código vence en 72 horas.'],button:'Abrir Equipo'};
  case 'invoice_issued':return en
   ?{subject:`${who} issued you an electronic invoice`,title:'Electronic invoice issued',lines:[`${who} issued the electronic document "${what}" in your name.`,'If you have a ContrataCR account you can review your projects with the link below. For questions about the invoice, contact the professional.'],button:'Open my projects'}
   :{subject:`${who} le emitió una factura electrónica`,title:'Factura electrónica emitida',lines:[`${who} emitió el comprobante electrónico "${what}" a su nombre.`,'Si tiene cuenta en ContrataCR puede revisar sus proyectos con el enlace de abajo. Para consultas sobre la factura, contacte al profesional.'],button:'Abrir mis proyectos'};
 }})();
 const lines=[...t.lines,...(data.extra??[]).map(line=>clip(line,300)).filter(Boolean)];
 const footer=en?'You receive this e-mail because of an action on ContrataCR. If you did not expect it, you can ignore it.':'Recibe este correo por una acción en ContrataCR. Si no lo esperaba, puede ignorarlo.';
 const bodyHtml=`<h1 style="margin:0 0 16px;font-size:22px;color:#162543">${escaparHtml(t.title)}</h1>`
  +lines.map(line=>`<p class="ccr-email-body" style="margin:0 0 16px;line-height:1.5">${escaparHtml(line)}</p>`).join('')
  +`<p style="margin:24px 0"><a href="${escaparHtml(link)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#162543;color:#ffffff;text-decoration:none;font-weight:700">${escaparHtml(t.button)}</a></p>`
  +`<p class="ccr-email-muted" style="margin:0 0 8px;font-size:13px;color:#5b6b7f;line-height:1.5;word-break:break-all">${escaparHtml(link)}</p>`
  +`<p class="ccr-email-muted" style="margin:16px 0 0;font-size:13px;color:#5b6b7f;line-height:1.5">${escaparHtml(footer)}</p>`;
 const text=[...lines,`${t.button}: ${link}`,footer].join('\n\n');
 return {subject:clip(t.subject,200),text,bodyHtml};
}

export type TransactionalOutboxEntry={eventKey:string;kind:TransactionalEmailKind;to:string;locale:TransactionalEmailLocale;subject:string;text:string;link:string;actorId:string;mode:TransactionalEmailMode;at:string};
const OUTBOX_KEY='__ccrProTransactionalOutbox',OUTBOX_MAX=300;
/** Process-wide mock outbox (one dev server process). Bounded; never persisted; never read in production. */
export function transactionalMockOutbox():TransactionalOutboxEntry[]{
 const g=globalThis as unknown as Record<string,TransactionalOutboxEntry[]|undefined>;
 return g[OUTBOX_KEY]??=[];
}

const emailOk=(value:string|null|undefined)=>{const v=String(value??'').trim().toLowerCase();return /^[^\s@<>"']{1,64}@[^\s@<>"'.]+(\.[^\s@<>"'.]+)+$/.test(v)&&v.length<=254?v:null;};

export type TransactionalEmailInput={
 kind:TransactionalEmailKind;
 /** Business id the event belongs to (actionId, publicationId, invitation id…). */
 eventId:string;
 to:string|null|undefined;
 locale:TransactionalEmailLocale;
 actorId:string;
 data:TransactionalEmailData;
 /** true when the actor typed/owns the address, so the UI may show it. */
 revealRecipient:boolean;
};

/**
 * Records (mock) or queues (sandbox) one e-mail. Never throws. Idempotent: an event key already in the mock
 * outbox is not recorded twice, and the sandbox path reuses the key as the delivery receipt (email_deliveries).
 */
export async function sendTransactionalEmail(input:TransactionalEmailInput,env:Record<string,string|undefined>=process.env):Promise<TransactionalEmailReport>{
 const mode=transactionalEmailMode(env);
 try{
  const to=emailOk(input.to);
  if(!to)return {mode,status:'no_recipient',to:null};
  const shown=input.revealRecipient?to:null;
  const eventKey=transactionalEmailKey(input.kind,input.eventId);
  const mail=transactionalEmailContent(input.kind,input.locale,input.data);
  if(mode==='mock'){
   const outbox=transactionalMockOutbox();
   if(!outbox.some(entry=>entry.eventKey===eventKey)){
    outbox.push({eventKey,kind:input.kind,to,locale:input.locale,subject:mail.subject,text:mail.text,link:safeLink(input.data.link),actorId:input.actorId,mode,at:new Date().toISOString()});
    if(outbox.length>OUTBOX_MAX)outbox.splice(0,outbox.length-OUTBOX_MAX);
   }
   return {mode,status:'recorded',to:shown};
  }
  const [{sendBrevoEmail,brandedEmailDocument},{despuesDeResponder}]=await Promise.all([import('@/lib/email/send'),import('@/lib/after-response')]);
  const html=brandedEmailDocument({title:escaparHtml(mail.subject),bodyHtml:mail.bodyHtml});
  // Fire after the response: Brevo latency never delays nor fails the business action.
  despuesDeResponder(sendBrevoEmail({to,subject:mail.subject,html,eventKey,purpose:'activity',nivel:'normal',sandbox:true}).catch(()=>null),'pro-transactional-email');
  return {mode,status:'queued',to:shown};
 }catch{
  return {mode,status:'failed',to:null};
 }
}

/** Awaits an e-mail report with a short ceiling; on timeout or error the business answer still goes out. */
export async function settleTransactionalEmail(work:Promise<TransactionalEmailReport>|(()=>Promise<TransactionalEmailReport>),ms=2500):Promise<TransactionalEmailReport>{
 const fallback:TransactionalEmailReport={mode:transactionalEmailMode(),status:'failed',to:null};
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const promise=typeof work==='function'?work():work;
  return await Promise.race([promise,new Promise<TransactionalEmailReport>(resolve=>{timer=setTimeout(()=>resolve(fallback),ms);})]);
 }catch{return fallback;}finally{if(timer)clearTimeout(timer);}
}

/** Locale of the acting user, read from the page that made the request (/en/... = English). */
export function transactionalEmailLocaleOf(req:Request):TransactionalEmailLocale{
 try{const referer=req.headers.get('referer');return referer&&/^\/en(?:\/|$)/.test(new URL(referer).pathname)?'en':'es';}catch{return 'es';}
}

type Reader=ReturnType<typeof createAdminClient>;
type Row=Record<string,unknown>|null;
async function one(query:PromiseLike<{data:unknown;error:unknown}>):Promise<Row>{
 try{const r=await query;return r.error||!r.data||typeof r.data!=='object'?null:r.data as Row;}catch{return null;}
}
/** E-mail and display name of an account (profiles). Null on any failure. */
export async function transactionalAccount(db:Reader,userId:string){
 const row=await one(db.from('profiles').select('email,full_name').eq('id',userId).maybeSingle());
 return row?{email:emailOk(row.email as string|null),name:String(row.full_name??'')}:null;
}
/** Owner of a shared quote publication. */
export async function transactionalPublicationOwner(db:Reader,publicationId:string){
 const row=await one(db.from('pro_private_estimate_publications').select('owner_id').eq('id',publicationId).maybeSingle());
 return typeof row?.owner_id==='string'?row.owner_id:null;
}
/** E-mail and name of the customer stored on one of the owner's jobs (pro_work.clientId → pro_clients). */
export async function transactionalWorkClient(db:Reader,ownerId:string,workId:string){
 const work=await one(db.from('pro_work').select('clientId,service').eq('user_id',ownerId).eq('id',workId).maybeSingle());
 if(!work||typeof work.clientId!=='string')return null;
 const client=await one(db.from('pro_clients').select('email,name').eq('user_id',ownerId).eq('id',work.clientId).maybeSingle());
 return {email:emailOk(client?.email as string|null),name:String(client?.name??''),service:String(work.service??'')};
}
/** Public business name of a professional (falls back to the account name). */
export async function transactionalBusinessName(db:Reader,userId:string){
 const pro=await one(db.from('professionals').select('business_name').eq('profile_id',userId).maybeSingle());
 const name=String(pro?.business_name??'').trim();
 return name||(await transactionalAccount(db,userId))?.name||'ContrataCR';
}
