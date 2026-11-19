import {z} from 'zod';
import {deliveryMutationSchema,type DeliveryView} from './work-delivery';
import {deliveryViewSchema} from './delivery-write-recovery';
export const deliveryAcknowledgeInputSchema=deliveryMutationSchema.options[2];
const publicSnapshotSchema=deliveryViewSchema.shape.versions.element.omit({acknowledgedAt:true}).strict();
const ackSchema=z.object({workId:z.string().min(1).max(160),version:z.number().int().positive(),acknowledged:z.literal(true)}).strict();
const recordSchema=z.object({schemaVersion:z.literal(1),accountId:z.string().uuid(),requestId:z.string().uuid(),workId:z.string().min(1).max(160),targetVersion:z.number().int().positive(),snapshot:publicSnapshotSchema,body:z.string().min(1).max(2000),phase:z.enum(['ready','uncertain','confirmed']),ack:ackSchema.nullable()}).strict();
export type DeliveryAcknowledgeWrite=z.infer<typeof recordSchema>;
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Request=(url:string,init?:RequestInit)=>Promise<Response>;
const order={ready:0,uncertain:1,confirmed:2},api='/api/pro/work-delivery';
export const deliveryAcknowledgeKey=(accountId:string,requestId:string)=>'ccr:pro:delivery-acknowledge:v1:'+z.string().uuid().parse(accountId)+':'+z.string().uuid().parse(requestId);
export function parseDeliveryAcknowledgeWrite(value:unknown,accountId:string,requestId:string):DeliveryAcknowledgeWrite{
 const record=recordSchema.parse(value),input=deliveryAcknowledgeInputSchema.parse(JSON.parse(record.body));
 if(record.accountId!==z.string().uuid().parse(accountId)||record.requestId!==z.string().uuid().parse(requestId)||input.requestId!==record.requestId||input.version!==record.targetVersion||record.snapshot.version!==record.targetVersion||JSON.stringify(input)!==record.body||(record.phase==='confirmed')!==(record.ack!==null)||record.ack&&(record.ack.workId!==record.workId||record.ack.version!==record.targetVersion)||JSON.stringify(record).length>32000)throw Error('Invalid report receipt recovery context');
 return record;
}
export function createDeliveryAcknowledgeWrite(accountId:string,inputValue:unknown,viewValue:unknown):DeliveryAcknowledgeWrite{
 const input=deliveryAcknowledgeInputSchema.parse(inputValue),view=deliveryViewSchema.parse(viewValue),target=view.versions.find(row=>row.version===input.version);
 if(view.side!=='client'||view.draft!==null||view.internalNote!==undefined||view.canPublish||!target||target.acknowledgedAt!==null)throw Error('Invalid report receipt context');
 return parseDeliveryAcknowledgeWrite({schemaVersion:1,accountId,requestId:input.requestId,workId:view.workId,targetVersion:input.version,snapshot:publicSnapshotSchema.parse(Object.fromEntries(Object.entries(target).filter(([key])=>key!=='acknowledgedAt'))),body:JSON.stringify(input),phase:'ready',ack:null},accountId,input.requestId);
}
export function readDeliveryAcknowledgeWrite(store:Store,accountId:string,requestId:string):DeliveryAcknowledgeWrite|null{
 const raw=store.getItem(deliveryAcknowledgeKey(accountId,requestId));if(raw===null)return null;if(raw.length>32000)throw Error('Report receipt recovery too large');return parseDeliveryAcknowledgeWrite(JSON.parse(raw),accountId,requestId);
}
export function saveDeliveryAcknowledgeWrite(store:Store,value:DeliveryAcknowledgeWrite){
 const record=parseDeliveryAcknowledgeWrite(value,value.accountId,value.requestId),prior=readDeliveryAcknowledgeWrite(store,record.accountId,record.requestId);
 if(prior&&(prior.body!==record.body||prior.workId!==record.workId||JSON.stringify(prior.snapshot)!==JSON.stringify(record.snapshot)||order[prior.phase]>order[record.phase]||prior.ack&&JSON.stringify(prior.ack)!==JSON.stringify(record.ack)))throw Error('Another report receipt attempt exists');
 const key=deliveryAcknowledgeKey(record.accountId,record.requestId),raw=JSON.stringify(record);store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Report receipt recovery was not retained');
}
export function mergeDeliveryAcknowledgeWrite(memory:DeliveryAcknowledgeWrite,stored:DeliveryAcknowledgeWrite|null){
 const current=parseDeliveryAcknowledgeWrite(memory,memory.accountId,memory.requestId);if(!stored)return current;const disk=parseDeliveryAcknowledgeWrite(stored,current.accountId,current.requestId);
 if(disk.body!==current.body||disk.workId!==current.workId||JSON.stringify(disk.snapshot)!==JSON.stringify(current.snapshot)||disk.ack&&current.ack&&JSON.stringify(disk.ack)!==JSON.stringify(current.ack))throw Error('Report receipt recovery changed');return order[disk.phase]>order[current.phase]?disk:current;
}
export function clearDeliveryAcknowledgeWrite(store:Store,value:DeliveryAcknowledgeWrite){
 const record=parseDeliveryAcknowledgeWrite(value,value.accountId,value.requestId),prior=readDeliveryAcknowledgeWrite(store,record.accountId,record.requestId);if(prior&&JSON.stringify(prior)!==JSON.stringify(record))throw Error('Report receipt recovery changed before clearing');
 const key=deliveryAcknowledgeKey(record.accountId,record.requestId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Report receipt recovery was not cleared');
}
export class DeliveryAcknowledgeFailure extends Error{
 kind:'storage'|'uncertain'|'read'|'scope';attempt:DeliveryAcknowledgeWrite;
 constructor(kind:DeliveryAcknowledgeFailure['kind'],attempt:DeliveryAcknowledgeWrite){super(kind);this.kind=kind;this.attempt=attempt;}
}
/** Reuses the existing receipt. Never invents a receipt date or deduplicates report contents. */
export async function continueDeliveryAcknowledgeWrite({store,attempt:initial,request,currentAccount,currentRequest,currentWork,onCheckpoint}:{store:Store;attempt:DeliveryAcknowledgeWrite;request:Request;currentAccount:()=>string|undefined;currentRequest:()=>string|undefined;currentWork:()=>string|undefined;onCheckpoint:(attempt:DeliveryAcknowledgeWrite)=>void}):Promise<{status:'confirmed';attempt:DeliveryAcknowledgeWrite;view:DeliveryView;acknowledgedAt:string}|{status:'rejected';attempt:DeliveryAcknowledgeWrite;code:number}>{
 let attempt=parseDeliveryAcknowledgeWrite(initial,initial.accountId,initial.requestId);
 const scope=()=>{if(currentAccount()!==attempt.accountId||currentRequest()!==attempt.requestId||currentWork()!==attempt.workId)throw new DeliveryAcknowledgeFailure('scope',attempt);};
 const checkpoint=(next:DeliveryAcknowledgeWrite)=>{attempt=next;scope();try{onCheckpoint(attempt);saveDeliveryAcknowledgeWrite(store,attempt);}catch{throw new DeliveryAcknowledgeFailure('storage',attempt);}scope();};
 scope();checkpoint(attempt);const headers={'X-Pro-Expected-Actor':attempt.accountId};
 if(attempt.phase!=='confirmed'){
  const recovering=attempt.phase==='uncertain';checkpoint({...attempt,phase:'uncertain'});let response:Response;
  try{response=await request(api,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:attempt.body});}catch{throw new DeliveryAcknowledgeFailure('uncertain',attempt);}scope();
  if(!response.ok){if(!recovering&&[400,404,409,422].includes(response.status)){try{clearDeliveryAcknowledgeWrite(store,attempt);}catch{throw new DeliveryAcknowledgeFailure('storage',attempt);}scope();return {status:'rejected',attempt,code:response.status};}throw new DeliveryAcknowledgeFailure('uncertain',attempt);}
  let ack:z.infer<typeof ackSchema>;try{ack=ackSchema.parse(await response.json());if(ack.workId!==attempt.workId||ack.version!==attempt.targetVersion)throw Error();}catch{throw new DeliveryAcknowledgeFailure('uncertain',attempt);}scope();checkpoint({...attempt,phase:'confirmed',ack});
 }
 scope();try{
  const read=async(after?:number)=>{scope();const response=await request(api+'?'+new URLSearchParams({requestId:attempt.requestId,...(after?{after:String(after)}:{})}),{cache:'no-store',headers});scope();if(!response.ok)throw Error();const view=deliveryViewSchema.parse(await response.json());scope();if(view.side!=='client'||view.workId!==attempt.workId||view.canPublish||view.draft!==null||view.internalNote!==undefined)throw Error('Wrong report receipt view');return view;};
  const first=await read(),versions=[...first.versions];let page=first;
  for(let pages=0;pages<200;pages++){
   const target=page.versions.find(row=>row.version===attempt.targetVersion);
   if(target){const snapshot=publicSnapshotSchema.parse(Object.fromEntries(Object.entries(target).filter(([key])=>key!=='acknowledgedAt')));if(JSON.stringify(snapshot)!==JSON.stringify(attempt.snapshot)||target.acknowledgedAt===null)throw Error('Report receipt not verified');return {status:'confirmed',attempt,view:{...first,versions,nextCursor:page.nextCursor},acknowledgedAt:target.acknowledgedAt};}
   if(page.nextCursor===null||page.versions.some(row=>row.version<attempt.targetVersion))throw Error('Receipt version missing');
   const after=page.nextCursor,next=await read(after);if(next.versions.some(row=>row.version>=after)||next.nextCursor!==null&&next.nextCursor>=after)throw Error('Receipt history cursor changed');versions.push(...next.versions);page=next;
  }
  throw Error('Receipt history bound exceeded');
 }catch(error){if(error instanceof DeliveryAcknowledgeFailure)throw error;throw new DeliveryAcknowledgeFailure('read',attempt);}
}
