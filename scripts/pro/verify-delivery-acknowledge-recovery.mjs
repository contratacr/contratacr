// Pure public-report receipt journal/transport checks; no browser, DB, network or writes outside memory.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const sourceRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const h=await import('../../src/lib/pro/delivery-acknowledge-recovery.ts'),uid=()=>crypto.randomUUID(),owner=uid(),other=uid(),requestId=uid(),work='public-report-work',receiptDate='2026-11-08T14:00:00.000Z';
const report=version=>({version,content:{summary:'Trabajo terminado '+version,checklist:[{label:'Probado',done:true}],recommendations:'Revisar después',photoIds:[]},service:'Servicio público',completedAt:'2026-11-07T10:00:00-06:00',publishedAt:'2026-11-07T16:00:00.000Z',acknowledgedAt:null});
const initial=()=>({side:'client',workId:work,canPublish:false,revision:0,draft:null,internalNote:null,photos:[],versions:[report(1)],nextCursor:null});
const create=()=>h.createDeliveryAcknowledgeWrite(owner,{action:'acknowledge',requestId,version:1,actionId:uid()},initial());
function storage(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),data};}
function server(){
 let view=initial(),before=null,after=null,readFault=false,ackFault=null,transform=null;const receipts=new Map(),posts=[],reads=[];
 const request=async(url,init)=>{
  assert.equal(new Headers(init?.headers).get('x-pro-expected-actor'),owner);
  if(init?.method==='POST'){
   posts.push(init.body);const input=JSON.parse(init.body);assert.equal(input.requestId,requestId);assert.equal(input.version,1);if(before)return Response.json({error:'Simulated denial'},{status:before});
   let prior=receipts.get(input.actionId);if(prior&&prior.body!==init.body)return Response.json({error:'Changed input'},{status:400});
   if(!prior){const target=view.versions.find(row=>row.version===input.version);target.acknowledgedAt??=receiptDate;prior={body:init.body,ack:{workId:work,version:input.version,acknowledged:true}};receipts.set(input.actionId,prior);}
   if(after){const status=after;after=null;return Response.json({error:'Lost acknowledgement'},{status});}return Response.json(ackFault??prior.ack);
  }
  reads.push(url);const query=new URL(url,'http://local.invalid').searchParams;assert.equal(query.get('requestId'),requestId);assert.equal(query.has('workId'),false);if(readFault)throw Error('Canonical unavailable');const cursor=Number(query.get('after')??Infinity),rows=view.versions.filter(row=>row.version<cursor),versions=rows.slice(0,20),page={...view,versions,nextCursor:rows.length>20?versions.at(-1).version:null};return Response.json(transform?transform(page,query):page);
 };
 return {request,posts,reads,receipts,get view(){return view;},setView:value=>{view=value;},setBefore:value=>{before=value;},setAfter:value=>{after=value;},setReadFault:value=>{readFault=value;},setAck:value=>{ackFault=value;},setTransform:value=>{transform=value;}};
}
const run=(store,attempt,api,onCheckpoint=()=>{})=>h.continueDeliveryAcknowledgeWrite({store,attempt,request:api.request,currentAccount:()=>owner,currentRequest:()=>requestId,currentWork:()=>work,onCheckpoint});
const failure=kind=>error=>error instanceof h.DeliveryAcknowledgeFailure&&error.kind===kind;
{
 const store=storage(),a=create();h.saveDeliveryAcknowledgeWrite(store,a);assert.deepEqual(h.readDeliveryAcknowledgeWrite(store,owner,requestId),a);assert.equal(h.readDeliveryAcknowledgeWrite(store,other,requestId),null);assert.equal(h.readDeliveryAcknowledgeWrite(store,owner,uid()),null);assert.throws(()=>h.readDeliveryAcknowledgeWrite(store,'',requestId));assert.throws(()=>h.saveDeliveryAcknowledgeWrite(store,create()));
 for(const value of [{...a,unknown:true},{...a,phase:'confirmed'},{...a,accountId:other},{...a,targetVersion:2},{...a,snapshot:{...a.snapshot,internalNote:'Private forbidden'}},{...a,ack:{workId:work,version:2,acknowledged:true}}])assert.throws(()=>h.parseDeliveryAcknowledgeWrite(value,owner,requestId));
 assert.equal(JSON.stringify(a).includes('internalNote'),false);store.setItem(h.deliveryAcknowledgeKey(owner,requestId),'{corrupt');assert.throws(()=>h.readDeliveryAcknowledgeWrite(store,owner,requestId));assert.throws(()=>h.saveDeliveryAcknowledgeWrite(store,a));assert.equal(store.getItem(h.deliveryAcknowledgeKey(owner,requestId)),'{corrupt');
 assert.throws(()=>h.createDeliveryAcknowledgeWrite(owner,JSON.parse(a.body),{...initial(),side:'provider',draft:{summary:'Private draft',checklist:[],recommendations:'',photoIds:[]},internalNote:'Secret'}));
}
for(const fault of ['get','set','readback']){
 const store=storage(),api=server(),a=create();let written=false;
 if(fault==='get')store.getItem=()=>{throw Error('Denied');};if(fault==='set')store.setItem=()=>{throw Error('Quota');};if(fault==='readback'){const get=store.getItem,set=store.setItem;store.getItem=key=>written?'changed':get(key);store.setItem=(key,value)=>{written=true;set(key,value);};}
 await assert.rejects(()=>run(store,a,api),failure('storage'));assert.equal(api.posts.length,0);
}
for(const field of ['account','request','work']){
 const store=storage(),api=server(),a=create();await assert.rejects(()=>h.continueDeliveryAcknowledgeWrite({store,attempt:a,request:api.request,currentAccount:()=>field==='account'?other:owner,currentRequest:()=>field==='request'?uid():requestId,currentWork:()=>field==='work'?'different':work,onCheckpoint:()=>{}}),failure('scope'));assert.equal(api.posts.length,0);
}
{
 const store=storage(),api=server(),a=create();api.setAfter(503);await assert.rejects(()=>run(store,a,api),failure('uncertain'));const body=api.posts[0],originalDate=api.view.versions[0].acknowledgedAt;
 for(const status of [401,403,400,409]){api.setBefore(status);await assert.rejects(()=>run(store,h.readDeliveryAcknowledgeWrite(store,owner,requestId),api),failure('uncertain'));assert.equal(h.readDeliveryAcknowledgeWrite(store,owner,requestId).body,body);}
 api.setBefore(null);const result=await run(store,h.readDeliveryAcknowledgeWrite(store,owner,requestId),api);assert.equal(result.status,'confirmed');assert.equal(result.acknowledgedAt,originalDate);assert.equal(api.receipts.size,1);assert.equal(api.view.versions.length,1);assert.equal(new Set(api.posts).size,1);h.clearDeliveryAcknowledgeWrite(store,result.attempt);assert.equal(h.readDeliveryAcknowledgeWrite(store,owner,requestId),null);
}
{
 const store=storage(),api=server();api.setReadFault(true);await assert.rejects(()=>run(store,create(),api),failure('read'));const saved=h.readDeliveryAcknowledgeWrite(store,owner,requestId);assert.equal(saved.phase,'confirmed');api.setReadFault(false);api.setView({...api.view,versions:[...Array.from({length:44},(_,i)=>report(45-i)),api.view.versions[0]]});const result=await run(store,saved,api);assert.equal(result.acknowledgedAt,receiptDate);assert.equal(result.view.versions.length,45);assert.equal(api.posts.length,1);assert.equal(api.reads.length,4);
 for(const change of [view=>({...view,workId:'wrong'}),view=>({...view,side:'provider'}),view=>({...view,internalNote:'Private forbidden'}),view=>({...view,versions:view.versions.map(row=>row.version===1?{...row,acknowledgedAt:null}:row)}),view=>({...view,versions:view.versions.map(row=>row.version===1?{...row,service:'Wrong immutable snapshot'}:row)}),view=>({...view,versions:view.versions.filter(row=>row.version!==1)})]){
  const prior=api.view;api.setView(change(prior));await assert.rejects(()=>run(store,saved,api),failure('read'));api.setView(prior);
 }
 assert.equal(api.posts.length,1);
}
// An earlier acknowledgement on another device remains authoritative, never replaced by local time.
{
 const store=storage(),api=server(),a=create(),earlier='2024-01-01T00:00:00.000Z';api.setView({...api.view,versions:[{...report(1),acknowledgedAt:earlier}]});assert.equal((await run(store,a,api)).acknowledgedAt,earlier);
}
{
 const store=storage(),api=server(),a=create(),set=store.setItem;let memory=a,block=true;store.setItem=(key,value)=>{if(block&&JSON.parse(value).phase==='confirmed')throw Error('ACK quota');set(key,value);};await assert.rejects(()=>run(store,a,api,next=>{memory=next;}),failure('storage'));assert.equal(memory.phase,'confirmed');assert.equal(h.readDeliveryAcknowledgeWrite(store,owner,requestId).phase,'uncertain');block=false;const result=await run(store,h.mergeDeliveryAcknowledgeWrite(memory,h.readDeliveryAcknowledgeWrite(store,owner,requestId)),api);assert.equal(api.posts.length,1);store.removeItem=()=>{};assert.throws(()=>h.clearDeliveryAcknowledgeWrite(store,result.attempt));assert.equal(h.readDeliveryAcknowledgeWrite(store,owner,requestId).phase,'confirmed');
}
for(const ack of [{},{workId:work,version:2,acknowledged:true},{workId:'wrong',version:1,acknowledged:true},{workId:work,version:1,acknowledged:false},{workId:work,version:1,acknowledged:true,date:'invented'}]){
 const store=storage(),api=server();api.setAck(ack);await assert.rejects(()=>run(store,create(),api),failure('uncertain'));assert.equal(h.readDeliveryAcknowledgeWrite(store,owner,requestId).phase,'uncertain');
}
{
 const store=storage(),api=server();api.setBefore(409);assert.equal((await run(store,create(),api)).status,'rejected');assert.equal(h.readDeliveryAcknowledgeWrite(store,owner,requestId),null);assert.equal(api.receipts.size,0);
}
console.log('PASS report acknowledgement recovery: exact public version/action, no private fields/client dates, durable lost-ACK/auth/reload, strict ACK, GET-only confirmed recovery across pages, canonical original date, actor/request/work scopes and storage fail-closed.');
