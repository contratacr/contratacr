import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',coalesce(nullif(current_setting('test.aal',true),''),'aal1')) $$;
 create table auth.mfa_factors(user_id uuid,factor_type text,status text);
 create table public.profiles(id uuid,role text,is_disabled boolean default false);`);
 const migration = await readFile(new URL('../supabase/migrations/253_conservar_mfa_administradores.sql',import.meta.url),'utf8');
 await db.exec(migration);await db.exec(migration);
 const allowed = async () => (await db.query('select public.session_mfa_satisfied() as allowed')).rows[0].allowed;
 assert.equal(await allowed(),true);
 for (const role of ['admin','client','professional']) {
  const id='00000000-0000-4000-8000-000000000001';
  await db.exec(`truncate auth.mfa_factors,profiles; insert into profiles(id,role) values ('${id}','${role}');select set_config('test.uid','${id}',false);select set_config('test.aal','aal1',false);`);
  assert.equal(await allowed(),role !== 'admin');
  await db.exec(`insert into auth.mfa_factors values ('${id}','totp','unverified')`);
  assert.equal(await allowed(),role !== 'admin');
  await db.exec(`update auth.mfa_factors set status='verified'`);
  assert.equal(await allowed(),false);
  await db.exec(`select set_config('test.aal','aal2',false)`);
  assert.equal(await allowed(),true);
  await db.exec(`delete from auth.mfa_factors;select set_config('test.aal','aal1',false)`);
  assert.equal(await allowed(),role !== 'admin');
 }
 assert.equal((await db.query("select has_function_privilege('authenticated','public.session_mfa_satisfied()','execute') as allowed")).rows[0].allowed,true);
 console.log('MFA SQL passed: mandatory admin, optional ordinary accounts, admin/client/professional enrollment, pending setup, AAL1 rejection with verified factor, AAL2, removal, anonymous policy and repeat migration. No real factors changed.');
} finally { await db.close(); }
