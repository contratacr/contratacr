// Only loopback; synthetic quota tokens, no people or Hacienda requests.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries((await readFile('.env.test','utf8')).split('\n').filter(line=>line.includes('=')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY),account=randomBytes(32).toString('hex'),ip=randomBytes(32).toString('hex'),keys=['account:'+account,'ip:'+ip];
try{
 await db.from('pro_identity_quota').insert({key:keys[0],hits:19,expires_at:new Date(Date.now()+600000).toISOString()}).throwOnError();
 const replies=await Promise.all([1,2].map(()=>db.rpc('pro_identity_quota_take',{p_account:account,p_ip:ip}).throwOnError()));
 assert.equal(replies.filter(reply=>reply.data.allowed).length,1);
 assert.equal((await db.from('pro_identity_quota').select('hits').eq('key',keys[0]).single().throwOnError()).data.hits,20);
 const anon=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
 assert.ok((await anon.rpc('pro_identity_quota_take',{p_account:account,p_ip:ip})).error);
 console.log('PASS real local concurrent quota boundary, service RPC and anonymous denial; no external requests');
}finally{await db.from('pro_identity_quota').delete().in('key',keys).throwOnError();}
