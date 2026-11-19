import {z} from 'zod';
import {workTaskSchema,type WorkTask} from './work-tasks';
import {createWorkTaskWrite,parseWorkTaskWrite,saveWorkTaskWrite,clearWorkTaskWrite,continueWorkTaskWrite,mergeWorkTaskWrite,workTaskWriteKey,type WorkTaskWrite} from './work-task-recovery';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type TaskCenterLocks=Pick<LockManager,'request'>;
export class TaskCenterBusyError extends Error{
 readonly kind='busy';
 constructor(readonly reason:'busy'|'unavailable'|'pending',readonly workId?:string){super(reason);}
}
export class TaskCenterOriginalPendingError extends Error{
 readonly kind='job';
 constructor(readonly workId:string){super('Original job has pending task work');}
}
export class TaskCenterWriteBlocked extends Error{
 constructor(readonly kind:'storage'|'scope',readonly workId?:string){super(kind);}
}
const actorSchema=z.string().uuid(),workSchema=z.string().min(1).max(160),maxBytes=40000;
export function taskCenterWriteKey(accountId:string){return 'ccr:pro:task-center-write:v1:'+actorSchema.parse(accountId);}
export function taskCenterDraftKey(accountId:string,workId:string){return 'ccr:pro:work-task-draft:v1:'+actorSchema.parse(accountId)+':'+encodeURIComponent(workSchema.parse(workId));}
export function parseTaskCenterWrite(value:unknown,accountId:string):WorkTaskWrite{
 const actor=actorSchema.parse(accountId),workId=workSchema.parse(value&&typeof value==='object'&&!Array.isArray(value)?('workId'in value?value.workId:undefined):undefined);
 const record=parseWorkTaskWrite(value,actor,workId),input=JSON.parse(record.body);
 // The center can only toggle an existing task, never absorb a job editor's CRUD.
 if(!['complete','reopen'].includes(input.action)||!record.baseline||record.baseline.archived||input.action==='complete'&&record.baseline.status!=='open'||input.action==='reopen'&&record.baseline.status!=='done')throw new TaskCenterWriteBlocked('scope',workId);
 workTaskSchema.strict().parse((value as WorkTaskWrite).baseline);if(record.task)workTaskSchema.strict().parse((value as WorkTaskWrite).task);
 return record;
}
export function readTaskCenterWrite(store:Store,accountId:string){
 const raw=store.getItem(taskCenterWriteKey(accountId));if(raw===null)return null;if(raw.length>maxBytes)throw new TaskCenterWriteBlocked('storage');return parseTaskCenterWrite(JSON.parse(raw),accountId);
}
function batchPending(store:Store,accountId:string){if(store.getItem('ccr:pro:task-center-batch:v1:'+actorSchema.parse(accountId))!==null)throw new TaskCenterBusyError('pending');}
function originalPending(localStore:Store,sessionStore:Store|undefined,accountId:string,workId:string){
 const key=workTaskWriteKey(accountId,workId);
 if(localStore.getItem(key)!==null||sessionStore&&(sessionStore.getItem(key)!==null||sessionStore.getItem(taskCenterDraftKey(accountId,workId))!==null))throw new TaskCenterOriginalPendingError(workId);
}
export function createTaskCenterWrite({accountId,task,action,localStore,sessionStore,actionId=crypto.randomUUID()}:{accountId:string;task:WorkTask;action:'complete'|'reopen';localStore:Store;sessionStore:Store;actionId?:string}):WorkTaskWrite{
 const actor=actorSchema.parse(accountId),baseline=workTaskSchema.strict().parse(task);
 try{
  batchPending(localStore,actor);const old=readTaskCenterWrite(localStore,actor);if(old)throw new TaskCenterBusyError('pending',old.workId);
  originalPending(localStore,sessionStore,actor,baseline.workId);
 }catch(cause){if(cause instanceof TaskCenterBusyError||cause instanceof TaskCenterOriginalPendingError)throw cause;throw new TaskCenterWriteBlocked('storage',baseline.workId);}
 return parseTaskCenterWrite(createWorkTaskWrite(actor,{action,workId:baseline.workId,taskId:baseline.id,actionId,revision:baseline.revision},baseline),actor);
}
/** Translate exactly one original helper key; no original job key is ever written. */
export function taskCenterWriteStore(store:Store,accountId:string,workId:string):Store{
 const actor=actorSchema.parse(accountId),work=workSchema.parse(workId),expected=workTaskWriteKey(actor,work),global=taskCenterWriteKey(actor);
 const checkKey=(key:string)=>{if(key!==expected)throw new TaskCenterWriteBlocked('scope',work);};
 const read=()=>{const raw=store.getItem(global);if(raw!==null){if(raw.length>maxBytes)throw new TaskCenterWriteBlocked('storage',work);const record=parseTaskCenterWrite(JSON.parse(raw),actor);if(record.workId!==work)throw new TaskCenterWriteBlocked('scope',work);}return raw;};
 let lastRead:string|null|undefined;
 return{
  getItem(key){checkKey(key);return lastRead=read();},
  setItem(key,raw){checkKey(key);if(raw.length>maxBytes)throw new TaskCenterWriteBlocked('storage',work);const next=parseTaskCenterWrite(JSON.parse(raw),actor);if(next.workId!==work)throw new TaskCenterWriteBlocked('scope',work);const before=read();if(before!==null){const previous=parseTaskCenterWrite(JSON.parse(before),actor);mergeWorkTaskWrite(next,previous);if(({ready:0,uncertain:1,confirmed:2}[previous.phase])>({ready:0,uncertain:1,confirmed:2}[next.phase]))throw new TaskCenterWriteBlocked('storage',work);}if(lastRead!==undefined&&before!==lastRead)throw new TaskCenterWriteBlocked('storage',work);store.setItem(global,raw);if(store.getItem(global)!==raw)throw new TaskCenterWriteBlocked('storage',work);lastRead=raw;},
  removeItem(key){checkKey(key);const before=read();if(lastRead===undefined||before!==lastRead)throw new TaskCenterWriteBlocked('storage',work);store.removeItem(global);if(store.getItem(global)!==null)throw new TaskCenterWriteBlocked('storage',work);lastRead=null;},
 };
}
/** Low-level persistence for checkpoints while holding the center's Web Lock. */
export function saveTaskCenterWrite(store:Store,attempt:WorkTaskWrite){const record=parseTaskCenterWrite(attempt,attempt.accountId);saveWorkTaskWrite(taskCenterWriteStore(store,record.accountId,record.workId),record);}
function defaultLocks(){return typeof navigator==='undefined'?undefined:navigator.locks;}
async function exclusive<T>(accountId:string,locks:TaskCenterLocks|undefined,operation:()=>Promise<T>){
 if(!locks)throw new TaskCenterBusyError('unavailable');
 return locks.request(taskCenterWriteKey(accountId),{mode:'exclusive',ifAvailable:true},async lock=>{if(!lock)throw new TaskCenterBusyError('busy');return operation();});
}
export async function clearTaskCenterWrite(store:Store,attempt:WorkTaskWrite,locks:TaskCenterLocks|undefined=defaultLocks()){
 const record=parseTaskCenterWrite(attempt,attempt.accountId);
 return exclusive(record.accountId,locks,async()=>clearWorkTaskWrite(taskCenterWriteStore(store,record.accountId,record.workId),record));
}
export async function continueTaskCenterWrite({store,attempt,locks=defaultLocks(),sessionStore, ...args}:Omit<Parameters<typeof continueWorkTaskWrite>[0],'store'|'attempt'>&{store:Store;attempt:WorkTaskWrite;locks?:TaskCenterLocks;sessionStore?:Store}){
 const record=parseTaskCenterWrite(attempt,attempt.accountId);
 return exclusive(record.accountId,locks,async()=>{
  if(args.currentAccount()!==record.accountId||args.currentWork()!==record.workId)throw new TaskCenterWriteBlocked('scope',record.workId);
  // Recheck the original editor after acquiring the global lock. This also
  // protects a restored attempt from colliding with later local job editing.
  let session=sessionStore;
  if(!session&&typeof window!=='undefined'){try{session=window.sessionStorage;}catch{throw new TaskCenterWriteBlocked('storage',record.workId);}}
  batchPending(store,record.accountId);originalPending(store,session,record.accountId,record.workId);
  return continueWorkTaskWrite({...args,attempt:record,store:taskCenterWriteStore(store,record.accountId,record.workId)});
 });
}
