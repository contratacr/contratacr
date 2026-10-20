import assert from 'node:assert/strict';
import fs from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,full_name text,role text);
 create table app_usage_events(event_key text primary key,event_type text,created_at timestamptz default now(),viewer_user_id uuid,visitor_hash text,runtime text,path text,tab text);
 create table growth_conversion_events(event_id text primary key,status text,is_baseline boolean default false,created_at timestamptz default now());
 create table interaction_events(id uuid primary key,event_type text,created_at timestamptz default now(),viewer_user_id uuid,visitor_hash text,metadata jsonb,source text);
 `);
 await db.exec(fs.readFileSync('supabase/migrations/249_recorridos_sin_contenido_privado.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/250_estado_de_entregas_meta.sql','utf8'));
 const exclusion=fs.readFileSync('supabase/migrations/241_excluir_actividad_admin.sql','utf8');
 await db.exec(exclusion.slice(exclusion.indexOf('create or replace function public.skip_admin_analytics()'),exclusion.indexOf('revoke all on function public.skip_admin_analytics()')));
 await db.exec(fs.readFileSync('supabase/migrations/251_privacidad_y_exclusion_de_recorridos.sql','utf8'));
 await db.exec("insert into growth_conversion_events(event_id,status) values('web','sent'),('app','browser_only');");
 assert.deepEqual((await db.query('select admin_meta_delivery() as counts')).rows[0].counts,{sent:1,browser_only:1});
 const user='00000000-0000-4000-8000-000000000001',admin='00000000-0000-4000-8000-000000000002';
 await db.query('insert into profiles values($1,$2,$3),($4,$5,$6)',[user,'Cuenta de prueba','client',admin,'Administrador','admin']);
 for(let i=0;i<60;i++) await db.query(`insert into app_journey_events(event_id,action,target,section,viewer_user_id,visitor_hash,runtime,created_at) values($1,'button','action','home',$2,'visitor','android','2026-10-20T00:00:00Z')`,[`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,i===59?admin:i===58?null:user]);
 // Fixed evaluation clock is unnecessary: use 90 days around the test run date.
 await db.exec("update app_journey_events set created_at=date_trunc('second',now())");
 const page=async(before=new Date(Date.now()+60000).toISOString(),key='~',actor='',runtime='')=>(await db.query('select admin_activity_journey(90,$1,$2,$3,$4) as events',[runtime,actor,before,key])).rows[0].events;
 const first=await page();assert.equal(first.length,51);assert.ok(first.every(x=>x.viewer_user_id!==admin));
 const second=await page(first[49].created_at,first[49].key);assert.equal(second.length,9);assert.equal(new Set([...first.slice(0,50),...second].map(x=>x.key)).size,59);
 assert.equal((await page(undefined,undefined,'visitor')).length,51);assert.equal((await page(undefined,undefined,'','ios')).length,0);
 await db.query(`insert into interaction_events values('10000000-0000-4000-8000-000000000001','search_performed',now(),$1,'visitor','{"q":"limpieza","message":"private","email":"private@example.com"}','search')`,[user]);
 const search=(await page()).find(x=>x.event==='search_performed');assert.equal(search.details.q,'limpieza');assert.equal(search.details.message,undefined);assert.equal(search.details.email,undefined);
 await db.query('delete from profiles where id=$1',[user]);assert.equal((await db.query('select count(*)::int as n from app_journey_events where viewer_user_id=$1',[user])).rows[0].n,0);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from app_journey_events'));await assert.rejects(db.query('select admin_activity_journey()'));await assert.rejects(db.query('select admin_meta_delivery()'));
 console.log('Journey SQL passed: admin exclusion, guest/account routes, platform filters, tied-timestamp pagination, private metadata filtering, RLS and RPC grants.');
} finally { await db.close(); }
