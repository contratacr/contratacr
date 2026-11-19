import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const root=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(root)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(root)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const sdk=await import('../../src/lib/pro/private-estimate-publication-recovery.ts');
const actor=crypto.randomUUID(),publicationId=crypto.randomUUID(),code='b'.repeat(64),stamp='2026-11-10T18:00:00Z';
const content={title:'Cotización publicada',currency:'CRC',validUntil:null,notes:'Alcance compartido',issuer:{issuerName:'Negocio privado',issuerIdType:'',issuerId:'',issuerEmail:'',issuerPhone:'',issuerAddress:''},customer:{name:'Cliente',tradeName:null,identification:null,address:null},lines:[{id:crypto.randomUUID(),description:'Servicio',unit:'hora',qtyMilli:1000,unitPriceCents:100,discountBps:0,taxBps:0}],subtotalCents:100,discountCents:0,taxCents:0,totalCents:100};
const publication={publicationId,estimateId:null,version:1,estimateRevision:1,content,contentHash:'a'.repeat(64),revision:2,status:'shared',recipientBound:true,createdAt:stamp};
const locks={request:async(_key,_options,run)=>run({})};
function store(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
let passed=0;
async function test(name,run){await run();passed++;console.log('PASS '+name);}
async function setup(){const input={action:'claim',actionId:crypto.randomUUID(),code},attempt=await sdk.createPrivateEstimatePublicationWrite(actor,input),disk=store();sdk.savePrivateEstimatePublicationWrite(disk,attempt);return{input,attempt,disk};}
await test('check is GET-only and a missing receipt preserves raw claim bytes',async()=>{
 const {attempt,disk}=await setup(),calls=[];
 const result=await sdk.continuePrivateEstimatePublicationWrite({store:disk,attempt,request:async(url,init)=>{calls.push([url,init.method??'GET']);return response({receipt:null});},currentAccount:()=>actor,currentTarget:()=>attempt.target,mode:'check',onCheckpoint:()=>{},locks});
 assert.equal(result.status,'missing');assert.deepEqual(calls.map(call=>call[1]),['GET']);assert.equal(sdk.readPrivateEstimatePublicationWrite(disk,actor).body,attempt.body);
});
await test('claim scrubs the code only after an independent receipt and canonical detail',async()=>{
 const {attempt,disk}=await setup(),calls=[],checkpoints=[];let committed=false;
 const ack={action:'claim',publication};
 const result=await sdk.continuePrivateEstimatePublicationWrite({store:disk,attempt,request:async(url,init)=>{calls.push([url,init.method??'GET',init.body]);if(init.method==='POST'){assert.equal(init.body,attempt.body);committed=true;return response(ack);}if(url.includes('view=action'))return response({receipt:committed?{inputHash:attempt.inputHash,result:ack}:null});return response({publication,side:'client',canRespond:true,canWithdraw:false,canRespondChanges:false,recipient:null});},currentAccount:()=>actor,currentTarget:()=>attempt.target,mode:'retry',onCheckpoint:r=>checkpoints.push(r),locks});
 assert.equal(result.status,'confirmed');assert.equal(result.attempt.body,null);assert.equal(calls.filter(call=>call[1]==='POST').length,1);assert.ok(checkpoints.some(r=>r.phase==='uncertain'&&r.body===attempt.body));assert.ok(!JSON.stringify(sdk.readPrivateEstimatePublicationWrite(disk,actor)).includes(code));
 await sdk.clearPrivateEstimatePublicationWrite(disk,result.attempt,locks);assert.equal(disk.getItem(sdk.privateEstimatePublicationWriteKey(actor)),null);
});
await test('a forged ACK timestamp cannot replace independent proof and the next check sends zero POSTs',async()=>{
 const {attempt,disk}=await setup(),ack={action:'claim',publication},forged={action:'claim',publication:{...publication,createdAt:'2026-11-11T18:00:00Z'}};let committed=false,posts=0;
 await assert.rejects(()=>sdk.continuePrivateEstimatePublicationWrite({store:disk,attempt,request:async(url,init)=>{if(init.method==='POST'){posts++;committed=true;return response(forged);}return response({receipt:committed?{inputHash:attempt.inputHash,result:ack}:null});},currentAccount:()=>actor,currentTarget:()=>attempt.target,mode:'retry',onCheckpoint:()=>{},locks}));
 const retained=sdk.readPrivateEstimatePublicationWrite(disk,actor);assert.equal(retained.phase,'uncertain');assert.equal(retained.body,attempt.body);
 const result=await sdk.continuePrivateEstimatePublicationWrite({store:disk,attempt:retained,request:async(url,init)=>{assert.notEqual(init.method,'POST');return response(url.includes('view=action')?{receipt:{inputHash:attempt.inputHash,result:ack}}:{publication,side:'client',canRespond:true,canWithdraw:false,canRespondChanges:false,recipient:null});},currentAccount:()=>actor,currentTarget:()=>attempt.target,mode:'check',onCheckpoint:()=>{},locks});
 assert.equal(result.status,'confirmed');assert.equal(posts,1);assert.equal(result.attempt.body,null);
});
await test('actor mismatch and local storage failure stop all network before a new write',async()=>{
 const {attempt,disk}=await setup();let calls=0;
 const common={store:disk,attempt,request:async()=>{calls++;throw Error();},currentAccount:()=>crypto.randomUUID(),currentTarget:()=>attempt.target,mode:'retry',onCheckpoint:()=>{},locks};
 await assert.rejects(()=>sdk.continuePrivateEstimatePublicationWrite(common));assert.equal(calls,0);
 await assert.rejects(()=>sdk.continuePrivateEstimatePublicationWrite({...common,currentAccount:()=>actor,store:{...disk,setItem:()=>{throw Error('quota');}}}));assert.equal(calls,0);
});
await test('a foreign conversation may check a receipt but cannot retry its serialized mutation',async()=>{
 const {attempt,disk}=await setup();let posts=0,gets=0;
 const request=async(_url,init)=>{if(init.method==='POST')posts++;else gets++;return response({receipt:null});};
 const common={store:disk,attempt,request,currentAccount:()=>actor,currentTarget:()=>'publication:'+crypto.randomUUID(),onCheckpoint:()=>{},locks};
 assert.equal((await sdk.continuePrivateEstimatePublicationWrite({...common,mode:'check'})).status,'missing');
 await assert.rejects(()=>sdk.continuePrivateEstimatePublicationWrite({...common,mode:'retry'}));
 assert.equal(posts,0);assert.equal(gets,2);assert.equal(sdk.readPrivateEstimatePublicationWrite(disk,actor).body,attempt.body);
});
await test('a later actor journal cannot be overwritten or cleared by an older attempt',async()=>{
 const {attempt,disk}=await setup(),newer=await sdk.createPrivateEstimatePublicationWrite(actor,{action:'claim',actionId:crypto.randomUUID(),code:'c'.repeat(64)});
 sdk.savePrivateEstimatePublicationWrite(disk,newer);const exact=disk.getItem(sdk.privateEstimatePublicationWriteKey(actor));let calls=0;
 await assert.rejects(()=>sdk.continuePrivateEstimatePublicationWrite({store:disk,attempt,request:async()=>{calls++;throw Error();},currentAccount:()=>actor,currentTarget:()=>attempt.target,mode:'check',onCheckpoint:()=>{},locks}));
 assert.equal(calls,0);assert.equal(disk.getItem(sdk.privateEstimatePublicationWriteKey(actor)),exact);
 await assert.rejects(()=>sdk.clearPrivateEstimatePublicationWrite(disk,attempt,locks));assert.equal(disk.getItem(sdk.privateEstimatePublicationWriteKey(actor)),exact);
});
await test('claim proof cannot smuggle acceptance as a side effect of linking an account',async()=>{
 const {attempt,disk}=await setup(),forged={action:'claim',publication:{...publication,status:'accepted'}};let posts=0;
 await assert.rejects(()=>sdk.continuePrivateEstimatePublicationWrite({store:disk,attempt,request:async(_url,init)=>{if(init.method==='POST')posts++;return response({receipt:{inputHash:attempt.inputHash,result:forged}});},currentAccount:()=>actor,currentTarget:()=>attempt.target,mode:'check',onCheckpoint:()=>{},locks}));
 assert.equal(posts,0);assert.equal(sdk.readPrivateEstimatePublicationWrite(disk,actor).body,attempt.body);
});
await test('owner manual handoff retains its code after verified proof until explicit Done clears it',async()=>{
 const input={action:'publish',actionId:crypto.randomUUID(),publicationId,estimateId:crypto.randomUUID(),estimateRevision:1,recipient:{kind:'claim',email:'client@example.test',code}},attempt=await sdk.createPrivateEstimatePublicationWrite(actor,input,null,content),disk=store(),ownerPublication={...publication,estimateId:input.estimateId,revision:1,status:'awaiting_claim',recipientBound:false},ack={action:'publish',publication:ownerPublication};
 sdk.savePrivateEstimatePublicationWrite(disk,attempt);
 const result=await sdk.continuePrivateEstimatePublicationWrite({store:disk,attempt,request:async(url,init)=>{assert.notEqual(init.method,'POST');return response(url.includes('view=action')?{receipt:{inputHash:attempt.inputHash,result:ack}}:{publication:ownerPublication,side:'owner',canRespond:false,canWithdraw:true,canRespondChanges:false,recipient:{recipientId:null,email:'client@example.test'}});},currentAccount:()=>actor,currentTarget:()=>attempt.target,mode:'check',onCheckpoint:()=>{},locks});
 assert.equal(result.status,'confirmed');assert.equal(result.attempt.body,attempt.body);assert.ok(disk.getItem(sdk.privateEstimatePublicationWriteKey(actor)).includes(code));
 await sdk.clearPrivateEstimatePublicationWrite(disk,result.attempt,locks);assert.equal(disk.getItem(sdk.privateEstimatePublicationWriteKey(actor)),null);
});
await test('an owner reply preserves changes_requested and cannot reopen the customer decision',async()=>{
 const baseline={...publication,estimateId:crypto.randomUUID(),revision:3,status:'changes_requested'},input={action:'respond_changes',actionId:crypto.randomUUID(),publicationId,revision:3,contentHash:baseline.contentHash,note:'Aclaración del proveedor'},attempt=await sdk.createPrivateEstimatePublicationWrite(actor,input,baseline),disk=store(),valid={action:'respond_changes',publication:{...baseline,revision:4,status:'changes_requested'}};
 sdk.savePrivateEstimatePublicationWrite(disk,attempt);
 const checked=await sdk.continuePrivateEstimatePublicationWrite({store:disk,attempt,request:async(url,init)=>{assert.notEqual(init.method,'POST');return response(url.includes('view=action')?{receipt:{inputHash:attempt.inputHash,result:valid}}:{publication:valid.publication,side:'owner',canRespond:false,canWithdraw:true,canRespondChanges:true,recipient:{recipientId:crypto.randomUUID(),email:null}});},currentAccount:()=>actor,currentTarget:()=>attempt.target,mode:'check',onCheckpoint:()=>{},locks});
 assert.equal(checked.status,'confirmed');assert.equal(checked.result.publication.status,'changes_requested');
 const badDisk=store();sdk.savePrivateEstimatePublicationWrite(badDisk,attempt);let sent=false;const forged={action:'respond_changes',publication:{...baseline,revision:4,status:'shared'}};
 await assert.rejects(()=>sdk.continuePrivateEstimatePublicationWrite({store:badDisk,attempt,request:async(_url,init)=>{if(init.method==='POST'){sent=true;return response(forged);}return response({receipt:sent?{inputHash:attempt.inputHash,result:forged}:null});},currentAccount:()=>actor,currentTarget:()=>attempt.target,mode:'retry',onCheckpoint:()=>{},locks}));
 const retained=sdk.readPrivateEstimatePublicationWrite(badDisk,actor);assert.equal(retained.phase,'uncertain');assert.equal(retained.body,attempt.body);assert.equal(retained.ack,null);
});
console.log(`${passed} recovery contracts passed; no database, browser or network.`);
