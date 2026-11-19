import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const root=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(root)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(root)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const domain=await import('../../src/lib/pro/private-estimate-publication-copy.ts');
const sdk=await import('../../src/lib/pro/private-estimate-publication-copy-recovery.ts');
const estimates=await import('../../src/lib/pro/private-estimates.ts');
const actor=crypto.randomUUID(),at='2026-11-10T18:00:00Z';
const locks={request:async(_key,_options,run)=>run({})};
const ok=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
function store(){const values=new Map();return{values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
async function setup(){
 const line={id:crypto.randomUUID(),description:'Historical service ñ',unit:'hora',qtyMilli:1250,unitPriceCents:1999,discountBps:1250,taxBps:1300,catalogProductId:'private-catalog-id'};
 const calculated=estimates.calculatePrivateEstimate([line]),totals={subtotalCents:calculated.subtotalCents,discountCents:calculated.discountCents,taxCents:calculated.taxCents,totalCents:calculated.totalCents},sourceId=crypto.randomUUID(),target=crypto.randomUUID();
 const estimate=estimates.privateEstimateSchema.parse({kind:'private_estimate',id:target,ownerId:actor,revision:1,status:'draft',clientId:'private-client-a',client:{id:'private-client-a',name:'Historical customer A',email:'private@example.test',phone:'PRIVATE_PHONE_A',identification:'101230456',address:'PRIVATE_ADDRESS_A',tradeName:'Trade A'},clientFingerprint:'a'.repeat(32),source:{kind:'manual',id:crypto.randomUUID(),revision:1},issuer:{issuerName:'Historical issuer A',issuerIdType:'individual',issuerId:'101110111',issuerEmail:'issuer@example.test',issuerPhone:'88881111',issuerAddress:'Historical address',issuerActivity:'432100'},title:'Historical A',notes:'Historical notes',currency:'USD',validUntil:'2024-02-29',lines:[line],...totals,createdAt:at,updatedAt:at});
 const {issuerActivity:privateActivity,...issuer}=estimate.issuer;assert.equal(privateActivity,'432100');
 const {catalogProductId:privateProduct,...publicLine}=line;assert.equal(privateProduct,'private-catalog-id');
 const publication={publicationId:crypto.randomUUID(),estimateId:sourceId,version:1,estimateRevision:1,content:{title:estimate.title,currency:estimate.currency,validUntil:estimate.validUntil,notes:estimate.notes,issuer,customer:{name:estimate.client.name,tradeName:estimate.client.tradeName,identification:estimate.client.identification,address:estimate.client.address},lines:[publicLine],...totals},contentHash:'b'.repeat(64),revision:3,status:'accepted',recipientBound:true,createdAt:at};
 const input=domain.privateEstimatePublicationCopyInputSchema.parse({action:'copy_from_publication',actionId:crypto.randomUUID(),publicationId:publication.publicationId,version:1,estimateRevision:1,contentHash:publication.contentHash,targetEstimateId:target});
 const result=domain.privateEstimatePublicationCopyResultSchema.parse({action:'copy_from_publication',publication:{publicationId:publication.publicationId,estimateId:sourceId,version:1,estimateRevision:1,contentHash:publication.contentHash},estimate});
 const attempt=await sdk.createPrivateEstimatePublicationCopyWrite(actor,input,publication),disk=store(),calls=[];
 sdk.savePrivateEstimatePublicationCopyWrite(disk,attempt);
 disk.setItem('ccr:pro:private-estimate-draft:v1:'+actor+':'+sourceId,'NEWER_B_RAW');
 disk.setItem('ccr:pro:private-estimate-write:v1:'+actor,'UNRELATED_LEGACY_JOURNAL');
 return{input,result,publication,estimate,attempt,disk,calls};
}
function requestFor(f,{missing=false,current=f.estimate}={}){return async(url,init={})=>{f.calls.push({url,method:init.method??'GET',body:init.body,actor:init.headers?.['X-Pro-Expected-Actor']});return ok(url.includes('view=action')?{receipt:missing?null:{input:f.input,result:f.result}}:{estimate:current,history:[],nextCursor:null});};}
const run=(f,request,mode='check',extra={})=>sdk.continuePrivateEstimatePublicationCopyWrite({store:f.disk,attempt:f.attempt,request,currentAccount:()=>actor,currentPublication:()=>f.publication.publicationId,mode,onCheckpoint:value=>{f.attempt=value;},locks,...extra});
let count=0;
async function test(name,fn){await fn();count++;console.log('PASS '+name);}
await test('strict tuple and receipt contracts reject wrong identities, mutable source aliases and fake target adoption',async()=>{
 const f=await setup();
 for(const patch of [{sourceRevision:1},{version:0},{targetEstimateId:'not-a-uuid'},{contentHash:'C'.repeat(64)}])assert.throws(()=>domain.privateEstimatePublicationCopyInputSchema.parse({...f.input,...patch}));
 assert.throws(()=>domain.privateEstimatePublicationCopyResultSchema.parse({...f.result,estimate:{...f.estimate,id:f.result.publication.estimateId}}));
 assert.throws(()=>domain.privateEstimatePublicationCopyReceiptSchema.parse({receipt:{input:{...f.input,targetEstimateId:crypto.randomUUID()},result:f.result}}));
});
await test('restored check is GET-only and does not discard the original exact request or newer B bytes',async()=>{
 const f=await setup(),other=[...f.disk.values].filter(([key])=>key!==sdk.privateEstimatePublicationCopyWriteKey(actor));
 const checked=await run(f,requestFor(f,{missing:true}));assert.equal(checked.status,'missing');assert.deepEqual(f.calls.map(call=>call.method),['GET']);assert.equal(f.calls[0].actor,actor);assert.equal(checked.attempt.body,JSON.stringify(f.input));
 for(const [key,value] of other)assert.equal(f.disk.getItem(key),value);
 await assert.rejects(()=>sdk.clearPrivateEstimatePublicationCopyWrite(f.disk,checked.attempt,locks));
});
await test('explicit retry is proof-first, sends identical bytes once and retains full historical private snapshots',async()=>{
 const f=await setup();let committed=false;
 const checked=await run(f,async(url,init={})=>{
  f.calls.push({method:init.method??'GET',body:init.body});
  if(init.method==='POST'){assert.equal(init.body,JSON.stringify(f.input));committed=true;return ok(f.result);}
  return ok(url.includes('view=action')?{receipt:committed?{input:f.input,result:f.result}:null}:{estimate:f.estimate,history:[],nextCursor:null});
 },'retry');
 assert.equal(checked.status,'confirmed');assert.deepEqual(f.calls.map(call=>call.method),['GET','POST','GET','GET']);
 assert.equal(checked.result.estimate.client.phone,'PRIVATE_PHONE_A');assert.equal(checked.result.estimate.issuer.issuerActivity,'432100');assert.equal(checked.result.estimate.lines[0].catalogProductId,'private-catalog-id');
 assert.equal(f.disk.getItem(sdk.privateEstimatePublicationCopyWriteKey(actor))!==null,true);
 await sdk.clearPrivateEstimatePublicationCopyWrite(f.disk,checked.attempt,locks);
 assert.equal(f.disk.getItem(sdk.privateEstimatePublicationCopyWriteKey(actor)),null);
 assert.equal(f.disk.getItem('ccr:pro:private-estimate-draft:v1:'+actor+':'+f.publication.estimateId),'NEWER_B_RAW');assert.equal(f.disk.getItem('ccr:pro:private-estimate-write:v1:'+actor),'UNRELATED_LEGACY_JOURNAL');
});
await test('forged ACK timestamps never replace independent proof; correct next Check recovers with zero extra POST',async()=>{
 const f=await setup();let committed=false,posts=0;
 await assert.rejects(()=>run(f,async(_url,init={})=>{if(init.method==='POST'){posts++;committed=true;return ok({...f.result,estimate:{...f.estimate,updatedAt:'2026-11-11T18:00:00Z'}});}return ok({receipt:committed?{input:f.input,result:f.result}:null});},'retry'));
 assert.equal(f.attempt.phase,'uncertain');assert.equal(f.attempt.ack,null);assert.equal(f.attempt.body,JSON.stringify(f.input));
 const checked=await run(f,requestFor(f));assert.equal(checked.status,'confirmed');assert.equal(posts,1);assert.equal(f.calls.filter(call=>call.method==='POST').length,0);assert.deepEqual(checked.result,f.result);
});
await test('canonical same-revision contradictions fail closed while a later authorized C edit preserves the immutable receipt',async()=>{
 const f=await setup();await assert.rejects(()=>run(f,requestFor(f,{current:{...f.estimate,title:'Forged C'}})));
 await assert.rejects(()=>sdk.clearPrivateEstimatePublicationCopyWrite(f.disk,f.attempt,locks));
 const later={...f.estimate,revision:2,title:'Later C edit',updatedAt:'2026-11-11T18:00:00Z'},checked=await run(f,requestFor(f,{current:later}));
 assert.deepEqual(checked.current,later);assert.deepEqual(checked.result,f.result);assert.equal(checked.attempt.ack.estimate.title,'Historical A');
});
await test('actor mismatch, quota and unavailable Web Lock stop network and do not create phantom copies',async()=>{
 const f=await setup();let calls=0;const request=async()=>{calls++;throw Error('Unexpected network');};
 await assert.rejects(()=>run(f,request,'retry',{currentAccount:()=>crypto.randomUUID()}));
 await assert.rejects(()=>run(f,request,'retry',{store:{...f.disk,setItem:()=>{throw Error('quota');}}}));
 await assert.rejects(()=>run(f,request,'retry',{locks:{request:async(_key,_options,callback)=>callback(null)}}));
 assert.equal(calls,0);assert.equal(sdk.readPrivateEstimatePublicationCopyWrite(f.disk,actor).phase,'ready');
});
await test('foreign publication can check its original receipt but never POST under another version',async()=>{
 const f=await setup(),request=requestFor(f,{missing:true}),currentPublication=()=>crypto.randomUUID();
 assert.equal((await run(f,request,'check',{currentPublication})).status,'missing');
 await assert.rejects(()=>run(f,request,'retry',{currentPublication}));assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
});
await test('a newer actor journal survives old check and stale clear, with no network or silent adoption',async()=>{
 const f=await setup(),next=await setup();sdk.savePrivateEstimatePublicationCopyWrite(f.disk,next.attempt);
 const raw=f.disk.getItem(sdk.privateEstimatePublicationCopyWriteKey(actor));let calls=0;
 await assert.rejects(()=>run(f,async()=>{calls++;throw Error();}));await assert.rejects(()=>sdk.clearPrivateEstimatePublicationCopyWrite(f.disk,f.attempt,locks));
 assert.equal(calls,0);assert.equal(f.disk.getItem(sdk.privateEstimatePublicationCopyWriteKey(actor)),raw);
});
console.log(`${count} publication-copy contracts passed; no database, browser or network.`);
