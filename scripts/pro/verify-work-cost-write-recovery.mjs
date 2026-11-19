// Pure recovery/state simulation. No browser, DB, network or external writes.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const root=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(root)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const h=await import('../../src/lib/pro/work-cost-write-recovery.ts'),uid=()=>crypto.randomUUID(),actor=uid(),clientId='legacy-client',workId='legacy-work',date='2026-01-01',at='2026-01-01T18:00:00.000Z',supplier={id:uid(),name:'Private supplier'};
const time=(id=uid())=>({id,kind:'time',date,minutes:90,hourlyCostCents:10000,amountCents:15000,note:'One actual service',expenseId:null,supplierName:null,reversalId:null,reversed:false,at});
const expense={id:uid(),concept:'Travel',supplierName:supplier.name,date,amountCents:2500};
const expenseEntry=()=>({id:uid(),kind:'expense',date,minutes:null,hourlyCostCents:null,amountCents:expense.amountCents,note:expense.concept,expenseId:expense.id,supplierName:supplier.name,reversalId:null,reversed:false,at});
const page=(items=[])=>({revision:7,expenseRevision:3,fingerprint:'initial',work:{id:workId,clientId,title:'Private service',cancelled:false,clientArchived:false},summary:{minutes:0,uncostedMinutes:0,uncostedCount:0,laborCents:0,materialCents:0,expensesCents:0,totalCostCents:0,agreedCents:100000,resultCents:100000},items,nextCursor:null});
function storage(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};}
function intent(action,baseline){const common={action,clientId,workId,requestId:uid(),revision:7};return action==='add_time'?{...common,date,minutes:90,hourlyCostCents:10000,note:'One actual service'}:action==='edit_time'?{...common,entryId:baseline.id,reason:'Correct actual time',date,minutes:120,hourlyCostCents:9000,note:'Corrected service'}:action==='void_time'||action==='unlink_expense'?{...common,entryId:baseline.id,reason:'Incorrect allocation'}:action==='create_expense'?{...common,expenseId:uid(),supplierId:supplier.id,date,concept:'Travel',amountCents:2500,expenseRevision:3}:{...common,expenseId:expense.id,expenseRevision:3};}
function simulator(initial=page()){
 let current=structuredClone(initial),before=null,after=null,readError=false,ackFault=null,transform=null;
 const receipts=new Map(),posts=[],reads=[],finance={agreements:[{amountCents:100000}],payments:[{amountCents:1000}],stock:[{id:'stock',quantity:5}]};
 const request=async(url,init)=>{
  assert.equal(init.headers['X-Pro-Expected-Actor'],actor);
  if(init.method==='POST'){
   posts.push(init.body);if(before)return Response.json({error:'Synthetic rejection'},{status:before});const input=JSON.parse(init.body);let saved=receipts.get(input.requestId);
   if(saved)assert.equal(saved.body,init.body);else{
    assert.equal(input.revision,current.revision);let row;
    if(['edit_time','void_time','unlink_expense'].includes(input.action)){
     const original=current.items.find(row=>row.id===input.entryId);assert.ok(original&&!original.reversed);original.reversed=true;
     const reversal={...original,id:input.action==='edit_time'?uid():input.requestId,kind:input.action==='unlink_expense'?'expense_unlink':'time_void',note:input.reason,reversalId:original.id,reversed:false};current.items.unshift(reversal);row=reversal;
    }
    if(['add_time','edit_time'].includes(input.action)){
     row={...time(input.requestId),date:input.date,minutes:input.minutes,hourlyCostCents:input.hourlyCostCents,amountCents:input.hourlyCostCents===null?null:Number((BigInt(input.minutes)*BigInt(input.hourlyCostCents)+30n)/60n),note:input.note};current.items.unshift(row);
    }
    if(['create_expense','link_expense'].includes(input.action)){
     row={...expenseEntry(),id:input.requestId,expenseId:input.expenseId};if(input.action==='create_expense')current.expenseRevision++;current.items.unshift(row);
    }
    current.revision++;current.fingerprint='rev'+current.revision+'expense'+current.expenseRevision;
    saved={body:init.body,ack:{id:input.requestId,revision:current.revision,expenseRevision:current.expenseRevision}};receipts.set(input.requestId,saved);
   }
   if(after){const status=after;after=null;return Response.json({error:'Synthetic lost ACK'},{status});}
   return Response.json(ackFault??saved.ack);
  }
  reads.push(url);if(readError)return Response.json({error:'Read unavailable'},{status:503});const query=new URL(url,'http://local.invalid').searchParams;assert.equal(query.get('clientId'),clientId);assert.equal(query.get('workId'),workId);const offset=Number(query.get('after')||0),items=current.items.slice(offset,offset+20),value={...current,items,nextCursor:current.items.length>offset+20?String(offset+20):null};return Response.json(transform?transform(value):value);
 };
 return {request,posts,reads,receipts,finance,get page(){return current;},setBefore:value=>before=value,setAfter:value=>after=value,setReadError:value=>readError=value,setAck:value=>ackFault=value,setTransform:value=>transform=value};
}
const run=(store,attempt,api,overrides={})=>h.continueWorkCostWrite({store,attempt,request:api.request,currentAccount:()=>actor,currentClient:()=>clientId,currentWork:()=>workId,onCheckpoint:()=>{},...overrides});
const fails=kind=>error=>error instanceof h.WorkCostWriteFailure&&error.kind===kind;
const create=()=>h.createWorkCostWrite(actor,intent('add_time'),page());
for(const action of ['add_time','edit_time','void_time','create_expense','link_expense','unlink_expense']){
 const baseline=action==='unlink_expense'?expenseEntry():time(),initial=page(['edit_time','void_time','unlink_expense'].includes(action)?[baseline]:[]),api=simulator(initial),store=storage(),input=intent(action,baseline),attempt=h.createWorkCostWrite(actor,input,initial,{expense,supplier}),finance=structuredClone(api.finance);
 api.setAfter(503);await assert.rejects(()=>run(store,attempt,api),fails('uncertain'));const body=api.posts[0];
 for(const status of [401,403,400,409]){api.setBefore(status);await assert.rejects(()=>run(store,h.readWorkCostWrite(store,actor,clientId,workId),api),fails('uncertain'));assert.equal(h.readWorkCostWrite(store,actor,clientId,workId).body,body);}
 api.setBefore(null);const result=await run(store,h.readWorkCostWrite(store,actor,clientId,workId),api);assert.equal(result.status,'confirmed');assert.equal(result.entry.id,input.requestId);assert.equal(api.receipts.size,1);assert.equal(new Set(api.posts).size,1);assert.deepEqual(api.finance,finance);assert.equal(api.page.items.length,action==='edit_time'?3:['void_time','unlink_expense'].includes(action)?2:1);assert.deepEqual(result.attempt.ack,{id:input.requestId,revision:8,expenseRevision:action==='create_expense'?4:3});
 const postCount=api.posts.length;await run(store,result.attempt,api);assert.equal(api.posts.length,postCount);h.clearWorkCostWrite(store,result.attempt);assert.equal(h.readWorkCostWrite(store,actor,clientId,workId),null);
}
for(const mode of ['get','set','readback']){
 const store=storage(),api=simulator();if(mode==='get')store.getItem=()=>{throw Error('Denied');};if(mode==='set')store.setItem=()=>{throw Error('Quota');};if(mode==='readback'){const set=store.setItem;let written=false;store.setItem=(k,v)=>{written=true;set(k,v);};const get=store.getItem;store.getItem=k=>written?'bad':get(k);}
 await assert.rejects(()=>run(store,create(),api),fails('storage'));assert.equal(api.posts.length,0);
}
{
 const store=storage(),a=create();h.saveWorkCostWrite(store,a);assert.throws(()=>h.saveWorkCostWrite(store,create()));
 for(const value of [{...a,extra:true},{...a,workId:'other'},{...a,clientId:'other'},{...a,phase:'confirmed'},{...a,ack:{id:uid(),revision:8,expenseRevision:3}}])assert.throws(()=>h.parseWorkCostWrite(value,actor,clientId,workId));
 store.setItem(h.workCostWriteKey(actor,clientId,workId),'{bad');assert.throws(()=>h.readWorkCostWrite(store,actor,clientId,workId));await assert.rejects(()=>run(store,a,simulator()),fails('storage'));
}
for(const current of ['currentAccount','currentClient','currentWork']){const api=simulator();await assert.rejects(()=>run(storage(),create(),api,{[current]:()=>undefined}),fails('scope'));assert.equal(api.posts.length,0);}
for(const status of [400,404,409,422]){const store=storage(),api=simulator(),a=create();api.setBefore(status);assert.equal((await run(store,a,api)).status,'rejected');assert.equal(h.readWorkCostWrite(store,actor,clientId,workId),null);}
for(const ack of [{id:uid(),revision:8,expenseRevision:3},{id:null,revision:8,expenseRevision:3},{id:undefined,revision:8,expenseRevision:3},{revision:9,expenseRevision:3},{revision:8,expenseRevision:2}]){
 const store=storage(),api=simulator(),a=create();api.setAck({id:JSON.parse(a.body).requestId,...ack});await assert.rejects(()=>run(store,a,api),fails('uncertain'));assert.equal(h.readWorkCostWrite(store,actor,clientId,workId).phase,'uncertain');assert.equal(api.receipts.size,1);
}
// Confirmed ACK must remain read-only, including later metadata and history pages.
{
 const baseline=time(),api=simulator(page([baseline])),store=storage(),a=h.createWorkCostWrite(actor,intent('edit_time',baseline),api.page);api.setReadError(true);await assert.rejects(()=>run(store,a,api),fails('read'));const saved=h.readWorkCostWrite(store,actor,clientId,workId);assert.equal(saved.phase,'confirmed');api.setReadError(false);api.page.items.unshift(...Array.from({length:23},()=>time()));api.page.revision++;api.page.fingerprint='newer';const result=await run(store,saved,api);assert.equal(result.status,'confirmed');assert.equal(result.newer,true);assert.equal(api.posts.length,1);assert.equal(result.page.items.length,26);
}
{
 const api=simulator(),store=storage(),a=h.createWorkCostWrite(actor,intent('link_expense'),api.page,{expense});api.setReadError(true);await assert.rejects(()=>run(store,a,api),fails('read'));api.setReadError(false);api.page.expenseRevision++;Object.assign(api.page.items[0],{date:'2026-02-01',note:'Legitimate updated concept',supplierName:'Updated supplier',amountCents:3500});const result=await run(store,h.readWorkCostWrite(store,actor,clientId,workId),api);assert.equal(result.entry.amountCents,3500);assert.equal(api.posts.length,1);
}
for(const mutation of [value=>({...value,work:{...value.work,id:'other'}}),value=>({...value,revision:0}),value=>({...value,items:value.items.map(row=>({...row,minutes:91,amountCents:15167}))}),value=>({...value,items:[],nextCursor:'20'})]){
 const api=simulator(),store=storage(),a=create();api.setTransform(mutation);await assert.rejects(()=>run(store,a,api),fails('read'));assert.equal(h.readWorkCostWrite(store,actor,clientId,workId).phase,'confirmed');assert.equal(api.posts.length,1);
}
// A loaded-more UI view can exceed one API page. Each individual GET remains capped.
{
 const view=page(Array.from({length:25},()=>time()));assert.equal(h.createWorkCostWrite(actor,intent('add_time'),view).workId,workId);assert.throws(()=>h.workCostsRecoveryPageSchema.parse(view));
 const api=simulator(),store=storage(),a=create();api.setTransform(value=>({...value,items:Array.from({length:21},()=>time())}));await assert.rejects(()=>run(store,a,api),fails('read'));assert.equal(api.posts.length,1);
}
console.log('PASS: six WorkCosts actions, exact durable receipts/ACK/canonical history, uncertain auth/reload, confirmed reads only, pagination, later expense metadata, storage/scope guards and unchanged commercial/stock data.');
