// Pure transport/storage contracts. No browser, server, network or database.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const sourceRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const h=await import('../../src/lib/pro/client-write-recovery.ts');
const uid=()=>crypto.randomUUID(),owner=uid(),other=uid();
const client=()=>({id:uid(),name:'Cliente sin identificación',email:'local@example.test',phone:'+50688881111',notes:'Conservar\nsegunda línea',archived:false,tradeName:'Comercial',group:'Frecuentes',address:'Dirección original'});
const input=(row=client(),revision=0,mode='create')=>({kind:'clients',revision,rows:[row],movements:[],importing:false,clientActionId:uid(),clientWriteMode:mode});
const attempt=()=>h.createClientWrite(owner,input());
function storage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};}
function server(){
 const receipts=new Map(),rows=new Map(),patches=[];let revision=0,fault=null,readFault=false,ackFault=null;
 const request=async(url,init)=>{
  assert.equal(init?.headers?.['X-Pro-Expected-Actor'],owner,'Every recovery write/read must bind the expected actor');
  if(init?.method==='PATCH'){
   patches.push(init.body);const body=JSON.parse(init.body);
   if(fault?.before)return Response.json({error:'Local rejection'},{status:fault.before});
   let ack=receipts.get(body.clientActionId);
   if(!ack){if(body.revision!==revision)return Response.json({error:'Stale revision'},{status:409});revision++;rows.set(body.rows[0].id,body.rows[0]);ack={id:body.rows[0].id,revision};receipts.set(body.clientActionId,ack);}
   if(fault?.after){const status=fault.after;fault=null;return Response.json({error:'Lost response'},{status});}
   return Response.json(ackFault??ack);
  }
  if(readFault)throw Error('Read unavailable');
  const id=new URL(url,'http://local.invalid').searchParams.get('id');return Response.json({userId:owner,revision,document:{clients:[rows.get(id)].filter(Boolean)}});
 };
 return {request,patches,rows,receipts,setFault:value=>{fault=value;},setReadFault:value=>{readFault=value;},setAck:value=>{ackFault=value;},advance:()=>revision++,get revision(){return revision;}};
}
const run=(store,attempt,api,onCheckpoint=()=>{})=>h.continueClientWrite({store,attempt,request:api.request,currentAccount:()=>owner,onCheckpoint});
const failure=kind=>error=>error instanceof h.ClientWriteFailure&&error.kind===kind;
{
 const store=storage(),a=attempt();h.saveClientWrite(store,a);assert.deepEqual(h.readClientWrite(store,owner),a);assert.equal(h.readClientWrite(store,other),null);
 for(const value of [{...a,extra:true},{...a,accountId:other},{...a,phase:'confirmed'},{...a,ack:{id:'wrong',revision:1}}])assert.throws(()=>h.parseClientWrite(value,owner));
 assert.throws(()=>h.saveClientWrite(store,attempt()));assert.throws(()=>h.readClientWrite(store,''));
 const legacy=input({...client(),id:'reservation-legacy-id'},7,'edit');assert.equal(h.createClientWrite(owner,legacy).phase,'ready');assert.throws(()=>h.createClientWrite(owner,{...legacy,clientWriteMode:'create'}));
 const before=store.getItem(h.clientWriteKey(owner));store.setItem(h.clientWriteKey(owner),'{corrupt');assert.throws(()=>h.saveClientWrite(store,a));assert.equal(store.getItem(h.clientWriteKey(owner)),'{corrupt');store.setItem(h.clientWriteKey(owner),before);
}
for(const mode of ['get','set','readback']){
 const store=storage(),api=server();let writes=0;
 if(mode==='get')store.getItem=()=>{throw Error('Denied');};
 if(mode==='set')store.setItem=()=>{throw Error('Quota');};
 if(mode==='readback'){const get=store.getItem,set=store.setItem;store.getItem=key=>writes?'changed':get(key);store.setItem=(key,value)=>{writes++;set(key,value);};}
 await assert.rejects(()=>run(store,attempt(),api),failure('storage'));assert.equal(api.patches.length,0);
}
{
 const api=server(),a=attempt();await assert.rejects(()=>h.continueClientWrite({store:storage(),attempt:a,request:api.request,currentAccount:()=>other,onCheckpoint:()=>{}}),failure('scope'));assert.equal(api.patches.length,0);
}
// Lost ACK, auth failures, conflict and reload never create another ID or body.
{
 const store=storage(),api=server(),a=attempt();api.setFault({after:503});await assert.rejects(()=>run(store,a,api),failure('uncertain'));const bytes=api.patches[0];
 for(const status of [401,403,400,409]){api.setFault({before:status});await assert.rejects(()=>run(store,h.readClientWrite(store,owner),api),failure('uncertain'));assert.equal(h.readClientWrite(store,owner).body,bytes);}
 api.setFault(null);const result=await run(store,h.readClientWrite(store,owner),api);assert.equal(result.status,'confirmed');assert.equal(api.rows.size,1);assert.equal(api.receipts.size,1);assert.equal(new Set(api.patches).size,1);assert.deepEqual(result.client,JSON.parse(a.body).rows[0]);h.clearClientWrite(store,result.attempt);assert.equal(h.readClientWrite(store,owner),null);
}
// Definitive first rejection permits review but never silently retries with a new UUID.
{
 const store=storage(),api=server(),a=attempt();api.setFault({before:409});const result=await run(store,a,api);assert.equal(result.status,'rejected');assert.equal(h.readClientWrite(store,owner),null);assert.equal(api.rows.size,0);assert.equal(JSON.parse(result.attempt.body).rows[0].id,JSON.parse(a.body).rows[0].id);
}
// Confirmed writes only GET after read failure, including a legitimately edited/archived current row.
{
 const store=storage(),api=server(),a=attempt();api.setReadFault(true);await assert.rejects(()=>run(store,a,api),failure('read'));const saved=h.readClientWrite(store,owner);assert.equal(saved.phase,'confirmed');api.setReadFault(false);api.advance();const id=saved.ack.id;api.rows.set(id,{...api.rows.get(id),name:'Later authorized edit',archived:true});const result=await run(store,saved,api);assert.equal(result.newer,true);assert.equal(result.client.name,'Later authorized edit');assert.equal(api.patches.length,1);
 assert.throws(()=>h.verifyClientWriteRead(saved,{userId:other,revision:2,document:{clients:[result.client]}}));assert.throws(()=>h.verifyClientWriteRead(saved,{userId:owner,revision:1,document:{clients:[result.client]}}));assert.throws(()=>h.verifyClientWriteRead(saved,{userId:owner,revision:2,document:{clients:[{id}]}}));
}
// If ACK persistence fails, memory keeps the known result; retry must not regress to PATCH.
{
 const store=storage(),api=server(),a=attempt(),set=store.setItem;let latest=a,block=true;
 store.setItem=(key,value)=>{if(block&&JSON.parse(value).phase==='confirmed')throw Error('Late quota');set(key,value);};
 await assert.rejects(()=>run(store,a,api,value=>{latest=value;}),failure('storage'));assert.equal(latest.phase,'confirmed');assert.equal(h.readClientWrite(store,owner).phase,'uncertain');
 const merged=h.mergeClientWrite(latest,h.readClientWrite(store,owner));block=false;const result=await run(store,merged,api);assert.equal(api.patches.length,1);assert.equal(result.status,'confirmed');
 store.removeItem=()=>{};assert.throws(()=>h.clearClientWrite(store,result.attempt));assert.equal(h.readClientWrite(store,owner).phase,'confirmed');
}
for(const malformed of [{id:'other',revision:1},{revision:1},{id:'wrong',revision:0}]){
 const store=storage(),api=server(),a=attempt();api.setAck(malformed);await assert.rejects(()=>run(store,a,api),failure('uncertain'));assert.equal(h.readClientWrite(store,owner).phase,'uncertain');
}
console.log('PASS customer recovery: strict actor/ID/body, durable checkpoints, no writes on storage faults, exact lost-ACK/auth/reload retry, first conflict, read-only confirmed recovery, newer canonical edits, ACK storage failure, no overwrite and legacy IDs.');
