import {z} from 'zod';
import {daySchema} from './panel-queries';
import {workCostMutationSchema,workTimeCost,type WorkCostEntry,type WorkCostsPage,type WorkExpenseCandidate} from './work-costs';
const id=z.string().min(1).max(160),integer=z.number().int().safe(),nonnegative=integer.nonnegative();
export const workCostRecoveryEntrySchema=z.object({id:z.string().uuid(),kind:z.enum(['time','time_void','expense','expense_unlink']),date:daySchema,minutes:integer.min(1).max(1440).nullable(),hourlyCostCents:integer.min(0).max(10000000000).nullable(),amountCents:nonnegative.nullable(),note:z.string().max(300),expenseId:z.string().uuid().nullable(),supplierName:z.string().nullable(),reversalId:z.string().uuid().nullable(),reversed:z.boolean(),at:z.string().datetime({offset:true})}).strict().superRefine((row,ctx)=>{
 const time=row.kind==='time'||row.kind==='time_void',reversal=row.kind==='time_void'||row.kind==='expense_unlink';
 if(time&&(row.minutes===null||row.expenseId!==null||row.supplierName!==null||row.amountCents!==workTimeCost(row.minutes,row.hourlyCostCents))||!time&&(row.minutes!==null||row.hourlyCostCents!==null||row.expenseId===null||row.supplierName===null||row.amountCents===null||row.amountCents<1)||reversal!==(row.reversalId!==null))ctx.addIssue({code:'custom',message:'Invalid cost history entry'});
});
const candidateSchema=z.object({id:z.string().uuid(),concept:z.string().max(300),supplierName:z.string(),date:daySchema,amountCents:nonnegative.positive()}).strict();
export const workCostsRecoveryPageSchema=z.object({revision:nonnegative,fingerprint:z.string().min(1),expenseRevision:nonnegative,work:z.object({id,clientId:id,title:z.string(),cancelled:z.boolean(),clientArchived:z.boolean()}).strict(),summary:z.object({minutes:nonnegative,uncostedMinutes:nonnegative,uncostedCount:nonnegative,laborCents:nonnegative,materialCents:nonnegative,expensesCents:nonnegative,totalCostCents:nonnegative,agreedCents:nonnegative.nullable(),agreedSource:z.enum(['agreement','quote','estimate']).nullable().optional(),agreedTaxCents:nonnegative.nullable().optional(),agreedNetCents:integer.nullable().optional(),resultBasis:z.enum(['without_tax','as_agreed']).optional(),committedCents:nonnegative.optional(),resultCents:integer.nullable(),resultWithCommittedCents:integer.nullable().optional()}).strict(),items:z.array(workCostRecoveryEntrySchema).max(20),nextCursor:z.string().min(1).max(1000).nullable()}).strict().superRefine((page,ctx)=>{if(new Set(page.items.map(row=>row.id)).size!==page.items.length)ctx.addIssue({code:'custom',message:'Duplicate cost history'});});
export const workCostsRecoveryViewSchema=workCostsRecoveryPageSchema.safeExtend({items:z.array(workCostRecoveryEntrySchema).max(2000)});
const ackSchema=z.object({id:z.string().uuid(),revision:nonnegative,expenseRevision:nonnegative}).strict();
const recordSchema=z.object({schemaVersion:z.literal(1),accountId:z.string().uuid(),clientId:id,workId:id,body:z.string().max(8192),baseline:workCostRecoveryEntrySchema.nullable(),expense:candidateSchema.nullable(),supplier:z.object({id:z.string().uuid(),name:z.string().min(1)}).strict().nullable(),expenseRevision:nonnegative,phase:z.enum(['ready','uncertain','confirmed']),ack:ackSchema.nullable()}).strict();
export type WorkCostWrite=z.infer<typeof recordSchema>;
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Request=(url:string,init?:RequestInit)=>Promise<Response>;
const api='/api/pro/work-costs',order={ready:0,uncertain:1,confirmed:2};
export const workCostWriteKey=(accountId:string,clientId:string,workId:string)=>'ccr:pro:work-cost:v1:'+z.string().uuid().parse(accountId)+':'+encodeURIComponent(id.parse(clientId))+':'+encodeURIComponent(id.parse(workId));
function validateAck(record:WorkCostWrite,ack:z.infer<typeof ackSchema>){
 const input=workCostMutationSchema.parse(JSON.parse(record.body));
 if(ack.id!==input.requestId||ack.revision!==input.revision+1||ack.expenseRevision<record.expenseRevision||input.action==='create_expense'&&ack.expenseRevision!==input.expenseRevision+1||input.action==='link_expense'&&ack.expenseRevision!==input.expenseRevision)throw Error('Invalid cost acknowledgement');
}
export function parseWorkCostWrite(value:unknown,accountId:string,clientId:string,workId:string):WorkCostWrite{
 const record=recordSchema.parse(value),input=workCostMutationSchema.parse(JSON.parse(record.body));
 if(record.accountId!==z.string().uuid().parse(accountId)||record.clientId!==clientId||record.workId!==workId||input.clientId!==clientId||input.workId!==workId||JSON.stringify(input)!==record.body||(record.phase==='confirmed')!==(record.ack!==null)||JSON.stringify(record).length>30000)throw Error('Invalid cost recovery scope');
 const previous='entryId'in input;
 if(previous?(!record.baseline||record.baseline.id!==input.entryId||record.baseline.reversed||record.baseline.kind!==(input.action==='unlink_expense'?'expense':'time')):record.baseline!==null)throw Error('Invalid original cost snapshot');
 if(input.action==='link_expense'?(!record.expense||record.expense.id!==input.expenseId):record.expense!==null)throw Error('Invalid selected expense snapshot');
 if(input.action==='create_expense'?(!record.supplier||record.supplier.id!==input.supplierId):record.supplier!==null)throw Error('Invalid supplier snapshot');
 if('expenseRevision'in input&&record.expenseRevision!==input.expenseRevision)throw Error('Invalid expense revision snapshot');
 if(record.ack)validateAck(record,record.ack);
 return record;
}
export function createWorkCostWrite(accountId:string,inputValue:unknown,pageValue:unknown,options:{expense?:WorkExpenseCandidate;supplier?:{id:string;name:string}}={}):WorkCostWrite{
 const input=workCostMutationSchema.parse(inputValue),page=workCostsRecoveryViewSchema.parse(pageValue);
 if(input.workId!==page.work.id||input.clientId!==page.work.clientId||input.revision!==page.revision||'expenseRevision'in input&&input.expenseRevision!==page.expenseRevision)throw Error('Cost context changed');
 return parseWorkCostWrite({schemaVersion:1,accountId,clientId:input.clientId,workId:input.workId,body:JSON.stringify(input),baseline:'entryId'in input?page.items.find(row=>row.id===input.entryId):null,expense:input.action==='link_expense'?options.expense:null,supplier:input.action==='create_expense'&&options.supplier?{id:options.supplier.id,name:options.supplier.name}:null,expenseRevision:page.expenseRevision,phase:'ready',ack:null},accountId,input.clientId,input.workId);
}
export function readWorkCostWrite(store:Store,accountId:string,clientId:string,workId:string):WorkCostWrite|null{const raw=store.getItem(workCostWriteKey(accountId,clientId,workId));if(raw===null)return null;if(raw.length>30000)throw Error('Cost recovery too large');return parseWorkCostWrite(JSON.parse(raw),accountId,clientId,workId);}
function sameIntent(left:WorkCostWrite,right:WorkCostWrite){return left.body===right.body&&left.accountId===right.accountId&&left.clientId===right.clientId&&left.workId===right.workId&&left.expenseRevision===right.expenseRevision&&JSON.stringify(left.baseline)===JSON.stringify(right.baseline)&&JSON.stringify(left.expense)===JSON.stringify(right.expense)&&JSON.stringify(left.supplier)===JSON.stringify(right.supplier);}
export function saveWorkCostWrite(store:Store,value:WorkCostWrite){const record=parseWorkCostWrite(value,value.accountId,value.clientId,value.workId),prior=readWorkCostWrite(store,record.accountId,record.clientId,record.workId);if(prior&&(!sameIntent(prior,record)||order[prior.phase]>order[record.phase]||prior.ack&&JSON.stringify(prior.ack)!==JSON.stringify(record.ack)))throw Error('Another cost attempt exists');const key=workCostWriteKey(record.accountId,record.clientId,record.workId),raw=JSON.stringify(record);store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Cost recovery was not retained');}
export function mergeWorkCostWrite(memory:WorkCostWrite,stored:WorkCostWrite|null){const current=parseWorkCostWrite(memory,memory.accountId,memory.clientId,memory.workId);if(!stored)return current;const disk=parseWorkCostWrite(stored,current.accountId,current.clientId,current.workId);if(!sameIntent(current,disk)||current.ack&&disk.ack&&JSON.stringify(current.ack)!==JSON.stringify(disk.ack))throw Error('Cost recovery changed');return order[disk.phase]>order[current.phase]?disk:current;}
export function clearWorkCostWrite(store:Store,value:WorkCostWrite){const record=parseWorkCostWrite(value,value.accountId,value.clientId,value.workId),prior=readWorkCostWrite(store,record.accountId,record.clientId,record.workId);if(prior&&JSON.stringify(prior)!==JSON.stringify(record))throw Error('Cost recovery changed before clearing');const key=workCostWriteKey(record.accountId,record.clientId,record.workId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Cost recovery was not cleared');}
function verifyEntry(record:WorkCostWrite,row:WorkCostEntry,items:WorkCostEntry[],expenseRevision:number){
 const input=workCostMutationSchema.parse(JSON.parse(record.body));if(row.id!==input.requestId)throw Error('Wrong cost entry');
 if(input.action==='add_time'||input.action==='edit_time'){
  if(row.kind!=='time'||row.date!==input.date||row.minutes!==input.minutes||row.hourlyCostCents!==input.hourlyCostCents||row.amountCents!==workTimeCost(input.minutes,input.hourlyCostCents)||row.note!==input.note)throw Error('Time entry changed');
  if(input.action==='edit_time'&&!items.some(reversal=>reversal.kind==='time_void'&&reversal.reversalId===input.entryId&&reversal.note===input.reason&&reversal.minutes===record.baseline!.minutes&&reversal.hourlyCostCents===record.baseline!.hourlyCostCents&&reversal.amountCents===record.baseline!.amountCents))return false;
 }else if(input.action==='void_time'||input.action==='unlink_expense'){
  if(row.kind!==(input.action==='void_time'?'time_void':'expense_unlink')||row.reversalId!==input.entryId||row.note!==input.reason||row.expenseId!==record.baseline!.expenseId||row.minutes!==record.baseline!.minutes||row.hourlyCostCents!==record.baseline!.hourlyCostCents||input.action==='void_time'&&row.amountCents!==record.baseline!.amountCents)throw Error('Reversal changed');
 }else{
  if(row.kind!=='expense'||row.expenseId!==input.expenseId)throw Error('Wrong linked expense');
  // Assigned expenses deliberately expose their CURRENT metadata. A later
  // legitimate expense edit must not cause an old committed request to resend.
  if(expenseRevision===record.ack!.expenseRevision){
   const expected=input.action==='create_expense'?{date:input.date,note:input.concept,amount:input.amountCents,supplier:record.supplier!.name}:{date:record.expense!.date,note:record.expense!.concept,amount:record.expense!.amountCents,supplier:record.expense!.supplierName};
   if(row.date!==expected.date||row.note!==expected.note||row.amountCents!==expected.amount||row.supplierName!==expected.supplier)throw Error('Expense read mismatch');
  }
 }
 return true;
}
export class WorkCostWriteFailure extends Error{kind:'storage'|'uncertain'|'read'|'scope';attempt:WorkCostWrite;constructor(kind:WorkCostWriteFailure['kind'],attempt:WorkCostWrite){super(kind);this.kind=kind;this.attempt=attempt;}}
/** Replays the existing transactional receipt. Never synthesizes cost/expense records from reads. */
export async function continueWorkCostWrite({store,attempt:initial,request,currentAccount,currentClient,currentWork,onCheckpoint}:{store:Store;attempt:WorkCostWrite;request:Request;currentAccount:()=>string|undefined;currentClient:()=>string|undefined;currentWork:()=>string|undefined;onCheckpoint:(attempt:WorkCostWrite)=>void}):Promise<{status:'confirmed';attempt:WorkCostWrite;page:WorkCostsPage;entry:WorkCostEntry;newer:boolean}|{status:'rejected';attempt:WorkCostWrite;code:number}>{
 let attempt=parseWorkCostWrite(initial,initial.accountId,initial.clientId,initial.workId);
 const scope=()=>{if(currentAccount()!==attempt.accountId||currentClient()!==attempt.clientId||currentWork()!==attempt.workId)throw new WorkCostWriteFailure('scope',attempt);};
 const checkpoint=(next:WorkCostWrite)=>{attempt=next;scope();try{onCheckpoint(attempt);saveWorkCostWrite(store,attempt);}catch{throw new WorkCostWriteFailure('storage',attempt);}scope();};
 scope();checkpoint(attempt);const headers={'X-Pro-Expected-Actor':attempt.accountId};
 if(attempt.phase!=='confirmed'){
  const recovering=attempt.phase==='uncertain';checkpoint({...attempt,phase:'uncertain'});let response:Response;try{response=await request(api,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:attempt.body});}catch{throw new WorkCostWriteFailure('uncertain',attempt);}scope();
  if(!response.ok){if(!recovering&&[400,404,409,422].includes(response.status)){try{clearWorkCostWrite(store,attempt);}catch{throw new WorkCostWriteFailure('storage',attempt);}scope();return {status:'rejected',attempt,code:response.status};}throw new WorkCostWriteFailure('uncertain',attempt);}
  let ack:z.infer<typeof ackSchema>;try{ack=ackSchema.parse(await response.json());validateAck(attempt,ack);}catch{throw new WorkCostWriteFailure('uncertain',attempt);}scope();checkpoint({...attempt,phase:'confirmed',ack});
 }
 try{
  const read=async(after='')=>{scope();const response=await request(api+'?'+new URLSearchParams({clientId:attempt.clientId,workId:attempt.workId,after}),{cache:'no-store',headers});scope();if(!response.ok)throw Error();const page=workCostsRecoveryPageSchema.parse(await response.json());scope();if(page.work.id!==attempt.workId||page.work.clientId!==attempt.clientId||page.revision<attempt.ack!.revision||page.expenseRevision<attempt.ack!.expenseRevision)throw Error('Wrong cost view');return page;};
  const first=await read(),items=[...first.items],seen=new Set<string>(),seenIds=new Set(items.map(row=>row.id));let page=first;
  for(let pages=0;pages<100;pages++){
   const entry=items.find(row=>row.id===attempt.ack!.id);if(entry&&verifyEntry(attempt,entry,items,first.expenseRevision))return {status:'confirmed',attempt,page:workCostsRecoveryViewSchema.parse({...first,items,nextCursor:page.nextCursor}),entry,newer:first.revision>attempt.ack!.revision||first.expenseRevision>attempt.ack!.expenseRevision};
   if(page.nextCursor===null||seen.has(page.nextCursor))throw Error('Cost target missing');seen.add(page.nextCursor);const next=await read(page.nextCursor);if(next.fingerprint!==first.fingerprint||next.revision!==first.revision||next.expenseRevision!==first.expenseRevision||next.items.some(row=>seenIds.has(row.id)))throw Error('Cost history changed');next.items.forEach(row=>seenIds.add(row.id));items.push(...next.items);page=next;
  }throw Error('Cost history bound exceeded');
 }catch(error){if(error instanceof WorkCostWriteFailure)throw error;throw new WorkCostWriteFailure('read',attempt);}
}
