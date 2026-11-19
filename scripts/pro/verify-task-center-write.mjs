// Pure task-center write/export selection contracts. No browser, network,
// database, storage service or generated PDF artifact.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const sourceRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({
 resolve(specifier,context,next){return next(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);},
 load(url,context,next){if(url.startsWith(sourceRoot)&&url.endsWith('.ts'))return{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};return next(url,context);},
});
const owner=crypto.randomUUID(),other=crypto.randomUUID(),work='local-center-work',otherWork='other-center-work';
function storage(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};}
const baseline=()=>({id:crypto.randomUUID(),workId:work,title:'Revisión de conexión eléctrica',details:'Nota privada del profesional',dueDate:'2026-11-12',assignee:'José Muñoz',status:'open',archived:false,revision:1,createdAt:'2026-11-09T08:00:00.000Z',updatedAt:'2026-11-09T08:00:00.000Z'});
const h=await import('../../src/lib/pro/task-center-write.ts'),legacy=await import('../../src/lib/pro/work-task-recovery.ts');
let passed=0;
function make(action='complete',localStore=storage(),sessionStore=storage()){
 const task={...baseline(),...action==='reopen'?{status:'done'}:{}};
 return {attempt:h.createTaskCenterWrite({accountId:owner,task,action,localStore,sessionStore,actionId:crypto.randomUUID()}),task,localStore,sessionStore};
}
function server(task){const receipts=new Map(),posts=[],reads=[];let current=task,lost=false,reject=null,wrongAck=false;
 return {receipts,posts,reads,get current(){return current;},lose(){lost=true;},reject(code){reject=code;},corruptAck(){wrongAck=true;},request:async(url,init)=>{
  assert.equal(new Headers(init?.headers).get('X-Pro-Expected-Actor'),owner);
  if(init?.method==='POST'){
   posts.push(init.body);if(reject)return Response.json({error:'LOCAL_REJECT'},{status:reject});const input=JSON.parse(init.body);let record=receipts.get(input.actionId);
   if(record)assert.equal(record.body,init.body);else{assert.equal(input.revision,current.revision);current={...current,revision:current.revision+1,status:input.action==='complete'?'done':'open',updatedAt:'2026-11-09T09:00:00.000Z'};record={body:init.body,task:current};receipts.set(input.actionId,record);}
   if(lost){lost=false;return Response.json({error:'LOST_AFTER_COMMIT'},{status:503});}
   return Response.json({task:wrongAck?{...record.task,title:'CHANGED PRIVATE CONTENT'}:record.task});
  }
  reads.push(url);return Response.json({task:current,history:[]});
 }};
}
function mutex(){const held=new Set();return {request:async(name,options,callback)=>{assert.equal(options.mode,'exclusive');assert.equal(options.ifAvailable,true);if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}}};}
const locks=mutex();
const run=(f,s,extra={})=>h.continueTaskCenterWrite({store:f.localStore,sessionStore:f.sessionStore,attempt:f.attempt,request:s.request,currentAccount:()=>owner,currentWork:()=>work,onCheckpoint:()=>{},locks,...extra});
for(const action of ['complete','reopen']){
 const f=make(action),s=server(f.task);h.saveTaskCenterWrite(f.localStore,f.attempt);assert.deepEqual(h.readTaskCenterWrite(f.localStore,owner),f.attempt);assert.equal(h.readTaskCenterWrite(f.localStore,other),null);
 const result=await run(f,s);assert.equal(result.status,'confirmed');assert.equal(result.task.status,action==='complete'?'done':'open');assert.equal(result.task.revision,2);assert.equal(s.posts.length,1);assert.equal(s.receipts.size,1);assert.equal(f.localStore.getItem(legacy.workTaskWriteKey(owner,work)),null,'Global adapter must not duplicate the per-work journal');
 assert.throws(()=>h.parseTaskCenterWrite(result.attempt,other));await h.clearTaskCenterWrite(f.localStore,result.attempt,locks);assert.equal(h.readTaskCenterWrite(f.localStore,owner),null);passed++;
}
for(const location of ['global','local','session','draft'])for(const raw of ['{invalid','']){
 const localStore=storage(),sessionStore=storage();const key=location==='global'?h.taskCenterWriteKey(owner):location==='draft'?h.taskCenterDraftKey(owner,work):legacy.workTaskWriteKey(owner,work),store=location==='session'||location==='draft'?sessionStore:localStore;
 store.setItem(key,raw);assert.throws(()=>make('complete',localStore,sessionStore));assert.equal(store.getItem(key),raw);passed++;
}
{
 const f=make(),key=h.taskCenterWriteKey(owner);h.saveTaskCenterWrite(f.localStore,f.attempt);const bytes=f.localStore.getItem(key);
 assert.throws(()=>h.saveTaskCenterWrite(f.localStore,make().attempt));assert.equal(f.localStore.getItem(key),bytes);
 const adapter=h.taskCenterWriteStore(f.localStore,owner,work);assert.throws(()=>adapter.getItem(legacy.workTaskWriteKey(owner,otherWork)));assert.throws(()=>adapter.setItem(legacy.workTaskWriteKey(other,work),'BAD'));assert.throws(()=>adapter.removeItem('not-a-task-key'));assert.equal(f.localStore.getItem(key),bytes);passed++;
}
for(const method of ['getItem','setItem']){
 const f=make(),s=server(f.task);f.localStore[method]=()=>{throw Error('LOCAL_STORAGE_FAILURE');};await assert.rejects(()=>run(f,s));assert.equal(s.posts.length,0);passed++;
}
{
 const f=make(),s=server(f.task);await assert.rejects(()=>run(f,s,{onCheckpoint:()=>{throw Error('CHECKPOINT_FAILED');}}));assert.equal(s.posts.length,0);passed++;
}
for(const scope of ['account','work']){
 const f=make(),s=server(f.task);await assert.rejects(()=>run(f,s,{currentAccount:()=>scope==='account'?other:owner,currentWork:()=>scope==='work'?otherWork:work}));assert.equal(s.posts.length,0);passed++;
}
for(const scope of ['account','work']){
 const f=make(),s=server(f.task);let current=true;const request=async(url,init)=>{const response=await s.request(url,init);current=false;return response;};
 await assert.rejects(()=>run(f,s,{request,currentAccount:()=>scope==='account'&&!current?other:owner,currentWork:()=>scope==='work'&&!current?otherWork:work}));assert.equal(s.posts.length,1);assert.equal(h.readTaskCenterWrite(f.localStore,owner).phase,'uncertain');assert.equal(h.readTaskCenterWrite(f.localStore,other),null);passed++;
}
{
 const f=make(),s=server(f.task);s.lose();await assert.rejects(()=>run(f,s));const saved=h.readTaskCenterWrite(f.localStore,owner);assert.equal(saved.phase,'uncertain');assert.equal(s.current.status,'done');assert.equal(s.posts.length,1);
 // Reading a persisted attempt is inert. Recovery occurs only by explicit run.
 assert.deepEqual(h.readTaskCenterWrite(f.localStore,owner),saved);assert.equal(s.posts.length,1);
 f.sessionStore.setItem(h.taskCenterDraftKey(owner,work),'EDITOR_OPENED_AFTER_UNCERTAIN');await assert.rejects(()=>run({...f,attempt:saved},s),error=>error instanceof h.TaskCenterOriginalPendingError);assert.equal(s.posts.length,1);assert.deepEqual(h.readTaskCenterWrite(f.localStore,owner),saved);assert.equal(f.sessionStore.getItem(h.taskCenterDraftKey(owner,work)),'EDITOR_OPENED_AFTER_UNCERTAIN');f.sessionStore.removeItem(h.taskCenterDraftKey(owner,work));
 const result=await run({...f,attempt:saved},s);assert.equal(result.status,'confirmed');assert.equal(s.posts.length,2);assert.equal(s.posts[0],s.posts[1]);assert.equal(s.receipts.size,1);assert.equal(s.current.revision,2);
 const retry=await run({...f,attempt:result.attempt},s);assert.equal(retry.status,'confirmed');assert.equal(s.posts.length,2,'Confirmed recovery must only read');passed++;
}
for(const status of [400,409]){
 const f=make(),s=server(f.task);s.reject(status);const result=await run(f,s);assert.equal(result.status,'rejected');assert.equal(result.code,status);assert.equal(s.current.revision,1);assert.equal(s.receipts.size,0);assert.equal(h.readTaskCenterWrite(f.localStore,owner).phase,'uncertain');passed++;
}
for(const status of [401,403,429,503]){
 const f=make(),s=server(f.task);s.reject(status);await assert.rejects(()=>run(f,s));assert.equal(h.readTaskCenterWrite(f.localStore,owner).body,s.posts[0]);assert.equal(s.current.revision,1);passed++;
}
{
 const f=make(),s=server(f.task);s.corruptAck();await assert.rejects(()=>run(f,s));assert.equal(h.readTaskCenterWrite(f.localStore,owner).phase,'uncertain');assert.equal(s.receipts.size,1);passed++;
}
{
 const f=make(),s=server(f.task);let release;const held=new Promise(resolve=>{release=resolve;});let entered;const started=new Promise(resolve=>{entered=resolve;});const shared=mutex();
 const first=run(f,s,{locks:shared,request:async(...args)=>{entered();await held;return s.request(...args);}});await started;
 const otherTask={...baseline(),workId:otherWork},localStore=storage(),sessionStore=storage();const otherAttempt={task:otherTask,localStore,sessionStore,attempt:h.createTaskCenterWrite({accountId:owner,task:otherTask,action:'complete',localStore,sessionStore})};
 await assert.rejects(()=>run(otherAttempt,server(otherTask),{locks:shared,currentWork:()=>otherWork}),error=>error instanceof h.TaskCenterBusyError&&error.reason==='busy');assert.equal(otherAttempt.localStore.values.size,0);
 release();assert.equal((await first).status,'confirmed');assert.equal(s.posts.length,1);passed++;
}
{
 // Node 26 supplies native navigator.locks. Model an unsupported browser
 // explicitly instead of accidentally invoking that real implementation.
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
 try{const f=make(),s=server(f.task);await assert.rejects(()=>run(f,s,{locks:undefined}),error=>error instanceof h.TaskCenterBusyError&&error.reason==='unavailable');assert.equal(s.posts.length,0);assert.equal(f.localStore.values.size,0);passed++;}finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
}
{
 const f=make(),s=server(f.task);f.sessionStore.setItem(h.taskCenterDraftKey(owner,work),'RESTORED_EDITOR_DRAFT');await assert.rejects(()=>run(f,s),error=>error instanceof h.TaskCenterOriginalPendingError);assert.equal(s.posts.length,0);assert.equal(f.sessionStore.getItem(h.taskCenterDraftKey(owner,work)),'RESTORED_EDITOR_DRAFT');passed++;
}
{
 const pdf=await import('../../src/lib/pro/task-center-export.ts'),item={task:baseline(),work:{id:work,service:'Revisión local',client:'José Muñoz',stage:'scheduled',cancelled:false}},options={english:false,currentAccount:()=>owner,accountId:owner};
 let documentReads=0;const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,get(){documentReads++;throw Error('PDF must reject before touching DOM');}});
 try{
  for(const selected of [[],Array.from({length:101},()=>({...item,task:{...baseline()}})),[item,item],[{...item,work:{...item.work,id:otherWork}}],[{...item,task:{...item.task,archived:true}}]]){await assert.rejects(()=>pdf.createTaskCenterPdf(selected,options));assert.equal(documentReads,0);passed++;}
  await assert.rejects(()=>pdf.createTaskCenterPdf([item],{...options,currentAccount:()=>other}));assert.equal(documentReads,0);passed++;
 }finally{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}
}
console.log(`Task-center write contracts: ${passed} PASS (no browser/network/DB/PDF)`);
