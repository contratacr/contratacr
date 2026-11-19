// Pure IDB-provider/transport simulation. No browser, external storage, network or database.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const sourceRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const h=await import('../../src/lib/pro/delivery-photo-recovery.ts'),{deliveryPhotoIndexedDB}=await import('../../src/lib/pro/delivery-photo-idb.ts');
const uid=()=>crypto.randomUUID(),owner=uid(),other=uid(),work='legacy-private-work',scope={accountId:owner,workId:work};
// Model request success separately from transaction commit. RW transactions serialize
// so the second tab observes the first intent inside its own live transaction.
function provider(config={}){
 const data=new Map();let queue=Promise.resolve(),writes=0,readbackMissing=false;
 const factory={open(name,version){assert.equal(name,'ccr-pro-delivery-photo-recovery');assert.equal(version,1);const request={};queueMicrotask(()=>{
  if(config.blocked){request.onblocked?.();return;}if(config.openError){request.error=Error('Open denied');request.onerror?.();return;}
  request.result={objectStoreNames:{contains:()=>true},close(){},transaction(storeName,mode){assert.equal(storeName,'attempts');const operations=[];let staged,active=false,finished=false,release;const tx={error:null};
   const slot=new Promise(resolve=>{release=resolve;}),previous=queue;queue=previous.then(()=>slot);
   const abort=error=>{if(finished)return;finished=true;tx.error=error??Error('Transaction aborted');queueMicrotask(()=>{tx.onerror?.();tx.onabort?.();release();});};
   tx.abort=()=>abort(Error('Explicit transaction abort'));
   const flush=()=>{if(!active||finished)return;try{while(operations.length&&!finished)operations.shift()();}catch(error){abort(error);return;}if(finished)return;
    if(mode==='readwrite'&&config.abortAfterRequest){abort(Error('Abort after request success'));return;}
    if(mode==='readwrite'){data.clear();for(const [key,value]of staged)data.set(key,value);if(config.missingReadback)readbackMissing=true;if(config.corruptReadback){const first=data.values().next().value;if(first)new Uint8Array(first.bytes)[0]^=1;}}
    finished=true;queueMicrotask(()=>{tx.oncomplete?.();release();});
   };
   const enqueue=operation=>{operations.push(operation);if(active)queueMicrotask(flush);};
   const store={keyPath:['accountId','workId'],get(key){const req={};enqueue(()=>{req.result=readbackMissing&&mode==='readonly'?(readbackMissing=false,undefined):structuredClone(staged.get(JSON.stringify(key)));req.onsuccess?.();});return req;},put(value){if(mode!=='readwrite')throw Error('Read-only transaction');writes++;if(config.failAtWrite===writes)throw new DOMException('Simulated quota','QuotaExceededError');const req={};enqueue(()=>{staged.set(JSON.stringify([value.accountId,value.workId]),structuredClone(value));req.onsuccess?.();});return req;},delete(key){const req={};enqueue(()=>{if(!config.ignoreDelete)staged.delete(JSON.stringify(key));req.onsuccess?.();});return req;}};
   tx.objectStore=()=>store;previous.then(()=>{if(finished)return;staged=new Map([...data].map(([key,value])=>[key,structuredClone(value)]));active=true;flush();});return tx;
  }};request.onsuccess?.();});return request;}};
 return {factory,data,config,get writes(){return writes;}};
}
function server(){
 const receipts=new Map(),photos=new Map(),objects=new Map(),posts=[],reads=[];let stage=null,before=null,readFault=null,ackFault=null;
 const request=async(url,init)=>{
  assert.equal(new Headers(init?.headers).get('x-pro-expected-actor'),owner);
  if(init?.method==='POST'){
   posts.push(init.body);const input=JSON.parse(init.body);if(before)return Response.json({error:'Local rejection'},{status:before});
   let receipt=receipts.get(input.actionId);if(receipt&&receipt.body!==init.body)return Response.json({error:'Changed input'},{status:400});
   if(!receipt){if(photos.size>=6)return Response.json({error:'Photo limit'},{status:429});const photo={id:input.actionId,name:input.name,ready:false};photos.set(input.actionId,photo);receipt={body:init.body,photo};receipts.set(input.actionId,receipt);}
   if(stage==='reserve'){stage=null;return Response.json({error:'Lost after reservation'},{status:503});}
   objects.set(input.actionId,new Uint8Array([255,216,255,217]));if(stage==='upload'){stage=null;return Response.json({error:'Lost after upload'},{status:503});}
   receipt.photo.ready=true;if(stage==='ready'){stage=null;return Response.json({error:'Lost ready ACK'},{status:503});}
   return Response.json(ackFault??{id:input.actionId,ready:true});
  }
  reads.push(url);const query=new URL(url,'http://local.invalid').searchParams;
  if(query.has('photo')){if(readFault==='binary')return Response.json({error:'Unavailable'},{status:503});return new Response(objects.get(query.get('photo'))??null,{status:objects.has(query.get('photo'))?200:404,headers:{'Content-Type':'image/jpeg'}});}
  if(readFault==='metadata')throw Error('Metadata unavailable');assert.equal(query.get('workId'),work);return Response.json({side:'provider',workId:work,canPublish:false,revision:0,draft:{summary:'',checklist:[],recommendations:'',photoIds:[]},internalNote:'Private note unchanged',photos:[...photos.values()],versions:[],nextCursor:null});
 };
 return {request,receipts,photos,objects,posts,reads,setStage:value=>{stage=value;},setBefore:value=>{before=value;},setReadFault:value=>{readFault=value;},setAck:value=>{ackFault=value;}};
}
const create=(bytes=new Uint8Array([0,1,2,3,253,254,255]).buffer)=>h.createDeliveryPhotoWrite(scope,{name:'evidencia local.png',type:'image/png',bytes},uid());
const run=(store,attempt,api,onCheckpoint=()=>{})=>h.continueDeliveryPhotoWrite({store,attempt,request:api.request,currentAccount:()=>owner,currentWork:()=>work,onCheckpoint});
const failure=kind=>error=>error instanceof h.DeliveryPhotoFailure&&error.kind===kind;
{
 const a=await create();assert.equal(JSON.parse(h.deliveryPhotoBody(a)).data,Buffer.from(a.bytes).toString('base64'));assert.equal(a.bytes.byteLength,7);assert.equal(Object.hasOwn(a,'data'),false);
 const p=provider(),store=deliveryPhotoIndexedDB(p.factory);await store.advance(a);assert.deepEqual(await store.read(scope),a);assert.equal(await store.read({accountId:other,workId:work}),null);assert.equal(await store.read({accountId:owner,workId:'other'}),null);await assert.rejects(()=>store.advance(awaitPromise()));
 function awaitPromise(){return {...a,actionId:uid()};}
 const raw=p.data.get(JSON.stringify([owner,work]));raw.unknown=true;await assert.rejects(()=>store.read(scope));await assert.rejects(()=>store.advance(a));assert.equal(p.data.get(JSON.stringify([owner,work])).unknown,true);
}
// The full 3 MiB boundary stays binary in IDB, including after provider recreation.
{
 const bytes=new Uint8Array(h.DELIVERY_PHOTO_LIMIT);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;const a=await create(bytes.buffer);assert.equal(JSON.parse(h.deliveryPhotoBody(a)).data,Buffer.from(bytes).toString('base64'));const p=provider(),store=deliveryPhotoIndexedDB(p.factory);await store.advance(a);assert.deepEqual(new Uint8Array((await deliveryPhotoIndexedDB(p.factory).read(scope)).bytes),bytes);assert.equal(p.data.size,1);assert.equal(typeof p.data.values().next().value.bytes,'object');
 await assert.rejects(()=>create(new ArrayBuffer(h.DELIVERY_PHOTO_LIMIT+1)));await assert.rejects(()=>h.createDeliveryPhotoWrite(scope,{name:'bad',type:'text/plain',bytes:new ArrayBuffer(1)},uid()));
}
for(const config of [{blocked:true},{openError:true},{failAtWrite:1},{abortAfterRequest:true},{missingReadback:true},{corruptReadback:true}]){
 const p=provider(config),store=deliveryPhotoIndexedDB(p.factory),api=server(),attempt=await create();await assert.rejects(()=>run(store,attempt,api),failure('storage'));assert.equal(api.posts.length,0);
}
// Every interruption resumes the same action and bytes through a new adapter (reload).
for(const stage of ['reserve','upload','ready']){
 const p=provider(),store=deliveryPhotoIndexedDB(p.factory),api=server(),a=await create();api.setStage(stage);await assert.rejects(()=>run(store,a,api),failure('uncertain'));assert.equal(api.photos.size,1);assert.equal(api.objects.size,stage==='reserve'?0:1);const original=api.posts[0];
 for(const status of [401,403,400,409]){api.setBefore(status);const resumed=await deliveryPhotoIndexedDB(p.factory).read(scope);await assert.rejects(()=>run(store,resumed,api),failure('uncertain'));assert.equal(api.posts.at(-1),original);}
 api.setBefore(null);const resumed=await deliveryPhotoIndexedDB(p.factory).read(scope),result=await run(store,resumed,api);assert.equal(result.status,'confirmed');assert.equal(api.receipts.size,1);assert.equal(api.photos.size,1);assert.equal(api.objects.size,1);assert.equal(new Set(api.posts).size,1);assert.deepEqual(result.view.draft.photoIds,[]);assert.deepEqual(result.view.versions,[]);assert.equal(result.view.internalNote,'Private note unchanged');await store.remove(result.attempt);assert.equal(await store.read(scope),null);
}
for(const fault of ['metadata','binary']){
 const p=provider(),store=deliveryPhotoIndexedDB(p.factory),api=server(),a=await create();api.setReadFault(fault);await assert.rejects(()=>run(store,a,api),failure('read'));const stored=await store.read(scope);assert.equal(stored.phase,'confirmed');api.setReadFault(null);const result=await run(deliveryPhotoIndexedDB(p.factory),stored,api);assert.equal(result.status,'confirmed');assert.equal(api.posts.length,1);
}
// The known ACK remains in memory when its transaction fails. Merge cannot send again.
{
 const p=provider({failAtWrite:3}),store=deliveryPhotoIndexedDB(p.factory),api=server(),a=await create();let memory=a;
 await assert.rejects(()=>run(store,a,api,value=>{memory=value;}),failure('storage'));assert.equal(memory.phase,'confirmed');assert.equal((await store.read(scope)).phase,'uncertain');const merged=await h.mergeDeliveryPhotoWrite(memory,await store.read(scope));p.config.failAtWrite=0;const result=await run(store,merged,api);assert.equal(result.status,'confirmed');assert.equal(api.posts.length,1);
 p.config.ignoreDelete=true;await assert.rejects(()=>store.remove(result.attempt));assert.equal((await store.read(scope)).phase,'confirmed');
}
// Atomic transactions prevent two tabs from replacing one unresolved intent.
{
 const p=provider(),left=deliveryPhotoIndexedDB(p.factory),right=deliveryPhotoIndexedDB(p.factory),a=await create(),b=await create();const result=await Promise.allSettled([left.advance(a),right.advance(b)]);assert.equal(result.filter(value=>value.status==='fulfilled').length,1);assert.equal(result.filter(value=>value.status==='rejected').length,1);const saved=await left.read(scope);assert.equal([a.actionId,b.actionId].includes(saved.actionId),true);await assert.rejects(()=>left.remove(saved.actionId===a.actionId?b:a));assert.equal((await left.read(scope)).actionId,saved.actionId);
}
for(const change of ['actor','work']){
 const p=provider(),store=deliveryPhotoIndexedDB(p.factory),api=server(),a=await create();let active=true;
 const request=async(url,init)=>{const response=await api.request(url,init);if(init?.method==='POST')active=false;return response;};await assert.rejects(()=>h.continueDeliveryPhotoWrite({store,attempt:a,request,currentAccount:()=>change==='actor'&&!active?other:owner,currentWork:()=>change==='work'&&!active?'wrong':work,onCheckpoint:()=>{}}),failure('scope'));assert.equal(api.photos.size,1);assert.equal((await store.read(scope)).phase,'uncertain');
}
for(const ack of [{id:uid(),ready:true},{ready:true},{id:uid(),ready:false}]){
 const p=provider(),store=deliveryPhotoIndexedDB(p.factory),api=server(),a=await create();api.setAck(ack);await assert.rejects(()=>run(store,a,api),failure('uncertain'));assert.equal((await store.read(scope)).phase,'uncertain');
}
// Six interrupted photo intents can all finish without using twelve slots.
{
 const p=provider(),store=deliveryPhotoIndexedDB(p.factory),api=server();
 for(let i=0;i<6;i++){const a=await create();api.setStage('reserve');await assert.rejects(()=>run(store,a,api),failure('uncertain'));const resumed=await deliveryPhotoIndexedDB(p.factory).read(scope),result=await run(store,resumed,api);assert.equal(result.status,'confirmed');await store.remove(result.attempt);}
 assert.equal(api.photos.size,6);assert.equal(api.objects.size,6);assert.equal(api.receipts.size,6);assert.equal([...api.photos.values()].every(photo=>photo.ready),true);const seventh=await create(),result=await run(store,seventh,api);assert.equal(result.status,'rejected');assert.equal(result.code,429);assert.equal(await store.read(scope),null);assert.equal(api.photos.size,6);
}
console.log('PASS photo recovery pure/IDB-provider: binary3MiB, hashes/exact-body, atomic commit/readback, quota/blocked/abort/corrupt0POST, intertab collision, reserve/upload/ready loss+auth/reload, confirmedGET-only, ACK memory, scope, six slots and no automatic publication.');
