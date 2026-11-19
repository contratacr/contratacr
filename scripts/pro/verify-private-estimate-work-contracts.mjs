import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const root=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(root)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(root)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const d=await import('../../src/lib/pro/private-estimate-work.ts'),sdk=await import('../../src/lib/pro/private-estimate-work-recovery.ts');
const actor=crypto.randomUUID(),recipient=crypto.randomUUID(),publicationId=crypto.randomUUID(),estimateId=crypto.randomUUID(),workId=crypto.randomUUID(),stamp='2026-11-10T18:00:00Z';
const content={title:'Acuerdo aceptado',currency:'USD',validUntil:null,notes:'Alcance',issuer:{issuerName:'Emisor',issuerIdType:'',issuerId:'',issuerEmail:'',issuerPhone:'',issuerAddress:''},customer:{name:'Cliente',tradeName:null,identification:null,address:null},lines:[{id:crypto.randomUUID(),description:'Servicio',unit:'hora',qtyMilli:1000,unitPriceCents:100,discountBps:0,taxBps:0}],subtotalCents:100,discountCents:0,taxCents:0,totalCents:100};
const publication={publicationId,estimateId,version:1,estimateRevision:1,content,contentHash:'a'.repeat(64),revision:3,status:'accepted',recipientBound:true,createdAt:stamp};
const context={publicationId,contentHash:publication.contentHash,publicationRevision:3,version:1,currency:'USD',totalCents:100,accepted:{actionId:crypto.randomUUID(),actorId:recipient,at:stamp},source:null,client:{id:'private-client',name:'Cliente',archived:false},mapping:null,requiredWork:null,manual:null,canCreate:true,reason:null};
const input={action:'continue',actionId:crypto.randomUUID(),publicationId,contentHash:publication.contentHash,publicationRevision:3,target:{kind:'new',workId,conversionActionId:null,leadRevision:null}};
const result={action:'continue',agreement:{publicationId,estimateId,version:1,estimateRevision:1,workId,clientId:context.client.id,title:content.title,currency:'USD',totalCents:100,contentHash:publication.contentHash,acceptedActionId:context.accepted.actionId,acceptedActorId:recipient,acceptedAt:stamp,source:null,createdAt:stamp},work:{id:workId,client:'Cliente',service:content.title,stage:'new',start:'',end:'',clientId:context.client.id,cancelled:false,bookingClientId:null,quoteId:null,externalQuoteId:null}};
const locks={request:async(_key,_options,run)=>run({})},response=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
function storage(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
async function setup(){const attempt=await sdk.createPrivateEstimateWorkWrite(actor,input,context,publication),store=storage();sdk.savePrivateEstimateWorkWrite(store,attempt);return{attempt,store};}
let passed=0;async function test(name,run){await run();passed++;console.log('PASS '+name);}
await test('new work identity is explicit and manual conversion fields travel as a pair',async()=>{
 assert.deepEqual(d.privateEstimateWorkInputSchema.parse(input),input);
 for(const target of [{...input.target,leadRevision:1},{...input.target,conversionActionId:crypto.randomUUID()}])assert.throws(()=>d.privateEstimateWorkInputSchema.parse({...input,target}));
 await assert.rejects(()=>sdk.createPrivateEstimateWorkWrite(actor,input,context,{...publication,status:'shared'}));
});
await test('historical accepted manual revision and current conversion CAS remain distinct',async()=>{
 const source={kind:'manual',id:crypto.randomUUID(),revision:1},current={...context,source,manual:{id:source.id,currentRevision:2,canConvert:true}},command={...input,target:{...input.target,conversionActionId:crypto.randomUUID(),leadRevision:2}};
 const attempt=await sdk.createPrivateEstimateWorkWrite(actor,command,current,publication);assert.equal(attempt.context.source.revision,1);assert.equal(JSON.parse(attempt.body).target.leadRevision,2);
});
await test('a committed receipt is checked before POST and later job edits do not rewrite the immutable agreement',async()=>{
 const {attempt,store}=await setup();let posts=0;
 const current={agreement:result.agreement,work:{...result.work,service:'Trabajo editado',stage:'completed',cancelled:true}};
 const checked=await sdk.continuePrivateEstimateWorkWrite({store,attempt,request:async(url,init)=>{if(init.method==='POST')posts++;return response(url.includes('view=action')?{receipt:{input,result}}:current);},currentAccount:()=>actor,currentPublication:()=>publicationId,mode:'retry',onCheckpoint:()=>{},locks});
 assert.equal(checked.status,'confirmed');assert.equal(posts,0);assert.deepEqual(checked.current,current);await sdk.clearPrivateEstimateWorkWrite(store,checked.attempt,locks);assert.equal(store.getItem(sdk.privateEstimateWorkWriteKey(actor)),null);
});
await test('a missing check is GET-only and an explicit retry preserves exact serialized work IDs',async()=>{
 const {attempt,store}=await setup();let committed=false,posts=0;
 const request=async(url,init)=>{if(init.method==='POST'){posts++;assert.equal(init.body,attempt.body);committed=true;return response(result);}return response(url.includes('view=action')?{receipt:committed?{input,result}:null}:{agreement:result.agreement,work:result.work});};
 const common={store,attempt,request,currentAccount:()=>actor,currentPublication:()=>publicationId,onCheckpoint:()=>{},locks};
 assert.equal((await sdk.continuePrivateEstimateWorkWrite({...common,mode:'check'})).status,'missing');assert.equal(posts,0);assert.equal((await sdk.continuePrivateEstimateWorkWrite({...common,mode:'retry'})).status,'confirmed');assert.equal(posts,1);
});
await test('forged ACK money cannot replace correct independent proof and the next check sends no duplicate POST',async()=>{
 const {attempt,store}=await setup();let committed=false,posts=0;const forged={...result,agreement:{...result.agreement,totalCents:101}};
 await assert.rejects(()=>sdk.continuePrivateEstimateWorkWrite({store,attempt,request:async(_url,init)=>{if(init.method==='POST'){posts++;committed=true;return response(forged);}return response({receipt:committed?{input,result}:null});},currentAccount:()=>actor,currentPublication:()=>publicationId,mode:'retry',onCheckpoint:()=>{},locks}));
 const retained=sdk.readPrivateEstimateWorkWrite(store,actor);assert.equal(retained.phase,'uncertain');assert.equal(retained.body,attempt.body);assert.equal(retained.ack,null);
 const checked=await sdk.continuePrivateEstimateWorkWrite({store,attempt:retained,request:async(url,init)=>{assert.notEqual(init.method,'POST');return response(url.includes('view=action')?{receipt:{input,result}}:{agreement:result.agreement,work:result.work});},currentAccount:()=>actor,currentPublication:()=>publicationId,mode:'check',onCheckpoint:()=>{},locks});
 assert.equal(checked.status,'confirmed');assert.equal(posts,1);
});
await test('foreign publication checks remain readonly while actor changes, quota and missing locks fail before writes',async()=>{
 const {attempt,store}=await setup();let posts=0,calls=0;const request=async(_url,init)=>{calls++;if(init.method==='POST')posts++;return response({receipt:null});};
 const common={store,attempt,request,currentAccount:()=>actor,currentPublication:()=>crypto.randomUUID(),onCheckpoint:()=>{},locks};
 assert.equal((await sdk.continuePrivateEstimateWorkWrite({...common,mode:'check'})).status,'missing');await assert.rejects(()=>sdk.continuePrivateEstimateWorkWrite({...common,mode:'retry'}));assert.equal(posts,0);
 const before=calls;await assert.rejects(()=>sdk.continuePrivateEstimateWorkWrite({...common,currentAccount:()=>recipient,mode:'retry'}));assert.equal(calls,before);
 await assert.rejects(()=>sdk.continuePrivateEstimateWorkWrite({...common,store:{...store,setItem:()=>{throw Error('quota');}},mode:'retry'}));assert.equal(calls,before);
 await assert.rejects(()=>sdk.continuePrivateEstimateWorkWrite({...common,locks:null,mode:'retry'}));assert.equal(calls,before);
});
await test('a later actor attempt is not overwritten or cleared by an older publication',async()=>{
 const {attempt,store}=await setup(),newer=await sdk.createPrivateEstimateWorkWrite(actor,{...input,actionId:crypto.randomUUID(),target:{...input.target,workId:crypto.randomUUID()}},context,publication);
 sdk.savePrivateEstimateWorkWrite(store,newer);const raw=store.getItem(sdk.privateEstimateWorkWriteKey(actor));let calls=0;
 await assert.rejects(()=>sdk.continuePrivateEstimateWorkWrite({store,attempt,request:async()=>{calls++;throw Error();},currentAccount:()=>actor,currentPublication:()=>publicationId,mode:'check',onCheckpoint:()=>{},locks}));assert.equal(calls,0);assert.equal(store.getItem(sdk.privateEstimateWorkWriteKey(actor)),raw);
 await assert.rejects(()=>sdk.clearPrivateEstimateWorkWrite(store,attempt,locks));assert.equal(store.getItem(sdk.privateEstimateWorkWriteKey(actor)),raw);
});
console.log(`${passed} accepted estimate work contracts passed; no database, browser or network.`);
