/** Disposable in-memory PostgreSQL only (PGlite). Applies the shipped migration order twice: existing directory migrations, then the Pro migrations 292+. */
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {ALREADY_MIGRATED,FIRST_NUMBER} from './build-pro-migrations.mjs';
const root=new URL('../../',import.meta.url),db=new PGlite(),owner='00000000-0000-4000-8000-000000000001';
const foundation=await readFile(new URL('scripts/pro/verify-direct-project-quotes-db.mjs',root),'utf8');
const begin=foundation.indexOf('await db.exec(`')+'await db.exec(`'.length,end=foundation.indexOf('`);',begin);
const ddl=foundation.slice(begin,end);assert.ok(begin>14&&end>begin&&!ddl.includes('${'));
await db.exec(ddl);
await db.exec(`create table auth.users(id uuid primary key);create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
 create function auth.role() returns text language sql as $$select current_user::text$$;
 create table projects(id uuid primary key,client_id uuid,title text,status text,allow_direct_contact boolean);
 create schema cron;create table cron.job(jobname text primary key,schedule text,command text);
 create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint language plpgsql as $$begin insert into cron.job values(p_name,p_schedule,p_command) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command;return 1;end$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);alter table storage.objects enable row level security;
 insert into profiles(id,full_name,role,is_disabled,is_provider) values('${owner}','Fixture','professional',false,true);`);
const notifications=await readFile(new URL('supabase/migrations/002_sprint2.sql',root),'utf8');
await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS public.notifications'),notifications.indexOf('-- SAVED PROFESSIONALS')));
const all=(await readdir(new URL('supabase/migrations/',root))).sort();
const existing=Object.values(ALREADY_MIGRATED).sort((a,b)=>parseInt(a)-parseInt(b));
const pro=all.filter(n=>/^\d+_pro_\d\d_/.test(n)&&parseInt(n)>=FIRST_NUMBER);
assert.ok(pro.length>0);
async function run(list,label){for(const name of list){let text=await readFile(new URL('supabase/migrations/'+name,root),'utf8');
 text=text.replace('create extension if not exists pg_cron;','');
 try{await db.exec(text);}catch(e){throw new Error(label+' failed: '+name+': '+e.message,{cause:e});}}}
await run(existing,'existing');
await run(pro,'pro pass 1');
const count=async()=>Number((await db.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n);
const fns=async()=>Number((await db.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")).rows[0].n);
const t1=await count(),f1=await fns();
await run(pro,'pro pass 2 (idempotency)');
assert.equal(await count(),t1);assert.equal(await fns(),f1);
// Security contract: no Pro table is readable by anon directly.
const pt=(await db.query("select table_name from information_schema.tables where table_schema='public' and table_name like 'pro\\_%' and table_type='BASE TABLE'")).rows.map(r=>r.table_name);
assert.ok(pt.length>50,'expected many pro tables, got '+pt.length);
console.log(`PASS: ${existing.length} existing + ${pro.length} Pro migrations applied twice; ${t1} public tables, ${f1} functions, ${pt.length} pro_* tables.`);
