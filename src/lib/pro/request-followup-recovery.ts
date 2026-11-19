import {z} from 'zod';
import {requestFollowupSchema,requestFollowupMutationSchema,type RequestFollowup,type RequestFollowupMutation} from './request-followups';
const recordSchema=z.object({version:z.literal(1),accountId:z.string().uuid(),requestId:z.string().uuid(),body:z.string().min(1).max(8000),phase:z.enum(['ready','uncertain','confirmed']),baseline:requestFollowupSchema,followup:requestFollowupSchema.nullable()}).strict();
export type RequestFollowupWrite=z.infer<typeof recordSchema>;
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const phases={ready:0,uncertain:1,confirmed:2};
export function requestFollowupWriteKey(accountId:string,requestId:string){return 'ccr:pro:request-followup-write:v1:'+z.string().uuid().parse(accountId)+':'+z.string().uuid().parse(requestId);}
function matchesAcknowledgement(value:RequestFollowup,input:RequestFollowupMutation,baseline:RequestFollowup){return value.requestId===input.requestId&&value.revision===input.revision+1&&value.note===(input.action==='save'?input.note:baseline.note)&&value.dueDate===(input.action==='save'?input.dueDate:baseline.dueDate)&&value.status===(input.action==='complete'?'done':input.action==='reopen'?'open':baseline.status)&&value.updatedAt!==null&&Number.isFinite(Date.parse(value.updatedAt));}
export function parseRequestFollowupWrite(value:unknown,accountId:string,requestId:string):RequestFollowupWrite{
 const record=recordSchema.parse(value),input=requestFollowupMutationSchema.parse(JSON.parse(record.body));
 if(record.accountId!==accountId||record.requestId!==requestId||input.requestId!==requestId||JSON.stringify(input)!==record.body||record.baseline.requestId!==requestId||record.baseline.revision!==input.revision||input.action==='complete'&&record.baseline.status!=='open'||input.action==='reopen'&&record.baseline.status!=='done'||(record.phase==='confirmed')!==(record.followup!==null)||record.followup&&!matchesAcknowledgement(record.followup,input,record.baseline))throw Error('Invalid follow-up recovery scope');
 return record;
}
export function createRequestFollowupWrite(accountId:string,input:RequestFollowupMutation,baseline:RequestFollowup){const body=requestFollowupMutationSchema.parse(input);return parseRequestFollowupWrite({version:1,accountId,requestId:body.requestId,body:JSON.stringify(body),baseline,phase:'ready',followup:null},accountId,body.requestId);}
export function readRequestFollowupWrite(store:Store,accountId:string,requestId:string){const raw=store.getItem(requestFollowupWriteKey(accountId,requestId));if(raw===null)return null;if(raw.length>20000)throw Error('Follow-up recovery is too large');return parseRequestFollowupWrite(JSON.parse(raw),accountId,requestId);}
export function mergeRequestFollowupWrite(first:RequestFollowupWrite,other:RequestFollowupWrite|null){const a=parseRequestFollowupWrite(first,first.accountId,first.requestId);if(!other)return a;const b=parseRequestFollowupWrite(other,a.accountId,a.requestId);if(a.body!==b.body||JSON.stringify(a.baseline)!==JSON.stringify(b.baseline)||a.followup&&b.followup&&JSON.stringify(a.followup)!==JSON.stringify(b.followup))throw Error('Different follow-up attempts');return phases[b.phase]>phases[a.phase]?b:a;}
export function saveRequestFollowupWrite(store:Store,value:RequestFollowupWrite){const record=parseRequestFollowupWrite(value,value.accountId,value.requestId),old=readRequestFollowupWrite(store,record.accountId,record.requestId);if(old&&(old.body!==record.body||JSON.stringify(old.baseline)!==JSON.stringify(record.baseline)||phases[old.phase]>phases[record.phase]||old.followup&&JSON.stringify(old.followup)!==JSON.stringify(record.followup)))throw Error('Follow-up attempt changed');const key=requestFollowupWriteKey(record.accountId,record.requestId),raw=JSON.stringify(record);store.setItem(key,raw);if(store.getItem(key)!==raw)throw Error('Follow-up attempt was not retained');}
export function clearRequestFollowupWrite(store:Store,value:RequestFollowupWrite){const record=parseRequestFollowupWrite(value,value.accountId,value.requestId),old=readRequestFollowupWrite(store,record.accountId,record.requestId);if(old&&JSON.stringify(old)!==JSON.stringify(record))throw Error('Follow-up attempt changed before clearing');const key=requestFollowupWriteKey(record.accountId,record.requestId);store.removeItem(key);if(store.getItem(key)!==null)throw Error('Follow-up attempt was not cleared');}
export class RequestFollowupWriteFailure extends Error{constructor(readonly kind:'scope'|'storage'|'uncertain'|'read',readonly attempt:RequestFollowupWrite){super(kind);}}
/** Explicit retry only. Persist before POST; confirmed attempts only re-read. */
export async function continueRequestFollowupWrite({attempt:initial,store,request,currentAccount,currentRequest,onCheckpoint}:{attempt:RequestFollowupWrite;store:Store;request:(url:string,init?:RequestInit)=>Promise<Response>;currentAccount:()=>string|undefined;currentRequest:()=>string|undefined;onCheckpoint:(value:RequestFollowupWrite)=>void}):Promise<{status:'confirmed';attempt:RequestFollowupWrite;followup:RequestFollowup}|{status:'rejected';attempt:RequestFollowupWrite;code:number}>{
 let attempt=parseRequestFollowupWrite(initial,initial.accountId,initial.requestId);
 const input=requestFollowupMutationSchema.parse(JSON.parse(attempt.body));
 const scope=()=>{if(currentAccount()!==attempt.accountId||currentRequest()!==attempt.requestId)throw new RequestFollowupWriteFailure('scope',attempt);};
 const checkpoint=(value:RequestFollowupWrite)=>{attempt=value;try{onCheckpoint(attempt);saveRequestFollowupWrite(store,attempt);}catch{throw new RequestFollowupWriteFailure('storage',attempt);}};
 scope();checkpoint(attempt);
 if(attempt.phase!=='confirmed'){
  checkpoint({...attempt,phase:'uncertain'});scope();let response:Response;
  try{response=await request('/api/pro/request-followups',{method:'POST',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':attempt.accountId},body:attempt.body});}catch{throw new RequestFollowupWriteFailure('uncertain',attempt);}
  scope();if([400,409,413,422].includes(response.status))return{status:'rejected',attempt,code:response.status};
  if(!response.ok)throw new RequestFollowupWriteFailure('uncertain',attempt);
  let followup:RequestFollowup;try{followup=requestFollowupSchema.parse((await response.json()).followup);if(!matchesAcknowledgement(followup,input,attempt.baseline))throw Error();}catch{throw new RequestFollowupWriteFailure('uncertain',attempt);}
  checkpoint({...attempt,phase:'confirmed',followup});
 }
 scope();let followup:RequestFollowup;
 try{const response=await request('/api/pro/request-followups?'+new URLSearchParams({requestId:attempt.requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':attempt.accountId}});if(!response.ok)throw Error();followup=requestFollowupSchema.parse((await response.json()).followup);if(followup.requestId!==attempt.requestId||followup.revision<attempt.followup!.revision||followup.revision===attempt.followup!.revision&&JSON.stringify(followup)!==JSON.stringify(attempt.followup))throw Error();}catch{throw new RequestFollowupWriteFailure('read',attempt);}
 scope();return{status:'confirmed',attempt,followup};
}
