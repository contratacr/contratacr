import {z} from 'zod';
import {clientSchema,type Client} from './business';

/** Opt-in contract for one customer form. Bulk catalog/stock writers remain unchanged. */
export const clientWriteInputSchema=z.object({
 kind:z.literal('clients'),revision:z.number().int().min(0).max(2147483646),
 rows:z.tuple([clientSchema.strict()]),movements:z.tuple([]),importing:z.literal(false),
 clientActionId:z.string().uuid(),clientWriteMode:z.enum(['create','edit']),
}).strict().superRefine((input,ctx)=>{
 if(input.clientWriteMode==='create'&&(!z.string().uuid().safeParse(input.rows[0].id).success||input.rows[0].archived))ctx.addIssue({code:'custom',message:'Invalid new customer'});
});
export type ClientWriteInput=z.infer<typeof clientWriteInputSchema>;
export const clientWriteAckSchema=z.object({id:z.string().min(1).max(160),revision:z.number().int().positive().max(2147483647)}).strict();
const recordSchema=z.object({version:z.literal(1),accountId:z.string().uuid(),body:z.string().min(1).max(16000),phase:z.enum(['ready','uncertain','confirmed']),ack:clientWriteAckSchema.nullable()}).strict();
export type ClientWrite=z.infer<typeof recordSchema>;
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Request=(url:string,init?:RequestInit)=>Promise<Response>;
const order={ready:0,uncertain:1,confirmed:2};
export const clientWriteKey=(accountId:string)=>'ccr:pro:client-write:v1:'+z.string().uuid().parse(accountId);
export function parseClientWrite(value:unknown,accountId:string):ClientWrite{
 const record=recordSchema.parse(value),input=clientWriteInputSchema.parse(JSON.parse(record.body));
 if(record.accountId!==z.string().uuid().parse(accountId)||JSON.stringify(input)!==record.body||(record.phase==='confirmed')!==(record.ack!==null)||record.ack&&(record.ack.id!==input.rows[0].id||record.ack.revision!==input.revision+1))throw Error('Invalid customer recovery context');
 return record;
}
export function createClientWrite(accountId:string,value:unknown):ClientWrite{
 const input=clientWriteInputSchema.parse(value);
 return parseClientWrite({version:1,accountId,body:JSON.stringify(input),phase:'ready',ack:null},accountId);
}
export function readClientWrite(store:Store,accountId:string):ClientWrite|null{
 const raw=store.getItem(clientWriteKey(accountId));
 if(raw===null)return null;
 if(raw.length>20000)throw Error('Customer recovery too large');
 return parseClientWrite(JSON.parse(raw),accountId);
}
export function saveClientWrite(store:Store,value:ClientWrite){
 const record=parseClientWrite(value,value.accountId),prior=readClientWrite(store,record.accountId);
 if(prior&&(prior.body!==record.body||order[prior.phase]>order[record.phase]||prior.ack&&JSON.stringify(prior.ack)!==JSON.stringify(record.ack)))throw Error('An unresolved customer attempt already exists');
 const key=clientWriteKey(record.accountId),raw=JSON.stringify(record);store.setItem(key,raw);
 if(store.getItem(key)!==raw)throw Error('Customer recovery was not retained');
}
export function mergeClientWrite(memory:ClientWrite,stored:ClientWrite|null):ClientWrite{
 const current=parseClientWrite(memory,memory.accountId);
 if(!stored)return current;
 const disk=parseClientWrite(stored,current.accountId);
 if(disk.body!==current.body||disk.ack&&current.ack&&JSON.stringify(disk.ack)!==JSON.stringify(current.ack))throw Error('Customer recovery changed');
 return order[disk.phase]>order[current.phase]?disk:current;
}
export function clearClientWrite(store:Store,value:ClientWrite){
 const record=parseClientWrite(value,value.accountId),prior=readClientWrite(store,record.accountId);
 if(prior&&JSON.stringify(prior)!==JSON.stringify(record))throw Error('Customer recovery changed before clearing');
 const key=clientWriteKey(record.accountId);store.removeItem(key);
 if(store.getItem(key)!==null)throw Error('Customer recovery was not cleared');
}
export function verifyClientWriteRead(record:ClientWrite,value:unknown):{client:Client;newer:boolean}{
 const attempt=parseClientWrite(record,record.accountId),input=clientWriteInputSchema.parse(JSON.parse(attempt.body));
 if(!attempt.ack)throw Error('Missing customer acknowledgment');
 const result=z.object({userId:z.string().uuid(),revision:z.number().int().nonnegative(),document:z.object({clients:z.array(clientSchema.strict()).length(1)})}).parse(value);
 const client=result.document.clients[0],newer=result.revision>attempt.ack.revision;
 if(result.userId!==attempt.accountId||result.revision<attempt.ack.revision||client.id!==attempt.ack.id||!newer&&JSON.stringify(client)!==JSON.stringify(input.rows[0]))throw Error('Customer canonical read mismatch');
 return {client,newer};
}
export class ClientWriteFailure extends Error{
 kind:'storage'|'uncertain'|'read'|'scope';attempt:ClientWrite;
 constructor(kind:ClientWriteFailure['kind'],attempt:ClientWrite){super(kind);this.kind=kind;this.attempt=attempt;}
}
/** No automatic caller retry. A confirmed attempt only reads; caller clears after accepting it. */
export async function continueClientWrite({store,attempt:initial,request,currentAccount,onCheckpoint}:{store:Store;attempt:ClientWrite;request:Request;currentAccount:()=>string|undefined;onCheckpoint:(attempt:ClientWrite)=>void}):Promise<{status:'confirmed';attempt:ClientWrite;client:Client;newer:boolean}|{status:'rejected';attempt:ClientWrite;code:number}>{
 let attempt=parseClientWrite(initial,initial.accountId);
 const scope=()=>{if(currentAccount()!==attempt.accountId)throw new ClientWriteFailure('scope',attempt);};
 const checkpoint=(next:ClientWrite)=>{attempt=next;onCheckpoint(attempt);try{saveClientWrite(store,attempt);}catch{throw new ClientWriteFailure('storage',attempt);}};
 scope();
 // Retain the exact first intent before converting it to an in-flight checkpoint.
 checkpoint(attempt);
 if(attempt.phase!=='confirmed'){
  const recovering=attempt.phase==='uncertain';checkpoint({...attempt,phase:'uncertain'});scope();
  let response:Response;
  try{response=await request('/api/pro/catalog',{method:'PATCH',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':attempt.accountId},body:attempt.body});}catch{throw new ClientWriteFailure('uncertain',attempt);}
  scope();
  if(!response.ok){
   if(!recovering&&[400,404,409,422].includes(response.status)){
    try{clearClientWrite(store,attempt);}catch{throw new ClientWriteFailure('storage',attempt);}
    return {status:'rejected',attempt,code:response.status};
   }
   throw new ClientWriteFailure('uncertain',attempt);
  }
  let ack:z.infer<typeof clientWriteAckSchema>;
  try{ack=clientWriteAckSchema.parse(await response.json());const input=clientWriteInputSchema.parse(JSON.parse(attempt.body));if(ack.id!==input.rows[0].id||ack.revision!==input.revision+1)throw Error();}catch{throw new ClientWriteFailure('uncertain',attempt);}
  scope();checkpoint({...attempt,phase:'confirmed',ack});
 }
 scope();
 try{
  const response=await request('/api/pro/catalog?'+new URLSearchParams({kind:'clients',id:attempt.ack!.id,option:'1'}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':attempt.accountId}});
  scope();if(!response.ok)throw Error();const body=await response.json();scope();
  return {status:'confirmed',attempt,...verifyClientWriteRead(attempt,body)};
 }catch(error){if(error instanceof ClientWriteFailure)throw error;throw new ClientWriteFailure('read',attempt);}
}
