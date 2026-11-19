// Pure owner save/publish recovery only. No browser, DB, network, photo upload or customer acknowledgement.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const sourceRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const h=await import('../../src/lib/pro/delivery-write-recovery.ts');
const uid=()=>crypto.randomUUID(),owner=uid(),other=uid(),work='legacy-work-local';
const content={summary:'Trabajo realizado',checklist:[{label:'Instalación revisada',done:true}],recommendations:'Revisión en seis meses',photoIds:[]},note='Privado: no compartir';
const initialView=()=>({side:'provider',workId:work,canPublish:true,revision:1,draft:content,internalNote:note,photos:[],versions:[],nextCursor:null});
const publication=(view=initialView())=>h.createDeliveryWrite(owner,{action:'publish',workId:work,actionId:uid(),revision:view.revision},view);
const save=()=>h.createDeliveryWrite(owner,{action:'save',workId:work,actionId:uid(),revision:1,content:{...content,summary:'Texto actualizado'},internalNote:'Nota nueva privada'},initialView());
function storage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};}
function server(){
 let view=initialView(),fault=null,readFault=false,ackFault=null,readTransform=null;const receipts=new Map(),posts=[],reads=[];
 const version=(number,summary=content)=>({version:number,content:summary,service:'Servicio local',completedAt:'2026-11-08T10:00:00-06:00',publishedAt:'2026-11-08T16:00:00.000Z',acknowledgedAt:null});
 const request=async(url,init)=>{
  assert.equal(new Headers(init?.headers).get('x-pro-expected-actor'),owner);
  if(init?.method==='POST'){
   posts.push(init.body);const input=JSON.parse(init.body);if(fault?.before)return Response.json({error:'Local rejection'},{status:fault.before});let prior=receipts.get(input.actionId);
   if(prior){if(prior.body!==init.body)return Response.json({error:'Changed action'},{status:400});}
   else{
    if(input.revision!==view.revision)return Response.json({error:'Stale report'},{status:409});
    if(input.action==='save')view={...view,draft:input.content,internalNote:input.internalNote,revision:view.revision+1};
    else view={...view,revision:view.revision+1,versions:[version((view.versions[0]?.version??0)+1,view.draft),...view.versions]};
    prior={body:init.body,ack:{workId:work,revision:view.revision}};receipts.set(input.actionId,prior);
   }
   if(fault?.after){const status=fault.after;fault=null;return Response.json({error:'Lost acknowledgement'},{status});}return Response.json(ackFault??prior.ack);
  }
  reads.push(url);if(readFault)throw Error('Local unavailable canonical view');
  const query=new URL(url,'http://local.invalid').searchParams;assert.equal(query.get('workId'),work);const after=Number(query.get('after')||Infinity),eligible=view.versions.filter(row=>row.version<after),versions=eligible.slice(0,20),page={...view,versions,nextCursor:eligible.length>20?versions.at(-1).version:null};return Response.json(readTransform?readTransform(page,query):page);
 };
 return {request,receipts,posts,reads,get view(){return view;},setView:value=>{view=value;},setFault:value=>{fault=value;},setReadFault:value=>{readFault=value;},setAck:value=>{ackFault=value;},setReadTransform:value=>{readTransform=value;},version};
}
const run=(store,attempt,api,onCheckpoint=()=>{})=>h.continueDeliveryWrite({store,attempt,request:api.request,currentAccount:()=>owner,currentWork:()=>work,onCheckpoint});
const failure=kind=>error=>error instanceof h.DeliveryWriteFailure&&error.kind===kind;
{
 const store=storage(),attempt=publication();h.saveDeliveryWrite(store,attempt);assert.deepEqual(h.readDeliveryWrite(store,owner,work),attempt);assert.equal(h.readDeliveryWrite(store,other,work),null);assert.equal(h.readDeliveryWrite(store,owner,'different-work'),null);
 assert.throws(()=>h.parseDeliveryWrite(attempt,other,work));assert.throws(()=>h.parseDeliveryWrite(attempt,owner,'different-work'));assert.throws(()=>h.saveDeliveryWrite(store,publication()));
 for(const value of [{...attempt,unknown:true},{...attempt,phase:'confirmed'},{...attempt,baseline:{...attempt.baseline,revision:0}},{...attempt,ack:{workId:work,revision:99}}])assert.throws(()=>h.parseDeliveryWrite(value,owner,work));
 store.setItem(h.deliveryWriteKey(owner,work),'{corrupt');assert.throws(()=>h.readDeliveryWrite(store,owner,work));assert.throws(()=>h.saveDeliveryWrite(store,attempt));assert.equal(store.getItem(h.deliveryWriteKey(owner,work)),'{corrupt');
 assert.throws(()=>h.createDeliveryWrite(owner,{action:'acknowledge',requestId:uid(),version:1,actionId:uid()},initialView()));assert.throws(()=>h.createDeliveryWrite(owner,{action:'photo',workId:work,name:'photo',data:'abc',actionId:uid()},initialView()));
}
for(const mode of ['get','set','readback']){
 const store=storage(),api=server();let writes=0;if(mode==='get')store.getItem=()=>{throw Error('Denied');};if(mode==='set')store.setItem=()=>{throw Error('Quota');};if(mode==='readback'){const get=store.getItem,set=store.setItem;store.getItem=key=>writes?'changed':get(key);store.setItem=(key,value)=>{writes++;set(key,value);};}
 await assert.rejects(()=>run(store,publication(),api),failure('storage'));assert.equal(api.posts.length,0);
}
for(const changed of ['actor','work']){
 const api=server();await assert.rejects(()=>h.continueDeliveryWrite({store:storage(),attempt:publication(),request:api.request,currentAccount:()=>changed==='actor'?other:owner,currentWork:()=>changed==='work'?'different':work,onCheckpoint:()=>{}}),failure('scope'));assert.equal(api.posts.length,0);
}
// Scope changes during an in-flight response cannot adopt or clear another screen's result.
for(const changed of ['actor','work']){
 const api=server(),store=storage();let live=true;
 const request=async(url,init)=>{const response=await api.request(url,init);if(init?.method==='POST')live=false;return response;};
 await assert.rejects(()=>h.continueDeliveryWrite({store,attempt:publication(),request,currentAccount:()=>changed==='actor'&&!live?other:owner,currentWork:()=>changed==='work'&&!live?'different':work,onCheckpoint:()=>{}}),failure('scope'));
 assert.equal(api.receipts.size,1);assert.equal(h.readDeliveryWrite(store,owner,work).phase,'uncertain');
}
{
 const api=server();await assert.rejects(()=>run(storage(),publication(),api,()=>{throw Error('Mirror storage failed');}),failure('storage'));assert.equal(api.posts.length,0);
}
// An uncertain publish survives auth failures and reload, with one action and one version.
{
 const store=storage(),api=server(),a=publication();api.setFault({after:503});await assert.rejects(()=>run(store,a,api),failure('uncertain'));const bytes=api.posts[0];
 for(const status of [401,403,400,409]){api.setFault({before:status});await assert.rejects(()=>run(store,h.readDeliveryWrite(store,owner,work),api),failure('uncertain'));assert.equal(h.readDeliveryWrite(store,owner,work).body,bytes);}
 api.setFault(null);const result=await run(store,h.readDeliveryWrite(store,owner,work),api);assert.equal(result.status,'confirmed');assert.equal(result.publishedVersion,1);assert.equal(new Set(api.posts).size,1);assert.equal(api.receipts.size,1);assert.equal(api.view.versions.length,1);assert.equal(api.view.internalNote,note);assert.equal(Object.hasOwn(api.view.versions[0].content,'internalNote'),false);h.clearDeliveryWrite(store,result.attempt);assert.equal(h.readDeliveryWrite(store,owner,work),null);
 // Deliberate same-content publication is legitimate: a new action creates version 2.
 const intentional=publication(api.view),second=await run(store,intentional,api);assert.equal(second.publishedVersion,2);assert.equal(api.view.versions.length,2);assert.equal(api.receipts.size,2);assert.deepEqual(api.view.versions[0].content,api.view.versions[1].content);
}
// ACK + failed GET => persisted confirmation and only reads after reload.
for(const make of [publication,save]){
 const store=storage(),api=server(),a=make();api.setReadFault(true);await assert.rejects(()=>run(store,a,api),failure('read'));const confirmed=h.readDeliveryWrite(store,owner,work);assert.equal(confirmed.phase,'confirmed');api.setReadFault(false);const result=await run(store,confirmed,api);assert.equal(result.status,'confirmed');assert.equal(api.posts.length,1);
}
// Find the precise historical version through bounded pages, never by matching content.
{
 const store=storage(),api=server(),a=publication();api.setReadFault(true);await assert.rejects(()=>run(store,a,api),failure('read'));const confirmed=h.readDeliveryWrite(store,owner,work);api.setReadFault(false);
 api.setView({...api.view,revision:50,draft:{...content,summary:'Draft changed later'},internalNote:'Later private note',versions:Array.from({length:45},(_,index)=>api.version(45-index,index===44?content:{...content,summary:'Later version '+(45-index)}))});
 const result=await run(store,confirmed,api);assert.equal(result.publishedVersion,1);assert.equal(result.newer,true);assert.equal(result.view.versions.length,45);assert.equal(result.view.internalNote,'Later private note');assert.equal(api.posts.length,1);assert.equal(api.reads.length,4); // failed GET then three pages
 // Exact target content corruption, missing version and wrong context fail closed.
 for(const mutate of [view=>({...view,versions:view.versions.filter(row=>row.version!==1)}),view=>({...view,versions:view.versions.map(row=>row.version===1?{...row,content:{...content,summary:'Wrong target'}}:row)}),view=>({...view,workId:'different-work'}),view=>({...view,side:'client',draft:null,internalNote:null})]){
  const prior=api.view;api.setView(mutate(prior));await assert.rejects(()=>run(store,confirmed,api),failure('read'));api.setView(prior);
 }
 assert.equal(api.posts.length,1);
}
// Paging cannot silently mix draft revisions or loop on a repeated cursor.
{
 const api=server(),store=storage();api.setReadFault(true);await assert.rejects(()=>run(store,publication(),api),failure('read'));const confirmed=h.readDeliveryWrite(store,owner,work);api.setReadFault(false);api.setView({...api.view,revision:30,versions:Array.from({length:25},(_,index)=>api.version(25-index))});
 api.setReadTransform((page,query)=>query.has('after')?{...page,revision:31}:page);await assert.rejects(()=>run(store,confirmed,api),failure('read'));
 api.setReadTransform((page,query)=>query.has('after')?{...page,nextCursor:Number(query.get('after'))}:page);await assert.rejects(()=>run(store,confirmed,api),failure('read'));assert.equal(api.posts.length,1);
}
// A later draft is canonical, but an unchanged ACK revision must match exact save text/private note.
{
 const store=storage(),api=server();api.setReadFault(true);await assert.rejects(()=>run(store,save(),api),failure('read'));const confirmed=h.readDeliveryWrite(store,owner,work);api.setReadFault(false);const actual=api.view;
 api.setView({...actual,internalNote:'Wrong at same revision'});await assert.rejects(()=>run(store,confirmed,api),failure('read'));api.setView({...actual,revision:3,internalNote:'Legitimate later note'});const result=await run(store,confirmed,api);assert.equal(result.newer,true);assert.equal(result.view.internalNote,'Legitimate later note');assert.equal(api.posts.length,1);
}
{
 const store=storage(),api=server(),a=publication(),set=store.setItem;let latest=a,blocked=true;
 store.setItem=(key,value)=>{if(blocked&&JSON.parse(value).phase==='confirmed')throw Error('Late quota');set(key,value);};await assert.rejects(()=>run(store,a,api,value=>{latest=value;}),failure('storage'));assert.equal(latest.phase,'confirmed');assert.equal(h.readDeliveryWrite(store,owner,work).phase,'uncertain');blocked=false;const merged=h.mergeDeliveryWrite(latest,h.readDeliveryWrite(store,owner,work));const result=await run(store,merged,api);assert.equal(api.posts.length,1);store.removeItem=()=>{};assert.throws(()=>h.clearDeliveryWrite(store,result.attempt));assert.equal(h.readDeliveryWrite(store,owner,work).phase,'confirmed');
}
{
 const store=storage(),api=server();api.setFault({before:409});assert.equal((await run(store,publication(),api)).status,'rejected');assert.equal(h.readDeliveryWrite(store,owner,work),null);assert.equal(api.receipts.size,0);
}
for(const ack of [{workId:work,revision:1},{workId:'wrong',revision:2},{workId:work,revision:2,version:1},null]){
 const store=storage(),api=server();api.setAck(ack??{});await assert.rejects(()=>run(store,publication(),api),failure('uncertain'));assert.equal(h.readDeliveryWrite(store,owner,work).phase,'uncertain');
}
console.log('PASS report save/publish recovery: scoped exact action/body, storage fail-closed, lost ACK/auth/reload, ACK-only GET recovery, immutable exact version across pages, later canonical draft, private notes preserved, and deliberate identical-content versions still allowed. Photo/acknowledge are excluded.');
