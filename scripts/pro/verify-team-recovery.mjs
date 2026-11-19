// Pure team operation recovery contracts. No browser, network or database.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const sourceRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({
 resolve(specifier,context,next){return next(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);},
 load(url,context,next){if(url.startsWith(sourceRoot)&&url.endsWith('.ts'))return{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};return next(url,context);},
});
const owner=crypto.randomUUID(),other=crypto.randomUUID(),work='local-team-work',otherWork='other-team-work';
function storage(){const values=new Map();return{values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
function transport(ack){const posts=[],reads=[],receipts=new Map();let lose=false,readFailure=false,wrong=false,deny=null,canonical=ack;
 return{posts,reads,receipts,lose(){lose=true;},failRead(value=true){readFailure=value;},corrupt(value=true){wrong=value;},deny(code){deny=code;},proof(value){canonical=value;},request:async(url,init)=>{
  assert.equal(new Headers(init?.headers).get('X-Pro-Expected-Actor'),owner);
  if(init?.method==='POST'){
   posts.push(init.body);const input=JSON.parse(init.body);if(deny)return Response.json({error:'LOCAL_PERMISSION_DENIED'},{status:deny});const found=receipts.get(input.actionId);if(found)assert.equal(found.body,init.body,'Recovery must keep its captured action and bytes');else receipts.set(input.actionId,{body:init.body,ack});
   if(lose){lose=false;return Response.json({error:'LOCAL_LOST_AFTER_COMMIT'},{status:503});}return Response.json(wrong?{action:'UNEXPECTED_ACTION'}:ack);
  }
  reads.push(url);const query=new URL(url,'http://local.invalid').searchParams;assert.equal(query.get('view'),'action');assert.ok(query.get('actionId'));assert.equal(query.has('code'),false);if(deny)return Response.json({error:'LOCAL_PERMISSION_DENIED'},{status:deny});if(readFailure)return Response.json({error:'LOCAL_CANONICAL_READ_FAILED'},{status:503});return Response.json(canonical);
 }};
}
function operation(action){
 const actionId=crypto.randomUUID(),grantId=crypto.randomUUID(),inviteId=crypto.randomUUID(),taskId=crypto.randomUUID(),collaborator=['accept','comment','complete','reopen'].includes(action),ownerId=collaborator?other:owner;
 const invite={id:inviteId,ownerId,workId:work,email:'recipient@contratacr.test',role:'viewer',status:'pending',revision:1,createdAt:'2026-11-09T08:00:00.000Z',expiresAt:'2026-11-12T08:00:00.000Z'};
 const grant={id:grantId,ownerId,workId:work,userId:collaborator?owner:other,displayName:'Persona local',role:'viewer',active:true,revision:1,canAssign:false};
 const task={id:taskId,title:'Revisar conexión eléctrica',dueDate:'2026-11-12',status:action==='reopen'?'done':'open',revision:1,assignment:null};
 const raw='a'.repeat(64),context=action==='accept'?{ownerId:null,workId:null,grantId:null}:{ownerId,workId:work,grantId:['comment','complete','reopen','set_role','revoke'].includes(action)?grantId:null};
 let input,result,baseline=null;
 if(action==='invite'){input={action,actionId,workId:work,email:invite.email,role:'viewer',code:raw};result={action,ownerId,workId:work,invite:{...invite,id:actionId}};}
 if(action==='accept'){input={action,actionId,code:raw};result={action,ownerId,workId:work,grant};}
 if(action==='cancel_invite'){input={action,actionId,workId:work,inviteId,revision:1};baseline=invite;result={action,ownerId,workId:work,invite:{...invite,status:'revoked',revision:2}};}
 if(action==='set_role'){input={action,actionId,workId:work,grantId,revision:1,role:'contributor'};baseline=grant;result={action,ownerId,workId:work,grant:{...grant,role:'contributor',revision:2,canAssign:true}};}
 if(action==='revoke'){input={action,actionId,workId:work,grantId,revision:1};baseline=grant;result={action,ownerId,workId:work,grant:{...grant,active:false,revision:2}};}
 if(action==='comment'){input={action,actionId,grantId,text:'Comentario privado del equipo'};result={action,ownerId,workId:work,comment:{id:actionId,actorId:owner,actorName:'Persona local',text:input.text,at:'2026-11-09T09:00:00.000Z'}};}
 if(action==='complete'||action==='reopen'){input={action,actionId,grantId,taskId,revision:1};baseline=task;result={action,ownerId,workId:work,task:{...task,status:action==='complete'?'done':'open',revision:2}};}
 if(action==='assign'){input={action,actionId,workId:work,taskId,revision:1,assigneeGrantId:grantId};baseline=task;result={action,ownerId,workId:work,task:{...task,revision:2,assignment:{grantId,name:grant.displayName,active:true}}};}
 return{input,result,context,baseline,raw};
}
const h=await import('../../src/lib/pro/team-recovery.ts');
let passed=0;
function mutex(){const held=new Set();return{request:async(name,options,callback)=>{assert.equal(options.mode,'exclusive');assert.equal(options.ifAvailable,true);if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}}};}
async function make(action='comment'){const f=operation(action);return{...f,store:storage(),attempt:await h.createTeamWrite({accountId:owner,input:f.input,context:f.context,baseline:f.baseline})};}
const run=(f,s,extra={})=>h.continueTeamWrite({attempt:f.attempt,store:f.store,request:s.request,currentAccount:()=>owner,onCheckpoint:()=>{},locks:mutex(),...extra});
for(const action of ['invite','accept','cancel_invite','set_role','revoke','comment','complete','reopen','assign']){
 const f=await make(action),s=transport(f.result),result=await run(f,s);assert.equal(result.status,'confirmed');assert.deepEqual(result.result,f.result);assert.equal(s.posts.length,1);assert.equal(s.reads.length,1);assert.equal(s.receipts.size,1);assert.deepEqual(h.readTeamWrite(f.store,owner),result.attempt);assert.equal(h.readTeamWrite(f.store,other),null);assert.throws(()=>h.parseTeamWrite(result.attempt,other));
 if(action==='accept'){assert.equal(result.attempt.body,null);assert.equal('code'in result.attempt.intent,false);assert.equal(JSON.stringify(result.attempt).includes(f.raw),false);assert.equal(f.store.getItem(h.teamWriteKey(owner)).includes(f.raw),false);}else assert.equal(result.attempt.body,f.attempt.body);
 await run({...f,attempt:result.attempt},s);assert.equal(s.posts.length,1,'Confirmed recovery must only GET');await h.clearTeamWrite(f.store,result.attempt,mutex());assert.equal(h.readTeamWrite(f.store,owner),null);passed++;
}
for(const action of ['invite','accept','comment','complete','assign']){
 const f=await make(action),s=transport(f.result);s.lose();await assert.rejects(()=>run(f,s));const saved=h.readTeamWrite(f.store,owner);assert.equal(saved.phase,'uncertain');assert.equal(s.posts.length,1);const bytes=s.posts[0];assert.equal(saved.body,bytes);assert.deepEqual(h.readTeamWrite(f.store,owner),saved);assert.equal(s.posts.length,1,'Reading a journal must not POST');await assert.rejects(()=>h.clearTeamWrite(f.store,saved,mutex()));
 const result=await run({...f,attempt:saved},s);assert.equal(result.status,'confirmed');assert.deepEqual(s.posts,[bytes,bytes]);assert.equal(s.receipts.size,1);if(action==='accept'){assert.equal(result.attempt.body,null);assert.equal(JSON.stringify(result.attempt).includes(f.raw),false);}passed++;
}
{
 const f=await make('accept'),s=transport(f.result);s.failRead();await assert.rejects(()=>run(f,s),error=>error instanceof h.TeamWriteFailure&&error.kind==='read');const saved=h.readTeamWrite(f.store,owner);assert.equal(saved.phase,'confirmed');assert.equal(saved.body,null);assert.equal(JSON.stringify(saved).includes(f.raw),false);assert.equal(s.posts.length,1);s.failRead(false);const result=await run({...f,attempt:saved},s);assert.equal(result.status,'confirmed');assert.equal(s.posts.length,1);passed++;
}
for(const action of ['invite','accept','comment']){
 const f=await make(action),s=transport(f.result);s.deny(403);const result=await run(f,s);assert.equal(result.status,'rejected');assert.equal(result.code,403);assert.equal(result.attempt.phase,'rejected');assert.equal(s.receipts.size,0);await h.clearTeamWrite(f.store,result.attempt,mutex());assert.equal(h.readTeamWrite(f.store,owner),null);passed++;
}
{
 const f=await make('accept'),s=transport(f.result);s.lose();await assert.rejects(()=>run(f,s));const saved=h.readTeamWrite(f.store,owner),bytes=f.store.getItem(h.teamWriteKey(owner));s.deny(403);await assert.rejects(()=>run({...f,attempt:saved},s));assert.equal(s.posts.length,2);assert.equal(s.posts[0],s.posts[1]);assert.equal(s.receipts.size,1);assert.equal(h.readTeamWrite(f.store,owner).phase,'uncertain');assert.equal(f.store.getItem(h.teamWriteKey(owner)),bytes);await assert.rejects(()=>h.clearTeamWrite(f.store,saved,mutex()));passed++;
}
for(const method of ['getItem','setItem']){
 const f=await make(),s=transport(f.result);f.store[method]=()=>{throw Error('LOCAL_STORAGE_DENIED');};await assert.rejects(()=>run(f,s));assert.equal(s.posts.length,0);passed++;
}
{
 const f=await make(),s=transport(f.result);await assert.rejects(()=>run(f,s,{onCheckpoint:()=>{throw Error('LOCAL_CHECKPOINT_FAILED');}}));assert.equal(s.posts.length,0);passed++;
}
{
 const f=await make(),s=transport(f.result);await assert.rejects(()=>run(f,s,{currentAccount:()=>other}));assert.equal(s.posts.length,0);assert.equal(f.store.values.size,0);passed++;
}
{
 const f=await make(),s=transport(f.result);let active=true;await assert.rejects(()=>run(f,s,{request:async(...args)=>{const response=await s.request(...args);active=false;return response;},currentAccount:()=>active?owner:other}));assert.equal(s.posts.length,1);assert.equal(h.readTeamWrite(f.store,owner).phase,'uncertain');assert.equal(h.readTeamWrite(f.store,other),null);passed++;
}
{
 const f=await make(),s=transport(f.result);s.corrupt();await assert.rejects(()=>run(f,s));assert.equal(h.readTeamWrite(f.store,owner).phase,'uncertain');assert.equal(s.receipts.size,1);passed++;
}
{
 const f=await make(),s=transport(f.result);s.lose();await assert.rejects(()=>run(f,s));const old=f.store.getItem(h.teamWriteKey(owner)),different=await make();await assert.rejects(()=>run({...different,store:f.store},transport(different.result)));assert.equal(f.store.getItem(h.teamWriteKey(owner)),old);passed++;
}
{
 const f=await make(),s=transport(f.result);let release,entered;const held=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});const locks=mutex(),first=run(f,s,{locks,request:async(...args)=>{entered();await held;return s.request(...args);}});await started;const otherAttempt=await make('invite'),otherServer=transport(otherAttempt.result);await assert.rejects(()=>run(otherAttempt,otherServer,{locks}),error=>error instanceof h.TeamWriteBusyError);assert.equal(otherServer.posts.length,0);assert.equal(otherAttempt.store.values.size,0);release();assert.equal((await first).status,'confirmed');passed++;
}
{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});try{const f=await make(),s=transport(f.result);await assert.rejects(()=>run(f,s,{locks:undefined}),error=>error instanceof h.TeamWriteBusyError);assert.equal(s.posts.length,0);assert.equal(f.store.values.size,0);passed++;}finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
}
{
 const f=await make('accept'),s=transport(f.result);s.failRead();await assert.rejects(()=>run(f,s));const saved=h.readTeamWrite(f.store,owner);assert.throws(()=>h.parseTeamWrite({...saved,intent:{...saved.intent,code:f.raw}},owner),'A sanitized acceptance must reject secret-bearing intent fields');assert.throws(()=>h.parseTeamWrite({...saved,context:{...saved.context,grantId:crypto.randomUUID()}},owner));
 for(const action of ['invite','comment','complete']){const otherAction=await make(action);assert.throws(()=>h.parseTeamWrite({...otherAction.attempt,phase:'confirmed',body:null,ack:otherAction.result},owner));}passed++;
}
{
 const f=await make('accept'),s=transport(f.result),changed={...f.attempt,body:f.attempt.body.replace(f.raw,'b'.repeat(64)),phase:'uncertain'};f.store.setItem(h.teamWriteKey(owner),JSON.stringify(changed));await assert.rejects(()=>run(f,s));assert.equal(s.posts.length,0,'A newer disk checkpoint with an altered code and claimed old digest must never POST');passed++;
}
{
 const f=await make('comment'),changed={...f.attempt,context:{...f.context,ownerId:crypto.randomUUID(),workId:otherWork}};assert.throws(()=>h.mergeTeamWrite(f.attempt,changed));passed++;
}
async function deniedAttempt(action='comment',status=403){const f=await make(action),s=transport(f.result);s.lose();await assert.rejects(()=>run(f,s));const saved=h.readTeamWrite(f.store,owner);s.deny(status);let denial;await assert.rejects(()=>run({...f,attempt:saved},s),error=>{denial=error;return true;});return{...f,s,attempt:h.readTeamWrite(f.store,owner),denial};}
for(const action of ['invite','accept','comment']){
 const f=await deniedAttempt(action),active=f.store.getItem(h.teamWriteKey(owner)),postCount=f.s.posts.length,readCount=f.s.reads.length,key=h.teamWriteKey(owner)+':archived:'+f.attempt.actionId;
 await assert.rejects(()=>h.archiveTeamWrite(f.store,f.attempt,new h.TeamWriteFailure('uncertain',f.attempt,403),mutex()));assert.equal(f.store.getItem(h.teamWriteKey(owner)),active,'A constructed permission error is not an observed denial');
 await h.archiveTeamWrite(f.store,f.attempt,f.denial,mutex());assert.equal(h.readTeamWrite(f.store,owner),null);const archived=JSON.parse(f.store.getItem(key));assert.equal(archived.actionId,f.attempt.actionId);assert.equal(archived.bodySha256,f.attempt.bodySha256);assert.deepEqual(archived.context,f.attempt.context);if(action==='comment')assert.equal(archived.body,f.attempt.body);else{assert.equal(archived.body,null);assert.equal(JSON.stringify(archived).includes(f.raw),false);}assert.equal(f.s.posts.length,postCount);assert.equal(f.s.reads.length,readCount);passed++;
}
{
 const f=await deniedAttempt('accept'),active=f.store.getItem(h.teamWriteKey(owner)),set=f.store.setItem;f.store.setItem=(key,value)=>{if(key.includes(':archived:'))throw Error('ARCHIVE_QUOTA_FAILURE');set(key,value);};await assert.rejects(()=>h.archiveTeamWrite(f.store,f.attempt,f.denial,mutex()));assert.equal(f.store.getItem(h.teamWriteKey(owner)),active);f.store.setItem=set;await h.archiveTeamWrite(f.store,f.attempt,f.denial,mutex());assert.equal(h.readTeamWrite(f.store,owner),null);passed++;
}
{
 const f=await deniedAttempt(),active=f.store.getItem(h.teamWriteKey(owner)),key=h.teamWriteKey(owner)+':archived:'+f.attempt.actionId;f.store.setItem(key,'EXISTING_IMMUTABLE_ARCHIVE');await assert.rejects(()=>h.archiveTeamWrite(f.store,f.attempt,f.denial,mutex()));assert.equal(f.store.getItem(key),'EXISTING_IMMUTABLE_ARCHIVE');assert.equal(f.store.getItem(h.teamWriteKey(owner)),active);passed++;
}
{
 const f=await deniedAttempt('comment',500),active=f.store.getItem(h.teamWriteKey(owner));await assert.rejects(()=>h.archiveTeamWrite(f.store,f.attempt,f.denial,mutex()));assert.equal(f.store.getItem(h.teamWriteKey(owner)),active,'A network/server failure cannot authorize retiring the active attempt');passed++;
}
{
 const f=await deniedAttempt(),otherStore=storage(),otherAttempt={...await h.createTeamWrite({accountId:other,input:f.input,context:f.context,baseline:null}),phase:'uncertain'};h.saveTeamWrite(otherStore,otherAttempt);const bytes=otherStore.getItem(h.teamWriteKey(other));await assert.rejects(()=>h.archiveTeamWrite(otherStore,otherAttempt,f.denial,mutex()));assert.equal(otherStore.getItem(h.teamWriteKey(other)),bytes,'A denial observed in another account must not authorize archiving');passed++;
}
{
 const f=operation('complete');f.input.revision=2147483646;f.baseline.revision=2147483646;f.result.task.revision=2147483647;const attempt=await h.createTeamWrite({accountId:owner,input:f.input,context:f.context,baseline:f.baseline}),s=transport(f.result);assert.equal((await run({...f,attempt,store:storage()},s)).status,'confirmed');await assert.rejects(()=>h.createTeamWrite({accountId:owner,input:{...f.input,revision:2147483647},context:f.context,baseline:{...f.baseline,revision:2147483647}}));passed++;
}
for(const action of ['complete','set_role']){
 const f=await make(action),s=transport(f.result),confirmed=await run(f,s),legacy=structuredClone(confirmed.attempt);if(action==='complete'){delete legacy.baseline.assignment;delete legacy.ack.task.assignment;}else{delete legacy.baseline.canAssign;delete legacy.ack.grant.canAssign;}
 f.store.setItem(h.teamWriteKey(owner),JSON.stringify(legacy));const restored=h.readTeamWrite(f.store,owner);assert.ok(restored);if(action==='complete'){assert.equal(restored.baseline.assignment,null);assert.equal(restored.ack.task.assignment,null);}else assert.equal(restored.baseline.canAssign,false);const count=s.posts.length;assert.equal((await run({...f,attempt:legacy},s)).status,'confirmed');assert.equal(s.posts.length,count,'Older stored receipts must restore without another POST');passed++;
}
{
 const f=operation('assign');f.input.assigneeGrantId=null;f.result.task.assignment=null;const attempt=await h.createTeamWrite({accountId:owner,input:f.input,context:f.context,baseline:f.baseline}),s=transport(f.result),result=await run({...f,attempt,store:storage()},s);assert.equal(result.status,'confirmed');assert.equal(result.result.task.assignment,null);passed++;
}
{
 const f=await make('assign'),s=transport(f.result);s.proof({...f.result,task:{...f.result.task,assignment:{...f.result.task.assignment,active:false}}});const result=await run(f,s);assert.equal(result.status,'confirmed');assert.equal(result.result.task.assignment.active,false);assert.equal(s.posts.length,1);passed++;
}
for(const action of ['complete','reopen']){
 const f=operation(action),assignment={grantId:crypto.randomUUID(),name:'Persona responsable',active:true};f.baseline.assignment=assignment;f.result.task.assignment={...assignment,active:false};const attempt=await h.createTeamWrite({accountId:owner,input:f.input,context:f.context,baseline:f.baseline}),s=transport(f.result);assert.equal((await run({...f,attempt,store:storage()},s)).status,'confirmed');passed++;
}
{
 const f=operation('assign');f.result.task.assignment.active=false;const attempt=await h.createTeamWrite({accountId:owner,input:f.input,context:f.context,baseline:f.baseline}),s=transport(f.result);assert.equal((await run({...f,attempt,store:storage()},s)).status,'confirmed');passed++;
}
{
 const f=await make('assign'),s=transport({...f.result,task:{...f.result.task,assignment:{...f.result.task.assignment,grantId:crypto.randomUUID()}}});await assert.rejects(()=>run(f,s));assert.equal(h.readTeamWrite(f.store,owner).phase,'uncertain');passed++;
}
{
 const f=await make('assign'),s=transport(f.result);s.proof({...f.result,task:{...f.result.task,assignment:{...f.result.task.assignment,name:'DIFFERENT_CAPTURED_PERSON'}}});await assert.rejects(()=>run(f,s));assert.equal(s.posts.length,1);passed++;
}
console.log(`Team recovery contracts: ${passed} PASS (no browser/network/DB)`);
