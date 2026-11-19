import {z} from 'zod';
import {leadOriginCreateInputSchema,leadOriginCreateResultSchema,leadOriginCreateReceiptSchema,leadOriginCreateCurrentSchema,type LeadOriginCreateInput,type LeadOriginCreateResult} from './lead-origin-create';
import {leadOriginChannelSchema} from './lead-origins';
import {requestPipelineCatalogSchema,type RequestPipelineCatalog} from './request-pipeline';
import {createLeadCenterWrite,parseLeadCenterWrite,leadCenterWriteKey} from './lead-center-recovery';
import {requestPipelineWriteKey} from './request-pipeline-recovery';
import {leadOriginCreateWriteKey} from './lead-origin-create-key';
export {leadOriginCreateWriteKey} from './lead-origin-create-key';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Locks=Pick<LockManager,'request'>;
type Request=(url:string,init?:RequestInit)=>Promise<Response>;
const recordSchema=z.object({version:z.literal(1),accountId:z.string().uuid(),body:z.string().min(1).max(32000),catalog:requestPipelineCatalogSchema,selectedChannel:leadOriginChannelSchema.nullable(),phase:z.enum(['ready','uncertain','rejected','confirmed']),result:leadOriginCreateResultSchema.nullable()}).strict();
export type LeadOriginCreateWrite=z.infer<typeof recordSchema>;
const verified=new WeakSet<object>(),rejected=new WeakSet<object>();
const rank={ready:0,uncertain:1,rejected:2,confirmed:3};
function same(a:unknown,b:unknown):boolean{if(a===b)return true;if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>same(v,b[i]));if(a&&b&&typeof a==='object'&&typeof b==='object'){const x=a as Record<string,unknown>,y=b as Record<string,unknown>;return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.hasOwn(y,k)&&same(x[k],y[k]));}return false;}
const targetFor=(input:LeadOriginCreateInput)=>'manual:'+input.lead.id;
function resultFor(record:LeadOriginCreateWrite,value:unknown):LeadOriginCreateResult{
 const result=leadOriginCreateResultSchema.parse(value),input=leadOriginCreateInputSchema.parse(JSON.parse(record.body));
 const child=createLeadCenterWrite(record.accountId,input.lead,record.catalog,null);
 parseLeadCenterWrite({...child,phase:'confirmed',result:result.lead},record.accountId);
 if(input.channel===null){if(result.origin!==null)throw Error('Unexpected attribution');}
 else{
  const source=result.origin;
  if(!source||source.type!=='origin'||source.action!=='assign'||source.origin.kind!=='manual'||source.origin.id!==input.lead.id||source.before.kind!=='manual'||source.before.id!==input.lead.id||source.before.revision!==0||source.before.channel!==null||source.before.updatedAt!==null||!source.before.canWrite||!source.origin.canWrite||source.origin.revision!==1||!same(source.origin.channel,record.selectedChannel)||source.before.legacyLabel!==input.lead.sourceLabel||source.origin.legacyLabel!==input.lead.sourceLabel)throw Error('Different compound attribution');
 }
 return result;
}
export function parseLeadOriginCreateWrite(value:unknown,actor:string){
 const record=recordSchema.parse(value),input=leadOriginCreateInputSchema.parse(JSON.parse(record.body));
 if(record.accountId!==actor||record.body!==JSON.stringify(input)||(record.phase==='confirmed')!==(record.result!==null))throw Error('Invalid compound creation scope');
 createLeadCenterWrite(actor,input.lead,record.catalog,null);
 if(input.channel===null?record.selectedChannel!==null:record.selectedChannel===null||record.selectedChannel.id!==input.channel.id||record.selectedChannel.revision!==input.channel.revision||record.selectedChannel.archived)throw Error('Different selected creation channel');
 if(record.result)resultFor(record,record.result);return record;
}
export function createLeadOriginCreateWrite(actor:string,input:LeadOriginCreateInput,catalog:RequestPipelineCatalog,selectedChannel:z.infer<typeof leadOriginChannelSchema>|null){return parseLeadOriginCreateWrite({version:1,accountId:actor,body:JSON.stringify(leadOriginCreateInputSchema.parse(input)),catalog,selectedChannel,phase:'ready',result:null},actor);}
export function readLeadOriginCreateWrite(store:Store,actor:string):LeadOriginCreateWrite|null{const raw=store.getItem(leadOriginCreateWriteKey(actor));if(raw===null)return null;if(raw.length>96000)throw Error('Lead origin recovery too large');return parseLeadOriginCreateWrite(JSON.parse(raw),actor);}
export function mergeLeadOriginCreateWrite(memory:LeadOriginCreateWrite,disk:LeadOriginCreateWrite|null){if(!disk)return memory;if(memory.accountId!==disk.accountId||memory.body!==disk.body||!same(memory.catalog,disk.catalog)||!same(memory.selectedChannel,disk.selectedChannel)||memory.result&&disk.result&&!same(memory.result,disk.result))throw Error('Another lead origin is pending');return rank[memory.phase]>=rank[disk.phase]?memory:disk;}
export function saveLeadOriginCreateWrite(store:Store,value:LeadOriginCreateWrite){const parsed=parseLeadOriginCreateWrite(value,value.accountId),record=mergeLeadOriginCreateWrite(parsed,readLeadOriginCreateWrite(store,value.accountId)),raw=JSON.stringify(record),key=leadOriginCreateWriteKey(record.accountId);store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Lead origin recovery not retained');return record;}
export class LeadOriginCreateWriteFailure extends Error{constructor(public kind:'busy'|'storage'|'scope'|'read'|'uncertain',public attempt:LeadOriginCreateWrite){super(kind);}}
async function locked<T>(actor:string,locks:Locks|undefined,run:()=>Promise<T>):Promise<T>{const manager=locks??globalThis.navigator?.locks;if(!manager)throw Error('Locks unavailable');return manager.request(requestPipelineWriteKey(actor),{ifAvailable:true},lock=>{if(!lock)throw Error('Lead origin busy');return run();});}
export async function continueLeadOriginCreateWrite({store,attempt:initial,request,currentAccount,currentTarget,mode,onCheckpoint,locks,timeoutMs=15000}:{store:Store;attempt:LeadOriginCreateWrite;request:Request;currentAccount:()=>string|undefined;currentTarget:()=>string|undefined;mode:'check'|'retry';onCheckpoint:(record:LeadOriginCreateWrite)=>void;locks?:Locks;timeoutMs?:number}):Promise<{status:'confirmed';attempt:LeadOriginCreateWrite;result:LeadOriginCreateResult;current:z.infer<typeof leadOriginCreateCurrentSchema>}|{status:'missing'|'rejected';attempt:LeadOriginCreateWrite}>{
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>60000)throw Error('Invalid creation deadline');
 let attempt=parseLeadOriginCreateWrite(initial,initial.accountId),entered=false;
 try{return await locked(attempt.accountId,locks,async()=>{
  entered=true;const scope=()=>{if(currentAccount()!==attempt.accountId)throw new LeadOriginCreateWriteFailure('scope',attempt);};
  const checkpoint=(value:LeadOriginCreateWrite)=>{attempt=value;onCheckpoint(value);try{attempt=saveLeadOriginCreateWrite(store,value);onCheckpoint(attempt);}catch{throw new LeadOriginCreateWriteFailure('storage',attempt);}};
  scope();if(store.getItem(leadOriginCreateWriteKey(attempt.accountId))===null&&[leadCenterWriteKey(attempt.accountId),requestPipelineWriteKey(attempt.accountId),'ccr:pro:lead-origin-write:v1:'+attempt.accountId].some(key=>store.getItem(key)!==null))throw new LeadOriginCreateWriteFailure('busy',attempt);try{attempt=mergeLeadOriginCreateWrite(attempt,readLeadOriginCreateWrite(store,attempt.accountId));}catch{throw new LeadOriginCreateWriteFailure('storage',attempt);}checkpoint(attempt);
  const input=leadOriginCreateInputSchema.parse(JSON.parse(attempt.body));
  const call=async(url:string,init:RequestInit={})=>{scope();const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([(async()=>{const response=await request(url,{...init,headers:{...init.headers,'X-Pro-Expected-Actor':attempt.accountId},signal:controller.signal});const body=await response.json();scope();return{ok:response.ok,status:response.status,body};})(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Lead origin timed out'));},timeoutMs);})]);}finally{if(timer!==undefined)clearTimeout(timer);}};
  const proof=async()=>{const response=await call('/api/pro/lead-origin-create?'+new URLSearchParams({view:'action',actionId:input.actionId}),{cache:'no-store'});if(!response.ok)throw Error('Receipt unavailable');const receipt=leadOriginCreateReceiptSchema.parse(response.body).receipt;if(!receipt)return null;if(!same(receipt.input,input))throw Error('Different lead origin intent');const result=resultFor(attempt,receipt.result);if(attempt.result&&!same(attempt.result,result))throw Error('Changed immutable result');return result;};
  let result:LeadOriginCreateResult|null;try{result=await proof();}catch(error){if(error instanceof LeadOriginCreateWriteFailure)throw error;throw new LeadOriginCreateWriteFailure('read',attempt);}
  if(!result){
   if(attempt.phase==='confirmed')throw new LeadOriginCreateWriteFailure('read',attempt);
   if(attempt.phase==='rejected'){rejected.add(attempt);return{status:'rejected',attempt};}
   if(mode==='check')return{status:'missing',attempt};
   if(currentTarget()!==targetFor(input))throw new LeadOriginCreateWriteFailure('scope',attempt);
   const fresh=attempt.phase==='ready';checkpoint({...attempt,phase:'uncertain'});scope();if(currentTarget()!==targetFor(input))throw new LeadOriginCreateWriteFailure('scope',attempt);let response;
   try{response=await call('/api/pro/lead-origin-create',{method:'POST',headers:{'Content-Type':'application/json'},body:attempt.body});}catch(error){if(error instanceof LeadOriginCreateWriteFailure)throw error;throw new LeadOriginCreateWriteFailure('uncertain',attempt);}
   if(!response.ok){if(fresh&&[400,409,413,422].includes(response.status)){checkpoint({...attempt,phase:'rejected'});rejected.add(attempt);return{status:'rejected',attempt};}throw new LeadOriginCreateWriteFailure('uncertain',attempt);}
   try{result=await proof();if(!result)throw Error('Missing lead origin receipt');}catch(error){if(error instanceof LeadOriginCreateWriteFailure)throw error;throw new LeadOriginCreateWriteFailure('uncertain',attempt);}
  }
  checkpoint({...attempt,phase:'confirmed',result});
  let current:z.infer<typeof leadOriginCreateCurrentSchema>;
  try{
   const response=await call('/api/pro/lead-origin-create?'+new URLSearchParams({view:'current',leadId:input.lead.id}),{cache:'no-store'});if(!response.ok)throw Error('Current private lead unavailable');
   current=leadOriginCreateCurrentSchema.parse(response.body);
   if(current.item.kind!=='manual'||result.lead.item.kind!=='manual'||current.item.id!==input.lead.id||current.item.manual.revision<result.lead.item.manual.revision||current.item.manual.revision===result.lead.item.manual.revision&&!same(current.item.manual,result.lead.item.manual))throw Error('Lead version changed without revision');
   const expected=result.origin?.type==='origin'?result.origin.origin:null,origin=current.origin,expectedRev=expected?.revision??0;
   if(origin.legacyLabel!==current.item.manual.sourceLabel||origin.canWrite!==(!current.item.manual.archived&&!current.item.client.archived))throw Error('Inconsistent current lead attribution');
   if(origin.kind!=='manual'||origin.id!==input.lead.id||origin.revision<expectedRev||origin.revision===expectedRev&&((origin.channel?.id??null)!==(expected?.channel?.id??null)||origin.updatedAt!==(expected?.updatedAt??null)))throw Error('Attribution changed without revision');
  }catch(error){if(error instanceof LeadOriginCreateWriteFailure)throw error;throw new LeadOriginCreateWriteFailure('read',attempt);}
  scope();verified.add(attempt);return{status:'confirmed',attempt,result,current};
 });}catch(error){if(error instanceof LeadOriginCreateWriteFailure)throw error;throw new LeadOriginCreateWriteFailure(entered?'storage':'busy',attempt);}
}
export async function clearLeadOriginCreateWrite(store:Store,record:LeadOriginCreateWrite,locks?:Locks){if(!verified.has(record))throw Error('Lead origin result not verified');await locked(record.accountId,locks,async()=>{const prior=readLeadOriginCreateWrite(store,record.accountId);if(prior&&!same(prior,record))throw Error('Lead origin changed');const key=leadOriginCreateWriteKey(record.accountId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Lead origin not cleared');});}
/** Only a definitive first-attempt rejection can be retired; uncertain work stays recoverable. */
export async function archiveRejectedLeadOriginCreateWrite(store:Store,record:LeadOriginCreateWrite,locks?:Locks){if(!rejected.has(record))throw Error('Lead origin was not rejected');await locked(record.accountId,locks,async()=>{if(!same(readLeadOriginCreateWrite(store,record.accountId),record))throw Error('Lead origin changed');const raw=JSON.stringify(record),archive=leadOriginCreateWriteKey(record.accountId)+':rejected:'+JSON.parse(record.body).actionId;if(store.getItem(archive)!==null&&store.getItem(archive)!==raw)throw Error('Recovery archive already exists');store.setItem(archive,raw);if(store.getItem(archive)!==raw)throw Error('Recovery archive not retained');store.removeItem(leadOriginCreateWriteKey(record.accountId));if(store.getItem(leadOriginCreateWriteKey(record.accountId))!==null)throw Error('Lead origin not cleared');});}
