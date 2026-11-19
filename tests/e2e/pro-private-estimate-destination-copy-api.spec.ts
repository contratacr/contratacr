import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {test,expect,type BrowserContext} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {privateEstimateDestinationCopyReceiptSchema,privateEstimateDestinationCopyResultSchema,privateEstimateDestinationCopyOptionsSchema} from '../../src/lib/pro/private-estimate-destination-copy';
import {destinationCopyFixture,cleanupDestinationCopy,destinationCopyApi,destinationContext,destinationCopyInput,historicalSource,draftSource,sourcePreview,destinationCopyBusiness,estimateRows,post,json,local,login,type DestinationCopyFixture} from './private-estimate-destination-copy-fixture';
import {manualInput} from './private-estimate-work-fixture';
const uuid=()=>crypto.randomUUID();
async function proof(context:BrowserContext,actionId:string){return privateEstimateDestinationCopyReceiptSchema.parse(await json(context,{view:'action',actionId},destinationCopyApi));}
async function copies(f:DestinationCopyFixture){return(await f.db.from('pro_private_estimate_destination_copies').select('*').eq('actor_id',f.owner.id).order('action_id').throwOnError()).data;}
function retained(estimate:DestinationCopyFixture['estimateA']){return Object.fromEntries(Object.entries(estimate).filter(([key])=>!['id','revision','status','createdAt','updatedAt','clientId','client','clientFingerprint','source'].includes(key)));}
async function unchangedOriginals(f:DestinationCopyFixture,before:Awaited<ReturnType<typeof estimateRows>>,targets:string[]){
 const after=await estimateRows(f);
 for(const [table,rows]of Object.entries(before)){
  const old=(after[table]as Record<string,unknown>[]).filter(row=>!targets.includes(String(table==='pro_private_estimates'?row.id:table==='pro_private_estimate_actions'?(row.input as{estimateId:string}).estimateId:row.estimate_id)));
  expect(old,table).toEqual(rows);
 }
}

test('Destination copy API: current draft B and historical accepted A copy exact content to another client, manual lead or job without changing their originals',async({context,browser,baseURL})=>{
 test.setTimeout(240000);local(baseURL);const f=await destinationCopyFixture(context,browser);
 try{
  const directA=await destinationContext(context,{clientId:f.clientId}),directB=await destinationContext(context,{clientId:f.secondClient}),manual=await destinationContext(context,{sourceKind:'manual',sourceId:f.destinationManualId}),work=await destinationContext(context,{sourceKind:'work',sourceId:f.destinationWorkId});
  expect((await sourcePreview(context,draftSource(f))).estimate).toEqual(f.estimateB);expect((await sourcePreview(context,historicalSource(f))).estimate).toEqual(f.estimateA);
  const before=await destinationCopyBusiness(f),documents=await estimateRows(f),targets:string[]=[];
  for(const [source,destination,original]of [[draftSource(f),directA,f.estimateB],[historicalSource(f),directB,f.estimateA],[historicalSource(f),manual,f.estimateA],[historicalSource(f),work,f.estimateA]]as const){
   const input=destinationCopyInput(source,destination),responses=await Promise.all([post(context,f.owner,input,destinationCopyApi),post(context,f.owner,input,destinationCopyApi)]);expect(responses.map(response=>response.status())).toEqual([200,200]);
   const result=privateEstimateDestinationCopyResultSchema.parse(await responses[0].json());expect(await responses[1].json()).toEqual(result);targets.push(input.targetEstimateId);
   expect(retained(result.estimate)).toEqual(retained(original));
   expect(result.estimate).toMatchObject({id:input.targetEstimateId,ownerId:f.owner.id,revision:1,status:'draft',clientId:destination.client.id,client:destination.client,clientFingerprint:destination.clientFingerprint,source:destination.source});
   expect(result.estimate.lines.map(row=>row.id)).toEqual(original.lines.map((row:{id:string})=>row.id));
   expect(result.estimate.issuer.issuerActivity).toBe(source.kind==='publication'?'432100':'999900');
   expect(await proof(context,input.actionId)).toEqual({receipt:{input,result}});
   expect((await json(context,{view:'detail',estimateId:input.targetEstimateId},'/api/pro/private-estimates')).estimate).toEqual(result.estimate);
   const history=(await f.db.from('pro_private_estimate_history').select('*').eq('owner_id',f.owner.id).eq('estimate_id',input.targetEstimateId).throwOnError()).data!;
   expect(history).toHaveLength(1);expect(history[0]).toMatchObject({action:'duplicate',action_id:input.actionId,before_estimate:original,after_estimate:result.estimate});
  }
  expect(await copies(f)).toHaveLength(4);await unchangedOriginals(f,documents,targets);expect(await destinationCopyBusiness(f)).toEqual(before);
  expect((await f.db.from('pro_private_estimate_actions').select('*').eq('actor_id',f.owner.id).throwOnError()).data?.toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual(documents.pro_private_estimate_actions);
 }finally{await cleanupDestinationCopy(f);}
});

test('Destination copy API: fresh destination fingerprints reject rename, archive, cancellation and changed manual revisions atomically',async({context,browser,baseURL})=>{
 test.setTimeout(240000);local(baseURL);const f=await destinationCopyFixture(context,browser);
 try{
  const source=historicalSource(f),client=await destinationContext(context,{clientId:f.secondClient}),manual=await destinationContext(context,{sourceKind:'manual',sourceId:f.destinationManualId}),work=await destinationContext(context,{sourceKind:'work',sourceId:f.destinationWorkId});
  await f.db.from('pro_clients').update({name:'DESTINATION_RENAMED'}).eq('user_id',f.owner.id).eq('id',f.secondClient).throwOnError();
  const renamed=destinationCopyInput(source,client),beforeRename=await estimateRows(f);
  expect((await post(context,f.owner,renamed,destinationCopyApi)).status()).toBe(409);expect(await estimateRows(f)).toEqual(beforeRename);expect(await proof(context,renamed.actionId)).toEqual({receipt:null});
  const refreshed=await destinationContext(context,{clientId:f.secondClient});
  await f.db.from('pro_clients').update({archived:true}).eq('user_id',f.owner.id).eq('id',f.secondClient).throwOnError();
  expect((await post(context,f.owner,destinationCopyInput(source,refreshed),destinationCopyApi)).status()).toBe(409);
  await f.db.from('pro_clients').update({archived:false}).eq('user_id',f.owner.id).eq('id',f.secondClient).throwOnError();
  await f.db.from('pro_work').update({cancelled:true}).eq('user_id',f.owner.id).eq('id',f.destinationWorkId).throwOnError();
  expect((await post(context,f.owner,destinationCopyInput(source,work),destinationCopyApi)).status()).toBe(409);
  await f.db.from('pro_work').update({cancelled:false}).eq('user_id',f.owner.id).eq('id',f.destinationWorkId).throwOnError();
  const {action:oldAction,actionId:oldId,kind,id,revision:oldRevision,catalogRevision:oldCatalog,stageMode:oldMode,stageId:oldStage,...fields}=f.destinationManual;
  void oldAction;void oldId;void oldRevision;void oldCatalog;void oldMode;void oldStage;
  expect((await post(context,f.owner,{action:'update',actionId:uuid(),kind,id,revision:1,...fields,title:'DESTINATION_MANUAL_CHANGED'},'/api/pro/lead-private-core')).status()).toBe(200);
  expect((await post(context,f.owner,destinationCopyInput(source,manual),destinationCopyApi)).status()).toBe(409);
  const currentManual=await destinationContext(context,{sourceKind:'manual',sourceId:f.destinationManualId});
  expect((await post(context,f.owner,{action:'archive',actionId:uuid(),kind:'manual',id:f.destinationManualId,revision:2},'/api/pro/lead-private-core')).status()).toBe(200);
  expect((await post(context,f.owner,destinationCopyInput(source,currentManual),destinationCopyApi)).status()).toBe(409);
  expect(await copies(f)).toEqual([]);expect(await estimateRows(f)).toEqual(beforeRename);
 }finally{await cleanupDestinationCopy(f);}
});

test('Destination copy API: source CAS, ID collisions and reciprocal legacy writes roll back completely while historical replay survives later edits',async({context,browser,baseURL})=>{
 test.setTimeout(240000);local(baseURL);const f=await destinationCopyFixture(context,browser);
 try{
  const destination=await destinationContext(context,{sourceKind:'work',sourceId:f.destinationWorkId}),input=destinationCopyInput(historicalSource(f),destination),baseline=await estimateRows(f);
  const badInputs=[{...input,actionId:f.inputA.actionId},{...input,targetEstimateId:f.estimateB.id},{...input,source:{kind:'draft',estimateId:f.estimateB.id,revision:1}},{...input,source:{...historicalSource(f),version:99}},{...input,source:{...historicalSource(f),contentHash:'f'.repeat(64)}}];
  for(const bad of badInputs)expect((await post(context,f.owner,bad,destinationCopyApi)).status()).toBe(409);
  expect(await estimateRows(f)).toEqual(baseline);expect(await copies(f)).toEqual([]);
  const response=await post(context,f.owner,input,destinationCopyApi);expect(response.status()).toBe(200);const result=await response.json(),immutable=await proof(context,input.actionId);
  const copied=result.estimate,edit={action:'save',actionId:input.actionId,estimateId:copied.id,revision:1,clientId:copied.clientId,clientFingerprint:copied.clientFingerprint,refreshClient:false,source:copied.source,issuer:copied.issuer,title:'REUSED_PARENT_ACTION_MUST_ROLLBACK',notes:copied.notes,currency:copied.currency,validUntil:copied.validUntil,lines:copied.lines},beforeOld=await estimateRows(f);
  expect((await post(context,f.owner,edit,'/api/pro/private-estimates')).status()).toBe(409);expect(await estimateRows(f)).toEqual(beforeOld);
  expect(await json(context,{view:'action',actionId:input.actionId},'/api/pro/private-estimates')).toEqual({receipt:null});expect(await proof(context,input.actionId)).toEqual(immutable);
  const edited=await post(context,f.owner,{...edit,actionId:uuid(),title:'CANONICAL_C_LATER_EDIT'},'/api/pro/private-estimates');expect(edited.status()).toBe(200);expect((await edited.json()).estimate.revision).toBe(2);
  await f.db.from('pro_clients').update({archived:true,name:'Destination archived after copy'}).eq('user_id',f.owner.id).eq('id',f.secondClient).throwOnError();
  await f.db.from('pro_work').update({cancelled:true}).eq('user_id',f.owner.id).eq('id',f.destinationWorkId).throwOnError();
  await f.db.from('pro_clients').update({archived:true}).eq('user_id',f.owner.id).eq('id',f.clientId).throwOnError();
  const afterChanges=await estimateRows(f),business=await destinationCopyBusiness(f);
  expect(await(await post(context,f.owner,input,destinationCopyApi)).json()).toEqual(result);expect(await proof(context,input.actionId)).toEqual(immutable);expect(await estimateRows(f)).toEqual(afterChanges);expect(await destinationCopyBusiness(f)).toEqual(business);
  expect((await sourcePreview(context,historicalSource(f))).estimate).toEqual(f.estimateA);
  expect((await post(context,f.owner,{...input,targetEstimateId:uuid()},destinationCopyApi)).status()).toBe(409);
  expect((await post(context,f.owner,{...input,actionId:uuid()},destinationCopyApi)).status()).toBe(409);
 }finally{await cleanupDestinationCopy(f);}
});

const nativeExec=promisify(execFile);
function nativeDatabase(){const executable=process.env.PRO_LOCAL_PSQL;if(!executable||!process.env.PGPASSWORD)throw Error('Root must provide the isolated PostgreSQL gate.');expect(process.env.PGHOST).toMatch(/^(localhost|127\.0\.0\.1)$/);expect(process.env.PGPORT).toBe('54322');expect(process.env.PGDATABASE).toBe('postgres');return executable;}
async function gateOwner(f:DestinationCopyFixture,estimateId?:string,table:'estimate'|'work'='estimate'){
 for(const value of [f.owner.id,...estimateId?[estimateId]:[]])expect(value).toMatch(/^[a-f0-9-]{36}$/);
 const executable=nativeDatabase(),child=spawn(executable,['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:process.env,stdio:['pipe','pipe','pipe']});
 let output='',settled=false,released=false,resolveReady:(pid:number)=>void=()=>{},rejectReady:(error:Error)=>void=()=>{};
 const ready=new Promise<number>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;}),timer=setTimeout(()=>{if(!settled){settled=true;rejectReady(Error('Destination gate did not become ready.'));}},10000),done=new Promise<number>(resolve=>child.on('close',code=>{clearTimeout(timer);if(!settled){settled=true;rejectReady(Error('Destination gate exited before locking.'));}resolve(code??255);}));
 child.stderr.on('data',()=>{});child.on('error',()=>{if(!settled){settled=true;rejectReady(Error('Could not start local gate.'));}});
 child.stdout.on('data',chunk=>{output+=String(chunk);if(!settled&&output.includes('DESTINATION_GATE_READY')){settled=true;clearTimeout(timer);const lines=output.trim().split(/\r?\n/),pid=Number(lines[0]);if(!Number.isSafeInteger(pid)||pid<=0||lines[1]!=='1')rejectReady(Error('Wrong isolated destination gate.'));else resolveReady(pid);}});
 const release=()=>{if(released)return;released=true;if(child.stdin.writable)child.stdin.end('COMMIT;\n\\q\n');};
 const lock=estimateId?table==='work'?`SELECT 1 FROM pro_work WHERE user_id='${f.owner.id}'::uuid AND id='${estimateId}' FOR UPDATE;`:`SELECT 1 FROM pro_private_estimates WHERE owner_id='${f.owner.id}'::uuid AND id='${estimateId}'::uuid FOR UPDATE;`:`SELECT 1 FROM(SELECT pg_advisory_xact_lock(hashtextextended('${f.owner.id}',0)))locked;`;
 child.stdin.write(`BEGIN;\nSELECT pg_backend_pid();\n${lock}\nSELECT 'DESTINATION_GATE_READY';\n`);
 try{return{pid:await ready,executable,release,done};}catch(error){release();child.kill('SIGTERM');await done;throw error;}
}

test('Destination copy API: observed owner-lock expiry rolls back all C rows and receipts; held mutable source rows fail safely without waiting',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await destinationCopyFixture(context,browser);let gate:Awaited<ReturnType<typeof gateOwner>>|undefined,pending:ReturnType<typeof post>|undefined;
 try{
  const destination=await destinationContext(context,{clientId:f.secondClient}),input=destinationCopyInput(historicalSource(f),destination),documents=await estimateRows(f),business=await destinationCopyBusiness(f);
  gate=await gateOwner(f);pending=post(context,f.owner,input,destinationCopyApi);void pending.catch(()=>{});
  await expect.poll(async()=>{const g=gate!;return Number((await nativeExec(g.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`SELECT count(*)FROM pg_stat_activity WHERE ${g.pid}=ANY(pg_blocking_pids(pid))AND query LIKE '%pro_private_estimate_destination_copy_mutate%';`],{env:process.env})).stdout.trim());},{timeout:10000}).toBe(1);
  expect((await nativeExec(gate.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`UPDATE pro_memberships SET status='active',expires_at=clock_timestamp()-interval '1 millisecond' WHERE user_id='${f.owner.id}'::uuid RETURNING 1;`],{env:process.env})).stdout.trim()).toBe('1');
  gate.release();expect(await gate.done).toBe(0);expect((await pending).status()).toBe(403);expect(await estimateRows(f)).toEqual(documents);expect(await copies(f)).toEqual([]);expect(await destinationCopyBusiness(f)).toEqual(business);
  await f.db.from('pro_memberships').update({status:'active',expires_at:null}).eq('user_id',f.owner.id).throwOnError();expect(await proof(context,input.actionId)).toEqual({receipt:null});
  expect((await post(context,f.owner,input,destinationCopyApi)).status()).toBe(200);
  const draftInput=destinationCopyInput(draftSource(f),destination),beforeLock=await estimateRows(f),copyRows=await copies(f);
  gate=await gateOwner(f,f.estimateB.id);expect((await post(context,f.owner,draftInput,destinationCopyApi)).status()).toBe(409);expect(await estimateRows(f)).toEqual(beforeLock);expect(await copies(f)).toEqual(copyRows);gate.release();expect(await gate.done).toBe(0);
  expect((await post(context,f.owner,draftInput,destinationCopyApi)).status()).toBe(200);
  const workDestination=await destinationContext(context,{sourceKind:'work',sourceId:f.destinationWorkId}),workInput=destinationCopyInput(historicalSource(f),workDestination),beforeWorkLock=await estimateRows(f),beforeWorkCopies=await copies(f),beforeWorkBusiness=await destinationCopyBusiness(f);
  gate=await gateOwner(f,f.destinationWorkId,'work');
  expect((await post(context,f.owner,workInput,destinationCopyApi)).status()).toBe(409);
  expect(await estimateRows(f)).toEqual(beforeWorkLock);expect(await copies(f)).toEqual(beforeWorkCopies);expect(await destinationCopyBusiness(f)).toEqual(beforeWorkBusiness);expect(await proof(context,workInput.actionId)).toEqual({receipt:null});
  gate.release();expect(await gate.done).toBe(0);
  expect((await post(context,f.owner,workInput,destinationCopyApi)).status()).toBe(200);

 }finally{gate?.release();if(gate)await gate.done;if(pending)await pending.catch(()=>{});await cleanupDestinationCopy(f);}
});

test('Destination copy API: free clients, foreign owners and current entitlement/profile failures cannot inspect or copy private snapshots',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await destinationCopyFixture(context,browser),free=await createDisposableAccount({prefix:'destination-free'}),freeContext=await browser.newContext({baseURL}),foreign=await browser.newContext({baseURL});let other:DestinationCopyFixture|undefined;
 try{
  await login(freeContext,free);other=await destinationCopyFixture(foreign,browser);const destination=await destinationContext(context,{clientId:f.secondClient}),input=destinationCopyInput(historicalSource(f),destination),before=await estimateRows(f),business=await destinationCopyBusiness(f);
  for(const [reader,actor]of [[freeContext,free],[f.recipientContext,f.recipient],[foreign,other.owner]]as const){
   expect((await post(reader,actor,input,destinationCopyApi)).status()).toBe(403);
   const source=await reader.request.get(destinationCopyApi+'?'+new URLSearchParams({view:'source',kind:'draft',estimateId:f.estimateB.id,revision:'2'}));expect(source.status()).toBe(403);
  }
  expect(await proof(foreign,input.actionId)).toEqual({receipt:null});
  expect((await context.request.post(destinationCopyApi,{headers:{Origin:'http://127.0.0.1:3185','X-Pro-Expected-Actor':free.id},data:input})).status()).toBe(403);
  for(const mode of ['disabled','expired','banned']as const){
   if(mode==='disabled')await f.db.from('profiles').update({is_disabled:true}).eq('id',f.owner.id).throwOnError();
   if(mode==='expired')await f.db.from('pro_memberships').update({status:'inactive'}).eq('user_id',f.owner.id).throwOnError();
   if(mode==='banned')await f.db.from('professionals').insert({profile_id:f.owner.id,category_id:'desarrollo_web',business_name:'Disposable banned destination fixture',slug:'dest-ban-'+f.owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:true}).throwOnError();
   expect((await post(context,f.owner,input,destinationCopyApi)).status()).toBe(403);expect((await context.request.get(destinationCopyApi+'?'+new URLSearchParams({view:'action',actionId:input.actionId}))).status()).toBe(403);
   if(mode==='disabled')await f.db.from('profiles').update({is_disabled:false}).eq('id',f.owner.id).throwOnError();
   if(mode==='expired')await f.db.from('pro_memberships').update({status:'active',expires_at:null}).eq('user_id',f.owner.id).throwOnError();
   if(mode==='banned')await f.db.from('professionals').delete().eq('profile_id',f.owner.id).throwOnError();
  }
  const raw=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});expect((await raw.auth.signInWithPassword({email:f.owner.email,password:f.owner.password})).error).toBeNull();
  expect((await raw.rpc('pro_private_estimate_destination_copy_mutate',{p_actor:f.owner.id,p_input:input})).error?.code).toBe('42501');expect((await raw.from('pro_private_estimate_destination_copies').select('*')).error?.code).toBe('42501');
  expect(await estimateRows(f)).toEqual(before);expect(await destinationCopyBusiness(f)).toEqual(business);expect(await copies(f)).toEqual([]);
 }finally{await freeContext.close();await foreign.close();if(other)await cleanupDestinationCopy(other);await cleanupDisposableAccount(free);await cleanupDestinationCopy(f);}
});

test('Destination copy API: all three destination pickers paginate 20 plus one, search literal Unicode and wildcards, and never write on reads',async({context,browser,baseURL})=>{
 test.setTimeout(240000);local(baseURL);const f=await destinationCopyFixture(context,browser);
 try{
  const clientIds:string[]=[],workIds:string[]=[],manualIds:string[]=[];
  for(let index=0;index<21;index++){
   const suffix=String(index).padStart(2,'0'),clientId='destination-page-client-'+suffix,name='PAGE_CLIENT_'+suffix+(index===20?' %_ ñ':'');clientIds.push(clientId);
   await f.db.from('pro_clients').insert({user_id:f.owner.id,id:clientId,name,email:'',phone:'',notes:'',archived:false}).throwOnError();
   const workId=uuid();workIds.push(workId);await f.db.from('pro_work').insert({user_id:f.owner.id,id:workId,clientId:f.secondClient,client:f.destinationClient.name,service:'PAGE_WORK_'+suffix+(index===20?' %_ ñ':''),stage:'new',start:index===0?'2030-02-28':'',end:'',cancelled:false}).throwOnError();
   const manual={...manualInput({...f,clientId:f.secondClient}),title:'PAGE_MANUAL_'+suffix+(index===20?' %_ ñ':'')};manualIds.push(manual.id);expect((await post(context,f.owner,manual,'/api/pro/lead-private-core')).status()).toBe(200);
  }
  const before=await destinationCopyBusiness(f),documents=await estimateRows(f),copyRows=await copies(f);
  for(const [kind,query,ids]of [['client','PAGE_CLIENT_',clientIds],['work','PAGE_WORK_',workIds],['manual','PAGE_MANUAL_',manualIds]]as const){
   const first=privateEstimateDestinationCopyOptionsSchema.parse(await json(context,{view:'options',kind,q:query},destinationCopyApi));expect(first.items).toHaveLength(20);expect(first.nextCursor).not.toBeNull();
   const second=privateEstimateDestinationCopyOptionsSchema.parse(await json(context,{view:'options',kind,q:query,after:first.nextCursor!,atSnapshot:first.fingerprint},destinationCopyApi));expect(second.items).toHaveLength(1);expect(second.nextCursor).toBeNull();expect(new Set([...first.items,...second.items].map(row=>row.id))).toEqual(new Set(ids));
   for(const row of [...first.items,...second.items]){expect(row.hasLinkedWork).toBe(false);expect(row.date).toEqual(kind==='client'?null:kind==='work'?(row.id===workIds[0]?'2030-02-28':null):expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));}
   const literal=privateEstimateDestinationCopyOptionsSchema.parse(await json(context,{view:'options',kind,q:'%_ ñ'},destinationCopyApi));expect(literal.items.map(row=>row.id)).toEqual([ids[20]]);
  }
  expect(await destinationCopyBusiness(f)).toEqual(before);expect(await estimateRows(f)).toEqual(documents);expect(await copies(f)).toEqual(copyRows);
  const captured=privateEstimateDestinationCopyOptionsSchema.parse(await json(context,{view:'options',kind:'client',q:'PAGE_CLIENT_'},destinationCopyApi));
  await f.db.from('pro_clients').update({name:'PAGE_CLIENT_RENAMED'}).eq('user_id',f.owner.id).eq('id',clientIds[0]).throwOnError();
  const afterRename=await destinationCopyBusiness(f);
  expect((await context.request.get(destinationCopyApi+'?'+new URLSearchParams({view:'options',kind:'client',q:'PAGE_CLIENT_',after:captured.nextCursor!,atSnapshot:captured.fingerprint}))).status()).toBe(409);
  expect(await destinationCopyBusiness(f)).toEqual(afterRename);expect(await estimateRows(f)).toEqual(documents);expect(await copies(f)).toEqual(copyRows);
  const manualPage=privateEstimateDestinationCopyOptionsSchema.parse(await json(context,{view:'options',kind:'manual',q:'PAGE_MANUAL_'},destinationCopyApi)),leadId=manualPage.items[0].id;
  const convert={action:'convert',actionId:uuid(),leadId,leadRevision:1,workId:uuid()};
  expect((await post(context,f.owner,convert,'/api/pro/lead-private-work')).status()).toBe(200);
  const afterConversion=await destinationCopyBusiness(f);
  expect((await context.request.get(destinationCopyApi+'?'+new URLSearchParams({view:'options',kind:'manual',q:'PAGE_MANUAL_',after:manualPage.nextCursor!,atSnapshot:manualPage.fingerprint}))).status()).toBe(409);
  const refreshed=privateEstimateDestinationCopyOptionsSchema.parse(await json(context,{view:'options',kind:'manual',q:'PAGE_MANUAL_'},destinationCopyApi));
  expect(refreshed.fingerprint).not.toBe(manualPage.fingerprint);expect(refreshed.items.find(row=>row.id===leadId)).toEqual({...manualPage.items.find(row=>row.id===leadId),hasLinkedWork:true});
  expect(await destinationCopyBusiness(f)).toEqual(afterConversion);expect(await estimateRows(f)).toEqual(documents);expect(await copies(f)).toEqual(copyRows);


 }finally{await cleanupDestinationCopy(f);}
});
