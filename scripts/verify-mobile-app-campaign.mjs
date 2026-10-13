import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite }=await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db=new PGlite();let checks=0;
const id='00000000-0000-4000-8000-000000000001',key='descargar-app-2026';
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table profiles(id uuid primary key,email text,is_disabled boolean default false);
 create table email_bajas(correo text);
 create table admin_campaign_sends(campana text,email text,status text,profile_id uuid,enviado_en timestamptz default now(),rebote_en timestamptz,unique(campana,email),unique(campana,profile_id));
 create table notification_once_receipts(user_id uuid,sent_at timestamptz);
 create table email_cuota_diaria(dia date,enviados int);
 create table app_usage_events(viewer_user_id uuid,runtime text);
 create table user_push_tokens(user_id uuid,platform text,is_active boolean);
 create table interaction_events(viewer_user_id uuid,metadata jsonb);
 create table app_registration_sources(user_id uuid,runtime text);
 insert into profiles(id,email) values('${id}','person@example.com');`);
 const migration=await readFile(new URL('../supabase/migrations/240_campana_app_sin_uso_movil.sql',import.meta.url),'utf8');
 await db.exec(migration);await db.exec(migration);checks++;
 const claim=()=>db.query('select claim_outreach_email($1,$2) ok',[key,'person@example.com']);
 assert.equal((await claim()).rows[0].ok,true);assert.equal((await claim()).rows[0].ok,false);checks+=2;
 await db.exec('delete from admin_campaign_sends');
 for(const [table,sql] of [
  ['app_usage_events',`insert into app_usage_events values('${id}','ios')`],
  ['user_push_tokens',`insert into user_push_tokens values('${id}','android',false)`],
  ['interaction_events',`insert into interaction_events values('${id}','{"platform":"native"}')`],
  ['app_registration_sources',`insert into app_registration_sources values('${id}','native_unknown')`],
 ]) {
  await db.exec(sql);
  assert.equal((await db.query('select has_used_mobile_app($1) used',[id])).rows[0].used,true);
  assert.equal((await claim()).rows[0].ok,false);
  assert.equal((await db.query('select * from get_mobile_usage_accounts()')).rows.length,1);checks+=3;
  await db.exec(`delete from ${table}`);
 }
 await db.exec(`insert into user_push_tokens values('${id}','web',true)`);
 assert.equal((await db.query('select has_used_mobile_app($1) used',[id])).rows[0].used,false);checks++;
 await db.exec(`insert into admin_campaign_sends(campana,email,profile_id,status,enviado_en) values('reviews','person@example.com','${id}','sent',now()-interval '13 days')`);
 assert.equal((await claim()).rows[0].ok,false);checks++;
 await db.exec(`update admin_campaign_sends set enviado_en=now()-interval '14 days'`);
 assert.equal((await claim()).rows[0].ok,true);checks++;
 await db.exec(`update admin_campaign_sends set status='sent',enviado_en=now()-interval '30 days';update profiles set email='new@example.com'`);
 assert.equal((await db.query('select claim_outreach_email($1,$2) ok',[key,'new@example.com'])).rows[0].ok,false);checks++;
 await db.exec(`delete from admin_campaign_sends;insert into email_cuota_diaria values((now() at time zone 'UTC')::date,250)`);
 assert.equal((await db.query('select claim_outreach_email($1,$2) ok',[key,'new@example.com'])).rows[0].ok,false);checks++;
 await db.exec('set role authenticated');
 await assert.rejects(()=>db.query('select * from get_mobile_usage_accounts()'));await assert.rejects(()=>db.query('select has_used_mobile_app($1)',[id]));checks+=2;
 console.log(`${checks} checks passed: historical mobile evidence, once across email changes, shared cooldown/quota and RPC permissions.`);
}finally{await db.close();}
