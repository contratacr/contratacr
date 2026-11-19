import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const root=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(root)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(root)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const d=await import('../../src/lib/pro/private-estimate-destination-copy.ts'),sdk=await import('../../src/lib/pro/private-estimate-destination-copy-recovery.ts'),estimates=await import('../../src/lib/pro/private-estimates.ts');
const actor=crypto.randomUUID(),at='2026-11-10T18:00:00Z',later='2026-11-11T18:00:00Z';
const locks={request:async(_name,_options,callback)=>callback({})},ok=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
function store(){const values=new Map();return{values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
async function setup(kind='draft'){
 const line={id:crypto.randomUUID(),description:'Original service ñ %_',unit:'hora',qtyMilli:1250,unitPriceCents:1999,discountBps:1250,taxBps:1300,catalogProductId:'HISTORICAL_CATALOG_A'},calculated=estimates.calculatePrivateEstimate([line]);
 const sourceEstimate=estimates.privateEstimateSchema.parse({kind:'private_estimate',id:crypto.randomUUID(),ownerId:actor,revision:2,status:'draft',clientId:'source-client-a',client:{id:'source-client-a',name:'Source customer A',email:'a@example.test',phone:'88881111',identification:'101230456',address:'Private address A',tradeName:'Trade A'},clientFingerprint:'a'.repeat(32),source:null,issuer:{issuerName:'Historical issuer A',issuerIdType:'individual',issuerId:'101110111',issuerEmail:'issuer@example.test',issuerPhone:'88881111',issuerAddress:'Issuer private address A',issuerActivity:'432100'},title:'Original source A',notes:'Original private notes A',currency:'USD',validUntil:'2030-12-31',lines:[line],subtotalCents:calculated.subtotalCents,discountCents:calculated.discountCents,taxCents:calculated.taxCents,totalCents:calculated.totalCents,createdAt:at,updatedAt:at});
 const reference=kind==='draft'?{kind:'draft',estimateId:sourceEstimate.id,revision:2}:{kind:'publication',publicationId:crypto.randomUUID(),estimateId:sourceEstimate.id,version:1,estimateRevision:2,contentHash:'d'.repeat(64)};
 const preview=d.privateEstimateDestinationCopyPreviewSchema.parse({source:reference,estimate:sourceEstimate});
 const destination=d.privateEstimateDestinationCopyContextSchema.parse({client:{id:'destination-client-b',name:'Destination customer B',email:'b@example.test',phone:'88882222',identification:'201230456',address:'Private destination B',tradeName:'Trade B'},clientFingerprint:'b'.repeat(32),source:{kind:'work',id:crypto.randomUUID(),fingerprint:'c'.repeat(32)}});
 const input=d.privateEstimateDestinationCopyInputSchema.parse({action:'copy_to_destination',actionId:crypto.randomUUID(),targetEstimateId:crypto.randomUUID(),source:kind==='draft'?reference:{kind:'publication',publicationId:reference.publicationId,version:1,estimateRevision:2,contentHash:reference.contentHash},destination:{clientId:destination.client.id,clientFingerprint:destination.clientFingerprint,source:destination.source}});
 const current={...sourceEstimate,id:input.targetEstimateId,revision:1,status:'draft',clientId:destination.client.id,client:destination.client,clientFingerprint:destination.clientFingerprint,source:destination.source,createdAt:later,updatedAt:later},result=d.privateEstimateDestinationCopyResultSchema.parse({action:'copy_to_destination',source:reference,estimate:current}),attempt=await sdk.createPrivateEstimateDestinationCopyWrite(actor,input,preview,destination),disk=store(),calls=[];
 sdk.savePrivateEstimateDestinationCopyWrite(disk,attempt);disk.setItem('ccr:pro:private-estimate-draft:v1:'+actor+':'+sourceEstimate.id,'NEWER_B_RAW');disk.setItem('ccr:pro:private-estimate-write:v1:'+actor,'OLD_ESTIMATE_JOURNAL');return{input,preview,destination,current,result,attempt,disk,calls};
}
const run=(f,request,mode='check',extra={})=>sdk.continuePrivateEstimateDestinationCopyWrite({store:f.disk,attempt:f.attempt,request,currentAccount:()=>actor,currentSource:()=>JSON.stringify(f.input.source),mode,onCheckpoint:value=>{f.attempt=value;},locks,...extra});
function requestFor(f,{missing=false,current=f.current}={}){return async(url,init={})=>{f.calls.push({url,method:init.method??'GET',body:init.body});return ok(url.includes('view=action')?{receipt:missing?null:{input:f.input,result:f.result}}:{estimate:current,history:[],nextCursor:null});};}
const display=await import('../../src/lib/pro/private-estimate-destination-copy-display.ts');
let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name);}
await test('strict source and destination tuples cannot smuggle a contact, mutable source or target adoption',async()=>{
 const f=await setup();
 for(const patch of [{source:{...f.input.source,revision:0}},{targetEstimateId:f.preview.estimate.id},{destination:{...f.input.destination,client:f.destination.client}},{destination:{...f.input.destination,clientFingerprint:'BAD'}}])assert.throws(()=>d.privateEstimateDestinationCopyInputSchema.parse({...f.input,...patch}));
 await assert.rejects(()=>sdk.createPrivateEstimateDestinationCopyWrite(actor,{...f.input,destination:{...f.input.destination,clientId:'wrong'}},f.preview,f.destination));
 await assert.rejects(()=>sdk.createPrivateEstimateDestinationCopyWrite(crypto.randomUUID(),f.input,f.preview,f.destination));
});
await test('restored missing checks issue only GET and retain exact source and selected destination',async()=>{
 const f=await setup(),checked=await run(f,requestFor(f,{missing:true}));assert.equal(checked.status,'missing');assert.deepEqual(f.calls.map(row=>row.method),['GET']);assert.equal(f.attempt.body,JSON.stringify(f.input));assert.deepEqual(f.attempt.destination,f.destination);assert.deepEqual(f.attempt.preview,f.preview);
 await assert.rejects(()=>sdk.clearPrivateEstimateDestinationCopyWrite(f.disk,f.attempt,locks));
});
await test('explicit exact retry proves independently before canonical C and clears only its own namespace',async()=>{
 for(const kind of ['draft','publication']){
  const f=await setup(kind);let committed=false;
  const checked=await run(f,async(url,init={})=>{f.calls.push({method:init.method??'GET',body:init.body});if(init.method==='POST'){committed=true;assert.equal(init.body,JSON.stringify(f.input));return ok(f.result);}return ok(url.includes('view=action')?{receipt:committed?{input:f.input,result:f.result}:null}:{estimate:f.current,history:[],nextCursor:null});},'retry');
  assert.equal(checked.status,'confirmed');assert.deepEqual(f.calls.map(row=>row.method),['GET','POST','GET','GET']);assert.equal(checked.current.client.name,'Destination customer B');assert.equal(checked.current.issuer.issuerActivity,'432100');assert.equal(checked.current.lines[0].catalogProductId,'HISTORICAL_CATALOG_A');
  await sdk.clearPrivateEstimateDestinationCopyWrite(f.disk,checked.attempt,locks);assert.equal(f.disk.getItem(sdk.privateEstimateDestinationCopyWriteKey(actor)),null);assert.equal(f.disk.getItem('ccr:pro:private-estimate-draft:v1:'+actor+':'+f.preview.estimate.id),'NEWER_B_RAW');assert.equal(f.disk.getItem('ccr:pro:private-estimate-write:v1:'+actor),'OLD_ESTIMATE_JOURNAL');
 }
});
await test('valid totals never authorize changed source content, private issuer activity, line catalogue or destination snapshot',async()=>{
 for(const modify of [e=>({...e,title:'Different source title'}),e=>({...e,notes:'Different source notes'}),e=>({...e,issuer:{...e.issuer,issuerActivity:'999900'}}),e=>({...e,lines:e.lines.map(row=>({...row,description:'Changed description with same totals'}))}),e=>({...e,lines:e.lines.map(row=>({...row,catalogProductId:'DIFFERENT_PRIVATE_CATALOG'}))}),e=>({...e,client:{...e.client,phone:'88889999'}})]){
  const f=await setup(),forged={...f.result,estimate:modify(f.result.estimate)};assert.equal(d.privateEstimateDestinationCopyResultSchema.safeParse(forged).success,true);
  await assert.rejects(()=>run(f,async()=>ok({receipt:{input:f.input,result:forged}})));assert.equal(f.attempt.phase,'ready');assert.equal(f.attempt.ack,null);assert.equal(f.attempt.body,JSON.stringify(f.input));
 }
});
await test('forged POST ACK stays uncertain and a later correct Check recovers without another POST',async()=>{
 const f=await setup();let committed=false,posts=0;
 await assert.rejects(()=>run(f,async(_url,init={})=>{if(init.method==='POST'){posts++;committed=true;return ok({...f.result,estimate:{...f.result.estimate,updatedAt:'2026-11-12T18:00:00Z'}});}return ok({receipt:committed?{input:f.input,result:f.result}:null});},'retry'));
 assert.equal(f.attempt.phase,'uncertain');assert.equal(f.attempt.ack,null);assert.equal((await run(f,requestFor(f))).status,'confirmed');assert.equal(posts,1);assert.equal(f.calls.filter(row=>row.method==='POST').length,0);
});
await test('historical immutable receipt can coexist with later canonical C edits but contradictory C fails closed',async()=>{
 const f=await setup(),laterCurrent={...f.current,revision:2,title:'Explicit later C edit',updatedAt:'2026-11-12T18:00:00Z'},checked=await run(f,requestFor(f,{current:laterCurrent}));assert.deepEqual(checked.result,f.result);assert.deepEqual(checked.current,laterCurrent);
 const bad=await setup();await assert.rejects(()=>run(bad,requestFor(bad,{current:{...bad.current,title:'Contradictory same revision'}})));await assert.rejects(()=>sdk.clearPrivateEstimateDestinationCopyWrite(bad.disk,bad.attempt,locks));
});
await test('foreign source can check its own receipt but cannot retry under another source; switched actor never reaches network',async()=>{
 const f=await setup(),different=()=>JSON.stringify({kind:'draft',estimateId:crypto.randomUUID(),revision:1});
 assert.equal((await run(f,requestFor(f,{missing:true}),'check',{currentSource:different})).status,'missing');await assert.rejects(()=>run(f,requestFor(f,{missing:true}),'retry',{currentSource:different}));assert.equal(f.calls.filter(row=>row.method==='POST').length,0);
 let calls=0;await assert.rejects(()=>run(f,async()=>{calls++;throw Error();},'retry',{currentAccount:()=>crypto.randomUUID()}));assert.equal(calls,0);
});
await test('quota failure, unavailable lock and a newer actor journal preserve independent local data',async()=>{
 const f=await setup();let calls=0;const request=async()=>{calls++;throw Error();};
 await assert.rejects(()=>run(f,request,'retry',{store:{...f.disk,setItem:()=>{throw Error('quota');}}}));await assert.rejects(()=>run(f,request,'retry',{locks:{request:async(_key,_opts,callback)=>callback(null)}}));assert.equal(calls,0);
 const newer=await setup();sdk.savePrivateEstimateDestinationCopyWrite(f.disk,newer.attempt);const raw=f.disk.getItem(sdk.privateEstimateDestinationCopyWriteKey(actor));await assert.rejects(()=>run(f,request));await assert.rejects(()=>sdk.clearPrivateEstimateDestinationCopyWrite(f.disk,f.attempt,locks));assert.equal(calls,0);assert.equal(f.disk.getItem(sdk.privateEstimateDestinationCopyWriteKey(actor)),raw);
});
await test('destination hints preserve civil leap days and normalize instants and offsetless times to Costa Rica',async()=>{
 const date=display.privateEstimateDestinationCopyDate;
 assert.equal(date('2024-02-29',true),'Feb 29, 2024');
 assert.equal(date('2024-02-29T00:15',true),'Feb 29, 2024');
 assert.equal(date('2024-03-01T00:15:00Z',true),'Feb 29, 2024');
 assert.equal(date('2024-03-01T00:15:00+02:00',true),'Feb 29, 2024');
 assert.equal(date('2024-02-29T23:59:59-06:00',true),'Feb 29, 2024');
 assert.equal(date('2024-02-29',false),'29 feb 2024');
 for(const invalid of ['2023-02-29','2024-02-30','2024-13-01','2024-02-29T24:00','2024-02-29T00:60','2024-02-29T00:00:60','invalid'])assert.equal(date(invalid,true),null);
 assert.equal(display.privateEstimateDestinationCopyHint({date:'2030-02-28T09:30:00-06:00'},'work',true),'Feb 28, 2030, 9:30 AM');
 assert.equal(display.privateEstimateDestinationCopyHint({date:'2030-02-28T09:30'},'work',true),'Feb 28, 2030, 9:30 AM');
 assert.equal(display.privateEstimateDestinationCopyHint({date:'2030-02-28'},'work',true),'Feb 28, 2030');
 assert.equal(display.privateEstimateDestinationCopyHint({date:null},'work',true),'No date');
 assert.equal(display.privateEstimateDestinationCopyHint({},'work',true),null);
 assert.equal(display.privateEstimateDestinationCopyHint({date:'invalid'},'work',false),null);
 assert.equal(display.privateEstimateDestinationCopyHint({date:'2024-02-29',hasLinkedWork:true},'manual',true),'Linked job · Created Feb 29, 2024');
 assert.equal(display.privateEstimateDestinationCopyHint({hasLinkedWork:false},'manual',false),'Sin trabajo asociado');
 assert.equal(display.privateEstimateDestinationCopyHint({},'manual',true),null);
 assert.equal(display.privateEstimateDestinationCopyHint({date:null,hasLinkedWork:true},'client',true),null);
});
await test('legacy destination selections keep optional metadata absent and persisted recovery bytes exact',async()=>{
 const row={id:'legacy-selected',name:'Legacy destination ñ %_',clientId:'legacy-client',clientName:'Legacy customer'},raw=JSON.stringify(row),parsed=d.privateEstimateDestinationCopyOptionsSchema.parse({fingerprint:'a'.repeat(32),items:[JSON.parse(raw)],nextCursor:null}).items[0];
 assert.equal(JSON.stringify(parsed),raw);assert.equal(Object.hasOwn(parsed,'date'),false);assert.equal(Object.hasOwn(parsed,'hasLinkedWork'),false);assert.equal(display.privateEstimateDestinationCopyHint(parsed,'manual',true),null);
 const f=await setup(),saved=JSON.stringify(f.attempt),restored=sdk.parsePrivateEstimateDestinationCopyWrite(JSON.parse(saved),actor);assert.equal(JSON.stringify(restored),saved);assert.equal(restored.body,f.attempt.body);
});
console.log(`${count} destination-copy contracts passed; no database, browser or network.`);
