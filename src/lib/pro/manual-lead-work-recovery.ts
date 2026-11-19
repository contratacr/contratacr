import {z} from 'zod';
import {manualLeadWorkInputSchema,manualLeadWorkResultSchema,manualLeadWorkReceiptSchema,type ManualLeadWorkInput,type ManualLeadWorkResult} from './manual-lead-work';
import {businessSchema} from './business';
import {requestPipelineWriteKey} from './request-pipeline-recovery';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Locks=Pick<LockManager,'request'>;
type Request=(url:string,init?:RequestInit)=>Promise<Response>;
const id=z.string().uuid(),recordSchema=z.object({version:z.literal(1),accountId:id,body:z.string().min(1).max(2000),clientId:z.string().min(1).max(160),service:z.string().min(1).max(160),phase:z.enum(['ready','uncertain','rejected','confirmed']),result:manualLeadWorkResultSchema.nullable()}).strict();
export type ManualLeadWorkWrite=z.infer<typeof recordSchema>;
const verified=new WeakSet<object>(),rejected=new WeakSet<object>();
const rank={ready:0,uncertain:1,rejected:2,confirmed:3};
function same(a:unknown,b:unknown):boolean{if(a===b)return true;if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>same(v,b[i]));if(a&&b&&typeof a==='object'&&typeof b==='object'){const x=a as Record<string,unknown>,y=b as Record<string,unknown>;return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.hasOwn(y,k)&&same(x[k],y[k]));}return false;}
export const manualLeadWorkWriteKey=(actor:string)=>'ccr:pro:manual-lead-work:v1:'+id.parse(actor);
function resultFor(record:ManualLeadWorkWrite,value:unknown):ManualLeadWorkResult{
 const result=manualLeadWorkResultSchema.parse(value),input=manualLeadWorkInputSchema.parse(JSON.parse(record.body));
 if(result.link.leadId!==input.leadId||result.link.sourceLeadRevision!==input.leadRevision||result.link.sourceClientId!==record.clientId||result.link.workId!==input.workId||result.work.service!==record.service)throw Error('Different work conversion result');
 return result;
}
export function parseManualLeadWorkWrite(value:unknown,actor:string){const record=recordSchema.parse(value),input=manualLeadWorkInputSchema.parse(JSON.parse(record.body));if(record.accountId!==actor||record.body!==JSON.stringify(input)||(record.phase==='confirmed')!==(record.result!==null))throw Error('Invalid conversion scope');if(record.result)resultFor(record,record.result);return record;}
export function createManualLeadWorkWrite(actor:string,input:ManualLeadWorkInput,clientId:string,service:string){return parseManualLeadWorkWrite({version:1,accountId:actor,body:JSON.stringify(manualLeadWorkInputSchema.parse(input)),clientId,service,phase:'ready',result:null},actor);}
export function readManualLeadWorkWrite(store:Store,actor:string):ManualLeadWorkWrite|null{const raw=store.getItem(manualLeadWorkWriteKey(actor));if(raw===null)return null;if(raw.length>12000)throw Error('Conversion recovery too large');return parseManualLeadWorkWrite(JSON.parse(raw),actor);}
function merge(memory:ManualLeadWorkWrite,disk:ManualLeadWorkWrite|null){if(!disk)return memory;if(memory.body!==disk.body||memory.clientId!==disk.clientId||memory.service!==disk.service||memory.result&&disk.result&&!same(memory.result,disk.result))throw Error('Another conversion is pending');return rank[memory.phase]>=rank[disk.phase]?memory:disk;}
export function saveManualLeadWorkWrite(store:Store,value:ManualLeadWorkWrite){const parsed=parseManualLeadWorkWrite(value,value.accountId),record=merge(parsed,readManualLeadWorkWrite(store,value.accountId)),raw=JSON.stringify(record),key=manualLeadWorkWriteKey(record.accountId);store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Conversion recovery not retained');return record;}
export class ManualLeadWorkWriteFailure extends Error{constructor(public kind:'busy'|'storage'|'scope'|'read'|'uncertain',public attempt:ManualLeadWorkWrite){super(kind);}}
async function locked<T>(actor:string,locks:Locks|undefined,run:()=>Promise<T>):Promise<T>{const manager=locks??globalThis.navigator?.locks;if(!manager)throw Error('Locks unavailable');return manager.request(requestPipelineWriteKey(actor),{ifAvailable:true},lock=>{if(!lock)throw Error('Conversion busy');return run();});}
export async function continueManualLeadWorkWrite({store,attempt:initial,request,currentAccount,currentLead,mode,onCheckpoint,locks,timeoutMs=15000}:{store:Store;attempt:ManualLeadWorkWrite;request:Request;currentAccount:()=>string|undefined;currentLead:()=>string|undefined;mode:'check'|'retry';onCheckpoint:(record:ManualLeadWorkWrite)=>void;locks?:Locks;timeoutMs?:number}):Promise<{status:'confirmed';attempt:ManualLeadWorkWrite;result:ManualLeadWorkResult}|{status:'missing'|'rejected';attempt:ManualLeadWorkWrite}>{
 let attempt=parseManualLeadWorkWrite(initial,initial.accountId),entered=false;
 try{return await locked(attempt.accountId,locks,async()=>{
  entered=true;const scope=()=>{if(currentAccount()!==attempt.accountId)throw new ManualLeadWorkWriteFailure('scope',attempt);};
  const checkpoint=(value:ManualLeadWorkWrite)=>{attempt=value;onCheckpoint(value);try{attempt=saveManualLeadWorkWrite(store,value);onCheckpoint(attempt);}catch{throw new ManualLeadWorkWriteFailure('storage',attempt);}};
  scope();try{attempt=merge(attempt,readManualLeadWorkWrite(store,attempt.accountId));}catch{throw new ManualLeadWorkWriteFailure('storage',attempt);}checkpoint(attempt);
  const input=manualLeadWorkInputSchema.parse(JSON.parse(attempt.body));
  const call=async(url:string,init:RequestInit={})=>{const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([(async()=>{const response=await request(url,{...init,headers:{...init.headers,'X-Pro-Expected-Actor':attempt.accountId},signal:controller.signal});const body=await response.json();scope();return{ok:response.ok,status:response.status,body};})(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Conversion timed out'));},timeoutMs);})]);}finally{if(timer!==undefined)clearTimeout(timer);}};
  const proof=async()=>{const response=await call('/api/pro/lead-private-work?'+new URLSearchParams({view:'action',actionId:input.actionId}),{cache:'no-store'});if(!response.ok)throw Error('Receipt unavailable');const receipt=manualLeadWorkReceiptSchema.parse(response.body).receipt;if(!receipt)return null;if(!same(receipt.input,input))throw Error('Different conversion intent');const result=resultFor(attempt,receipt.result);if(attempt.result&&!same(attempt.result,result))throw Error('Changed immutable result');return result;};
  let result:ManualLeadWorkResult|null;try{result=await proof();}catch(error){if(error instanceof ManualLeadWorkWriteFailure)throw error;throw new ManualLeadWorkWriteFailure('read',attempt);}
  if(!result){
   if(attempt.phase==='confirmed')throw new ManualLeadWorkWriteFailure('read',attempt);
   if(attempt.phase==='rejected'){rejected.add(attempt);return{status:'rejected',attempt};}
   if(mode==='check')return{status:'missing',attempt};
   if(currentLead()!==input.leadId)throw new ManualLeadWorkWriteFailure('scope',attempt);
   const fresh=attempt.phase==='ready';checkpoint({...attempt,phase:'uncertain'});scope();let response;
   try{response=await call('/api/pro/lead-private-work',{method:'POST',headers:{'Content-Type':'application/json'},body:attempt.body});}catch(error){if(error instanceof ManualLeadWorkWriteFailure)throw error;throw new ManualLeadWorkWriteFailure('uncertain',attempt);}
   if(!response.ok){if(fresh&&[400,404,409,422].includes(response.status)){checkpoint({...attempt,phase:'rejected'});rejected.add(attempt);return{status:'rejected',attempt};}throw new ManualLeadWorkWriteFailure('uncertain',attempt);}
   try{result=await proof();if(!result)throw Error('Missing conversion receipt');}catch(error){if(error instanceof ManualLeadWorkWriteFailure)throw error;throw new ManualLeadWorkWriteFailure('uncertain',attempt);}
  }
  checkpoint({...attempt,phase:'confirmed',result});
  try{const response=await call('/api/pro/agenda?'+new URLSearchParams({id:result.work.id}),{cache:'no-store'});if(!response.ok||response.body.userId!==attempt.accountId)throw Error('Current work unavailable');const current=businessSchema.shape.work.element.parse(response.body.work);if(current.id!==result.work.id||current.clientId!==result.link.sourceClientId)throw Error('Work origin changed');}catch(error){if(error instanceof ManualLeadWorkWriteFailure)throw error;throw new ManualLeadWorkWriteFailure('read',attempt);}
  scope();verified.add(attempt);return{status:'confirmed',attempt,result};
 });}catch(error){if(error instanceof ManualLeadWorkWriteFailure)throw error;throw new ManualLeadWorkWriteFailure(entered?'storage':'busy',attempt);}
}
export async function clearManualLeadWorkWrite(store:Store,record:ManualLeadWorkWrite,locks?:Locks){if(!verified.has(record))throw Error('Conversion result not verified');await locked(record.accountId,locks,async()=>{const prior=readManualLeadWorkWrite(store,record.accountId);if(prior&&!same(prior,record))throw Error('Conversion changed');const key=manualLeadWorkWriteKey(record.accountId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Conversion not cleared');});}
/** Only a definitive first-attempt rejection can be retired; uncertain work stays recoverable. */
export async function archiveRejectedManualLeadWorkWrite(store:Store,record:ManualLeadWorkWrite,locks?:Locks){if(!rejected.has(record))throw Error('Conversion was not rejected');await locked(record.accountId,locks,async()=>{if(!same(readManualLeadWorkWrite(store,record.accountId),record))throw Error('Conversion changed');const raw=JSON.stringify(record),archive=manualLeadWorkWriteKey(record.accountId)+':rejected:'+JSON.parse(record.body).actionId;if(store.getItem(archive)!==null&&store.getItem(archive)!==raw)throw Error('Recovery archive already exists');store.setItem(archive,raw);if(store.getItem(archive)!==raw)throw Error('Recovery archive not retained');store.removeItem(manualLeadWorkWriteKey(record.accountId));if(store.getItem(manualLeadWorkWriteKey(record.accountId))!==null)throw Error('Conversion not cleared');});}
