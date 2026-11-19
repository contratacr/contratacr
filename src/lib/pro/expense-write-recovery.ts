import {expenseMutationSchema,type ExpenseMutation,type ExpensePage} from './expenses';

export type ExpenseWriteStep={body:string;phase:'ready'|'uncertain'|'confirmed'|'rejected';rejection?:400|409;ack?:{id:string;revision:number}};
export type SavedExpenseWrite={version:1;accountId:string;intentId:string;steps:ExpenseWriteStep[];index:number;fields:Record<string,string>;editing:boolean};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Request=(url:string,init?:RequestInit)=>Promise<Response>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const names=new Set(['name','identification','email','phone','archived','supplierId','supplierName','supplierIdentification','supplierEmail','supplierPhone','savedSupplierName','concept','amount','date','dueDate','method','reference','note','billable','paymentMethod','vatRateBps','category']);
/** Render a date-only snapshot without the device's native date format or timezone. */
export function expenseRecoveryDay(value:string,locale:string):string{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
 const day=new Date(value+'T12:00:00Z');
 if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==value)return value;
 return new Intl.DateTimeFormat(locale==='en'?'en-US':'es-CR',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(day);
}
export const expenseWriteRecoveryKey=(accountId:string)=>`ccr:pro:expense-write:v1:${encodeURIComponent(accountId)}`;
export function expenseWriteInput(step:ExpenseWriteStep):ExpenseMutation{return expenseMutationSchema.parse(JSON.parse(step.body));}
export function expenseWriteResultId(input:ExpenseMutation){return input.action==='supplier'||input.action==='expense'?input.id:input.actionId;}
export function createExpenseWrite(accountId:string,input:ExpenseMutation,fields:Record<string,string>,editing=false,supplier?:ExpenseMutation):SavedExpenseWrite{
 const steps:ExpenseWriteStep[]=[...(supplier?[{body:JSON.stringify(expenseMutationSchema.parse(supplier)),phase:'ready' as const}]:[]),{body:JSON.stringify(expenseMutationSchema.parse(input)),phase:'ready'}];
 return validateExpenseWrite({version:1,accountId,intentId:input.actionId,steps,index:0,fields,editing},accountId);
}
/** Explicit review of a definitively rejected, never-saved expense keeps its supplier. */
export function reviewRejectedExpenseWrite(previous:SavedExpenseWrite,input:ExpenseMutation,fields:Record<string,string>):SavedExpenseWrite{
 validateExpenseWrite(previous,previous.accountId);
 if(previous.steps.length!==2||previous.index!==1||previous.steps[1].phase!=='rejected'||input.action!=='expense')throw Error('No rejected expense draft');
 const original=expenseWriteInput(previous.steps[1]);
 if(original.action!=='expense'||input.id!==original.id||input.supplierId!==original.supplierId||input.actionId===original.actionId)throw Error('Wrong reviewed expense');
 return validateExpenseWrite({...previous,intentId:input.actionId,fields,steps:[previous.steps[0],{body:JSON.stringify(expenseMutationSchema.parse(input)),phase:'ready'}]},previous.accountId);
}
export function validateExpenseWrite(value:unknown,accountId:string):SavedExpenseWrite{
 if(!accountId||!uuid.test(accountId)||!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid expense recovery scope');
 const row=value as SavedExpenseWrite;
 if(Object.keys(row).some(key=>!['version','accountId','intentId','steps','index','fields','editing'].includes(key)))throw Error('Unknown expense recovery field');
 if(row.version!==1||row.accountId!==accountId||!uuid.test(row.intentId)||typeof row.editing!=='boolean'||!Array.isArray(row.steps)||row.steps.length<1||row.steps.length>2||!Number.isInteger(row.index)||row.index<0||row.index>=row.steps.length)throw Error('Invalid expense recovery');
 if(!row.fields||typeof row.fields!=='object'||Array.isArray(row.fields)||Object.keys(row.fields).length>names.size||Object.entries(row.fields).some(([key,val])=>!names.has(key)||typeof val!=='string'||val.length>1000))throw Error('Invalid expense draft');
 const inputs=row.steps.map((step,index)=>{
  if(!step||Object.keys(step).some(key=>!['body','phase','ack','rejection'].includes(key))||typeof step.body!=='string'||step.body.length>8000||!['ready','uncertain','confirmed','rejected'].includes(step.phase))throw Error('Invalid expense step');
  const input=expenseWriteInput(step);
  if(!Number.isSafeInteger(input.revision)||JSON.stringify(input)!==step.body)throw Error('Non-canonical expense request');
  if(index<row.index&&step.phase!=='confirmed'||index>row.index&&step.phase!=='ready')throw Error('Invalid expense step order');
  if(step.phase==='confirmed'){
   if(!step.ack||step.ack.id!==expenseWriteResultId(input)||!Number.isSafeInteger(step.ack.revision)||step.ack.revision!==input.revision+1||Object.keys(step.ack).some(key=>!['id','revision'].includes(key)))throw Error('Invalid expense acknowledgement');
  }else if(step.ack!==undefined)throw Error('Unexpected expense acknowledgement');
  if(step.phase==='rejected'?(row.steps.length!==2||index!==1||![400,409].includes(step.rejection!)):step.rejection!==undefined)throw Error('Invalid definitive rejection');
  return input;
 });
 if(inputs.at(-1)!.actionId!==row.intentId)throw Error('Invalid expense intent');
 if(inputs.length===2){
  const [supplier,expense]=inputs;
  if(supplier.action!=='supplier'||expense.action!=='expense'||supplier.id!==expense.supplierId||supplier.actionId===expense.actionId)throw Error('Invalid supplier/expense chain');
  if(row.index===1&&expense.revision<row.steps[0].ack!.revision)throw Error('Invalid supplier revision');
 }
 if(JSON.stringify(row).length>32000)throw Error('Expense recovery too large');
 return row;
}
export function readExpenseWrite(store:Store,accountId:string):SavedExpenseWrite|null{
 if(!uuid.test(accountId))throw Error('Missing expense recovery scope');
 const raw=store.getItem(expenseWriteRecoveryKey(accountId));
 if(raw===null)return null;if(raw.length>32000)throw Error('Expense recovery too large');
 return validateExpenseWrite(JSON.parse(raw),accountId);
}
function sameIntent(previous:SavedExpenseWrite,next:SavedExpenseWrite){
 // A known, first-attempt rejection of the expense does not undo its saved
 // supplier. Only explicit draft review may replace that unsaved final step.
 const before=expenseWriteInput(previous.steps.at(-1)!),after=expenseWriteInput(next.steps.at(-1)!);
 if(previous.steps.length===2&&previous.index===1&&previous.steps[1].phase==='rejected'&&next.steps.length===2&&next.index===1&&next.steps[1].phase==='ready'
  &&JSON.stringify(previous.steps[0])===JSON.stringify(next.steps[0])&&before.action==='expense'&&after.action==='expense'&&before.id===after.id&&before.supplierId===after.supplierId&&previous.accountId===next.accountId)return;
 if(previous.intentId!==next.intentId||previous.accountId!==next.accountId||previous.steps.length!==next.steps.length||JSON.stringify(previous.fields)!==JSON.stringify(next.fields)||previous.editing!==next.editing||next.index<previous.index)throw Error('Another unresolved expense write');
 previous.steps.forEach((old,index)=>{
  const step=next.steps[index],order={ready:0,uncertain:1,rejected:2,confirmed:2};
  if(order[step.phase]<order[old.phase]||old.ack&&JSON.stringify(old.ack)!==JSON.stringify(step.ack))throw Error('Expense recovery cannot move backwards');
  if(old.body!==step.body){
   const before=expenseWriteInput(old),after=expenseWriteInput(step);
   const permitted=index===1&&old.phase==='ready'&&step.phase==='ready'&&before.action==='expense'&&after.action==='expense'&&JSON.stringify({...before,revision:after.revision})===step.body&&next.steps[0].phase==='confirmed'&&after.revision===next.steps[0].ack?.revision;
   if(!permitted)throw Error('Expense request bytes changed');
  }
 });
}
/** Prefer the furthest verified checkpoint without discarding an in-memory ACK. */
export function mergeExpenseWrite(disk:SavedExpenseWrite|null,memory:SavedExpenseWrite|null):SavedExpenseWrite|null{
 if(!disk)return memory;if(!memory)return disk;
 try{sameIntent(disk,memory);return memory;}catch{/* Disk may contain a later checkpoint from another tab. */}
 sameIntent(memory,disk);return disk;
}
export function saveExpenseWrite(store:Store,attempt:SavedExpenseWrite){
 validateExpenseWrite(attempt,attempt.accountId);
 const previous=readExpenseWrite(store,attempt.accountId);if(previous)sameIntent(previous,attempt);
 const raw=JSON.stringify(attempt),key=expenseWriteRecoveryKey(attempt.accountId);store.setItem(key,raw);
 if(store.getItem(key)!==raw)throw Error('Expense recovery was not retained');
}
export function clearExpenseWrite(store:Store,attempt:SavedExpenseWrite){
 const previous=readExpenseWrite(store,attempt.accountId);
 if(previous&&JSON.stringify(previous)!==JSON.stringify(attempt))throw Error('Expense recovery changed before clearing');
 const key=expenseWriteRecoveryKey(attempt.accountId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Expense recovery was not cleared');
}
export class ExpenseWriteFailure extends Error{
 constructor(public kind:'storage'|'uncertain'|'read'|'scope',public attempt:SavedExpenseWrite){super(kind);}
}
function validPage(value:unknown):value is ExpensePage{return !!value&&typeof value==='object'&&Number.isSafeInteger((value as ExpensePage).revision)&&(value as ExpensePage).revision>=0;}
/** Read the precise record, never infer payment success from a balance or one page. */
export async function verifyExpenseWriteRead(request:Request,step:ExpenseWriteStep){
 const input=expenseWriteInput(step),ack=step.ack;if(step.phase!=='confirmed'||!ack)throw Error('Read requires an acknowledgement');
 let after='',revision:number|undefined;
 const seen=new Set<string>();
 for(let page=0;page<100;page++){
  const query=new URLSearchParams({kind:input.action==='supplier'?'suppliers':'expenses',id:input.action==='supplier'||input.action==='expense'?input.id:input.expenseId,...(after?{after}:{})});
  const response=await request('/api/pro/expenses?'+query,{cache:'no-store'});if(!response.ok)throw Error('Expense read failed');
  const body:unknown=await response.json();if(!validPage(body)||body.revision<ack.revision||revision!==undefined&&revision!==body.revision)throw Error('Expense read changed');revision=body.revision;
  if(input.action==='supplier'){
   const row=body.items?.find(item=>item.id===input.id);
   if(!row||!('name' in row)||!expenseMutationSchema.safeParse({...input,name:row.name,identification:row.identification,email:row.email,phone:row.phone,archived:row.archived}).success)throw Error('Supplier not verified');
   if(body.revision===ack.revision&&(row.name!==input.name||row.identification!==input.identification||row.email!==input.email||row.phone!==input.phone||row.archived!==input.archived))throw Error('Supplier snapshot not verified');return;
  }
  if(!body.expense||body.expense.id!==(input.action==='expense'?input.id:input.expenseId))throw Error('Wrong expense');
  if(input.action==='expense'){
   const row=body.expense;
   if(!expenseMutationSchema.safeParse({...input,supplierId:row.supplierId,date:row.date,dueDate:row.dueDate,currency:row.currency,concept:row.concept,amountCents:row.amountCents}).success||!Number.isSafeInteger(row.paidCents)||row.paidCents<0||!Number.isSafeInteger(row.balanceCents)||row.balanceCents!==row.amountCents-row.paidCents)throw Error('Expense not verified');
   if(body.revision===ack.revision&&(row.supplierId!==input.supplierId||row.date!==input.date||row.dueDate!==input.dueDate||row.currency!==input.currency||row.concept!==input.concept||row.amountCents!==input.amountCents))throw Error('Expense snapshot not verified');return;
  }
  if(!Array.isArray(body.payments))throw Error('Missing expense history');
  const row=body.payments.find(item=>item.id===ack.id);
  if(row){
   if(row.kind!==(input.action==='payment'?'payment':'reverse')||row.date!==input.date||row.note!==input.note)throw Error('Wrong expense entry');
   if(input.action==='payment'&&(row.amountCents!==input.amountCents||row.method!==input.method||row.reference!==input.reference))throw Error('Wrong expense payment');
   if(input.action==='reverse'&&row.paymentId!==input.paymentId)throw Error('Wrong reversal');return;
  }
  if(!body.nextCursor||!uuid.test(body.nextCursor)||seen.has(body.nextCursor))throw Error('Expense entry was not found');
  seen.add(body.nextCursor);after=body.nextCursor;
 }
 throw Error('Expense history exceeded read limit');
}
export type ExpenseWriteOutcome={status:'complete';attempt:SavedExpenseWrite;id:string}|{status:'rejected';attempt:SavedExpenseWrite;code:400|409};
/** No network until an exact durable checkpoint exists; confirmed steps only read. */
export async function continueExpenseWrite({store,attempt:initial,request,currentAccount,onCheckpoint,onSupplierSaved}:{store:Store;attempt:SavedExpenseWrite;request:Request;currentAccount:()=>string|undefined;onCheckpoint:(attempt:SavedExpenseWrite)=>void;onSupplierSaved?:(supplier:Extract<ExpenseMutation,{action:'supplier'}>,revision:number)=>void}):Promise<ExpenseWriteOutcome>{
 let attempt=structuredClone(validateExpenseWrite(initial,initial.accountId));
 const scope=()=>{if(currentAccount()!==attempt.accountId)throw new ExpenseWriteFailure('scope',attempt);};
 const checkpoint=(next:SavedExpenseWrite)=>{attempt=next;onCheckpoint(attempt);try{saveExpenseWrite(store,attempt);}catch{throw new ExpenseWriteFailure('storage',attempt);}};
 scope();
 // Persist an explicitly reviewed ready step before marking it in flight.
 checkpoint(attempt);
 while(true){
  let step=attempt.steps[attempt.index];const input=expenseWriteInput(step);
  if(step.phase==='rejected')throw new ExpenseWriteFailure('read',attempt);
  if(step.phase!=='confirmed'){
   const recovering=step.phase==='uncertain';
   checkpoint({...attempt,steps:attempt.steps.map((value,index)=>index===attempt.index?{...value,phase:'uncertain'}:value)});scope();
   let response:Response;
   try{response=await request('/api/pro/expenses',{method:'POST',headers:{'Content-Type':'application/json'},body:attempt.steps[attempt.index].body});}catch{throw new ExpenseWriteFailure('uncertain',attempt);}
   scope();
   if(!response.ok){
    if(!recovering&&(response.status===400||response.status===409)){
     if(attempt.steps.length===2&&attempt.index===1){checkpoint({...attempt,steps:attempt.steps.map((value,index)=>index===attempt.index?{...value,phase:'rejected',rejection:response.status as 400|409}:value)});}
     else {try{clearExpenseWrite(store,attempt);}catch{throw new ExpenseWriteFailure('storage',attempt);}}
     return {status:'rejected',attempt,code:response.status};
    }
    throw new ExpenseWriteFailure('uncertain',attempt);
   }
   let ack:unknown;try{ack=await response.json();}catch{throw new ExpenseWriteFailure('uncertain',attempt);}
   if(!ack||typeof ack!=='object'||(ack as {id?:unknown}).id!==expenseWriteResultId(input)||!Number.isSafeInteger((ack as {revision?:number}).revision)||(ack as {revision:number}).revision!==input.revision+1||Object.keys(ack).some(key=>!['id','revision'].includes(key)))throw new ExpenseWriteFailure('uncertain',attempt);
   checkpoint({...attempt,steps:attempt.steps.map((value,index)=>index===attempt.index?{...value,phase:'confirmed',ack:ack as {id:string;revision:number}}:value)});step=attempt.steps[attempt.index];
  }else checkpoint(attempt);
  scope();
  try{await verifyExpenseWriteRead(request,step);}catch{throw new ExpenseWriteFailure('read',attempt);}
  scope();
  if(attempt.index+1<attempt.steps.length){
   if(input.action!=='supplier')throw new ExpenseWriteFailure('read',attempt);
   const following=expenseWriteInput(attempt.steps[attempt.index+1]);
   const next={...attempt,index:attempt.index+1,steps:attempt.steps.map((value,index)=>index===attempt.index+1?{...value,body:JSON.stringify({...following,revision:step.ack!.revision})}:value)};
   checkpoint(next);onSupplierSaved?.(input,step.ack!.revision);continue;
  }
  try{clearExpenseWrite(store,attempt);}catch{throw new ExpenseWriteFailure('storage',attempt);}
  return {status:'complete',attempt,id:step.ack!.id};
 }
}
