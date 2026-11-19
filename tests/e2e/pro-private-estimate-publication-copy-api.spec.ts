import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {test,expect} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {publicationCopyFixture,cleanupPublicationCopy,copyInput,copyEndpoint,copyRead,copiedReceipt,copyBusiness,estimateRows,post,local,login,json,type PublicationCopyFixture} from './private-estimate-publication-copy-fixture';
function assertHistoricalCopy(f:PublicationCopyFixture,estimate:typeof f.estimateA,target:string){
 expect(estimate).toMatchObject({id:target,ownerId:f.owner.id,revision:1,status:'draft',title:'HISTORICAL_PUBLICATION_A',currency:'USD',totalCents:2472});
 const retained=(value:typeof estimate)=>Object.fromEntries(Object.entries(value).filter(([key])=>!['id','revision','status','createdAt','updatedAt'].includes(key)));
 expect(retained(estimate)).toEqual(retained(f.estimateA));
 expect(estimate.createdAt).not.toBe(f.estimateA.createdAt);expect(estimate.updatedAt).not.toBe(f.estimateA.updatedAt);
 expect(Date.parse(estimate.updatedAt)).toBeGreaterThanOrEqual(Date.parse(estimate.createdAt));
}
async function assertOneNewDocument(f:PublicationCopyFixture,before:Awaited<ReturnType<typeof estimateRows>>,target:string,estimate:typeof f.estimateA){
 const after=await estimateRows(f);
 for(const table of ['pro_private_estimates','pro_private_estimate_items','pro_private_estimate_history']) {
  const rows=after[table] as Record<string,unknown>[];
  expect(rows.filter(row=>(table==='pro_private_estimates'?row.id:row.estimate_id)!==target),table).toEqual(before[table]);
 }
 expect(after.pro_private_estimate_actions).toEqual(before.pro_private_estimate_actions);
 const history=(after.pro_private_estimate_history as Record<string,unknown>[]).filter(row=>row.estimate_id===target);
 expect(history).toHaveLength(1);expect(history[0]).toMatchObject({action:'duplicate',before_estimate:f.estimateA,after_estimate:estimate});
 expect((after.pro_private_estimates as Record<string,unknown>[]).filter(row=>row.id===target)).toHaveLength(1);
 expect((after.pro_private_estimate_items as Record<string,unknown>[]).filter(row=>row.estimate_id===target)).toHaveLength(f.estimateA.lines.length);
}

test('Publication copy API: accepted historical A creates exact private C while current B and all shared decisions stay unchanged',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await publicationCopyFixture(context,browser);
 try {
  await f.db.from('pro_clients').update({name:'CURRENT_CLIENT_A_CHANGED',email:'current-a@example.test',phone:'CURRENT_PHONE_A',archived:true}).eq('user_id',f.owner.id).eq('id',f.clientId).throwOnError();
  await f.db.from('pro_products').update({name:'CURRENT_CATALOG_SERVICE',archived:true}).eq('user_id',f.owner.id).eq('id',f.productId).throwOnError();
  const before=await copyBusiness(f),documents=await estimateRows(f),input=copyInput(f);
  const responses=await Promise.all([post(context,f.owner,input,copyEndpoint),post(context,f.owner,input,copyEndpoint)]);expect(responses.map(response=>response.status())).toEqual([200,200]);
  const result=await responses[0].json();expect(await responses[1].json()).toEqual(result);
  expect(result.publication).toEqual({publicationId:f.publication.publicationId,estimateId:f.estimateA.id,version:1,estimateRevision:1,contentHash:f.publication.contentHash});
  assertHistoricalCopy(f,result.estimate,input.targetEstimateId);
  expect(result.estimate.client).toMatchObject({id:f.clientId,email:'historical-a@example.test',phone:'PRIVATE_PHONE_A'});expect(result.estimate.issuer.issuerActivity).toBe('432100');expect(result.estimate.lines[0].catalogProductId).toBe(f.productId);
  expect(await copiedReceipt(context,input.actionId)).toEqual({receipt:{input,result}});
  expect((await json(context,{view:'detail',estimateId:input.targetEstimateId})).estimate).toEqual(result.estimate);
  await assertOneNewDocument(f,documents,input.targetEstimateId,result.estimate);expect(await copyBusiness(f)).toEqual(before);
  expect(await(await post(context,f.owner,input,copyEndpoint)).json()).toEqual(result);
  const rows=await estimateRows(f);
  expect((await post(context,f.owner,{...input,targetEstimateId:crypto.randomUUID()},copyEndpoint)).status()).toBe(409);expect(await estimateRows(f)).toEqual(rows);
 } finally {await cleanupPublicationCopy(f);}
});

test('Publication copy API: archived manual and job origins retain their historical snapshots without touching their current state',async({context,browser,baseURL})=>{
 test.setTimeout(240000);local(baseURL);
 for(const source of ['manual','work'] as const){
  const f=await publicationCopyFixture(context,browser,{status:'shared',source});
  try {
   if(source==='manual')expect((await post(context,f.owner,{action:'archive',actionId:crypto.randomUUID(),kind:'manual',id:f.sourceId,revision:1},'/api/pro/lead-private-core')).status()).toBe(200);
   else await f.db.from('pro_work').update({cancelled:true,stage:'completed',service:'CURRENT_CANCELLED_SOURCE'}).eq('user_id',f.owner.id).eq('id',f.sourceId!).throwOnError();
   await f.db.from('pro_clients').update({archived:true}).eq('user_id',f.owner.id).eq('id',f.clientId).throwOnError();
   const before=await copyBusiness(f),documents=await estimateRows(f),input=copyInput(f),response=await post(context,f.owner,input,copyEndpoint);expect(response.status()).toBe(200);const result=await response.json();
   assertHistoricalCopy(f,result.estimate,input.targetEstimateId);expect(result.estimate.source).toEqual(f.estimateA.source);await assertOneNewDocument(f,documents,input.targetEstimateId,result.estimate);expect(await copyBusiness(f)).toEqual(before);
  } finally {await cleanupPublicationCopy(f);}
 }
});

function nativeDatabase(){const executable=process.env.PRO_LOCAL_PSQL;if(!executable||!process.env.PGPASSWORD)throw Error('The root runner must supply the isolated native PostgreSQL gate.');expect(process.env.PGHOST).toMatch(/^(localhost|127\.0\.0\.1)$/);expect(process.env.PGPORT).toBe('54322');expect(process.env.PGDATABASE).toBe('postgres');return executable;}
async function holdOwner(ownerId:string){
 expect(ownerId).toMatch(/^[a-f0-9-]{36}$/);const executable=nativeDatabase(),child=spawn(executable,['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:process.env,stdio:['pipe','pipe','pipe']});
 let output='',readySettled=false,released=false,resolveReady:(pid:number)=>void=()=>{},rejectReady:(error:Error)=>void=()=>{};
 const ready=new Promise<number>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;}),timer=setTimeout(()=>{if(!readySettled){readySettled=true;rejectReady(Error('Local owner gate did not become ready.'));}},10000);
 const done=new Promise<number>(resolve=>child.on('close',code=>{clearTimeout(timer);if(!readySettled){readySettled=true;rejectReady(Error('Local owner gate exited before locking.'));}resolve(code??255);}));
 child.on('error',()=>{if(!readySettled){readySettled=true;rejectReady(Error('Could not start local PostgreSQL.'));}});child.stderr.on('data',()=>{});
 child.stdout.on('data',chunk=>{output+=String(chunk);if(!readySettled&&output.includes('LOCAL_COPY_GATE_READY')){readySettled=true;clearTimeout(timer);const lines=output.trim().split(/\r?\n/),pid=Number(lines[0]);if(!Number.isSafeInteger(pid)||pid<=0||lines[1]!=='1')rejectReady(Error('Local owner gate locked the wrong scope.'));else resolveReady(pid);}});
 const release=()=>{if(released)return;released=true;if(child.stdin.writable)child.stdin.end('COMMIT;\n\\q\n');};
 child.stdin.write(`BEGIN;\nSELECT pg_backend_pid();\nSELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended('${ownerId}',0))) locked;\nSELECT 'LOCAL_COPY_GATE_READY';\n`);
 try{return{pid:await ready,release,done,executable};}catch(error){release();child.kill('SIGTERM');await done;throw error;}
}

test('Publication copy API: owner entitlement is rechecked after an observed advisory wait before any C rows or receipts commit',async({context,browser,baseURL})=>{
 test.setTimeout(120000);local(baseURL);const f=await publicationCopyFixture(context,browser);let gate:Awaited<ReturnType<typeof holdOwner>>|undefined,pending:ReturnType<typeof post>|undefined;
 try {
  const before=await copyBusiness(f),documents=await estimateRows(f),input=copyInput(f);gate=await holdOwner(f.owner.id);pending=post(context,f.owner,input,copyEndpoint);
  const run=promisify(execFile);
  await expect.poll(async()=>{const result=await run(gate!.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND query LIKE '%pro_private_estimate_publication_copy_mutate%' AND ${gate!.pid}=ANY(pg_blocking_pids(pid));`],{env:process.env});return Number(result.stdout.trim());}).toBe(1);
  await run(gate.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`UPDATE public.pro_memberships SET expires_at=clock_timestamp()-interval '1 millisecond' WHERE user_id='${f.owner.id}'::uuid;`],{env:process.env});
  gate.release();expect(await gate.done).toBe(0);expect((await pending).status()).toBe(403);expect(await estimateRows(f)).toEqual(documents);expect(await copyBusiness(f)).toEqual(before);
  expect((await f.db.from('pro_private_estimate_publication_copies').select('*').eq('actor_id',f.owner.id).throwOnError()).data).toEqual([]);
  await f.db.from('pro_memberships').update({expires_at:null}).eq('user_id',f.owner.id).throwOnError();expect(await copiedReceipt(context,input.actionId)).toEqual({receipt:null});
  const retry=await post(context,f.owner,input,copyEndpoint);expect(retry.status()).toBe(200);const result=await retry.json();assertHistoricalCopy(f,result.estimate,input.targetEstimateId);expect(await copiedReceipt(context,input.actionId)).toEqual({receipt:{input,result}});
 } finally {gate?.release();if(pending)await pending.catch(()=>{});await cleanupPublicationCopy(f);}
});

test('Publication copy API: stale immutable identities, old action/history IDs and occupied targets never adopt or partially overwrite C',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await publicationCopyFixture(context,browser);
 try {
  const historyOnly=crypto.randomUUID();
  await f.db.from('pro_private_estimate_history').insert({owner_id:f.owner.id,estimate_id:f.estimateB.id,action_id:historyOnly,action:'save',before_estimate:f.estimateB,after_estimate:f.estimateB}).throwOnError();
  const before=await copyBusiness(f),documents=await estimateRows(f);
  const badInputs=[
   {...copyInput(f),actionId:f.inputA.actionId},
   {...copyInput(f),actionId:historyOnly},
   {...copyInput(f),targetEstimateId:f.estimateB.id},
   {...copyInput(f),version:f.publication.version+1},
   {...copyInput(f),estimateRevision:f.publication.estimateRevision+1},
   {...copyInput(f),contentHash:'f'.repeat(64)}
  ];
  for(const input of badInputs){
   expect((await post(context,f.owner,input,copyEndpoint)).status()).toBe(409);
   expect(await copiedReceipt(context,input.actionId)).toEqual({receipt:null});expect(await estimateRows(f)).toEqual(documents);expect(await copyBusiness(f)).toEqual(before);
  }
  expect((await f.db.from('pro_private_estimate_publication_copies').select('*').eq('actor_id',f.owner.id).throwOnError()).data).toEqual([]);
  const input=copyInput(f),response=await post(context,f.owner,input,copyEndpoint);expect(response.status()).toBe(200);const result=await response.json();assertHistoricalCopy(f,result.estimate,input.targetEstimateId);
  const copiedRows=await estimateRows(f);
  expect((await post(context,f.owner,{...input,actionId:crypto.randomUUID()},copyEndpoint)).status()).toBe(409);expect(await estimateRows(f)).toEqual(copiedRows);
  expect((await post(context,f.owner,{...input,contentHash:'e'.repeat(64)},copyEndpoint)).status()).toBe(409);expect(await estimateRows(f)).toEqual(copiedRows);
  expect((await f.db.from('pro_private_estimate_publication_copies').update({result:{...result,estimate:{...result.estimate,title:'FORGED'}}}).eq('actor_id',f.owner.id).eq('action_id',input.actionId)).error?.code).toBe('23514');
  expect(await copiedReceipt(context,input.actionId)).toEqual({receipt:{input,result}});
 } finally {await cleanupPublicationCopy(f);}
});

test('Publication copy API: only the active Pro owner can read proofs or copy private historical snapshots',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await publicationCopyFixture(context,browser),free=await createDisposableAccount({prefix:'publication-copy-free'});
 const freeContext=await browser.newContext({baseURL}),foreignContext=await browser.newContext({baseURL}),anonymous=await browser.newContext({baseURL});let foreign:PublicationCopyFixture|undefined;
 try {
  await login(freeContext,free);foreign=await publicationCopyFixture(foreignContext,browser,{status:'shared'});
  const input=copyInput(f),response=await post(context,f.owner,input,copyEndpoint);expect(response.status()).toBe(200);const result=await response.json(),before=await copyBusiness(f),documents=await estimateRows(f);
  expect((await copyRead(anonymous,input.actionId)).status()).toBe(401);
  for(const [actorContext,actor]of [[freeContext,free],[f.recipientContext,f.recipient]] as const){expect((await post(actorContext,actor,copyInput(f),copyEndpoint)).status()).toBe(403);expect((await copyRead(actorContext,input.actionId)).status()).toBe(403);}
  expect((await post(foreignContext,foreign.owner,copyInput(f),copyEndpoint)).status()).toBe(403);expect(await copiedReceipt(foreignContext,input.actionId)).toEqual({receipt:null});
  expect((await context.request.post(copyEndpoint,{headers:{Origin:'http://127.0.0.1:3185','X-Pro-Expected-Actor':f.recipient.id},data:input})).status()).toBe(403);
  for(const denied of [{table:'profiles',field:'id',values:{is_disabled:true},restore:{is_disabled:false}},{table:'pro_memberships',field:'user_id',values:{status:'inactive'},restore:{status:'active'}}]){
   await f.db.from(denied.table).update(denied.values).eq(denied.field,f.owner.id).throwOnError();expect((await copyRead(context,input.actionId)).status()).toBe(403);expect((await post(context,f.owner,input,copyEndpoint)).status()).toBe(403);await f.db.from(denied.table).update(denied.restore).eq(denied.field,f.owner.id).throwOnError();
  }
  await f.db.from('professionals').insert({profile_id:f.owner.id,category_id:'desarrollo_web',business_name:'Ficha bloqueada local',slug:'publication-copy-ban-'+f.owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:true}).throwOnError();expect((await copyRead(context,input.actionId)).status()).toBe(403);await f.db.from('professionals').delete().eq('profile_id',f.owner.id).throwOnError();
  for(const token of [null,f.token]){
   const direct=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:'Bearer '+token}}}:{})});
   expect((await direct.from('pro_private_estimate_publication_copies').select('*')).error?.code).toBe('42501');
   expect((await direct.rpc('pro_private_estimate_publication_copy_mutate',{p_actor:f.owner.id,p_input:input})).error?.code).toBe('42501');
   expect((await direct.rpc('pro_private_estimate_publication_copy_read',{p_actor:f.owner.id,p_action:input.actionId})).error?.code).toBe('42501');
  }
  expect(await copiedReceipt(context,input.actionId)).toEqual({receipt:{input,result}});expect(await(await post(context,f.owner,input,copyEndpoint)).json()).toEqual(result);
  expect(await estimateRows(f)).toEqual(documents);expect(await copyBusiness(f)).toEqual(before);
 } finally {await freeContext.close();await foreignContext.close();await anonymous.close();if(foreign)await cleanupPublicationCopy(foreign);await cleanupDisposableAccount(free);await cleanupPublicationCopy(f);}
});
