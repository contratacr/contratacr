import {z} from 'zod';
import {workTaskMutationSchema,workTaskSchema,type WorkTask,type WorkTaskMutation} from './work-tasks';

const recordSchema=z.object({version:z.literal(1),accountId:z.string().uuid(),workId:z.string().min(1).max(160),body:z.string().min(1).max(16000),phase:z.enum(['ready','uncertain','confirmed']),baseline:workTaskSchema.nullable(),task:workTaskSchema.nullable()}).strict();
export type WorkTaskWrite=z.infer<typeof recordSchema>;
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const phases={ready:0,uncertain:1,confirmed:2};
export function workTaskWriteKey(accountId:string,workId:string){return 'ccr:pro:work-task-write:v1:'+z.string().uuid().parse(accountId)+':'+encodeURIComponent(z.string().min(1).max(160).parse(workId));}
function matchesAcknowledgement(task:WorkTask,input:WorkTaskMutation,baseline:WorkTask|null){
 if(task.id!==input.taskId||task.workId!==input.workId||task.revision!==input.revision+1)return false;
 const content=input.action==='create'||input.action==='update'?input:baseline;
 if(!content||(['title','details','dueDate','assignee'] as const).some(key=>task[key]!==content[key]))return false;
 const status=input.action==='complete'?'done':input.action==='reopen'||input.action==='create'?'open':baseline?.status;
 const archived=input.action==='archive'?true:input.action==='restore'||input.action==='create'?false:baseline?.archived;
 return task.status===status&&task.archived===archived&&(!baseline||task.createdAt===baseline.createdAt);
}
export function parseWorkTaskWrite(value:unknown,accountId:string,workId:string):WorkTaskWrite{
 const record=recordSchema.parse(value),input=workTaskMutationSchema.parse(JSON.parse(record.body));
 if(record.accountId!==accountId||record.workId!==workId||input.workId!==workId||JSON.stringify(input)!==record.body||(record.phase==='confirmed')!==(record.task!==null)||record.task&&!matchesAcknowledgement(record.task,input,record.baseline)||input.action==='create'&&record.baseline!==null||input.action!=='create'&&(!record.baseline||record.baseline.id!==input.taskId||record.baseline.workId!==workId||record.baseline.revision!==input.revision))throw Error('Invalid task recovery scope');
 return record;
}
export function createWorkTaskWrite(accountId:string,input:WorkTaskMutation,baseline:WorkTask|null=null){const parsed=workTaskMutationSchema.parse(input);return parseWorkTaskWrite({version:1,accountId,workId:parsed.workId,body:JSON.stringify(parsed),phase:'ready',baseline,task:null},accountId,parsed.workId);}
export function readWorkTaskWrite(store:Store,accountId:string,workId:string){const raw=store.getItem(workTaskWriteKey(accountId,workId));if(raw===null)return null;if(raw.length>40000)throw Error('Task recovery is too large');return parseWorkTaskWrite(JSON.parse(raw),accountId,workId);}
export function mergeWorkTaskWrite(first:WorkTaskWrite,other:WorkTaskWrite|null){const a=parseWorkTaskWrite(first,first.accountId,first.workId);if(!other)return a;const b=parseWorkTaskWrite(other,a.accountId,a.workId);if(a.body!==b.body||JSON.stringify(a.baseline)!==JSON.stringify(b.baseline)||a.task&&b.task&&JSON.stringify(a.task)!==JSON.stringify(b.task))throw Error('Different task attempts');return phases[b.phase]>phases[a.phase]?b:a;}
export function saveWorkTaskWrite(store:Store,value:WorkTaskWrite){const record=parseWorkTaskWrite(value,value.accountId,value.workId),old=readWorkTaskWrite(store,record.accountId,record.workId);if(old&&(old.body!==record.body||JSON.stringify(old.baseline)!==JSON.stringify(record.baseline)||phases[old.phase]>phases[record.phase]||old.task&&JSON.stringify(old.task)!==JSON.stringify(record.task)))throw Error('Task attempt changed');const key=workTaskWriteKey(record.accountId,record.workId),raw=JSON.stringify(record);store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Task attempt was not retained');}
export function clearWorkTaskWrite(store:Store,value:WorkTaskWrite){const record=parseWorkTaskWrite(value,value.accountId,value.workId),old=readWorkTaskWrite(store,record.accountId,record.workId);if(old&&JSON.stringify(old)!==JSON.stringify(record))throw Error('Task attempt changed before clearing');const key=workTaskWriteKey(record.accountId,record.workId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Task attempt was not cleared');}
export class WorkTaskWriteFailure extends Error{constructor(readonly kind:'scope'|'storage'|'uncertain'|'read',readonly attempt:WorkTaskWrite){super(kind);}}
/** Same captured action/body on retry; a confirmed attempt only reads. Never call on mount. */
export async function continueWorkTaskWrite({attempt:initial,store,request,currentAccount,currentWork,onCheckpoint}:{attempt:WorkTaskWrite;store:Store;request:(url:string,init?:RequestInit)=>Promise<Response>;currentAccount:()=>string|undefined;currentWork:()=>string|undefined;onCheckpoint:(value:WorkTaskWrite)=>void}):Promise<{status:'confirmed';attempt:WorkTaskWrite;task:WorkTask}|{status:'rejected';attempt:WorkTaskWrite;code:number;reason?:'photo_required'}>{
 let attempt=parseWorkTaskWrite(initial,initial.accountId,initial.workId);
 const input=workTaskMutationSchema.parse(JSON.parse(attempt.body));
 const scope=()=>{if(currentAccount()!==attempt.accountId||currentWork()!==attempt.workId)throw new WorkTaskWriteFailure('scope',attempt);};
 const checkpoint=(value:WorkTaskWrite)=>{attempt=value;try{onCheckpoint(attempt);saveWorkTaskWrite(store,attempt);}catch{throw new WorkTaskWriteFailure('storage',attempt);}};
 scope();checkpoint(attempt);
 if(attempt.phase!=='confirmed'){
  checkpoint({...attempt,phase:'uncertain'});scope();
  let response:Response;
  try{response=await request('/api/pro/work-tasks',{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':attempt.accountId},body:attempt.body});}catch{throw new WorkTaskWriteFailure('uncertain',attempt);}
  scope();
  if([400,409,413,422].includes(response.status)){const reason=response.status===400?await response.json().then((body:{code?:unknown})=>body?.code,()=>null):null;return reason==='photo_required'?{status:'rejected',attempt,code:response.status,reason}:{status:'rejected',attempt,code:response.status};}
  if(!response.ok)throw new WorkTaskWriteFailure('uncertain',attempt);
  let task:WorkTask;try{task=workTaskSchema.parse((await response.json()).task);if(!matchesAcknowledgement(task,input,attempt.baseline))throw Error();}catch{throw new WorkTaskWriteFailure('uncertain',attempt);}
  checkpoint({...attempt,phase:'confirmed',task});
 }
 scope();
 let task:WorkTask;
 try{const response=await request('/api/pro/work-tasks?'+new URLSearchParams({workId:attempt.workId,taskId:input.taskId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':attempt.accountId}});if(!response.ok)throw Error();task=workTaskSchema.parse((await response.json()).task);if(task.id!==input.taskId||task.workId!==attempt.workId||task.revision<attempt.task!.revision||task.revision===attempt.task!.revision&&JSON.stringify(task)!==JSON.stringify(attempt.task))throw Error();}catch{throw new WorkTaskWriteFailure('read',attempt);}
 scope();return{status:'confirmed',attempt,task};
}
