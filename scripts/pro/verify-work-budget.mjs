import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const root=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(root)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(root)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const d=await import('../../src/lib/pro/work-budget.ts'),sdk=await import('../../src/lib/pro/work-budget-recovery.ts'),time=await import('../../src/lib/pro/work-costs.ts');
const actor=crypto.randomUUID(),work=crypto.randomUUID(),client='owned-private-client',hash='a'.repeat(32),nextHash='b'.repeat(32);
const locks={request:async(_name,_options,run)=>run({})},ok=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
const totals=(planned=100,actual=4,unknown=0)=>({plannedCents:planned,actualCents:actual,unknownMinutes:unknown,unknownCount:unknown?1:0,sourceCount:2,varianceCents:planned===null||unknown?null:planned-actual});
const overview=()=>d.workBudgetOverviewSchema.parse({work:{id:work,clientId:client,title:'Trabajo privado',cancelled:false,clientArchived:false},currency:'CRC',revision:0,metadataFingerprint:hash,sourceFingerprint:hash,fingerprint:hash,canWrite:true,suggestedItemCode:'001',suggestedGroupCode:'G001',codeCount:0,summary:totals(null),unassigned:totals(null)});
function store(){const values=new Map();return{values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
async function setup(){const id=crypto.randomUUID(),input=d.workBudgetMutationSchema.parse({action:'save_item',actionId:crypto.randomUUID(),workId:work,clientId:client,revision:0,id,code:'c-01',title:'Cost code ñ',parentId:null,plannedCents:100}),code={id,kind:'item',code:'C-01',title:'Cost code ñ',parentId:null,plannedCents:100,archived:false},result={action:'save_item',workId:work,revision:1,metadataFingerprint:nextHash,code,assignment:null},current={...overview(),revision:1,metadataFingerprint:nextHash,codeCount:1,summary:totals(100)},disk=store(),attempt=await sdk.createWorkBudgetWrite(actor,input,overview());sdk.saveWorkBudgetWrite(disk,attempt);disk.setItem('ccr:pro:work-cost-write:v1:'+actor+':'+work,'OLD_COST_JOURNAL');return{input,result,current,disk,attempt,calls:[]};}
function requestFor(f,{missing=false,current=f.current}={}){return async(url,init={})=>{f.calls.push({url,method:init.method??'GET',body:init.body});return ok(url.includes('view=action')?{receipt:missing?null:{input:f.input,result:f.result}}:current);};}
const run=(f,request,mode='check',extra={})=>sdk.continueWorkBudgetWrite({store:f.disk,attempt:f.attempt,request,currentAccount:()=>actor,currentWork:()=>work,mode,onCheckpoint:r=>{f.attempt=r;},locks,...extra});
let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name);}
await test('strict planned item/group inputs normalize codes and reject grandchildren, missing customer and invalid money',async()=>{
 const f=await setup();assert.equal(f.input.code,'C-01');
 for(const patch of [{clientId:undefined},{plannedCents:-1},{plannedCents:0.5},{plannedCents:9000000000001},{extra:'unexpected'},{title:'bad\u0000title'}])assert.throws(()=>d.workBudgetMutationSchema.parse({...f.input,...patch}));
 assert.throws(()=>d.workBudgetCodeSchema.parse({...f.result.code,kind:'group'}));
 assert.throws(()=>d.workBudgetCodeSchema.parse({...f.result.code,kind:'group',plannedCents:null,parentId:crypto.randomUUID()}));
 const parent={...f.result.code,id:crypto.randomUUID(),kind:'group',parentId:null,plannedCents:null};
 assert.throws(()=>d.workBudgetCodeDetailSchema.parse({workId:work,revision:1,fingerprint:hash,code:{...f.result.code,parentId:parent.id},parent:{...parent,kind:'item',plannedCents:0},totals:totals()}));
});
await test('unknown hours keep variance incomplete, zero rates remain known and recorded time rounds per entry',()=>{
 assert.equal(time.workTimeCost(1,30),1);assert.equal(time.workTimeCost(1,30)+time.workTimeCost(1,30),2);assert.equal(time.workTimeCost(2,30),1);
 assert.equal(time.workTimeCost(15,null),null);assert.equal(time.workTimeCost(15,0),0);
 assert.equal(d.workBudgetTotalsSchema.parse(totals(100,104,15)).varianceCents,null);
 assert.equal(d.workBudgetTotalsSchema.parse(totals(100,104)).varianceCents,-4);
 assert.throws(()=>d.workBudgetTotalsSchema.parse({...totals(100,104,15),varianceCents:-4}));
});
await test('typed source identities allow the same UUID across material/time but refuse duplicate identities and mismatched code metadata',()=>{
 const id=crypto.randomUUID(),base={id,fingerprint:hash,title:'Fuente',date:'2024-02-29',codeId:null,code:null};
 const material={...base,kind:'material',amountCents:1,minutes:null,unknownMinutes:0},timed={...base,kind:'time',amountCents:null,minutes:15,unknownMinutes:15};
 assert.equal(d.workBudgetCostsPageSchema.parse({workId:work,revision:0,fingerprint:hash,items:[material,timed],nextCursor:null}).items.length,2);
 assert.throws(()=>d.workBudgetCostsPageSchema.parse({workId:work,revision:0,fingerprint:hash,items:[material,material],nextCursor:null}));
 assert.throws(()=>d.workBudgetCostSchema.parse({...timed,unknownMinutes:0}));assert.throws(()=>d.workBudgetCostSchema.parse({...material,codeId:crypto.randomUUID()}));
 assert.throws(()=>d.workBudgetOverviewSchema.parse({...overview(),currency:'USD'}));
});
await test('history binds immutable source and from/to code labels to its exact typed assignment',async()=>{
 const f=await setup(),sourceId=crypto.randomUUID(),input={action:'assign',actionId:crypto.randomUUID(),workId:work,clientId:client,revision:0,source:{kind:'expense',id:sourceId,fingerprint:hash},codeId:f.result.code.id};
 const result={action:'assign',workId:work,revision:1,metadataFingerprint:nextHash,code:null,assignment:{kind:'expense',id:sourceId,codeId:f.result.code.id}};
 const context={source:{kind:'expense',id:sourceId,title:'Original transport',date:'2024-02-29',amountCents:100,minutes:null},fromCode:null,toCode:{...f.result.code}};
 const event=d.workBudgetHistorySchema.parse({actionId:input.actionId,at:'2026-11-10T18:00:00Z',input,before:{kind:'expense',id:sourceId,codeId:null},result,context});
 context.source.title='Later transport rename';context.toCode.title='Later code rename';
 assert.equal(event.context.source.title,'Original transport');assert.equal(event.context.toCode.title,'Cost code ñ');
 assert.throws(()=>d.workBudgetHistorySchema.parse({...event,context:null}));
 assert.throws(()=>d.workBudgetHistorySchema.parse({...event,context:{...event.context,source:{...event.context.source,kind:'time'}}}));
 assert.throws(()=>d.workBudgetHistorySchema.parse({...event,context:{...event.context,toCode:{...event.context.toCode,id:crypto.randomUUID()}}}));
 assert.throws(()=>d.workBudgetHistorySchema.parse({actionId:f.input.actionId,at:'2026-11-10T18:00:00Z',input:f.input,before:null,result:f.result,context:event.context}));
});
await test('missing restored check is GET-only and preserves raw intent plus the old cost journal',async()=>{
 const f=await setup(),checked=await run(f,requestFor(f,{missing:true}));assert.equal(checked.status,'missing');assert.deepEqual(f.calls.map(row=>row.method),['GET']);assert.equal(f.attempt.body,JSON.stringify(f.input));assert.equal(f.disk.getItem('ccr:pro:work-cost-write:v1:'+actor+':'+work),'OLD_COST_JOURNAL');
 await assert.rejects(()=>sdk.clearWorkBudgetWrite(f.disk,f.attempt,locks));
});
await test('exact retry proves independently before canonical metadata and clears only its own namespace',async()=>{
 const f=await setup();let committed=false;
 const checked=await run(f,async(url,init={})=>{f.calls.push({method:init.method??'GET',body:init.body});if(init.method==='POST'){committed=true;assert.equal(init.body,JSON.stringify(f.input));return ok(f.result);}return ok(url.includes('view=action')?{receipt:committed?{input:f.input,result:f.result}:null}:f.current);},'retry');
 assert.equal(checked.status,'confirmed');assert.deepEqual(f.calls.map(row=>row.method),['GET','POST','GET','GET']);await sdk.clearWorkBudgetWrite(f.disk,checked.attempt,locks);assert.equal(f.disk.getItem(sdk.workBudgetWriteKey(actor,work)),null);assert.equal(f.disk.getItem('ccr:pro:work-cost-write:v1:'+actor+':'+work),'OLD_COST_JOURNAL');
});
await test('a forged ACK cannot replace immutable proof and the next correct Check sends zero extra POST',async()=>{
 const f=await setup();let committed=false,posts=0;
 await assert.rejects(()=>run(f,async(_url,init={})=>{if(init.method==='POST'){posts++;committed=true;return ok({...f.result,metadataFingerprint:'c'.repeat(32)});}return ok({receipt:committed?{input:f.input,result:f.result}:null});},'retry'));
 assert.equal(f.attempt.phase,'uncertain');assert.equal(f.attempt.ack,null);assert.equal(f.attempt.body,JSON.stringify(f.input));assert.equal((await run(f,requestFor(f))).status,'confirmed');assert.equal(posts,1);assert.equal(f.calls.filter(row=>row.method==='POST').length,0);
});
await test('later actual costs do not invalidate a metadata receipt but contradictory metadata does',async()=>{
 const f=await setup(),changed={...f.current,sourceFingerprint:'c'.repeat(32),fingerprint:'d'.repeat(32),summary:totals(100,90,15)};
 const checked=await run(f,requestFor(f,{current:changed}));assert.equal(checked.status,'confirmed');assert.deepEqual(checked.result,f.result);assert.equal(checked.current.summary.unknownMinutes,15);
 const next=await setup();await assert.rejects(()=>run(next,requestFor(next,{current:{...next.current,metadataFingerprint:'c'.repeat(32)}})));await assert.rejects(()=>sdk.clearWorkBudgetWrite(next.disk,next.attempt,locks));
});
await test('captured customer binding fails closed before network and canonical metadata cannot move the work to another customer',async()=>{
 const f=await setup();await assert.rejects(()=>sdk.createWorkBudgetWrite(actor,{...f.input,clientId:'other'},overview()));
 await assert.rejects(()=>run(f,requestFor(f,{current:{...f.current,work:{...f.current.work,clientId:'other'}}})));await assert.rejects(()=>sdk.clearWorkBudgetWrite(f.disk,f.attempt,locks));
});
await test('account/work scopes, storage quota and denied locks prevent unintended writes',async()=>{
 const f=await setup();let calls=0;const request=async()=>{calls++;throw Error('Unexpected request');};
 await assert.rejects(()=>run(f,request,'retry',{currentAccount:()=>crypto.randomUUID()}));await assert.rejects(()=>run(f,request,'retry',{store:{...f.disk,setItem:()=>{throw Error('quota');}}}));await assert.rejects(()=>run(f,request,'retry',{locks:{request:async(_key,_opts,callback)=>callback(null)}}));assert.equal(calls,0);
 const other=await setup();await assert.rejects(()=>run(other,requestFor(other,{missing:true}),'retry',{currentWork:()=>crypto.randomUUID()}));assert.equal(other.calls.filter(row=>row.method==='POST').length,0);
});
await test('a newer same-work journal cannot be overwritten or cleared by an old handler',async()=>{
 const f=await setup(),newer=await setup();sdk.saveWorkBudgetWrite(f.disk,newer.attempt);const raw=f.disk.getItem(sdk.workBudgetWriteKey(actor,work));let calls=0;
 await assert.rejects(()=>run(f,async()=>{calls++;throw Error();}));await assert.rejects(()=>sdk.clearWorkBudgetWrite(f.disk,f.attempt,locks));assert.equal(calls,0);assert.equal(f.disk.getItem(sdk.workBudgetWriteKey(actor,work)),raw);
});
console.log(`${count} work-budget contracts passed; no database, browser or network.`);
