// Pure commercial-change recovery and ledger-semantics simulation. No browser/DB/network.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const root=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(root)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const h=await import('../../src/lib/pro/work-change-recovery.ts'),uid=()=>crypto.randomUUID(),owner=uid(),customer=uid(),requestId=uid(),work='legacy-change-work',query={workId:work},clientQuery={requestId};
const lines=[{description:'Nuevo tomacorriente',amountCents:2000}];
const change=(position=1)=>({id:uid(),position,reason:'Ajuste adicional',lines,baseCents:100000,deltaCents:2000,totalCents:102000,status:'proposed',stale:false,revision:1,recordedBy:null,acceptanceNote:'',createdAt:'2026-11-08T12:00:00.000Z',updatedAt:'2026-11-08T12:00:00.000Z'});
const page=(side='provider',items=[])=>({side,workId:work,service:'Servicio local',clientLinked:true,canPropose:side==='provider',account:{agreedCents:100000,paidCents:1000,balanceCents:99000},items,nextCursor:null});
const propose=()=>({action:'propose',id:uid(),actionId:uid(),workId:work,baseCents:100000,reason:'Ajuste adicional',lines});
const create=()=>h.createWorkChangeWrite(owner,propose(),page(),query);
function storage(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),data};}
function server(side='provider',rows=[]){
 const actor=side==='provider'?owner:customer,receipts=new Map(),posts=[],reads=[],agreements=[{id:'original',amountCents:100000}],payments=[{id:'original-payment',amountCents:1000}];let current=page(side,structuredClone(rows)),before=null,after=null,readFault=false,ackFault=null,transform=null;
 const request=async(url,init)=>{
  assert.equal(new Headers(init?.headers).get('x-pro-expected-actor'),actor);
  if(init?.method==='POST'){
   posts.push(init.body);const input=JSON.parse(init.body);if(before)return Response.json({error:'Local denial'},{status:before});let prior=receipts.get(input.actionId);
   if(prior&&prior.body!==init.body)return Response.json({error:'Changed retry'},{status:400});
   if(!prior){let row=current.items.find(row=>row.id===input.id);
    if(input.action==='propose'){
     if(current.items.some(row=>row.status==='proposed')||current.account.agreedCents!==input.baseCents)return Response.json({error:'Changed agreement'},{status:409});
     row={...change(Math.max(0,...current.items.map(row=>row.position))+1),id:input.id,reason:input.reason,lines:input.lines,baseCents:input.baseCents,deltaCents:input.lines.reduce((sum,line)=>sum+line.amountCents,0),totalCents:input.baseCents+input.lines.reduce((sum,line)=>sum+line.amountCents,0)};current.items.unshift(row);
    }else{
     if(!row||row.status!=='proposed'||row.revision!==input.revision)return Response.json({error:'Changed row'},{status:409});
     row.status=['accept','record_acceptance'].includes(input.action)?'accepted':input.action==='decline'?'declined':'withdrawn';row.revision++;
     if(row.status==='accepted'){row.recordedBy=input.action==='accept'?'client':'provider';row.acceptanceNote=input.action==='record_acceptance'?input.note:'';agreements.push({id:input.actionId,amountCents:row.totalCents});current.account={agreedCents:row.totalCents,paidCents:1000,balanceCents:row.totalCents-1000};}
    }
    prior={body:init.body,ack:{id:row.id,revision:row.revision,status:row.status}};receipts.set(input.actionId,prior);
   }
   if(after){const status=after;after=null;return Response.json({error:'Lost ACK'},{status});}return Response.json(ackFault??prior.ack);
  }
  reads.push(url);if(readFault)throw Error('Canonical unavailable');const q=new URL(url,'http://local.invalid').searchParams;if(side==='client')assert.equal(q.get('requestId'),requestId);else assert.equal(q.get('workId'),work);const cursor=Number(q.get('after')??Infinity),items=current.items.filter(row=>row.position<cursor).slice(0,20),all=current.items.filter(row=>row.position<cursor),value={...current,items,nextCursor:all.length>20?items.at(-1).position:null};return Response.json(transform?transform(value,q):value);
 };
 return {request,receipts,posts,reads,agreements,payments,get page(){return current;},setPage:value=>{current=value;},setBefore:value=>{before=value;},setAfter:value=>{after=value;},setReadFault:value=>{readFault=value;},setAck:value=>{ackFault=value;},setTransform:value=>{transform=value;}};
}
const run=(store,attempt,api,onCheckpoint=()=>{})=>h.continueWorkChangeWrite({store,attempt,request:api.request,currentAccount:()=>attempt.accountId,currentContext:()=>attempt.query,onCheckpoint});
const failure=kind=>error=>error instanceof h.WorkChangeWriteFailure&&error.kind===kind;
{
 const a=create(),store=storage();h.saveWorkChangeWrite(store,a);assert.deepEqual(h.readWorkChangeWrite(store,owner,query),a);assert.equal(h.readWorkChangeWrite(store,customer,query),null);assert.throws(()=>h.saveWorkChangeWrite(store,create()));
 for(const value of [{...a,extra:true},{...a,accountId:customer},{...a,side:'client'},{...a,phase:'confirmed'},{...a,query:clientQuery},{...a,ack:{id:uid(),revision:1,status:'proposed'}}])assert.throws(()=>h.parseWorkChangeWrite(value,owner,query));
 store.setItem(h.workChangeWriteKey(owner,query),'{corrupt');assert.throws(()=>h.readWorkChangeWrite(store,owner,query));assert.throws(()=>h.saveWorkChangeWrite(store,a));assert.equal(store.getItem(h.workChangeWriteKey(owner,query)),'{corrupt');
}
for(const mode of ['get','set','readback']){
 const store=storage(),api=server(),a=create();let written=false;if(mode==='get')store.getItem=()=>{throw Error('Denied');};if(mode==='set')store.setItem=()=>{throw Error('Quota');};if(mode==='readback'){const get=store.getItem,set=store.setItem;store.getItem=key=>written?'bad':get(key);store.setItem=(key,value)=>{written=true;set(key,value);};}await assert.rejects(()=>run(store,a,api),failure('storage'));assert.equal(api.posts.length,0);
}
for(const action of ['propose','record_acceptance','accept','decline','withdraw']){
 const base=change(),side=['accept','decline'].includes(action)?'client':'provider',actor=side==='client'?customer:owner,ctx=side==='client'?clientQuery:query,api=server(side,action==='propose'?[]:[base]),input=action==='propose'?propose():{action,id:base.id,actionId:uid(),revision:base.revision,...(action==='record_acceptance'?{note:'Customer approved by phone today.'}:{})},a=h.createWorkChangeWrite(actor,input,api.page,ctx),store=storage();
 api.setAfter(503);await assert.rejects(()=>run(store,a,api),failure('uncertain'));const body=api.posts[0];
 for(const status of [401,403,400,409]){api.setBefore(status);await assert.rejects(()=>run(store,h.readWorkChangeWrite(store,actor,ctx),api),failure('uncertain'));assert.equal(h.readWorkChangeWrite(store,actor,ctx).body,body);}
 api.setBefore(null);const result=await run(store,h.readWorkChangeWrite(store,actor,ctx),api);assert.equal(result.status,'confirmed');assert.equal(api.receipts.size,1);assert.equal(api.page.items.length,1);assert.equal(new Set(api.posts).size,1);assert.equal(api.agreements.length,['accept','record_acceptance'].includes(action)?2:1);assert.deepEqual(api.payments,[{id:'original-payment',amountCents:1000}]);if(result.change.status==='accepted'){assert.equal(api.agreements[1].id,input.actionId);assert.equal(api.agreements[1].amountCents,102000);}h.clearWorkChangeWrite(store,result.attempt);assert.equal(h.readWorkChangeWrite(store,actor,ctx),null);
}
// The original proposal can legitimately be accepted later. Do not overwrite its terminal result.
{
 const store=storage(),api=server(),a=create();api.setReadFault(true);await assert.rejects(()=>run(store,a,api),failure('read'));const saved=h.readWorkChangeWrite(store,owner,query),target=api.page.items[0];api.setReadFault(false);target.status='accepted';target.revision=2;target.recordedBy='client';api.setPage({...api.page,account:{agreedCents:110000,paidCents:5000,balanceCents:105000},items:[...Array.from({length:24},(_,i)=>({...change(25-i),status:'withdrawn',revision:2})),target]});const result=await run(store,saved,api);assert.equal(result.newer,true);assert.equal(result.change.status,'accepted');assert.equal(result.page.items.length,25);assert.equal(result.page.account.agreedCents,110000);assert.equal(api.posts.length,1);assert.equal(api.reads.length,3);
 for(const mutate of [page=>({...page,workId:'wrong'}),page=>({...page,side:'client'}),page=>({...page,items:page.items.map(row=>row.id===target.id?{...row,reason:'Wrong immutable reason'}:row)}),page=>({...page,items:page.items.filter(row=>row.id!==target.id)})]){const prior=api.page;api.setPage(mutate(prior));await assert.rejects(()=>run(store,saved,api),failure('read'));api.setPage(prior);}assert.equal(api.posts.length,1);
}
{
 const base=change(),input={action:'record_acceptance',id:base.id,actionId:uid(),revision:1,note:'Received phone approval today.'},api=server('provider',[base]),store=storage(),a=h.createWorkChangeWrite(owner,input,api.page,query);api.setReadFault(true);await assert.rejects(()=>run(store,a,api),failure('read'));const confirmed=h.readWorkChangeWrite(store,owner,query);api.setReadFault(false);api.setPage({...api.page,account:{agreedCents:120000,paidCents:3000,balanceCents:117000}});const result=await run(store,confirmed,api);assert.equal(result.change.acceptanceNote,input.note);assert.equal(api.posts.length,1);assert.equal(api.agreements.length,2);assert.equal(result.page.account.agreedCents,120000);
}
{
 const api=server(),a=create(),store=storage(),set=store.setItem;let memory=a,blocked=true;store.setItem=(key,value)=>{if(blocked&&JSON.parse(value).phase==='confirmed')throw Error('ACK quota');set(key,value);};await assert.rejects(()=>run(store,a,api,next=>{memory=next;}),failure('storage'));assert.equal(memory.phase,'confirmed');blocked=false;const result=await run(store,h.mergeWorkChangeWrite(memory,h.readWorkChangeWrite(store,owner,query)),api);assert.equal(api.posts.length,1);store.removeItem=()=>{};assert.throws(()=>h.clearWorkChangeWrite(store,result.attempt));
}
for(const field of ['account','context']){
 const api=server(),a=create();await assert.rejects(()=>h.continueWorkChangeWrite({store:storage(),attempt:a,request:api.request,currentAccount:()=>field==='account'?customer:owner,currentContext:()=>field==='context'?{workId:'wrong'}:query,onCheckpoint:()=>{}}),failure('scope'));assert.equal(api.posts.length,0);
}
for(const ack of [{},{id:uid(),revision:1,status:'proposed'},{id:uid(),revision:2,status:'accepted'}]){const api=server(),store=storage();api.setAck(ack);await assert.rejects(()=>run(store,create(),api),failure('uncertain'));assert.equal(h.readWorkChangeWrite(store,owner,query).phase,'uncertain');}
{
 const api=server(),store=storage();api.setBefore(409);assert.equal((await run(store,create(),api)).status,'rejected');assert.equal(h.readWorkChangeWrite(store,owner,query),null);assert.equal(api.receipts.size,0);
}
console.log('PASS work changes: all five actions exact ACK/target/snapshot, durable lost-ACK/auth/reload, confirmed GET-only/pagination, later terminal/account preserved, one accepted agreement per action, no payment mutations, storage fail-closed and actor/context isolation.');
