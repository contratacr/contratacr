// LOCAL PRO ONLY (pre-launch hardening 2026-11-17). In-process Postgres (PGlite), no network.
// Shared limiter docs/pro/sql/rate-limit-buckets-local.sql: fixed window from the first hit, denied hits do not count,
// window reset, retryAfter, input validation, pruning and service-role-only access. Real concurrency is checked
// against the loopback Supabase by verify-rate-limit-concurrency-local.mjs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
const sql=await readFile('docs/pro/sql/rate-limit-buckets-local.sql','utf8');
await db.exec(sql);await db.exec(sql);// idempotent re-apply
const key=n=>n.toString(16).padStart(64,'0');
const take=async(k=1,limit=3,windowMs=60000)=>(await db.query('select app_rate_limit_take($1,$2,$3) r',[key(k),limit,windowMs])).rows[0].r;
const row=async(k=1)=>(await db.query('select hits,window_ends_at from app_rate_limit_buckets where key=$1',[key(k)])).rows[0];
for(let i=0;i<3;i++)assert.deepEqual(await take(),{allowed:true,retryAfter:0});
const full=await row();assert.equal(full.hits,3);
const denied=await take();assert.equal(denied.allowed,false);assert.ok(denied.retryAfter>=59&&denied.retryAfter<=60,String(denied.retryAfter));
assert.deepEqual(await row(),full,'a denied hit neither counts nor extends the window');
assert.equal((await take(2)).allowed,true,'other keys are independent');
// Same key, larger limit for another action (pay-link view 60 vs write 10): the stored count is shared.
assert.equal((await take(1,4)).allowed,true);assert.equal((await take(1,4)).allowed,false);
// Window reset: an expired window starts again at 1 with a new end.
await db.query("update app_rate_limit_buckets set window_ends_at=clock_timestamp()-interval '1 millisecond' where key=$1",[key(1)]);
assert.deepEqual(await take(),{allowed:true,retryAfter:0});assert.equal((await row()).hits,1);
assert.ok(new Date((await row()).window_ends_at).getTime()>Date.now()+50000);
// retryAfter is whole seconds, at least 1.
await db.query("update app_rate_limit_buckets set hits=3,window_ends_at=clock_timestamp()+interval '200 milliseconds' where key=$1",[key(1)]);
assert.deepEqual(await take(),{allowed:false,retryAfter:1});
// Validation: raw values, bad limits/windows are refused (22023) and write nothing.
for(const args of [['203.0.113.1',3,60000],[key(9),0,60000],[key(9),100001,60000],[key(9),3,999],[key(9),3,86400001],[null,3,60000],[key(0xab).toUpperCase(),3,60000]])
 await assert.rejects(()=>db.query('select app_rate_limit_take($1,$2,$3)',args),e=>e.code==='22023',JSON.stringify(args));
assert.equal((await db.query('select count(*)::int n from app_rate_limit_buckets where key=$1',[key(9)])).rows[0].n,0);
await assert.rejects(()=>db.query('insert into app_rate_limit_buckets values($1,1,now())',['raw-ip']),e=>e.code==='23514');
// Browser roles cannot read counters, spend or prune.
for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);
 for(const q of ['select * from app_rate_limit_buckets',`select app_rate_limit_take('${key(1)}',3,60000)`,'select app_rate_limit_prune()',`delete from app_rate_limit_buckets`])
  await assert.rejects(()=>db.query(q),e=>e.code==='42501',role+': '+q);
 await db.exec('reset role');
}
await db.exec('set role service_role');assert.equal((await take(3)).allowed,true);await db.exec('reset role');
assert.equal((await db.query("select relrowsecurity from pg_class where relname='app_rate_limit_buckets'")).rows[0].relrowsecurity,true);
// Pruning: only windows expired for more than a minute.
await db.query("update app_rate_limit_buckets set window_ends_at=clock_timestamp()-interval '2 minutes' where key=$1",[key(2)]);
await db.query("update app_rate_limit_buckets set window_ends_at=clock_timestamp()-interval '10 seconds' where key=$1",[key(3)]);
assert.equal((await db.query('select app_rate_limit_prune() n')).rows[0].n,1);
assert.deepEqual((await db.query('select key from app_rate_limit_buckets order by key')).rows.map(r=>r.key),[key(1),key(3)]);
// A pruned key starts a fresh window.
await db.query('delete from app_rate_limit_buckets where key=$1',[key(1)]);assert.deepEqual(await take(),{allowed:true,retryAfter:0});
await db.close();
console.log('PASS shared rate limiter: fixed window, denied hits not counted, reset, retryAfter, validation (hashed keys only), RLS/service-role only, idempotent module, pruning');
