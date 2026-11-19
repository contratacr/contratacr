// Pure work-progress save/share recovery. No browser, network, database or messages.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const sourceRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({
 resolve(specifier,context,next){return next(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);},
 load(url,context,next){if(url.startsWith(sourceRoot)&&url.endsWith('.ts'))return{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};return next(url,context);},
});
const h=await import('../../src/lib/pro/work-update-recovery.ts');
const schema=await import('../../src/lib/pro/work-updates.ts');
const uid=()=>crypto.randomUUID(),owner=uid(),other=uid(),work='local-progress-work',differentWork='another-job',recipient={id:uid(),name:'Cliente confirmado de prueba'};
const initial=()=>({id:uid(),workId:work,title:'Revisión inicial',text:'Avance privado original',revision:1,publishedRevision:null,createdAt:'2026-11-09T08:00:00.000Z',updatedAt:'2026-11-09T08:00:00.000Z'});
const content={title:'Instalación revisada',text:'Se revisó la conexión y queda pendiente instalar la tapa.'};
const modes=['create','update-private','update-shared','publish-private','publish-updated'];
function make(mode='create'){
 const baseline=mode==='create'?null:{...initial(),...['update-shared','publish-updated'].includes(mode)?{revision:3,publishedRevision:2}:{}};
 const action=mode==='create'?'create':mode.startsWith('publish')?'publish':'update';
 const input={action,workId:work,entryId:baseline?.id??uid(),actionId:uid(),revision:baseline?.revision??0,...action==='publish'?{recipientId:recipient.id}:content};
 return h.createWorkUpdateWrite(owner,input,baseline,action==='publish'?recipient:null);
}
function storage(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};}
function server(attempt){
 let entry=attempt.baseline,fault=null,readFault=false,ackTransform=null,readTransform=null,liveRecipient=recipient.id;
 const receipts=new Map(),posts=[],reads=[],publications=[];
 const request=async(url,init)=>{
  assert.equal(new Headers(init?.headers).get('x-pro-expected-actor'),owner);
  if(init?.method==='POST'){
   posts.push(init.body);const input=JSON.parse(init.body);
   if(fault?.before)return Response.json({error:'Local pre-commit response'},{status:fault.before});
   let receipt=receipts.get(input.actionId);
   if(receipt)assert.equal(receipt.body,init.body,'The exact captured retry body changed');
   else{
    if(input.revision!==(entry?.revision??0))return Response.json({error:'Stale progress'},{status:409});
    if(input.action==='publish'&&input.recipientId!==liveRecipient)return Response.json({error:'Recipient changed'},{status:409});
    entry=input.action==='create'?{id:input.entryId,workId:work,title:input.title,text:input.text,revision:1,publishedRevision:null,createdAt:'2026-11-09T08:01:00.000Z',updatedAt:'2026-11-09T08:01:00.000Z'}:{...entry,revision:entry.revision+1,updatedAt:'2026-11-09T08:01:00.000Z',...input.action==='update'?{title:input.title,text:input.text}:{publishedRevision:entry.revision+1}};
    if(input.action==='publish')publications.push({recipientId:input.recipientId,title:entry.title,text:entry.text,version:publications.length+1,entryRevision:entry.revision});
    receipt={body:init.body,entry};receipts.set(input.actionId,receipt);
   }
   if(fault?.after){const status=fault.after;fault=null;if(status==='throw')throw Error('Lost reply after commit');return Response.json({error:'Lost reply after commit'},{status});}
   return Response.json(ackTransform?ackTransform(receipt.entry):{entry:receipt.entry});
  }
  reads.push(url);const query=new URL(url,'http://local.invalid').searchParams;assert.equal(query.get('workId'),work);assert.equal(query.get('entryId'),JSON.parse(attempt.body).entryId);
  if(readFault)throw Error('Canonical progress unavailable');return Response.json(readTransform?readTransform(entry):{entry,history:[],canShare:true,recipientId:recipient.id,recipientName:recipient.name});
 };
 return{request,receipts,posts,reads,publications,get entry(){return entry;},setRecipient:value=>{liveRecipient=value;},setFault:value=>{fault=value;},setReadFault:value=>{readFault=value;},setAckTransform:value=>{ackTransform=value;},setReadTransform:value=>{readTransform=value;}};
}
const run=(store,attempt,api,onCheckpoint=()=>{})=>h.continueWorkUpdateWrite({store,attempt,request:api.request,currentAccount:()=>owner,currentWork:()=>work,onCheckpoint});
const failure=kind=>error=>error instanceof h.WorkUpdateWriteFailure&&error.kind===kind;
{
 const create=JSON.parse(make().body),publish=JSON.parse(make('publish-private').body);
 for(const invalid of [{...create,unknown:true},{...create,title:''},{...create,title:'x'.repeat(161)},{...create,text:''},{...create,text:'x'.repeat(2001)},{...create,revision:1},{...create,recipientId:recipient.id},{...publish,recipientId:'wrong-uuid'},{...publish,text:'Unexpected publish text'}])assert.equal(schema.workUpdateMutationSchema.safeParse(invalid).success,false);
 const {recipientId:omitted,...missing}=publish;assert.equal(omitted,recipient.id);assert.equal(schema.workUpdateMutationSchema.safeParse(missing).success,false);
 assert.equal(schema.workUpdateSchema.safeParse({...initial(),publishedRevision:2}).success,false);
 assert.equal(schema.workUpdatesPageSchema.safeParse({workId:work,items:[],nextCursor:null,canShare:true,recipientId:null,recipientName:null}).success,false);
}
for(const mode of modes){
 const attempt=make(mode),store=storage(),input=JSON.parse(attempt.body);h.saveWorkUpdateWrite(store,attempt);assert.deepEqual(h.readWorkUpdateWrite(store,owner,work),attempt);
 assert.equal(h.readWorkUpdateWrite(store,other,work),null);assert.equal(h.readWorkUpdateWrite(store,owner,differentWork),null);assert.throws(()=>h.parseWorkUpdateWrite(attempt,other,work));assert.throws(()=>h.parseWorkUpdateWrite(attempt,owner,differentWork));
 for(const corrupt of [{...attempt,unknown:true},{...attempt,phase:'confirmed'},{...attempt,body:attempt.body+' '},{...attempt,baseline:mode==='create'?initial():{...attempt.baseline,revision:20}}])assert.throws(()=>h.parseWorkUpdateWrite(corrupt,owner,work));
 const api=server(attempt),result=await run(store,attempt,api);assert.equal(result.status,'confirmed');assert.equal(result.entry.revision,input.revision+1);assert.equal(api.posts.length,1);assert.equal(api.receipts.size,1);
 assert.equal(result.entry.publishedRevision,input.action==='publish'?input.revision+1:attempt.baseline?.publishedRevision??null);
 for(const key of ['title','text'])assert.equal(result.entry[key],input.action==='publish'?attempt.baseline[key]:input[key]);
 assert.equal(api.publications.length,input.action==='publish'?1:0);if(input.action==='publish')assert.equal(api.publications[0].recipientId,recipient.id);
 for(const corrupt of [{...result.attempt,entry:{...result.attempt.entry,text:'Changed journal text'}},{...result.attempt,entry:{...result.attempt.entry,publishedRevision:input.action==='publish'?null:result.entry.revision}}])assert.throws(()=>h.parseWorkUpdateWrite(corrupt,owner,work));
 h.clearWorkUpdateWrite(store,result.attempt);assert.equal(h.readWorkUpdateWrite(store,owner,work),null);
}
// Publication is bound to the captured recipient and baseline, not a new screen's client.
{
 const attempt=make('publish-updated'),input=JSON.parse(attempt.body),store=storage(),key=h.workUpdateWriteKey(owner,work);
 assert.throws(()=>h.createWorkUpdateWrite(owner,input,attempt.baseline));
 assert.throws(()=>h.createWorkUpdateWrite(owner,input,attempt.baseline,{id:uid(),name:recipient.name}));
 assert.throws(()=>h.createWorkUpdateWrite(owner,input,attempt.baseline,{id:recipient.id,name:''}));
 assert.throws(()=>h.parseWorkUpdateWrite({...attempt,recipient:{...recipient,id:uid()}},owner,work));
 assert.throws(()=>h.createWorkUpdateWrite(owner,JSON.parse(make().body),null,recipient));
 h.saveWorkUpdateWrite(store,attempt);const bytes=store.getItem(key);
 const changedName={...attempt,recipient:{...recipient,name:'A different confirmation'}};
 assert.throws(()=>h.saveWorkUpdateWrite(store,changedName));assert.throws(()=>h.mergeWorkUpdateWrite(attempt,changedName));assert.equal(store.getItem(key),bytes);
 const another=uid(),retargeted=h.createWorkUpdateWrite(owner,{...input,recipientId:another},attempt.baseline,{id:another,name:'Another customer'});
 assert.throws(()=>h.saveWorkUpdateWrite(store,retargeted));assert.throws(()=>h.mergeWorkUpdateWrite(attempt,retargeted));assert.equal(store.getItem(key),bytes);
 const api=server(attempt);api.setRecipient(another);const result=await run(storage(),attempt,api);assert.equal(result.status,'rejected');assert.equal(result.code,409);assert.equal(api.publications.length,0);
}
{
 const attempt=make('update-private'),store=storage(),key=h.workUpdateWriteKey(owner,work);h.saveWorkUpdateWrite(store,attempt);const bytes=store.getItem(key),different={...attempt,baseline:{...attempt.baseline,title:'Different captured baseline'}};
 assert.throws(()=>h.saveWorkUpdateWrite(store,different));assert.throws(()=>h.mergeWorkUpdateWrite(attempt,different));assert.equal(store.getItem(key),bytes);
 assert.throws(()=>h.saveWorkUpdateWrite(store,make()));assert.equal(store.getItem(key),bytes);
 store.setItem(key,'{corrupt-progress-journal');assert.throws(()=>h.readWorkUpdateWrite(store,owner,work));assert.throws(()=>h.saveWorkUpdateWrite(store,attempt));assert.throws(()=>h.clearWorkUpdateWrite(store,attempt));assert.equal(store.getItem(key),'{corrupt-progress-journal');
}
for(const mode of ['get','set','readback']){
 const attempt=make(),store=storage(),api=server(attempt);let writes=0;
 if(mode==='get')store.getItem=()=>{throw Error('Denied');};if(mode==='set')store.setItem=()=>{throw Error('Quota');};
 if(mode==='readback'){const get=store.getItem,set=store.setItem;store.getItem=key=>writes?'changed':get(key);store.setItem=(key,value)=>{writes++;set(key,value);};}
 await assert.rejects(()=>run(store,attempt,api),failure('storage'));assert.equal(api.posts.length,0);
}
{
 const attempt=make('publish-private'),api=server(attempt);await assert.rejects(()=>run(storage(),attempt,api,()=>{throw Error('Mirror failed');}),failure('storage'));assert.equal(api.posts.length,0);assert.equal(api.publications.length,0);
}
for(const changed of ['actor','work']){
 const attempt=make(),api=server(attempt);await assert.rejects(()=>h.continueWorkUpdateWrite({store:storage(),attempt,request:api.request,currentAccount:()=>changed==='actor'?other:owner,currentWork:()=>changed==='work'?differentWork:work,onCheckpoint:()=>{}}),failure('scope'));assert.equal(api.posts.length,0);
}
for(const stage of ['POST','GET'])for(const changed of ['actor','work']){
 const attempt=make('publish-updated'),api=server(attempt),store=storage();let live=true;
 const request=async(url,init)=>{const response=await api.request(url,init);if((stage==='POST')===(init?.method==='POST'))live=false;return response;};
 await assert.rejects(()=>h.continueWorkUpdateWrite({store,attempt,request,currentAccount:()=>changed==='actor'&&!live?other:owner,currentWork:()=>changed==='work'&&!live?differentWork:work,onCheckpoint:()=>{}}),failure('scope'));
 assert.equal(api.receipts.size,1);assert.equal(api.publications.length,1);assert.equal(h.readWorkUpdateWrite(store,owner,work).phase,stage==='POST'?'uncertain':'confirmed');
}
for(const mode of modes)for(const lost of [503,'throw']){
 const attempt=make(mode),api=server(attempt),store=storage();api.setFault({after:lost});await assert.rejects(()=>run(store,attempt,api),failure('uncertain'));
 const persisted=h.readWorkUpdateWrite(store,owner,work),bytes=api.posts[0];assert.equal(persisted.phase,'uncertain');assert.equal(persisted.body,bytes);
 // A committed share must replay its original receipt, even after the live link changes.
 api.setRecipient(uid());api.setFault(null);assert.equal((await run(store,persisted,api)).status,'confirmed');assert.equal(api.receipts.size,1);assert.equal(new Set(api.posts).size,1);assert.equal(api.entry.revision,JSON.parse(bytes).revision+1);
 if(JSON.parse(bytes).action==='publish'){assert.equal(api.publications.length,1);assert.equal(api.publications[0].recipientId,recipient.id);assert.deepEqual(h.readWorkUpdateWrite(store,owner,work).recipient,recipient);}
}
for(const status of [401,403,404,429,500,503]){
 const attempt=make('publish-private'),api=server(attempt),store=storage();api.setFault({before:status});await assert.rejects(()=>run(store,attempt,api),failure('uncertain'));assert.equal(h.readWorkUpdateWrite(store,owner,work).phase,'uncertain');assert.equal(api.reads.length,0);assert.equal(api.receipts.size,0);
}
for(const status of [400,409,413,422]){
 const attempt=make(),api=server(attempt),store=storage();api.setFault({before:status});const result=await run(store,attempt,api);assert.equal(result.status,'rejected');assert.equal(result.code,status);assert.equal(api.receipts.size,0);assert.equal(api.reads.length,0);
}
for(const mode of modes)for(const mutate of [entry=>({...entry,workId:differentWork}),entry=>({...entry,id:uid()}),entry=>({...entry,revision:entry.revision+1}),entry=>({...entry,title:'Wrong action title'}),entry=>({...entry,text:'Wrong action text'}),entry=>({...entry,publishedRevision:entry.publishedRevision===null?entry.revision:null}),entry=>({...entry,updatedAt:'invalid'})]){
 const attempt=make(mode),api=server(attempt),store=storage();api.setAckTransform(entry=>({entry:mutate(entry)}));await assert.rejects(()=>run(store,attempt,api),failure('uncertain'));assert.equal(h.readWorkUpdateWrite(store,owner,work).phase,'uncertain');assert.equal(api.reads.length,0);
}
for(const payload of [null,{}, {entry:null},{entry:{}}]){
 const attempt=make(),api=server(attempt),store=storage();api.setAckTransform(()=>payload);await assert.rejects(()=>run(store,attempt,api),failure('uncertain'));assert.equal(h.readWorkUpdateWrite(store,owner,work).phase,'uncertain');
}
for(const mode of modes){
 const attempt=make(mode),api=server(attempt),store=storage();api.setReadFault(true);await assert.rejects(()=>run(store,attempt,api),failure('read'));const confirmed=h.readWorkUpdateWrite(store,owner,work);assert.equal(confirmed.phase,'confirmed');api.setReadFault(false);
 assert.equal((await run(store,confirmed,api)).status,'confirmed');assert.equal(api.posts.length,1);
 for(const mutate of [entry=>({...entry,workId:differentWork}),entry=>({...entry,id:uid()}),entry=>({...entry,revision:entry.revision-1}),entry=>({...entry,text:'Wrong text at same revision'}),entry=>({...entry,updatedAt:'2026-11-09T08:02:00.000Z'})]){
  api.setReadTransform(entry=>({entry:mutate(entry)}));await assert.rejects(()=>run(store,confirmed,api),failure('read'));assert.equal(api.posts.length,1);
 }
 api.setReadTransform(entry=>({entry:{...entry,text:'Legitimate later private text',revision:entry.revision+1}}));assert.equal((await run(store,confirmed,api)).entry.text,'Legitimate later private text');assert.equal(api.posts.length,1);
}
{
 const attempt=make('publish-updated'),api=server(attempt),store=storage(),set=store.setItem;let latest=attempt,denied=true;
 store.setItem=(key,value)=>{if(denied&&JSON.parse(value).phase==='confirmed')throw Error('Late quota');set(key,value);};await assert.rejects(()=>run(store,attempt,api,value=>{latest=value;}),failure('storage'));
 assert.equal(latest.phase,'confirmed');assert.equal(h.readWorkUpdateWrite(store,owner,work).phase,'uncertain');denied=false;
 const result=await run(store,h.mergeWorkUpdateWrite(latest,h.readWorkUpdateWrite(store,owner,work)),api);assert.equal(api.posts.length,1);assert.equal(api.publications.length,1);assert.deepEqual(result.attempt.recipient,recipient);
 store.removeItem=()=>{};assert.throws(()=>h.clearWorkUpdateWrite(store,result.attempt));assert.equal(h.readWorkUpdateWrite(store,owner,work).phase,'confirmed');
}
console.log('PASS work-progress recovery: private create/update, explicit publish with captured recipient, revision/published-revision semantics, exact retries and original committed recipient, storage fail-closed, corrupt/conflicting journals, actor/work in-flight scope, uncertain auth/rate-limit responses, definite rejections, exact ACK/canonical reads and GET-only confirmed recovery. Pure: no DB/network/browser/messages.');

assert.equal(schema.workUpdateTitleFromText('a'.repeat(159)+'😀'),'a'.repeat(159));
assert.equal(schema.workUpdateTitleFromText('a'.repeat(158)+'😀'),'a'.repeat(158)+'😀');
assert.equal(schema.workUpdateTitleFromText('  Primer avance\nNota privada  '),'Primer avance');
assert.equal(schema.workUpdateTitleFromText('😀'.repeat(90)),'😀'.repeat(80));
