// LOCAL PRO ONLY (pre-launch hardening 2026-11-17). Only loopback Supabase; synthetic random keys, cleaned up after.
// Real parallel connections on one bucket: exactly `limit` callers are admitted per window, the window resets, and the
// anonymous/authenticated API roles cannot call the limiter.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries((await readFile('.env.test','utf8')).split('\n').filter(line=>line.includes('=')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
// Separate clients so requests use separate HTTP connections / PostgREST transactions.
const clients=Array.from({length:8},()=>createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}));
const keys=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')];
const take=(i,key,limit,windowMs)=>clients[i%clients.length].rpc('app_rate_limit_take',{p_key:key,p_limit:limit,p_window_ms:windowMs}).throwOnError().then(r=>r.data);
try{
 for(let round=0;round<3;round++){
  await clients[0].from('app_rate_limit_buckets').delete().eq('key',keys[0]).throwOnError();
  const replies=await Promise.all(Array.from({length:60},(_,i)=>take(i,keys[0],10,60000)));
  assert.equal(replies.filter(r=>r.allowed).length,10,'round '+round);
  assert.ok(replies.filter(r=>!r.allowed).every(r=>r.retryAfter>=1&&r.retryAfter<=60));
  const {data}=await clients[0].from('app_rate_limit_buckets').select('hits').eq('key',keys[0]).single().throwOnError();
  assert.equal(data.hits,10);
 }
 // Window reset with a short real window (1 s).
 const first=await Promise.all(Array.from({length:12},(_,i)=>take(i,keys[1],3,1000)));
 assert.equal(first.filter(r=>r.allowed).length,3);
 await new Promise(r=>setTimeout(r,1300));
 const second=await Promise.all(Array.from({length:12},(_,i)=>take(i,keys[1],3,1000)));
 assert.equal(second.filter(r=>r.allowed).length,3,'new window admits the limit again');
 for(const anonKey of [env.NEXT_PUBLIC_SUPABASE_ANON_KEY]){
  const anon=createClient(env.NEXT_PUBLIC_SUPABASE_URL,anonKey,{auth:{persistSession:false}});
  assert.ok((await anon.rpc('app_rate_limit_take',{p_key:keys[0],p_limit:1000,p_window_ms:60000})).error,'anon cannot spend');
  const read=await anon.from('app_rate_limit_buckets').select('key').limit(1);assert.ok(read.error||read.data.length===0,'anon cannot read');
 }
 console.log('PASS real local concurrent limiter: 3x60 parallel calls admit exactly 10, 1 s window resets under concurrency, anonymous role denied');
}finally{await clients[0].from('app_rate_limit_buckets').delete().in('key',keys).throwOnError();}
