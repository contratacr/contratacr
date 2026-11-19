import {z} from 'zod';
import {workChangeMutation,workChangeLine,type WorkChangesPage,type WorkChange} from './work-changes';
const id=z.string().trim().min(1).max(160),timestamp=z.string().datetime({offset:true}),amount=z.number().int().min(0).max(10000000000);
export const workChangeQuerySchema=z.union([z.object({workId:id}).strict(),z.object({requestId:z.string().uuid()}).strict()]);
export type WorkChangeQuery=z.infer<typeof workChangeQuerySchema>;
export function workChangeContextKey(value:WorkChangeQuery){const query=workChangeQuerySchema.parse(value);return 'requestId' in query?'request:'+query.requestId:'work:'+query.workId;}
export const workChangeRecordSchema=z.object({id:z.string().uuid(),position:z.number().int().positive(),reason:z.string().min(1).max(500),lines:z.array(workChangeLine).min(1).max(20),baseCents:amount,deltaCents:z.number().int().min(-10000000000).max(10000000000),totalCents:amount,status:z.enum(['proposed','accepted','declined','withdrawn']),stale:z.boolean(),revision:z.number().int().positive(),recordedBy:z.enum(['provider','client']).nullable(),acceptanceNote:z.string().max(500),createdAt:timestamp,updatedAt:timestamp,scheduleDays:z.number().int().min(0).max(365).optional(),scheduleApplied:z.boolean().optional()}).strict().superRefine((row,ctx)=>{
 if(row.deltaCents!==row.lines.reduce((sum,line)=>sum+line.amountCents,0)||row.totalCents!==row.baseCents+row.deltaCents||row.status==='accepted'&&(row.recordedBy===null||row.recordedBy==='client'&&row.acceptanceNote!==''||row.recordedBy==='provider'&&row.acceptanceNote.trim().length<10)||row.status!=='accepted'&&(row.recordedBy!==null||row.acceptanceNote!==''))ctx.addIssue({code:'custom',message:'Inconsistent commercial change'});
});
export const workChangesRecoveryPageSchema=z.object({side:z.enum(['provider','client']),workId:id,service:z.string().max(160),clientLinked:z.boolean(),canPropose:z.boolean(),account:z.object({agreedCents:amount.nullable(),paidCents:z.number().int().nonnegative(),balanceCents:z.number().int()}).strict(),items:z.array(workChangeRecordSchema),nextCursor:z.number().int().positive().nullable()}).strict().superRefine((page,ctx)=>{
 if(page.items.some((row,index)=>index>0&&row.position>=page.items[index-1].position)||new Set(page.items.map(row=>row.id)).size!==page.items.length||page.nextCursor!==null&&page.nextCursor!==page.items.at(-1)?.position)ctx.addIssue({code:'custom',message:'Invalid change history order'});
});
const ackSchema=z.object({id:z.string().uuid(),revision:z.number().int().positive(),status:z.enum(['proposed','accepted','declined','withdrawn'])}).strict();
const recordSchema=z.object({schemaVersion:z.literal(1),accountId:z.string().uuid(),workId:id,query:workChangeQuerySchema,side:z.enum(['provider','client']),body:z.string().min(1).max(16384),baseline:workChangeRecordSchema.nullable(),phase:z.enum(['ready','uncertain','confirmed']),ack:ackSchema.nullable()}).strict();
export type WorkChangeWrite=z.infer<typeof recordSchema>;
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Request=(url:string,init?:RequestInit)=>Promise<Response>;
const order={ready:0,uncertain:1,confirmed:2},api='/api/pro/work-changes';
function expectedAck(input:z.infer<typeof workChangeMutation>){return {id:input.id,revision:input.action==='propose'?1:input.revision+1,status:input.action==='propose'?'proposed':input.action==='decline'?'declined':input.action==='withdraw'?'withdrawn':'accepted'};}
export const workChangeWriteKey=(accountId:string,query:WorkChangeQuery)=>'ccr:pro:work-change:v1:'+z.string().uuid().parse(accountId)+':'+('requestId' in query?'request:'+z.string().uuid().parse(query.requestId):'work:'+encodeURIComponent(id.parse(query.workId)));
export function parseWorkChangeWrite(value:unknown,accountId:string,query:WorkChangeQuery):WorkChangeWrite{
 const record=recordSchema.parse(value),input=workChangeMutation.parse(JSON.parse(record.body)),expected=expectedAck(input),responseAction=input.action==='accept'||input.action==='decline';
 if(record.accountId!==z.string().uuid().parse(accountId)||workChangeContextKey(record.query)!==workChangeContextKey(query)||'workId' in record.query&&record.query.workId!==record.workId||record.side==='client'&&!('requestId' in record.query)||responseAction!==(record.side==='client')||JSON.stringify(input)!==record.body||(record.phase==='confirmed')!==(record.ack!==null)||record.ack&&(record.ack.id!==expected.id||record.ack.revision!==expected.revision||record.ack.status!==expected.status)||JSON.stringify(record).length>40000)throw Error('Invalid work change recovery context');
 if(input.action==='propose'){if(input.workId!==record.workId||record.baseline!==null)throw Error('Wrong new change context');}
 else if(!record.baseline||record.baseline.id!==input.id||record.baseline.status!=='proposed'||record.baseline.revision!==input.revision)throw Error('Wrong existing change context');
 return record;
}
export function createWorkChangeWrite(accountId:string,inputValue:unknown,pageValue:unknown,query:WorkChangeQuery):WorkChangeWrite{
 const input=workChangeMutation.parse(inputValue),page=workChangesRecoveryPageSchema.parse(pageValue),baseline=input.action==='propose'?null:page.items.find(row=>row.id===input.id);
 if(input.action==='propose'&&(!page.canPropose||page.account.agreedCents!==input.baseCents)||input.action!=='propose'&&(!baseline||baseline.status!=='proposed'||baseline.revision!==input.revision)||input.action==='accept'&&baseline?.stale||input.action==='record_acceptance'&&baseline?.stale)throw Error('Change context is not current');
 return parseWorkChangeWrite({schemaVersion:1,accountId,workId:page.workId,query,side:page.side,body:JSON.stringify(input),baseline,phase:'ready',ack:null},accountId,query);
}
export function readWorkChangeWrite(store:Store,accountId:string,query:WorkChangeQuery):WorkChangeWrite|null{const raw=store.getItem(workChangeWriteKey(accountId,query));if(raw===null)return null;if(raw.length>40000)throw Error('Work change recovery too large');return parseWorkChangeWrite(JSON.parse(raw),accountId,query);}
function sameIntent(left:WorkChangeWrite,right:WorkChangeWrite){return left.body===right.body&&left.workId===right.workId&&left.side===right.side&&workChangeContextKey(left.query)===workChangeContextKey(right.query)&&JSON.stringify(left.baseline)===JSON.stringify(right.baseline);}
export function saveWorkChangeWrite(store:Store,value:WorkChangeWrite){const record=parseWorkChangeWrite(value,value.accountId,value.query),prior=readWorkChangeWrite(store,record.accountId,record.query);if(prior&&(!sameIntent(prior,record)||order[prior.phase]>order[record.phase]||prior.ack&&JSON.stringify(prior.ack)!==JSON.stringify(record.ack)))throw Error('Another work change attempt exists');const key=workChangeWriteKey(record.accountId,record.query),raw=JSON.stringify(record);store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Work change recovery was not retained');}
export function mergeWorkChangeWrite(memory:WorkChangeWrite,stored:WorkChangeWrite|null){const current=parseWorkChangeWrite(memory,memory.accountId,memory.query);if(!stored)return current;const disk=parseWorkChangeWrite(stored,current.accountId,current.query);if(!sameIntent(current,disk)||disk.ack&&current.ack&&JSON.stringify(disk.ack)!==JSON.stringify(current.ack))throw Error('Work change recovery changed');return order[disk.phase]>order[current.phase]?disk:current;}
export function clearWorkChangeWrite(store:Store,value:WorkChangeWrite){const record=parseWorkChangeWrite(value,value.accountId,value.query),prior=readWorkChangeWrite(store,record.accountId,record.query);if(prior&&JSON.stringify(prior)!==JSON.stringify(record))throw Error('Work change recovery changed before clearing');const key=workChangeWriteKey(record.accountId,record.query);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Work change recovery was not cleared');}
function immutable(row:WorkChange){return JSON.stringify({id:row.id,position:row.position,reason:row.reason,lines:row.lines,baseCents:row.baseCents,deltaCents:row.deltaCents,totalCents:row.totalCents,createdAt:row.createdAt});}
function verifyChange(attempt:WorkChangeWrite,row:WorkChange){
 const input=workChangeMutation.parse(JSON.parse(attempt.body)),ack=attempt.ack!;
 if(row.id!==input.id)throw Error('Wrong change target');
 if(input.action==='propose'){
  if(row.reason!==input.reason||JSON.stringify(row.lines)!==JSON.stringify(input.lines)||row.baseCents!==input.baseCents||row.revision<ack.revision||row.revision>ack.revision+1||row.revision===ack.revision&&row.status!=='proposed'||row.revision>ack.revision&&row.status==='proposed')throw Error('Proposal read mismatch');
 }else{
  if(immutable(row)!==immutable(attempt.baseline!)||row.revision!==ack.revision||row.status!==ack.status||input.action==='record_acceptance'&&(row.recordedBy!=='provider'||row.acceptanceNote!==input.note)||input.action==='accept'&&(row.recordedBy!=='client'||row.acceptanceNote!==''))throw Error('Resolved change read mismatch');
 }
}
export class WorkChangeWriteFailure extends Error{kind:'storage'|'uncertain'|'read'|'scope';attempt:WorkChangeWrite;constructor(kind:WorkChangeWriteFailure['kind'],attempt:WorkChangeWrite){super(kind);this.kind=kind;this.attempt=attempt;}}
/** Existing SQL creates an accepted agreement atomically. Never re-create ledger entries from a GET. */
export async function continueWorkChangeWrite({store,attempt:initial,request,currentAccount,currentContext,onCheckpoint}:{store:Store;attempt:WorkChangeWrite;request:Request;currentAccount:()=>string|undefined;currentContext:()=>WorkChangeQuery|undefined;onCheckpoint:(attempt:WorkChangeWrite)=>void}):Promise<{status:'confirmed';attempt:WorkChangeWrite;page:WorkChangesPage;change:WorkChange;newer:boolean}|{status:'rejected';attempt:WorkChangeWrite;code:number}>{
 let attempt=parseWorkChangeWrite(initial,initial.accountId,initial.query);
 const scope=()=>{const current=workChangeQuerySchema.safeParse(currentContext());if(currentAccount()!==attempt.accountId||!current.success||workChangeContextKey(current.data)!==workChangeContextKey(attempt.query))throw new WorkChangeWriteFailure('scope',attempt);};
 const checkpoint=(next:WorkChangeWrite)=>{attempt=next;scope();try{onCheckpoint(attempt);saveWorkChangeWrite(store,attempt);}catch{throw new WorkChangeWriteFailure('storage',attempt);}scope();};
 scope();checkpoint(attempt);const headers={'X-Pro-Expected-Actor':attempt.accountId};
 if(attempt.phase!=='confirmed'){
  const recovering=attempt.phase==='uncertain';checkpoint({...attempt,phase:'uncertain'});let response:Response;try{response=await request(api,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:attempt.body});}catch{throw new WorkChangeWriteFailure('uncertain',attempt);}scope();
  if(!response.ok){if(!recovering&&[400,404,409,422].includes(response.status)){try{clearWorkChangeWrite(store,attempt);}catch{throw new WorkChangeWriteFailure('storage',attempt);}scope();return {status:'rejected',attempt,code:response.status};}throw new WorkChangeWriteFailure('uncertain',attempt);}
  let ack:z.infer<typeof ackSchema>;try{ack=ackSchema.parse(await response.json());const expected=expectedAck(workChangeMutation.parse(JSON.parse(attempt.body)));if(ack.id!==expected.id||ack.revision!==expected.revision||ack.status!==expected.status)throw Error();}catch{throw new WorkChangeWriteFailure('uncertain',attempt);}scope();checkpoint({...attempt,phase:'confirmed',ack});
 }
 scope();try{
  const read=async(after?:number)=>{scope();const response=await request(api+'?'+new URLSearchParams({...attempt.query,...(after?{after:String(after)}:{})}),{cache:'no-store',headers});scope();if(!response.ok)throw Error();const page=workChangesRecoveryPageSchema.parse(await response.json());scope();if(page.workId!==attempt.workId||page.side!==attempt.side)throw Error('Wrong work change view');return page;};
  const first=await read(),items=[...first.items];let page=first;
  for(let pages=0;pages<100;pages++){
   const change=page.items.find(row=>row.id===attempt.ack!.id);if(change){verifyChange(attempt,change);return {status:'confirmed',attempt,page:{...first,items,nextCursor:page.nextCursor},change,newer:change.revision>attempt.ack!.revision};}
   if(page.nextCursor===null)throw Error('Change not found');const after=page.nextCursor,next=await read(after);if(next.items.some(row=>row.position>=after)||next.nextCursor!==null&&next.nextCursor>=after)throw Error('Change history cursor changed');items.push(...next.items);page=next;
  }throw Error('Work change history bound exceeded');
 }catch(error){if(error instanceof WorkChangeWriteFailure)throw error;throw new WorkChangeWriteFailure('read',attempt);}
}
