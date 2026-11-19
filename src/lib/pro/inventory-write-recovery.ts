import {z} from 'zod';
import {productSchema,businessSchema,type Product} from './business';

/** Opt-in contract for one product/stock form. Bulk catalog/stock writers remain unchanged. */
export const inventoryWriteInputSchema=z.object({
 kind:z.literal('products'),revision:z.number().int().min(0).max(2147483646),
 rows:z.tuple([productSchema.strict()]),movements:z.array(businessSchema.shape.movements.element.strict().extend({id:z.string().uuid(),at:z.string().datetime({offset:true})})).max(1),importing:z.literal(false),
 inventoryActionId:z.string().uuid(),inventoryWriteMode:z.enum(['create','edit','movement']),
}).strict().superRefine((input,ctx)=>{
 const product=input.rows[0],movement=input.movements[0];
 if(input.inventoryWriteMode==='create'&&(!z.string().uuid().safeParse(product.id).success||product.archived))ctx.addIssue({code:'custom',message:'Invalid new inventory'});
 if((input.inventoryWriteMode==='movement')!==(input.movements.length===1)||movement&&(movement.productId!==product.id||product.itemType==='service'||product.archived||movement.delta===0))ctx.addIssue({code:'custom',message:'Invalid inventory movement'});
});
export type InventoryWriteInput=z.infer<typeof inventoryWriteInputSchema>;
export const inventoryWriteAckSchema=z.object({id:z.string().min(1).max(160),revision:z.number().int().positive().max(2147483647),movementId:z.string().uuid().nullable()}).strict();
const recordSchema=z.object({version:z.literal(1),accountId:z.string().uuid(),body:z.string().min(1).max(16000),phase:z.enum(['ready','uncertain','confirmed']),ack:inventoryWriteAckSchema.nullable()}).strict();
export type InventoryWrite=z.infer<typeof recordSchema>;
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Request=(url:string,init?:RequestInit)=>Promise<Response>;
const order={ready:0,uncertain:1,confirmed:2};
export const inventoryWriteKey=(accountId:string)=>'ccr:pro:inventory-write:v1:'+z.string().uuid().parse(accountId);
export function parseInventoryWrite(value:unknown,accountId:string):InventoryWrite{
 const record=recordSchema.parse(value),input=inventoryWriteInputSchema.parse(JSON.parse(record.body));
 if(record.accountId!==z.string().uuid().parse(accountId)||JSON.stringify(input)!==record.body||(record.phase==='confirmed')!==(record.ack!==null)||record.ack&&(record.ack.id!==input.rows[0].id||record.ack.revision!==input.revision+1||record.ack.movementId!==(input.movements[0]?.id??null)))throw Error('Invalid inventory recovery context');
 return record;
}
export function createInventoryWrite(accountId:string,value:unknown):InventoryWrite{
 const input=inventoryWriteInputSchema.parse(value);
 return parseInventoryWrite({version:1,accountId,body:JSON.stringify(input),phase:'ready',ack:null},accountId);
}
export function readInventoryWrite(store:Store,accountId:string):InventoryWrite|null{
 const raw=store.getItem(inventoryWriteKey(accountId));
 if(raw===null)return null;
 if(raw.length>20000)throw Error('Inventory recovery too large');
 return parseInventoryWrite(JSON.parse(raw),accountId);
}
export function saveInventoryWrite(store:Store,value:InventoryWrite){
 const record=parseInventoryWrite(value,value.accountId),prior=readInventoryWrite(store,record.accountId);
 if(prior&&(prior.body!==record.body||order[prior.phase]>order[record.phase]||prior.ack&&JSON.stringify(prior.ack)!==JSON.stringify(record.ack)))throw Error('An unresolved inventory attempt already exists');
 const key=inventoryWriteKey(record.accountId),raw=JSON.stringify(record);store.setItem(key,raw);
 if(store.getItem(key)!==raw)throw Error('Inventory recovery was not retained');
}
export function mergeInventoryWrite(memory:InventoryWrite,stored:InventoryWrite|null):InventoryWrite{
 const current=parseInventoryWrite(memory,memory.accountId);
 if(!stored)return current;
 const disk=parseInventoryWrite(stored,current.accountId);
 if(disk.body!==current.body||disk.ack&&current.ack&&JSON.stringify(disk.ack)!==JSON.stringify(current.ack))throw Error('Inventory recovery changed');
 return order[disk.phase]>order[current.phase]?disk:current;
}
export function clearInventoryWrite(store:Store,value:InventoryWrite){
 const record=parseInventoryWrite(value,value.accountId),prior=readInventoryWrite(store,record.accountId);
 if(prior&&JSON.stringify(prior)!==JSON.stringify(record))throw Error('Inventory recovery changed before clearing');
 const key=inventoryWriteKey(record.accountId);store.removeItem(key);
 if(store.getItem(key)!==null)throw Error('Inventory recovery was not cleared');
}
export function verifyInventoryWriteRead(record:InventoryWrite,value:unknown):{product:Product;newer:boolean}{
 const attempt=parseInventoryWrite(record,record.accountId),input=inventoryWriteInputSchema.parse(JSON.parse(attempt.body));
 if(!attempt.ack)throw Error('Missing inventory acknowledgment');
 const result=z.object({userId:z.string().uuid(),revision:z.number().int().nonnegative(),document:z.object({products:z.array(productSchema.strict()).length(1)}),movement:businessSchema.shape.movements.element.strict().optional()}).parse(value);
 const product=result.document.products[0],newer=result.revision>attempt.ack.revision;
 if(result.userId!==attempt.accountId||result.revision<attempt.ack.revision||product.id!==attempt.ack.id||!newer&&JSON.stringify(product)!==JSON.stringify(input.rows[0]))throw Error('Inventory canonical read mismatch');
 if(input.movements.length&&JSON.stringify(result.movement)!==JSON.stringify(input.movements[0]))throw Error('Inventory movement read mismatch');
 return {product,newer};
}
export class InventoryWriteFailure extends Error{
 kind:'storage'|'uncertain'|'read'|'scope';attempt:InventoryWrite;
 constructor(kind:InventoryWriteFailure['kind'],attempt:InventoryWrite){super(kind);this.kind=kind;this.attempt=attempt;}
}
/** No automatic caller retry. A confirmed attempt only reads; caller clears after accepting it. */
export async function continueInventoryWrite({store,attempt:initial,request,currentAccount,onCheckpoint}:{store:Store;attempt:InventoryWrite;request:Request;currentAccount:()=>string|undefined;onCheckpoint:(attempt:InventoryWrite)=>void}):Promise<{status:'confirmed';attempt:InventoryWrite;product:Product;newer:boolean}|{status:'rejected';attempt:InventoryWrite;code:number}>{
 let attempt=parseInventoryWrite(initial,initial.accountId);
 const scope=()=>{if(currentAccount()!==attempt.accountId)throw new InventoryWriteFailure('scope',attempt);};
 const checkpoint=(next:InventoryWrite)=>{attempt=next;onCheckpoint(attempt);try{saveInventoryWrite(store,attempt);}catch{throw new InventoryWriteFailure('storage',attempt);}};
 scope();
 // Retain the exact first intent before converting it to an in-flight checkpoint.
 checkpoint(attempt);
 if(attempt.phase!=='confirmed'){
  const recovering=attempt.phase==='uncertain';checkpoint({...attempt,phase:'uncertain'});scope();
  let response:Response;
  try{response=await request('/api/pro/catalog',{method:'PATCH',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':attempt.accountId},body:attempt.body});}catch{throw new InventoryWriteFailure('uncertain',attempt);}
  scope();
  if(!response.ok){
   if(!recovering&&[400,404,409,422].includes(response.status)){
    try{clearInventoryWrite(store,attempt);}catch{throw new InventoryWriteFailure('storage',attempt);}
    return {status:'rejected',attempt,code:response.status};
   }
   throw new InventoryWriteFailure('uncertain',attempt);
  }
  let ack:z.infer<typeof inventoryWriteAckSchema>;
  try{ack=inventoryWriteAckSchema.parse(await response.json());const input=inventoryWriteInputSchema.parse(JSON.parse(attempt.body));if(ack.id!==input.rows[0].id||ack.revision!==input.revision+1||ack.movementId!==(input.movements[0]?.id??null))throw Error();}catch{throw new InventoryWriteFailure('uncertain',attempt);}
  scope();checkpoint({...attempt,phase:'confirmed',ack});
 }
 scope();
 try{
  const response=await request('/api/pro/catalog?'+new URLSearchParams({kind:'products',id:attempt.ack!.id,option:'1',...(attempt.ack!.movementId?{inventoryMovement:attempt.ack!.movementId,inventoryActionId:inventoryWriteInputSchema.parse(JSON.parse(attempt.body)).inventoryActionId}:{})}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':attempt.accountId}});
  scope();if(!response.ok)throw Error();const body=await response.json();scope();
  return {status:'confirmed',attempt,...verifyInventoryWriteRead(attempt,body)};
 }catch(error){if(error instanceof InventoryWriteFailure)throw error;throw new InventoryWriteFailure('read',attempt);}
}
