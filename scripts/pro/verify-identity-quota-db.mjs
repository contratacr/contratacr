import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
await db.exec(await readFile('docs/pro/sql/identity-lookup-local.sql','utf8'));
const token=n=>n.toString(16).padStart(64,'0');
const take=async(account=1,ip=2)=>(await db.query('select pro_identity_quota_take($1,$2) result',[token(account),token(ip)])).rows[0].result;
const snapshot=async()=>(await db.query('select * from pro_identity_quota order by key')).rows;
assert.equal((await take()).allowed,true);
for(let i=0;i<4;i++)assert.equal((await take()).allowed,true);
const before=await snapshot();assert.deepEqual(await take(),{allowed:false,retryAfter:1});assert.deepEqual(await snapshot(),before);
await db.exec("update pro_identity_quota set expires_at=now()-interval '1 second' where key='global:second'");
assert.equal((await take()).allowed,true);
// Separate processes share the same SQL state; do not use process memory for limits.
for(let i=0;i<14;i++){await db.exec("update pro_identity_quota set expires_at=now()-interval '1 second' where key='global:second'");assert.equal((await take()).allowed,true);}
const accountLimited=await snapshot();assert.equal((await take()).allowed,false);assert.deepEqual(await snapshot(),accountLimited);
await db.exec("update pro_identity_quota set expires_at=now()-interval '1 second' where key like 'account:%' or key='global:second'");
assert.equal((await take()).allowed,true);
for(const [key,hits] of [['ip:'+token(2),60],['global:minute',100]]){
 await db.query('update pro_identity_quota set hits=$1 where key=$2',[hits,key]);
 const prior=await snapshot();assert.equal((await take(3)).allowed,false);assert.deepEqual(await snapshot(),prior);
 await db.query('update pro_identity_quota set hits=1 where key=$1',[key]);
}
// Direct browser roles cannot access counters, spend quotas or erase evidence.
for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);
 for(const query of ['select * from pro_identity_quota',"select pro_identity_quota_take('"+token(1)+"','"+token(2)+"')",'select pro_identity_quota_prune()'])await assert.rejects(()=>db.query(query),error=>error.code==='42501');
 await db.exec('reset role');
}
await assert.rejects(()=>db.query('select pro_identity_quota_take($1,$2)',['raw-account',token(2)]),error=>error.code==='22023');
await db.exec("update pro_identity_quota set expires_at=now()-interval '1 second';select pro_identity_quota_prune()");assert.deepEqual(await snapshot(),[]);
await db.close();console.log('PASS shared quota scopes, atomic denials, expiration, pruning, input validation and RLS/RPC restrictions');
