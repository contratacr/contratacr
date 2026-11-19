import {z} from 'zod';
import {dailyLogMutationSchema,dailyLogResultSchema,dailyLogReceiptSchema,dailyLogSchema,dailyLogSnapshotSchema,type DailyLog,type DailyLogSnapshot,type DailyLogMutation,type DailyLogResult} from './daily-logs';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Locks=Pick<LockManager,'request'>;
const recordSchema=z.object({version:z.literal(1),accountId:z.string().uuid(),ownerId:z.string().uuid(),body:z.string().min(1).max(128*1024),baseline:dailyLogSchema.nullable(),expectedSnapshot:dailyLogSnapshotSchema.nullable(),phase:z.enum(['ready','uncertain','confirmed','rejected']),rejectionCode:z.number().nullable(),ack:dailyLogResultSchema.nullable()}).strict();
export type DailyLogWrite=z.infer<typeof recordSchema>;
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const order={ready:0,uncertain:1,confirmed:2,rejected:2};
const rejections=[400,403,404,409,413,422];
export const dailyLogWriteKey=(actor:string)=>'ccr:pro:daily-log-write:v1:'+z.string().uuid().parse(actor);
const lockKey=(actor:string)=>dailyLogWriteKey(actor)+':lock';

function sameIds(a:string[],b:string[]){return a.length===b.length&&a.every(id=>b.includes(id));}
function validateContext(record:DailyLogWrite,input:DailyLogMutation){
 const old=record.baseline,snapshot=record.expectedSnapshot;
 if(new TextEncoder().encode(record.body).byteLength>128*1024)throw Error('Daily log request too large');
 if(input.action==='defaults_save'){if(record.ownerId!==record.accountId||old!==null||snapshot!==null)throw Error('Invalid defaults context');return;}
 if((input.grantId===null)!==(record.ownerId===record.accountId))throw Error('Invalid daily log ownership');
 if(input.action==='create'){if(old!==null)throw Error('Unexpected daily log baseline');}
 else{
  if(!old||old.ownerId!==record.ownerId||old.workId!==input.workId||old.id!==input.logId||old.revision!==input.revision)throw Error('Invalid daily log baseline');
  if(input.grantId!==null&&(old.createdBy!==record.accountId||old.createdGrantId!==input.grantId||old.publishedRevision!==null))throw Error('Invalid author generation');
  if(input.action==='archive'&&old.archived||input.action==='restore'&&!old.archived||input.action==='publish'&&old.archived||input.action==='update'&&old.archived)throw Error('Invalid daily log state');
 }
 if((input.action==='create'||input.action==='update')&&input.source.mode==='capture'){
  if(!snapshot||snapshot.fingerprint!==input.source.fingerprint||snapshot.date!==input.date||!sameIds(snapshot.tasks.map(t=>t.id),input.source.taskIds)||!sameIds(snapshot.plan.map(t=>t.taskId),input.source.planTaskIds)||input.sections.time!==(snapshot.minutes!==null)||!input.sections.tasks&&snapshot.tasks.length>0||!input.sections.plan&&snapshot.plan.length>0)throw Error('Invalid captured daily log source');
 }else if(snapshot!==null)throw Error('Unexpected captured daily log source');
 if(input.action==='update'&&input.source.mode==='keep'&&(!old||input.date!==old.date||!equal(input.sections,old.sections)))throw Error('Daily log source changed without recapture');
}
function matches(record:DailyLogWrite,result:DailyLogResult){
 const input=dailyLogMutationSchema.parse(JSON.parse(record.body)),old=record.baseline;
 if(input.action!==result.action)return false;
 if(input.action==='defaults_save')return result.action==='defaults_save'&&result.defaults.revision===input.revision+1&&result.defaults.summary===input.summary&&equal(result.defaults.sections,input.sections);
 if(!('log'in result))return false;const log=result.log;
 if(log.ownerId!==record.ownerId||log.workId!==input.workId||log.id!==(input.action==='duplicate'?input.targetLogId:input.logId)||log.revision!==(input.action==='create'||input.action==='duplicate'?1:input.revision+1))return false;
 if(input.action==='create'||input.action==='duplicate'){
  if(log.archived||log.publishedRevision!==null||log.createdBy!==record.accountId||log.createdGrantId!==input.grantId||(input.grantId===null)!==(log.sourceInviteId===null))return false;
 }else if(!old||log.createdBy!==old.createdBy||log.createdByName!==old.createdByName||log.createdGrantId!==old.createdGrantId||log.sourceInviteId!==old.sourceInviteId||log.createdAt!==old.createdAt)return false;
 if(input.action==='create'||input.action==='update'){
  if(log.date!==input.date||log.title!==input.title||log.summary!==input.summary||!equal(log.sections,input.sections)||!equal(log.weather,input.weather)||!equal(log.snapshot,input.source.mode==='capture'?record.expectedSnapshot:old?.snapshot)||log.archived||log.publishedRevision!==(old?.publishedRevision??null))return false;
 }else{
  if(!old||log.date!==old.date||log.title!==old.title||log.summary!==old.summary||!equal(log.sections,old.sections)||!equal(log.weather,old.weather)||!equal(log.snapshot,old.snapshot))return false;
  if(input.action==='duplicate')return true;
  if(log.archived!==(input.action==='archive'))return false;
  if(input.action!=='publish')return log.publishedRevision===old.publishedRevision;
 }
 if(input.action==='publish'){
  if(result.action!=='publish'||log.archived||log.publishedRevision!==log.revision)return false;
  const version=result.version;
  return version.id===log.id&&version.date===log.date&&version.title===log.title&&version.summary===log.summary&&equal(version.sections,log.sections)&&equal(version.weather,log.weather)&&equal(version.snapshot,log.snapshot)&&version.authorName===log.createdByName;
 }
 return true;
}
export function parseDailyLogWrite(value:unknown,actor:string){
 const record=recordSchema.parse(value),input=dailyLogMutationSchema.parse(JSON.parse(record.body));
 if(record.accountId!==actor||JSON.stringify(input)!==record.body||(record.phase==='confirmed')!==(record.ack!==null)||(record.phase==='rejected')!==(record.rejectionCode!==null)||record.rejectionCode!==null&&!rejections.includes(record.rejectionCode)||record.ack&&!matches(record,record.ack))throw Error('Invalid daily log recovery');
 validateContext(record,input);return record;
}
export function createDailyLogWrite(actor:string,input:DailyLogMutation,baseline:DailyLog|null=null,expectedSnapshot:DailyLogSnapshot|null=null,ownerId=baseline?.ownerId??actor){
 return parseDailyLogWrite({version:1,accountId:actor,ownerId,baseline,expectedSnapshot,body:JSON.stringify(dailyLogMutationSchema.parse(input)),phase:'ready',rejectionCode:null,ack:null},actor);
}
export function readDailyLogWrite(store:Store,actor:string){
 const raw=store.getItem(dailyLogWriteKey(actor));if(raw===null)return null;
 if(raw.length>4*1024*1024)throw Error('Daily log journal too large');
 return parseDailyLogWrite(JSON.parse(raw),actor);
}
export function mergeDailyLogWrite(a:DailyLogWrite,b:DailyLogWrite|null){
 a=parseDailyLogWrite(a,a.accountId);if(!b)return a;b=parseDailyLogWrite(b,a.accountId);
 if(a.ownerId!==b.ownerId||!equal(a.baseline,b.baseline)||!equal(a.expectedSnapshot,b.expectedSnapshot)||a.body!==b.body||a.ack&&b.ack&&!equal(a.ack,b.ack)||a.rejectionCode!==null&&b.rejectionCode!==null&&a.rejectionCode!==b.rejectionCode||a.phase==='confirmed'&&b.phase==='rejected'||a.phase==='rejected'&&b.phase==='confirmed')throw Error('Different daily log attempts');
 return order[b.phase]>order[a.phase]?b:a;
}
export function saveDailyLogWrite(store:Store,value:DailyLogWrite){
 const record=parseDailyLogWrite(value,value.accountId),old=readDailyLogWrite(store,record.accountId);
 if(old&&!equal(mergeDailyLogWrite(record,old),record))throw Error('Daily log checkpoint moved backwards');
 const key=dailyLogWriteKey(record.accountId),raw=JSON.stringify(record);if(raw.length>4*1024*1024)throw Error('Daily log checkpoint too large');store.setItem(key,raw);
 if(store.getItem(key)!==raw)throw Error('Daily log checkpoint not retained');
}
export class DailyLogWriteFailure extends Error{
 constructor(readonly kind:'scope'|'storage'|'uncertain'|'read',readonly attempt:DailyLogWrite,readonly permissionStatus?:403|404){super(kind);}
}
export class DailyLogBusyError extends Error{}
const verified=new WeakSet<DailyLogWrite>(),denials=new WeakSet<DailyLogWriteFailure>();
async function withLock<T>(actor:string,locks:Locks|undefined,run:()=>Promise<T>){
 if(!locks)throw new DailyLogBusyError('unavailable');
 return locks.request(lockKey(actor),{mode:'exclusive',ifAvailable:true},async held=>{if(!held)throw new DailyLogBusyError('busy');return run();});
}
export async function clearDailyLogWrite(store:Store,record:DailyLogWrite,locks:Locks|undefined=globalThis.navigator?.locks){
 return withLock(record.accountId,locks,async()=>{
  parseDailyLogWrite(record,record.accountId);
  if(record.phase==='uncertain'||record.phase==='confirmed'&&!verified.has(record))throw Error('Daily log result unresolved');
  const old=readDailyLogWrite(store,record.accountId);if(old&&!equal(old,record))throw Error('Daily log journal changed');
  const key=dailyLogWriteKey(record.accountId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Daily log journal not cleared');
 });
}
export async function archiveDailyLogWrite(store:Store,record:DailyLogWrite,error:DailyLogWriteFailure,locks:Locks|undefined=globalThis.navigator?.locks){
 return withLock(record.accountId,locks,async()=>{
  if(!denials.has(error)||!equal(error.attempt,record)||!equal(readDailyLogWrite(store,record.accountId),record))throw Error('Current permission denial required');
  const input=dailyLogMutationSchema.parse(JSON.parse(record.body)),key=dailyLogWriteKey(record.accountId),archive=key+':archived:'+input.actionId,raw=JSON.stringify(record),old=store.getItem(archive);
  if(old!==null&&old!==raw)throw Error('Daily log archive changed');
  store.setItem(archive,raw);if(store.getItem(archive)!==raw)throw Error('Daily log archive not retained');
  store.removeItem(key);if(store.getItem(key)!==null)throw Error('Daily log archive did not clear journal');denials.delete(error);
 });
}
type Continuation={status:'confirmed';attempt:DailyLogWrite;result:DailyLogResult}|{status:'missing';attempt:DailyLogWrite;result:null}|{status:'rejected';attempt:DailyLogWrite;result:null;code:number};
export async function continueDailyLogWrite({store,attempt:initial,request,currentAccount,mode,onCheckpoint,locks=globalThis.navigator?.locks}:{store:Store;attempt:DailyLogWrite;request:(url:string,init?:RequestInit)=>Promise<Response>;currentAccount:()=>string|undefined;mode:'check'|'retry';onCheckpoint:(record:DailyLogWrite)=>void;locks?:Locks}):Promise<Continuation>{
 return withLock(initial.accountId,locks,async()=>{
  let attempt=parseDailyLogWrite(initial,initial.accountId);
  const scope=()=>{if(currentAccount()!==attempt.accountId)throw new DailyLogWriteFailure('scope',attempt);};scope();
  try{attempt=mergeDailyLogWrite(attempt,readDailyLogWrite(store,attempt.accountId));}catch{throw new DailyLogWriteFailure('storage',attempt);}
  const checkpoint=(next:DailyLogWrite)=>{
   attempt=next;try{scope();saveDailyLogWrite(store,attempt);scope();onCheckpoint(attempt);}catch(error){if(error instanceof DailyLogWriteFailure)throw error;throw new DailyLogWriteFailure('storage',attempt);}
  };
  checkpoint(attempt);
  const input=dailyLogMutationSchema.parse(JSON.parse(attempt.body)),headers={'X-Pro-Expected-Actor':attempt.accountId};
  const denied=(kind:'read'|'uncertain',status:number)=>{const error=new DailyLogWriteFailure(kind,attempt,status===403||status===404?status:undefined);if(error.permissionStatus)denials.add(error);return error;};
  if(attempt.phase==='rejected')return{status:'rejected',attempt,result:null,code:attempt.rejectionCode!};
  if(mode==='retry'&&attempt.phase!=='confirmed'){
   const fresh=attempt.phase==='ready';checkpoint({...attempt,phase:'uncertain'});scope();
   let response:Response;try{response=await request('/api/pro/daily-logs',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:attempt.body});}catch{throw new DailyLogWriteFailure('uncertain',attempt);}scope();
   if(fresh&&rejections.includes(response.status)){checkpoint({...attempt,phase:'rejected',rejectionCode:response.status});return{status:'rejected',attempt,result:null,code:response.status};}
   if(!response.ok)throw denied('uncertain',response.status);
   try{const result=dailyLogResultSchema.parse(await response.json());scope();if(!matches(attempt,result))throw Error();checkpoint({...attempt,phase:'confirmed',ack:result});}catch(error){if(error instanceof DailyLogWriteFailure)throw error;throw new DailyLogWriteFailure('uncertain',attempt);}
  }
  try{
   const response=await request('/api/pro/daily-logs?'+new URLSearchParams({view:'action',actionId:input.actionId}),{cache:'no-store',headers});scope();
   if(!response.ok)throw denied('read',response.status);
   const {receipt}=dailyLogReceiptSchema.parse(await response.json());scope();
   if(!receipt){if(attempt.phase==='confirmed')throw Error('Daily log receipt disappeared');return{status:'missing',attempt,result:null};}
   if(JSON.stringify(receipt.input)!==attempt.body||!matches(attempt,receipt.result)||attempt.ack&&!equal(attempt.ack,receipt.result))throw Error('Daily log proof changed');
   if(attempt.phase!=='confirmed')checkpoint({...attempt,phase:'confirmed',ack:receipt.result});
   verified.add(attempt);return{status:'confirmed',attempt,result:receipt.result};
  }catch(error){if(error instanceof DailyLogWriteFailure)throw error;throw new DailyLogWriteFailure('read',attempt);}
 });
}
