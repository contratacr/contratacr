import {z} from 'zod';
import {deliveryContentSchema,deliveryMutationSchema,type DeliveryView} from './work-delivery';

/** Owner text/save and publish only. Photo upload and customer acknowledgement are not covered. */
export const deliveryWriteInputSchema=z.union([deliveryMutationSchema.options[0],deliveryMutationSchema.options[1]]);
const timestamp=z.string().datetime({offset:true});
export const deliveryViewSchema=z.object({
 side:z.enum(['provider','client']),workId:z.string().min(1).max(160),canPublish:z.boolean(),revision:z.number().int().nonnegative(),
 draft:deliveryContentSchema.nullable(),internalNote:z.string().max(2000).nullish().transform(value=>value??undefined),
 photos:z.array(z.object({id:z.string().uuid(),name:z.string().max(160),ready:z.boolean()}).strict()).max(6),
 versions:z.array(z.object({version:z.number().int().positive(),content:deliveryContentSchema,service:z.string().max(160),completedAt:z.string().max(80),publishedAt:timestamp,acknowledgedAt:timestamp.nullable()}).strict()),
 nextCursor:z.number().int().positive().nullable(),
}).strict().superRefine((value,ctx)=>{
 if(value.side==='provider'&&(value.draft===null||typeof value.internalNote!=='string'))ctx.addIssue({code:'custom',message:'Missing private report state'});
 if(value.versions.some((row,index)=>index>0&&row.version>=value.versions[index-1].version)||value.nextCursor!==null&&(value.versions.length===0||value.nextCursor!==value.versions.at(-1)!.version))ctx.addIssue({code:'custom',message:'Invalid report history order'});
});
const ackSchema=z.object({workId:z.string().min(1).max(160),revision:z.number().int().positive()}).strict();
const baselineSchema=z.object({revision:z.number().int().nonnegative(),latestVersion:z.number().int().nonnegative(),content:deliveryContentSchema,internalNote:z.string().max(2000)}).strict();
const recordSchema=z.object({version:z.literal(1),accountId:z.string().uuid(),workId:z.string().min(1).max(160),body:z.string().min(1).max(64000),baseline:baselineSchema,phase:z.enum(['ready','uncertain','confirmed']),ack:ackSchema.nullable()}).strict();
export type DeliveryWrite=z.infer<typeof recordSchema>;
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Request=(url:string,init?:RequestInit)=>Promise<Response>;
const order={ready:0,uncertain:1,confirmed:2},api='/api/pro/work-delivery';
export function deliveryWriteKey(accountId:string,workId:string){return 'ccr:pro:delivery-write:v1:'+z.string().uuid().parse(accountId)+':'+encodeURIComponent(z.string().min(1).max(160).parse(workId));}
export function parseDeliveryWrite(value:unknown,accountId:string,workId:string):DeliveryWrite{
 const record=recordSchema.parse(value),input=deliveryWriteInputSchema.parse(JSON.parse(record.body));
 if(record.accountId!==z.string().uuid().parse(accountId)||record.workId!==workId||input.workId!==workId||JSON.stringify(input)!==record.body||input.revision!==record.baseline.revision||(record.phase==='confirmed')!==(record.ack!==null)||record.ack&&(record.ack.workId!==workId||record.ack.revision!==input.revision+1))throw Error('Invalid report recovery context');
 return record;
}
export function createDeliveryWrite(accountId:string,inputValue:unknown,viewValue:unknown):DeliveryWrite{
 const input=deliveryWriteInputSchema.parse(inputValue),view=deliveryViewSchema.parse(viewValue);
 if(view.side!=='provider'||view.workId!==input.workId||view.revision!==input.revision||input.action==='publish'&&(!view.canPublish||!view.draft!.summary.trim()))throw Error('Invalid report write context');
 return parseDeliveryWrite({version:1,accountId,workId:input.workId,body:JSON.stringify(input),baseline:{revision:view.revision,latestVersion:view.versions[0]?.version??0,content:view.draft!,internalNote:view.internalNote!},phase:'ready',ack:null},accountId,input.workId);
}
export function readDeliveryWrite(store:Store,accountId:string,workId:string):DeliveryWrite|null{
 const raw=store.getItem(deliveryWriteKey(accountId,workId));if(raw===null)return null;
 if(raw.length>100000)throw Error('Report recovery too large');return parseDeliveryWrite(JSON.parse(raw),accountId,workId);
}
export function saveDeliveryWrite(store:Store,value:DeliveryWrite){
 const record=parseDeliveryWrite(value,value.accountId,value.workId),prior=readDeliveryWrite(store,record.accountId,record.workId);
 if(prior&&(prior.body!==record.body||JSON.stringify(prior.baseline)!==JSON.stringify(record.baseline)||order[prior.phase]>order[record.phase]||prior.ack&&JSON.stringify(prior.ack)!==JSON.stringify(record.ack)))throw Error('Another report attempt already exists');
 const key=deliveryWriteKey(record.accountId,record.workId),raw=JSON.stringify(record);store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Report recovery was not retained');
}
export function mergeDeliveryWrite(memory:DeliveryWrite,stored:DeliveryWrite|null):DeliveryWrite{
 const current=parseDeliveryWrite(memory,memory.accountId,memory.workId);if(!stored)return current;
 const disk=parseDeliveryWrite(stored,current.accountId,current.workId);
 if(disk.body!==current.body||JSON.stringify(disk.baseline)!==JSON.stringify(current.baseline)||disk.ack&&current.ack&&JSON.stringify(disk.ack)!==JSON.stringify(current.ack))throw Error('Report recovery changed');
 return order[disk.phase]>order[current.phase]?disk:current;
}
export function clearDeliveryWrite(store:Store,value:DeliveryWrite){
 const record=parseDeliveryWrite(value,value.accountId,value.workId),prior=readDeliveryWrite(store,record.accountId,record.workId);
 if(prior&&JSON.stringify(prior)!==JSON.stringify(record))throw Error('Report recovery changed before clearing');
 const key=deliveryWriteKey(record.accountId,record.workId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Report recovery was not cleared');
}
export class DeliveryWriteFailure extends Error{
 kind:'storage'|'uncertain'|'read'|'scope';attempt:DeliveryWrite;
 constructor(kind:DeliveryWriteFailure['kind'],attempt:DeliveryWrite){super(kind);this.kind=kind;this.attempt=attempt;}
}
/** Uses existing action receipts. Confirmed writes only read; caller clears after adopting the verified view. */
export async function continueDeliveryWrite({store,attempt:initial,request,currentAccount,currentWork,onCheckpoint}:{store:Store;attempt:DeliveryWrite;request:Request;currentAccount:()=>string|undefined;currentWork:()=>string|undefined;onCheckpoint:(attempt:DeliveryWrite)=>void}):Promise<{status:'confirmed';attempt:DeliveryWrite;view:DeliveryView;newer:boolean;publishedVersion:number|null}|{status:'rejected';attempt:DeliveryWrite;code:number}>{
 let attempt=parseDeliveryWrite(initial,initial.accountId,initial.workId);
 const input=deliveryWriteInputSchema.parse(JSON.parse(attempt.body));
 const scope=()=>{if(currentAccount()!==attempt.accountId||currentWork()!==attempt.workId)throw new DeliveryWriteFailure('scope',attempt);};
 const checkpoint=(next:DeliveryWrite)=>{attempt=next;try{onCheckpoint(attempt);saveDeliveryWrite(store,attempt);}catch{throw new DeliveryWriteFailure('storage',attempt);}};
 scope();checkpoint(attempt);
 if(attempt.phase!=='confirmed'){
  const recovering=attempt.phase==='uncertain';checkpoint({...attempt,phase:'uncertain'});scope();
  let response:Response;try{response=await request(api,{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':attempt.accountId},body:attempt.body});}catch{throw new DeliveryWriteFailure('uncertain',attempt);}
  scope();if(!response.ok){
   if(!recovering&&[400,404,409,422].includes(response.status)){
    try{clearDeliveryWrite(store,attempt);}catch{throw new DeliveryWriteFailure('storage',attempt);}return {status:'rejected',attempt,code:response.status};
   }
   throw new DeliveryWriteFailure('uncertain',attempt);
  }
  let ack:z.infer<typeof ackSchema>;
  try{ack=ackSchema.parse(await response.json());if(ack.workId!==attempt.workId||ack.revision!==input.revision+1)throw Error();}catch{throw new DeliveryWriteFailure('uncertain',attempt);}
  scope();checkpoint({...attempt,phase:'confirmed',ack});
 }
 scope();
 try{
  const read=async(after?:number)=>{scope();const response=await request(api+'?'+new URLSearchParams({workId:attempt.workId,...(after?{after:String(after)}:{})}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':attempt.accountId}});scope();if(!response.ok)throw Error('Report unavailable');const view=deliveryViewSchema.parse(await response.json());scope();if(view.side!=='provider'||view.workId!==attempt.workId||view.revision<attempt.ack!.revision)throw Error('Wrong report read');return view;};
  const first=await read(),newer=first.revision>attempt.ack!.revision;
  if(!newer){const expected=input.action==='save'?input.content:attempt.baseline.content,note=input.action==='save'?input.internalNote:attempt.baseline.internalNote;if(JSON.stringify(first.draft)!==JSON.stringify(expected)||first.internalNote!==note)throw Error('Report draft mismatch');}
  if(input.action==='save')return {status:'confirmed',attempt,view:first,newer,publishedVersion:null};
  // CAS bound the publication to this draft revision. Each successful publication
  // creates exactly max(version)+1; later identical publications remain legitimate.
  const target=attempt.baseline.latestVersion+1,versions=[...first.versions];let page=first;
  for(let pages=0;pages<200;pages++){
   const found=page.versions.find(version=>version.version===target);
   if(found){if(JSON.stringify(found.content)!==JSON.stringify(attempt.baseline.content))throw Error('Published report mismatch');return {status:'confirmed',attempt,view:{...first,versions,nextCursor:page.nextCursor},newer,publishedVersion:target};}
   if(page.nextCursor===null||page.versions.some(version=>version.version<target))throw Error('Published version missing');
   const after=page.nextCursor,next=await read(after);
   if(next.revision!==first.revision||next.versions.some(version=>version.version>=after)||next.nextCursor!==null&&next.nextCursor>=after)throw Error('Report history changed');
   versions.push(...next.versions);page=next;
  }
  throw Error('Report history bound exceeded');
 }catch(error){if(error instanceof DeliveryWriteFailure)throw error;throw new DeliveryWriteFailure('read',attempt);}
}
