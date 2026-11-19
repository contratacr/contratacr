import {z} from 'zod';
import {createDailyLogWrite,parseDailyLogWrite,type DailyLogWrite} from './daily-log-recovery';
import {type DailyLog} from './daily-logs';
import {dailyLogFilesPublishSchema,dailyLogFileResultSchema,dailyLogFileReceiptSchema,dailyLogFileSchema,canonicalDailyLogFileInput,type DailyLogFile,type DailyLogFileResult} from './daily-log-files';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Locks=Pick<LockManager,'request'>;
const schema=z.object({version:z.literal(1),accountId:z.string().uuid(),body:z.string().max(128*1024),inputHash:z.string().regex(/^[a-f0-9]{64}$/),legacy:z.unknown(),files:z.array(dailyLogFileSchema).max(40),phase:z.enum(['ready','uncertain','confirmed','rejected']),ack:dailyLogFileResultSchema.nullable(),rejectionCode:z.number().nullable()}).strict();
export type DailyLogFilePublication=Omit<z.infer<typeof schema>,'legacy'>&{legacy:DailyLogWrite};
export const dailyLogFilePublicationKey=(actor:string)=>'ccr:pro:daily-log-file-publication:v1:'+z.string().uuid().parse(actor);
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b),rejections=[400,403,404,409,413,415,422],verified=new WeakSet<DailyLogFilePublication>(),denied=new WeakSet<DailyLogFilePublicationFailure>();
const digest=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
function matches(record:DailyLogFilePublication,result:DailyLogFileResult){
 if(result.action!=='publish')return false;
 try{parseDailyLogWrite({...record.legacy,phase:'confirmed',ack:result.publication},record.accountId);}catch{return false;}
 const input=dailyLogFilesPublishSchema.parse(JSON.parse(record.body));
 for(const channel of ['client','team'] as const){
  const expected=input.files[channel].map(ref=>{const f=record.files.find(f=>f.id===ref.id)!;return{id:f.id,name:f.name,mimeType:f.mimeType,sizeBytes:f.sizeBytes,sha256:f.sha256,createdAt:f.createdAt};}).sort((a,b)=>a.id.localeCompare(b.id));
  const actual=[...result.files[channel]].sort((a,b)=>a.id.localeCompare(b.id));if(!equal(expected,actual))return false;
 }
 return true;
}
export function parseDailyLogFilePublication(value:unknown,actor:string):DailyLogFilePublication{
 const raw=schema.parse(value),legacy=parseDailyLogWrite(raw.legacy,actor),record={...raw,legacy};
 const input=dailyLogFilesPublishSchema.parse(JSON.parse(record.body)),{files:selection,...old}=input;
 if(record.accountId!==actor||record.legacy.accountId!==actor||record.legacy.phase!=='ready'||JSON.stringify(input)!==record.body||JSON.stringify(old)!==legacy.body||(record.phase==='confirmed')!==(record.ack!==null)||(record.phase==='rejected')!==(record.rejectionCode!==null)||record.rejectionCode!==null&&!rejections.includes(record.rejectionCode)||new Set(record.files.map(f=>f.id)).size!==record.files.length)throw Error('Invalid daily log publication');
 const refs=[...selection.client,...selection.team],ids=new Set(refs.map(f=>f.id));
 if(ids.size!==record.files.length||record.files.some(f=>!ids.has(f.id)||!f.ready||f.ownerId!==actor||f.workId!==input.workId||f.logId!==input.logId)||refs.some(ref=>!record.files.some(f=>f.id===ref.id&&f.sha256===ref.sha256))||record.ack&&!matches(record,record.ack))throw Error('Daily log publication files changed');
 return record;
}
export async function validateDailyLogFilePublication(value:unknown,actor:string){const record=parseDailyLogFilePublication(value,actor);if(await digest(canonicalDailyLogFileInput(dailyLogFilesPublishSchema.parse(JSON.parse(record.body))))!==record.inputHash)throw Error('Daily log publication checksum changed');return record;}
export async function createDailyLogFilePublication(actor:string,input:z.infer<typeof dailyLogFilesPublishSchema>,baseline:DailyLog,selectedFiles:DailyLogFile[]){
 const parsed=dailyLogFilesPublishSchema.parse(input),{files,...legacy}=parsed;
 void files;
 return validateDailyLogFilePublication({version:1,accountId:actor,body:JSON.stringify(parsed),inputHash:await digest(canonicalDailyLogFileInput(parsed)),legacy:createDailyLogWrite(actor,legacy,baseline),files:selectedFiles,phase:'ready',ack:null,rejectionCode:null},actor);
}
export function readDailyLogFilePublication(store:Store,actor:string){const raw=store.getItem(dailyLogFilePublicationKey(actor));if(raw===null)return null;if(raw.length>4*1024*1024)throw Error('Publication journal too large');return parseDailyLogFilePublication(JSON.parse(raw),actor);}
function merge(a:DailyLogFilePublication,b:DailyLogFilePublication|null){
 if(!b)return a;const order={ready:0,uncertain:1,confirmed:2,rejected:2};
 if(!equal({...a,phase:null,ack:null,rejectionCode:null},{...b,phase:null,ack:null,rejectionCode:null})||a.ack&&b.ack&&!equal(a.ack,b.ack)||a.rejectionCode!==null&&b.rejectionCode!==null&&a.rejectionCode!==b.rejectionCode||a.phase==='confirmed'&&b.phase==='rejected'||a.phase==='rejected'&&b.phase==='confirmed')throw Error('Publication journal collision');
 return order[b.phase]>order[a.phase]?b:a;
}
function save(store:Store,record:DailyLogFilePublication){const old=readDailyLogFilePublication(store,record.accountId);if(!equal(merge(record,old),record))throw Error('Publication checkpoint moved backwards');const raw=JSON.stringify(record),key=dailyLogFilePublicationKey(record.accountId);store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Publication checkpoint not retained');}
async function locked<T>(actor:string,run:()=>Promise<T>,locks:Locks|undefined){if(!locks)throw Error('Publication locking unavailable');return locks.request(dailyLogFilePublicationKey(actor)+':lock',{mode:'exclusive',ifAvailable:true},held=>{if(!held)throw Error('Publication is busy');return run();});}
export class DailyLogFilePublicationFailure extends Error{constructor(readonly kind:'scope'|'storage'|'uncertain'|'read',readonly attempt:DailyLogFilePublication,readonly permissionStatus?:403|404){super(kind);}}
export async function continueDailyLogFilePublication({store,attempt:initial,request,currentAccount,mode,onCheckpoint,locks=globalThis.navigator?.locks}:{store:Store;attempt:DailyLogFilePublication;request:(url:string,init?:RequestInit)=>Promise<Response>;currentAccount:()=>string|undefined;mode:'check'|'retry';onCheckpoint:(r:DailyLogFilePublication)=>void;locks?:Locks}){return locked(initial.accountId,async()=>{
 let attempt=await validateDailyLogFilePublication(initial,initial.accountId);
 const scope=()=>{if(currentAccount()!==attempt.accountId)throw new DailyLogFilePublicationFailure('scope',attempt);};scope();
 try{const disk=readDailyLogFilePublication(store,attempt.accountId);attempt=merge(attempt,disk);}catch{throw new DailyLogFilePublicationFailure('storage',attempt);}
 const checkpoint=(next:DailyLogFilePublication)=>{attempt=next;scope();try{save(store,attempt);scope();onCheckpoint(attempt);}catch(e){if(e instanceof DailyLogFilePublicationFailure)throw e;throw new DailyLogFilePublicationFailure('storage',attempt);}};
 checkpoint(attempt);const headers={'X-Pro-Expected-Actor':attempt.accountId},input=dailyLogFilesPublishSchema.parse(JSON.parse(attempt.body));
 let observed:DailyLogFileResult|null=null;
 const failure=(kind:'read'|'uncertain',code:number)=>{const error=new DailyLogFilePublicationFailure(kind,attempt,code===403||code===404?code:undefined);if(error.permissionStatus)denied.add(error);return error;};
 if(attempt.phase==='rejected')return{status:'rejected' as const,attempt,result:null,code:attempt.rejectionCode!};
 if(mode==='retry'&&attempt.phase!=='confirmed'){
  const fresh=attempt.phase==='ready';checkpoint({...attempt,phase:'uncertain'});let response:Response;
  try{response=await request('/api/pro/daily-log-files',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:attempt.body});}catch{throw new DailyLogFilePublicationFailure('uncertain',attempt);}scope();
  if(fresh&&rejections.includes(response.status)){checkpoint({...attempt,phase:'rejected',rejectionCode:response.status});return{status:'rejected' as const,attempt,result:null,code:response.status};}
  if(!response.ok)throw failure('uncertain',response.status);
  try{const result=dailyLogFileResultSchema.parse(await response.json());scope();if(!matches(attempt,result))throw Error();observed=result;}catch(e){if(e instanceof DailyLogFilePublicationFailure)throw e;throw new DailyLogFilePublicationFailure('uncertain',attempt);}
 }
 try{const response=await request('/api/pro/daily-log-files?'+new URLSearchParams({view:'action',actionId:input.actionId}),{cache:'no-store',headers});scope();if(!response.ok)throw failure('read',response.status);
  const {receipt}=dailyLogFileReceiptSchema.parse(await response.json());scope();if(!receipt){if(attempt.phase==='confirmed')throw Error('Publication receipt disappeared');return{status:'missing' as const,attempt,result:null};}
  if(receipt.inputHash!==attempt.inputHash||!matches(attempt,receipt.result)||attempt.ack&&!equal(attempt.ack,receipt.result)||observed&&!equal(observed,receipt.result))throw Error('Publication proof changed');
  if(attempt.phase!=='confirmed')checkpoint({...attempt,phase:'confirmed',ack:receipt.result});verified.add(attempt);return{status:'confirmed' as const,attempt,result:receipt.result};
 }catch(e){if(e instanceof DailyLogFilePublicationFailure)throw e;throw new DailyLogFilePublicationFailure('read',attempt);}
},locks);}
export async function clearDailyLogFilePublication(store:Store,attempt:DailyLogFilePublication,locks:Locks|undefined=globalThis.navigator?.locks){return locked(attempt.accountId,async()=>{
 if(attempt.phase==='uncertain'||attempt.phase==='confirmed'&&!verified.has(attempt)||!equal(readDailyLogFilePublication(store,attempt.accountId),attempt))throw Error('Publication result unresolved');
 const key=dailyLogFilePublicationKey(attempt.accountId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Publication journal not removed');
},locks);}
export async function archiveDailyLogFilePublication(store:Store,attempt:DailyLogFilePublication,error:DailyLogFilePublicationFailure,locks:Locks|undefined=globalThis.navigator?.locks){return locked(attempt.accountId,async()=>{
 if(!denied.has(error)||!equal(error.attempt,attempt)||!equal(readDailyLogFilePublication(store,attempt.accountId),attempt))throw Error('Current publication permission denial required');
 const key=dailyLogFilePublicationKey(attempt.accountId),input=dailyLogFilesPublishSchema.parse(JSON.parse(attempt.body)),archive=key+':archived:'+input.actionId,raw=JSON.stringify(attempt),prior=store.getItem(archive);
 if(prior!==null&&prior!==raw)throw Error('Publication archive collision');store.setItem(archive,raw);if(store.getItem(archive)!==raw)throw Error('Publication archive not retained');store.removeItem(key);if(store.getItem(key)!==null)throw Error('Publication archive incomplete');denied.delete(error);
},locks);}
