// Pure private request follow-up recovery contracts. No DB, network or browser.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const sourceRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({
 resolve(specifier,context,next){return next(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);},
 // Repository TypeScript lowers parameter properties unsupported by Node strip-only.
 load(url,context,next){if(url.startsWith(sourceRoot)&&url.endsWith('.ts'))return{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};return next(url,context);},
});
const h=await import('../../src/lib/pro/request-followup-recovery.ts');
const schema=await import('../../src/lib/pro/request-followups.ts');
const uid=()=>crypto.randomUUID(),owner=uid(),other=uid(),requestId=uid(),differentRequest=uid();
const empty=()=>({requestId,dueDate:null,note:'',status:'open',revision:0,updatedAt:null});
const saved=()=>({...empty(),dueDate:'2026-11-10',note:'Nota privada original',revision:1,updatedAt:'2026-11-09T08:00:00.000Z'});
const modes=['create','save-open','save-done','complete','reopen'];
function make(mode='create'){
 const baseline=mode==='create'?empty():{...saved(),...['save-done','reopen'].includes(mode)?{status:'done'}:{}};
 const action=['create','save-open','save-done'].includes(mode)?'save':mode;
 return h.createRequestFollowupWrite(owner,{action,requestId,actionId:uid(),revision:baseline.revision,...action==='save'?{dueDate:'2026-11-14',note:'Próxima acción privada'}:{}},baseline);
}
function storage(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};}
function server(attempt){
 let followup=attempt.baseline,fault=null,readFault=false,ackTransform=null,readTransform=null;const receipts=new Map(),posts=[],reads=[];
 const request=async(url,init)=>{
  assert.equal(new Headers(init?.headers).get('x-pro-expected-actor'),owner);
  if(init?.method==='POST'){
   posts.push(init.body);const input=JSON.parse(init.body);
   if(fault?.before)return Response.json({error:'Local pre-commit response'},{status:fault.before});
   let receipt=receipts.get(input.actionId);
   if(receipt)assert.equal(receipt.body,init.body,'The captured retry body changed');
   else{
    if(input.revision!==followup.revision)return Response.json({error:'Stale follow-up'},{status:409});
    followup={...followup,revision:followup.revision+1,updatedAt:'2026-11-09T08:01:00.000Z',...input.action==='save'?{dueDate:input.dueDate,note:input.note}:input.action==='complete'?{status:'done'}:{status:'open'}};
    receipt={body:init.body,followup};receipts.set(input.actionId,receipt);
   }
   if(fault?.after){const status=fault.after;fault=null;if(status==='throw')throw Error('Lost reply after commit');return Response.json({error:'Lost reply after commit'},{status});}
   return Response.json(ackTransform?ackTransform(receipt.followup):{followup:receipt.followup});
  }
  reads.push(url);const query=new URL(url,'http://local.invalid').searchParams;assert.equal(query.get('requestId'),requestId);
  if(readFault)throw Error('Canonical read temporarily unavailable');
  return Response.json(readTransform?readTransform(followup):{followup,history:[]});
 };
 return{request,receipts,posts,reads,get followup(){return followup;},setFault:value=>{fault=value;},setReadFault:value=>{readFault=value;},setAckTransform:value=>{ackTransform=value;},setReadTransform:value=>{readTransform=value;}};
}
const run=(store,attempt,api,onCheckpoint=()=>{})=>h.continueRequestFollowupWrite({store,attempt,request:api.request,currentAccount:()=>owner,currentRequest:()=>requestId,onCheckpoint});
const failure=kind=>error=>error instanceof h.RequestFollowupWriteFailure&&error.kind===kind;
{
 const input=JSON.parse(make().body);
 for(const dueDate of ['2026-02-29','2100-02-29','2026-04-31','2026-00-01','2026-12-00','1899-12-31','2101-01-01','2026-11-09T00:00:00Z',''])assert.equal(schema.requestFollowupMutationSchema.safeParse({...input,dueDate}).success,false,dueDate);
 for(const dueDate of [null,'1900-01-01','2024-02-29','2020-01-01','2100-12-31'])assert.equal(schema.requestFollowupMutationSchema.safeParse({...input,dueDate}).success,true,String(dueDate));
 for(const invalid of [{...input,unknown:true},{...input,note:'x'.repeat(1001)},{...input,revision:-1},{...input,requestId:'not-a-uuid'},{...JSON.parse(make('complete').body),note:'Unexpected field'},{...JSON.parse(make('reopen').body),dueDate:null}])assert.equal(schema.requestFollowupMutationSchema.safeParse(invalid).success,false);
 for(const invalid of [{...empty(),note:'Unstored note'},{...empty(),dueDate:'2026-11-10'},{...empty(),status:'done'},{...saved(),updatedAt:null},{...saved(),updatedAt:'invalid timestamp'}])assert.equal(schema.requestFollowupSchema.safeParse(invalid).success,false);
 assert.equal(schema.requestFollowupSchema.safeParse(empty()).success,true);
}
for(const mode of modes){
 const attempt=make(mode),store=storage(),input=JSON.parse(attempt.body);h.saveRequestFollowupWrite(store,attempt);
 assert.deepEqual(h.readRequestFollowupWrite(store,owner,requestId),attempt);assert.equal(h.readRequestFollowupWrite(store,other,requestId),null);assert.equal(h.readRequestFollowupWrite(store,owner,differentRequest),null);
 assert.throws(()=>h.parseRequestFollowupWrite(attempt,other,requestId));assert.throws(()=>h.parseRequestFollowupWrite(attempt,owner,differentRequest));
 for(const value of [{...attempt,unknown:true},{...attempt,phase:'confirmed'},{...attempt,body:attempt.body+' '},{...attempt,baseline:{...attempt.baseline,requestId:differentRequest}},{...attempt,baseline:{...attempt.baseline,revision:9}}])assert.throws(()=>h.parseRequestFollowupWrite(value,owner,requestId));
 const api=server(attempt),result=await run(store,attempt,api);assert.equal(result.status,'confirmed');assert.equal(result.followup.revision,input.revision+1);assert.equal(api.posts.length,1);assert.equal(api.receipts.size,1);
 assert.equal(result.followup.status,mode==='complete'||mode==='save-done'?'done':'open');
 assert.equal(result.followup.note,input.action==='save'?input.note:attempt.baseline.note);assert.equal(result.followup.dueDate,input.action==='save'?input.dueDate:attempt.baseline.dueDate);
 for(const corrupt of [{...result.attempt,followup:{...result.attempt.followup,note:'Changed journal note'}},{...result.attempt,followup:{...result.attempt.followup,status:result.attempt.followup.status==='open'?'done':'open'}}])assert.throws(()=>h.parseRequestFollowupWrite(corrupt,owner,requestId));
 h.clearRequestFollowupWrite(store,result.attempt);assert.equal(h.readRequestFollowupWrite(store,owner,requestId),null);
}
// Baseline identity/status and journal content cannot be fabricated or overwritten.
{
 assert.throws(()=>h.createRequestFollowupWrite(owner,JSON.parse(make('complete').body),{...saved(),status:'done'}));
 assert.throws(()=>h.createRequestFollowupWrite(owner,JSON.parse(make('reopen').body),saved()));
 const attempt=make('save-open'),store=storage(),key=h.requestFollowupWriteKey(owner,requestId);h.saveRequestFollowupWrite(store,attempt);const bytes=store.getItem(key);
 const different={...attempt,baseline:{...attempt.baseline,note:'Different captured note'}};
 assert.throws(()=>h.saveRequestFollowupWrite(store,different));assert.throws(()=>h.mergeRequestFollowupWrite(attempt,different));assert.equal(store.getItem(key),bytes);
 assert.throws(()=>h.saveRequestFollowupWrite(store,make('save-open')));assert.equal(store.getItem(key),bytes);
 store.setItem(key,'{corrupt-followup-journal');assert.throws(()=>h.readRequestFollowupWrite(store,owner,requestId));assert.throws(()=>h.saveRequestFollowupWrite(store,attempt));assert.throws(()=>h.clearRequestFollowupWrite(store,attempt));assert.equal(store.getItem(key),'{corrupt-followup-journal');
}
for(const mode of ['get','set','readback']){
 const attempt=make(),store=storage(),api=server(attempt);let writes=0;
 if(mode==='get')store.getItem=()=>{throw Error('Denied');};if(mode==='set')store.setItem=()=>{throw Error('Quota');};
 if(mode==='readback'){const get=store.getItem,set=store.setItem;store.getItem=key=>writes?'changed':get(key);store.setItem=(key,value)=>{writes++;set(key,value);};}
 await assert.rejects(()=>run(store,attempt,api),failure('storage'));assert.equal(api.posts.length,0);
}
{
 const attempt=make(),api=server(attempt);await assert.rejects(()=>run(storage(),attempt,api,()=>{throw Error('Mirror storage failed');}),failure('storage'));assert.equal(api.posts.length,0);
}
for(const changed of ['actor','request']){
 const attempt=make(),api=server(attempt);
 await assert.rejects(()=>h.continueRequestFollowupWrite({store:storage(),attempt,request:api.request,currentAccount:()=>changed==='actor'?other:owner,currentRequest:()=>changed==='request'?differentRequest:requestId,onCheckpoint:()=>{}}),failure('scope'));assert.equal(api.posts.length,0);
}
for(const stage of ['POST','GET'])for(const changed of ['actor','request']){
 const attempt=make(),api=server(attempt),store=storage();let live=true;
 const request=async(url,init)=>{const result=await api.request(url,init);if((stage==='POST')===(init?.method==='POST'))live=false;return result;};
 await assert.rejects(()=>h.continueRequestFollowupWrite({store,attempt,request,currentAccount:()=>changed==='actor'&&!live?other:owner,currentRequest:()=>changed==='request'&&!live?differentRequest:requestId,onCheckpoint:()=>{}}),failure('scope'));
 assert.equal(api.receipts.size,1);assert.equal(h.readRequestFollowupWrite(store,owner,requestId).phase,stage==='POST'?'uncertain':'confirmed');
}
for(const mode of modes)for(const lost of [503,'throw']){
 const attempt=make(mode),api=server(attempt),store=storage();api.setFault({after:lost});await assert.rejects(()=>run(store,attempt,api),failure('uncertain'));
 const persisted=h.readRequestFollowupWrite(store,owner,requestId),bytes=api.posts[0];assert.equal(persisted.phase,'uncertain');assert.equal(persisted.body,bytes);
 api.setFault(null);assert.equal((await run(store,persisted,api)).status,'confirmed');assert.equal(api.receipts.size,1);assert.equal(new Set(api.posts).size,1);assert.equal(api.followup.revision,attempt.baseline.revision+1);
}
for(const status of [401,403,404,429,500,503]){
 const attempt=make(),api=server(attempt),store=storage();api.setFault({before:status});await assert.rejects(()=>run(store,attempt,api),failure('uncertain'));assert.equal(h.readRequestFollowupWrite(store,owner,requestId).phase,'uncertain');assert.equal(api.reads.length,0);assert.equal(api.receipts.size,0);
}
for(const status of [400,409,413,422]){
 const attempt=make(),api=server(attempt),store=storage();api.setFault({before:status});const result=await run(store,attempt,api);assert.equal(result.status,'rejected');assert.equal(result.code,status);assert.equal(api.receipts.size,0);assert.equal(api.reads.length,0);
}
for(const mode of modes)for(const mutate of [value=>({...value,requestId:differentRequest}),value=>({...value,revision:value.revision+1}),value=>({...value,note:'Wrong action note'}),value=>({...value,dueDate:'2026-11-20'}),value=>({...value,status:value.status==='open'?'done':'open'}),value=>({...value,updatedAt:null}),value=>({...value,dueDate:'2026-02-29'})]){
 const attempt=make(mode),api=server(attempt),store=storage();api.setAckTransform(value=>({followup:mutate(value)}));await assert.rejects(()=>run(store,attempt,api),failure('uncertain'));assert.equal(h.readRequestFollowupWrite(store,owner,requestId).phase,'uncertain');assert.equal(api.reads.length,0);
}
for(const payload of [null,{}, {followup:null},{followup:{}}]){
 const attempt=make(),api=server(attempt),store=storage();api.setAckTransform(()=>payload);await assert.rejects(()=>run(store,attempt,api),failure('uncertain'));assert.equal(h.readRequestFollowupWrite(store,owner,requestId).phase,'uncertain');
}
for(const mode of modes){
 const attempt=make(mode),api=server(attempt),store=storage();api.setReadFault(true);await assert.rejects(()=>run(store,attempt,api),failure('read'));const confirmed=h.readRequestFollowupWrite(store,owner,requestId);assert.equal(confirmed.phase,'confirmed');api.setReadFault(false);
 assert.equal((await run(store,confirmed,api)).status,'confirmed');assert.equal(api.posts.length,1);
 for(const mutate of [value=>({...value,requestId:differentRequest}),value=>({...value,revision:value.revision-1}),value=>({...value,note:'Wrong at same revision'}),value=>({...value,status:value.status==='open'?'done':'open'}),value=>({...value,updatedAt:'2026-11-09T08:02:00.000Z'})]){
  api.setReadTransform(value=>({followup:mutate(value)}));await assert.rejects(()=>run(store,confirmed,api),failure('read'));assert.equal(api.posts.length,1);
 }
 api.setReadTransform(value=>({followup:{...value,note:'Legitimate later note',revision:value.revision+1}}));assert.equal((await run(store,confirmed,api)).followup.note,'Legitimate later note');assert.equal(api.posts.length,1);
}
{
 const attempt=make('save-done'),api=server(attempt),store=storage(),set=store.setItem;let latest=attempt,denied=true;
 store.setItem=(key,value)=>{if(denied&&JSON.parse(value).phase==='confirmed')throw Error('Late storage quota');set(key,value);};
 await assert.rejects(()=>run(store,attempt,api,value=>{latest=value;}),failure('storage'));assert.equal(latest.phase,'confirmed');assert.equal(h.readRequestFollowupWrite(store,owner,requestId).phase,'uncertain');
 denied=false;const merged=h.mergeRequestFollowupWrite(latest,h.readRequestFollowupWrite(store,owner,requestId));const result=await run(store,merged,api);assert.equal(api.posts.length,1);assert.equal(result.followup.status,'done');
 store.removeItem=()=>{};assert.throws(()=>h.clearRequestFollowupWrite(store,result.attempt));assert.equal(h.readRequestFollowupWrite(store,owner,requestId).phase,'confirmed');
}
console.log('PASS request follow-up recovery: create/save/complete/reopen, save preserves done/open status, exact captured retries, actor/request scope, storage fail-closed, corrupt/conflicting journals, uncertain authentication/rate limits, definite rejections, action-exact ACK, same-revision canonical equality, GET-only confirmed recovery and civil dates. Pure: no DB/network/browser.');
