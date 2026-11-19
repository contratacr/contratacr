// Pure task mutation/recovery contracts. No browser, network, database or fixtures.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const sourceRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({
 resolve(specifier,context,next){return next(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);},
 // The installed Node strip-only loader cannot lower parameter properties.
 // Transpile only these local sources with the repository's TypeScript package.
 load(url,context,next){if(url.startsWith(sourceRoot)&&url.endsWith('.ts'))return{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};return next(url,context);},
});
const h=await import('../../src/lib/pro/work-task-recovery.ts');
const schema=await import('../../src/lib/pro/work-tasks.ts');
const uid=()=>crypto.randomUUID(),owner=uid(),other=uid(),work='local-task-work',otherWork='different-job';
const initial=()=>({id:uid(),workId:work,title:'Revisar conexión',details:'Detalle privado',dueDate:'2026-11-12',assignee:'Responsable de prueba',status:'open',archived:false,revision:1,createdAt:'2026-11-09T08:00:00.000Z',updatedAt:'2026-11-09T08:00:00.000Z'});
const content={title:'Revisar instalación',details:'Guardar estas instrucciones',dueDate:'2026-11-15',assignee:'Técnico local'};
function make(action='create'){
 const baseline=action==='create'?null:{...initial(),...action==='reopen'?{status:'done'}:{},...action==='restore'?{archived:true}:{}};
 const input={action,workId:work,taskId:baseline?.id??uid(),actionId:uid(),revision:baseline?.revision??0,...['create','update'].includes(action)?content:{}};
 return h.createWorkTaskWrite(owner,input,baseline);
}
function storage(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};}
function server(attempt){
 let task=attempt.baseline,fault=null,readFault=false,ackTransform=null,readTransform=null;
 const receipts=new Map(),posts=[],reads=[];
 const request=async(url,init)=>{
  assert.equal(new Headers(init?.headers).get('x-pro-expected-actor'),owner);
  if(init?.method==='POST'){
   posts.push(init.body);const input=JSON.parse(init.body);
   if(fault?.before)return Response.json({error:'Local definite or authentication response'},{status:fault.before});
   let receipt=receipts.get(input.actionId);
   if(receipt){assert.equal(receipt.body,init.body,'A retry changed its exact body');}
   else{
    if(input.revision!==(task?.revision??0))return Response.json({error:'Stale task'},{status:409});
    task=input.action==='create'?{id:input.taskId,workId:work,...content,status:'open',archived:false,revision:1,createdAt:'2026-11-09T08:01:00.000Z',updatedAt:'2026-11-09T08:01:00.000Z'}:{...task,revision:task.revision+1,updatedAt:'2026-11-09T08:01:00.000Z',...input.action==='update'?{title:input.title,details:input.details,dueDate:input.dueDate,assignee:input.assignee}:input.action==='complete'?{status:'done'}:input.action==='reopen'?{status:'open'}:input.action==='archive'?{archived:true}:{archived:false}};
    receipt={body:init.body,task};receipts.set(input.actionId,receipt);
   }
   if(fault?.after){const status=fault.after;fault=null;if(status==='throw')throw Error('Lost response after commit');return Response.json({error:'Lost response after commit'},{status});}
   return Response.json(ackTransform?ackTransform(receipt.task):{task:receipt.task});
  }
  reads.push(url);const query=new URL(url,'http://local.invalid').searchParams;
  assert.equal(query.get('workId'),work);assert.equal(query.get('taskId'),JSON.parse(attempt.body).taskId);
  if(readFault)throw Error('Local canonical read unavailable');
  return Response.json(readTransform?readTransform(task):{task,history:[]});
 };
 return{request,receipts,posts,reads,get task(){return task;},setTask:value=>{task=value;},setFault:value=>{fault=value;},setReadFault:value=>{readFault=value;},setAckTransform:value=>{ackTransform=value;},setReadTransform:value=>{readTransform=value;}};
}
const run=(store,attempt,api,onCheckpoint=()=>{})=>h.continueWorkTaskWrite({store,attempt,request:api.request,currentAccount:()=>owner,currentWork:()=>work,onCheckpoint});
const failure=kind=>error=>error instanceof h.WorkTaskWriteFailure&&error.kind===kind;
const actions=['create','update','complete','reopen','archive','restore'];
// Civil dates and exact mutation fields, without timezone conversion or loose aliases.
{
 const input=JSON.parse(make().body);
 for(const value of ['2026-02-29','2100-02-29','2026-04-31','2026-00-12','2026-12-00','1899-12-31','2101-01-01','2026-11-12T00:00:00Z',''])assert.equal(schema.workTaskMutationSchema.safeParse({...input,dueDate:value}).success,false,value);
 for(const value of [null,'2024-02-29','1900-01-01','2100-12-31','2020-01-01'])assert.equal(schema.workTaskMutationSchema.safeParse({...input,dueDate:value}).success,true,String(value));
 for(const value of [{...input,unknown:true},{...input,title:''},{...input,title:'x'.repeat(161)},{...input,revision:1},{...input,details:'x'.repeat(2001)},{...input,assignee:'x'.repeat(161)}])assert.equal(schema.workTaskMutationSchema.safeParse(value).success,false);
 for(const action of ['complete','reopen','archive','restore'])assert.equal(schema.workTaskMutationSchema.safeParse({...JSON.parse(make(action).body),title:'Unexpected field'}).success,false);
}
for(const action of actions){
 const attempt=make(action),store=storage();h.saveWorkTaskWrite(store,attempt);
 assert.deepEqual(h.readWorkTaskWrite(store,owner,work),attempt);
 assert.equal(h.readWorkTaskWrite(store,other,work),null);assert.equal(h.readWorkTaskWrite(store,owner,otherWork),null);
 assert.throws(()=>h.parseWorkTaskWrite(attempt,other,work));assert.throws(()=>h.parseWorkTaskWrite(attempt,owner,otherWork));
 for(const value of [{...attempt,unknown:true},{...attempt,phase:'confirmed'},{...attempt,task:{...initial(),id:JSON.parse(attempt.body).taskId}},{...attempt,body:attempt.body+' '},{...attempt,baseline:action==='create'?initial():{...attempt.baseline,revision:20}}])assert.throws(()=>h.parseWorkTaskWrite(value,owner,work));
 const api=server(attempt),result=await run(store,attempt,api);
 assert.equal(result.status,'confirmed');assert.equal(result.task.revision,JSON.parse(attempt.body).revision+1);assert.equal(api.posts.length,1);assert.equal(api.receipts.size,1);
 assert.equal(result.task.status,action==='complete'?'done':'open');assert.equal(result.task.archived,action==='archive');
 if(['create','update'].includes(action))for(const key of ['title','details','dueDate','assignee'])assert.equal(result.task[key],content[key]);
 for(const corrupt of [{...result.attempt,task:{...result.attempt.task,title:'Journal content changed'}},{...result.attempt,task:{...result.attempt.task,archived:!result.attempt.task.archived}}])assert.throws(()=>h.parseWorkTaskWrite(corrupt,owner,work));
 h.clearWorkTaskWrite(store,result.attempt);assert.equal(h.readWorkTaskWrite(store,owner,work),null);
}
// A journal cannot be replaced, repaired, or cleared silently when corrupt/conflicting.
{
 const store=storage(),a=make(),key=h.workTaskWriteKey(owner,work);h.saveWorkTaskWrite(store,a);
 const original=store.getItem(key);assert.throws(()=>h.saveWorkTaskWrite(store,make()));assert.equal(store.getItem(key),original);
 store.setItem(key,'{corrupt-local-task');assert.throws(()=>h.readWorkTaskWrite(store,owner,work));assert.throws(()=>h.saveWorkTaskWrite(store,a));assert.throws(()=>h.clearWorkTaskWrite(store,a));assert.equal(store.getItem(key),'{corrupt-local-task');
 const b=make('update');assert.throws(()=>h.mergeWorkTaskWrite(a,b));
 const otherStore=storage();h.saveWorkTaskWrite(otherStore,b);const preserved=otherStore.getItem(key),conflicting={...b,baseline:{...b.baseline,title:'Different captured baseline'}};assert.throws(()=>h.saveWorkTaskWrite(otherStore,conflicting));assert.throws(()=>h.mergeWorkTaskWrite(b,conflicting));assert.equal(otherStore.getItem(key),preserved);
}
for(const mode of ['get','set','readback']){
 const store=storage(),attempt=make(),api=server(attempt);let writes=0;
 if(mode==='get')store.getItem=()=>{throw Error('Storage denied');};
 if(mode==='set')store.setItem=()=>{throw Error('Quota exceeded');};
 if(mode==='readback'){const get=store.getItem,set=store.setItem;store.getItem=key=>writes?'changed':get(key);store.setItem=(key,value)=>{writes++;set(key,value);};}
 await assert.rejects(()=>run(store,attempt,api),failure('storage'));assert.equal(api.posts.length,0);
}
{
 const attempt=make(),api=server(attempt);await assert.rejects(()=>run(storage(),attempt,api,()=>{throw Error('Mirror failed');}),failure('storage'));assert.equal(api.posts.length,0);
}
for(const changed of ['actor','work']){
 const attempt=make(),api=server(attempt);
 await assert.rejects(()=>h.continueWorkTaskWrite({store:storage(),attempt,request:api.request,currentAccount:()=>changed==='actor'?other:owner,currentWork:()=>changed==='work'?otherWork:work,onCheckpoint:()=>{}}),failure('scope'));assert.equal(api.posts.length,0);
}
// Changing context during a POST/GET never adopts another screen/account's result.
for(const stage of ['POST','GET'])for(const changed of ['actor','work']){
 const attempt=make(),api=server(attempt),store=storage();let live=true;
 const request=async(url,init)=>{const response=await api.request(url,init);if((stage==='POST')===(init?.method==='POST'))live=false;return response;};
 await assert.rejects(()=>h.continueWorkTaskWrite({store,attempt,request,currentAccount:()=>changed==='actor'&&!live?other:owner,currentWork:()=>changed==='work'&&!live?otherWork:work,onCheckpoint:()=>{}}),failure('scope'));
 assert.equal(api.receipts.size,1);assert.equal(h.readWorkTaskWrite(store,owner,work).phase,stage==='POST'?'uncertain':'confirmed');
}
for(const action of actions)for(const lost of [503,'throw']){
 const attempt=make(action),api=server(attempt),store=storage();api.setFault({after:lost});
 await assert.rejects(()=>run(store,attempt,api),failure('uncertain'));const bytes=api.posts[0],saved=h.readWorkTaskWrite(store,owner,work);assert.equal(saved.phase,'uncertain');assert.equal(saved.body,bytes);
 api.setFault(null);const result=await run(store,saved,api);assert.equal(result.status,'confirmed');assert.equal(new Set(api.posts).size,1);assert.equal(api.receipts.size,1);assert.equal(api.task.revision,JSON.parse(bytes).revision+1);
}
for(const status of [401,403,404,429,500,503]){
 const attempt=make(),api=server(attempt),store=storage();api.setFault({before:status});
 await assert.rejects(()=>run(store,attempt,api),failure('uncertain'));assert.equal(h.readWorkTaskWrite(store,owner,work).phase,'uncertain');assert.equal(api.reads.length,0);assert.equal(api.receipts.size,0);
}
for(const status of [400,409,413,422]){
 const attempt=make(),api=server(attempt),store=storage();api.setFault({before:status});
 const result=await run(store,attempt,api);assert.equal(result.status,'rejected');assert.equal(result.code,status);assert.equal(api.receipts.size,0);assert.equal(api.reads.length,0);
}
// A valid-looking ACK must still exactly implement the captured action/baseline.
for(const action of actions)for(const mutate of [task=>({...task,workId:otherWork}),task=>({...task,id:uid()}),task=>({...task,revision:task.revision+1}),task=>({...task,title:'Unexpected title'}),task=>({...task,status:task.status==='open'?'done':'open'}),task=>({...task,archived:!task.archived}),task=>({...task,dueDate:'2026-02-29'})]){
 const attempt=make(action),api=server(attempt),store=storage();api.setAckTransform(task=>({task:mutate(task)}));
 await assert.rejects(()=>run(store,attempt,api),failure('uncertain'));assert.equal(h.readWorkTaskWrite(store,owner,work).phase,'uncertain');assert.equal(api.reads.length,0);
}
for(const payload of [null,{}, {task:null},{task:{}}]){
 const attempt=make(),api=server(attempt),store=storage();api.setAckTransform(()=>payload);
 await assert.rejects(()=>run(store,attempt,api),failure('uncertain'));assert.equal(h.readWorkTaskWrite(store,owner,work).phase,'uncertain');
}
// Confirmed checkpoints survive lost reads and storage errors with GET-only recovery.
for(const action of actions){
 const attempt=make(action),api=server(attempt),store=storage();api.setReadFault(true);
 await assert.rejects(()=>run(store,attempt,api),failure('read'));const confirmed=h.readWorkTaskWrite(store,owner,work);assert.equal(confirmed.phase,'confirmed');api.setReadFault(false);
 const result=await run(store,confirmed,api);assert.equal(result.status,'confirmed');assert.equal(api.posts.length,1);
 for(const mutate of [task=>({...task,workId:otherWork}),task=>({...task,id:uid()}),task=>({...task,revision:task.revision-1}),task=>({...task,title:'Wrong at the same revision'}),task=>({...task,archived:!task.archived})]){
  api.setReadTransform(task=>({task:mutate(task)}));await assert.rejects(()=>run(store,confirmed,api),failure('read'));assert.equal(api.posts.length,1);
 }
 api.setReadTransform(task=>({task:{...task,title:'Legitimate subsequent edit',revision:task.revision+1}}));assert.equal((await run(store,confirmed,api)).task.title,'Legitimate subsequent edit');assert.equal(api.posts.length,1);
}
{
 const attempt=make('update'),api=server(attempt),store=storage(),set=store.setItem;let latest=attempt,denied=true;
 store.setItem=(key,value)=>{if(denied&&JSON.parse(value).phase==='confirmed')throw Error('Late quota error');set(key,value);};
 await assert.rejects(()=>run(store,attempt,api,value=>{latest=value;}),failure('storage'));assert.equal(latest.phase,'confirmed');assert.equal(h.readWorkTaskWrite(store,owner,work).phase,'uncertain');
 denied=false;const merged=h.mergeWorkTaskWrite(latest,h.readWorkTaskWrite(store,owner,work));const result=await run(store,merged,api);assert.equal(api.posts.length,1);
 store.removeItem=()=>{};assert.throws(()=>h.clearWorkTaskWrite(store,result.attempt));assert.equal(h.readWorkTaskWrite(store,owner,work).phase,'confirmed');
}
console.log('PASS task recovery: all six actions, exact action/body retries, storage fail-closed, scoped in-flight results, strict dates/fields, corrupt/conflicting journal preservation, auth/rate-limit uncertainty, definite rejections, action-exact ACK, exact same-revision canonical read, GET-only confirmed recovery and later canonical task. Pure, no DB/network/browser.');
