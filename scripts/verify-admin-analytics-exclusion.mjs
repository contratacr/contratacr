import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
const admin='00000000-0000-4000-8000-000000000001',client='00000000-0000-4000-8000-000000000002';
const session='00000000-0000-4000-8000-000000000003',screen='00000000-0000-4000-8000-000000000004';
const hash=id=>createHash('sha256').update(id).digest('hex');
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table profiles(id uuid primary key,role text,created_at timestamptz default now(),full_name text);
 create table interaction_events(viewer_user_id uuid,event_type text,metadata jsonb,created_at timestamptz default now());
 create table growth_conversion_events(actor_hash text,action text,attribution jsonb,payload jsonb,is_baseline boolean default false,created_at timestamptz default now());
 insert into profiles(id,role) values('${admin}','admin'),('${client}','client');`);
 await db.exec(await readFile(new URL('../supabase/migrations/239_uso_web_android_ios.sql',import.meta.url),'utf8'));
 await db.query('insert into interaction_events(viewer_user_id,event_type) values($1,$3),($2,$3)',[admin,client,'profile_view']);
 await db.query('insert into growth_conversion_events(actor_hash,action) values($1,$3),($2,$3)',[hash(admin),hash(client),'project_published']);
 const migration=await readFile(new URL('../supabase/migrations/241_excluir_actividad_admin.sql',import.meta.url),'utf8');
 await db.exec(migration);await db.exec(migration);
 assert.equal((await db.query('select count(*)::int n from excluded_admin_analytics')).rows[0].n,2);
 for (const runtime of ['web','android','ios']) {
  const write=id=>db.query('select record_app_usage($1,$2,$3,$4,$5,$6,$7,true)',['guest',id,session,screen,runtime,'/buscar','']);
  await write(null);await write(admin);await write(admin);
  assert.equal((await db.query('select count(*)::int n from app_usage_events where runtime=$1',[runtime])).rows[0].n,0);
  await write(client);
  assert.equal((await db.query('select count(*)::int n from app_usage_events where viewer_user_id=$1',[client])).rows[0].n,runtime==='web'?3:runtime==='android'?7:11);
  // Independent guest session is removed, client history is retained.
 }
 await db.query('insert into interaction_events(viewer_user_id,event_type) values($1,$2)',[admin,'whatsapp_click']);
 await db.query('insert into growth_conversion_events(actor_hash,action) values($1,$2)',[hash(admin),'service_contact']);
 await db.query('select record_registration_platform($1,$2)',[admin,'ios']);
 assert.equal((await db.query('select count(*)::int n from interaction_events')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from growth_conversion_events')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from app_registration_sources where user_id=$1',[admin])).rows[0].n,0);
 await db.query("update profiles set role='admin' where id=$1",[client]);
 for(const table of ['interaction_events','app_usage_events','app_registration_sources','growth_conversion_events'])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0);
 await db.exec('set role authenticated');
 await assert.rejects(()=>db.query('select * from excluded_admin_analytics'));
 await assert.rejects(()=>db.query('select exclude_admin_analytics($1)',[admin]));
 console.log('Admin exclusion passed: historic archive, repeat migration, web/Android/iOS, guest sign-in, ordinary users, direct inserts, promotion and private archive.');
} finally { await db.close(); }
