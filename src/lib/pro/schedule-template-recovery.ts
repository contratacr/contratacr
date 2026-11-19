import {z} from 'zod';
import {scheduleTemplateMutationSchema,scheduleTemplateResultSchema,scheduleTemplateReceiptSchema,type ScheduleTemplateMutation,type ScheduleTemplateResult} from './schedule-templates';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Locks=Pick<LockManager,'request'>;
const recordSchema=z.object({version:z.literal(1),accountId:z.string().uuid(),contextWorkId:z.string().min(1).max(160),body:z.string().min(1).max(2*1024*1024),phase:z.enum(['ready','uncertain','confirmed','rejected']),rejectionCode:z.number().nullable(),ack:scheduleTemplateResultSchema.nullable()}).strict();
export type ScheduleTemplateWrite=z.infer<typeof recordSchema>;
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const order={ready:0,uncertain:1,confirmed:2,rejected:2};
const rejections=[400,403,404,409,413,422];
export const scheduleTemplateWriteKey=(actor:string,work:string)=>'ccr:pro:schedule-template-write:v1:'+z.string().uuid().parse(actor)+':'+encodeURIComponent(z.string().min(1).max(160).parse(work));
const lockKey=(actor:string,work:string)=>scheduleTemplateWriteKey(actor,work)+':lock';

function matches(input:ScheduleTemplateMutation,result:ScheduleTemplateResult){
 if(input.action!==result.action)return false;
 if(result.action==='apply')return input.action==='apply'&&result.templateId===input.templateId&&result.templateRevision===input.revision&&result.workId===input.workId&&result.revision===input.workRevision+input.phaseIds.length+input.taskIds.length+input.milestoneIds.length&&equal(result.phaseIds,input.phaseIds)&&equal(result.taskIds,input.taskIds)&&equal(result.milestoneIds,input.milestoneIds);
 if(result.template.id!==input.templateId||result.template.revision!==input.revision+1||result.template.archived!==(input.action==='archive'))return false;
 if(input.action==='save')return result.template.name===input.name&&result.template.notes===input.notes&&result.template.phaseCount===input.phases.length&&result.template.taskCount===input.tasks.length&&result.template.milestoneCount===input.milestones.length;
 if(input.action==='capture')return result.template.name===input.name&&result.template.notes===input.notes&&result.template.taskCount===input.selected.length&&result.template.milestoneCount===(input.includeMilestones===false?0:input.milestoneIds.length)&&(input.includePhases!==false||result.template.phaseCount===0);
 return true;
}
export function parseScheduleTemplateWrite(value:unknown,actor:string,work:string){
 const record=recordSchema.parse(value),input=scheduleTemplateMutationSchema.parse(JSON.parse(record.body));
 if(record.accountId!==actor||record.contextWorkId!==work||(input.action==='apply'&&input.workId!==work)||(input.action==='capture'&&input.sourceWorkId!==work)||JSON.stringify(input)!==record.body||(record.phase==='confirmed')!==(record.ack!==null)||(record.phase==='rejected')!==(record.rejectionCode!==null)||record.rejectionCode!==null&&!rejections.includes(record.rejectionCode)||record.ack&&!matches(input,record.ack))throw Error('Invalid schedule template recovery');
 return record;
}
export function createScheduleTemplateWrite(actor:string,work:string,input:ScheduleTemplateMutation){
 return parseScheduleTemplateWrite({version:1,accountId:actor,contextWorkId:work,body:JSON.stringify(scheduleTemplateMutationSchema.parse(input)),phase:'ready',rejectionCode:null,ack:null},actor,work);
}
export function readScheduleTemplateWrite(store:Store,actor:string,work:string){
 const raw=store.getItem(scheduleTemplateWriteKey(actor,work));if(raw===null)return null;
 if(raw.length>3*1024*1024)throw Error('Schedule template journal too large');
 return parseScheduleTemplateWrite(JSON.parse(raw),actor,work);
}
export function mergeScheduleTemplateWrite(a:ScheduleTemplateWrite,b:ScheduleTemplateWrite|null){
 a=parseScheduleTemplateWrite(a,a.accountId,a.contextWorkId);if(!b)return a;b=parseScheduleTemplateWrite(b,a.accountId,a.contextWorkId);
 if(a.body!==b.body||a.ack&&b.ack&&!equal(a.ack,b.ack)||a.rejectionCode!==null&&b.rejectionCode!==null&&a.rejectionCode!==b.rejectionCode||a.phase==='confirmed'&&b.phase==='rejected'||a.phase==='rejected'&&b.phase==='confirmed')throw Error('Different schedule template attempts');
 return order[b.phase]>order[a.phase]?b:a;
}
export function saveScheduleTemplateWrite(store:Store,value:ScheduleTemplateWrite){
 const record=parseScheduleTemplateWrite(value,value.accountId,value.contextWorkId),old=readScheduleTemplateWrite(store,record.accountId,record.contextWorkId);
 if(old&&!equal(mergeScheduleTemplateWrite(record,old),record))throw Error('Schedule template checkpoint moved backwards');
 const key=scheduleTemplateWriteKey(record.accountId,record.contextWorkId),raw=JSON.stringify(record);store.setItem(key,raw);
 if(store.getItem(key)!==raw)throw Error('Schedule template checkpoint not retained');
}
export class ScheduleTemplateWriteFailure extends Error{
 constructor(readonly kind:'scope'|'storage'|'uncertain'|'read',readonly attempt:ScheduleTemplateWrite,readonly permissionStatus?:403|404){super(kind);}
}
export class ScheduleTemplateBusyError extends Error{}
const verified=new WeakSet<ScheduleTemplateWrite>(),denials=new WeakSet<ScheduleTemplateWriteFailure>();
async function withLock<T>(actor:string,work:string,locks:Locks|undefined,run:()=>Promise<T>){
 if(!locks)throw new ScheduleTemplateBusyError('unavailable');
 return locks.request(lockKey(actor,work),{mode:'exclusive',ifAvailable:true},async held=>{if(!held)throw new ScheduleTemplateBusyError('busy');return run();});
}
export async function clearScheduleTemplateWrite(store:Store,record:ScheduleTemplateWrite,locks:Locks|undefined=globalThis.navigator?.locks){
 return withLock(record.accountId,record.contextWorkId,locks,async()=>{
  parseScheduleTemplateWrite(record,record.accountId,record.contextWorkId);
  if(record.phase==='uncertain'||record.phase==='confirmed'&&!verified.has(record))throw Error('Schedule template result unresolved');
  const old=readScheduleTemplateWrite(store,record.accountId,record.contextWorkId);if(old&&!equal(old,record))throw Error('Schedule template journal changed');
  const key=scheduleTemplateWriteKey(record.accountId,record.contextWorkId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Schedule template journal not cleared');
 });
}
export async function archiveScheduleTemplateWrite(store:Store,record:ScheduleTemplateWrite,error:ScheduleTemplateWriteFailure,locks:Locks|undefined=globalThis.navigator?.locks){
 return withLock(record.accountId,record.contextWorkId,locks,async()=>{
  if(!denials.has(error)||!equal(error.attempt,record)||!equal(readScheduleTemplateWrite(store,record.accountId,record.contextWorkId),record))throw Error('Current permission denial required');
  const input=scheduleTemplateMutationSchema.parse(JSON.parse(record.body)),key=scheduleTemplateWriteKey(record.accountId,record.contextWorkId),archive=key+':archived:'+input.actionId,raw=JSON.stringify(record),old=store.getItem(archive);
  if(old!==null&&old!==raw)throw Error('Schedule template archive changed');
  store.setItem(archive,raw);if(store.getItem(archive)!==raw)throw Error('Schedule template archive not retained');
  store.removeItem(key);if(store.getItem(key)!==null)throw Error('Schedule template archive did not clear journal');denials.delete(error);
 });
}
type Continuation={status:'confirmed';attempt:ScheduleTemplateWrite;result:ScheduleTemplateResult}|{status:'missing';attempt:ScheduleTemplateWrite;result:null}|{status:'rejected';attempt:ScheduleTemplateWrite;result:null;code:number};
export async function continueScheduleTemplateWrite({store,attempt:initial,request,currentAccount,currentWork,mode,onCheckpoint,locks=globalThis.navigator?.locks}:{store:Store;attempt:ScheduleTemplateWrite;request:(url:string,init?:RequestInit)=>Promise<Response>;currentAccount:()=>string|undefined;currentWork:()=>string|undefined;mode:'check'|'retry';onCheckpoint:(record:ScheduleTemplateWrite)=>void;locks?:Locks}):Promise<Continuation>{
 return withLock(initial.accountId,initial.contextWorkId,locks,async()=>{
  let attempt=parseScheduleTemplateWrite(initial,initial.accountId,initial.contextWorkId);
  const scope=()=>{if(currentAccount()!==attempt.accountId||currentWork()!==attempt.contextWorkId)throw new ScheduleTemplateWriteFailure('scope',attempt);};scope();
  try{attempt=mergeScheduleTemplateWrite(attempt,readScheduleTemplateWrite(store,attempt.accountId,attempt.contextWorkId));}catch{throw new ScheduleTemplateWriteFailure('storage',attempt);}
  const checkpoint=(next:ScheduleTemplateWrite)=>{
   attempt=next;try{scope();saveScheduleTemplateWrite(store,attempt);scope();onCheckpoint(attempt);}catch(error){if(error instanceof ScheduleTemplateWriteFailure)throw error;throw new ScheduleTemplateWriteFailure('storage',attempt);}
  };
  checkpoint(attempt);
  const input=scheduleTemplateMutationSchema.parse(JSON.parse(attempt.body)),headers={'X-Pro-Expected-Actor':attempt.accountId};
  const denied=(kind:'read'|'uncertain',status:number)=>{const error=new ScheduleTemplateWriteFailure(kind,attempt,status===403||status===404?status:undefined);if(error.permissionStatus)denials.add(error);return error;};
  if(attempt.phase==='rejected')return{status:'rejected',attempt,result:null,code:attempt.rejectionCode!};
  if(mode==='retry'&&attempt.phase!=='confirmed'){
   const fresh=attempt.phase==='ready';checkpoint({...attempt,phase:'uncertain'});scope();
   let response:Response;try{response=await request('/api/pro/schedule-templates',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:attempt.body});}catch{throw new ScheduleTemplateWriteFailure('uncertain',attempt);}scope();
   if(fresh&&rejections.includes(response.status)){checkpoint({...attempt,phase:'rejected',rejectionCode:response.status});return{status:'rejected',attempt,result:null,code:response.status};}
   if(!response.ok)throw denied('uncertain',response.status);
   try{const result=scheduleTemplateResultSchema.parse(await response.json());scope();if(!matches(input,result))throw Error();checkpoint({...attempt,phase:'confirmed',ack:result});}catch(error){if(error instanceof ScheduleTemplateWriteFailure)throw error;throw new ScheduleTemplateWriteFailure('uncertain',attempt);}
  }
  try{
   const response=await request('/api/pro/schedule-templates?'+new URLSearchParams({view:'action',actionId:input.actionId}),{cache:'no-store',headers});scope();
   if(!response.ok)throw denied('read',response.status);
   const {receipt}=scheduleTemplateReceiptSchema.parse(await response.json());scope();
   if(!receipt){if(attempt.phase==='confirmed')throw Error('Schedule template receipt disappeared');return{status:'missing',attempt,result:null};}
   if(JSON.stringify(receipt.input)!==attempt.body||!matches(input,receipt.result)||attempt.ack&&!equal(attempt.ack,receipt.result))throw Error('Schedule template proof changed');
   if(attempt.phase!=='confirmed')checkpoint({...attempt,phase:'confirmed',ack:receipt.result});
   verified.add(attempt);return{status:'confirmed',attempt,result:receipt.result};
  }catch(error){if(error instanceof ScheduleTemplateWriteFailure)throw error;throw new ScheduleTemplateWriteFailure('read',attempt);}
 });
}
