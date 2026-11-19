import {z} from 'zod';
import {taskTemplateMutationSchema,taskTemplateResultSchema,taskTemplateReceiptSchema,type TaskTemplateMutation,type TaskTemplateResult} from './task-templates';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Locks=Pick<LockManager,'request'>;
const recordSchema=z.object({version:z.literal(1),accountId:z.string().uuid(),body:z.string().min(1).max(2*1024*1024),phase:z.enum(['ready','uncertain','confirmed','rejected']),rejectionCode:z.number().nullable(),ack:taskTemplateResultSchema.nullable()}).strict();
export type TaskTemplateWrite=z.infer<typeof recordSchema>;
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const order={ready:0,uncertain:1,confirmed:2,rejected:2};
const rejections=[400,403,404,409,413,422];
export const taskTemplateWriteKey=(actor:string)=>'ccr:pro:task-template-write:v1:'+z.string().uuid().parse(actor);
const lockKey=(actor:string)=>taskTemplateWriteKey(actor)+':lock';

function matches(input:TaskTemplateMutation,result:TaskTemplateResult){
 if(input.action!==result.action)return false;
 if(result.action==='apply')return input.action==='apply'&&result.templateId===input.templateId&&result.templateRevision===input.revision&&result.workId===input.workId&&equal(result.taskIds,input.newTaskIds);
 if(result.template.id!==input.templateId||result.template.revision!==input.revision+1||result.template.archived!==(input.action==='archive'))return false;
 if(input.action==='save')return result.template.name===input.name&&result.template.notes===input.notes&&result.template.count===input.rows.length;
 if(input.action==='capture')return result.template.name===input.name&&result.template.notes===input.notes&&result.template.count===input.selected.length;
 return true;
}
export function parseTaskTemplateWrite(value:unknown,actor:string){
 const record=recordSchema.parse(value),input=taskTemplateMutationSchema.parse(JSON.parse(record.body));
 if(record.accountId!==actor||JSON.stringify(input)!==record.body||(record.phase==='confirmed')!==(record.ack!==null)||(record.phase==='rejected')!==(record.rejectionCode!==null)||record.rejectionCode!==null&&!rejections.includes(record.rejectionCode)||record.ack&&!matches(input,record.ack))throw Error('Invalid task template recovery');
 return record;
}
export function createTaskTemplateWrite(actor:string,input:TaskTemplateMutation){
 return parseTaskTemplateWrite({version:1,accountId:actor,body:JSON.stringify(taskTemplateMutationSchema.parse(input)),phase:'ready',rejectionCode:null,ack:null},actor);
}
export function readTaskTemplateWrite(store:Store,actor:string){
 const raw=store.getItem(taskTemplateWriteKey(actor));if(raw===null)return null;
 if(raw.length>3*1024*1024)throw Error('Task template journal too large');
 return parseTaskTemplateWrite(JSON.parse(raw),actor);
}
export function mergeTaskTemplateWrite(a:TaskTemplateWrite,b:TaskTemplateWrite|null){
 a=parseTaskTemplateWrite(a,a.accountId);if(!b)return a;b=parseTaskTemplateWrite(b,a.accountId);
 if(a.body!==b.body||a.ack&&b.ack&&!equal(a.ack,b.ack)||a.rejectionCode!==null&&b.rejectionCode!==null&&a.rejectionCode!==b.rejectionCode||a.phase==='confirmed'&&b.phase==='rejected'||a.phase==='rejected'&&b.phase==='confirmed')throw Error('Different task template attempts');
 return order[b.phase]>order[a.phase]?b:a;
}
export function saveTaskTemplateWrite(store:Store,value:TaskTemplateWrite){
 const record=parseTaskTemplateWrite(value,value.accountId),old=readTaskTemplateWrite(store,record.accountId);
 if(old&&!equal(mergeTaskTemplateWrite(record,old),record))throw Error('Task template checkpoint moved backwards');
 const key=taskTemplateWriteKey(record.accountId),raw=JSON.stringify(record);store.setItem(key,raw);
 if(store.getItem(key)!==raw)throw Error('Task template checkpoint not retained');
}
export class TaskTemplateWriteFailure extends Error{
 constructor(readonly kind:'scope'|'storage'|'uncertain'|'read',readonly attempt:TaskTemplateWrite,readonly permissionStatus?:403|404){super(kind);}
}
export class TaskTemplateBusyError extends Error{}
const verified=new WeakSet<TaskTemplateWrite>(),denials=new WeakSet<TaskTemplateWriteFailure>();
async function withLock<T>(actor:string,locks:Locks|undefined,run:()=>Promise<T>){
 if(!locks)throw new TaskTemplateBusyError('unavailable');
 return locks.request(lockKey(actor),{mode:'exclusive',ifAvailable:true},async held=>{if(!held)throw new TaskTemplateBusyError('busy');return run();});
}
export async function clearTaskTemplateWrite(store:Store,record:TaskTemplateWrite,locks:Locks|undefined=globalThis.navigator?.locks){
 return withLock(record.accountId,locks,async()=>{
  parseTaskTemplateWrite(record,record.accountId);
  if(record.phase==='uncertain'||record.phase==='confirmed'&&!verified.has(record))throw Error('Task template result unresolved');
  const old=readTaskTemplateWrite(store,record.accountId);if(old&&!equal(old,record))throw Error('Task template journal changed');
  const key=taskTemplateWriteKey(record.accountId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Task template journal not cleared');
 });
}
export async function archiveTaskTemplateWrite(store:Store,record:TaskTemplateWrite,error:TaskTemplateWriteFailure,locks:Locks|undefined=globalThis.navigator?.locks){
 return withLock(record.accountId,locks,async()=>{
  if(!denials.has(error)||!equal(error.attempt,record)||!equal(readTaskTemplateWrite(store,record.accountId),record))throw Error('Current permission denial required');
  const input=taskTemplateMutationSchema.parse(JSON.parse(record.body)),key=taskTemplateWriteKey(record.accountId),archive=key+':archived:'+input.actionId,raw=JSON.stringify(record),old=store.getItem(archive);
  if(old!==null&&old!==raw)throw Error('Task template archive changed');
  store.setItem(archive,raw);if(store.getItem(archive)!==raw)throw Error('Task template archive not retained');
  store.removeItem(key);if(store.getItem(key)!==null)throw Error('Task template archive did not clear journal');denials.delete(error);
 });
}
type Continuation={status:'confirmed';attempt:TaskTemplateWrite;result:TaskTemplateResult}|{status:'missing';attempt:TaskTemplateWrite;result:null}|{status:'rejected';attempt:TaskTemplateWrite;result:null;code:number};
export async function continueTaskTemplateWrite({store,attempt:initial,request,currentAccount,mode,onCheckpoint,locks=globalThis.navigator?.locks}:{store:Store;attempt:TaskTemplateWrite;request:(url:string,init?:RequestInit)=>Promise<Response>;currentAccount:()=>string|undefined;mode:'check'|'retry';onCheckpoint:(record:TaskTemplateWrite)=>void;locks?:Locks}):Promise<Continuation>{
 return withLock(initial.accountId,locks,async()=>{
  let attempt=parseTaskTemplateWrite(initial,initial.accountId);
  const scope=()=>{if(currentAccount()!==attempt.accountId)throw new TaskTemplateWriteFailure('scope',attempt);};scope();
  try{attempt=mergeTaskTemplateWrite(attempt,readTaskTemplateWrite(store,attempt.accountId));}catch{throw new TaskTemplateWriteFailure('storage',attempt);}
  const checkpoint=(next:TaskTemplateWrite)=>{
   attempt=next;try{scope();saveTaskTemplateWrite(store,attempt);scope();onCheckpoint(attempt);}catch(error){if(error instanceof TaskTemplateWriteFailure)throw error;throw new TaskTemplateWriteFailure('storage',attempt);}
  };
  checkpoint(attempt);
  const input=taskTemplateMutationSchema.parse(JSON.parse(attempt.body)),headers={'X-Pro-Expected-Actor':attempt.accountId};
  const denied=(kind:'read'|'uncertain',status:number)=>{const error=new TaskTemplateWriteFailure(kind,attempt,status===403||status===404?status:undefined);if(error.permissionStatus)denials.add(error);return error;};
  if(attempt.phase==='rejected')return{status:'rejected',attempt,result:null,code:attempt.rejectionCode!};
  if(mode==='retry'&&attempt.phase!=='confirmed'){
   const fresh=attempt.phase==='ready';checkpoint({...attempt,phase:'uncertain'});scope();
   let response:Response;try{response=await request('/api/pro/task-templates',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:attempt.body});}catch{throw new TaskTemplateWriteFailure('uncertain',attempt);}scope();
   if(fresh&&rejections.includes(response.status)){checkpoint({...attempt,phase:'rejected',rejectionCode:response.status});return{status:'rejected',attempt,result:null,code:response.status};}
   if(!response.ok)throw denied('uncertain',response.status);
   try{const result=taskTemplateResultSchema.parse(await response.json());scope();if(!matches(input,result))throw Error();checkpoint({...attempt,phase:'confirmed',ack:result});}catch(error){if(error instanceof TaskTemplateWriteFailure)throw error;throw new TaskTemplateWriteFailure('uncertain',attempt);}
  }
  try{
   const response=await request('/api/pro/task-templates?'+new URLSearchParams({view:'action',actionId:input.actionId}),{cache:'no-store',headers});scope();
   if(!response.ok)throw denied('read',response.status);
   const {receipt}=taskTemplateReceiptSchema.parse(await response.json());scope();
   if(!receipt){if(attempt.phase==='confirmed')throw Error('Task template receipt disappeared');return{status:'missing',attempt,result:null};}
   if(JSON.stringify(receipt.input)!==attempt.body||!matches(input,receipt.result)||attempt.ack&&!equal(attempt.ack,receipt.result))throw Error('Task template proof changed');
   if(attempt.phase!=='confirmed')checkpoint({...attempt,phase:'confirmed',ack:receipt.result});
   verified.add(attempt);return{status:'confirmed',attempt,result:receipt.result};
  }catch(error){if(error instanceof TaskTemplateWriteFailure)throw error;throw new TaskTemplateWriteFailure('read',attempt);}
 });
}
