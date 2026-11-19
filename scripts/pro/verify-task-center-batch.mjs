// Pure bulk task recovery contracts. No browser, network, DB or PDF generation.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const sourceRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({
 resolve(specifier,context,next){return next(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);},
 load(url,context,next){if(url.startsWith(sourceRoot)&&url.endsWith('.ts'))return{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};return next(url,context);},
});
const owner=crypto.randomUUID(),other=crypto.randomUUID(),work='batch-first-work',otherWork='batch-second-work';
function storage(){const values=new Map();return{values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
function mutex(){const held=new Set();return{request:async(name,options,callback)=>{assert.equal(options.mode,'exclusive');assert.equal(options.ifAvailable,true);if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}}};}
function tasks(count=3,status='open'){return Array.from({length:count},(_,index)=>({id:crypto.randomUUID(),workId:index===0?work:index===1?otherWork:'batch-extra-work-'+index,title:'Tarea local '+index,details:'Nota privada '+index,dueDate:'2026-11-12',assignee:'José Muñoz',status,archived:false,revision:1,createdAt:'2026-11-09T08:00:00.000Z',updatedAt:'2026-11-09T08:00:00.000Z'}));}
function server(initial){const state=new Map(initial.map(task=>[task.id,task])),receipts=new Map(),posts=[],reads=[];let loseId=null,rejectId=null,rejectStatus=409,readFailure=null,badAck=null;
 return{state,receipts,posts,reads,lose(id){loseId=id;},reject(id,status=409){rejectId=id;rejectStatus=status;},failRead(id){readFailure=id;},badAck(id){badAck=id;},request:async(url,init)=>{
  assert.equal(new Headers(init?.headers).get('X-Pro-Expected-Actor'),owner);
  if(init?.method==='POST'){
   const input=JSON.parse(init.body);posts.push({body:init.body,...input});if(input.taskId===rejectId)return Response.json({error:'LOCAL_REJECT'},{status:rejectStatus});
   let receipt=receipts.get(input.actionId);
   if(receipt)assert.equal(receipt.body,init.body,'Retry changed captured mutation');else{
    const current=state.get(input.taskId);assert.ok(current);if(current.revision!==input.revision)return Response.json({error:'LOCAL_CAS_CONFLICT'},{status:409});
    const task={...current,status:input.action==='complete'?'done':'open',revision:current.revision+1,updatedAt:'2026-11-09T09:00:00.000Z'};receipt={body:init.body,task};receipts.set(input.actionId,receipt);state.set(task.id,task);
   }
   if(input.taskId===loseId){loseId=null;return Response.json({error:'LOCAL_LOST_AFTER_COMMIT'},{status:503});}
   return Response.json({task:input.taskId===badAck?{...receipt.task,title:'ACK_WITH_DIFFERENT_CONTENT'}:receipt.task});
  }
  reads.push(url);const query=new URL(url,'http://local.invalid').searchParams,task=state.get(query.get('taskId'));assert.ok(task);assert.equal(query.get('workId'),task.workId);if(task.id===readFailure)return Response.json({error:'LOCAL_READ_FAILED'},{status:503});return Response.json({task,history:[]});
 }};
}
const h=await import('../../src/lib/pro/task-center-batch.ts'),single=await import('../../src/lib/pro/task-center-write.ts'),legacy=await import('../../src/lib/pro/work-task-recovery.ts');
let passed=0;
function make({count=3,action='complete',localStore=storage(),sessionStore=storage()}={}){const selected=tasks(count,action==='reopen'?'done':'open');return{tasks:selected,localStore,sessionStore,batch:h.createTaskCenterBatch({accountId:owner,tasks:selected,action,localStore,sessionStore,batchId:crypto.randomUUID()})};}
const run=(f,s,extra={})=>h.continueTaskCenterBatch({store:f.localStore,sessionStore:f.sessionStore,batch:f.batch,request:s.request,currentAccount:()=>owner,onCheckpoint:()=>{},locks:mutex(),...extra});
const read=f=>h.readTaskCenterBatch(f.localStore,owner);
for(const action of ['complete','reopen']){
 const f=make({action}),s=server(f.tasks);assert.equal(f.localStore.values.size,0,'Creating an intent must not write or send');assert.equal(h.canClearTaskCenterBatch(f.batch),true,'A ready, unattempted batch may be explicitly cancelled under its lock');const original=f.batch.items.map(item=>item.attempt.body),checkpoints=[];
 const result=await run(f,s,{onCheckpoint:batch=>checkpoints.push(structuredClone(batch))});assert.equal(result.status,'completed');assert.equal(result.index,3);assert.equal(h.canClearTaskCenterBatch(result),true);assert.deepEqual(result.items.map(item=>item.attempt.body),original);assert.deepEqual(s.posts.map(item=>item.taskId),f.tasks.map(task=>task.id));assert.equal(s.receipts.size,3);
 for(const task of f.tasks){assert.equal(s.state.get(task.id).revision,2);assert.equal(s.state.get(task.id).status,action==='complete'?'done':'open');assert.equal(s.state.get(task.id).details,task.details);assert.equal(f.localStore.getItem(legacy.workTaskWriteKey(owner,task.workId)),null);}
 assert.ok(checkpoints.some(batch=>batch.index===1));assert.ok(checkpoints.some(batch=>batch.index===2));assert.deepEqual(read(f),result);assert.equal(h.readTaskCenterBatch(f.localStore,other),null);assert.throws(()=>h.parseTaskCenterBatch(result,other));
 const posts=s.posts.length;assert.deepEqual(await run({...f,batch:result},s),result);assert.equal(s.posts.length,posts);await h.clearTaskCenterBatch(f.localStore,result,mutex());assert.equal(read(f),null);passed++;
}
{
 const f=make({count:100}),s=server(f.tasks),result=await run(f,s);assert.equal(result.status,'completed');assert.equal(result.index,100);assert.equal(result.items.length,100);assert.equal(s.posts.length,100);assert.equal(s.receipts.size,100);assert.equal(new Set(s.posts.map(item=>item.actionId)).size,100);assert.equal(new Set(s.posts.map(item=>item.taskId)).size,100);assert.ok([...s.state.values()].every(task=>task.revision===2&&task.status==='done'));assert.equal(h.canClearTaskCenterBatch(result),true);assert.deepEqual(read(f),result);
 await run({...f,batch:result},s);assert.equal(s.posts.length,100,'Terminal retry at maximum batch size must not POST');assert.equal(s.receipts.size,100);await h.clearTaskCenterBatch(f.localStore,result,mutex());assert.equal(read(f),null);passed++;
}
{
 const f=make(),s=server(f.tasks);s.lose(f.tasks[1].id);await assert.rejects(()=>run(f,s),error=>error instanceof h.TaskCenterBatchFailure&&error.kind==='uncertain');const saved=read(f);assert.equal(saved.index,1);assert.equal(saved.status,'pending');assert.equal(saved.items[0].result.status,'confirmed');assert.equal(saved.items[1].attempt.phase,'uncertain');assert.equal(h.canClearTaskCenterBatch(saved),false);assert.equal(s.posts.length,2);assert.equal(s.receipts.size,2);
 const bytes=s.posts[1].body,stored=f.localStore.getItem(h.taskCenterBatchKey(owner));assert.deepEqual(read(f),saved);assert.equal(s.posts.length,2);await assert.rejects(()=>h.clearTaskCenterBatch(f.localStore,saved,mutex()));assert.equal(f.localStore.getItem(h.taskCenterBatchKey(owner)),stored);
 assert.deepEqual(h.mergeTaskCenterBatch(f.batch,saved),saved);assert.deepEqual(h.mergeTaskCenterBatch(saved,f.batch),saved);assert.throws(()=>h.mergeTaskCenterBatch(saved,{...saved,batchId:crypto.randomUUID()}));assert.throws(()=>h.saveTaskCenterBatch(f.localStore,f.batch));assert.equal(f.localStore.getItem(h.taskCenterBatchKey(owner)),stored);
 const rewritten=structuredClone(saved);rewritten.items[0].result.task={...rewritten.items[0].result.task,revision:3,title:'REWRITTEN_CONFIRMED_HISTORY'};assert.throws(()=>h.mergeTaskCenterBatch(saved,rewritten));assert.throws(()=>h.saveTaskCenterBatch(f.localStore,rewritten));assert.equal(f.localStore.getItem(h.taskCenterBatchKey(owner)),stored);
 // A stale mounted UI still has the initial ready envelope. The newer disk
 // checkpoint must win before any request, without replaying completed rows.
 const result=await run(f,s);assert.equal(result.index,3);assert.equal(result.status,'completed');assert.equal(s.posts.filter(item=>item.taskId===f.tasks[0].id).length,1);assert.deepEqual(s.posts.filter(item=>item.taskId===f.tasks[1].id).map(item=>item.body),[bytes,bytes]);assert.equal(s.posts.filter(item=>item.taskId===f.tasks[2].id).length,1);assert.equal(s.receipts.size,3);assert.ok([...s.state.values()].every(task=>task.revision===2));passed++;
}
for(const code of [400,409,413,422]){
 const f=make(),s=server(f.tasks);s.reject(f.tasks[1].id,code);const result=await run(f,s);assert.equal(result.status,'conflict');assert.equal(result.index,1);assert.deepEqual(result.items[1].result,{status:'rejected',code});assert.equal(s.posts.length,2);assert.equal(s.receipts.size,1);assert.equal(s.state.get(f.tasks[1].id).revision,1);assert.equal(s.state.get(f.tasks[2].id).revision,1);assert.equal(h.canClearTaskCenterBatch(result),true);
 assert.deepEqual(read(f),result);await run({...f,batch:result},s);assert.equal(s.posts.length,2,'Definitive conflict must stop without retry or later POST');await h.clearTaskCenterBatch(f.localStore,result,mutex());assert.equal(read(f),null);passed++;
}
{
 const f=make(),s=server(f.tasks);s.failRead(f.tasks[0].id);await assert.rejects(()=>run(f,s),error=>error instanceof h.TaskCenterBatchFailure&&error.kind==='read');const saved=read(f);assert.equal(saved.index,0);assert.equal(saved.items[0].attempt.phase,'confirmed');assert.equal(h.canClearTaskCenterBatch(saved),false);assert.equal(s.posts.length,1);await assert.rejects(()=>h.clearTaskCenterBatch(f.localStore,saved,mutex()));s.failRead(null);
 const result=await run({...f,batch:saved},s);assert.equal(result.status,'completed');assert.equal(s.posts.filter(item=>item.taskId===f.tasks[0].id).length,1,'Confirmed but unread receipt must use GET, not POST');assert.equal(s.receipts.size,3);passed++;
}
for(const method of ['getItem','setItem']){
 const f=make(),s=server(f.tasks);f.localStore[method]=()=>{throw Error('LOCAL_STORAGE_FAILURE');};await assert.rejects(()=>run(f,s));assert.equal(s.posts.length,0);passed++;
}
{
 const f=make(),s=server(f.tasks),get=f.localStore.getItem,set=f.localStore.setItem;let written=false;f.localStore.setItem=(key,value)=>{written=true;set(key,value);};f.localStore.getItem=key=>written?'READBACK_CHANGED':get(key);await assert.rejects(()=>run(f,s));assert.equal(s.posts.length,0);passed++;
}
{
 const f=make(),s=server(f.tasks);await assert.rejects(()=>run(f,s,{onCheckpoint:()=>{throw Error('LOCAL_MIRROR_FAILED');}}));assert.equal(s.posts.length,0);passed++;
}
{
 const f=make(),s=server(f.tasks),set=f.localStore.setItem;let fail=true;f.localStore.setItem=(key,value)=>{if(fail&&JSON.parse(value).index===1)throw Error('LOCAL_PROGRESS_WRITE_FAILED');set(key,value);};await assert.rejects(()=>run(f,s));assert.equal(s.posts.length,1,'Do not start another task before progress is durable');assert.equal(s.receipts.size,1);fail=false;const saved=read(f);assert.equal(saved.index,0);assert.equal(saved.items[0].attempt.phase,'confirmed');const result=await run({...f,batch:saved},s);assert.equal(result.status,'completed');assert.equal(s.posts.filter(item=>item.taskId===f.tasks[0].id).length,1);passed++;
}
for(const terminal of ['completed','conflict']){
 const f=make({count:1}),s=server(f.tasks),set=f.localStore.setItem;let fail=true,memory;
 if(terminal==='conflict')s.reject(f.tasks[0].id,409);
 f.localStore.setItem=(key,value)=>{if(fail&&JSON.parse(value).status===terminal)throw Error('LOCAL_TERMINAL_CHECKPOINT_FAILED');set(key,value);};
 await assert.rejects(()=>run(f,s),error=>{assert.ok(error instanceof h.TaskCenterBatchFailure);assert.equal(error.kind,'storage');memory=error.batch;assert.equal(memory.status,terminal);return true;});
 const disk=read(f);assert.equal(disk.status,'pending');assert.equal(disk.index,0);assert.equal(disk.items[0].attempt.phase,terminal==='completed'?'confirmed':'uncertain');
 const postCount=s.posts.length,readCount=s.reads.length;assert.equal(postCount,1);fail=false;
 const result=await run({...f,batch:memory},s);assert.equal(result.status,terminal);assert.deepEqual(read(f),result,'A terminal memory checkpoint must become durable before clear');assert.equal(s.posts.length,postCount,'Terminal recovery must not POST again');assert.equal(s.reads.length,readCount,'Canonical terminal result is already known');await h.clearTaskCenterBatch(f.localStore,result,mutex());assert.equal(read(f),null);passed++;
}
for(const location of ['single','batch','local','session','draft']){
 const localStore=storage(),sessionStore=storage(),selected=tasks(),last=selected.at(-1),key=location==='single'?single.taskCenterWriteKey(owner):location==='batch'?h.taskCenterBatchKey(owner):location==='draft'?single.taskCenterDraftKey(owner,last.workId):legacy.workTaskWriteKey(owner,last.workId),store=location==='session'||location==='draft'?sessionStore:localStore;
 store.setItem(key,'{PRESERVE_EXISTING');assert.throws(()=>h.createTaskCenterBatch({accountId:owner,tasks:selected,action:'complete',localStore,sessionStore}));assert.equal(store.getItem(key),'{PRESERVE_EXISTING');passed++;
}
for(const raw of ['{CORRUPT_BATCH','']){
 const f=make(),task=f.tasks[0],s=server([task]),attempt=single.createTaskCenterWrite({accountId:owner,task,action:'complete',localStore:f.localStore,sessionStore:f.sessionStore});f.localStore.setItem(h.taskCenterBatchKey(owner),raw);
 assert.throws(()=>single.createTaskCenterWrite({accountId:owner,task,action:'complete',localStore:f.localStore,sessionStore:f.sessionStore}));
 await assert.rejects(()=>single.continueTaskCenterWrite({store:f.localStore,sessionStore:f.sessionStore,attempt,request:s.request,currentAccount:()=>owner,currentWork:()=>task.workId,onCheckpoint:()=>{},locks:mutex()}));assert.equal(s.posts.length,0);assert.equal(f.localStore.getItem(h.taskCenterBatchKey(owner)),raw);assert.equal(f.localStore.getItem(single.taskCenterWriteKey(owner)),null);passed++;
}
{
 const f=make(),s=server(f.tasks);const key=single.taskCenterDraftKey(owner,f.tasks[1].workId);let inserted=false;
 await assert.rejects(()=>run(f,s,{onCheckpoint:batch=>{if(batch.index===1&&!inserted){inserted=true;f.sessionStore.setItem(key,'EDITOR_DRAFT_BETWEEN_ITEMS');}}}),error=>error instanceof h.TaskCenterBatchFailure&&error.kind==='job');assert.equal(s.posts.length,1);assert.equal(read(f).index,1);assert.equal(f.sessionStore.getItem(key),'EDITOR_DRAFT_BETWEEN_ITEMS');f.sessionStore.removeItem(key);assert.equal((await run({...f,batch:read(f)},s)).status,'completed');assert.equal(s.receipts.size,3);passed++;
}
{
 const f=make(),s=server(f.tasks);await assert.rejects(()=>run(f,s,{currentAccount:()=>other}));assert.equal(s.posts.length,0);assert.equal(f.localStore.values.size,0);passed++;
}
{
 const f=make(),s=server(f.tasks);let active=true;const request=async(...args)=>{const response=await s.request(...args);active=false;return response;};await assert.rejects(()=>run(f,s,{request,currentAccount:()=>active?owner:other}));assert.equal(s.posts.length,1);assert.equal(read(f).index,0);assert.equal(read(f).items[0].attempt.phase,'uncertain');passed++;
}
{
 const f=make(),s=server(f.tasks),locks=mutex();let release,entered;const held=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});const first=run(f,s,{locks,request:async(...args)=>{entered();await held;return s.request(...args);}});await started;
 const second=make(),secondServer=server(second.tasks);await assert.rejects(()=>run(second,secondServer,{locks}),error=>error instanceof single.TaskCenterBusyError&&error.reason==='busy');assert.equal(secondServer.posts.length,0);assert.equal(second.localStore.values.size,0);release();assert.equal((await first).status,'completed');passed++;
}
{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
 try{const f=make(),s=server(f.tasks);await assert.rejects(()=>run(f,s,{locks:undefined}),error=>error instanceof single.TaskCenterBusyError&&error.reason==='unavailable');assert.equal(s.posts.length,0);assert.equal(f.localStore.values.size,0);passed++;}finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
}
{
 const f=make(),s=server(f.tasks);s.badAck(f.tasks[0].id);await assert.rejects(()=>run(f,s));assert.equal(s.posts.length,1);assert.equal(read(f).index,0);assert.equal(read(f).items[0].attempt.phase,'uncertain');assert.equal(s.receipts.size,1);passed++;
}
{
 const localStore=storage(),sessionStore=storage(),selected=tasks();for(const bad of [[],Array.from({length:101},()=>tasks(1)[0]),[selected[0],selected[0]],[{...selected[0],archived:true}],[{...selected[0],status:'done'}]])assert.throws(()=>h.createTaskCenterBatch({accountId:owner,tasks:bad,action:'complete',localStore,sessionStore}));assert.equal(localStore.values.size,0);passed++;
}
{
 const f=make();for(const corrupt of [{...f.batch,index:3},{...f.batch,status:'completed'},{...f.batch,unexpected:true},{...f.batch,accountId:other}])assert.throws(()=>h.parseTaskCenterBatch(corrupt,owner));assert.throws(()=>h.parseTaskCenterBatch(f.batch,other));passed++;
}
console.log(`Task-center batch contracts: ${passed} PASS (no browser/network/DB/PDF)`);
