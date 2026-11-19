// Pure transport/storage contracts. No browser, server, network or database.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const sourceRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const h=await import('../../src/lib/pro/inventory-write-recovery.ts');
const uid=()=>crypto.randomUUID(),owner=uid(),other=uid();
const product=()=>({id:uid(),sku:'AUTO-'+uid(),name:'Material local',stock:3,minimum:1,cost:10,price:20,archived:false,category:'Materiales',unit:'m',cabys:'1234567890123',itemType:'product'});
const input=(row=product(),revision=0,mode='create')=>({kind:'products',revision,rows:[row],movements:[],importing:false,inventoryActionId:uid(),inventoryWriteMode:mode});
const attempt=()=>h.createInventoryWrite(owner,input());
function storage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};}
function server(){
 const receipts=new Map(),rows=new Map(),movements=new Map(),patches=[];let revision=0,fault=null,readFault=false,ackFault=null;
 const request=async(url,init)=>{
  assert.equal(init?.headers?.['X-Pro-Expected-Actor'],owner,'Every recovery write/read must bind the expected actor');
  if(init?.method==='PATCH'){
   patches.push(init.body);const body=JSON.parse(init.body);
   if(fault?.before)return Response.json({error:'Local rejection'},{status:fault.before});
   let ack=receipts.get(body.inventoryActionId);
   if(!ack){if(body.revision!==revision)return Response.json({error:'Stale revision'},{status:409});revision++;rows.set(body.rows[0].id,body.rows[0]);for(const movement of body.movements)movements.set(movement.id,movement);ack={id:body.rows[0].id,revision,movementId:body.movements[0]?.id??null};receipts.set(body.inventoryActionId,ack);}
   if(fault?.after){const status=fault.after;fault=null;return Response.json({error:'Lost response'},{status});}
   return Response.json(ackFault??ack);
  }
  if(readFault)throw Error('Read unavailable');
  const id=new URL(url,'http://local.invalid').searchParams.get('id');const movementId=new URL(url,'http://local.invalid').searchParams.get('inventoryMovement');return Response.json({userId:owner,revision,document:{products:[rows.get(id)].filter(Boolean)},...(movementId?{movement:movements.get(movementId)}:{})});
 };
 return {request,patches,rows,receipts,movements,setFault:value=>{fault=value;},setReadFault:value=>{readFault=value;},setAck:value=>{ackFault=value;},advance:()=>revision++,get revision(){return revision;}};
}
const run=(store,attempt,api,onCheckpoint=()=>{})=>h.continueInventoryWrite({store,attempt,request:api.request,currentAccount:()=>owner,onCheckpoint});
const failure=kind=>error=>error instanceof h.InventoryWriteFailure&&error.kind===kind;
{
 const store=storage(),a=attempt();h.saveInventoryWrite(store,a);assert.deepEqual(h.readInventoryWrite(store,owner),a);assert.equal(h.readInventoryWrite(store,other),null);
 for(const value of [{...a,extra:true},{...a,accountId:other},{...a,phase:'confirmed'},{...a,ack:{id:'wrong',revision:1,movementId:null}}])assert.throws(()=>h.parseInventoryWrite(value,owner));
 assert.throws(()=>h.saveInventoryWrite(store,attempt()));assert.throws(()=>h.readInventoryWrite(store,''));
 const legacy=input({...product(),id:'legacy-product'},7,'edit');assert.equal(h.createInventoryWrite(owner,legacy).phase,'ready');assert.throws(()=>h.createInventoryWrite(owner,{...legacy,inventoryWriteMode:'create'}));
 const before=store.getItem(h.inventoryWriteKey(owner));store.setItem(h.inventoryWriteKey(owner),'{corrupt');assert.throws(()=>h.saveInventoryWrite(store,a));assert.equal(store.getItem(h.inventoryWriteKey(owner)),'{corrupt');store.setItem(h.inventoryWriteKey(owner),before);
}
for(const mode of ['get','set','readback']){
 const store=storage(),api=server();let writes=0;
 if(mode==='get')store.getItem=()=>{throw Error('Denied');};
 if(mode==='set')store.setItem=()=>{throw Error('Quota');};
 if(mode==='readback'){const get=store.getItem,set=store.setItem;store.getItem=key=>writes?'changed':get(key);store.setItem=(key,value)=>{writes++;set(key,value);};}
 await assert.rejects(()=>run(store,attempt(),api),failure('storage'));assert.equal(api.patches.length,0);
}
{
 const api=server(),a=attempt();await assert.rejects(()=>h.continueInventoryWrite({store:storage(),attempt:a,request:api.request,currentAccount:()=>other,onCheckpoint:()=>{}}),failure('scope'));assert.equal(api.patches.length,0);
}
// Lost ACK, auth failures, conflict and reload never create another ID or body.
{
 const store=storage(),api=server(),a=attempt();api.setFault({after:503});await assert.rejects(()=>run(store,a,api),failure('uncertain'));const bytes=api.patches[0];
 for(const status of [401,403,400,409]){api.setFault({before:status});await assert.rejects(()=>run(store,h.readInventoryWrite(store,owner),api),failure('uncertain'));assert.equal(h.readInventoryWrite(store,owner).body,bytes);}
 api.setFault(null);const result=await run(store,h.readInventoryWrite(store,owner),api);assert.equal(result.status,'confirmed');assert.equal(api.rows.size,1);assert.equal(api.receipts.size,1);assert.equal(new Set(api.patches).size,1);assert.deepEqual(result.product,JSON.parse(a.body).rows[0]);h.clearInventoryWrite(store,result.attempt);assert.equal(h.readInventoryWrite(store,owner),null);
}
// Definitive first rejection permits review but never silently retries with a new UUID.
{
 const store=storage(),api=server(),a=attempt();api.setFault({before:409});const result=await run(store,a,api);assert.equal(result.status,'rejected');assert.equal(h.readInventoryWrite(store,owner),null);assert.equal(api.rows.size,0);assert.equal(JSON.parse(result.attempt.body).rows[0].id,JSON.parse(a.body).rows[0].id);
}
// Confirmed writes only GET after read failure, including a legitimately edited/archived current row.
{
 const store=storage(),api=server(),a=attempt();api.setReadFault(true);await assert.rejects(()=>run(store,a,api),failure('read'));const saved=h.readInventoryWrite(store,owner);assert.equal(saved.phase,'confirmed');api.setReadFault(false);api.advance();const id=saved.ack.id;api.rows.set(id,{...api.rows.get(id),name:'Later authorized edit',archived:true});const result=await run(store,saved,api);assert.equal(result.newer,true);assert.equal(result.product.name,'Later authorized edit');assert.equal(api.patches.length,1);
 assert.throws(()=>h.verifyInventoryWriteRead(saved,{userId:other,revision:2,document:{products:[result.product]}}));assert.throws(()=>h.verifyInventoryWriteRead(saved,{userId:owner,revision:1,document:{products:[result.product]}}));assert.throws(()=>h.verifyInventoryWriteRead(saved,{userId:owner,revision:2,document:{products:[{id}]}}));
}
// If ACK persistence fails, memory keeps the known result; retry must not regress to PATCH.
{
 const store=storage(),api=server(),a=attempt(),set=store.setItem;let latest=a,block=true;
 store.setItem=(key,value)=>{if(block&&JSON.parse(value).phase==='confirmed')throw Error('Late quota');set(key,value);};
 await assert.rejects(()=>run(store,a,api,value=>{latest=value;}),failure('storage'));assert.equal(latest.phase,'confirmed');assert.equal(h.readInventoryWrite(store,owner).phase,'uncertain');
 const merged=h.mergeInventoryWrite(latest,h.readInventoryWrite(store,owner));block=false;const result=await run(store,merged,api);assert.equal(api.patches.length,1);assert.equal(result.status,'confirmed');
 store.removeItem=()=>{};assert.throws(()=>h.clearInventoryWrite(store,result.attempt));assert.equal(h.readInventoryWrite(store,owner).phase,'confirmed');
}
for(const malformed of [{id:'other',revision:1},{revision:1},{id:'wrong',revision:0}]){
 const store=storage(),api=server(),a=attempt();api.setAck(malformed);await assert.rejects(()=>run(store,a,api),failure('uncertain'));assert.equal(h.readInventoryWrite(store,owner).phase,'uncertain');
}
// Stable stock delta, timestamp and movement UUID survive response loss and later stock changes.
{
 const store=storage(),api=server(),row=product(),movement={id:uid(),productId:row.id,delta:-1.125,reason:'Salida de material',at:'2026-11-08T16:00:00.000Z'};
 const value={...input({...row,stock:1.875},0,'movement'),movements:[movement]},a=h.createInventoryWrite(owner,value);
 api.setFault({after:503});await assert.rejects(()=>run(store,a,api),failure('uncertain'));const bytes=api.patches[0];api.setFault({before:401});await assert.rejects(()=>run(store,h.readInventoryWrite(store,owner),api),failure('uncertain'));
 api.setFault(null);api.advance();api.rows.set(row.id,{...row,stock:7.875,archived:true});
 const result=await run(store,h.readInventoryWrite(store,owner),api);assert.equal(result.status,'confirmed');assert.equal(result.newer,true);assert.equal(result.product.stock,7.875);assert.equal(api.movements.size,1);assert.equal(api.receipts.size,1);assert.equal(new Set(api.patches).size,1);assert.equal(JSON.parse(bytes).movements[0].at,movement.at);
 const canonical={userId:owner,revision:2,document:{products:[result.product]},movement};
 assert.equal(h.verifyInventoryWriteRead(result.attempt,canonical).newer,true);
 for(const bad of [undefined,{...movement,id:uid()},{...movement,productId:uid()},{...movement,delta:1},{...movement,at:'2026-11-08T17:00:00.000Z'},{...movement,reason:'Changed'}])assert.throws(()=>h.verifyInventoryWriteRead(result.attempt,{...canonical,movement:bad}));
 for(const invalid of [{...value,movements:[]},{...value,inventoryWriteMode:'edit'},{...value,movements:[{...movement,delta:0}]},{...value,movements:[{...movement,productId:uid()}]},{...value,rows:[{...row,itemType:'service',stock:0,minimum:0}]}])assert.throws(()=>h.createInventoryWrite(owner,invalid));
}
console.log('PASS inventory recovery: strict actor/body/IDs/SKU, durable checkpoints, no writes on storage faults, exact lost-ACK/auth/reload replay, canonical historical metadata/stock, immutable movement delta/date/reason, ACK faults and legacy IDs.');
