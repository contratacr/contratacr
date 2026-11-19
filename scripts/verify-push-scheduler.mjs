import assert from 'node:assert/strict';
import test from 'node:test';
import worker, {runPushTick} from '../workers/push-scheduler/worker.mjs';
const secret='synthetic-test-secret-not-a-real-credential';
const env={MODE:'deliver',APP_ORIGIN:'https://contratacr.com',PUSH_WORKER_SECRET:secret};
const json=body=>Response.json(body);
const valid={ok:true,disabled:false,claimed:4,delivered:1,suppressed:1,retried:1,failed:1};
test('off is the default and performs no network request',async()=>{
 assert.deepEqual(await runPushTick({},()=>{throw Error('unexpected network');}),{mode:'off',skipped:true});
});
test('unknown mode, wrong host and missing credentials fail before network',async()=>{
 for(const patch of [{MODE:'true'},{APP_ORIGIN:'https://contratacr.com.evil.invalid'},{APP_ORIGIN:'https://user:pass@contratacr.com'},{APP_ORIGIN:'http://contratacr.com'},{APP_ORIGIN:'https://contratacr.com/'},{PUSH_WORKER_SECRET:''},{PUSH_WORKER_SECRET:'short'}])await assert.rejects(()=>runPushTick({...env,...patch},()=>{throw Error('network must not run');}),/scheduler_(invalid_mode|invalid_origin|missing_secret)/);
});
test('readiness uses checkOnly and cannot request delivery',async()=>{
 let body;const result=await runPushTick({...env,MODE:'check-only'},async(_url,input)=>{body=JSON.parse(input.body);return json({ok:true,credentialReady:true,sent:0});});assert.deepEqual(body,{checkOnly:true});assert.deepEqual(result,{mode:'check-only',credentialReady:true,sent:0});
 for(const response of [{ok:true,credentialReady:false,sent:0},{ok:true,credentialReady:true,sent:1}])await assert.rejects(()=>runPushTick({...env,MODE:'check-only'},async()=>json(response)),/scheduler_readiness_failed/);
});
test('delivery calls only the existing protected endpoint once with bounded limit and no redirect forwarding',async()=>{
 let calls=0;const result=await runPushTick(env,async(url,input)=>{calls++;assert.equal(url,'https://contratacr.com/api/internal/push/drain');assert.equal(input.method,'POST');assert.equal(input.redirect,'manual');assert.equal(input.headers.Authorization,'Bearer '+secret);assert.deepEqual(JSON.parse(input.body),{limit:50});assert.ok(input.signal instanceof AbortSignal);return json({...valid,token:'must-not-escape',recipient:'must-not-escape'});});assert.equal(calls,1);assert.deepEqual(result,{mode:'deliver',claimed:4,delivered:1,suppressed:1,retried:1,failed:1});
});
test('redirects, authentication failure and server failure never get followed or retried inline',async()=>{
 for(const status of [301,302,401,403,429,500]){let calls=0;await assert.rejects(()=>runPushTick(env,async()=>{calls++;return new Response('private provider detail',{status});}),new RegExp('scheduler_http_'+status));assert.equal(calls,1);}
});
test('malformed counters and disabled sending are failures rather than a misleading green result',async()=>{
 for(const reply of [{...valid,disabled:true},{...valid,claimed:51},{...valid,delivered:-1},{...valid,claimed:5},{...valid,failed:0.5},{ok:false},{ok:true}])await assert.rejects(()=>runPushTick(env,async()=>json(reply)),/scheduler_(invalid_response|delivery_disabled)/);
 await assert.rejects(()=>runPushTick(env,async()=>new Response('<html>Not the API</html>')),/scheduler_invalid_response/);
});
test('network exceptions are sanitized and retain no credential or provider body',async()=>{
 await assert.rejects(()=>runPushTick(env,async()=>{throw Error('raw '+secret);}),error=>error.message==='scheduler_request_failed');
});
test('the worker has no public drain endpoint',async()=>{
 const response=await worker.fetch(new Request('https://example.invalid/'));assert.equal(response.status,404);assert.equal(response.headers.get('cache-control'),'no-store');
});
