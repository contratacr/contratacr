// Isolated PostgreSQL tests: never sends mail and never connects to production.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite }=await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db=new PGlite();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table profiles(id uuid primary key,email text,created_at timestamptz default now(),is_disabled boolean default false,role text default 'professional');
 create table professionals(id uuid primary key,profile_id uuid references profiles(id),is_verified boolean default false,verification_status text default 'pending',is_banned boolean default false);
 create table notifications(id uuid default gen_random_uuid(),user_id uuid,type text,title text,message text,data jsonb,created_at timestamptz default now());
 create table admin_campaign_sends(campana text,email text,status text,enviado_en timestamptz default now());
 create table email_bajas(correo text);
 create table email_cuota_diaria(dia date,nivel text,enviados int,primary key(dia,nivel));
 insert into profiles(id,email) values('${id(1)}','legacy@example.com');
 insert into professionals(id,profile_id) values('${id(1)}','${id(1)}');
 insert into notifications(user_id,type,created_at) values('${id(1)}','verification_outreach',now()-interval '60 days'),('${id(1)}','verification_outreach',now()-interval '30 days');`);
 await db.exec(await readFile(new URL('../supabase/migrations/245_correos_persistentes_y_verificacion.sql',import.meta.url),'utf8'));
 await db.exec("update email_delivery_rollout set started_at=now()-interval '3 days'");
 const plan=async n=>(await db.query('select verification_email_candidate($1) p',[id(n)])).rows[0].p;
 assert.equal((await plan(1)).reason,'historical_hold');
 await db.exec('delete from notifications');
 assert.equal((await plan(1)).reason,'historical_hold'); // Dismissing notifications cannot reset historical mail.
 for(let n=2;n<=12;n++){
  await db.query(`insert into profiles(id,email,created_at) values($1,$2,now()-interval '2 days')`,[id(n),`person${n}@example.com`]);
  await db.query('insert into professionals(id,profile_id) values($1,$1)',[id(n)]);
 }
 const enqueue=async(key,n,purpose='activity',seq=null,level='normal')=>(await db.query('select enqueue_email_delivery($1,$2,$3,$4,$5,$6,$7,$8,$9) id',
 [key,`person${n}@example.com`,'Example',purpose,level,{subject:'Example',htmlContent:'private'},null,seq?id(n):null,seq])).rows[0].id;
 const claim=async mail=>(await db.query('select claim_email_delivery($1) m',[mail])).rows[0].m;
 const finish=async(mail,outcome='accepted')=>(await db.query('select finish_email_delivery($1,$2,$3,$4,$5) ok',[mail.id,mail.attempt_token,outcome,outcome==='accepted'?`<${mail.id}@provider>`:null,'Test'])).rows[0].ok;
 const receipt=async mail=>(await db.query('select * from email_deliveries where id=$1',[mail])).rows[0];
 assert.equal((await plan(2)).sequence,1);
 const first=await enqueue('verification:2:1',2,'verification',1,'masivo');
 assert.equal(await enqueue('verification:2:1',2,'verification',1,'masivo'),first);
 const races=await Promise.all(Array.from({length:12},()=>claim(first)));
 assert.equal(races.filter(Boolean).length,1);
 assert.equal(await finish(races.find(Boolean)),true);
 assert.equal(await finish(races.find(Boolean)),false);
 assert.equal((await receipt(first)).payload,null);
 assert.equal((await receipt(first)).delivered_at,null);
 assert.equal((await db.query(`select count(*)::int n from notifications where user_id=$1`,[id(2)])).rows[0].n,1);
 assert.equal((await plan(2)).reason,'not_due');
 await db.query(`update email_deliveries set accepted_at=now()-interval '31 days' where id=$1`,[first]);
 assert.equal((await plan(2)).sequence,2);
 const second=await enqueue('verification:2:2',2,'verification',2,'masivo');
 await finish(await claim(second));
 await db.query('delete from notifications where user_id=$1',[id(2)]);
 assert.equal((await plan(2)).reason,'already_contacted');
 // No notice before acceptance, retries preserve one receipt and never increment success.
 const retry=await enqueue('retry',3);const attempt=await claim(retry);await finish(attempt,'retry');
 assert.equal((await receipt(retry)).status,'retry');assert.equal(await claim(retry),null);
 await db.query(`update email_deliveries set available_at=now() where id=$1`,[retry]);await finish(await claim(retry));
 assert.equal((await receipt(retry)).attempts,2);
 // Timeout/crash held. Webhook reconciliation is idempotent and counts once.
 const unknown=await enqueue('unknown',4);const lost=await claim(unknown);await finish(lost,'uncertain');
 assert.equal(await claim(unknown),null);
 for(let n=0;n<3;n++)await db.query('select record_email_delivery_event($1,$2,$3,$4)',[unknown,'person4@example.com','delivered','<lost@provider>']);
 assert.equal((await receipt(unknown)).status,'accepted');assert.ok((await receipt(unknown)).delivered_at);
 const crash=await enqueue('crash',5);await claim(crash);await db.query(`update email_deliveries set lease_until=now()-interval '1 minute' where id=$1`,[crash]);
 assert.equal(await claim(crash),null);assert.equal((await receipt(crash)).status,'uncertain');
 // Different events for the same person cannot dispatch simultaneously.
 const security=await enqueue('security',6,'security',null,'critico');const support=await enqueue('support',6,'support',null,'critico');
 const secureClaim=await claim(security);assert.ok(secureClaim);assert.equal(await claim(support),null);await finish(secureClaim);
 // Activity waits five minutes; promotion waits a day after transactional mail.
 const activity=await enqueue('activity',6);assert.equal(await claim(activity),null);
 const promo=await enqueue('promo',6,'campaign',null,'masivo');assert.equal(await claim(promo),null);
 // Campaign and verification use the same 14-day quiet period.
 await db.exec(`insert into admin_campaign_sends(campana,email,status) values('earlier','person7@example.com','sent')`);
 const verif=await enqueue('verification:7:1',7,'verification',1,'masivo');assert.equal(await claim(verif),null);
 assert.equal((await db.query('select count(*)::int n from notifications where user_id=$1',[id(7)])).rows[0].n,0);
 // Verified after enqueue: cancel before sending. Opt-outs and bounces apply at dispatch.
 const changed=await enqueue('verification:8:1',8,'verification',1,'masivo');await db.query('update professionals set is_verified=true where id=$1',[id(8)]);assert.equal(await claim(changed),null);assert.equal((await receipt(changed)).status,'cancelled');
 const optout=await enqueue('optout',9);await db.exec("insert into email_bajas values('person9@example.com')");assert.equal(await claim(optout),null);
 const expired=await enqueue('expired',10,'security',null,'critico');await db.query(`update email_deliveries set expires_at=now()-interval '1 second' where id=$1`,[expired]);assert.equal(await claim(expired),null);assert.equal((await receipt(expired)).payload,null);
 // Global reservations prevent concurrent sends from consuming the same last slot.
 await db.exec(`delete from email_cuota_diaria;insert into email_cuota_diaria values((now() at time zone 'UTC')::date,'normal',258)`);
 const cap1=await enqueue('cap1',11),cap2=await enqueue('cap2',12);const one=await claim(cap1);assert.ok(one);assert.equal(await claim(cap2),null);await finish(one);
 assert.equal((await db.query('select sum(enviados)::int n from email_cuota_diaria')).rows[0].n,259); // One additional slot remains reserved for the uncertain crash.
 await db.exec('set role authenticated');
 await assert.rejects(()=>db.query('select * from email_deliveries'));
 await assert.rejects(()=>db.query('select claim_email_delivery($1)',[cap2]));
 console.log('Email delivery: history retention, concurrent dedupe, acceptance vs delivery, safe retries, timeout holds, webhook reconciliation, 30-day verification cap, shared quiet periods, account changes, opt-outs, expiry, atomic quota and RLS passed.');
} finally {await db.close();}
