import {z} from 'zod';
import {dailyLogFileSchema,type DailyLogFile} from './daily-log-files';
import {dailyLogFileReconciliationMutationSchema,dailyLogFileReconciliationResultSchema,dailyLogFileReconciliationAttemptSchema,dailyLogFileReconciliationReceiptSchema,dailyLogFileReconciliationResponseSchema,type DailyLogFileReconciliationMutation,type DailyLogFileReconciliationResult,type DailyLogFileReconciliationAttempt} from './daily-log-file-reconciliation';
import {readWorkFileBinary} from './work-file-recovery';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Locks=Pick<LockManager,'request'>;
const schema=z.object({version:z.literal(1),accountId:z.string().uuid(),body:z.string().min(1).max(8192),inputHash:z.string().regex(/^[a-f0-9]{64}$/),baseline:dailyLogFileSchema,phase:z.enum(['ready','uncertain','confirmed']),reservation:z.object({baseline:dailyLogFileSchema,reservedAt:z.string().datetime({offset:true})}).strict().nullable(),ack:dailyLogFileReconciliationResultSchema.nullable()}).strict();
export type DailyLogFileReconciliationWrite=z.infer<typeof schema>;
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const api='/api/pro/daily-log-file-reconciliation';
const verified=new WeakSet<DailyLogFileReconciliationWrite>(),checked=new WeakSet<DailyLogFileReconciliationWrite>();
const denied=new WeakSet<DailyLogFileReconciliationFailure>();
const order={ready:0,uncertain:1,confirmed:2};
export const dailyLogFileReconciliationWriteKey=(actor:string)=>'ccr:pro:daily-log-file-reconciliation:v1:'+z.string().uuid().parse(actor);
const digest=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const immutable=(file:DailyLogFile)=>{const {ready,...rest}=dailyLogFileSchema.parse(file);void ready;return rest;};
function sameFile(before:DailyLogFile,after:DailyLogFile){return equal(immutable(before),immutable(after))&&(!before.ready||after.ready);}
function matches(record:DailyLogFileReconciliationWrite,result:DailyLogFileReconciliationResult){
 return result.verifiedBy.id===record.accountId&&sameFile(record.baseline,result.file)&&result.file.ready&&(!record.reservation||sameFile(record.reservation.baseline,result.file))&&(result.outcome!=='completed'||!record.reservation?.baseline.ready);
}
export function parseDailyLogFileReconciliationWrite(value:unknown,actor:string){
 const record=schema.parse(value),input=dailyLogFileReconciliationMutationSchema.parse(JSON.parse(record.body));
 if(record.accountId!==actor||record.baseline.ownerId!==actor||JSON.stringify(input)!==record.body||input.fileId!==record.baseline.id||input.workId!==record.baseline.workId||input.logId!==record.baseline.logId||input.sha256!==record.baseline.sha256||(record.phase==='confirmed')!==(record.ack!==null)||record.phase==='ready'&&(record.reservation!==null||record.ack!==null)||record.reservation&&!sameFile(record.baseline,record.reservation.baseline)||record.ack&&(!record.reservation||!matches(record,record.ack)))throw Error('Invalid file reconciliation recovery');
 return record;
}
export async function validateDailyLogFileReconciliationWrite(value:unknown,actor:string){const record=parseDailyLogFileReconciliationWrite(value,actor);if(await digest(record.body)!==record.inputHash)throw Error('File reconciliation checksum changed');return record;}
export async function createDailyLogFileReconciliationWrite(actor:string,input:DailyLogFileReconciliationMutation,baseline:DailyLogFile){const body=JSON.stringify(dailyLogFileReconciliationMutationSchema.parse(input));return validateDailyLogFileReconciliationWrite({version:1,accountId:actor,body,inputHash:await digest(body),baseline,phase:'ready',reservation:null,ack:null},actor);}
export function readDailyLogFileReconciliationWrite(store:Store,actor:string){const raw=store.getItem(dailyLogFileReconciliationWriteKey(actor));if(raw===null)return null;if(raw.length>64*1024)throw Error('File reconciliation journal too large');return parseDailyLogFileReconciliationWrite(JSON.parse(raw),actor);}
export function mergeDailyLogFileReconciliationWrite(a:DailyLogFileReconciliationWrite,b:DailyLogFileReconciliationWrite|null){
 a=parseDailyLogFileReconciliationWrite(a,a.accountId);if(!b)return a;b=parseDailyLogFileReconciliationWrite(b,a.accountId);
 if(a.body!==b.body||a.inputHash!==b.inputHash||!equal(a.baseline,b.baseline)||a.reservation&&b.reservation&&!equal(a.reservation,b.reservation)||a.ack&&b.ack&&!equal(a.ack,b.ack))throw Error('File reconciliation identity changed');
 return parseDailyLogFileReconciliationWrite({...a,phase:order[a.phase]>=order[b.phase]?a.phase:b.phase,reservation:a.reservation??b.reservation,ack:a.ack??b.ack},a.accountId);
}
function save(store:Store,value:DailyLogFileReconciliationWrite){
 const record=parseDailyLogFileReconciliationWrite(value,value.accountId),old=readDailyLogFileReconciliationWrite(store,record.accountId);
 if(!equal(mergeDailyLogFileReconciliationWrite(record,old),record))throw Error('File reconciliation checkpoint moved backwards');
 const raw=JSON.stringify(record),key=dailyLogFileReconciliationWriteKey(record.accountId);if(raw.length>64*1024)throw Error('File reconciliation journal too large');store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('File reconciliation checkpoint not retained');
}
async function locked<T>(actor:string,run:()=>Promise<T>,locks:Locks|undefined){if(!locks)throw Error('File reconciliation locking unavailable');return locks.request(dailyLogFileReconciliationWriteKey(actor)+':lock',{mode:'exclusive',ifAvailable:true},held=>{if(!held)throw Error('File reconciliation is busy');return run();});}
export class DailyLogFileReconciliationFailure extends Error{constructor(readonly kind:'scope'|'storage'|'uncertain'|'read',readonly attempt:DailyLogFileReconciliationWrite,readonly permissionStatus?:403|404){super(kind);}}
function validateReceipt(record:DailyLogFileReconciliationWrite,value:unknown){
 const remote=dailyLogFileReconciliationAttemptSchema.parse(value);
 if(JSON.stringify(remote.input)!==record.body||!sameFile(record.baseline,remote.baseline)||record.reservation&&!equal(record.reservation,{baseline:remote.baseline,reservedAt:remote.reservedAt})||remote.result&&!matches({...record,reservation:{baseline:remote.baseline,reservedAt:remote.reservedAt}},remote.result)||record.ack&&!equal(record.ack,remote.result))throw Error('File reconciliation proof changed');
 return remote;
}
type Options={store:Store;attempt:DailyLogFileReconciliationWrite;request:(url:string,init?:RequestInit)=>Promise<Response>;currentAccount:()=>string|undefined;mode:'check'|'retry';onCheckpoint:(record:DailyLogFileReconciliationWrite)=>void;locks?:Locks};
type Continuation={status:'confirmed'|'pending'|'missing';attempt:DailyLogFileReconciliationWrite;result:DailyLogFileReconciliationResult|null;reason:DailyLogFileReconciliationAttempt['reason']};
export async function continueDailyLogFileReconciliationWrite({store,attempt:initial,request,currentAccount,mode,onCheckpoint,locks=globalThis.navigator?.locks}:Options):Promise<Continuation>{return locked(initial.accountId,async()=>{
 let attempt=await validateDailyLogFileReconciliationWrite(initial,initial.accountId);
 const scope=()=>{if(currentAccount()!==attempt.accountId)throw new DailyLogFileReconciliationFailure('scope',attempt);};scope();
 try{const disk=readDailyLogFileReconciliationWrite(store,attempt.accountId);if(disk)await validateDailyLogFileReconciliationWrite(disk,attempt.accountId);attempt=mergeDailyLogFileReconciliationWrite(attempt,disk);}catch{throw new DailyLogFileReconciliationFailure('storage',attempt);}
 const checkpoint=(next:DailyLogFileReconciliationWrite)=>{attempt=next;scope();try{save(store,attempt);scope();onCheckpoint(attempt);}catch(error){if(error instanceof DailyLogFileReconciliationFailure)throw error;throw new DailyLogFileReconciliationFailure('storage',attempt);}};
 checkpoint(attempt);const input=dailyLogFileReconciliationMutationSchema.parse(JSON.parse(attempt.body)),headers={'X-Pro-Expected-Actor':attempt.accountId};
 const failure=(kind:'read'|'uncertain',status:number)=>{const error=new DailyLogFileReconciliationFailure(kind,attempt,status===403||status===404?status:undefined);if(error.permissionStatus)denied.add(error);return error;};
 let observed:DailyLogFileReconciliationAttempt|null=null;
 if(mode==='retry'&&attempt.phase!=='confirmed'){
  checkpoint({...attempt,phase:'uncertain'});let response:Response;
  try{response=await request(api,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:attempt.body});}catch{throw new DailyLogFileReconciliationFailure('uncertain',attempt);}scope();
  // Even a 4xx can follow an earlier committed reservation. Never discard this
  // journal from HTTP status alone: inspect its durable owner action explicitly.
  if(!response.ok)throw failure('uncertain',response.status);
  try{const envelope=dailyLogFileReconciliationResponseSchema.parse(await response.json());scope();observed=validateReceipt(attempt,envelope.attempt);}catch(error){if(error instanceof DailyLogFileReconciliationFailure)throw error;throw new DailyLogFileReconciliationFailure('uncertain',attempt);}
 }
 try{
  const response=await request(api+'?'+new URLSearchParams({view:'action',actionId:input.actionId}),{cache:'no-store',headers});scope();if(!response.ok)throw failure('read',response.status);
  const receipt=dailyLogFileReconciliationReceiptSchema.parse(await response.json()).attempt;scope();
  if(!receipt){if(attempt.phase==='confirmed'||attempt.reservation||observed)throw Error('File reconciliation reservation disappeared');checked.add(attempt);return{status:'missing',attempt,result:null,reason:null};}
  const remote=validateReceipt(attempt,receipt);
  if(observed&&(!equal(observed.input,remote.input)||!equal(observed.baseline,remote.baseline)||observed.reservedAt!==remote.reservedAt||observed.result&&!equal(observed.result,remote.result)))throw Error('File reconciliation acknowledgement changed');
  checkpoint({...attempt,phase:remote.phase==='confirmed'?'confirmed':'uncertain',reservation:{baseline:remote.baseline,reservedAt:remote.reservedAt},ack:remote.result});
  if(remote.phase==='pending'){checked.add(attempt);return{status:'pending',attempt,result:null,reason:remote.reason};}
  const result=remote.result!;
  const binary=await request('/api/pro/daily-log-files?'+new URLSearchParams({view:'binary',access:'private',workId:input.workId,logId:input.logId,fileId:input.fileId}),{cache:'no-store',headers});scope();if(!binary.ok)throw failure('read',binary.status);await readWorkFileBinary(binary,result.file);scope();
  verified.add(attempt);return{status:'confirmed',attempt,result,reason:null};
 }catch(error){if(error instanceof DailyLogFileReconciliationFailure)throw error;throw new DailyLogFileReconciliationFailure('read',attempt);}
},locks);}
export async function clearDailyLogFileReconciliationWrite(store:Store,attempt:DailyLogFileReconciliationWrite,locks:Locks|undefined=globalThis.navigator?.locks){return locked(attempt.accountId,async()=>{
 if(attempt.phase==='uncertain'||attempt.phase==='confirmed'&&!verified.has(attempt)||!equal(readDailyLogFileReconciliationWrite(store,attempt.accountId),attempt))throw Error('File reconciliation result unresolved');
 const key=dailyLogFileReconciliationWriteKey(attempt.accountId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('File reconciliation journal not removed');
},locks);}
export async function archiveDailyLogFileReconciliationWrite(store:Store,attempt:DailyLogFileReconciliationWrite,error?:DailyLogFileReconciliationFailure,locks:Locks|undefined=globalThis.navigator?.locks){return locked(attempt.accountId,async()=>{
 const permission=!!error&&denied.has(error)&&equal(error.attempt,attempt);
 if(!checked.has(attempt)&&!permission||attempt.phase==='confirmed'&&!permission||!equal(readDailyLogFileReconciliationWrite(store,attempt.accountId),attempt))throw Error('Current pending proof or permission denial required');
 const key=dailyLogFileReconciliationWriteKey(attempt.accountId),input=dailyLogFileReconciliationMutationSchema.parse(JSON.parse(attempt.body)),archive=key+':archived:'+input.actionId,raw=JSON.stringify(attempt),prior=store.getItem(archive);
 if(prior!==null&&prior!==raw)throw Error('File reconciliation archive collision');store.setItem(archive,raw);if(store.getItem(archive)!==raw)throw Error('File reconciliation archive not retained');store.removeItem(key);if(store.getItem(key)!==null)throw Error('File reconciliation archive incomplete');if(error)denied.delete(error);
},locks);}
