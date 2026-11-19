import {z} from 'zod';
import {dailyLogSchema,type DailyLog} from './daily-logs';
import {dailyLogFileSchema,type DailyLogFile} from './daily-log-files';
import {dailyLogDuplicateInputSchema,dailyLogDuplicateAbortSchema,dailyLogDuplicateResultSchema,dailyLogDuplicateReceiptSchema,type DailyLogDuplicateInput,type DailyLogDuplicateResult} from './daily-log-duplicate';
import {readWorkFileBinary} from './work-file-recovery';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Locks=Pick<LockManager,'request'>;
const stamp=z.string().datetime({offset:true});
const abortReceipt=z.object({input:dailyLogDuplicateAbortSchema,at:stamp}).strict();
const recordSchema=z.object({
 version:z.literal(1),accountId:z.string().uuid(),body:z.string().min(1).max(16384),inputHash:z.string().regex(/^[a-f0-9]{64}$/),
 source:dailyLogSchema,selectedFiles:z.array(dailyLogFileSchema).min(1).max(20),phase:z.enum(['ready','uncertain','confirmed','aborted']),
 reservation:stamp.nullable(),verifiedFileIds:z.array(z.string().uuid()).max(20),ack:dailyLogDuplicateResultSchema.nullable(),abortBody:z.string().min(1).max(32768).nullable(),abortAck:abortReceipt.nullable(),
}).strict();
export type DailyLogDuplicateWrite=z.infer<typeof recordSchema>;
const api='/api/pro/daily-log-duplicate',limit=1024*1024;
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
const verified=new WeakSet<DailyLogDuplicateWrite>(),checked=new WeakSet<DailyLogDuplicateWrite>();
const denied=new WeakSet<DailyLogDuplicateFailure>();
export const dailyLogDuplicateWriteKey=(actor:string)=>'ccr:pro:daily-log-duplicate:v1:'+z.string().uuid().parse(actor);

function sameContent(a:DailyLog,b:DailyLog){return a.date===b.date&&a.title===b.title&&a.summary===b.summary&&equal(a.sections,b.sections)&&equal(a.weather,b.weather)&&equal(a.snapshot,b.snapshot);}
function matchesResult(record:DailyLogDuplicateWrite,result:DailyLogDuplicateResult){
 const input=dailyLogDuplicateInputSchema.parse(JSON.parse(record.body)),log=result.log;
 return log.ownerId===record.source.ownerId&&log.workId===input.workId&&log.id===input.targetLogId&&log.revision===1&&!log.archived&&log.publishedRevision===null&&log.createdBy===record.accountId&&log.createdGrantId===input.grantId&&log.sourceInviteId===input.generation&&sameContent(record.source,log)&&result.files.length===input.files.length&&result.files.every((file,index)=>{
  const source=record.selectedFiles[index],ref=input.files[index];
  return file.id===ref.targetFileId&&file.ownerId===log.ownerId&&file.workId===input.workId&&file.logId===input.targetLogId&&file.ready&&file.name===source.name&&file.mimeType===source.mimeType&&file.sizeBytes===source.sizeBytes&&file.sha256===source.sha256&&file.createdBy===record.accountId&&file.createdGrantId===input.grantId&&file.sourceInviteId===input.generation;
 });
}
function sameAbort(record:DailyLogDuplicateWrite,receipt:z.infer<typeof abortReceipt>){return JSON.stringify(receipt.input.duplicate)===record.body;}
export function parseDailyLogDuplicateWrite(value:unknown,actor:string){
 const record=recordSchema.parse(value),input=dailyLogDuplicateInputSchema.parse(JSON.parse(record.body));
 const abort=record.abortBody?dailyLogDuplicateAbortSchema.parse(JSON.parse(record.abortBody)):null;
 if(input.grantId!==null&&(record.source.createdBy!==actor||record.source.createdGrantId!==input.grantId||record.source.sourceInviteId!==input.generation||record.source.publishedRevision!==null)||record.verifiedFileIds.length>0&&record.reservation===null)throw Error('Invalid duplicate author generation or progress');
 if(record.accountId!==actor||JSON.stringify(input)!==record.body||(input.grantId===null)!==(record.source.ownerId===actor)||record.source.id!==input.sourceLogId||record.source.workId!==input.workId||record.source.revision!==input.sourceRevision||record.selectedFiles.length!==input.files.length||record.selectedFiles.some((file,index)=>!file.ready||file.ownerId!==record.source.ownerId||file.workId!==input.workId||file.logId!==input.sourceLogId||file.id!==input.files[index].sourceFileId||file.sha256!==input.files[index].sha256)||new Set(record.verifiedFileIds).size!==record.verifiedFileIds.length||record.verifiedFileIds.some(id=>!input.files.some(file=>file.targetFileId===id))||(record.phase==='confirmed')!==(record.ack!==null)||(record.phase==='aborted')!==(record.abortAck!==null)||record.ack&&(!record.reservation||!matchesResult(record,record.ack)||record.verifiedFileIds.length!==input.files.length)||record.abortAck&&!sameAbort(record,record.abortAck)||abort&&(JSON.stringify(abort)!==record.abortBody||JSON.stringify(abort.duplicate)!==record.body)||record.phase==='ready'&&(record.reservation!==null||record.verifiedFileIds.length>0||record.abortBody!==null))throw Error('Invalid daily log duplicate journal');
 if(new TextEncoder().encode(JSON.stringify(record)).byteLength>limit)throw Error('Daily log duplicate journal too large');
 return record;
}
export async function validateDailyLogDuplicateWrite(value:unknown,actor:string){const record=parseDailyLogDuplicateWrite(value,actor);if(await hash(record.body)!==record.inputHash)throw Error('Duplicate checksum changed');return record;}
export async function createDailyLogDuplicateWrite(actor:string,input:DailyLogDuplicateInput,source:DailyLog,selectedFiles:DailyLogFile[]){
 const body=JSON.stringify(dailyLogDuplicateInputSchema.parse(input));
 return validateDailyLogDuplicateWrite({version:1,accountId:actor,body,inputHash:await hash(body),source,selectedFiles,phase:'ready',reservation:null,verifiedFileIds:[],ack:null,abortBody:null,abortAck:null},actor);
}
export function readDailyLogDuplicateWrite(store:Store,actor:string){const raw=store.getItem(dailyLogDuplicateWriteKey(actor));if(raw===null)return null;if(raw.length>limit)throw Error('Duplicate journal too large');return parseDailyLogDuplicateWrite(JSON.parse(raw),actor);}
export function mergeDailyLogDuplicateWrite(a:DailyLogDuplicateWrite,b:DailyLogDuplicateWrite|null){
 a=parseDailyLogDuplicateWrite(a,a.accountId);if(!b)return a;b=parseDailyLogDuplicateWrite(b,a.accountId);
 if(a.body!==b.body||a.inputHash!==b.inputHash||!equal(a.source,b.source)||!equal(a.selectedFiles,b.selectedFiles)||a.reservation&&b.reservation&&a.reservation!==b.reservation||a.ack&&b.ack&&!equal(a.ack,b.ack)||a.abortAck&&b.abortAck&&!equal(a.abortAck,b.abortAck)||a.abortBody&&b.abortBody&&a.abortBody!==b.abortBody||a.phase==='confirmed'&&b.phase==='aborted'||a.phase==='aborted'&&b.phase==='confirmed')throw Error('Duplicate identity changed');
 const terminal=a.phase==='confirmed'||a.phase==='aborted'?a.phase:b.phase==='confirmed'||b.phase==='aborted'?b.phase:a.phase==='uncertain'||b.phase==='uncertain'?'uncertain':'ready';
 const input=dailyLogDuplicateInputSchema.parse(JSON.parse(a.body)),ids=new Set([...a.verifiedFileIds,...b.verifiedFileIds]);
 return parseDailyLogDuplicateWrite({...a,phase:terminal,reservation:a.reservation??b.reservation,verifiedFileIds:input.files.map(file=>file.targetFileId).filter(id=>ids.has(id)),ack:a.ack??b.ack,abortBody:a.abortBody??b.abortBody,abortAck:a.abortAck??b.abortAck},a.accountId);
}
function save(store:Store,attempt:DailyLogDuplicateWrite){
 const record=parseDailyLogDuplicateWrite(attempt,attempt.accountId),disk=readDailyLogDuplicateWrite(store,attempt.accountId);
 if(!equal(mergeDailyLogDuplicateWrite(record,disk),record))throw Error('Duplicate checkpoint moved backwards');
 const key=dailyLogDuplicateWriteKey(record.accountId),raw=JSON.stringify(record);store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Duplicate checkpoint not retained');
}
async function locked<T>(actor:string,run:()=>Promise<T>,locks:Locks|undefined){if(!locks)throw Error('Duplicate locking unavailable');return locks.request(dailyLogDuplicateWriteKey(actor)+':lock',{mode:'exclusive',ifAvailable:true},held=>{if(!held)throw Error('Duplicate is busy');return run();});}
export class DailyLogDuplicateFailure extends Error{constructor(readonly kind:'scope'|'storage'|'uncertain'|'read',readonly attempt:DailyLogDuplicateWrite,readonly permissionStatus?:403|404){super(kind);}}
type Options={store:Store;attempt:DailyLogDuplicateWrite;request:(url:string,init?:RequestInit)=>Promise<Response>;currentAccount:()=>string|undefined;mode:'check'|'retry'|'abort';onCheckpoint:(attempt:DailyLogDuplicateWrite)=>void;locks?:Locks};
type Continuation={status:'missing'|'pending'|'confirmed'|'aborted';attempt:DailyLogDuplicateWrite;result:DailyLogDuplicateResult|null};
export async function continueDailyLogDuplicateWrite({store,attempt:initial,request,currentAccount,mode,onCheckpoint,locks=globalThis.navigator?.locks}:Options):Promise<Continuation>{return locked(initial.accountId,async()=>{
 let attempt=await validateDailyLogDuplicateWrite(initial,initial.accountId);
 const scope=()=>{if(currentAccount()!==attempt.accountId)throw new DailyLogDuplicateFailure('scope',attempt);};scope();
 try{const disk=readDailyLogDuplicateWrite(store,attempt.accountId);if(disk)await validateDailyLogDuplicateWrite(disk,attempt.accountId);attempt=mergeDailyLogDuplicateWrite(attempt,disk);}catch{throw new DailyLogDuplicateFailure('storage',attempt);}scope();
 const checkpoint=(next:DailyLogDuplicateWrite)=>{attempt=next;scope();try{save(store,attempt);scope();onCheckpoint(attempt);}catch(error){if(error instanceof DailyLogDuplicateFailure)throw error;throw new DailyLogDuplicateFailure('storage',attempt);}};
 checkpoint(attempt);const input=dailyLogDuplicateInputSchema.parse(JSON.parse(attempt.body)),headers={'X-Pro-Expected-Actor':attempt.accountId};
 const failure=(kind:'read'|'uncertain',status:number)=>{const error=new DailyLogDuplicateFailure(kind,attempt,status===403||status===404?status:undefined);if(error.permissionStatus)denied.add(error);return error;};
 type Proof=z.infer<typeof dailyLogDuplicateReceiptSchema>;
 const validateProof=(raw:unknown):Proof=>{
  const proof=dailyLogDuplicateReceiptSchema.parse(raw),remote=proof.attempt;
  if(proof.abort&&!sameAbort(attempt,proof.abort))throw Error('Abort identity changed');
  if(remote){
   if(JSON.stringify(remote.input)!==attempt.body||!equal(remote.source,attempt.source)||!equal(remote.selectedFiles,attempt.selectedFiles)||attempt.reservation&&attempt.reservation!==remote.reservedAt||attempt.verifiedFileIds.some(id=>!remote.verifiedFileIds.includes(id))||remote.result&&!matchesResult(attempt,remote.result)||attempt.ack&&!equal(attempt.ack,remote.result)||remote.phase==='aborted'&&!proof.abort||proof.abort&&remote.phase!=='aborted')throw Error('Duplicate proof changed');
  }else if(attempt.reservation||attempt.ack||attempt.verifiedFileIds.length)throw Error('Duplicate reservation disappeared');
  if(attempt.abortAck&&!equal(attempt.abortAck,proof.abort)||attempt.phase==='confirmed'&&proof.abort)throw Error('Duplicate terminal outcome changed');
  return proof;
 };
 const read=async()=>{const response=await request(api+'?'+new URLSearchParams({view:'action',actionId:input.actionId}),{cache:'no-store',headers});scope();if(!response.ok)throw failure('read',response.status);const value=await response.json();scope();return validateProof(value);};
 const post=async(body:string)=>{checkpoint({...attempt,phase:'uncertain'});let response:Response;try{response=await request(api,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body});}catch{throw new DailyLogDuplicateFailure('uncertain',attempt);}scope();if(!response.ok)throw failure('uncertain',response.status);const value=await response.json();scope();return validateProof(value);};
 try{
  let observed:Proof|null=null;
  if(mode==='retry'&&!attempt.abortBody&&attempt.phase!=='confirmed'&&attempt.phase!=='aborted')observed=await post(attempt.body);
  let proof=await read();
  if(mode==='abort'||mode==='retry'&&attempt.abortBody){
   if(!proof.abort&&proof.attempt?.phase!=='confirmed'){
    if(!attempt.abortBody){const abort=dailyLogDuplicateAbortSchema.parse({action:'abort',actionId:crypto.randomUUID(),duplicate:input});checkpoint({...attempt,phase:'uncertain',abortBody:JSON.stringify(abort)});}
    observed=await post(attempt.abortBody!);proof=await read();
   }
  }
  if(observed){const old=observed.attempt,now=proof.attempt;if(observed.abort&&!equal(observed.abort,proof.abort)||old&&(!now||!equal(old.input,now.input)||!equal(old.source,now.source)||!equal(old.selectedFiles,now.selectedFiles)||old.reservedAt!==now.reservedAt||old.verifiedFileIds.some(id=>!now.verifiedFileIds.includes(id))||old.result&&!equal(old.result,now.result)))throw Error('Duplicate acknowledgement changed');}
  const remote=proof.attempt;
  if(proof.abort){checkpoint({...attempt,phase:'aborted',reservation:remote?.reservedAt??attempt.reservation,verifiedFileIds:remote?.verifiedFileIds??attempt.verifiedFileIds,abortAck:proof.abort,ack:null});verified.add(attempt);return{status:'aborted',attempt,result:null};}
  if(!remote){if(attempt.phase==='confirmed'||attempt.phase==='aborted')throw Error('Duplicate outcome disappeared');checked.add(attempt);return{status:'missing',attempt,result:null};}
  checkpoint({...attempt,phase:remote.phase==='confirmed'?'confirmed':'uncertain',reservation:remote.reservedAt,verifiedFileIds:input.files.map(file=>file.targetFileId).filter(id=>remote.verifiedFileIds.includes(id)),ack:remote.result});
  if(remote.phase!=='confirmed'){checked.add(attempt);return{status:'pending',attempt,result:null};}
  const result=remote.result!;
  for(const file of result.files){const response=await request('/api/pro/daily-log-files?'+new URLSearchParams({view:'binary',access:'private',workId:input.workId,logId:input.targetLogId,fileId:file.id,...input.grantId?{grantId:input.grantId,generation:input.generation!}:{}}),{cache:'no-store',headers});scope();if(!response.ok)throw failure('read',response.status);await readWorkFileBinary(response,file);scope();}
  verified.add(attempt);return{status:'confirmed',attempt,result};
 }catch(error){if(error instanceof DailyLogDuplicateFailure)throw error;throw new DailyLogDuplicateFailure('read',attempt);}
},locks);}
export async function clearDailyLogDuplicateWrite(store:Store,attempt:DailyLogDuplicateWrite,locks:Locks|undefined=globalThis.navigator?.locks){return locked(attempt.accountId,async()=>{
 if(attempt.phase==='uncertain'||attempt.phase!=='ready'&&!verified.has(attempt)||!equal(readDailyLogDuplicateWrite(store,attempt.accountId),attempt))throw Error('Duplicate outcome unresolved');
 const key=dailyLogDuplicateWriteKey(attempt.accountId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Duplicate journal retained');
},locks);}
export async function archiveDailyLogDuplicateWrite(store:Store,attempt:DailyLogDuplicateWrite,error?:DailyLogDuplicateFailure,locks:Locks|undefined=globalThis.navigator?.locks){return locked(attempt.accountId,async()=>{
 const permission=!!error&&denied.has(error)&&equal(error.attempt,attempt);
 if(!checked.has(attempt)&&!permission||(attempt.phase==='confirmed'||attempt.phase==='aborted')&&!permission||!equal(readDailyLogDuplicateWrite(store,attempt.accountId),attempt))throw Error('Current pending proof or observed permission denial required');
 const key=dailyLogDuplicateWriteKey(attempt.accountId),input=dailyLogDuplicateInputSchema.parse(JSON.parse(attempt.body)),archive=key+':archived:'+input.actionId,raw=JSON.stringify(attempt),prior=store.getItem(archive);
 if(prior!==null&&prior!==raw)throw Error('Duplicate archive collision');store.setItem(archive,raw);if(store.getItem(archive)!==raw)throw Error('Duplicate archive not retained');store.removeItem(key);if(store.getItem(key)!==null)throw Error('Duplicate journal retained');if(error)denied.delete(error);
},locks);}
