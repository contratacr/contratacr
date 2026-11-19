// Pure memory-store/transport checks. No browser, filesystem persistence, network,
// database or application server. Real IndexedDB reload is covered by E2E.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const sourceRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(sourceRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);},load(url,context,next){if(url.startsWith(sourceRoot)&&url.endsWith('.ts'))return{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};return next(url,context);}});
const h=await import('../../src/lib/pro/work-file-recovery.ts');
const uid=()=>crypto.randomUUID(),accountId=uid(),other=uid(),workId='legacy-local-file-work',scope={accountId,workId},recipient={id:uid(),name:'Cliente ficticio local'};
const bytes=new TextEncoder().encode('%PDF-1.4\nLOCAL_ONLY\n%%EOF\n').buffer;
const sha=value=>createHash('sha256').update(new Uint8Array(value)).digest('hex');
const clone=value=>structuredClone(value),key=value=>JSON.stringify([value.accountId,value.workId]);
let checks=0;
function store(config={}){
 const data=new Map();
 return {data,async read(s){const row=data.get(key(s));return row?h.validateWorkFileWrite(clone(row),s):null;},async advance(value){if(config.fail)throw Error('Local persistence denied');const record=await h.validateWorkFileWrite(value,{accountId:value.accountId,workId:value.workId}),prior=data.get(key(record));h.assertWorkFileAdvance(prior??null,record);data.set(key(record),clone(record));},async remove(value){const prior=data.get(key(value));if(prior&&(!h.sameWorkFileIntent(prior,value)||prior.phase!==value.phase||JSON.stringify(prior.ack)!==JSON.stringify(value.ack)))throw Error('Another checkpoint exists');data.delete(key(value));}};
}
const create=()=>h.createWorkFileUpload(scope,{name:'archivo-local.pdf',type:'application/pdf',bytes},uid());
function acknowledgement(record,published=false){return {id:record.fileId,workId,name:'archivo-local.pdf',mimeType:'application/pdf',sizeBytes:bytes.byteLength,sha256:sha(bytes),revision:published?2:1,ready:true,createdAt:'2026-11-09T14:00:00Z',publishedAt:published?'2026-11-09T14:05:00Z':null};}
function binary(data=bytes,headers={}){return new Response(data,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="archivo-local.pdf"','Content-Length':String(data.byteLength),...headers}});}
function transport(ack,options={}){
 const bodies=[],reads=[];let lost=!!options.lost,failRead=!!options.failRead,corrupt=!!options.corrupt;
 const request=async(url,init)=>{
  if(init?.method==='POST'){bodies.push(init.body);assert.equal(init.headers['X-Pro-Expected-Actor'],accountId);options.afterPost?.();if(lost){lost=false;return new Response(null,{status:503});}return Response.json({file:options.badAck??ack});}
  reads.push(url);assert.equal(init?.headers?.['X-Pro-Expected-Actor'],accountId);
  if(failRead){failRead=false;return new Response(null,{status:503});}
  if(url.includes('metadata=1'))return Response.json({file:options.currentFile??ack,canShare:true,recipientId:recipient.id,recipientName:recipient.name});
  if(corrupt){corrupt=false;const broken=bytes.slice(0);new Uint8Array(broken)[0]^=1;return binary(broken);}
  return binary();
 };
 return {bodies,reads,request};
}
const run=(attempt,s,network,overrides={})=>h.continueWorkFileWrite({store:s,attempt,request:network.request,currentAccount:()=>accountId,currentWork:()=>workId,onCheckpoint:()=>{},...overrides});
const failure=kind=>error=>error instanceof h.WorkFileWriteFailure&&error.kind===kind;

{
 const a=await create();assert.equal(JSON.parse(h.workFileBody(a)).data,Buffer.from(a.bytes).toString('base64'));assert.equal(a.rawSha256,sha(bytes));assert.equal(a.bodySha256,sha(new TextEncoder().encode(h.workFileBody(a)).buffer));assert.equal(a.phase,'ready');assert.equal(a.ack,null);assert.equal(Object.hasOwn(a,'data'),false);
 const s=store();await s.advance(a);assert.deepEqual(await s.read(scope),a);assert.equal(await s.read({accountId:other,workId}),null);assert.equal(await s.read({accountId,workId:'other-work'}),null);
 const changed=clone(a);new Uint8Array(changed.bytes)[0]^=1;await assert.rejects(()=>h.validateWorkFileWrite(changed,scope));await assert.rejects(()=>h.mergeWorkFileWrite(a,changed));assert.throws(()=>h.parseWorkFileWrite(a,{accountId:other,workId}));assert.throws(()=>h.parseWorkFileWrite(a,{accountId,workId:'other-work'}));
 const different=await create();await assert.rejects(()=>s.advance(different));await assert.rejects(()=>h.mergeWorkFileWrite(a,different));assert.equal((await s.read(scope)).fileId,a.fileId);checks++;
}
{
 const large=new Uint8Array(h.WORK_FILE_UPLOAD_LIMIT);for(let i=0;i<large.length;i++)large[i]=i%251;
 const a=await h.createWorkFileUpload(scope,{name:'límite.pdf',type:'application/pdf',bytes:large.buffer},uid());assert.equal(a.byteLength,20*1024*1024);assert.equal(JSON.parse(h.workFileBody(a)).data,Buffer.from(large).toString('base64'));
 await assert.rejects(()=>h.createWorkFileUpload(scope,{name:'grande.pdf',type:'application/pdf',bytes:new ArrayBuffer(h.WORK_FILE_UPLOAD_LIMIT+1)},uid()));await assert.rejects(()=>h.createWorkFileUpload(scope,{name:'wrong.svg',type:'image/svg+xml',bytes},uid()));checks++;
}
{
 const a=await create(),s=store({fail:true}),network=transport(acknowledgement(a));await assert.rejects(()=>run(a,s,network),failure('storage'));assert.equal(network.bodies.length,0);checks++;
}
{
 const a=await create(),s=store(),network=transport(acknowledgement(a),{lost:true});await assert.rejects(()=>run(a,s,network),failure('uncertain'));assert.equal(network.bodies.length,1);const retained=await s.read(scope);assert.equal(retained.phase,'uncertain');assert.equal(h.workFileBody(retained),network.bodies[0]);
 // Reading/restoring a journal never performs an upload by itself.
 await s.read(scope);assert.equal(network.bodies.length,1);
 const result=await run(retained,s,network);assert.equal(result.status,'confirmed');assert.deepEqual(network.bodies,[h.workFileBody(a),h.workFileBody(a)]);assert.equal(result.attempt.phase,'confirmed');assert.equal(result.file.sha256,sha(bytes));assert.equal(network.reads.length,2);
 const confirmed=await s.read(scope);assert.deepEqual(confirmed,result.attempt);const count=network.bodies.length;await run(confirmed,s,network);assert.equal(network.bodies.length,count);await s.remove(confirmed);assert.equal(await s.read(scope),null);checks++;
}
for(const patch of [{id:uid()},{workId:'wrong-work'},{name:'wrong.pdf'},{sha256:'0'.repeat(64)},{sizeBytes:bytes.byteLength+1},{ready:false},{revision:2,publishedAt:'2026-11-09T14:05:00Z'}]){
 const a=await create(),s=store(),network=transport(acknowledgement(a),{badAck:{...acknowledgement(a),...patch}});await assert.rejects(()=>run(a,s,network),failure('uncertain'));assert.equal((await s.read(scope)).phase,'uncertain');assert.equal(network.bodies.length,1);assert.equal(network.reads.length,0);checks++;
}
{
 const a=await create(),s=store(),network=transport(acknowledgement(a),{failRead:true});await assert.rejects(()=>run(a,s,network),failure('read'));const confirmed=await s.read(scope);assert.equal(confirmed.phase,'confirmed');assert.notEqual(confirmed.ack,null);assert.equal(network.bodies.length,1);await run(confirmed,s,network);assert.equal(network.bodies.length,1);checks++;
}
{
 const a=await create(),s=store(),network=transport(acknowledgement(a),{corrupt:true});await assert.rejects(()=>run(a,s,network),failure('read'));const confirmed=await s.read(scope);assert.equal(confirmed.phase,'confirmed');await run(confirmed,s,network);assert.equal(network.bodies.length,1);checks++;
}
{
 const a=await create(),s=store(),network=transport(acknowledgement(a));await assert.rejects(()=>run(a,s,network,{currentAccount:()=>other}),failure('scope'));assert.equal(network.bodies.length,0);
 let actor=accountId;const changed=transport(acknowledgement(a),{afterPost:()=>{actor=other;}});await assert.rejects(()=>run(a,s,changed,{currentAccount:()=>actor}),failure('scope'));assert.equal((await s.read(scope)).phase,'uncertain');assert.equal(changed.reads.length,0);checks++;
}
{
 const upload=await create(),baseline=acknowledgement(upload),a=await h.createWorkFilePublish(scope,baseline,recipient,uid()),s=store(),network=transport(acknowledgement(upload,true),{lost:true});const body=h.workFileBody(a);assert.equal(JSON.parse(body).recipientId,recipient.id);
 const otherRecipient=await h.createWorkFilePublish(scope,baseline,{id:other,name:'Otra persona'},uid());await assert.rejects(()=>h.mergeWorkFileWrite(a,otherRecipient));
 await assert.rejects(()=>run(a,s,network),failure('uncertain'));const restored=await s.read(scope);assert.equal(restored.recipient.id,recipient.id);assert.equal(restored.recipient.name,recipient.name);assert.equal(restored.body,body);assert.equal(network.bodies.length,1);
 const result=await run(restored,s,network);assert.equal(result.status,'confirmed');assert.equal(result.file.revision,2);assert.notEqual(result.file.publishedAt,null);assert.deepEqual(network.bodies,[body,body]);await run(result.attempt,s,network);assert.equal(network.bodies.length,2);checks++;
}
for(const status of [401,403]){
 const a=await create(),s=store(),bodies=[],network={request:async(_url,init)=>{bodies.push(init.body);return new Response(null,{status});}};
 await assert.rejects(()=>run(a,s,network),failure('uncertain'));const saved=await s.read(scope);assert.equal(saved.phase,'uncertain');assert.equal(h.workFileBody(saved),h.workFileBody(a));await assert.rejects(()=>run(saved,s,network),failure('uncertain'));assert.deepEqual(bodies,[h.workFileBody(a),h.workFileBody(a)]);checks++;
}
{
 const a=await create(),s=store(),network=transport(acknowledgement(a));const result=await run(a,s,network);await assert.rejects(()=>s.advance(a));await assert.rejects(()=>s.remove(a));assert.deepEqual(await s.read(scope),result.attempt);checks++;
}
{
 const a=await create(),s=store(),network={request:async()=>new Response(null,{status:409})};const result=await run(a,s,network);assert.equal(result.status,'rejected');assert.equal(result.code,409);assert.equal((await s.read(scope)).phase,'uncertain');await s.remove(result.attempt);assert.equal(await s.read(scope),null);checks++;
}
{
 const file=acknowledgement(await create());assert.equal(sha(await h.readWorkFileBinary(binary(),file)),file.sha256);
 await assert.rejects(()=>h.readWorkFileBinary(binary(bytes,{'Content-Disposition':'inline'}),file));await assert.rejects(()=>h.readWorkFileBinary(binary(bytes,{'Content-Type':'text/html'}),file));await assert.rejects(()=>h.readWorkFileBinary(binary(bytes,{'Content-Length':String(h.WORK_FILE_UPLOAD_LIMIT+1)}),file));await assert.rejects(()=>h.readWorkFileBinary(binary(bytes.slice(0,-1)),file));checks++;
}
console.log(`PASS ${checks} pure work-file recovery cases: binary integrity, scope, bounded reads, exact upload/share retries, captured recipient, persistence failure and confirmed GET-only recovery. No external state.`);
