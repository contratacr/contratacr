// LOCAL PRO ONLY (pre-launch hardening 2026-11-17). In-process Postgres (PGlite), no network.
// hasProAccess (src/lib/pro/access.ts) must decide exactly like SQL public.pro_entitled
// (docs/pro/sql/pro-entitled-draft.sql) for every combination of role, disabled, provider, grant and ban.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const {hasProAccess}=await import('../../src/lib/pro/access.ts');
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create table profiles(id uuid primary key,role text not null,is_disabled boolean,is_provider boolean);
create table pro_memberships(user_id uuid primary key,status text not null,expires_at timestamptz);
create table professionals(id uuid primary key default gen_random_uuid(),profile_id uuid not null,is_banned boolean);
create table pro_audit(actor uuid,subject uuid,action text,detail jsonb);`);
await db.exec(await readFile('docs/pro/sql/pro-entitled-draft.sql','utf8'));
const day=86400000,grants=[null,{status:'active',expires_at:null},{status:'active',expires_at:new Date(Date.now()+day).toISOString()},
 {status:'active',expires_at:new Date(Date.now()-day).toISOString()},{status:'inactive',expires_at:null},{status:'cancelled',expires_at:new Date(Date.now()+day).toISOString()}];
let n=0,banned=0;
for(const role of ['admin','professional','client'])for(const is_disabled of [null,false,true])for(const is_provider of [null,false,true])
for(const grant of grants)for(const ban of ['none',false,true,null]){
 const id=randomUUID();
 await db.query('insert into profiles values($1,$2,$3,$4)',[id,role,is_disabled,is_provider]);
 if(grant)await db.query('insert into pro_memberships values($1,$2,$3)',[id,grant.status,grant.expires_at]);
 if(ban!=='none')await db.query('insert into professionals(profile_id,is_banned) values($1,$2)',[id,ban]);
 const sql=(await db.query('select pro_entitled($1) ok',[id])).rows[0].ok;
 // The TS callers read the flag with proBannedFlag: no row or null → false, true → true.
 const ts=hasProAccess({role,is_disabled,is_provider},grant,ban===true);
 assert.equal(ts,sql,JSON.stringify({role,is_disabled,is_provider,grant,ban}));
 n++;if(ban===true)banned++;
}
await db.close();
console.log(`PASS hasProAccess == SQL pro_entitled in ${n} combinations (${banned} with a banned professional row, all refused)`);
