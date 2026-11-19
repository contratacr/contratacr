import {z} from 'zod';
import {dailyLogCommentMutationSchema,dailyLogCommentResultSchema,dailyLogCommentReceiptSchema,dailyLogDiscussionThreadSchema,dailyLogDiscussionContextSchema,type DailyLogDiscussionContext,type DailyLogCommentMutation,type DailyLogCommentResult} from './daily-log-discussion';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Locks=Pick<LockManager,'request'>;
const recordSchema=z.object({version:z.literal(1),accountId:z.string().uuid(),body:z.string().min(1).max(24*1024),thread:dailyLogDiscussionThreadSchema,phase:z.enum(['ready','uncertain','confirmed','rejected']),rejectionCode:z.number().nullable(),ack:dailyLogCommentResultSchema.nullable()}).strict();
export type DailyLogCommentWrite=z.infer<typeof recordSchema>;
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const order={ready:0,uncertain:1,confirmed:2,rejected:2};
const rejections=[400,403,404,409,413,422];
export const dailyLogCommentWriteKey=(actor:string)=>'ccr:pro:daily-log-comment-write:v1:'+z.string().uuid().parse(actor);
const lockKey=(actor:string)=>dailyLogCommentWriteKey(actor)+':lock';

function validateScope(record:DailyLogCommentWrite,input:DailyLogCommentMutation){
 const s=input.scope,t=record.thread;
 if(new TextEncoder().encode(record.body).byteLength>24*1024||t.logId!==s.logId||t.version!==s.version||t.channel!==s.channel||t.generation!==input.generation||s.side==='owner'&&(t.ownerId!==record.accountId||t.workId!==s.workId))throw Error('Invalid comment scope');
}
function matches(record:DailyLogCommentWrite,result:DailyLogCommentResult){
 const input=dailyLogCommentMutationSchema.parse(JSON.parse(record.body));
 return result.action===input.action&&equal(result.thread,record.thread)&&result.comment.id===input.commentId&&result.comment.actorId===record.accountId&&result.comment.text===input.text;
}
export function parseDailyLogCommentWrite(value:unknown,actor:string){
 const record=recordSchema.parse(value),input=dailyLogCommentMutationSchema.parse(JSON.parse(record.body));
 if(record.accountId!==actor||JSON.stringify(input)!==record.body||(record.phase==='confirmed')!==(record.ack!==null)||(record.phase==='rejected')!==(record.rejectionCode!==null)||record.rejectionCode!==null&&!rejections.includes(record.rejectionCode)||record.ack&&!matches(record,record.ack))throw Error('Invalid daily log comment recovery');
 validateScope(record,input);return record;
}
export function createDailyLogCommentWrite(actor:string,input:DailyLogCommentMutation,context:DailyLogDiscussionContext){
 const {canComment,...thread}=dailyLogDiscussionContextSchema.parse(context);if(!canComment)throw Error('Discussion is read-only');
 return parseDailyLogCommentWrite({version:1,accountId:actor,thread,body:JSON.stringify(dailyLogCommentMutationSchema.parse(input)),phase:'ready',rejectionCode:null,ack:null},actor);
}
export function readDailyLogCommentWrite(store:Store,actor:string){
 const raw=store.getItem(dailyLogCommentWriteKey(actor));if(raw===null)return null;
 if(raw.length>64*1024)throw Error('Daily log comment journal too large');
 return parseDailyLogCommentWrite(JSON.parse(raw),actor);
}
export function mergeDailyLogCommentWrite(a:DailyLogCommentWrite,b:DailyLogCommentWrite|null){
 a=parseDailyLogCommentWrite(a,a.accountId);if(!b)return a;b=parseDailyLogCommentWrite(b,a.accountId);
 if(!equal(a.thread,b.thread)||a.body!==b.body||a.ack&&b.ack&&!equal(a.ack,b.ack)||a.rejectionCode!==null&&b.rejectionCode!==null&&a.rejectionCode!==b.rejectionCode||a.phase==='confirmed'&&b.phase==='rejected'||a.phase==='rejected'&&b.phase==='confirmed')throw Error('Different daily log comment attempts');
 return order[b.phase]>order[a.phase]?b:a;
}
export function saveDailyLogCommentWrite(store:Store,value:DailyLogCommentWrite){
 const record=parseDailyLogCommentWrite(value,value.accountId),old=readDailyLogCommentWrite(store,record.accountId);
 if(old&&!equal(mergeDailyLogCommentWrite(record,old),record))throw Error('Daily log comment checkpoint moved backwards');
 const key=dailyLogCommentWriteKey(record.accountId),raw=JSON.stringify(record);if(raw.length>64*1024)throw Error('Comment checkpoint too large');store.setItem(key,raw);
 if(store.getItem(key)!==raw)throw Error('Daily log comment checkpoint not retained');
}
export class DailyLogCommentWriteFailure extends Error{
 constructor(readonly kind:'scope'|'storage'|'uncertain'|'read',readonly attempt:DailyLogCommentWrite,readonly permissionStatus?:403|404){super(kind);}
}
export class DailyLogCommentBusyError extends Error{}
const verified=new WeakSet<DailyLogCommentWrite>(),denials=new WeakSet<DailyLogCommentWriteFailure>();
async function withLock<T>(actor:string,locks:Locks|undefined,run:()=>Promise<T>){
 if(!locks)throw new DailyLogCommentBusyError('unavailable');
 return locks.request(lockKey(actor),{mode:'exclusive',ifAvailable:true},async held=>{if(!held)throw new DailyLogCommentBusyError('busy');return run();});
}
export async function clearDailyLogCommentWrite(store:Store,record:DailyLogCommentWrite,locks:Locks|undefined=globalThis.navigator?.locks){
 return withLock(record.accountId,locks,async()=>{
  parseDailyLogCommentWrite(record,record.accountId);
  if(record.phase==='uncertain'||record.phase==='confirmed'&&!verified.has(record))throw Error('Daily log comment result unresolved');
  const old=readDailyLogCommentWrite(store,record.accountId);if(old&&!equal(old,record))throw Error('Daily log comment journal changed');
  const key=dailyLogCommentWriteKey(record.accountId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Daily log comment journal not cleared');
 });
}
export async function archiveDailyLogCommentWrite(store:Store,record:DailyLogCommentWrite,error:DailyLogCommentWriteFailure,locks:Locks|undefined=globalThis.navigator?.locks){
 return withLock(record.accountId,locks,async()=>{
  if(!denials.has(error)||!equal(error.attempt,record)||!equal(readDailyLogCommentWrite(store,record.accountId),record))throw Error('Current permission denial required');
  const input=dailyLogCommentMutationSchema.parse(JSON.parse(record.body)),key=dailyLogCommentWriteKey(record.accountId),archive=key+':archived:'+input.actionId,raw=JSON.stringify(record),old=store.getItem(archive);
  if(old!==null&&old!==raw)throw Error('Daily log comment archive changed');
  store.setItem(archive,raw);if(store.getItem(archive)!==raw)throw Error('Daily log comment archive not retained');
  store.removeItem(key);if(store.getItem(key)!==null)throw Error('Daily log comment archive did not clear journal');denials.delete(error);
 });
}
type Continuation={status:'confirmed';attempt:DailyLogCommentWrite;result:DailyLogCommentResult}|{status:'missing';attempt:DailyLogCommentWrite;result:null}|{status:'rejected';attempt:DailyLogCommentWrite;result:null;code:number};
export async function continueDailyLogCommentWrite({store,attempt:initial,request,currentAccount,mode,onCheckpoint,locks=globalThis.navigator?.locks}:{store:Store;attempt:DailyLogCommentWrite;request:(url:string,init?:RequestInit)=>Promise<Response>;currentAccount:()=>string|undefined;mode:'check'|'retry';onCheckpoint:(record:DailyLogCommentWrite)=>void;locks?:Locks}):Promise<Continuation>{
 return withLock(initial.accountId,locks,async()=>{
  let attempt=parseDailyLogCommentWrite(initial,initial.accountId);
  const scope=()=>{if(currentAccount()!==attempt.accountId)throw new DailyLogCommentWriteFailure('scope',attempt);};scope();
  try{attempt=mergeDailyLogCommentWrite(attempt,readDailyLogCommentWrite(store,attempt.accountId));}catch{throw new DailyLogCommentWriteFailure('storage',attempt);}
  const checkpoint=(next:DailyLogCommentWrite)=>{
   attempt=next;try{scope();saveDailyLogCommentWrite(store,attempt);scope();onCheckpoint(attempt);}catch(error){if(error instanceof DailyLogCommentWriteFailure)throw error;throw new DailyLogCommentWriteFailure('storage',attempt);}
  };
  checkpoint(attempt);
  const input=dailyLogCommentMutationSchema.parse(JSON.parse(attempt.body)),headers={'X-Pro-Expected-Actor':attempt.accountId};
  const denied=(kind:'read'|'uncertain',status:number)=>{const error=new DailyLogCommentWriteFailure(kind,attempt,status===403||status===404?status:undefined);if(error.permissionStatus)denials.add(error);return error;};
  if(attempt.phase==='rejected')return{status:'rejected',attempt,result:null,code:attempt.rejectionCode!};
  if(mode==='retry'&&attempt.phase!=='confirmed'){
   const fresh=attempt.phase==='ready';checkpoint({...attempt,phase:'uncertain'});scope();
   let response:Response;try{response=await request('/api/pro/daily-log-discussion',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:attempt.body});}catch{throw new DailyLogCommentWriteFailure('uncertain',attempt);}scope();
   if(fresh&&rejections.includes(response.status)){checkpoint({...attempt,phase:'rejected',rejectionCode:response.status});return{status:'rejected',attempt,result:null,code:response.status};}
   if(!response.ok)throw denied('uncertain',response.status);
   try{const result=dailyLogCommentResultSchema.parse(await response.json());scope();if(!matches(attempt,result))throw Error();checkpoint({...attempt,phase:'confirmed',ack:result});}catch(error){if(error instanceof DailyLogCommentWriteFailure)throw error;throw new DailyLogCommentWriteFailure('uncertain',attempt);}
  }
  try{
   const response=await request('/api/pro/daily-log-discussion?'+new URLSearchParams({view:'action',actionId:input.actionId}),{cache:'no-store',headers});scope();
   if(!response.ok)throw denied('read',response.status);
   const {receipt}=dailyLogCommentReceiptSchema.parse(await response.json());scope();
   if(!receipt){if(attempt.phase==='confirmed')throw Error('Daily log comment receipt disappeared');return{status:'missing',attempt,result:null};}
   if(JSON.stringify(receipt.input)!==attempt.body||!matches(attempt,receipt.result)||attempt.ack&&!equal(attempt.ack,receipt.result))throw Error('Daily log comment proof changed');
   if(attempt.phase!=='confirmed')checkpoint({...attempt,phase:'confirmed',ack:receipt.result});
   verified.add(attempt);return{status:'confirmed',attempt,result:receipt.result};
  }catch(error){if(error instanceof DailyLogCommentWriteFailure)throw error;throw new DailyLogCommentWriteFailure('read',attempt);}
 });
}
