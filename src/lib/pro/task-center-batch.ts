import {z} from 'zod';
import {workTaskSchema,type WorkTask} from './work-tasks';
import {createWorkTaskWrite,continueWorkTaskWrite,mergeWorkTaskWrite,workTaskWriteKey,WorkTaskWriteFailure,type WorkTaskWrite} from './work-task-recovery';
import {parseTaskCenterWrite,taskCenterWriteKey,taskCenterDraftKey,TaskCenterBusyError,TaskCenterOriginalPendingError,type TaskCenterLocks} from './task-center-write';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const maxBytes=1_500_000,phases={ready:0,uncertain:1,confirmed:2};
const resultSchema=z.union([z.object({status:z.literal('confirmed'),task:workTaskSchema.strict()}).strict(),z.object({status:z.literal('rejected'),code:z.union([z.literal(400),z.literal(409),z.literal(413),z.literal(422)])}).strict()]);
type BatchResult=z.infer<typeof resultSchema>;
export type TaskCenterBatch={version:1;accountId:string;batchId:string;action:'complete'|'reopen';items:{attempt:WorkTaskWrite;result:BatchResult|null}[];index:number;status:'pending'|'conflict'|'completed'};
const schema=z.object({version:z.literal(1),accountId:z.string().uuid(),batchId:z.string().uuid(),action:z.enum(['complete','reopen']),items:z.array(z.object({attempt:z.unknown(),result:resultSchema.nullable()}).strict()).min(1).max(100),index:z.number().int().min(0).max(100),status:z.enum(['pending','conflict','completed'])}).strict();
export class TaskCenterBatchFailure extends Error{
 constructor(readonly kind:'scope'|'storage'|'uncertain'|'read'|'job',readonly batch:TaskCenterBatch,readonly workId?:string){super(kind);}
}
export function taskCenterBatchKey(accountId:string){return 'ccr:pro:task-center-batch:v1:'+z.string().uuid().parse(accountId);}
export function parseTaskCenterBatch(value:unknown,accountId:string):TaskCenterBatch{
 const parsed=schema.parse(value);if(parsed.accountId!==z.string().uuid().parse(accountId)||parsed.index>parsed.items.length)throw Error('Invalid batch scope');
 const items=parsed.items.map(item=>({attempt:parseTaskCenterWrite(item.attempt,accountId),result:item.result}));
 const taskIds=new Set<string>(),actionIds=new Set<string>();
 for(let index=0;index<items.length;index++){
  const item=items[index],input=JSON.parse(item.attempt.body);
  if(input.action!==parsed.action||taskIds.has(input.taskId)||actionIds.has(input.actionId))throw Error('Duplicate or mixed batch intents');taskIds.add(input.taskId);actionIds.add(input.actionId);
  if(item.result?.status==='confirmed'){
   const ack=item.attempt.task,task=item.result.task;
   if(item.attempt.phase!=='confirmed'||!ack||task.id!==ack.id||task.workId!==ack.workId||task.revision<ack.revision||task.revision===ack.revision&&JSON.stringify(task)!==JSON.stringify(ack))throw Error('Invalid batch confirmation');
  }
  if(item.result?.status==='rejected'&&item.attempt.phase!=='uncertain')throw Error('Invalid batch rejection');
  if(index<parsed.index&&item.result?.status!=='confirmed'||index>parsed.index&&(item.result!==null||item.attempt.phase!=='ready'))throw Error('Noncontiguous batch progress');
 }
 if(parsed.status==='completed'&&(parsed.index!==items.length||items.some(item=>item.result?.status!=='confirmed'))||parsed.status==='pending'&&(parsed.index===items.length||items[parsed.index].result!==null)||parsed.status==='conflict'&&(parsed.index===items.length||items[parsed.index].result?.status!=='rejected'))throw Error('Invalid batch status');
 const record={...parsed,items} as TaskCenterBatch;if(JSON.stringify(record).length>maxBytes)throw Error('Batch recovery is too large');return record;
}
export function readTaskCenterBatch(store:Store,accountId:string){const raw=store.getItem(taskCenterBatchKey(accountId));if(raw===null)return null;if(raw.length>maxBytes)throw Error('Batch recovery is too large');return parseTaskCenterBatch(JSON.parse(raw),accountId);}
function compatible(first:TaskCenterBatch,other:TaskCenterBatch){
 if(first.accountId!==other.accountId||first.batchId!==other.batchId||first.action!==other.action||first.items.length!==other.items.length)throw Error('Different batches');
 for(let i=0;i<first.items.length;i++){
  mergeWorkTaskWrite(first.items[i].attempt,other.items[i].attempt);
  if(first.items[i].result&&other.items[i].result&&JSON.stringify(first.items[i].result)!==JSON.stringify(other.items[i].result))throw Error('Different batch results');
 }
}
export function mergeTaskCenterBatch(first:TaskCenterBatch,other:TaskCenterBatch|null):TaskCenterBatch{
 const a=parseTaskCenterBatch(first,first.accountId);if(!other)return a;const b=parseTaskCenterBatch(other,a.accountId);compatible(a,b);
 if(a.index!==b.index)return a.index>b.index?a:b;
 if(a.status==='conflict'||b.status==='conflict')return a.status==='conflict'?a:b;
 if(a.status==='completed')return a;
 const items=a.items.map((item,index)=>index===a.index?{...item,attempt:mergeWorkTaskWrite(item.attempt,b.items[index].attempt)}:item);
 return parseTaskCenterBatch({...a,items},a.accountId);
}
/** Only call while holding the owner-wide task-center Web Lock. */
export function saveTaskCenterBatch(store:Store,value:TaskCenterBatch){
 const record=parseTaskCenterBatch(value,value.accountId),key=taskCenterBatchKey(record.accountId),before=store.getItem(key);
 if(before!==null){if(before.length>maxBytes)throw Error('Batch recovery is too large');const old=parseTaskCenterBatch(JSON.parse(before),record.accountId);compatible(old,record);
  if(record.index<old.index||old.status==='conflict'&&record.status!=='conflict'||old.status==='completed'&&record.status!=='completed')throw Error('Batch progress regressed');
  for(let i=0;i<old.items.length;i++)if(phases[old.items[i].attempt.phase]>phases[record.items[i].attempt.phase]||old.items[i].result&&JSON.stringify(old.items[i].result)!==JSON.stringify(record.items[i].result))throw Error('Batch checkpoint regressed');
 }
 if(store.getItem(key)!==before)throw Error('Batch changed before saving');const raw=JSON.stringify(record);store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Batch checkpoint was not retained');
}
function checkOriginal(store:Store,session:Store|undefined,accountId:string,workId:string){const key=workTaskWriteKey(accountId,workId);if(store.getItem(key)!==null||session&&(session.getItem(key)!==null||session.getItem(taskCenterDraftKey(accountId,workId))!==null))throw new TaskCenterOriginalPendingError(workId);}
function singlePending(store:Store,accountId:string){if(store.getItem(taskCenterWriteKey(accountId))!==null)throw new TaskCenterBusyError('pending');}
export function createTaskCenterBatch({accountId,tasks,action,localStore,sessionStore,batchId=crypto.randomUUID()}:{accountId:string;tasks:WorkTask[];action:'complete'|'reopen';localStore:Store;sessionStore:Store;batchId?:string}):TaskCenterBatch{
 const actor=z.string().uuid().parse(accountId),baselines=z.array(workTaskSchema.strict()).min(1).max(100).parse(tasks);
 singlePending(localStore,actor);if(localStore.getItem(taskCenterBatchKey(actor))!==null)throw new TaskCenterBusyError('pending');
 for(const workId of new Set(baselines.map(task=>task.workId)))checkOriginal(localStore,sessionStore,actor,workId);
 const items=baselines.map(task=>({attempt:createWorkTaskWrite(actor,{action,workId:task.workId,taskId:task.id,actionId:crypto.randomUUID(),revision:task.revision},task),result:null}));
 return parseTaskCenterBatch({version:1,accountId:actor,batchId,action,items,index:0,status:'pending'},actor);
}
export function canClearTaskCenterBatch(value:TaskCenterBatch){const batch=parseTaskCenterBatch(value,value.accountId);return batch.status==='completed'||batch.status==='conflict'||batch.items[batch.index].attempt.phase==='ready';}
function defaultLocks(){return typeof navigator==='undefined'?undefined:navigator.locks;}
async function exclusive<T>(accountId:string,locks:TaskCenterLocks|undefined,operation:()=>Promise<T>){if(!locks)throw new TaskCenterBusyError('unavailable');return locks.request(taskCenterWriteKey(accountId),{mode:'exclusive',ifAvailable:true},async lock=>{if(!lock)throw new TaskCenterBusyError('busy');return operation();});}
export async function clearTaskCenterBatch(store:Store,value:TaskCenterBatch,locks:TaskCenterLocks|undefined=defaultLocks()){
 const batch=parseTaskCenterBatch(value,value.accountId);if(!canClearTaskCenterBatch(batch))throw new TaskCenterBatchFailure('uncertain',batch);
 return exclusive(batch.accountId,locks,async()=>{const key=taskCenterBatchKey(batch.accountId),raw=store.getItem(key);if(raw===null)return;const old=parseTaskCenterBatch(JSON.parse(raw),batch.accountId);if(JSON.stringify(old)!==JSON.stringify(batch))throw new TaskCenterBatchFailure('storage',batch);if(store.getItem(key)!==raw)throw new TaskCenterBatchFailure('storage',batch);store.removeItem(key);if(store.getItem(key)!==null)throw new TaskCenterBatchFailure('storage',batch);});
}
export async function continueTaskCenterBatch({store,sessionStore,batch:initial,request,currentAccount,onCheckpoint,locks=defaultLocks()}:{store:Store;sessionStore?:Store;batch:TaskCenterBatch;request:Parameters<typeof continueWorkTaskWrite>[0]['request'];currentAccount:()=>string|undefined;onCheckpoint:(batch:TaskCenterBatch)=>void;locks?:TaskCenterLocks}):Promise<TaskCenterBatch>{
 let batch=parseTaskCenterBatch(initial,initial.accountId);
 const scope=()=>{if(currentAccount()!==batch.accountId)throw new TaskCenterBatchFailure('scope',batch);};
 const checkpoint=(next:TaskCenterBatch)=>{scope();batch=parseTaskCenterBatch(next,batch.accountId);try{onCheckpoint(batch);saveTaskCenterBatch(store,batch);}catch{throw new TaskCenterBatchFailure('storage',batch);}};
 return exclusive(batch.accountId,locks,async()=>{
  scope();singlePending(store,batch.accountId);
  let session=sessionStore;if(!session&&typeof window!=='undefined'){try{session=window.sessionStorage;}catch{throw new TaskCenterBatchFailure('storage',batch);}}
  let stored:TaskCenterBatch|null;
  try{stored=readTaskCenterBatch(store,batch.accountId);batch=mergeTaskCenterBatch(batch,stored);}catch{throw new TaskCenterBatchFailure('storage',batch);}
  if(batch.status!=='pending'){
   // A terminal result may exist only in memory after a late quota/readback
   // failure. Repair that durable checkpoint before offering exact clearing.
   scope();if(stored===null||JSON.stringify(stored)!==JSON.stringify(batch))checkpoint(batch);return batch;
  }
  // No durable fresh queue or POST before every original job has passed preflight.
  if(batch.index===0&&batch.items.every(item=>item.attempt.phase==='ready'))for(const workId of new Set(batch.items.map(item=>item.attempt.workId)))checkOriginal(store,session,batch.accountId,workId);
  checkpoint(batch);
  while(batch.status==='pending'){
   scope();const index=batch.index,attempt=batch.items[index].attempt;
   try{checkOriginal(store,session,batch.accountId,attempt.workId);}catch(cause){if(cause instanceof TaskCenterOriginalPendingError)throw new TaskCenterBatchFailure('job',batch,cause.workId);throw new TaskCenterBatchFailure('storage',batch,attempt.workId);}
   const expected=workTaskWriteKey(batch.accountId,attempt.workId);
   const updateAttempt=(next:WorkTaskWrite)=>parseTaskCenterBatch({...batch,items:batch.items.map((item,i)=>i===index?{...item,attempt:next}:item)},batch.accountId);
   const adapter:Store={
    getItem(key){if(key!==expected)throw Error('Wrong batch task key');const disk=readTaskCenterBatch(store,batch.accountId);if(!disk||disk.batchId!==batch.batchId||disk.index!==index)throw Error('Batch checkpoint changed');return JSON.stringify(disk.items[index].attempt);},
    setItem(key,raw){if(key!==expected||raw.length>40000)throw Error('Wrong batch task checkpoint');const next=parseTaskCenterWrite(JSON.parse(raw),batch.accountId);if(next.workId!==attempt.workId||next.body!==attempt.body)throw Error('Batch task intent changed');saveTaskCenterBatch(store,updateAttempt(next));},
    removeItem(){throw Error('Embedded task checkpoints must not be removed');},
   };
   try{
    const result=await continueWorkTaskWrite({store:adapter,attempt,request,currentAccount,currentWork:()=>currentAccount()===batch.accountId?attempt.workId:undefined,onCheckpoint:next=>{batch=updateAttempt(next);onCheckpoint(batch);}});
    scope();
    if(result.status==='rejected'){
     checkpoint({...batch,status:'conflict',items:batch.items.map((item,i)=>i===index?{attempt:result.attempt,result:{status:'rejected',code:result.code as 400|409|413|422}}:item)});return batch;
    }
    const nextIndex=index+1;
    checkpoint({...batch,index:nextIndex,status:nextIndex===batch.items.length?'completed':'pending',items:batch.items.map((item,i)=>i===index?{attempt:result.attempt,result:{status:'confirmed',task:result.task}}:item)});
   }catch(cause){
    if(cause instanceof TaskCenterBatchFailure)throw cause;
    if(cause instanceof WorkTaskWriteFailure){batch=updateAttempt(cause.attempt);throw new TaskCenterBatchFailure(cause.kind,batch,attempt.workId);}
    throw new TaskCenterBatchFailure('storage',batch,attempt.workId);
   }
  }
  return batch;
 });
}
