import {z} from 'zod';
import {leadCenterManualSchema,leadCenterRequestPreferenceSchema,leadCenterMutationSchema,leadCenterResultSchema,leadCenterReceiptSchema,type LeadCenterItem,type LeadCenterMutation,type LeadCenterResult} from './lead-center';
import {requestPipelineCatalogSchema,type RequestPipelineCatalog} from './request-pipeline';
import {requestPipelineWriteKey} from './request-pipeline-recovery';
import {leadOriginCreateWriteKey} from './lead-origin-create-key';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Locks=Pick<LockManager,'request'>;
const id=z.string().uuid();
const baselineSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('manual'),id,manual:leadCenterManualSchema}).strict(),
 z.object({kind:z.literal('request'),id,preference:leadCenterRequestPreferenceSchema}).strict(),
]);
const recordSchema=z.object({version:z.literal(1),accountId:id,body:z.string().min(1).max(24000),catalog:requestPipelineCatalogSchema,baseline:baselineSchema.nullable(),phase:z.enum(['ready','uncertain','confirmed']),result:leadCenterResultSchema.nullable()}).strict();
export type LeadCenterWrite=z.infer<typeof recordSchema>;
const ranks={ready:0,uncertain:1,confirmed:2};
const verified=new WeakSet<object>(),checkedMissing=new WeakSet<object>();
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function leadCenterWriteKey(accountId:string){return 'ccr:pro:lead-center-write:v1:'+id.parse(accountId);}
function privateItem(item:LeadCenterItem|null){return item===null?null:item.kind==='manual'?{kind:item.kind,id:item.id,manual:item.manual}:{kind:item.kind,id:item.id,preference:item.preference};}
function visible(catalog:RequestPipelineCatalog,stageId:string){return catalog.stages.some(stage=>stage.id===stageId&&!stage.hidden);}

function validateResult(record:LeadCenterWrite,result:LeadCenterResult):LeadCenterResult{
 const input=leadCenterMutationSchema.parse(JSON.parse(record.body));
 if(result.action!==input.action||result.item.kind!==input.kind||result.item.id!==input.id||!same(privateItem(result.before),record.baseline))throw Error('Different lead result');
 if('catalogRevision'in input?result.catalogRevision!==input.catalogRevision:result.catalogRevision<record.catalog.revision)throw Error('Different catalogue revision');
 if(result.item.kind==='request'){
  if(input.kind!=='request'||!['archive','restore'].includes(input.action)||record.baseline?.kind!=='request')throw Error('Different request preference');
  const expected={...record.baseline.preference,revision:input.revision+1,archived:input.action==='archive',updatedAt:result.item.preference.updatedAt};
  if(!same(result.item.preference,expected))throw Error('Different archived request');
  if(result.before?.kind!=='request'||!same(result.before.request,result.item.request))throw Error('Public request snapshot changed within a private write');
  return result;
 }
 if(input.kind!=='manual')throw Error('Different lead source');
 const after=result.item.manual;
 let expected:typeof after;
 if(input.action==='create'){
  expected={id:input.id,clientId:input.clientId,title:input.title,description:input.description,address:input.address,sourceLabel:input.sourceLabel,forecast:input.forecast,stageMode:input.stageMode,stageId:input.stageId,revision:1,archived:false,createdAt:after.createdAt,updatedAt:after.updatedAt};
  if(result.before!==null||result.item.client.archived||after.createdAt!==after.updatedAt)throw Error('Different new lead');
 }else{
  if(record.baseline?.kind!=='manual')throw Error('Missing lead baseline');
  expected={...record.baseline.manual,revision:input.revision+1,updatedAt:after.updatedAt};
  if(input.action==='update'){
   expected={...expected,clientId:input.clientId,title:input.title,description:input.description,address:input.address,sourceLabel:input.sourceLabel,forecast:input.forecast};
   if(input.clientId!==record.baseline.manual.clientId&&result.item.client.archived)throw Error('Unavailable replacement client');
  }else if(input.action==='set_stage')expected={...expected,stageMode:'manual',stageId:input.stageId};
  else if(input.action==='return_auto')expected={...expected,stageMode:'automatic',stageId:null};
  else expected={...expected,archived:input.action==='archive'};
 }
 if(!same(after,expected))throw Error('Different lead fields');
 return result;
}
export function parseLeadCenterWrite(value:unknown,accountId:string):LeadCenterWrite{
 const record=recordSchema.parse(value),input=leadCenterMutationSchema.parse(JSON.parse(record.body));
 if(record.accountId!==accountId||record.body!==JSON.stringify(input)||(record.phase==='confirmed')!==(record.result!==null))throw Error('Invalid lead recovery scope');
 if('catalogRevision'in input&&input.catalogRevision!==record.catalog.revision)throw Error('Different captured catalogue');
 if(input.action==='create'){
  if(record.baseline!==null||input.stageMode==='manual'&&!visible(record.catalog,input.stageId!))throw Error('Invalid new lead baseline');
 }else{
  const before=record.baseline;
  if(!before||before.id!==input.id||before.kind!==input.kind)throw Error('Different lead baseline');
  const revision=before.kind==='manual'?before.manual.revision:before.preference.revision,archived=before.kind==='manual'?before.manual.archived:before.preference.archived;
  if(revision!==input.revision||before.kind==='manual'&&before.manual.id!==before.id||input.action==='archive'&&archived||input.action==='restore'&&!archived||!['archive','restore'].includes(input.action)&&archived)throw Error('Invalid lead transition');
  if(input.action==='set_stage'&&!visible(record.catalog,input.stageId))throw Error('Unavailable lead stage');
 }
 if(record.result)validateResult(record,record.result);
 return record;
}
export function createLeadCenterWrite(accountId:string,input:LeadCenterMutation,catalog:RequestPipelineCatalog,item:LeadCenterItem|null){
 const parsed=leadCenterMutationSchema.parse(input);
 return parseLeadCenterWrite({version:1,accountId,body:JSON.stringify(parsed),catalog,baseline:privateItem(item),phase:'ready',result:null},accountId);
}
export function readLeadCenterWrite(store:Store,accountId:string){
 const raw=store.getItem(leadCenterWriteKey(accountId));if(raw===null)return null;
 if(raw.length>200000)throw Error('Lead recovery too large');
 return parseLeadCenterWrite(JSON.parse(raw),accountId);
}
export function mergeLeadCenterWrite(first:LeadCenterWrite,other:LeadCenterWrite|null){
 const a=parseLeadCenterWrite(first,first.accountId);if(!other)return a;
 const b=parseLeadCenterWrite(other,a.accountId);
 if(a.body!==b.body||!same(a.catalog,b.catalog)||!same(a.baseline,b.baseline)||a.result&&b.result&&!same(a.result,b.result))throw Error('Different lead attempts');
 return ranks[b.phase]>ranks[a.phase]?b:a;
}
export function saveLeadCenterWrite(store:Store,value:LeadCenterWrite){
 const record=parseLeadCenterWrite(value,value.accountId),old=readLeadCenterWrite(store,record.accountId);
 if(old&&!same(mergeLeadCenterWrite(record,old),record))throw Error('Newer lead attempt exists');
 const key=leadCenterWriteKey(record.accountId),raw=JSON.stringify(record);store.setItem(key,raw);
 if(store.getItem(key)!==raw)throw Error('Lead recovery not retained');
}
function remove(store:Store,record:LeadCenterWrite){
 const old=readLeadCenterWrite(store,record.accountId);if(old&&!same(old,record))throw Error('Lead attempt changed');
 const key=leadCenterWriteKey(record.accountId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Lead recovery not cleared');
}
export class LeadCenterWriteFailure extends Error{
 constructor(readonly kind:'scope'|'storage'|'uncertain'|'read'|'busy',readonly attempt:LeadCenterWrite,readonly permissionStatus?:number){super(kind);}
}
async function locked<T>(record:LeadCenterWrite,run:()=>Promise<T>,provided?:Locks|null){
 const locks=provided===undefined?(typeof navigator!=='undefined'?navigator.locks:undefined):provided;
 if(!locks)throw new LeadCenterWriteFailure('busy',record);
 // Share exclusion with the existing request stage/catalogue writer. The
 // durable journals retain their own namespaces and never adopt each other.
 return locks.request(requestPipelineWriteKey(record.accountId),{ifAvailable:true},lock=>{
  if(!lock)throw new LeadCenterWriteFailure('busy',record);return run();
 });
}
export async function clearLeadCenterWrite(store:Store,record:LeadCenterWrite){
 return locked(record,async()=>{if(!verified.has(record))throw Error('Check the lead receipt first');remove(store,record);});
}
export async function archiveLeadCenterWrite(store:Store,record:LeadCenterWrite){
 return locked(record,async()=>{
  if(!checkedMissing.has(record))throw Error('Check the lead attempt first');
  const key=leadCenterWriteKey(record.accountId)+':archive:'+leadCenterMutationSchema.parse(JSON.parse(record.body)).actionId,raw=JSON.stringify(record),old=store.getItem(key);
  if(old!==null&&old!==raw)throw Error('A different lead archive exists');
  store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Lead archive not retained');remove(store,record);
 });
}
type Options={attempt:LeadCenterWrite;store:Store;request:(url:string,init?:RequestInit)=>Promise<Response>;currentAccount:()=>string|undefined;currentTarget:()=>string|undefined;onCheckpoint:(record:LeadCenterWrite)=>void;mode:'check'|'retry';locks?:Locks|null;timeoutMs?:number};
export async function continueLeadCenterWrite(options:Options):Promise<{status:'confirmed';attempt:LeadCenterWrite;result:LeadCenterResult}|{status:'missing';attempt:LeadCenterWrite}|{status:'rejected';attempt:LeadCenterWrite;code:number}>{
 const {request}=options;
 const timeoutMs=options.timeoutMs??15000;
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>60000)throw Error('Invalid request deadline');
 const responseBody=async(url:string,init:RequestInit)=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   return await Promise.race([
    (async()=>{const response=await request(url,{...init,signal:controller.signal});return{ok:response.ok,status:response.status,body:response.ok?await response.json():null};})(),
    new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Lead request deadline reached'));},timeoutMs);}),
   ]);
  }finally{if(timer!==undefined)clearTimeout(timer);}
 };
 return locked(options.attempt,async()=>{
  let record=parseLeadCenterWrite(options.attempt,options.attempt.accountId);
  const input=leadCenterMutationSchema.parse(JSON.parse(record.body)),target=input.kind+':'+input.id;
  const scope=(retry=false)=>{if(options.currentAccount()!==record.accountId||retry&&options.currentTarget()!==target)throw new LeadCenterWriteFailure('scope',record);};
  const checkpoint=(next:LeadCenterWrite)=>{record=next;try{options.onCheckpoint(record);saveLeadCenterWrite(options.store,record);}catch{throw new LeadCenterWriteFailure('storage',record);}};
  const check=async()=>{
   scope();let response:Awaited<ReturnType<typeof responseBody>>;
   try{response=await responseBody('/api/pro/lead-private-core?'+new URLSearchParams({view:'action',actionId:input.actionId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':record.accountId}});}catch{throw new LeadCenterWriteFailure('read',record);}
   scope();if(!response.ok){if([403,404].includes(response.status)){checkedMissing.add(record);throw new LeadCenterWriteFailure('read',record,response.status);}throw new LeadCenterWriteFailure('read',record);}
   let receipt;try{receipt=leadCenterReceiptSchema.parse(response.body).receipt;}catch{throw new LeadCenterWriteFailure('read',record);}
   scope();if(!receipt){if(record.phase==='confirmed')throw new LeadCenterWriteFailure('read',record);checkedMissing.add(record);return false;}
   try{if(!same(receipt.input,input))throw Error();validateResult(record,receipt.result);if(record.result&&!same(record.result,receipt.result))throw Error();}catch{throw new LeadCenterWriteFailure('read',record);}
   checkpoint({...record,phase:'confirmed',result:receipt.result});verified.add(record);return true;
  };
  scope();if(options.store.getItem(leadCenterWriteKey(record.accountId))===null&&options.store.getItem(leadOriginCreateWriteKey(record.accountId))!==null)throw new LeadCenterWriteFailure('busy',record);checkpoint(mergeLeadCenterWrite(record,readLeadCenterWrite(options.store,record.accountId)));
  if(await check())return{status:'confirmed',attempt:record,result:record.result!};
  if(options.mode==='check')return{status:'missing',attempt:record};
  scope(true);const fresh=record.phase==='ready';checkpoint({...record,phase:'uncertain'});
  let response:Awaited<ReturnType<typeof responseBody>>;
  try{response=await responseBody('/api/pro/lead-private-core',{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':record.accountId},body:record.body});}catch{throw new LeadCenterWriteFailure('uncertain',record);}
  scope(true);
  if(!response.ok){if(await check())return{status:'confirmed',attempt:record,result:record.result!};if(fresh&&[400,409,413,422].includes(response.status))return{status:'rejected',attempt:record,code:response.status};throw new LeadCenterWriteFailure('uncertain',record);}
  let result:LeadCenterResult;try{result=validateResult(record,leadCenterResultSchema.parse(response.body));}catch{throw new LeadCenterWriteFailure('uncertain',record);}
  scope(true);checkpoint({...record,phase:'confirmed',result});if(!await check())throw new LeadCenterWriteFailure('read',record);
  return{status:'confirmed',attempt:record,result:record.result!};
 },options.locks);
}
