import {z} from 'zod';
import {leadOriginCreateWriteKey} from './lead-origin-create-key';
import {requestPipelineCatalogSchema,requestPipelineStateSchema,requestPipelineMutationSchema,requestPipelineResultSchema,requestPipelineReceiptSchema,type RequestPipelineCatalog,type RequestPipelineLead,type RequestPipelineMutation,type RequestPipelineResult} from './request-pipeline';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const schema=z.object({version:z.literal(1),accountId:z.string().uuid(),body:z.string().max(16000),catalog:requestPipelineCatalogSchema,baseline:requestPipelineStateSchema.nullable(),phase:z.enum(['ready','uncertain','confirmed']),result:requestPipelineResultSchema.nullable()}).strict();
export type RequestPipelineWrite=z.infer<typeof schema>;
const proof=new WeakSet<object>(),missing=new WeakSet<object>();
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const ranks={ready:0,uncertain:1,confirmed:2};
export function requestPipelineWriteKey(accountId:string){return 'ccr:pro:request-pipeline:v1:'+z.string().uuid().parse(accountId);}
function expectedCatalog(catalog:RequestPipelineCatalog,input:RequestPipelineMutation){
 let stages=catalog.stages.map(s=>({...s}));
 if(input.action==='stage_save'){
  const old=stages.find(s=>s.id===input.stageId);if(old){if(old.builtin)throw Error();old.name=input.name;}else stages.push({id:input.stageId,builtin:false,name:input.name,position:stages.length,hidden:false,reassignToId:null});
 }else if(input.action==='stage_reorder'){
  if(input.stageIds.length!==stages.length)throw Error();stages=input.stageIds.map(id=>{const s=stages.find(s=>s.id===id);if(!s)throw Error();return s;});
 }else if(input.action==='stage_visibility'||input.action==='stage_retire'){
  const old=stages.find(s=>s.id===input.stageId);if(!old)throw Error();const target=input.reassignToId===null?null:stages.find(s=>s.id===input.reassignToId);
  if(input.action==='stage_retire'||input.hidden){if(!target||target.hidden||target.id===old.id)throw Error();for(const s of stages)if(s.reassignToId===old.id)s.reassignToId=target.id;}
  if(input.action==='stage_retire'){if(old.builtin)throw Error();stages=stages.filter(s=>s.id!==old.id);}else{old.hidden=input.hidden;old.reassignToId=input.reassignToId;}
 }else throw Error();
 return requestPipelineCatalogSchema.parse({revision:catalog.revision+1,stages:stages.map((s,position)=>({...s,position}))});
}
function validateResult(record:RequestPipelineWrite,result:RequestPipelineResult){
 const input=requestPipelineMutationSchema.parse(JSON.parse(record.body));if(result.action!==input.action)throw Error('Different action');
 if('catalog' in result){if(!equal(result.catalog,expectedCatalog(record.catalog,input)))throw Error('Different catalogue');if((input.action==='stage_save'||input.action==='stage_reorder'||input.action==='stage_visibility'&&!input.hidden)&&result.reassigned!==0)throw Error('Unexpected reassignment');}
 else{
  if(!record.baseline||!('requestId'in input)||!equal(result.before,record.baseline)||result.catalogRevision!==input.catalogRevision||result.state.requestId!==input.requestId||result.state.revision!==input.revision+1)throw Error('Different request');
  const builtin={new:'new',provider_response:'followed_up',client_response:'connected',meeting:'meeting_scheduled',shared_quote:'estimate_sent',accepted_quote:'won'}[result.evidence.kind];
  const raw=input.action==='set_stage'?input.stageId:builtin;const stage=record.catalog.stages.find(s=>s.id===raw);const effective=stage?.hidden?record.catalog.stages.find(s=>s.id===stage.reassignToId):stage;
  if(!effective||!equal(result.stage,effective)||input.action==='set_stage'&&(result.state.mode!=='manual'||result.state.stageId!==input.stageId)||input.action==='return_auto'&&(result.state.mode!=='automatic'||result.state.stageId!==null))throw Error('Different stage');
 }
 return result;
}
export function parseRequestPipelineWrite(value:unknown,accountId:string):RequestPipelineWrite{
 const r=schema.parse(value),input=requestPipelineMutationSchema.parse(JSON.parse(r.body));if(r.accountId!==accountId||JSON.stringify(input)!==r.body||input.catalogRevision!==r.catalog.revision||(r.phase==='confirmed')!==(r.result!==null))throw Error('Invalid recovery scope');
 if('requestId'in input){if(r.baseline?.requestId!==input.requestId||r.baseline.revision!==input.revision)throw Error('Invalid baseline');if(input.action==='set_stage'&&!r.catalog.stages.some(s=>s.id===input.stageId&&!s.hidden))throw Error('Unavailable stage');}else{if(r.baseline)throw Error('Unexpected request');expectedCatalog(r.catalog,input);}
 if(r.result)validateResult(r,r.result);return r;
}
export function createRequestPipelineWrite(accountId:string,input:RequestPipelineMutation,catalog:RequestPipelineCatalog,lead:RequestPipelineLead|null){const parsed=requestPipelineMutationSchema.parse(input);return parseRequestPipelineWrite({version:1,accountId,body:JSON.stringify(parsed),catalog,baseline:'requestId'in parsed?lead?.state??null:null,phase:'ready',result:null},accountId);}
export function readRequestPipelineWrite(store:Store,accountId:string){const raw=store.getItem(requestPipelineWriteKey(accountId));if(raw===null)return null;if(raw.length>40000)throw Error('Recovery too large');return parseRequestPipelineWrite(JSON.parse(raw),accountId);}
export function mergeRequestPipelineWrite(a:RequestPipelineWrite,b:RequestPipelineWrite|null){a=parseRequestPipelineWrite(a,a.accountId);if(!b)return a;b=parseRequestPipelineWrite(b,a.accountId);if(a.body!==b.body||!equal(a.catalog,b.catalog)||!equal(a.baseline,b.baseline)||a.result&&b.result&&!equal(a.result,b.result))throw Error('Different attempts');return ranks[b.phase]>ranks[a.phase]?b:a;}
export function saveRequestPipelineWrite(store:Store,value:RequestPipelineWrite){const r=parseRequestPipelineWrite(value,value.accountId),old=readRequestPipelineWrite(store,r.accountId);if(old&&!equal(mergeRequestPipelineWrite(r,old),r))throw Error('Newer recovery exists');const raw=JSON.stringify(r),key=requestPipelineWriteKey(r.accountId);store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Recovery not retained');}
function remove(store:Store,r:RequestPipelineWrite){const old=readRequestPipelineWrite(store,r.accountId);if(old&&!equal(old,r))throw Error('Recovery changed');const key=requestPipelineWriteKey(r.accountId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Recovery not cleared');}
async function locked<T>(r:RequestPipelineWrite,run:()=>Promise<T>,provided?:Locks|null){const locks=provided===undefined?(typeof navigator!=='undefined'?navigator.locks:undefined):provided;if(!locks)throw new RequestPipelineWriteFailure('busy',r);return locks.request(requestPipelineWriteKey(r.accountId),{ifAvailable:true},lock=>{if(!lock)throw new RequestPipelineWriteFailure('busy',r);return run();});}
export async function clearRequestPipelineWrite(store:Store,r:RequestPipelineWrite){return locked(r,async()=>{if(!proof.has(r))throw Error('Receipt not independently checked');remove(store,r);});}
export async function archiveRequestPipelineWrite(store:Store,r:RequestPipelineWrite){return locked(r,async()=>{if(!missing.has(r))throw Error('Check before archiving');const raw=JSON.stringify(r),key=requestPipelineWriteKey(r.accountId)+':archive:'+requestPipelineMutationSchema.parse(JSON.parse(r.body)).actionId,old=store.getItem(key);if(old!==null&&old!==raw)throw Error('Archive changed');store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Archive not retained');remove(store,r);});}
export class RequestPipelineWriteFailure extends Error{constructor(readonly kind:'scope'|'storage'|'uncertain'|'read'|'busy',readonly attempt:RequestPipelineWrite,readonly permissionStatus?:number){super(kind);}}
type Locks=Pick<LockManager,'request'>;
type Options={locks?:Locks|null;attempt:RequestPipelineWrite;store:Store;request:(url:string,init?:RequestInit)=>Promise<Response>;currentAccount:()=>string|undefined;currentRequest:()=>string|undefined;onCheckpoint:(r:RequestPipelineWrite)=>void;mode:'check'|'retry'};
export async function continueRequestPipelineWrite(options:Options):Promise<{status:'confirmed';attempt:RequestPipelineWrite;result:RequestPipelineResult}|{status:'missing';attempt:RequestPipelineWrite}|{status:'rejected';attempt:RequestPipelineWrite;code:number}>{
 const run=async()=>{
  let r=parseRequestPipelineWrite(options.attempt,options.attempt.accountId);const input=requestPipelineMutationSchema.parse(JSON.parse(r.body)),api=input.action.startsWith('stage_')?'/api/pro/lead-private-stages':'/api/pro/request-pipeline';
  const scope=(retry=false)=>{if(options.currentAccount()!==r.accountId||retry&&'requestId'in input&&options.currentRequest()!==input.requestId)throw new RequestPipelineWriteFailure('scope',r);};
  const checkpoint=(next:RequestPipelineWrite)=>{r=next;try{options.onCheckpoint(r);saveRequestPipelineWrite(options.store,r);}catch{throw new RequestPipelineWriteFailure('storage',r);}};
  const check=async()=>{scope();let response:Response;try{response=await options.request(api+'?'+new URLSearchParams({view:'action',actionId:input.actionId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':r.accountId}});}catch{throw new RequestPipelineWriteFailure('read',r);}scope();if(!response.ok){if([403,404].includes(response.status)){missing.add(r);throw new RequestPipelineWriteFailure('read',r,response.status);}throw new RequestPipelineWriteFailure('read',r);}let receipt;try{receipt=requestPipelineReceiptSchema.parse(await response.json()).receipt;}catch{throw new RequestPipelineWriteFailure('read',r);}scope();if(!receipt){if(r.phase==='confirmed')throw new RequestPipelineWriteFailure('read',r);missing.add(r);return false;}try{if(!equal(receipt.input,input))throw Error();validateResult(r,receipt.result);if(r.result&&!equal(r.result,receipt.result))throw Error();}catch{throw new RequestPipelineWriteFailure('read',r);}checkpoint({...r,phase:'confirmed',result:receipt.result});proof.add(r);return true;};
  scope();if(options.store.getItem(requestPipelineWriteKey(r.accountId))===null&&options.store.getItem(leadOriginCreateWriteKey(r.accountId))!==null)throw new RequestPipelineWriteFailure('busy',r);checkpoint(mergeRequestPipelineWrite(r,readRequestPipelineWrite(options.store,r.accountId)));
  if(await check())return{status:'confirmed' as const,attempt:r,result:r.result!};
  if(options.mode==='check')return{status:'missing' as const,attempt:r};
  scope(true);const fresh=r.phase==='ready';checkpoint({...r,phase:'uncertain'});let response:Response;try{response=await options.request(api,{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':r.accountId},body:r.body});}catch{throw new RequestPipelineWriteFailure('uncertain',r);}scope(true);
  if(!response.ok){if(await check())return{status:'confirmed' as const,attempt:r,result:r.result!};if(fresh&&[400,409,413,422].includes(response.status))return{status:'rejected' as const,attempt:r,code:response.status};throw new RequestPipelineWriteFailure('uncertain',r);}
  let result:RequestPipelineResult;try{result=validateResult(r,requestPipelineResultSchema.parse(await response.json()));}catch{throw new RequestPipelineWriteFailure('uncertain',r);}scope(true);checkpoint({...r,phase:'confirmed',result});if(!await check())throw new RequestPipelineWriteFailure('read',r);return{status:'confirmed' as const,attempt:r,result:r.result!};
 };
 return locked(options.attempt,run,options.locks);
}
