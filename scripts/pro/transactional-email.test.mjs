// Run: node --test scripts/pro/transactional-email.test.mjs
// LOCAL PRO ONLY (launch fix I5, 2026-11-17). Pure unit tests, no DB/network, for src/lib/pro/transactional-email.ts
// and src/lib/pro/transactional-email-copy.ts: templates escape HTML and never carry a code, mode selection is never
// «sandbox» in production or without the flag/key, idempotent keys, mock outbox records, sandbox path goes through
// the app's send path with sandbox:true (mocked), and nothing ever throws into the business action.
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const src=new URL('../../src/',import.meta.url).href;
const empty='data:text/javascript,export{}';
const mockSend='data:text/javascript,'+encodeURIComponent('export function brandedEmailDocument({title,bodyHtml}){return `<html><title>${title}</title>${bodyHtml}</html>`;}export async function sendBrevoEmail(o){(globalThis.__txSends??=[]).push(o);if(globalThis.__txSendThrows)throw new Error("boom");return {ok:true,status:"sent",detail:null};}');
const mockAfter='data:text/javascript,'+encodeURIComponent('export function despuesDeResponder(p){(globalThis.__txAfter??=[]).push(p);}');
registerHooks({resolve(spec,ctx,next){
 if(spec==='server-only')return {url:empty,shortCircuit:true};
 if(spec==='@/lib/email/send')return {url:mockSend,shortCircuit:true};
 if(spec==='@/lib/after-response')return {url:mockAfter,shortCircuit:true};
 if(spec.startsWith('@/'))return next(src+spec.slice(2)+(/\.[a-z]+$/i.test(spec)?'':'.ts'),ctx);
 if(ctx.parentURL?.startsWith(src)&&spec.startsWith('.')&&!/\.[a-z]+$/i.test(spec))return next(spec+'.ts',ctx);
 return next(spec,ctx);
}});
const TX=await import('../../src/lib/pro/transactional-email.ts');
const COPY=await import('../../src/lib/pro/transactional-email-copy.ts');
const mockEnv={NODE_ENV:'development'};
const sandboxEnv={NODE_ENV:'development',PRO_TRANSACTIONAL_EMAIL_MODE:'sandbox',BREVO_API_KEY:'xkeysib-unit'};
const base=(over={})=>({kind:'quote_shared',eventId:'11111111-1111-4111-8111-111111111111',to:'Cliente@Example.com',locale:'es',actorId:'22222222-2222-4222-8222-222222222222',revealRecipient:true,
 data:{actorName:'Constructora <b>Sol</b>',subjectName:'Techo "nuevo" & canoas',link:'http://127.0.0.1:3185/dashboard/cotizaciones'},...over});

test('mode is mock by default and never sandbox in production, without the flag or without the Brevo key',()=>{
 assert.equal(TX.transactionalEmailMode({}),'mock');
 assert.equal(TX.transactionalEmailMode(mockEnv),'mock');
 assert.equal(TX.transactionalEmailMode({...sandboxEnv,NODE_ENV:'production'}),'mock');
 assert.equal(TX.transactionalEmailMode({...sandboxEnv,BREVO_API_KEY:''}),'mock');
 assert.equal(TX.transactionalEmailMode({...sandboxEnv,PRO_TRANSACTIONAL_EMAIL_MODE:'production'}),'mock');
 assert.equal(TX.transactionalEmailMode({...sandboxEnv,PRO_TRANSACTIONAL_EMAIL_MODE:'SANDBOX'}),'mock');
 assert.equal(TX.transactionalEmailMode(sandboxEnv),'sandbox');
});

test('event keys are stable per kind + business id and reject unsafe ids',()=>{
 assert.equal(TX.transactionalEmailKey('team_invite','abc-1'),TX.transactionalEmailKey('team_invite','abc-1'));
 assert.notEqual(TX.transactionalEmailKey('quote_accepted','abc-1'),TX.transactionalEmailKey('quote_declined','abc-1'));
 assert.throws(()=>TX.transactionalEmailKey('team_invite','a b'));
 assert.throws(()=>TX.transactionalEmailKey('team_invite',''));
});

test('templates escape HTML from names/titles/links, ES and EN, and keep the link',()=>{
 for(const kind of ['quote_shared','quote_accepted','quote_declined','project_invite','team_invite','invoice_issued'])for(const locale of ['es','en']){
  const mail=TX.transactionalEmailContent(kind,locale,{actorName:'<script>alert(1)</script>',subjectName:'"><img src=x onerror=alert(1)>',link:'https://contratacr.com/x?a=1&b="2"'});
  assert.ok(!mail.bodyHtml.includes('<script>'),kind);
  assert.ok(!mail.bodyHtml.includes('<img'),kind);
  assert.ok(mail.bodyHtml.includes('&lt;script&gt;')||kind==='team_invite',kind);
  assert.ok(mail.bodyHtml.includes('href="https://contratacr.com/x?a=1&amp;b=%222%22"'),kind);
  assert.ok(mail.text.includes('https://contratacr.com/x?a=1&b=%222%22'),kind);
  assert.ok(mail.subject.length>0&&mail.subject.length<=200);
 }
 assert.match(TX.transactionalEmailContent('quote_shared','es',{actorName:'Ana',subjectName:'Techo',link:'https://x.cr/'}).subject,/le compartió una cotización/);
 assert.match(TX.transactionalEmailContent('quote_shared','en',{actorName:'Ana',subjectName:'Roof',link:'https://x.cr/'}).subject,/shared a quote with you/);
 assert.throws(()=>TX.transactionalEmailContent('team_invite','es',{actorName:'',subjectName:'X',link:'javascript:alert(1)'}));
});

test('mock mode records once per event key, never touches the send path, and hides addresses unless revealed',async()=>{
 const outbox=TX.transactionalMockOutbox();outbox.length=0;globalThis.__txSends=[];
 const first=await TX.sendTransactionalEmail(base(),mockEnv);
 assert.deepEqual(first,{mode:'mock',status:'recorded',to:'cliente@example.com'});
 const replay=await TX.sendTransactionalEmail(base(),mockEnv);
 assert.equal(replay.status,'recorded');
 assert.equal(outbox.length,1,'same event key → one e-mail');
 assert.equal(outbox[0].to,'cliente@example.com');
 assert.equal(outbox[0].kind,'quote_shared');
 assert.match(outbox[0].eventKey,/^pro-tx:quote_shared:/);
 assert.ok(outbox[0].subject.includes('Constructora <b>Sol</b>'),'plain-text subject keeps the name');
 const hidden=await TX.sendTransactionalEmail(base({eventId:'other-1',revealRecipient:false}),mockEnv);
 assert.equal(hidden.to,null);
 assert.equal(outbox.length,2);
 assert.equal(globalThis.__txSends.length,0,'mock never calls Brevo');
});

test('no recipient or an invalid address → no_recipient, nothing recorded; errors become failed, never throw',async()=>{
 const outbox=TX.transactionalMockOutbox();outbox.length=0;
 assert.equal((await TX.sendTransactionalEmail(base({to:null}),mockEnv)).status,'no_recipient');
 assert.equal((await TX.sendTransactionalEmail(base({to:'not-an-email'}),mockEnv)).status,'no_recipient');
 assert.equal((await TX.sendTransactionalEmail(base({eventId:'bad id'}),mockEnv)).status,'failed');
 assert.equal((await TX.sendTransactionalEmail(base({eventId:'x2',data:{actorName:'A',subjectName:'B',link:'ftp://x'}}),mockEnv)).status,'failed');
 assert.equal(outbox.length,0);
});

test('sandbox goes through the app send path with sandbox:true after the response, idempotent key reused',async()=>{
 globalThis.__txSends=[];globalThis.__txAfter=[];
 const r=await TX.sendTransactionalEmail(base({kind:'team_invite',eventId:'33333333-3333-4333-8333-333333333333'}),sandboxEnv);
 assert.deepEqual(r,{mode:'sandbox',status:'queued',to:'cliente@example.com'});
 assert.equal(globalThis.__txAfter.length,1);await Promise.all(globalThis.__txAfter);
 assert.equal(globalThis.__txSends.length,1);
 const sent=globalThis.__txSends[0];
 assert.equal(sent.sandbox,true);assert.equal(sent.eventKey,'pro-tx:team_invite:33333333-3333-4333-8333-333333333333');
 assert.equal(sent.to,'cliente@example.com');assert.equal(sent.purpose,'activity');
 assert.ok(!sent.html.includes('<b>Sol</b>'));
 globalThis.__txSendThrows=true;
 const failing=await TX.sendTransactionalEmail(base({eventId:'x3'}),sandboxEnv);
 assert.equal(failing.status,'queued');await Promise.all(globalThis.__txAfter);// background failure is swallowed
 globalThis.__txSendThrows=false;
});

test('settle never rejects and answers on timeout',async()=>{
 assert.equal((await TX.settleTransactionalEmail(Promise.reject(new Error('x')))).status,'failed');
 assert.equal((await TX.settleTransactionalEmail(()=>{throw new Error('sync');})).status,'failed');
 assert.equal((await TX.settleTransactionalEmail(new Promise(()=>{}),20)).status,'failed');
 assert.equal((await TX.settleTransactionalEmail(async()=>({mode:'mock',status:'recorded',to:null}))).status,'recorded');
});

test('locale comes from the page that made the request',()=>{
 const req=referer=>new Request('http://127.0.0.1/api/x',{headers:referer?{referer}:{}});
 assert.equal(TX.transactionalEmailLocaleOf(req('http://127.0.0.1/en/dashboard/pro/equipo')),'en');
 assert.equal(TX.transactionalEmailLocaleOf(req('http://127.0.0.1/dashboard/pro/equipo')),'es');
 assert.equal(TX.transactionalEmailLocaleOf(req('http://127.0.0.1/entrar')),'es');
 assert.equal(TX.transactionalEmailLocaleOf(req(null)),'es');
});

test('UI copy is honest: «sent» only when queued; mock says not configured; parse rejects junk',()=>{
 assert.equal(COPY.transactionalEmailNotice({mode:'sandbox',status:'queued',to:'a@b.cr'},false),'Se envió un correo a a@b.cr.');
 assert.match(COPY.transactionalEmailNotice({mode:'mock',status:'recorded',to:null},false),/no está configurado.*Copie el enlace/);
 assert.match(COPY.transactionalEmailNotice({mode:'mock',status:'recorded',to:null},true),/not configured.*Copy the link/);
 assert.match(COPY.transactionalEmailNotice({mode:'mock',status:'no_recipient',to:null},false,'customer'),/No hay un correo registrado/);
 assert.equal(COPY.transactionalEmailNotice(null,false),null);
 assert.equal(COPY.parseTransactionalEmailView({mode:'production',status:'queued'}),null);
 assert.equal(COPY.parseTransactionalEmailView({mode:'mock',status:'sent'}),null);
 assert.deepEqual(COPY.parseTransactionalEmailHeader('mock:recorded'),{mode:'mock',status:'recorded',to:null});
 assert.equal(COPY.parseTransactionalEmailHeader(null),null);
});
