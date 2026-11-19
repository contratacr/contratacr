import {z} from 'zod';
import {leadOriginMutationSchema,leadOriginSchema,leadOriginChannelSchema,leadOriginResultSchema,leadOriginReceiptSchema,leadOriginContextSchema,type LeadOriginMutation,type LeadOriginResult} from './lead-origins';
import {requestPipelineWriteKey} from './request-pipeline-recovery';
import {leadOriginCreateWriteKey} from './lead-origin-create-key';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Locks=Pick<LockManager,'request'>;
type Request=(url:string,init?:RequestInit)=>Promise<Response>;
const baselineSchema=z.discriminatedUnion('type',[z.object({type:z.literal('channel'),channel:leadOriginChannelSchema.nullable()}).strict(),z.object({type:z.literal('origin'),origin:leadOriginSchema,channel:leadOriginChannelSchema.nullable()}).strict()]);
export type LeadOriginBaseline=z.infer<typeof baselineSchema>;
const id=z.string().uuid(),recordSchema=z.object({version:z.literal(1),accountId:id,body:z.string().min(1).max(12000),baseline:baselineSchema,phase:z.enum(['ready','uncertain','rejected','confirmed']),result:leadOriginResultSchema.nullable()}).strict();
export type LeadOriginWrite=z.infer<typeof recordSchema>;
const verified=new WeakSet<object>(),rejected=new WeakSet<object>();
const rank={ready:0,uncertain:1,rejected:2,confirmed:3};
function same(a:unknown,b:unknown):boolean{if(a===b)return true;if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>same(v,b[i]));if(a&&b&&typeof a==='object'&&typeof b==='object'){const x=a as Record<string,unknown>,y=b as Record<string,unknown>;return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.hasOwn(y,k)&&same(x[k],y[k]));}return false;}
export const leadOriginWriteKey=(actor:string)=>'ccr:pro:lead-origin-write:v1:'+id.parse(actor);
const targetFor=(input:LeadOriginMutation)=>'kind'in input?input.kind+':'+input.id:'channel:'+input.channelId;
const channelKey=(origin:z.infer<typeof leadOriginSchema>)=>origin.channel?.id??null;
function resultFor(record:LeadOriginWrite,value:unknown):LeadOriginResult{
 const result=leadOriginResultSchema.parse(value),input=leadOriginMutationSchema.parse(JSON.parse(record.body)),baseline=record.baseline;
 if(result.action!==input.action)throw Error('Different origin action');
 if('kind'in input){
  if(result.type!=='origin'||baseline.type!=='origin')throw Error('Different origin result');
  const before=result.before,after=result.origin;
  if(before.kind!==input.kind||before.id!==input.id||before.revision!==input.revision||before.updatedAt!==baseline.origin.updatedAt||channelKey(before)!==channelKey(baseline.origin)||after.kind!==input.kind||after.id!==input.id||after.revision!==input.revision+1||after.entryKind!==before.entryKind||after.legacyLabel!==before.legacyLabel||!before.canWrite||!after.canWrite||after.updatedAt===null)throw Error('Different origin scope');
  if(input.action==='assign'?!same(after.channel,baseline.channel):after.channel!==null)throw Error('Different assigned channel');
 }else{
  if(result.type!=='channel'||baseline.type!=='channel'||result.channel.id!==input.channelId||result.channel.revision!==input.revision+1)throw Error('Different channel scope');
  const after=result.channel;
  if(input.action==='channel_create'){
   if(result.before!==null||after.name!==input.name||after.builtin||!after.customName||after.archived)throw Error('Different created channel');
  }else{
   if(!baseline.channel||!same(result.before,baseline.channel))throw Error('Different channel baseline');
   const expected={...baseline.channel,revision:input.revision+1,createdAt:baseline.channel.createdAt??after.createdAt,updatedAt:after.updatedAt,...input.action==='channel_rename'?{name:input.name,customName:true}:{archived:input.action==='channel_archive'}};
   if(!same(after,expected))throw Error('Different channel result');
  }
 }
 return result;
}
export function parseLeadOriginWrite(value:unknown,actor:string){
 const record=recordSchema.parse(value),input=leadOriginMutationSchema.parse(JSON.parse(record.body)),baseline=record.baseline;
 if(record.accountId!==actor||record.body!==JSON.stringify(input)||(record.phase==='confirmed')!==(record.result!==null))throw Error('Invalid origin scope');
 if('kind'in input){if(baseline.type!=='origin'||baseline.origin.kind!==input.kind||baseline.origin.id!==input.id||baseline.origin.revision!==input.revision||!baseline.origin.canWrite||(input.action==='assign'?baseline.channel===null||baseline.channel.id!==input.channelId||baseline.channel.revision!==input.channelRevision||baseline.channel.archived:baseline.channel!==null))throw Error('Invalid origin baseline');}
 else if(baseline.type!=='channel'||(input.action==='channel_create'?baseline.channel!==null:baseline.channel===null||baseline.channel.id!==input.channelId||baseline.channel.revision!==input.revision))throw Error('Invalid channel baseline');
 if(record.result)resultFor(record,record.result);return record;
}
export function createLeadOriginWrite(actor:string,input:LeadOriginMutation,baseline:LeadOriginBaseline){return parseLeadOriginWrite({version:1,accountId:actor,body:JSON.stringify(leadOriginMutationSchema.parse(input)),baseline,phase:'ready',result:null},actor);}
export function readLeadOriginWrite(store:Store,actor:string):LeadOriginWrite|null{const raw=store.getItem(leadOriginWriteKey(actor));if(raw===null)return null;if(raw.length>20000)throw Error('Lead origin recovery too large');return parseLeadOriginWrite(JSON.parse(raw),actor);}
export function mergeLeadOriginWrite(memory:LeadOriginWrite,disk:LeadOriginWrite|null){if(!disk)return memory;if(memory.accountId!==disk.accountId||memory.body!==disk.body||!same(memory.baseline,disk.baseline)||memory.result&&disk.result&&!same(memory.result,disk.result))throw Error('Another lead origin is pending');return rank[memory.phase]>=rank[disk.phase]?memory:disk;}
export function saveLeadOriginWrite(store:Store,value:LeadOriginWrite){const parsed=parseLeadOriginWrite(value,value.accountId),record=mergeLeadOriginWrite(parsed,readLeadOriginWrite(store,value.accountId)),raw=JSON.stringify(record),key=leadOriginWriteKey(record.accountId);store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Lead origin recovery not retained');return record;}
export class LeadOriginWriteFailure extends Error{constructor(public kind:'busy'|'storage'|'scope'|'read'|'uncertain',public attempt:LeadOriginWrite){super(kind);}}
async function locked<T>(actor:string,locks:Locks|undefined,run:()=>Promise<T>):Promise<T>{const manager=locks??globalThis.navigator?.locks;if(!manager)throw Error('Locks unavailable');return manager.request(requestPipelineWriteKey(actor),{ifAvailable:true},lock=>{if(!lock)throw Error('Lead origin busy');return run();});}
export async function continueLeadOriginWrite({store,attempt:initial,request,currentAccount,currentTarget,mode,onCheckpoint,locks,timeoutMs=15000}:{store:Store;attempt:LeadOriginWrite;request:Request;currentAccount:()=>string|undefined;currentTarget:()=>string|undefined;mode:'check'|'retry';onCheckpoint:(record:LeadOriginWrite)=>void;locks?:Locks;timeoutMs?:number}):Promise<{status:'confirmed';attempt:LeadOriginWrite;result:LeadOriginResult;current:z.infer<typeof leadOriginContextSchema>|z.infer<typeof leadOriginChannelSchema>}|{status:'missing'|'rejected';attempt:LeadOriginWrite}>{
 let attempt=parseLeadOriginWrite(initial,initial.accountId),entered=false;
 try{return await locked(attempt.accountId,locks,async()=>{
  entered=true;const scope=()=>{if(currentAccount()!==attempt.accountId)throw new LeadOriginWriteFailure('scope',attempt);};
  const checkpoint=(value:LeadOriginWrite)=>{attempt=value;onCheckpoint(value);try{attempt=saveLeadOriginWrite(store,value);onCheckpoint(attempt);}catch{throw new LeadOriginWriteFailure('storage',attempt);}};
  scope();if(store.getItem(leadOriginWriteKey(attempt.accountId))===null&&store.getItem(leadOriginCreateWriteKey(attempt.accountId))!==null)throw new LeadOriginWriteFailure('busy',attempt);try{attempt=mergeLeadOriginWrite(attempt,readLeadOriginWrite(store,attempt.accountId));}catch{throw new LeadOriginWriteFailure('storage',attempt);}checkpoint(attempt);
  const input=leadOriginMutationSchema.parse(JSON.parse(attempt.body));
  const call=async(url:string,init:RequestInit={})=>{scope();const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([(async()=>{const response=await request(url,{...init,headers:{...init.headers,'X-Pro-Expected-Actor':attempt.accountId},signal:controller.signal});const body=await response.json();scope();return{ok:response.ok,status:response.status,body};})(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Lead origin timed out'));},timeoutMs);})]);}finally{if(timer!==undefined)clearTimeout(timer);}};
  const proof=async()=>{const response=await call('/api/pro/lead-origins?'+new URLSearchParams({view:'action',actionId:input.actionId}),{cache:'no-store'});if(!response.ok)throw Error('Receipt unavailable');const receipt=leadOriginReceiptSchema.parse(response.body).receipt;if(!receipt)return null;if(!same(receipt.input,input))throw Error('Different lead origin intent');const result=resultFor(attempt,receipt.result);if(attempt.result&&!same(attempt.result,result))throw Error('Changed immutable result');return result;};
  let result:LeadOriginResult|null;try{result=await proof();}catch(error){if(error instanceof LeadOriginWriteFailure)throw error;throw new LeadOriginWriteFailure('read',attempt);}
  if(!result){
   if(attempt.phase==='confirmed')throw new LeadOriginWriteFailure('read',attempt);
   if(attempt.phase==='rejected'){rejected.add(attempt);return{status:'rejected',attempt};}
   if(mode==='check')return{status:'missing',attempt};
   if(currentTarget()!==targetFor(input))throw new LeadOriginWriteFailure('scope',attempt);
   const fresh=attempt.phase==='ready';checkpoint({...attempt,phase:'uncertain'});scope();if(currentTarget()!==targetFor(input))throw new LeadOriginWriteFailure('scope',attempt);let response;
   try{response=await call('/api/pro/lead-origins',{method:'POST',headers:{'Content-Type':'application/json'},body:attempt.body});}catch(error){if(error instanceof LeadOriginWriteFailure)throw error;throw new LeadOriginWriteFailure('uncertain',attempt);}
   if(!response.ok){if(fresh&&[400,409,413,422].includes(response.status)){checkpoint({...attempt,phase:'rejected'});rejected.add(attempt);return{status:'rejected',attempt};}throw new LeadOriginWriteFailure('uncertain',attempt);}
   try{result=await proof();if(!result)throw Error('Missing lead origin receipt');}catch(error){if(error instanceof LeadOriginWriteFailure)throw error;throw new LeadOriginWriteFailure('uncertain',attempt);}
  }
  checkpoint({...attempt,phase:'confirmed',result});
  let current:z.infer<typeof leadOriginContextSchema>|z.infer<typeof leadOriginChannelSchema>;
  try{
   const query:Record<string,string>='kind'in input?{view:'context',kind:input.kind,id:input.id}:{view:'channel',channelId:input.channelId};
   const response=await call('/api/pro/lead-origins?'+new URLSearchParams(query),{cache:'no-store'});if(!response.ok)throw Error('Current origin unavailable');
   if(result.type==='origin'){
    const context=leadOriginContextSchema.parse(response.body),now=context.origin,after=result.origin;
    if(now.kind!==after.kind||now.id!==after.id||now.revision<after.revision||now.revision===after.revision&&(channelKey(now)!==channelKey(after)||now.updatedAt!==after.updatedAt))throw Error('Origin version changed without revision');current=context;
   }else{
    const channel=leadOriginChannelSchema.parse(z.object({channel:leadOriginChannelSchema}).strict().parse(response.body).channel);
    if(channel.id!==result.channel.id||channel.revision<result.channel.revision||channel.revision===result.channel.revision&&!same(channel,result.channel))throw Error('Channel version changed without revision');current=channel;
   }
  }catch(error){if(error instanceof LeadOriginWriteFailure)throw error;throw new LeadOriginWriteFailure('read',attempt);}
  scope();verified.add(attempt);return{status:'confirmed',attempt,result,current};
 });}catch(error){if(error instanceof LeadOriginWriteFailure)throw error;throw new LeadOriginWriteFailure(entered?'storage':'busy',attempt);}
}
export async function clearLeadOriginWrite(store:Store,record:LeadOriginWrite,locks?:Locks){if(!verified.has(record))throw Error('Lead origin result not verified');await locked(record.accountId,locks,async()=>{const prior=readLeadOriginWrite(store,record.accountId);if(prior&&!same(prior,record))throw Error('Lead origin changed');const key=leadOriginWriteKey(record.accountId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Lead origin not cleared');});}
/** Only a definitive first-attempt rejection can be retired; uncertain work stays recoverable. */
export async function archiveRejectedLeadOriginWrite(store:Store,record:LeadOriginWrite,locks?:Locks){if(!rejected.has(record))throw Error('Lead origin was not rejected');await locked(record.accountId,locks,async()=>{if(!same(readLeadOriginWrite(store,record.accountId),record))throw Error('Lead origin changed');const raw=JSON.stringify(record),archive=leadOriginWriteKey(record.accountId)+':rejected:'+JSON.parse(record.body).actionId;if(store.getItem(archive)!==null&&store.getItem(archive)!==raw)throw Error('Recovery archive already exists');store.setItem(archive,raw);if(store.getItem(archive)!==raw)throw Error('Recovery archive not retained');store.removeItem(leadOriginWriteKey(record.accountId));if(store.getItem(leadOriginWriteKey(record.accountId))!==null)throw Error('Lead origin not cleared');});}
