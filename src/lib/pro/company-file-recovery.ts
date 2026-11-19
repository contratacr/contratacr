import {z} from 'zod';
import {companyFileMutationSchema,companyFileResultSchema,companyFileReceiptSchema,companyFileItemSchema,canonicalCompanyFileInput,type CompanyFileMutation,type CompanyFileResult} from './company-files';
import {canonicalWorkFileName,WORK_FILE_MAX_BYTES} from './work-files';
import {readWorkFileBinary} from './work-file-recovery';
import {PRO_FILE_BODY_MAX} from './file-limit';
/** Round 7C: canonical base64 check without a backtracking regex (20 MiB bodies overflowed the regex stack). */
function canonicalBase64(data:string){if(data.length%4!==0)return false;const pad=data.endsWith('==')?2:data.endsWith('=')?1:0;for(let i=0;i<data.length-pad;i++){const c=data.charCodeAt(i);if(!(c>=65&&c<=90||c>=97&&c<=122||c>=48&&c<=57||c===43||c===47))return false;}return true;}
const hash=z.string().regex(/^[a-f0-9]{64}$/),rejections=[400,403,404,409,413,415,422];
const schema=z.object({version:z.literal(1),accountId:z.string().uuid(),body:z.string().min(1).max(PRO_FILE_BODY_MAX),inputHash:hash,baseline:companyFileItemSchema.nullable(),phase:z.enum(['ready','uncertain','confirmed','rejected']),rejectionCode:z.number().nullable(),ack:companyFileResultSchema.nullable()}).strict();
export type CompanyFileWrite=z.infer<typeof schema>;
export interface CompanyFileStore{read(actor:string):Promise<CompanyFileWrite|null>;advance(value:CompanyFileWrite):Promise<void>;remove(expected:CompanyFileWrite):Promise<void>;archive(expected:CompanyFileWrite):Promise<void>;}
const order={ready:0,uncertain:1,confirmed:2,rejected:2},equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export const companyFileWriteKey=(actor:string)=>'ccr:pro:company-file-write:v1:'+z.string().uuid().parse(actor);
function bytesFromBase64(data:string){
 if(!canonicalBase64(data))throw Error('Invalid file encoding');
 const text=atob(data),bytes=Uint8Array.from(text,c=>c.charCodeAt(0));if(!bytes.length||bytes.length>WORK_FILE_MAX_BYTES||base64(bytes)!==data)throw Error('Invalid file encoding');return bytes;
}
function base64(bytes:Uint8Array){let result='';for(let offset=0;offset<bytes.length;offset+=12288)result+=btoa(String.fromCharCode(...bytes.subarray(offset,offset+12288)));return result;}
async function digest(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
function validateBaseline(input:CompanyFileMutation,baseline:CompanyFileWrite['baseline']){
 if(input.action==='upload'||input.action==='folder_save'&&input.revision===0){if(baseline!==null)throw Error('Unexpected file baseline');return;}
 if(input.action==='folder_save'||input.action==='folder_archive'||input.action==='folder_restore'){
  if(baseline?.kind!=='folder'||baseline.folder.id!==input.folderId||baseline.folder.revision!==input.revision||baseline.folder.archived!==(input.action==='folder_restore'))throw Error('Invalid folder baseline');
 }else if(!('fileId'in input)||baseline?.kind!=='file'||baseline.file.id!==input.fileId||baseline.file.revision!==input.revision||!baseline.file.ready||baseline.file.archived!==(input.action==='file_restore'))throw Error('Invalid file baseline');
}
function matches(record:CompanyFileWrite,result:CompanyFileResult){
 const input=companyFileMutationSchema.parse(JSON.parse(record.body)),baseline=record.baseline;if(input.action!==result.action)return false;
 if(input.action==='folder_save'||input.action==='folder_archive'||input.action==='folder_restore'){
  if(!('folder'in result))return false;const file=result.folder,old=baseline?.kind==='folder'?baseline.folder:null;
  return file.id===input.folderId&&file.revision===input.revision+1&&file.archived===(input.action==='folder_archive')&&(input.action==='folder_save'?file.name===input.name&&file.parentId===input.parentId&&file.favorite===input.favorite:!!old&&file.name===old.name&&file.parentId===old.parentId&&file.favorite===old.favorite);
 }
 if(input.action==='copy'){
  if(result.action!=='copy'||baseline?.kind!=='file')return false;const file=result.copy.file,old=baseline.file;
  return result.copy.sourceFileId===input.fileId&&result.copy.sourceRevision===input.revision&&result.copy.workId===input.workId&&file.id===input.targetFileId&&file.workId===input.workId&&file.revision===1&&file.ready&&file.publishedAt===null&&file.name===old.name&&file.mimeType===old.mimeType&&file.sizeBytes===old.sizeBytes&&file.sha256===old.sha256;
 }
 if(!('file'in result))return false;const file=result.file;
 if(input.action==='upload'){
  const raw=bytesFromBase64(input.data),pdf=raw.length>=5&&String.fromCharCode(...raw.subarray(0,5))==='%PDF-';
  return file.id===input.fileId&&file.revision===1&&file.ready&&!file.archived&&!file.favorite&&file.folderId===input.folderId&&file.name===canonicalWorkFileName(input.name,pdf?'application/pdf':'image/jpeg')&&file.mimeType===(pdf?'application/pdf':'image/jpeg')&&(!pdf||file.sizeBytes===raw.byteLength);
 }
 if(!('fileId'in input)||baseline?.kind!=='file')return false;const old=baseline.file;
 return file.id===input.fileId&&file.revision===input.revision+1&&file.ready&&file.mimeType===old.mimeType&&file.sha256===old.sha256&&file.sizeBytes===old.sizeBytes&&file.createdAt===old.createdAt&&file.archived===(input.action==='file_archive')&&(input.action==='file_update'?file.name===canonicalWorkFileName(input.name,old.mimeType)&&file.folderId===input.folderId&&file.favorite===input.favorite:file.name===old.name&&file.folderId===old.folderId&&file.favorite===old.favorite);
}
export function parseCompanyFileWrite(value:unknown,actor:string){
 const record=schema.parse(value),input=companyFileMutationSchema.parse(JSON.parse(record.body));
 if(record.accountId!==actor||JSON.stringify(input)!==record.body||(record.phase==='confirmed')!==(record.ack!==null)||(record.phase==='rejected')!==(record.rejectionCode!==null)||record.rejectionCode!==null&&!rejections.includes(record.rejectionCode))throw Error('Invalid company file recovery');
 validateBaseline(input,record.baseline);if(input.action==='upload')bytesFromBase64(input.data);if(record.ack&&!matches(record,record.ack))throw Error('Invalid company file acknowledgement');return record;
}
export async function validateCompanyFileWrite(value:unknown,actor:string){const record=parseCompanyFileWrite(value,actor),input=companyFileMutationSchema.parse(JSON.parse(record.body));if(await digest(canonicalCompanyFileInput(input))!==record.inputHash)throw Error('Company file recovery checksum mismatch');return record;}
export async function createCompanyFileWrite(actor:string,input:CompanyFileMutation,baseline:CompanyFileWrite['baseline']=null){const parsed=companyFileMutationSchema.parse(input);return validateCompanyFileWrite({version:1,accountId:actor,body:JSON.stringify(parsed),inputHash:await digest(canonicalCompanyFileInput(parsed)),baseline,phase:'ready',rejectionCode:null,ack:null},actor);}
export async function createCompanyFileUpload(actor:string,file:{name:string;type:string;bytes:ArrayBuffer},fileId:string,folderId:string|null,actionId:string){
 if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))throw Error('Unsupported company file type');const bytes=new Uint8Array(file.bytes.slice(0));if(!bytes.length||bytes.length>WORK_FILE_MAX_BYTES)throw Error('Invalid file size');return createCompanyFileWrite(actor,{action:'upload',actionId,fileId,folderId,name:file.name,data:base64(bytes)});
}
export function assertCompanyFileAdvance(old:CompanyFileWrite|null,next:CompanyFileWrite){
 if(old&&(old.accountId!==next.accountId||old.body!==next.body||old.inputHash!==next.inputHash||!equal(old.baseline,next.baseline)||order[old.phase]>order[next.phase]||old.phase==='confirmed'&&next.phase==='rejected'||old.phase==='rejected'&&next.phase==='confirmed'||old.ack&&!equal(old.ack,next.ack)||old.rejectionCode!==null&&old.rejectionCode!==next.rejectionCode))throw Error('Company file checkpoint changed');
}
export async function mergeCompanyFileWrite(a:CompanyFileWrite,b:CompanyFileWrite|null){a=await validateCompanyFileWrite(a,a.accountId);if(!b)return a;b=await validateCompanyFileWrite(b,a.accountId);if(order[a.phase]>=order[b.phase]){assertCompanyFileAdvance(b,a);return a;}assertCompanyFileAdvance(a,b);return b;}
export class CompanyFileWriteFailure extends Error{constructor(readonly kind:'scope'|'storage'|'uncertain'|'read',readonly attempt:CompanyFileWrite,readonly permissionStatus?:403|404){super(kind);}}
export class CompanyFileBusyError extends Error{}
type Locks=Pick<LockManager,'request'>;const verified=new WeakSet<CompanyFileWrite>(),denied=new WeakSet<CompanyFileWriteFailure>();
async function lock<T>(actor:string,locks:Locks|undefined,run:()=>Promise<T>){if(!locks)throw new CompanyFileBusyError('unavailable');return locks.request(companyFileWriteKey(actor)+':lock',{mode:'exclusive',ifAvailable:true},async held=>{if(!held)throw new CompanyFileBusyError('busy');return run();});}
export async function stageCompanyFileWrite(store:CompanyFileStore,record:CompanyFileWrite,locks:Locks|undefined=globalThis.navigator?.locks){return lock(record.accountId,locks,async()=>{const parsed=await validateCompanyFileWrite(record,record.accountId);if(parsed.phase!=='ready')throw Error('Only fresh company file writes may be staged');await store.advance(parsed);return parsed;});}
export async function clearCompanyFileWrite(store:CompanyFileStore,record:CompanyFileWrite,locks:Locks|undefined=globalThis.navigator?.locks){return lock(record.accountId,locks,async()=>{if(record.phase==='uncertain'||record.phase==='confirmed'&&!verified.has(record))throw Error('Company file result is unresolved');await store.remove(record);});}
export async function archiveCompanyFileWrite(store:CompanyFileStore,record:CompanyFileWrite,error:CompanyFileWriteFailure,locks:Locks|undefined=globalThis.navigator?.locks){return lock(record.accountId,locks,async()=>{if(!denied.has(error)||!equal(error.attempt,record))throw Error('Observed permission denial required');await store.archive(record);denied.delete(error);});}
type Continuation={status:'confirmed';attempt:CompanyFileWrite;result:CompanyFileResult}|{status:'missing';attempt:CompanyFileWrite;result:null}|{status:'rejected';attempt:CompanyFileWrite;result:null;code:number};
export async function continueCompanyFileWrite({store,attempt:initial,request,currentAccount,mode,onCheckpoint,locks=globalThis.navigator?.locks}:{store:CompanyFileStore;attempt:CompanyFileWrite;request:(url:string,init?:RequestInit)=>Promise<Response>;currentAccount:()=>string|undefined;mode:'check'|'retry';onCheckpoint:(record:CompanyFileWrite)=>void;locks?:Locks}):Promise<Continuation>{
 return lock(initial.accountId,locks,async()=>{
  let attempt=parseCompanyFileWrite(initial,initial.accountId);const scope=()=>{if(currentAccount()!==attempt.accountId)throw new CompanyFileWriteFailure('scope',attempt);};scope();
  try{attempt=await mergeCompanyFileWrite(attempt,await store.read(attempt.accountId));}catch{throw new CompanyFileWriteFailure('storage',attempt);}scope();
  const checkpoint=async(next:CompanyFileWrite)=>{attempt=next;scope();try{await store.advance(attempt);scope();onCheckpoint(attempt);}catch(error){if(error instanceof CompanyFileWriteFailure)throw error;throw new CompanyFileWriteFailure('storage',attempt);}};
  await checkpoint(attempt);const headers={'X-Pro-Expected-Actor':attempt.accountId},input=companyFileMutationSchema.parse(JSON.parse(attempt.body));
  const denial=(kind:'read'|'uncertain',status:number)=>{const error=new CompanyFileWriteFailure(kind,attempt,status===403||status===404?status:undefined);if(error.permissionStatus)denied.add(error);return error;};
  if(attempt.phase==='rejected')return{status:'rejected',attempt,result:null,code:attempt.rejectionCode!};
  if(mode==='retry'&&attempt.phase!=='confirmed'){
   const fresh=attempt.phase==='ready';await checkpoint({...attempt,phase:'uncertain'});scope();let response:Response;
   try{response=await request('/api/pro/company-files',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:attempt.body});}catch{throw new CompanyFileWriteFailure('uncertain',attempt);}scope();
   if(fresh&&rejections.includes(response.status)){await checkpoint({...attempt,phase:'rejected',rejectionCode:response.status});return{status:'rejected',attempt,result:null,code:response.status};}
   if(!response.ok)throw denial('uncertain',response.status);
   try{const result=companyFileResultSchema.parse(await response.json());scope();if(!matches(attempt,result))throw Error();await checkpoint({...attempt,phase:'confirmed',ack:result});}catch(error){if(error instanceof CompanyFileWriteFailure)throw error;throw new CompanyFileWriteFailure('uncertain',attempt);}
  }
  try{
   const proof=await request('/api/pro/company-files?'+new URLSearchParams({view:'action',actionId:input.actionId}),{cache:'no-store',headers});scope();if(!proof.ok)throw denial('read',proof.status);
   const {receipt}=companyFileReceiptSchema.parse(await proof.json());scope();if(!receipt){if(attempt.phase==='confirmed')throw Error('Company file receipt disappeared');return{status:'missing',attempt,result:null};}
   if(receipt.inputHash!==attempt.inputHash||!matches(attempt,receipt.result)||attempt.ack&&!equal(attempt.ack,receipt.result))throw Error('Company file proof mismatch');
   if(attempt.phase!=='confirmed')await checkpoint({...attempt,phase:'confirmed',ack:receipt.result});
   if(receipt.result.action==='upload'||receipt.result.action==='copy'){
    const file=receipt.result.action==='copy'?receipt.result.copy.file:receipt.result.file,url=receipt.result.action==='copy'?'/api/pro/work-files?'+new URLSearchParams({fileId:file.id}):'/api/pro/company-files?'+new URLSearchParams({view:'binary',fileId:file.id});
    const binary=await request(url,{cache:'no-store',headers});scope();if(!binary.ok)throw denial('read',binary.status);const bytes=await readWorkFileBinary(binary,file);scope();
    if(input.action==='upload'&&file.mimeType==='application/pdf'){const raw=bytesFromBase64(input.data),actual=new Uint8Array(bytes);if(raw.length!==bytes.byteLength||!raw.every((b,i)=>b===actual[i]))throw Error('Uploaded PDF bytes changed');}
   }
   verified.add(attempt);return{status:'confirmed',attempt,result:receipt.result};
  }catch(error){if(error instanceof CompanyFileWriteFailure)throw error;throw new CompanyFileWriteFailure('read',attempt);}
 });
}
