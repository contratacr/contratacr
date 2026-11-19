// Run: node --test scripts/pro/hardening.test.mjs
// LOCAL PRO ONLY (pre-launch hardening 2026-11-17). Pure unit tests, no DB/network: the Supabase admin client is a mock.
// Covers: src/lib/rate-limit.ts (hashed keys, 429/503 answers, fail-open/closed policy, dev-only test namespace),
// src/lib/security/local-dev-secrets.ts (required secrets, deterministic dev fallback, production refusal) and
// src/lib/pro/access.ts (ban check mirrored from SQL pro_entitled).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';

const src=new URL('../../src/',import.meta.url).href;
const mockAdmin='data:text/javascript,'+encodeURIComponent('export function createAdminClient(){return globalThis.__rateLimitMock;}');
registerHooks({resolve(spec,ctx,next){
 if(spec==='@/lib/supabase/admin')return {url:mockAdmin,shortCircuit:true};
 if(spec.startsWith('@/'))return next(src+spec.slice(2)+(/\.[a-z]+$/i.test(spec)?'':'.ts'),ctx);
 if(ctx.parentURL?.startsWith(src)&&spec.startsWith('.')&&!/\.[a-z]+$/i.test(spec))return next(spec+'.ts',ctx);
 return next(spec,ctx);
}});

const calls=[];let reply={data:{allowed:true,retryAfter:0},error:null};
globalThis.__rateLimitMock={rpc(name,args){calls.push({name,args});return {abortSignal:async()=>{if(reply instanceof Error)throw reply;return reply;}};}};
process.env.RATE_LIMIT_PEPPER='unit-test-pepper-unit-test-pepper-0123456789';
const RL=await import('../../src/lib/rate-limit.ts');
const req=(headers={})=>new Request('http://localhost/api/x',{headers});
const env=process.env;

test('keys reach the store only as an HMAC (never the raw IP or user id) with the route limits unchanged',async()=>{
 calls.length=0;reply={data:{allowed:true,retryAfter:0},error:null};
 assert.equal(await RL.enforceRateLimit(req({'cf-connecting-ip':'203.0.113.9'}),'dir-review',10,60_000),null);
 assert.equal(await RL.enforceRateLimitKey('dir-price-report:11111111-1111-4111-8111-111111111111',10,3_600_000),null);
 assert.equal(calls.length,2);
 for(const c of calls){assert.equal(c.name,'app_rate_limit_take');assert.match(c.args.p_key,/^[a-f0-9]{64}$/);assert.ok(!c.args.p_key.includes('203'));}
 assert.deepEqual([calls[0].args.p_limit,calls[0].args.p_window_ms,calls[1].args.p_limit,calls[1].args.p_window_ms],[10,60_000,10,3_600_000]);
 assert.notEqual(calls[0].args.p_key,calls[1].args.p_key);
});

test('cf-connecting-ip wins over a forged X-Forwarded-For; different IPs use different buckets',async()=>{
 calls.length=0;
 await RL.enforceRateLimit(req({'cf-connecting-ip':'198.51.100.1','x-forwarded-for':'10.0.0.1'}),'contact',5,60_000);
 await RL.enforceRateLimit(req({'cf-connecting-ip':'198.51.100.1','x-forwarded-for':'10.0.0.2'}),'contact',5,60_000);
 await RL.enforceRateLimit(req({'cf-connecting-ip':'198.51.100.2'}),'contact',5,60_000);
 assert.equal(calls[0].args.p_key,calls[1].args.p_key);assert.notEqual(calls[0].args.p_key,calls[2].args.p_key);
});

test('a denial is a no-store 429 with Retry-After and usted wording',async()=>{
 reply={data:{allowed:false,retryAfter:37},error:null};
 const r=await RL.enforceRateLimit(req(),'dir-claim-code',10,60_000);
 assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'37');assert.match(r.headers.get('cache-control'),/no-store/);
 assert.match((await r.json()).error,/Espere un momento e intente de nuevo/);
});

test('store failure: fail closed (503) for public/token buckets, fail open for telemetry and per-account dashboard buckets',async()=>{
 const restore=console.error;console.error=()=>{};
 try{
  for(const failure of [{data:null,error:{code:'PGRST202'}},{data:{nope:1},error:null},new Error('network')]){
   reply=failure;
   const closed=await RL.enforceRateLimit(req(),'dir-claim-verify',20,60_000);
   assert.equal(closed.status,503);assert.equal(closed.headers.get('retry-after'),'5');assert.equal((await closed.json()).reason,'rate_limit_unavailable');
   assert.equal((await RL.enforceRateLimitKey('pay-link:abc',10,60_000)).status,503);
   assert.equal(await RL.enforceRateLimit(req(),'client-error',20,60_000),null);
   assert.equal(await RL.enforceRateLimit(req(),'allowances-11111111-1111-4111-8111-111111111111',120,60_000),null);
  }
 }finally{console.error=restore;reply={data:{allowed:true,retryAfter:0},error:null};}
 assert.equal(RL.rateLimitFailsOpen('analytics'),true);assert.equal(RL.rateLimitFailsOpen('dir-review'),false);
 assert.equal(RL.rateLimitFailsOpen('project-invitation-ip'),false);assert.equal(RL.rateLimitFailsOpen('ai-11111111-1111-4111-8111-111111111111'),true);
});

test('missing limiter secret fails closed instead of storing unkeyed digests',async()=>{
 const saved={p:env.RATE_LIMIT_PEPPER,s:env.SUPABASE_SERVICE_ROLE_KEY};delete env.RATE_LIMIT_PEPPER;delete env.SUPABASE_SERVICE_ROLE_KEY;
 const restore=console.error;console.error=()=>{};calls.length=0;
 try{assert.equal((await RL.enforceRateLimit(req(),'register',10,600_000)).status,503);assert.equal(calls.length,0);}
 finally{console.error=restore;env.RATE_LIMIT_PEPPER=saved.p;if(saved.s!==undefined)env.SUPABASE_SERVICE_ROLE_KEY=saved.s;}
});

test('test namespace header isolates buckets only under next dev (ignored in production and test builds)',async()=>{
 const saved=env.NODE_ENV;
 try{
  for(const [mode,isolated] of [['development',true],['production',false],['test',false]]){
   env.NODE_ENV=mode;calls.length=0;
   await RL.enforceRateLimit(req({'cf-connecting-ip':'192.0.2.1'}),'dir-qa',10,60_000);
   await RL.enforceRateLimit(req({'cf-connecting-ip':'192.0.2.1','x-ccr-rate-limit-namespace':'run-1'}),'dir-qa',10,60_000);
   await RL.enforceRateLimit(req({'cf-connecting-ip':'192.0.2.1','x-ccr-rate-limit-namespace':'bad value!'}),'dir-qa',10,60_000);
   assert.equal(calls[0].args.p_key!==calls[1].args.p_key,isolated,mode);assert.equal(calls[0].args.p_key,calls[2].args.p_key,mode);
  }
 }finally{env.NODE_ENV=saved;}
});

const S=await import('../../src/lib/security/local-dev-secrets.ts');
test('required secrets: production refuses missing/short/local-dev values (never random); development uses the marked deterministic value',()=>{
 const saved={n:env.NODE_ENV,v:env.DIR_VISITOR_PEPPER};const restore=console.error;const logged=[];console.error=m=>logged.push(String(m));
 try{
  const dev=createHash('sha256').update('contratacr-local-dev-only:DIR_VISITOR_PEPPER').digest('hex');
  assert.equal(S.localDevSecret('DIR_VISITOR_PEPPER'),dev);
  env.NODE_ENV='production';
  delete env.DIR_VISITOR_PEPPER;assert.equal(S.requiredServerSecret('DIR_VISITOR_PEPPER'),null);
  env.DIR_VISITOR_PEPPER='short';assert.equal(S.requiredServerSecret('DIR_VISITOR_PEPPER'),null);
  env.DIR_VISITOR_PEPPER=dev;assert.equal(S.requiredServerSecret('DIR_VISITOR_PEPPER'),null);
  env.DIR_VISITOR_PEPPER='contratacr-local-dev-only:something-long-enough-to-pass';assert.equal(S.requiredServerSecret('DIR_VISITOR_PEPPER'),null);
  const real='p'.repeat(40);env.DIR_VISITOR_PEPPER=real;assert.equal(S.requiredServerSecret('DIR_VISITOR_PEPPER'),real);
  assert.ok(logged.some(m=>m.includes('DIR_VISITOR_PEPPER')&&m.includes('503')));assert.ok(logged.every(m=>!m.includes(real)));
  env.NODE_ENV='development';delete env.DIR_VISITOR_PEPPER;
  assert.equal(S.requiredServerSecret('DIR_VISITOR_PEPPER'),dev);assert.equal(S.requiredServerSecret('DIR_VISITOR_PEPPER'),dev,'stable across calls');
  env.DIR_VISITOR_PEPPER=real;assert.equal(S.requiredServerSecret('DIR_VISITOR_PEPPER'),real,'a configured value wins');
  env.NODE_ENV='test';delete env.DIR_VISITOR_PEPPER;assert.equal(S.requiredServerSecret('DIR_VISITOR_PEPPER'),null);
 }finally{console.error=restore;env.NODE_ENV=saved.n;if(saved.v===undefined)delete env.DIR_VISITOR_PEPPER;else env.DIR_VISITOR_PEPPER=saved.v;}
});

const A=await import('../../src/lib/pro/access.ts');
test('hasProAccess refuses banned professionals like SQL pro_entitled; proBannedFlag fails closed',async()=>{
 const active={status:'active',expires_at:null};
 assert.equal(A.hasProAccess({role:'professional'},active,false),true);
 assert.equal(A.hasProAccess({role:'professional'},active,true),false);
 assert.equal(A.hasProAccess({role:'admin'},null,true),false);
 assert.equal(A.hasProAccess({role:'professional'},active,null),false);
 const db=rows=>({from:()=>({select:()=>({eq:()=>({limit:async()=>rows})})})});
 assert.equal(await A.proBannedFlag(db({data:[],error:null}),'u'),false);
 assert.equal(await A.proBannedFlag(db({data:[{is_banned:false}],error:null}),'u'),false);
 assert.equal(await A.proBannedFlag(db({data:[{is_banned:true}],error:null}),'u'),true);
 assert.equal(await A.proBannedFlag(db({data:null,error:{code:'x'}}),'u'),null);
});
