// Run: node --test scripts/directory/launch-email.test.mjs
// LOCAL PRO ONLY (directory launch e-mail, 2026-11-18). Pure unit tests with a FAKE fetch, no DB/network:
// mode gating (never network in mock/dev), sandbox rewrites the recipient, masking, idempotency, retries, rate limit,
// ES/EN template rendering (escaping, «why you got it» footer, code only in the claim e-mail).
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const src=new URL('../../src/',import.meta.url).href;
registerHooks({resolve(spec,ctx,next){
 if(spec==='server-only')return {url:'data:text/javascript,export{}',shortCircuit:true};
 if(spec==='@/lib/rate-limit')return {url:'data:text/javascript,'+encodeURIComponent('export async function enforceRateLimitKey(){throw new Error("no db in unit tests")}'),shortCircuit:true};
 if(spec.startsWith('@/'))return next(src+spec.slice(2)+(/\.[a-z]+$/i.test(spec)?'':'.ts'),ctx);
 if(ctx.parentURL?.startsWith(src)&&spec.startsWith('.')&&!/\.[a-z]+$/i.test(spec))return next(spec+'.ts',ctx);
 return next(spec,ctx);
}});
const P=await import('../../src/lib/email/provider.ts');
const L=await import('../../src/lib/directory/launch-email.ts');

const fakeFetch=(responses=[{status:200,body:{id:'re_1'}}])=>{const calls=[];let i=0;
 const f=async(url,init)=>{calls.push({url,init});const r=responses[Math.min(i++,responses.length-1)];if(r.throw)throw new Error('net');return {status:r.status,ok:r.status<300,json:async()=>r.body??{}};};
 return {f,calls};};
const key='re_unit_test_key';
const live={NODE_ENV:'production',EMAIL_PROVIDER:'resend',EMAIL_MODE:'live',RESEND_API_KEY:key,EMAIL_FROM:'ContrataCR <avisos@contratacr.com>'};
const quiet={log:()=>{},allowRecipient:async()=>true,sleep:async()=>{}};
const mail=(k='k1')=>({to:'isaac.rojas@gmail.com',subject:'S',html:'<p>x</p>',text:'x',idempotencyKey:`dir:test:${k}`});

test('mode gating: mock by default; live only with EMAIL_MODE=live + production + key + from',()=>{
 assert.equal(P.resolveEmailMode({}),'mock');
 assert.equal(P.resolveEmailMode({NODE_ENV:'development'}),'mock');
 assert.equal(P.resolveEmailMode({...live,NODE_ENV:'development'}),'mock');
 assert.equal(P.resolveEmailMode({...live,RESEND_API_KEY:''}),'mock');
 assert.equal(P.resolveEmailMode({...live,EMAIL_FROM:''}),'mock');
 assert.equal(P.resolveEmailMode({...live,EMAIL_PROVIDER:'ses'}),'mock');
 assert.equal(P.resolveEmailMode({...live,EMAIL_MODE:'LIVE'}),'mock');
 assert.equal(P.resolveEmailMode({...live,EMAIL_MODE:undefined}),'mock');
 assert.equal(P.resolveEmailMode(live),'live');
 assert.equal(P.resolveEmailMode({...live,NODE_ENV:'development',EMAIL_MODE:'sandbox'}),'sandbox');
});

test('mock/dev never touches the network (fake fetch is never called)',async()=>{
 const {f,calls}=fakeFetch();const outbox=[];
 for(const env of [{},{NODE_ENV:'development',EMAIL_PROVIDER:'resend',RESEND_API_KEY:key},{...live,NODE_ENV:'development'}]){
  const provider=P.emailProviderFor(env,{fetch:f,outbox});assert.equal(provider.mode,'mock');
  P.resetEmailDispatchMemory();const r=await P.dispatchEmail(mail(),{...quiet,provider});assert.equal(r.ok,true);
 }
 assert.equal(calls.length,0);assert.equal(outbox.length,1,'mock outbox dedupes the same idempotency key');
});

test('sandbox calls Resend but only to the Resend test inbox; live uses the real address + Idempotency-Key',async()=>{
 const {f,calls}=fakeFetch();P.resetEmailDispatchMemory();
 await P.dispatchEmail(mail('s'),{...quiet,provider:P.emailProviderFor({EMAIL_PROVIDER:'resend',EMAIL_MODE:'sandbox',RESEND_API_KEY:key},{fetch:f})});
 const sb=JSON.parse(calls[0].init.body);assert.deepEqual(sb.to,['delivered@resend.dev']);assert.equal(calls[0].url,'https://api.resend.com/emails');
 await P.dispatchEmail(mail('l'),{...quiet,provider:P.emailProviderFor(live,{fetch:f})});
 assert.deepEqual(JSON.parse(calls[1].init.body).to,['isaac.rojas@gmail.com']);
 assert.equal(calls[1].init.headers['Idempotency-Key'],'dir:test:l');assert.equal(calls[1].init.headers.Authorization,`Bearer ${key}`);
});

test('idempotency: same key is sent once per process; 409 counts as duplicate',async()=>{
 const {f,calls}=fakeFetch([{status:200},{status:409}]);P.resetEmailDispatchMemory();
 const provider=P.emailProviderFor(live,{fetch:f});
 assert.equal((await P.dispatchEmail(mail('x'),{...quiet,provider})).status,'sent');
 assert.equal((await P.dispatchEmail(mail('x'),{...quiet,provider})).status,'duplicate');
 assert.equal(calls.length,1);
 assert.equal((await P.dispatchEmail(mail('y'),{...quiet,provider})).status,'duplicate');
});

test('retries 5xx/429/network with backoff, not 4xx; rate limit blocks before network',async()=>{
 const sleeps=[];P.resetEmailDispatchMemory();
 let {f,calls}=fakeFetch([{throw:true},{status:503},{status:200}]);
 const r=await P.dispatchEmail(mail('r'),{...quiet,sleep:async ms=>{sleeps.push(ms);},provider:P.emailProviderFor(live,{fetch:f})});
 assert.equal(r.ok,true);assert.equal(calls.length,3);assert.deepEqual(sleeps,[500,1000]);
 ({f,calls}=fakeFetch([{status:422}]));
 assert.equal((await P.dispatchEmail(mail('r2'),{...quiet,provider:P.emailProviderFor(live,{fetch:f})})).ok,false);assert.equal(calls.length,1);
 ({f,calls}=fakeFetch());
 assert.equal((await P.dispatchEmail(mail('r3'),{...quiet,allowRecipient:async()=>false,provider:P.emailProviderFor(live,{fetch:f})})).status,'rate_limited');
 // limiter store down → fail closed
 assert.equal((await P.dispatchEmail(mail('r4'),{log:()=>{},provider:P.emailProviderFor(live,{fetch:f})})).status,'rate_limited');
 assert.equal(calls.length,0);
});

test('masking: logs carry masked address, never the code or full address',async()=>{
 assert.equal(P.maskEmail('isaac.rojas@gmail.com'),'is***@g***.com');assert.equal(P.maskEmail('a@b.cr'),'***@b***.cr');assert.equal(P.maskEmail('nope'),'***');
 const lines=[];P.resetEmailDispatchMemory();const {f}=fakeFetch();
 await L.sendLaunchEmail({kind:'claim_code',locale:'es',to:'isaac.rojas@gmail.com',eventId:'c1',data:{code:'482913'}},{...quiet,log:l=>lines.push(JSON.stringify(l)),provider:P.emailProviderFor(live,{fetch:f})});
 const all=lines.join('\n');assert.ok(all.includes('is***@g***.com'));assert.ok(!all.includes('isaac.rojas'));assert.ok(!all.includes('482913'));
});

test('templates ES/EN: escaping, why-you-got-it footer, code only in claim, no unsubscribe on transactional',()=>{
 const es=L.renderLaunchEmail('reservation_confirmed','es',{placeName:'Soda <b>Tica</b>',reference:'R-1',day:'2026-12-01',time:'19:00',partySize:4,link:'https://contratacr.com/reserva/t'});
 assert.match(es.subject,/Confirmada/);assert.ok(es.html.includes('Soda &lt;b&gt;Tica&lt;/b&gt;'));assert.ok(!es.html.includes('<b>Tica'));
 assert.match(es.text,/Recibe este correo porque hizo una reserva/);assert.ok(!/baja/i.test(es.text));assert.match(es.html,/lang="es"/);
 const en=L.renderLaunchEmail('waitlist_ready','en',{placeName:'Café',reference:'W-2'});
 assert.match(en.subject,/ready/);assert.match(en.text,/joined the waitlist/);
 const claim=L.renderLaunchEmail('claim_code','en',{code:'123456'});assert.ok(claim.html.includes('123456')&&claim.text.includes('123456'));
 assert.ok(!es.text.match(/\b\d{6}\b/));
 const bad=L.renderLaunchEmail('reservation_received','es',{link:'javascript:alert(1)',reference:'x'});assert.ok(!bad.html.includes('javascript:'));
 for(const k of ['claim_code','reservation_received','reservation_confirmed','reservation_changed','reservation_declined','reservation_cancelled_business','waitlist_ready','waitlist_left_business'])
  for(const loc of ['es','en']){const m=L.renderLaunchEmail(k,loc,{reference:'R'});assert.ok(m.subject&&m.text.includes('ContrataCR'),k+loc);}
});

test('brevo (2026-11-19): reuses the app Brevo key; live only in production; sandbox sets the drop flag',async()=>{
 const blive={NODE_ENV:'production',EMAIL_PROVIDER:'brevo',EMAIL_MODE:'live',BREVO_API_KEY:'xkeysib-unit'};
 assert.equal(P.resolveEmailMode(blive),'live');
 assert.equal(P.resolveEmailMode({...blive,NODE_ENV:'development'}),'mock');
 assert.equal(P.resolveEmailMode({...blive,BREVO_API_KEY:''}),'mock');
 assert.equal(P.resolveEmailMode({...blive,EMAIL_MODE:'sandbox',NODE_ENV:'development'}),'sandbox');
 const calls=[];const brevoSend=async o=>{calls.push(o);return calls.length===1?{ok:true,status:'sent',detail:null}:{ok:false,status:'queued',detail:null};};
 const live=P.emailProviderFor(blive,{brevoSend});assert.equal(live.name,'brevo');
 const r1=await P.dispatchEmail({...mail('b1'),tags:{kind:'claim_code'}},{...quiet,provider:live});
 assert.deepEqual([r1.ok,r1.status],[true,'sent']);
 assert.equal(calls[0].to,'isaac.rojas@gmail.com');assert.equal(calls[0].eventKey,'dir:test:b1');assert.equal(calls[0].purpose,'security');assert.equal(calls[0].sandbox,false);
 const r2=await P.dispatchEmail(mail('b2'),{...quiet,provider:live});
 assert.deepEqual([r2.ok,r2.status],[true,'recorded']);assert.equal(calls.length,2,'queued is not retried here: the outbox retries');
 const sb=P.emailProviderFor({...blive,EMAIL_MODE:'sandbox',NODE_ENV:'test'},{brevoSend});
 await P.dispatchEmail(mail('b3'),{...quiet,provider:sb});assert.equal(calls[2].sandbox,true);
 const failing=P.emailProviderFor(blive,{brevoSend:async()=>({ok:false,status:'skipped',detail:'x'})});
 const r4=await P.dispatchEmail(mail('b4'),{...quiet,provider:failing});assert.equal(r4.ok,false);
});
