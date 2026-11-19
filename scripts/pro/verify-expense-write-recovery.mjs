// Pure recovery/transport tests only. No server, browser, database or real requests.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),modules={};
function load(name){if(modules[name])return modules[name];const loaded={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/pro/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='./expenses'?load('expenses'):require(name),loaded,loaded.exports);return modules[name]=loaded.exports;}
const h=load('expense-write-recovery'),uid=()=>crypto.randomUUID(),owner=uid(),other=uid(),supplierId=uid(),expenseId=uid();
function storage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};}
const supplier={action:'supplier',actionId:uid(),revision:0,id:supplierId,name:'Original',identification:'101230456',email:'local@example.test',phone:'88881111',archived:false};
const expense={action:'expense',actionId:uid(),revision:0,id:expenseId,supplierId,date:'2026-11-08',dueDate:'2026-12-08',currency:'CRC',concept:'Conservar concepto',amountCents:12345};
const fields={supplierName:'Original',supplierEmail:'local@example.test',concept:'Conservar concepto',amount:'123.45',date:'2026-11-08',dueDate:'2026-12-08'};
const attempt=()=>h.createExpenseWrite(owner,{...supplier,actionId:uid()},{name:'Original',phone:'88881111'});
const checkpoint=()=>{};
function server(){
 const receipts=new Map(),suppliers=new Map(),expenses=new Map(),payments=[];let revision=0;
 const posts=[];let postFault=null,getFault=false;
 const request=async(url,init)=>{
  if(init?.method==='POST'){
   posts.push(init.body);const input=JSON.parse(init.body);
   if(postFault?.before)return Response.json({error:'Local simulated rejection'},{status:postFault.before});
   let result=receipts.get(input.actionId);
   if(!result){
    if(input.revision!==revision)return Response.json({error:'Changed revision'},{status:409});
    revision++;result={id:h.expenseWriteResultId(input),revision};receipts.set(input.actionId,result);
    if(input.action==='supplier')suppliers.set(input.id,input);
    else if(input.action==='expense')expenses.set(input.id,{...input,paidCents:0,balanceCents:input.amountCents,supplierName:'Original',status:'pending'});
    else payments.push({...input,id:input.actionId,kind:input.action==='payment'?'payment':'reverse',paymentId:input.action==='reverse'?input.paymentId:null,createdAt:'2026-11-08T00:00:00Z',reversed:false});
   }
   if(postFault?.after){const status=postFault.after;postFault=null;return Response.json({error:'Lost acknowledgement'},{status});}
   return Response.json(result);
  }
  if(getFault)throw Error('Local failed canonical read');
  const query=new URL(url,'http://local.invalid').searchParams,id=query.get('id');
  return Response.json(query.get('kind')==='suppliers'?{revision,items:[suppliers.get(id)].filter(Boolean),nextCursor:null}:{revision,items:[],nextCursor:null,expense:expenses.get(id),payments});
 };
 return {request,posts,receipts,suppliers,expenses,payments,setPostFault:value=>{postFault=value;},setGetFault:value=>{getFault=value;},advance:()=>revision++,get revision(){return revision;}};
}
async function run(store,a,api){return h.continueExpenseWrite({store,attempt:a,request:api.request,currentAccount:()=>owner,onCheckpoint:checkpoint});}
function failure(kind){return error=>error instanceof h.ExpenseWriteFailure&&error.kind===kind;}
// Strict scope, identity, complete draft preservation and no accidental overwrite.
{
 const store=storage(),a=attempt();h.saveExpenseWrite(store,a);assert.deepEqual(h.readExpenseWrite(store,owner),a);assert.equal(h.readExpenseWrite(store,other),null);
 assert.throws(()=>h.readExpenseWrite(store,''));assert.throws(()=>h.saveExpenseWrite(store,attempt()));
 for(const bad of [{...a,unknown:true},{...a,accountId:other},{...a,steps:[{...a.steps[0],unknown:true}]},{...a,fields:{...a.fields,unsafe:'x'}},{...a,steps:[{...a.steps[0],phase:'confirmed',ack:{id:supplierId,revision:0}}]}])assert.throws(()=>h.validateExpenseWrite(bad,owner));
 store.setItem(h.expenseWriteRecoveryKey(owner),'{bad');assert.throws(()=>h.readExpenseWrite(store,owner));assert.throws(()=>h.saveExpenseWrite(store,a));assert.equal(store.getItem(h.expenseWriteRecoveryKey(owner)),'{bad');
}
// No POST unless a write and readback both work. Different accounts cannot send.
for(const mode of ['get','set','readback']){
 const store=storage(),api=server(),a=attempt();let writes=0;
 if(mode==='get')store.getItem=()=>{throw Error('Storage unavailable');};
 if(mode==='set')store.setItem=()=>{throw Error('Quota exceeded');};
 if(mode==='readback'){const get=store.getItem;store.getItem=key=>writes?'tampered':get(key);const set=store.setItem;store.setItem=(key,value)=>{writes++;set(key,value);};}
 await assert.rejects(()=>run(store,a,api),failure('storage'));assert.equal(api.posts.length,0);
}
{
 const api=server();await assert.rejects(()=>h.continueExpenseWrite({store:storage(),attempt:attempt(),request:api.request,currentAccount:()=>other,onCheckpoint:checkpoint}),failure('scope'));assert.equal(api.posts.length,0);
}
// Lost ACK -> 401 -> 403 -> 400 -> 409 -> reload keeps exact request bytes/UUID.
{
 const store=storage(),api=server(),a=attempt();api.setPostFault({after:503});await assert.rejects(()=>run(store,a,api),failure('uncertain'));const bytes=api.posts[0];
 for(const status of [401,403,400,409]){api.setPostFault({before:status});await assert.rejects(()=>run(store,h.readExpenseWrite(store,owner),api),failure('uncertain'));assert.equal(h.readExpenseWrite(store,owner).steps[0].body,bytes);}
 api.setPostFault(null);const result=await run(store,h.readExpenseWrite(store,owner),api);assert.equal(result.status,'complete');assert.equal(new Set(api.posts).size,1);assert.equal(api.suppliers.size,1);assert.equal(h.readExpenseWrite(store,owner),null);
}
// A first definitive rejection releases only an attempt that has no uncertain history.
for(const status of [400,409]){const store=storage(),api=server();api.setPostFault({before:status});assert.equal((await run(store,attempt(),api)).status,'rejected');assert.equal(h.readExpenseWrite(store,owner),null);}
// Confirmed ACK survives a failed read; retry reads only. Historical global revision can advance legitimately.
{
 const store=storage(),api=server(),a=attempt();api.setGetFault(true);await assert.rejects(()=>run(store,a,api),failure('read'));let saved=h.readExpenseWrite(store,owner);assert.equal(saved.steps[0].phase,'confirmed');assert.equal(api.posts.length,1);
 api.advance();api.suppliers.get(supplierId).name='Later legitimate edit';api.setGetFault(false);assert.equal((await run(store,saved,api)).status,'complete');assert.equal(api.posts.length,1);
}
// ACK persistence failure retains the acknowledged in-memory checkpoint, never replacing it with older disk state.
{
 const store=storage(),api=server(),a=attempt(),set=store.setItem;store.setItem=(key,value)=>{if(JSON.parse(value).steps[0].phase==='confirmed')throw Error('Temporary quota');set(key,value);};
 let known;try{await run(store,a,api);}catch(error){assert.ok(failure('storage')(error));known=error.attempt;}
 assert.equal(known.steps[0].phase,'confirmed');assert.equal(h.mergeExpenseWrite(h.readExpenseWrite(store,owner),known).steps[0].phase,'confirmed');
 store.setItem=set;assert.equal((await run(store,known,api)).status,'complete');assert.equal(api.posts.length,1);
}
// Removal failure keeps the confirmed receipt until storage is readable/clearable.
{
 const store=storage(),api=server(),remove=store.removeItem;store.removeItem=()=>{throw Error('Removal blocked');};await assert.rejects(()=>run(store,attempt(),api),failure('storage'));const a=h.readExpenseWrite(store,owner);assert.equal(a.steps[0].phase,'confirmed');store.removeItem=remove;assert.equal((await run(store,a,api)).status,'complete');assert.equal(api.posts.length,1);
}
// A supplier and expense retain separate stable UUIDs and exact bodies across both lost ACKs.
{
 const store=storage(),api=server(),a=h.createExpenseWrite(owner,{...expense,actionId:uid()},fields,false,{...supplier,actionId:uid()});api.setPostFault({after:503});await assert.rejects(()=>run(store,a,api),failure('uncertain'));
 const supplierBody=api.posts[0];api.setPostFault(null);const request=api.request;let lostExpense=false;api.request=async(url,init)=>{if(init?.method==='POST'&&JSON.parse(init.body).action==='expense'&&!lostExpense){lostExpense=true;api.setPostFault({after:503});}return request(url,init);};
 await assert.rejects(()=>run(store,h.readExpenseWrite(store,owner),api),failure('uncertain'));const saved=h.readExpenseWrite(store,owner);assert.equal(saved.index,1);assert.deepEqual(saved.fields,fields);const expenseBody=saved.steps[1].body;
 assert.equal((await run(store,saved,api)).status,'complete');assert.equal(api.suppliers.size,1);assert.equal(api.expenses.size,1);assert.deepEqual(api.posts,[supplierBody,supplierBody,expenseBody,expenseBody]);
}
// Supplier saved + expense first409 preserves a durable editable draft, including after reload; only expense is retried after explicit review.
{
 const store=storage(),api=server(),a=h.createExpenseWrite(owner,{...expense,actionId:uid()},fields,false,{...supplier,actionId:uid()}),request=api.request;let changed=false;
 api.request=async(url,init)=>{if(!init?.method&&new URL(url,'http://local.invalid').searchParams.get('kind')==='suppliers'&&!changed){changed=true;api.advance();}return request(url,init);};
 const rejected=await run(store,a,api);assert.equal(rejected.status,'rejected');const saved=h.readExpenseWrite(store,owner);assert.equal(saved.steps[0].phase,'confirmed');assert.equal(saved.steps[1].phase,'rejected');assert.deepEqual(saved.fields,fields);
 const input=h.expenseWriteInput(saved.steps[1]),reviewed=h.reviewRejectedExpenseWrite(saved,{...input,revision:api.revision,actionId:uid(),concept:'Reviewed original draft'},{...fields,concept:'Reviewed original draft'});
 assert.equal((await run(store,reviewed,api)).status,'complete');assert.equal(api.posts.filter(body=>JSON.parse(body).action==='supplier').length,1);assert.equal(api.suppliers.size,1);assert.equal(api.expenses.size,1);
}
// Payments/reversals use the action UUID and exact immutable ledger values; canonical reads can page beyond the first result.
for(const action of ['payment','reverse']){
 const store=storage(),api=server(),actionId=uid(),input=action==='payment'?{action,actionId,revision:0,expenseId,amountCents:3333,date:'2026-11-09',method:'transfer',reference:'KEEP-REF',note:'Keep note'}:{action,actionId,revision:0,expenseId,paymentId:uid(),date:'2026-11-10',note:'Keep reason'};
 api.expenses.set(expenseId,{id:expenseId});const a=h.createExpenseWrite(owner,input,{amount:'33.33',date:input.date,note:input.note});api.setPostFault({after:503});await assert.rejects(()=>run(store,a,api),failure('uncertain'));assert.equal((await run(store,h.readExpenseWrite(store,owner),api)).status,'complete');assert.equal(api.payments.length,1);assert.equal(api.payments[0].id,actionId);assert.equal(api.posts[1],api.posts[0]);
 const confirmed={body:JSON.stringify(load('expenses').expenseMutationSchema.parse(input)),phase:'confirmed',ack:{id:actionId,revision:1}};let reads=0;
 await h.verifyExpenseWriteRead(async()=>{reads++;return Response.json({revision:2,expense:{id:expenseId},payments:reads===1?[]:api.payments,nextCursor:reads===1?uid():null});},confirmed);assert.equal(reads,2);
 reads=0;await assert.rejects(()=>h.verifyExpenseWriteRead(async()=>{reads++;return Response.json({revision:reads,expense:{id:expenseId},payments:reads===1?[]:api.payments,nextCursor:uid()});},confirmed));
}
// Date-only recovery text is explicit in the active language, regardless of device timezone.
for(const zone of ['UTC','America/Costa_Rica','Pacific/Kiritimati','America/Los_Angeles']){
 const previous=process.env.TZ;process.env.TZ=zone;
 try{
  assert.equal(h.expenseRecoveryDay('2026-11-02','en'),'Nov 2, 2026');
  const es=h.expenseRecoveryDay('2026-11-02','es');assert.match(es,/2.*nov.*2026/i);assert.notEqual(es,'11/02/2026');
  assert.match(h.expenseRecoveryDay('2028-02-29','es'),/29.*feb.*2028/i);
  for(const invalid of ['2026-02-29','2026-13-01','02/11/2026',''])assert.equal(h.expenseRecoveryDay(invalid,'en'),invalid);
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
}
console.log('PASS expense durable recovery: strict account/DTO/body identity, storage fail-closed, exact replay across 401/403/400/409+reload, acknowledged read-only recovery, historical revisions, two-step supplier/expense recovery and known-rejection draft review, immutable paginated payment/reversal proof. No network or database used.');
