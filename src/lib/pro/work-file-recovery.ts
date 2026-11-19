import {z} from 'zod';
import {workFileSchema,workFileUploadSchema,workFilePublishSchema,workFileDetailSchema,canonicalWorkFileName,type WorkFile} from './work-files';
import {PRO_FILE_MAX_BYTES} from './file-limit';
export const WORK_FILE_UPLOAD_LIMIT=PRO_FILE_MAX_BYTES;
const hash=z.string().regex(/^[a-f0-9]{64}$/),scopeSchema=z.object({accountId:z.string().uuid(),workId:z.string().min(1).max(160)}).strict();
export type WorkFileScope=z.infer<typeof scopeSchema>;
const common={schemaVersion:z.literal(1),accountId:scopeSchema.shape.accountId,workId:scopeSchema.shape.workId,fileId:z.string().uuid(),bodySha256:hash,phase:z.enum(['ready','uncertain','confirmed']),ack:workFileSchema.nullable()};
const uploadSchema=z.object({...common,kind:z.literal('upload'),name:z.string().trim().min(1).max(160),mime:z.enum(['image/jpeg','image/png','image/webp','application/pdf']),byteLength:z.number().int().positive().max(WORK_FILE_UPLOAD_LIMIT),rawSha256:hash,bytes:z.instanceof(ArrayBuffer)}).strict();
const publishSchema=z.object({...common,kind:z.literal('publish'),body:z.string().min(1).max(2000),baseline:workFileSchema,recipient:z.object({id:z.string().uuid(),name:z.string().min(1).max(160)}).strict()}).strict();
const recordSchema=z.discriminatedUnion('kind',[uploadSchema,publishSchema]);
export type WorkFileWrite=z.infer<typeof recordSchema>;
export interface WorkFileStore{read(scope:WorkFileScope):Promise<WorkFileWrite|null>;advance(value:WorkFileWrite):Promise<void>;remove(expected:WorkFileWrite):Promise<void>;}
const phaseOrder={ready:0,uncertain:1,confirmed:2},api='/api/pro/work-files';
function sameContent(a:WorkFile,b:WorkFile){return a.id===b.id&&a.workId===b.workId&&a.name===b.name&&a.mimeType===b.mimeType&&a.sizeBytes===b.sizeBytes&&a.sha256===b.sha256&&a.createdAt===b.createdAt&&a.ready===b.ready;}
function matchesAcknowledgement(record:WorkFileWrite,file:WorkFile){
 if(file.id!==record.fileId||file.workId!==record.workId||!file.ready)return false;
 if(record.kind==='upload'){const bytes=new Uint8Array(record.bytes),mimeType=bytes.length>=5&&bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45?'application/pdf':'image/jpeg';return file.revision===1&&file.publishedAt===null&&file.mimeType===mimeType&&file.name===canonicalWorkFileName(record.name,mimeType)&&file.sizeBytes<=(mimeType==='application/pdf'?WORK_FILE_UPLOAD_LIMIT:PRO_FILE_MAX_BYTES)&&(mimeType!=='application/pdf'||file.sha256===record.rawSha256&&file.sizeBytes===record.byteLength);}
 return sameContent(file,record.baseline)&&file.revision===2&&file.publishedAt!==null;
}
export function parseWorkFileWrite(value:unknown,scope:WorkFileScope):WorkFileWrite{
 const record=recordSchema.parse(value),expected=scopeSchema.parse(scope);
 if(record.accountId!==expected.accountId||record.workId!==expected.workId||(record.phase==='confirmed')!==(record.ack!==null)||record.ack&&!matchesAcknowledgement(record,record.ack))throw Error('Invalid file recovery scope');
 if(record.kind==='upload'){if(record.bytes.byteLength!==record.byteLength)throw Error('Invalid file recovery bytes');}
 else{const body=workFilePublishSchema.parse(JSON.parse(record.body));if(JSON.stringify(body)!==record.body||body.fileId!==record.fileId||body.workId!==record.workId||body.recipientId!==record.recipient.id||record.baseline.id!==record.fileId||record.baseline.workId!==record.workId||!record.baseline.ready||record.baseline.revision!==1||record.baseline.publishedAt!==null)throw Error('Invalid file publication context');}
 return record;
}
function base64(bytes:ArrayBuffer){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',data=new Uint8Array(bytes),parts:string[]=[];for(let offset=0;offset<data.length;offset+=12288){let part='';const end=Math.min(offset+12288,data.length);for(let i=offset;i<end;i+=3){const a=data[i],b=data[i+1]??0,c=data[i+2]??0;part+=chars[a>>2]+chars[((a&3)<<4)|(b>>4)]+(i+1<data.length?chars[((b&15)<<2)|(c>>6)]:'=')+(i+2<data.length?chars[c&63]:'=');}parts.push(part);}return parts.join('');}
export function workFileBody(value:WorkFileWrite){const record=parseWorkFileWrite(value,{accountId:value.accountId,workId:value.workId});return record.kind==='publish'?record.body:JSON.stringify(workFileUploadSchema.parse({action:'upload',fileId:record.fileId,workId:record.workId,name:record.name,data:base64(record.bytes)}));}
async function sha256(bytes:ArrayBuffer){return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');}
export async function validateWorkFileWrite(value:unknown,scope:WorkFileScope):Promise<WorkFileWrite>{const parsed=parseWorkFileWrite(value,scope),record=parsed.kind==='upload'?{...parsed,bytes:parsed.bytes.slice(0)}:parsed;if(record.kind==='upload'&&await sha256(record.bytes)!==record.rawSha256||await sha256(new TextEncoder().encode(workFileBody(record)).buffer)!==record.bodySha256)throw Error('File recovery checksum mismatch');return record;}
export async function createWorkFileUpload(scope:WorkFileScope,file:{name:string;type:string;bytes:ArrayBuffer},fileId:string):Promise<WorkFileWrite>{const actor=scopeSchema.parse(scope),bytes=file.bytes.slice(0),base={schemaVersion:1 as const,...actor,fileId,kind:'upload' as const,name:file.name.trim().slice(0,160).replace(/[\uD800-\uDBFF]$/u,'')||'Archivo',mime:file.type,byteLength:bytes.byteLength,rawSha256:await sha256(bytes),bodySha256:'0'.repeat(64),phase:'ready' as const,ack:null,bytes};const record=parseWorkFileWrite(base,actor);record.bodySha256=await sha256(new TextEncoder().encode(workFileBody(record)).buffer);return record;}
export async function createWorkFilePublish(scope:WorkFileScope,baseline:WorkFile,recipient:{id:string;name:string},actionId:string):Promise<WorkFileWrite>{const actor=scopeSchema.parse(scope),body=JSON.stringify(workFilePublishSchema.parse({action:'publish',fileId:baseline.id,workId:actor.workId,actionId,revision:1,recipientId:recipient.id}));return validateWorkFileWrite({schemaVersion:1,...actor,fileId:baseline.id,kind:'publish',body,baseline,recipient,bodySha256:await sha256(new TextEncoder().encode(body).buffer),phase:'ready',ack:null},actor);}
/** Sync comparisons stay inside a single live IDB transaction. */
export function sameWorkFileIntent(a:WorkFileWrite,b:WorkFileWrite){
 const meta=(record:WorkFileWrite)=>JSON.stringify(record.kind==='upload'?{kind:record.kind,accountId:record.accountId,workId:record.workId,fileId:record.fileId,name:record.name,mime:record.mime,byteLength:record.byteLength,rawSha256:record.rawSha256,bodySha256:record.bodySha256}:{kind:record.kind,accountId:record.accountId,workId:record.workId,fileId:record.fileId,body:record.body,baseline:record.baseline,recipient:record.recipient,bodySha256:record.bodySha256});
 if(meta(a)!==meta(b))return false;if(a.kind==='upload'&&b.kind==='upload'){if(a.bytes.byteLength!==b.bytes.byteLength)return false;const left=new Uint8Array(a.bytes),right=new Uint8Array(b.bytes);for(let i=0;i<left.length;i++)if(left[i]!==right[i])return false;}return true;
}
export function assertWorkFileAdvance(prior:WorkFileWrite|null,next:WorkFileWrite){if(prior&&(!sameWorkFileIntent(prior,next)||phaseOrder[prior.phase]>phaseOrder[next.phase]||prior.ack&&JSON.stringify(prior.ack)!==JSON.stringify(next.ack)))throw Error('Another file attempt exists');}
export async function mergeWorkFileWrite(memory:WorkFileWrite,stored:WorkFileWrite|null){const scope={accountId:memory.accountId,workId:memory.workId},current=await validateWorkFileWrite(memory,scope);if(!stored)return current;const disk=await validateWorkFileWrite(stored,scope);if(!sameWorkFileIntent(current,disk)||current.ack&&disk.ack&&JSON.stringify(current.ack)!==JSON.stringify(disk.ack))throw Error('File attempt changed');return phaseOrder[disk.phase]>phaseOrder[current.phase]?disk:current;}
export class WorkFileWriteFailure extends Error{constructor(readonly kind:'scope'|'storage'|'uncertain'|'read',readonly attempt:WorkFileWrite){super(kind);}}
/** Authenticated bytes only. No signed URLs, PDF iframe or unbounded body reads. */
export async function readWorkFileBinary(response:Response,file:Pick<WorkFile,'mimeType'|'sizeBytes'|'sha256'>):Promise<ArrayBuffer>{
 const limit=file.mimeType==='application/pdf'?WORK_FILE_UPLOAD_LIMIT:PRO_FILE_MAX_BYTES;
 if(!response.ok||response.headers.get('content-type')?.split(';')[0].trim()!==file.mimeType||!/^attachment(?:;|$)/i.test(response.headers.get('content-disposition')??'')||file.sizeBytes>limit||Number(response.headers.get('content-length')??0)>limit||!response.body)throw Error('File unavailable');
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit||size>file.sizeBytes){await reader.cancel();throw Error('File exceeds expected size');}parts.push(part.value);}}finally{reader.releaseLock();}
 if(size!==file.sizeBytes)throw Error('File size mismatch');const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}if(await sha256(bytes.buffer)!==file.sha256)throw Error('File checksum mismatch');return bytes.buffer;
}
/** No automatic retry. A confirmed upload or publication only verifies reads. */
export async function continueWorkFileWrite({store,attempt:initial,request,currentAccount,currentWork,onCheckpoint}:{store:WorkFileStore;attempt:WorkFileWrite;request:(url:string,init?:RequestInit)=>Promise<Response>;currentAccount:()=>string|undefined;currentWork:()=>string|undefined;onCheckpoint:(value:WorkFileWrite)=>void}):Promise<{status:'confirmed';attempt:WorkFileWrite;file:WorkFile}|{status:'rejected';attempt:WorkFileWrite;code:number}>{
 let attempt=parseWorkFileWrite(initial,{accountId:initial.accountId,workId:initial.workId});const scope=()=>{if(currentAccount()!==attempt.accountId||currentWork()!==attempt.workId)throw new WorkFileWriteFailure('scope',attempt);};scope();try{attempt=await validateWorkFileWrite(attempt,{accountId:attempt.accountId,workId:attempt.workId});}catch{throw new WorkFileWriteFailure('storage',attempt);}scope();
 const checkpoint=async(value:WorkFileWrite)=>{attempt=value;scope();try{onCheckpoint(attempt);await store.advance(attempt);}catch(cause){if(cause instanceof WorkFileWriteFailure)throw cause;throw new WorkFileWriteFailure('storage',attempt);}scope();};
 await checkpoint(attempt);const headers={'X-Pro-Expected-Actor':attempt.accountId};
 if(attempt.phase!=='confirmed'){
  await checkpoint({...attempt,phase:'uncertain'});let response:Response;
  try{response=await request(api,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:workFileBody(attempt)});}catch{throw new WorkFileWriteFailure('uncertain',attempt);}scope();
  if([400,409,413,415,422].includes(response.status))return{status:'rejected',attempt,code:response.status};if(!response.ok)throw new WorkFileWriteFailure('uncertain',attempt);
  let file:WorkFile;try{file=workFileSchema.parse((await response.json()).file);if(!matchesAcknowledgement(attempt,file))throw Error();}catch{throw new WorkFileWriteFailure('uncertain',attempt);}scope();await checkpoint({...attempt,phase:'confirmed',ack:file});
 }
 scope();try{const response=await request(api+'?'+new URLSearchParams({workId:attempt.workId,fileId:attempt.fileId,metadata:'1'}),{cache:'no-store',headers});scope();if(!response.ok)throw Error();const detail=workFileDetailSchema.parse(await response.json()),file=detail.file;if(!attempt.ack||!sameContent(file,attempt.ack)||file.revision<attempt.ack.revision||file.revision===attempt.ack.revision&&JSON.stringify(file)!==JSON.stringify(attempt.ack))throw Error('Canonical file metadata mismatch');
  const binary=await request(api+'?'+new URLSearchParams({fileId:attempt.fileId}),{cache:'no-store',headers});scope();await readWorkFileBinary(binary,file);scope();return{status:'confirmed',attempt,file};
 }catch(cause){if(cause instanceof WorkFileWriteFailure)throw cause;throw new WorkFileWriteFailure('read',attempt);}
}
