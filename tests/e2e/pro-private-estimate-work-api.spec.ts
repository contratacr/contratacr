import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {test,expect} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {local,workFixture,cleanupWorkFixture,acceptedDocument,convertedWork,manualLead,newIntent,checkedWork,workRead,post,snapshot,state,oldDocuments,estimateRows,assertOnlyWorkAppend,workEndpoint} from './private-estimate-work-fixture';
import {login} from './pro-private-estimate-publications-fixture';

test('Accepted quote work API: exact accepted money creates an unscheduled private job and preserves historical receipts after later edits',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await workFixture(context,browser);
 try {
  const document=await acceptedDocument(context,f,undefined,{currency:'CRC'}),before=await snapshot(f),privateBefore=await state(f),old=await oldDocuments(f),documents=await estimateRows(f);
  const current=await checkedWork(context,{view:'context',publicationId:document.publication.publicationId});
  expect(current).toMatchObject({accepted:{actionId:document.accept.actionId,actorId:f.recipient.id,at:document.event.at},currency:'CRC',totalCents:2472,source:null,requiredWork:null,canCreate:true});
  const command=newIntent(document),created=await post(context,f.owner,command,workEndpoint);expect(created.status()).toBe(200);
  const result=await created.json();
  expect(result).toMatchObject({action:'continue',agreement:{publicationId:document.publication.publicationId,estimateId:document.estimate.id,estimateRevision:1,version:1,workId:command.target.workId,clientId:f.clientId,title:document.estimate.title,currency:'CRC',totalCents:2472,contentHash:document.publication.contentHash,acceptedActionId:document.accept.actionId,acceptedActorId:f.recipient.id,acceptedAt:document.event.at,source:null},work:{id:command.target.workId,clientId:f.clientId,service:document.estimate.title,stage:'new',start:'',end:'',cancelled:false,bookingClientId:null,quoteId:null,externalQuoteId:null}});
  expect(await checkedWork(context,{view:'action',actionId:command.actionId})).toEqual({receipt:{input:command,result}});
  expect(await checkedWork(context,{view:'mapping',publicationId:document.publication.publicationId})).toEqual({agreement:result.agreement,work:result.work});
  expect(await checkedWork(context,{view:'mapping',workId:command.target.workId})).toEqual({agreement:result.agreement,work:result.work});
  await assertOnlyWorkAppend(f,before,command.target.workId,1,result.agreement.createdAt);
  expect(await state(f)).toEqual(privateBefore);expect(await oldDocuments(f)).toEqual(old);expect(await estimateRows(f)).toEqual(documents);
  expect(await (await post(context,f.owner,command,workEndpoint)).json()).toEqual(result);
  const stableWork=(await f.db.from('pro_work').select('*').eq('user_id',f.owner.id).eq('id',command.target.workId).single().throwOnError()).data!;
  for(const patch of [{clientId:f.secondClient},{bookingClientId:f.recipient.id},{quoteId:'forbidden-legacy-link'},{externalQuoteId:crypto.randomUUID()},{id:crypto.randomUUID()}]) {
   expect((await f.db.from('pro_work').update(patch).eq('user_id',f.owner.id).eq('id',command.target.workId)).error?.code).toBe('23514');
   expect((await f.db.from('pro_work').select('*').eq('user_id',f.owner.id).eq('id',command.target.workId).single().throwOnError()).data).toEqual(stableWork);
  }
  expect((await post(context,f.owner,{...command,actionId:crypto.randomUUID()},workEndpoint)).status()).toBe(409);
  expect((await post(context,f.owner,{...command,contentHash:'a'.repeat(64)},workEndpoint)).status()).toBe(400);
  expect((await post(context,f.owner,{action:'archive',actionId:crypto.randomUUID(),estimateId:document.estimate.id,revision:1})).status()).toBe(200);
  await f.db.from('pro_clients').update({name:'Cliente renombrado después del acuerdo',archived:true}).eq('user_id',f.owner.id).eq('id',f.clientId).throwOnError();
  await f.db.from('pro_work').update({service:'Trabajo editado después del acuerdo',cancelled:true,stage:'completed'}).eq('user_id',f.owner.id).eq('id',command.target.workId).throwOnError();
  const retained=await snapshot(f);
  expect(await (await post(context,f.owner,command,workEndpoint)).json()).toEqual(result);
  expect(await checkedWork(context,{view:'action',actionId:command.actionId})).toEqual({receipt:{input:command,result}});
  const mapping=await checkedWork(context,{view:'mapping',workId:command.target.workId});expect(mapping.agreement).toEqual(result.agreement);expect(mapping.work).toMatchObject({cancelled:true,stage:'completed',service:'Trabajo editado después del acuerdo',clientId:f.clientId});
  expect(await snapshot(f)).toEqual(retained);
 } finally {await cleanupWorkFixture(f);}
});

test('Accepted quote work API: work and converted-manual sources reuse their real job while an unconverted manual source preserves its accepted revision',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await workFixture(context,browser);
 try {
  for(const kind of ['work','manual'] as const){
   const converted=await convertedWork(context,f),sourceWorkId=converted.result.work.id,source={kind,id:kind==='work'?sourceWorkId:converted.lead.id};
   const document=await acceptedDocument(context,f,source);
   expect((await post(context,f.owner,{...document.save,actionId:crypto.randomUUID(),revision:1,title:'Borrador actual distinto del aceptado',currency:'CRC'})).status()).toBe(200);
   const before=await snapshot(f),old=await oldDocuments(f),privateBefore=await state(f);
   const current=await checkedWork(context,{view:'context',publicationId:document.publication.publicationId});
   expect(current.requiredWork).toMatchObject({work:{id:sourceWorkId},reason:source.kind==='work'?'source_work':'converted_manual'});
   const command={...newIntent(document),target:{kind:'existing',workId:sourceWorkId,fingerprint:current.requiredWork.fingerprint}};
   const result=await post(context,f.owner,command,workEndpoint);
   expect(result.status()).toBe(200);const ack=await result.json();expect(ack.work.service).toBe(converted.result.work.service);expect(ack.agreement.source).toEqual(document.estimate.source);expect(ack.agreement).toMatchObject({estimateRevision:1,title:document.estimate.title,currency:'USD',totalCents:2472});
   expect(await snapshot(f)).toEqual(before);expect(await oldDocuments(f)).toEqual(old);expect(await state(f)).toEqual(privateBefore);
  }
  const lead=await manualLead(context,f),document=await acceptedDocument(context,f,{kind:'manual',id:lead.id});
  const update={...lead,action:'update',actionId:crypto.randomUUID(),revision:1,title:'Título actual diferente del aceptado'};
  delete (update as Partial<typeof lead>).catalogRevision;delete (update as Partial<typeof lead>).stageMode;delete (update as Partial<typeof lead>).stageId;
  expect((await post(context,f.owner,update,'/api/pro/lead-private-core')).status()).toBe(200);
  const before=await snapshot(f),privateBefore=await state(f),old=await oldDocuments(f),command={...newIntent(document),target:{kind:'new',workId:crypto.randomUUID(),conversionActionId:crypto.randomUUID(),leadRevision:2}};
  const created=await post(context,f.owner,command,workEndpoint);expect(created.status()).toBe(200);const ack=await created.json();
  expect(ack.agreement.source).toEqual({kind:'manual',id:lead.id,revision:1});expect(ack.work.service).toBe(document.estimate.title);expect(ack.work).toMatchObject({stage:'new',start:'',end:''});
  await assertOnlyWorkAppend(f,before,command.target.workId,2,ack.agreement.createdAt);
  const after=await state(f);
  expect(after.pro_lead_center_records).toEqual(privateBefore.pro_lead_center_records);expect(after.pro_lead_center_history).toEqual(privateBefore.pro_lead_center_history);
  expect(await oldDocuments(f)).toEqual(old);
 } finally {await cleanupWorkFixture(f);}
});

function nativeDatabase(){const executable=process.env.PRO_LOCAL_PSQL;if(!executable||!process.env.PGPASSWORD)throw Error('Local PostgreSQL test gate credentials are required. Root must provide its isolated native psql environment.');expect(process.env.PGHOST).toMatch(/^(localhost|127\.0\.0\.1)$/);expect(process.env.PGPORT).toBe('54322');expect(process.env.PGDATABASE).toBe('postgres');return executable;}

async function lockWork(ownerId:string,leadId:string){
 const executable=nativeDatabase(),table='pro_work';for(const value of [ownerId,leadId])expect(value).toMatch(/^[a-f0-9-]{36}$/);const processGate=spawn(executable,['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:process.env,stdio:['pipe','pipe','pipe']});let output='',settled=false,releaseCalled=false,resolveReady:(pid:number)=>void=()=>{},rejectReady:(error:Error)=>void=()=>{};const ready=new Promise<number>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;}),timer=setTimeout(()=>{if(!settled){settled=true;rejectReady(Error('Local file-head gate timed out.'));}},10000),done=new Promise<number>(resolve=>{processGate.on('close',code=>{clearTimeout(timer);if(!settled){settled=true;rejectReady(Error('Local database gate ended before obtaining its file-head lock.'));}resolve(code??255);});});processGate.on('error',()=>{clearTimeout(timer);if(!settled){settled=true;rejectReady(Error('Could not start the isolated PostgreSQL gate.'));}});processGate.stderr.on('data',()=>{});processGate.stdout.on('data',chunk=>{output+=String(chunk);if(!settled&&output.includes('LOCAL_GATE_READY')){clearTimeout(timer);const lines=output.trim().split(/\r?\n/);settled=true;const pid=Number(lines[0]);if(!Number.isSafeInteger(pid)||pid<=0||lines[1]!=='1')rejectReady(Error('The isolated file-head gate did not lock the expected revision.'));else resolveReady(pid);}});const release=()=>{if(releaseCalled)return;releaseCalled=true;if(processGate.stdin.writable)processGate.stdin.end('COMMIT;\n\\q\n');};processGate.stdin.write(`BEGIN;\nSELECT pg_backend_pid();\nSELECT 1 FROM public.${table} WHERE user_id='${ownerId}'::uuid AND id='${leadId}' FOR UPDATE;\nSELECT 'LOCAL_GATE_READY';\n`);try{return{pid:await ready,done,release,executable};}catch(error){release();processGate.kill('SIGTERM');await done;throw error;}
}




async function lockAction(ownerId:string,leadId:string){
 const executable=nativeDatabase();for(const value of [ownerId,leadId])expect(value).toMatch(/^[a-f0-9-]{36}$/);const processGate=spawn(executable,['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:process.env,stdio:['pipe','pipe','pipe']});let output='',settled=false,releaseCalled=false,resolveReady:(pid:number)=>void=()=>{},rejectReady:(error:Error)=>void=()=>{};const ready=new Promise<number>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;}),timer=setTimeout(()=>{if(!settled){settled=true;rejectReady(Error('Local file-head gate timed out.'));}},10000),done=new Promise<number>(resolve=>{processGate.on('close',code=>{clearTimeout(timer);if(!settled){settled=true;rejectReady(Error('Local database gate ended before obtaining its file-head lock.'));}resolve(code??255);});});processGate.on('error',()=>{clearTimeout(timer);if(!settled){settled=true;rejectReady(Error('Could not start the isolated PostgreSQL gate.'));}});processGate.stderr.on('data',()=>{});processGate.stdout.on('data',chunk=>{output+=String(chunk);if(!settled&&output.includes('LOCAL_GATE_READY')){clearTimeout(timer);const lines=output.trim().split(/\r?\n/);settled=true;const pid=Number(lines[0]);if(!Number.isSafeInteger(pid)||pid<=0||lines[1]!=='1')rejectReady(Error('The isolated file-head gate did not lock the expected revision.'));else resolveReady(pid);}});const release=()=>{if(releaseCalled)return;releaseCalled=true;if(processGate.stdin.writable)processGate.stdin.end('COMMIT;\n\\q\n');};processGate.stdin.write(`BEGIN;\nSELECT pg_backend_pid();\nSELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended('pro-private-estimate-work-action:${ownerId}:${leadId}',0))) locked;\nSELECT 'LOCAL_GATE_READY';\n`);try{return{pid:await ready,done,release,executable};}catch(error){release();processGate.kill('SIGTERM');await done;throw error;}
}





test('Accepted quote work API: an observed action wait rechecks entitlement and preserves all commercial rows on expiry',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await workFixture(context,browser),free=await createDisposableAccount({prefix:'estimate-work-free'}),freeContext=await browser.newContext({baseURL}),foreignContext=await browser.newContext({baseURL}),anonymous=await browser.newContext({baseURL});
 let foreign:Awaited<ReturnType<typeof workFixture>>|undefined,gate:Awaited<ReturnType<typeof lockWork>>|undefined,pending:ReturnType<typeof post>|undefined;
 try {
  await login(freeContext,free);foreign=await workFixture(foreignContext,browser);
  const document=await acceptedDocument(context,f);
  await f.db.from('pro_products').insert({user_id:f.owner.id,id:'accepted-work-material',sku:'MAT-LOCAL',name:'Material utilizado previamente',stock:3,minimum:0,cost:125.25,price:200,archived:false}).throwOnError();
  const materialAccount=await context.request.get('/api/pro/client-operations?'+new URLSearchParams({clientId:f.clientId,workId:f.workId}));expect(materialAccount.status()).toBe(200);
  expect((await post(context,f.owner,{kind:'material',actionId:crypto.randomUUID(),clientId:f.clientId,workId:f.workId,revision:(await materialAccount.json()).revision,productId:'accepted-work-material',quantity:1},'/api/pro/client-operations')).status()).toBe(200);
  const materialState=async()=>Object.fromEntries(await Promise.all(['pro_products','pro_movements'].map(async table=>[table,(await f.db.from(table).select('*').eq('user_id',f.owner.id).order('id').throwOnError()).data])));
  const stockBefore=await materialState(),candidates=await checkedWork(context,{view:'candidates',publicationId:document.publication.publicationId});
  const selected=candidates.items.find((item:{work:{id:string}})=>item.work.id===f.workId);expect(selected).toBeDefined();
  const command={...newIntent(document),target:{kind:'existing',workId:f.workId,fingerprint:selected.fingerprint}},before=await snapshot(f),old=await oldDocuments(f),privateBefore=await state(f),documents=await estimateRows(f);
  gate=await lockWork(f.owner.id,f.workId);
  const lockedTarget=await post(context,f.owner,{...command,actionId:crypto.randomUUID()},workEndpoint);expect(lockedTarget.status()).toBe(409);
  expect(await checkedWork(context,{view:'mapping',publicationId:document.publication.publicationId})).toEqual({agreement:null,work:null});
  gate.release();expect(await gate.done).toBe(0);
  gate=await lockAction(f.owner.id,command.actionId);pending=post(context,f.owner,command,workEndpoint);
  const run=promisify(execFile);
  await expect.poll(async()=>{
   const result=await run(gate!.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND query LIKE '%pro_private_estimate_work_continue%' AND ${gate!.pid}=ANY(pg_blocking_pids(pid));`],{env:process.env});return Number(result.stdout.trim());
  }).toBe(1);
  await run(gate.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`UPDATE public.pro_memberships SET expires_at=clock_timestamp()-interval '1 millisecond' WHERE user_id='${f.owner.id}'::uuid;`],{env:process.env});
  gate.release();expect(await gate.done).toBe(0);expect((await pending).status()).toBe(403);
  await f.db.from('pro_memberships').update({expires_at:null}).eq('user_id',f.owner.id).throwOnError();
  expect(await checkedWork(context,{view:'action',actionId:command.actionId})).toEqual({receipt:null});
  expect(await checkedWork(context,{view:'mapping',publicationId:document.publication.publicationId})).toEqual({agreement:null,work:null});
  expect(await snapshot(f)).toEqual(before);expect(await oldDocuments(f)).toEqual(old);expect(await state(f)).toEqual(privateBefore);expect(await estimateRows(f)).toEqual(documents);
  const retry=await post(context,f.owner,command,workEndpoint);expect(retry.status()).toBe(200);const ack=await retry.json();expect(ack.work.id).toBe(f.workId);
  expect(await snapshot(f)).toEqual(before);expect(await materialState()).toEqual(stockBefore);
  for(const [actorContext,status]of [[anonymous,401],[freeContext,403],[f.recipientContext,403],[foreignContext,403]] as const)expect((await workRead(actorContext,{view:'context',publicationId:document.publication.publicationId})).status()).toBe(status);
  await f.db.from('profiles').update({is_disabled:true}).eq('id',f.owner.id).throwOnError();expect((await workRead(context,{view:'action',actionId:command.actionId})).status()).toBe(403);await f.db.from('profiles').update({is_disabled:false}).eq('id',f.owner.id).throwOnError();
  await f.db.from('professionals').insert({profile_id:f.owner.id,category_id:'desarrollo_web',business_name:'Ficha bloqueada local',slug:'estimate-work-ban-'+f.owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:true}).throwOnError();expect((await workRead(context,{view:'action',actionId:command.actionId})).status()).toBe(403);await f.db.from('professionals').delete().eq('profile_id',f.owner.id).throwOnError();
 } finally {
  gate?.release();if(pending)await pending.catch(()=>{});await freeContext.close();await foreignContext.close();await anonymous.close();if(foreign)await cleanupWorkFixture(foreign);await cleanupDisposableAccount(free);await cleanupWorkFixture(f);
 }
});

test('Accepted quote work API: only accepted client consent authorizes a link and candidate filtering precedes the 20-row limit',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await workFixture(context,browser);
 try {
  const base=await acceptedDocument(context,f),ids=Array.from({length:21},()=>crypto.randomUUID()),badClient=crypto.randomUUID(),cancelled=crypto.randomUUID(),wrongRecipient=crypto.randomUUID(),financed=crypto.randomUUID();
  const row=(id:string,service:string,clientId=f.clientId)=>({user_id:f.owner.id,id,clientId,client:'Cliente privado',service,stage:'new',start:'',end:'',cancelled:false});
  await f.db.from('pro_work').insert([...ids.map((id,index)=>row(id,'CANDIDATE %_ '+index)),row(crypto.randomUUID(),'CANDIDATE XX noise'),row(badClient,'CANDIDATE %_ wrong client',f.secondClient),{...row(cancelled,'CANDIDATE %_ cancelled'),cancelled:true},{...row(wrongRecipient,'CANDIDATE %_ wrong recipient'),bookingClientId:f.owner.id},row(financed,'CANDIDATE %_ legacy agreement')]).throwOnError();
  const accountResponse=await context.request.get('/api/pro/client-operations?'+new URLSearchParams({clientId:f.clientId,workId:financed}));expect(accountResponse.status()).toBe(200);const account=await accountResponse.json();
  expect((await post(context,f.owner,{kind:'agreement',actionId:crypto.randomUUID(),clientId:f.clientId,workId:financed,revision:account.revision,amountCents:0},'/api/pro/client-operations')).status()).toBe(200);
  const before=await snapshot(f),old=await oldDocuments(f),privateBefore=await state(f),first=await checkedWork(context,{view:'candidates',publicationId:base.publication.publicationId,q:'%_'});
  expect(first.items).toHaveLength(20);expect(first.nextCursor).not.toBeNull();
  const tail=await checkedWork(context,{view:'candidates',publicationId:base.publication.publicationId,q:'%_',after:first.nextCursor});expect(tail.items).toHaveLength(1);expect(tail.nextCursor).toBeNull();
  expect([...first.items,...tail.items].map((item:{work:{id:string}})=>item.work.id).toSorted()).toEqual(ids.toSorted());
  for(const id of [badClient,cancelled,wrongRecipient,financed]){
   // A forged fingerprint cannot authorize a work omitted by the server.
   expect((await post(context,f.owner,{...newIntent(base),target:{kind:'existing',workId:id,fingerprint:'a'.repeat(32)}},workEndpoint)).status()).toBe(409);
  }
  const financialSource=await acceptedDocument(context,f,{kind:'work',id:financed});
  const financialContext=await checkedWork(context,{view:'context',publicationId:financialSource.publication.publicationId});
  expect(financialContext).toMatchObject({canCreate:false,reason:'legacy_finance',requiredWork:{work:{id:financed}}});
  expect((await post(context,f.owner,{...newIntent(financialSource),target:{kind:'existing',workId:financed,fingerprint:financialContext.requiredWork.fingerprint}},workEndpoint)).status()).toBe(409);
  // Create a second, genuinely shared publication without accepting it.
  const saved={...base.save,actionId:crypto.randomUUID(),estimateId:crypto.randomUUID(),revision:0};expect((await post(context,f.owner,saved)).status()).toBe(200);
  const code=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),publish={action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:saved.estimateId,estimateRevision:1,recipient:{kind:'claim',email:f.recipient.email,code}};
  expect((await post(context,f.owner,publish,'/api/pro/private-estimate-publications')).status()).toBe(200);
  const claimed=await post(f.recipientContext,f.recipient,{action:'claim',actionId:crypto.randomUUID(),code},'/api/pro/private-estimate-publications');expect(claimed.status()).toBe(200);let current=(await claimed.json()).publication;
  const intent=()=>({action:'continue',actionId:crypto.randomUUID(),publicationId:current.publicationId,contentHash:current.contentHash,publicationRevision:current.revision,target:{kind:'new',workId:crypto.randomUUID(),conversionActionId:null,leadRevision:null}});
  expect((await post(context,f.owner,intent(),workEndpoint)).status()).toBe(409);
  expect((await post(context,f.owner,{action:'accept',actionId:crypto.randomUUID(),publicationId:current.publicationId,revision:current.revision,contentHash:current.contentHash},'/api/pro/private-estimate-publications')).status()).toBe(403);
  const change=await post(f.recipientContext,f.recipient,{action:'request_changes',actionId:crypto.randomUUID(),publicationId:current.publicationId,revision:current.revision,contentHash:current.contentHash,note:'Todavía no acepto el alcance'},'/api/pro/private-estimate-publications');expect(change.status()).toBe(200);current=(await change.json()).publication;
  expect((await post(context,f.owner,intent(),workEndpoint)).status()).toBe(409);
  const decline=await post(f.recipientContext,f.recipient,{action:'decline',actionId:crypto.randomUUID(),publicationId:current.publicationId,revision:current.revision,contentHash:current.contentHash},'/api/pro/private-estimate-publications');expect(decline.status()).toBe(200);current=(await decline.json()).publication;
  expect((await post(context,f.owner,intent(),workEndpoint)).status()).toBe(409);
  expect(await snapshot(f)).toEqual(before);expect(await oldDocuments(f)).toEqual(old);expect(await state(f)).toEqual(privateBefore);
  expect((await workRead(context,{view:'mapping',publicationId:base.publication.publicationId,workId:f.workId})).status()).toBe(400);
 } finally {await cleanupWorkFixture(f);}
});

test('Accepted quote work API: deleting the recipient retains authentic immutable acceptance evidence without adopting a missing live receipt',async({context,browser,baseURL})=>{
 test.setTimeout(120000);local(baseURL);const f=await workFixture(context,browser);
 try {
  const document=await acceptedDocument(context,f),before=await snapshot(f),old=await oldDocuments(f),documents=await estimateRows(f);
  expect((await f.db.auth.admin.deleteUser(f.recipient.id)).error).toBeNull();
  expect((await f.db.from('profiles').select('id').eq('id',f.recipient.id).throwOnError()).data).toEqual([]);
  expect((await f.db.from('pro_private_estimate_publication_actions').select('*').eq('actor_id',f.recipient.id).eq('action_id',document.accept.actionId).throwOnError()).data).toEqual([]);
  expect((await f.db.from('pro_private_estimate_publication_events').select('*').eq('publication_id',document.publication.publicationId).eq('action_id',document.accept.actionId).single().throwOnError()).data).toEqual(document.event);
  const current=await checkedWork(context,{view:'context',publicationId:document.publication.publicationId});expect(current.accepted).toEqual({actionId:document.accept.actionId,actorId:f.recipient.id,at:document.event.at});
  const command=newIntent(document),created=await post(context,f.owner,command,workEndpoint);expect(created.status()).toBe(200);const result=await created.json();
  expect(result.agreement).toMatchObject({acceptedActorId:f.recipient.id,acceptedActionId:document.accept.actionId,acceptedAt:document.event.at,totalCents:2472});
  await assertOnlyWorkAppend(f,before,command.target.workId,1,result.agreement.createdAt);
  expect(await oldDocuments(f)).toEqual(old);expect(await estimateRows(f)).toEqual(documents);
 } finally {await cleanupWorkFixture(f);}
});

test('Accepted quote work API: legal direct-draft customer changes preserve acceptance while source-bound drafts reject reassignment',async({context,browser,baseURL})=>{
 test.setTimeout(180000);
 local(baseURL);
 const f=await workFixture(context,browser);
 try {
  const document=await acceptedDocument(context,f);
  const contextBResponse=await context.request.get('/api/pro/private-estimates?'+new URLSearchParams({view:'context',clientId:f.secondClient}));
  expect(contextBResponse.status()).toBe(200);
  const contextB=await contextBResponse.json();
  const draftB={...document.save,actionId:crypto.randomUUID(),revision:1,clientId:f.secondClient,clientFingerprint:contextB.clientFingerprint,refreshClient:true,source:null,title:'DRAFT_B'};
  const changed=await post(context,f.owner,draftB);
  expect(changed.status()).toBe(200);
  expect((await changed.json()).estimate).toMatchObject({id:document.estimate.id,revision:2,clientId:f.secondClient,source:null,title:'DRAFT_B'});

  const before=await snapshot(f),privateBefore=await state(f),old=await oldDocuments(f),draftHistoryBefore=await estimateRows(f);
  const acceptedContext=await checkedWork(context,{view:'context',publicationId:document.publication.publicationId});
  expect(acceptedContext).toMatchObject({publicationId:document.publication.publicationId,client:{id:f.clientId},source:null,requiredWork:null,canCreate:true,reason:null});
  const command=newIntent(document),created=await post(context,f.owner,command,workEndpoint);
  expect(created.status()).toBe(200);
  const result=await created.json();
  expect(result.agreement).toMatchObject({publicationId:document.publication.publicationId,estimateId:document.estimate.id,estimateRevision:1,clientId:f.clientId,title:document.estimate.title,currency:document.estimate.currency,totalCents:2472,source:null,acceptedActionId:document.accept.actionId,acceptedActorId:f.recipient.id});
  expect(result.work).toMatchObject({id:command.target.workId,clientId:f.clientId,service:document.estimate.title,stage:'new',start:'',end:''});
  await assertOnlyWorkAppend(f,before,command.target.workId,1,result.agreement.createdAt);
  expect(await state(f)).toEqual(privateBefore);expect(await oldDocuments(f)).toEqual(old);expect(await estimateRows(f)).toEqual(draftHistoryBefore);
  const workBefore=(await f.db.from('pro_work').select('*').eq('user_id',f.owner.id).eq('id',command.target.workId).single().throwOnError()).data!;
  expect((await f.db.from('pro_work').update({clientId:f.secondClient}).eq('user_id',f.owner.id).eq('id',command.target.workId)).error?.code).toBe('23514');
  expect((await f.db.from('pro_work').select('*').eq('user_id',f.owner.id).eq('id',command.target.workId).single().throwOnError()).data).toEqual(workBefore);
  expect(await estimateRows(f)).toEqual(draftHistoryBefore);

  // A source-bound draft has a stricter, existing immutable-source contract.
  const sourceDocument=await acceptedDocument(context,f,{kind:'work',id:f.workId});
  const sourceDraftBefore=await estimateRows(f),sourceBusinessBefore=await snapshot(f),sourcePrivateBefore=await state(f),sourceOldBefore=await oldDocuments(f);
  const illegalDraft={...sourceDocument.save,actionId:crypto.randomUUID(),revision:1,clientId:f.secondClient,clientFingerprint:contextB.clientFingerprint,refreshClient:true,source:null,title:'DRAFT_B_SOURCE_REJECTED'};
  expect((await post(context,f.owner,illegalDraft)).status()).toBe(400);
  expect(await estimateRows(f)).toEqual(sourceDraftBefore);
  const sourceContext=await checkedWork(context,{view:'context',publicationId:sourceDocument.publication.publicationId});
  expect(sourceContext).toMatchObject({client:{id:f.clientId},requiredWork:{work:{id:f.workId,clientId:f.clientId},reason:'source_work'},canCreate:true,reason:null});
  expect(sourceContext.source).toEqual(sourceDocument.estimate.source);
  const rejectedNew=newIntent(sourceDocument);
  expect((await post(context,f.owner,rejectedNew,workEndpoint)).status()).toBe(409);
  expect(await checkedWork(context,{view:'action',actionId:rejectedNew.actionId})).toEqual({receipt:null});
  expect((await f.db.from('pro_work').select('*').eq('user_id',f.owner.id).eq('id',rejectedNew.target.workId).throwOnError()).data).toEqual([]);
  expect(await checkedWork(context,{view:'mapping',publicationId:sourceDocument.publication.publicationId})).toEqual({agreement:null,work:null});
  expect(await snapshot(f)).toEqual(sourceBusinessBefore);expect(await estimateRows(f)).toEqual(sourceDraftBefore);
  const existing={...newIntent(sourceDocument),target:{kind:'existing',workId:f.workId,fingerprint:sourceContext.requiredWork.fingerprint}};
  const linked=await post(context,f.owner,existing,workEndpoint);
  expect(linked.status()).toBe(200);
  const reused=await linked.json();
  expect(reused.agreement).toMatchObject({publicationId:sourceDocument.publication.publicationId,estimateRevision:1,clientId:f.clientId,workId:f.workId,title:sourceDocument.estimate.title,totalCents:2472});
  expect(reused.agreement.source).toEqual(sourceDocument.estimate.source);
  expect(await checkedWork(context,{view:'action',actionId:existing.actionId})).toEqual({receipt:{input:existing,result:reused}});
  expect(await snapshot(f)).toEqual(sourceBusinessBefore);expect(await state(f)).toEqual(sourcePrivateBefore);expect(await oldDocuments(f)).toEqual(sourceOldBefore);expect(await estimateRows(f)).toEqual(sourceDraftBefore);
 } finally {
  await cleanupWorkFixture(f);
 }
});
