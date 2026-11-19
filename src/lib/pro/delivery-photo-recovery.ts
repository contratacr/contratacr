import {z} from 'zod';
import {deliveryMutationSchema,type DeliveryView} from './work-delivery';
import {deliveryViewSchema} from './delivery-write-recovery';
export const DELIVERY_PHOTO_LIMIT=3*1024*1024;
const scopeSchema=z.object({accountId:z.string().uuid(),workId:z.string().min(1).max(160)}).strict();
export type DeliveryPhotoScope=z.infer<typeof scopeSchema>;
const ackSchema=z.object({id:z.string().uuid(),ready:z.literal(true)}).strict();
const photoSchema=z.object({
 schemaVersion:z.literal(1),accountId:scopeSchema.shape.accountId,workId:scopeSchema.shape.workId,
 actionId:z.string().uuid(),name:z.string().trim().min(1).max(160),mime:z.enum(['image/jpeg','image/png','image/webp']),
 byteLength:z.number().int().min(1).max(DELIVERY_PHOTO_LIMIT),rawSha256:z.string().regex(/^[a-f0-9]{64}$/),bodySha256:z.string().regex(/^[a-f0-9]{64}$/),
 phase:z.enum(['ready','uncertain','confirmed']),ack:ackSchema.nullable(),bytes:z.instanceof(ArrayBuffer),
}).strict();
export type DeliveryPhotoWrite=z.infer<typeof photoSchema>;
export interface DeliveryPhotoStore{
 read(scope:DeliveryPhotoScope):Promise<DeliveryPhotoWrite|null>;
 advance(value:DeliveryPhotoWrite):Promise<void>;
 remove(expected:DeliveryPhotoWrite):Promise<void>;
}
const phaseOrder={ready:0,uncertain:1,confirmed:2},api='/api/pro/work-delivery';
export function parseDeliveryPhotoWrite(value:unknown,scope:DeliveryPhotoScope):DeliveryPhotoWrite{
 const record=photoSchema.parse(value),expected=scopeSchema.parse(scope);
 if(record.accountId!==expected.accountId||record.workId!==expected.workId||record.bytes.byteLength!==record.byteLength||(record.phase==='confirmed')!==(record.ack!==null)||record.ack&&record.ack.id!==record.actionId)throw Error('Invalid photo recovery scope');
 return record;
}
function base64(bytes:ArrayBuffer){
 const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',data=new Uint8Array(bytes),parts:string[]=[];
 for(let offset=0;offset<data.length;offset+=12288){let part='';const end=Math.min(offset+12288,data.length);for(let i=offset;i<end;i+=3){const a=data[i],b=data[i+1]??0,c=data[i+2]??0;part+=chars[a>>2]+chars[((a&3)<<4)|(b>>4)]+(i+1<data.length?chars[((b&15)<<2)|(c>>6)]:'=')+(i+2<data.length?chars[c&63]:'=');}parts.push(part);}
 return parts.join('');
}
export function deliveryPhotoBody(value:DeliveryPhotoWrite){
 const record=parseDeliveryPhotoWrite(value,{accountId:value.accountId,workId:value.workId});
 return JSON.stringify(deliveryMutationSchema.options[3].parse({action:'photo',workId:record.workId,actionId:record.actionId,name:record.name,data:base64(record.bytes)}));
}
async function sha256(bytes:ArrayBuffer){return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');}
export async function validateDeliveryPhotoWrite(value:unknown,scope:DeliveryPhotoScope):Promise<DeliveryPhotoWrite>{
 const parsed=parseDeliveryPhotoWrite(value,scope),record={...parsed,bytes:parsed.bytes.slice(0)};
 if(await sha256(record.bytes)!==record.rawSha256||await sha256(new TextEncoder().encode(deliveryPhotoBody(record)).buffer)!==record.bodySha256)throw Error('Photo recovery checksum mismatch');
 return record;
}
export async function createDeliveryPhotoWrite(scope:DeliveryPhotoScope,file:{name:string;type:string;bytes:ArrayBuffer},actionId:string):Promise<DeliveryPhotoWrite>{
 const actor=scopeSchema.parse(scope),bytes=file.bytes.slice(0),base={schemaVersion:1 as const,...actor,actionId,name:file.name.trim().slice(0,160)||'Photo',mime:file.type,byteLength:bytes.byteLength,rawSha256:await sha256(bytes),bodySha256:'0'.repeat(64),phase:'ready' as const,ack:null,bytes};
 const record=parseDeliveryPhotoWrite(base,actor);record.bodySha256=await sha256(new TextEncoder().encode(deliveryPhotoBody(record)).buffer);return record;
}
/** Synchronous so adapters can compare inside one live IndexedDB transaction. */
export function sameDeliveryPhotoIntent(left:DeliveryPhotoWrite,right:DeliveryPhotoWrite){
 const metadata=(value:DeliveryPhotoWrite)=>JSON.stringify({accountId:value.accountId,workId:value.workId,actionId:value.actionId,name:value.name,mime:value.mime,byteLength:value.byteLength,rawSha256:value.rawSha256,bodySha256:value.bodySha256});
 if(metadata(left)!==metadata(right)||left.bytes.byteLength!==right.bytes.byteLength)return false;
 const a=new Uint8Array(left.bytes),b=new Uint8Array(right.bytes);for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;
}
export function assertDeliveryPhotoAdvance(prior:DeliveryPhotoWrite|null,next:DeliveryPhotoWrite){
 if(prior&&(!sameDeliveryPhotoIntent(prior,next)||phaseOrder[prior.phase]>phaseOrder[next.phase]||prior.ack&&JSON.stringify(prior.ack)!==JSON.stringify(next.ack)))throw Error('Another photo recovery attempt exists');
}
export async function mergeDeliveryPhotoWrite(memory:DeliveryPhotoWrite,stored:DeliveryPhotoWrite|null){
 const scope={accountId:memory.accountId,workId:memory.workId},current=await validateDeliveryPhotoWrite(memory,scope);if(!stored)return current;
 const disk=await validateDeliveryPhotoWrite(stored,scope);if(!sameDeliveryPhotoIntent(current,disk)||current.ack&&disk.ack&&JSON.stringify(current.ack)!==JSON.stringify(disk.ack))throw Error('Photo recovery changed');return phaseOrder[disk.phase]>phaseOrder[current.phase]?disk:current;
}
export class DeliveryPhotoFailure extends Error{
 kind:'storage'|'uncertain'|'read'|'scope';attempt:DeliveryPhotoWrite;
 constructor(kind:DeliveryPhotoFailure['kind'],attempt:DeliveryPhotoWrite){super(kind);this.kind=kind;this.attempt=attempt;}
}
async function readableJpeg(response:Response){
 if(!response.ok||response.headers.get('content-type')?.split(';')[0].trim()!=='image/jpeg'||Number(response.headers.get('content-length')??0)>2097152||!response.body)throw Error('Photo not available');
 const reader=response.body.getReader(),first:number[]=[];let size=0,previous=-1,last=-1;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2097152){await reader.cancel();throw Error('Photo exceeds expected size');}for(const byte of part.value){if(first.length<2)first.push(byte);previous=last;last=byte;}}}finally{reader.releaseLock();}
 if(size<4||first[0]!==255||first[1]!==216||previous!==255||last!==217)throw Error('Invalid canonical JPEG');
}
/** No automatic retry; callers only remove the exact attempt after adopting the verified view. */
export async function continueDeliveryPhotoWrite({store,attempt:initial,request,currentAccount,currentWork,onCheckpoint}:{store:DeliveryPhotoStore;attempt:DeliveryPhotoWrite;request:(url:string,init?:RequestInit)=>Promise<Response>;currentAccount:()=>string|undefined;currentWork:()=>string|undefined;onCheckpoint:(attempt:DeliveryPhotoWrite)=>void}):Promise<{status:'confirmed';attempt:DeliveryPhotoWrite;view:DeliveryView}|{status:'rejected';attempt:DeliveryPhotoWrite;code:number}>{
 let attempt=parseDeliveryPhotoWrite(initial,{accountId:initial.accountId,workId:initial.workId});
 const scope=()=>{if(currentAccount()!==attempt.accountId||currentWork()!==attempt.workId)throw new DeliveryPhotoFailure('scope',attempt);};
 scope();try{attempt=await validateDeliveryPhotoWrite(attempt,{accountId:attempt.accountId,workId:attempt.workId});}catch{throw new DeliveryPhotoFailure('storage',attempt);}scope();
 const checkpoint=async(next:DeliveryPhotoWrite)=>{attempt=next;scope();try{onCheckpoint(attempt);await store.advance(attempt);}catch(error){if(error instanceof DeliveryPhotoFailure)throw error;throw new DeliveryPhotoFailure('storage',attempt);}scope();};
 await checkpoint(attempt);
 const headers={'X-Pro-Expected-Actor':attempt.accountId};
 if(attempt.phase!=='confirmed'){
  const recovering=attempt.phase==='uncertain';await checkpoint({...attempt,phase:'uncertain'});let response:Response;
  try{response=await request(api,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:deliveryPhotoBody(attempt)});}catch{throw new DeliveryPhotoFailure('uncertain',attempt);}scope();
  if(!response.ok){
   if(!recovering&&[400,404,409,413,415,422,429].includes(response.status)){try{await store.remove(attempt);}catch{throw new DeliveryPhotoFailure('storage',attempt);}scope();return {status:'rejected',attempt,code:response.status};}
   throw new DeliveryPhotoFailure('uncertain',attempt);
  }
  let ack:z.infer<typeof ackSchema>;try{ack=ackSchema.parse(await response.json());if(ack.id!==attempt.actionId)throw Error();}catch{throw new DeliveryPhotoFailure('uncertain',attempt);}scope();await checkpoint({...attempt,phase:'confirmed',ack});
 }
 scope();try{
  const response=await request(api+'?'+new URLSearchParams({workId:attempt.workId}),{cache:'no-store',headers});scope();if(!response.ok)throw Error();const view=deliveryViewSchema.parse(await response.json());scope();
  if(view.side!=='provider'||view.workId!==attempt.workId||!view.photos.some(photo=>photo.id===attempt.actionId&&photo.name===attempt.name&&photo.ready))throw Error('Canonical photo metadata mismatch');
  const file=await request(api+'?'+new URLSearchParams({photo:attempt.actionId}),{cache:'no-store',headers});scope();await readableJpeg(file);scope();return {status:'confirmed',attempt,view};
 }catch(error){if(error instanceof DeliveryPhotoFailure)throw error;throw new DeliveryPhotoFailure('read',attempt);}
}
