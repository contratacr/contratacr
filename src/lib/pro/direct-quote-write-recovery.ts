import {z} from 'zod';
import {directProjectQuoteSchema} from './direct-project-quotes';
import type {Quote} from '../quotes';

const recordSchema=z.object({version:z.literal(1),accountId:z.string().uuid(),body:z.string().max(64000),phase:z.enum(['ready','uncertain','confirmed']),quoteId:z.string().uuid().nullable()}).strict();
export type DirectQuoteWrite=z.infer<typeof recordSchema>;
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Request=(url:string,init?:RequestInit)=>Promise<Response>;
const timestamp=z.string().datetime({offset:true});
const quoteSchema=z.object({
 id:z.string().uuid(),professional_id:z.string().uuid(),client_id:z.string().uuid().nullable(),
 client_name:z.string().nullable(),client_phone:z.string().nullable(),client_cedula:z.string().nullable(),client_email:z.string().nullable(),
 public_code:z.string().min(1),quote_number:z.number().int().positive(),project_id:z.string().uuid().nullable(),proposal_id:z.string().uuid().nullable(),
 title:z.string().nullable(),notes:z.string().nullable(),items:z.array(directProjectQuoteSchema.shape.items.element).min(1).max(30),
 tax_mode:z.enum(['incluido','mas_iva','exento']),subtotal:z.number().int().nonnegative(),tax_amount:z.number().int().nonnegative(),total:z.number().int().nonnegative(),
 valid_until:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),status:z.enum(['sent','accepted','declined','withdrawn']),
 accepted_at:timestamp.nullable(),declined_at:timestamp.nullable(),created_at:timestamp,updated_at:timestamp.optional(),
 professional_name:z.string().nullable().optional(),professional_full_name:z.string().nullable().optional(),
});
function readQuote(value:unknown):Quote{
 const quote=quoteSchema.parse(value);
 // Integer hundredths mirror PostgreSQL numeric rounding, including fractional quantities.
 const hundredths=quote.items.reduce((sum,item)=>sum+Math.round(item.quantity*100)*item.unit_price,0);
 if(!Number.isSafeInteger(hundredths))throw Error('Invalid quote amount');
 const subtotal=Math.floor((hundredths+50)/100),tax=quote.tax_mode==='mas_iva'?Math.floor((subtotal*13+50)/100):quote.tax_mode==='incluido'?Math.round(subtotal*13/113):0;
 if(quote.subtotal!==subtotal||quote.tax_amount!==tax||quote.total!==subtotal+(quote.tax_mode==='mas_iva'?tax:0))throw Error('Inconsistent quote totals');
 return quote;
}
export const directQuoteWriteKey=(accountId:string)=>'ccr:pro:direct-quote-write:'+accountId;
export function parseDirectQuoteWrite(value:unknown,accountId:string):DirectQuoteWrite{
 const record=recordSchema.parse(value);
 if(record.accountId!==accountId||(record.phase==='confirmed')!==(record.quoteId!==null))throw Error('Invalid quote recovery context');
 directProjectQuoteSchema.parse(JSON.parse(record.body));
 return record;
}
export function readDirectQuoteWrite(store:Store,accountId:string):DirectQuoteWrite|null{
 z.string().uuid().parse(accountId);
 const raw=store.getItem(directQuoteWriteKey(accountId));
 if(raw===null)return null;
 if(raw.length>70000)throw Error('Quote recovery too large');
 return parseDirectQuoteWrite(JSON.parse(raw),accountId);
}
export function saveDirectQuoteWrite(store:Store,value:DirectQuoteWrite){
 const record=parseDirectQuoteWrite(value,value.accountId),prior=readDirectQuoteWrite(store,record.accountId);
 const order={ready:0,uncertain:1,confirmed:2};
 if(prior&&(prior.body!==record.body||order[prior.phase]>order[record.phase]||prior.quoteId!==null&&prior.quoteId!==record.quoteId))throw Error('An unresolved quote attempt already exists');
 const key=directQuoteWriteKey(record.accountId),raw=JSON.stringify(record);
 store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Quote recovery was not retained');
}
export function clearDirectQuoteWrite(store:Store,value:DirectQuoteWrite){
 const prior=readDirectQuoteWrite(store,value.accountId);
 if(prior&&JSON.stringify(prior)!==JSON.stringify(value))throw Error('Quote recovery changed before clearing');
 const key=directQuoteWriteKey(value.accountId);store.removeItem(key);
 if(store.getItem(key)!==null)throw Error('Quote recovery was not cleared');
}
export class DirectQuoteWriteFailure extends Error{
 constructor(public kind:'storage'|'uncertain'|'read'|'scope',public attempt:DirectQuoteWrite){super(kind);}
}
/** A confirmed attempt only reads. The caller clears it after accepting the result. */
export async function continueDirectQuoteWrite({store,attempt:initial,request,currentAccount,onCheckpoint,timeoutMs=15000}:{store:Store;attempt:DirectQuoteWrite;request:Request;currentAccount:()=>string|undefined;onCheckpoint:(value:DirectQuoteWrite)=>void;timeoutMs?:number}):Promise<{status:'confirmed';attempt:DirectQuoteWrite;quote:Quote}|{status:'rejected';attempt:DirectQuoteWrite;code:number}>{
 let attempt=parseDirectQuoteWrite(initial,initial.accountId);
 const scope=()=>{if(currentAccount()!==attempt.accountId)throw new DirectQuoteWriteFailure('scope',attempt);};
 const checkpoint=(next:DirectQuoteWrite)=>{attempt=next;onCheckpoint(attempt);try{saveDirectQuoteWrite(store,attempt);}catch{throw new DirectQuoteWriteFailure('storage',attempt);}};
 scope();
 const sourceInput=directProjectQuoteSchema.parse(JSON.parse(attempt.body));
 const bounded=async(url:string,init:RequestInit={},json=false)=>{
   const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
   try{return await Promise.race([(async()=>{const response=await request(url,{...init,signal:controller.signal});return{ok:response.ok,status:response.status,body:json?await response.json():null};})(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Quote request timed out'));},timeoutMs);})]);}finally{if(timer!==undefined)clearTimeout(timer);}
  };
 if(sourceInput.sourceManualLeadId){
  const same=(a:unknown,b:unknown):boolean=>{
   if(a===b)return true;
   if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>same(v,b[i]));
   if(a&&b&&typeof a==='object'&&typeof b==='object'){const x=a as Record<string,unknown>,y=b as Record<string,unknown>;return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.hasOwn(y,k)&&same(x[k],y[k]));}
   return false;
  };
  const verify=(raw:unknown)=>{
   const r=z.object({input:directProjectQuoteSchema,result:z.object({link:z.object({leadId:z.string().uuid(),sourceLeadRevision:z.number().int().positive(),sourceClientId:z.string(),quoteId:z.string().uuid(),createdAt:timestamp}).strict(),quote:quoteSchema}).strict()}).strict().parse(raw);
   const q=readQuote(r.result.quote),l=r.result.link;
   if(!same(r.input,sourceInput)||l.leadId!==sourceInput.sourceManualLeadId||l.sourceLeadRevision!==sourceInput.sourceManualLeadRevision||l.sourceClientId!==sourceInput.proClientId||l.quoteId!==q.id||attempt.quoteId&&attempt.quoteId!==q.id||q.client_id!==null||q.project_id!==null||q.proposal_id!==null||q.status!=='sent'||q.accepted_at!==null||q.declined_at!==null||!same(q.items,sourceInput.items)||q.tax_mode!==sourceInput.taxMode||q.title!==sourceInput.title||q.notes!==sourceInput.notes||q.client_name!==sourceInput.clientName||q.client_phone!==sourceInput.clientPhone||q.client_email!==sourceInput.clientEmail||q.client_cedula!==sourceInput.clientCedula)throw Error('Manual lead quote receipt mismatch');
   return q;
  };
  const proof=async()=>{
   const response=await bounded('/api/pro/lead-private-quotes?'+new URLSearchParams({view:'action',actionId:sourceInput.clientActionId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':attempt.accountId}},true);scope();
   if(!response.ok)throw Error('Receipt unavailable');const body=response.body;scope();
   if(!body||!Object.hasOwn(body,'receipt'))throw Error('Receipt envelope missing');
   return body.receipt===null?null:verify(body.receipt);
  };
  // A reload checks immutable evidence first. It never replays a committed write
  // just because its source/contact changed after the original transaction.
  checkpoint(attempt);let saved:Quote|null;
  try{saved=await proof();}catch(error){if(error instanceof DirectQuoteWriteFailure)throw error;throw new DirectQuoteWriteFailure('read',attempt);}
  if(!saved){
   if(attempt.phase==='confirmed')throw new DirectQuoteWriteFailure('read',attempt);
   const recovering=attempt.phase==='uncertain';checkpoint({...attempt,phase:'uncertain'});scope();
   let response:{ok:boolean;status:number};try{response=await bounded('/api/pro/manual-lead-quotes',{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':attempt.accountId},body:attempt.body});}catch{throw new DirectQuoteWriteFailure('uncertain',attempt);}scope();
   if(!response.ok){if(!recovering&&[400,404,409,422].includes(response.status)){try{clearDirectQuoteWrite(store,attempt);}catch{throw new DirectQuoteWriteFailure('storage',attempt);}return{status:'rejected',attempt,code:response.status};}throw new DirectQuoteWriteFailure('uncertain',attempt);}
   // The independent immutable receipt is authoritative, including when the ACK
   // body is truncated. Never finish from a mutable quote or a bare HTTP 200.
   try{saved=await proof();if(!saved)throw Error('Receipt missing');}catch(error){if(error instanceof DirectQuoteWriteFailure)throw error;throw new DirectQuoteWriteFailure('uncertain',attempt);}
  }
  scope();checkpoint({...attempt,phase:'confirmed',quoteId:saved.id});
 }
 if(attempt.phase!=='confirmed'){
  const recovering=attempt.phase==='uncertain';
  checkpoint({...attempt,phase:'uncertain'});scope();
  let response:Response;
  try{response=await request('/api/pro/quote-create',{method:'POST',headers:{'Content-Type':'application/json'},body:attempt.body});}catch{throw new DirectQuoteWriteFailure('uncertain',attempt);}
  scope();
  if(!response.ok){
   if(!recovering&&[400,404,409,422].includes(response.status)){
    try{clearDirectQuoteWrite(store,attempt);}catch{throw new DirectQuoteWriteFailure('storage',attempt);}
    return {status:'rejected',attempt,code:response.status};
   }
   throw new DirectQuoteWriteFailure('uncertain',attempt);
  }
  let body:unknown;try{body=await response.json();}catch{throw new DirectQuoteWriteFailure('uncertain',attempt);}
  let quote:Quote;
  try{
   quote=readQuote((body as {quote?:unknown})?.quote);
   const input=directProjectQuoteSchema.parse(JSON.parse(attempt.body));
   if(quote.project_id!==(input.projectId??null)||input.context==='direct'&&quote.client_id!==null||JSON.stringify(quote.items)!==JSON.stringify(input.items)||quote.tax_mode!==input.taxMode||quote.title!==input.title||quote.notes!==input.notes||quote.client_name!==input.clientName||quote.client_phone!==input.clientPhone||quote.client_cedula!==input.clientCedula||quote.client_email!==input.clientEmail)throw Error('Wrong quote acknowledgement');
  }catch{throw new DirectQuoteWriteFailure('uncertain',attempt);}
  scope();checkpoint({...attempt,phase:'confirmed',quoteId:quote.id});
 }else checkpoint(attempt);
 scope();
 try{
  const url='/api/pro/quotes?'+new URLSearchParams({id:attempt.quoteId!});
  let body;
  if(sourceInput.sourceManualLeadId){const response=await bounded(url,{cache:'no-store'},true);scope();if(!response.ok)throw Error('Read failed');body=response.body;}
  else{const response=await request(url,{cache:'no-store'});scope();if(!response.ok)throw Error('Read failed');body=await response.json();}
  scope();
  const input=directProjectQuoteSchema.parse(JSON.parse(attempt.body));
  const quote=readQuote(body.quote);
  // Accepted optional lines may legitimately change items/totals after the create ACK.
  if(body.owned!==true||quote.id!==attempt.quoteId||quote.project_id!==(input.projectId??null)||input.context==='direct'&&quote.client_id!==null||input.proClientId&&body.link?.clientId!==input.proClientId)throw Error('Wrong quote result');
  return {status:'confirmed',attempt,quote};
 }catch(error){if(error instanceof DirectQuoteWriteFailure)throw error;throw new DirectQuoteWriteFailure('read',attempt);}
}
