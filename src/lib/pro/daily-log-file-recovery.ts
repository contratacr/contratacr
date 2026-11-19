import {z} from 'zod';
import {parseDailyLogWrite,type DailyLogWrite} from './daily-log-recovery';
import {dailyLogReceiptSchema,type DailyLogResult} from './daily-logs';
import {dailyLogFileMutationSchema,dailyLogFileResultSchema,dailyLogFileReceiptSchema,canonicalDailyLogFileInput,type DailyLogFileResult} from './daily-log-files';
import {canonicalWorkFileName,workFileNameSchema} from './work-files';
import {readWorkFileBinary} from './work-file-recovery';
import {companyFileSchema,type CompanyFile} from './company-files';
import {companyDailyLogFileMutationSchema,companyDailyLogFileResultSchema,companyDailyLogFileReceiptSchema,canonicalCompanyDailyLogFileInput,type CompanyDailyLogFileResult} from './company-daily-log-files';

const uuid=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const dailyLogFileScopeSchema=z.object({accountId:uuid,ownerId:uuid,workId:z.string().min(1).max(160),logId:uuid,grantId:uuid.nullable(),generation:uuid.nullable()}).strict().refine(s=>(s.accountId===s.ownerId)===(s.grantId===null)&&(s.grantId===null)===(s.generation===null));
export type DailyLogFileScope=z.infer<typeof dailyLogFileScopeSchema>;
const rawFileSchema=z.object({id:uuid,name:workFileNameSchema,type:z.enum(['image/jpeg','image/png','image/webp','application/pdf']),bytes:z.instanceof(ArrayBuffer),sha256:hash}).strict();
const companyQueuedFileSchema=z.object({kind:z.literal('company'),id:uuid,name:workFileNameSchema,type:z.enum(['image/jpeg','application/pdf']),sha256:hash,source:companyFileSchema}).strict().refine(file=>file.source.ready&&!file.source.archived&&file.name===file.source.name&&file.type===file.source.mimeType&&file.sha256===file.source.sha256&&file.id!==file.source.id);
const fileSchema=z.union([rawFileSchema,companyQueuedFileSchema]);
export type DailyLogQueuedFile=z.infer<typeof fileSchema>;
export const isCompanyDailyLogQueuedFile=(file:DailyLogQueuedFile):file is z.infer<typeof companyQueuedFileSchema>=>'kind'in file&&file.kind==='company';
export type DailyLogFileUploadCheckpoint={fileId:string;actionId:string;phase:'ready'|'uncertain'|'confirmed'|'rejected';ack:unknown|null};
export type DailyLogFileQueue={version:1;scope:DailyLogFileScope;files:DailyLogQueuedFile[];intent:null|{log:DailyLogWrite|null;uploads:DailyLogFileUploadCheckpoint[]}};
export interface DailyLogFileStore{
 read(scope:DailyLogFileScope|string):Promise<DailyLogFileQueue|null>;
 advance(expected:DailyLogFileQueue|null,next:DailyLogFileQueue):Promise<void>;
 removeQueue(expected:DailyLogFileQueue):Promise<void>;
 archiveQueue(expected:DailyLogFileQueue):Promise<void>;
}
const verifiedQueues=new WeakSet<DailyLogFileQueue>();
const deniedQueues=new WeakSet<DailyLogFileQueue>();
export function assertDailyLogFileQueueRemoval(queue:DailyLogFileQueue){if(queue.intent&&!verifiedQueues.has(queue))throw Error('Daily log file result is unresolved');}
export function assertDailyLogFileQueueArchive(queue:DailyLogFileQueue){if(!deniedQueues.has(queue)&&queue.intent?.log?.phase!=='rejected'&&!queue.intent?.uploads.some(u=>u.phase==='rejected'))throw Error('Observed denial or fresh rejection required');}
export const sameDailyLogFileScope=(a:DailyLogFileScope,b:DailyLogFileScope)=>JSON.stringify(dailyLogFileScopeSchema.parse(a))===JSON.stringify(dailyLogFileScopeSchema.parse(b));
export const dailyLogFileQueueKey=(actor:string)=>'ccr:pro:daily-log-file-save:v1:'+uuid.parse(actor);
export async function dailyLogRawHash(bytes:ArrayBuffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function validateDailyLogFileQueue(value:unknown,actor:string):Promise<DailyLogFileQueue>{
 const q=z.object({version:z.literal(1),scope:dailyLogFileScopeSchema,files:z.array(fileSchema).min(1).max(20),intent:z.unknown().nullable()}).strict().parse(value);
 if(q.scope.accountId!==uuid.parse(actor)||new Set(q.files.map(f=>f.id)).size!==q.files.length)throw Error('Invalid daily log file scope');
 for(const f of q.files){if(isCompanyDailyLogQueuedFile(f)){if(q.scope.accountId!==q.scope.ownerId||q.scope.grantId!==null||q.scope.generation!==null)throw Error('Library selection requires the owner');}else if(!f.bytes.byteLength||f.bytes.byteLength>3*1024*1024||await dailyLogRawHash(f.bytes)!==f.sha256)throw Error('Daily log file bytes changed');}
 let intent:DailyLogFileQueue['intent']=null;
 if(q.intent!==null){
  const parsed=z.object({log:z.unknown().nullable(),uploads:z.array(z.object({fileId:uuid,actionId:uuid,phase:z.enum(['ready','uncertain','confirmed','rejected']),ack:z.unknown().nullable()}).strict()).min(1).max(20)}).strict().parse(q.intent);
  const log=parsed.log===null?null:parseDailyLogWrite(parsed.log,actor);
  if(log){const input=JSON.parse(log.body);if(!['create','update'].includes(input.action)||input.logId!==q.scope.logId||input.workId!==q.scope.workId||input.grantId!==q.scope.grantId||log.ownerId!==q.scope.ownerId||q.scope.grantId!==null&&log.ack&&'log'in log.ack&&log.ack.log.sourceInviteId!==q.scope.generation)throw Error('Daily log save scope changed');}
  if(parsed.uploads.length!==q.files.length||new Set(parsed.uploads.map(u=>u.actionId)).size!==parsed.uploads.length||parsed.uploads.some((u,i)=>u.fileId!==q.files[i].id||(u.phase==='confirmed')!==(u.ack!==null))||log&&parsed.uploads.some(u=>u.phase!=='ready')&&log.phase!=='confirmed')throw Error('Invalid daily log upload checkpoint');
  intent={log,uploads:parsed.uploads};
 }
 const result:DailyLogFileQueue={version:1,scope:q.scope,files:q.files,intent};
 if(intent){let unfinished=false;for(let i=0;i<intent.uploads.length;i++){const u=intent.uploads[i];if(unfinished&&u.phase!=='ready')throw Error('Daily log uploads progressed out of order');if(u.phase!=='confirmed')unfinished=true;if(u.ack!==null&&!matchesUpload(result,i,parseUploadResult(result.files[i],u.ack)))throw Error('Daily log upload acknowledgement changed');}}
 return result;
}
/** Metadata comparison is used only after both records have passed byte checks. */
export function dailyLogFileQueueSignature(q:DailyLogFileQueue){return JSON.stringify({...q,files:q.files.map(file=>{if(isCompanyDailyLogQueuedFile(file))return file;const {bytes,...metadata}=file;return{...metadata,size:bytes.byteLength};})});}
export function assertDailyLogFileQueueAdvance(old:DailyLogFileQueue|null,next:DailyLogFileQueue){
 if(!old)return;
 if(!sameDailyLogFileScope(old.scope,next.scope))throw Error('Daily log file queue scope changed');
 if(!old.intent)return;
 if(!next.intent||dailyLogFileQueueSignature({...old,intent:null})!==dailyLogFileQueueSignature({...next,intent:null}))throw Error('A started daily log file save is immutable');
 if(old.intent.log===null&&next.intent.log!==null||old.intent.log!==null&&next.intent.log===null)throw Error('Daily log save changed');
 if(old.intent.log&&next.intent.log){
  const a=old.intent.log,b=next.intent.log,order={ready:0,uncertain:1,confirmed:2,rejected:2};
  if(JSON.stringify({...a,phase:null,ack:null,rejectionCode:null})!==JSON.stringify({...b,phase:null,ack:null,rejectionCode:null})||order[a.phase]>order[b.phase]||a.ack&&JSON.stringify(a.ack)!==JSON.stringify(b.ack)||a.rejectionCode!==null&&a.rejectionCode!==b.rejectionCode||a.phase==='rejected'&&b.phase!=='rejected')throw Error('Daily log checkpoint changed');
 }
 const order={ready:0,uncertain:1,confirmed:2,rejected:2};
 if(old.intent.uploads.length!==next.intent.uploads.length||old.intent.uploads.some((u,i)=>{const n=next.intent!.uploads[i];return u.fileId!==n.fileId||u.actionId!==n.actionId||order[u.phase]>order[n.phase]||u.phase==='rejected'&&n.phase!=='rejected'||u.ack!==null&&JSON.stringify(u.ack)!==JSON.stringify(n.ack);}))throw Error('Daily log upload checkpoint changed');
}
export function mergeDailyLogFileQueue(memory:DailyLogFileQueue,disk:DailyLogFileQueue){
 if(!sameDailyLogFileScope(memory.scope,disk.scope)||dailyLogFileQueueSignature({...memory,intent:null})!==dailyLogFileQueueSignature({...disk,intent:null}))throw Error('Daily log queued files changed');
 if(dailyLogFileQueueSignature(memory)===dailyLogFileQueueSignature(disk))return memory;
 if(!memory.intent&&!disk.intent)throw Error('Daily log queued files changed');
 try{assertDailyLogFileQueueAdvance(disk,memory);return memory;}catch{assertDailyLogFileQueueAdvance(memory,disk);return disk;}
}
type Locks=Pick<LockManager,'request'>;
export async function withDailyLogFileLock<T>(actor:string,run:()=>Promise<T>,locks:Locks|undefined=globalThis.navigator?.locks):Promise<T>{
 if(!locks)throw Error('Daily log file locking unavailable');
 return locks.request(dailyLogFileQueueKey(actor),{mode:'exclusive',ifAvailable:true},held=>{if(!held)throw Error('Daily log file save is busy');return run();});
}
export async function stageDailyLogFile(store:DailyLogFileStore,scope:DailyLogFileScope,file:{name:string;type:string;bytes:ArrayBuffer},id:string,locks?:Locks){return withDailyLogFileLock(scope.accountId,async()=>{
 const old=await store.read(scope);if(old&&(!sameDailyLogFileScope(old.scope,scope)||old.intent))throw Error('Finish the previous daily log file save first');
 const bytes=file.bytes.slice(0),item=rawFileSchema.parse({id,name:file.name,type:file.type,bytes,sha256:await dailyLogRawHash(bytes)});
 const existing=old?.files.find(f=>f.id===item.id);if(existing){if(isCompanyDailyLogQueuedFile(existing)||existing.name!==item.name||existing.type!==item.type||existing.sha256!==item.sha256||existing.bytes.byteLength!==item.bytes.byteLength)throw Error('Queued file identity was reused');return old!;}
 const next=await validateDailyLogFileQueue({version:1,scope,files:[...(old?.files??[]),item],intent:null},scope.accountId);await store.advance(old,next);return next;
},locks);}
/** Stage references atomically beside old byte entries. No source bytes, network
 * calls or server writes are needed until the existing compound save is used. */
export async function stageCompanyDailyLogFiles(store:DailyLogFileStore,scope:DailyLogFileScope,sources:CompanyFile[],ids:string[]=sources.map(()=>crypto.randomUUID()),locks?:Locks){return withDailyLogFileLock(scope.accountId,async()=>{
 scope=dailyLogFileScopeSchema.parse(scope);if(scope.accountId!==scope.ownerId||scope.grantId!==null||scope.generation!==null)throw Error('Library selection requires the owner');
 if(!sources.length||sources.length>20||ids.length!==sources.length||new Set(ids).size!==ids.length||new Set(sources.map(file=>file.id)).size!==sources.length)throw Error('Invalid library selection');
 const old=await store.read(scope);if(old&&(!sameDailyLogFileScope(old.scope,scope)||old.intent))throw Error('Finish the pending file save first');
 const items=sources.map((source,index)=>companyQueuedFileSchema.parse({kind:'company',id:ids[index],name:source.name,type:source.mimeType,sha256:source.sha256,source})),files=[...(old?.files??[])];
 for(const item of items){const existing=files.find(file=>file.id===item.id);if(existing){if(JSON.stringify(existing)!==JSON.stringify(item))throw Error('Queued library identity reused');continue;}if(files.some(file=>isCompanyDailyLogQueuedFile(file)&&file.source.id===item.source.id&&file.source.revision===item.source.revision))throw Error('This library version is already selected');files.push(item);}
 const next=await validateDailyLogFileQueue({version:1,scope,files,intent:null},scope.accountId);await store.advance(old,next);return next;
},locks);}
export async function removeDailyLogQueuedFile(store:DailyLogFileStore,scope:DailyLogFileScope,fileId:string,locks?:Locks){return withDailyLogFileLock(scope.accountId,async()=>{
 const old=await store.read(scope);if(!old||!sameDailyLogFileScope(old.scope,scope)||old.intent)throw Error('Daily log file save cannot change');
 if(!old.files.some(f=>f.id===fileId))throw Error('Unknown queued file');
 const files=old.files.filter(f=>f.id!==fileId);if(!files.length){await store.removeQueue(old);return null;}
 const next={...old,files};await store.advance(old,next);return next;
},locks);}
export async function createDailyLogFileSave(store:DailyLogFileStore,scope:DailyLogFileScope,log:DailyLogWrite|null,locks?:Locks){return withDailyLogFileLock(scope.accountId,async()=>{
 const old=await store.read(scope);if(!old||!sameDailyLogFileScope(old.scope,scope)||old.intent)throw Error('Daily log file save already started or missing');
 if(log?.phase!=='ready'&&log!==null)throw Error('A new log intention is required');
 const next=await validateDailyLogFileQueue({...old,intent:{log,uploads:old.files.map(f=>({fileId:f.id,actionId:crypto.randomUUID(),phase:'ready',ack:null}))}},scope.accountId);await store.advance(old,next);return next;
},locks);}
export async function recoverDailyLogFileQueue(store:DailyLogFileStore,actor:string,memory:DailyLogFileQueue|null=null,locks?:Locks){return withDailyLogFileLock(actor,async()=>{
 const disk=await store.read(actor);if(!memory)return disk;if(!disk)throw Error('Daily log recovery disappeared');
 const current=await validateDailyLogFileQueue(memory,actor),next=mergeDailyLogFileQueue(current,disk);await store.advance(disk,next);return next;
},locks);}

function base64(bytes:ArrayBuffer){const a=new Uint8Array(bytes);let s='';for(let i=0;i<a.length;i+=12288)s+=btoa(String.fromCharCode(...a.subarray(i,i+12288)));return s;}
function uploadInput(q:DailyLogFileQueue,index:number){
 const f=q.files[index],u=q.intent!.uploads[index],s=q.scope;
 if(isCompanyDailyLogQueuedFile(f))return companyDailyLogFileMutationSchema.parse({action:'copy_from_company',actionId:u.actionId,workId:s.workId,logId:s.logId,sourceFileId:f.source.id,sourceRevision:f.source.revision,sourceSha256:f.source.sha256,targetFileId:f.id});
 return dailyLogFileMutationSchema.parse({action:'upload',actionId:u.actionId,fileId:f.id,workId:s.workId,logId:s.logId,grantId:s.grantId,generation:s.generation,name:f.name,data:base64(f.bytes)});
}
function parseUploadResult(file:DailyLogQueuedFile,value:unknown){return isCompanyDailyLogQueuedFile(file)?companyDailyLogFileResultSchema.parse(value):dailyLogFileResultSchema.parse(value);}
function matchesUpload(q:DailyLogFileQueue,index:number,result:DailyLogFileResult|CompanyDailyLogFileResult){
 const f=q.files[index],s=q.scope;
 if(isCompanyDailyLogQueuedFile(f))return result.action==='copy_from_company'&&JSON.stringify(result.source)===JSON.stringify(f.source)&&result.file.id===f.id&&result.file.ownerId===s.ownerId&&result.file.workId===s.workId&&result.file.logId===s.logId&&result.file.createdBy===s.accountId&&result.file.createdGrantId===null&&result.file.sourceInviteId===null&&result.file.name===f.name&&result.file.mimeType===f.type&&result.file.sha256===f.sha256&&result.file.sizeBytes===f.source.sizeBytes&&result.file.ready&&result.revision>0;
 if(result.action!=='upload')return false;
 const a=result.file,pdf=/^%PDF-[12]\.[0-9]/.test(String.fromCharCode(...new Uint8Array(f.bytes,0,Math.min(8,f.bytes.byteLength))));
 return a.id===f.id&&a.ownerId===s.ownerId&&a.workId===s.workId&&a.logId===s.logId&&a.createdBy===s.accountId&&a.createdGrantId===s.grantId&&a.sourceInviteId===s.generation&&a.name===canonicalWorkFileName(f.name,pdf?'application/pdf':'image/jpeg')&&a.mimeType===(pdf?'application/pdf':'image/jpeg')&&a.ready&&result.revision>0&&(!pdf||a.sizeBytes===f.bytes.byteLength&&a.sha256===f.sha256);
}
export class DailyLogFileSaveFailure extends Error{constructor(readonly kind:'scope'|'storage'|'uncertain'|'read'|'rejected',readonly queue:DailyLogFileQueue,readonly permissionStatus?:403|404){super(kind);}}
type SaveOptions={store:DailyLogFileStore;queue:DailyLogFileQueue;request:(url:string,init?:RequestInit)=>Promise<Response>;currentAccount:()=>string|undefined;mode:'check'|'retry';onCheckpoint:(queue:DailyLogFileQueue)=>void;locks?:Locks};
/** check is GET-only, including the transition from a confirmed parent to uploads. */
export async function continueDailyLogFileSave({store,queue:initial,request,currentAccount,mode,onCheckpoint,locks}:SaveOptions):Promise<{status:'confirmed'|'missing';queue:DailyLogFileQueue;result:DailyLogResult|null}>{return withDailyLogFileLock(initial.scope.accountId,async()=>{
 let queue=await validateDailyLogFileQueue(initial,initial.scope.accountId);
 const scope=()=>{if(currentAccount()!==queue.scope.accountId)throw new DailyLogFileSaveFailure('scope',queue);};scope();
 try{const disk=await store.read(queue.scope);if(!disk)throw Error();queue=mergeDailyLogFileQueue(queue,disk);await store.advance(disk,queue);scope();onCheckpoint(queue);}catch(e){if(e instanceof DailyLogFileSaveFailure)throw e;throw new DailyLogFileSaveFailure('storage',queue);}
 if(!queue.intent)throw Error('Save has not started');
 const headers={'X-Pro-Expected-Actor':queue.scope.accountId};
 const checkpoint=async(next:DailyLogFileQueue)=>{const old=queue;queue=next;scope();try{await store.advance(old,next);scope();onCheckpoint(queue);}catch(e){if(e instanceof DailyLogFileSaveFailure)throw e;throw new DailyLogFileSaveFailure('storage',queue);}};
 const denied=(kind:'read'|'uncertain',status:number)=>{if(status===403||status===404)deniedQueues.add(queue);return new DailyLogFileSaveFailure(kind,queue,status===403||status===404?status:undefined);};
 const get=async(url:string)=>{scope();let r:Response;try{r=await request(url,{cache:'no-store',headers});}catch{throw new DailyLogFileSaveFailure('read',queue);}scope();if(!r.ok)throw denied('read',r.status);return r;};
 const post=async(body:string)=>{scope();let r:Response;try{const action=JSON.parse(body).action;r=await request('/api/pro/'+(action==='copy_from_company'?'company-daily-log-files':action==='upload'?'daily-log-files':'daily-logs'),{method:'POST',headers:{...headers,'Content-Type':'application/json'},body});}catch{throw new DailyLogFileSaveFailure('uncertain',queue);}scope();return r;};
 let parent=queue.intent.log;
 if(parent){
  let observed:DailyLogResult|null=null;
  if(parent.phase==='rejected')throw new DailyLogFileSaveFailure('rejected',queue);
  if(mode==='retry'&&parent.phase!=='confirmed'){
   const fresh=parent.phase==='ready';
   parent={...parent,phase:'uncertain'};await checkpoint({...queue,intent:{...queue.intent!,log:parent}});
   const response=await post(parent.body);
   if(fresh&&[400,403,404,409,413,422].includes(response.status)){parent={...parent,phase:'rejected',rejectionCode:response.status};await checkpoint({...queue,intent:{...queue.intent!,log:parent}});throw new DailyLogFileSaveFailure('rejected',queue);}
   if(!response.ok)throw denied('uncertain',response.status);
   try{observed=parseDailyLogWrite({...parent,phase:'confirmed',ack:await response.json()},queue.scope.accountId).ack;}catch{throw new DailyLogFileSaveFailure('uncertain',queue);}
  }
  try{
   const input=JSON.parse(parent.body),response=await get('/api/pro/daily-logs?'+new URLSearchParams({view:'action',actionId:input.actionId}));
   const {receipt}=dailyLogReceiptSchema.parse(await response.json());scope();
   if(!receipt){if(parent.phase==='confirmed')throw Error('Parent receipt disappeared');return{status:'missing',queue,result:null};}
   if(JSON.stringify(receipt.input)!==parent.body||parent.ack&&JSON.stringify(parent.ack)!==JSON.stringify(receipt.result)||observed&&JSON.stringify(observed)!==JSON.stringify(receipt.result))throw Error('Parent proof changed');
   parent=parseDailyLogWrite({...parent,phase:'confirmed',ack:receipt.result},queue.scope.accountId);
   await checkpoint({...queue,intent:{...queue.intent!,log:parent}});
  }catch(e){if(e instanceof DailyLogFileSaveFailure)throw e;throw new DailyLogFileSaveFailure('read',queue);}
 }
 for(let index=0;index<queue.files.length;index++){
  let observed:DailyLogFileResult|CompanyDailyLogFileResult|null=null;
  let u=queue.intent!.uploads[index];const input=uploadInput(queue,index);
  if(u.phase==='rejected')throw new DailyLogFileSaveFailure('rejected',queue);
  const update=async(next:DailyLogFileUploadCheckpoint)=>{const uploads=queue.intent!.uploads.map((x,i)=>i===index?next:x);await checkpoint({...queue,intent:{...queue.intent!,uploads}});u=next;};
  if(mode==='retry'&&u.phase!=='confirmed'){
   const fresh=u.phase==='ready';
   await update({...u,phase:'uncertain'});const response=await post(JSON.stringify(input));
   if(fresh&&[400,403,404,409,413,415,422].includes(response.status)){await update({...u,phase:'rejected'});throw new DailyLogFileSaveFailure('rejected',queue);}
   if(!response.ok)throw denied('uncertain',response.status);
   try{const result=parseUploadResult(queue.files[index],await response.json());scope();if(!matchesUpload(queue,index,result))throw Error();observed=result;}catch(e){if(e instanceof DailyLogFileSaveFailure)throw e;throw new DailyLogFileSaveFailure('uncertain',queue);}
  }
  try{
   const company=isCompanyDailyLogQueuedFile(queue.files[index]);
   const response=await get('/api/pro/'+(company?'company-daily-log-files':'daily-log-files')+'?'+new URLSearchParams({view:'action',actionId:input.actionId}));
   const value=await response.json(),{receipt}=company?companyDailyLogFileReceiptSchema.parse(value):dailyLogFileReceiptSchema.parse(value);scope();
   if(!receipt){if(u.phase==='confirmed')throw Error('Upload receipt disappeared');return{status:'missing',queue,result:parent?.ack??null};}
   const inputHash=await dailyLogRawHash(new TextEncoder().encode(input.action==='copy_from_company'?canonicalCompanyDailyLogFileInput(input):canonicalDailyLogFileInput(input)).buffer);scope();
   if(receipt.inputHash!==inputHash||!matchesUpload(queue,index,receipt.result)||u.ack&&JSON.stringify(u.ack)!==JSON.stringify(receipt.result)||observed&&JSON.stringify(observed)!==JSON.stringify(receipt.result))throw Error('Upload proof changed');
   await update({...u,phase:'confirmed',ack:receipt.result});
   if(receipt.result.action!=='upload'&&receipt.result.action!=='copy_from_company')throw Error();const file=receipt.result.file,s=queue.scope;
   const params=new URLSearchParams({view:'binary',access:'private',workId:s.workId,logId:s.logId,fileId:file.id});if(s.grantId){params.set('grantId',s.grantId);params.set('generation',s.generation!);}
   const binary=await get('/api/pro/daily-log-files?'+params),bytes=await readWorkFileBinary(binary,file);scope();
   if(file.mimeType==='application/pdf'&&await dailyLogRawHash(bytes)!==queue.files[index].sha256)throw Error('PDF bytes changed');
  }catch(e){if(e instanceof DailyLogFileSaveFailure)throw e;throw new DailyLogFileSaveFailure('read',queue);}
 }
 scope();verifiedQueues.add(queue);return{status:'confirmed',queue,result:parent?.ack??null};
},locks);}
export async function clearDailyLogFileSave(store:DailyLogFileStore,queue:DailyLogFileQueue,locks?:Locks){return withDailyLogFileLock(queue.scope.accountId,async()=>{assertDailyLogFileQueueRemoval(queue);await store.removeQueue(queue);},locks);}
export async function archiveDailyLogFileSave(store:DailyLogFileStore,queue:DailyLogFileQueue,locks?:Locks){return withDailyLogFileLock(queue.scope.accountId,async()=>{assertDailyLogFileQueueArchive(queue);await store.archiveQueue(queue);},locks);}
