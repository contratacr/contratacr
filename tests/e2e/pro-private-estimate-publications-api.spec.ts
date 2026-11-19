import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {test,expect,type BrowserContext} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {fixture,cleanup,local,login,post,json,snapshot,state,oldDocuments,estimateInput,estimateRows,type Fixture} from './pro-private-estimate-publications-fixture';
import {canonicalPrivateEstimatePublicationInput} from '../../src/lib/pro/private-estimate-publications';
const endpoint='/api/pro/private-estimate-publications';
const freshCode=()=>randomBytes(32).toString('hex');
const inputHash=(input:unknown)=>createHash('sha256').update(canonicalPrivateEstimatePublicationInput(input)).digest('hex');
async function mutate(context:BrowserContext,actor:DisposableAccount,input:unknown){return post(context,actor,input,endpoint);}
async function read(context:BrowserContext,query:Record<string,string>){return context.request.get(endpoint+'?'+new URLSearchParams(query));}
async function checked(context:BrowserContext,query:Record<string,string>){const response=await read(context,query);expect(response.status()).toBe(200);return response.json();}
async function savedEstimate(context:BrowserContext,f:Fixture){
 const ctx=await json(context,{view:'context',clientId:f.clientId});
 const command=estimateInput(ctx,{validUntil:'2030-12-31'}),response=await post(context,f.owner,command);
 expect(response.status()).toBe(200);
 return {command,estimate:(await response.json()).estimate};
}
function decision(action:string,publication:{publicationId:string;revision:number;contentHash:string},note?:string){return{action,actionId:crypto.randomUUID(),publicationId:publication.publicationId,revision:publication.revision,contentHash:publication.contentHash,...(note?{note}:{})};}
function noPrivateReferences(value:unknown){
 const visit=(item:unknown)=>{
  if(!item||typeof item!=='object')return;
  if(Array.isArray(item)){item.forEach(visit);return;}
  for(const [key,child] of Object.entries(item)){
   expect(['ownerId','clientId','clientFingerprint','source','catalogProductId','actorId','requestId','phone','email']).not.toContain(key);
   visit(child);
  }
 };
 visit(value);
}

test('Private quote publications API: verified claim is separate from decisions and immutable versions preserve private source data',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await fixture(context),client=await createDisposableAccount({prefix:'estimate-recipient'}),outsider=await createDisposableAccount({prefix:'estimate-outsider'});
 const clientContext=await browser.newContext({baseURL}),outsideContext=await browser.newContext({baseURL});
 try {
  await login(clientContext,client);await login(outsideContext,outsider);
  await f.db.from('pro_clients').update({email:client.email,phone:'PRIVATE_PHONE_NOT_PUBLISHED',notes:'PRIVATE_CONTACT_NOTE'}).eq('user_id',f.owner.id).eq('id',f.clientId).throwOnError();
  const {command,estimate}=await savedEstimate(context,f),before=await snapshot(f),privateBefore=await state(f),old=await oldDocuments(f),draftBefore=await estimateRows(f);
  const rawCode=freshCode(),publish={action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:estimate.id,estimateRevision:1,recipient:{kind:'claim',email:client.email,code:rawCode}};
  const response=await mutate(context,f.owner,publish);expect(response.status()).toBe(200);
  const published=await response.json();expect(published.publication).toMatchObject({publicationId:publish.publicationId,estimateId:estimate.id,version:1,estimateRevision:1,status:'awaiting_claim',recipientBound:false,revision:1});
  expect(JSON.stringify(published)).not.toContain(rawCode);
  expect(await checked(context,{view:'action',actionId:publish.actionId})).toEqual({receipt:{inputHash:inputHash(publish),result:published}});
  const claim={action:'claim',actionId:crypto.randomUUID(),code:rawCode};
  expect((await mutate(outsideContext,outsider,{...claim,actionId:crypto.randomUUID()})).status()).toBe(404);
  const claimedResponse=await mutate(clientContext,client,claim);expect(claimedResponse.status()).toBe(200);
  const claimed=await claimedResponse.json();expect(claimed.publication).toMatchObject({publicationId:publish.publicationId,estimateId:null,status:'shared',recipientBound:true,revision:2});
  const clientDetail=await checked(clientContext,{view:'detail',publicationId:publish.publicationId});
  expect(clientDetail).toMatchObject({side:'client',canRespond:true,recipient:null});
  noPrivateReferences(clientDetail);
  expect(JSON.stringify(clientDetail)).not.toContain(f.owner.id);expect(JSON.stringify(clientDetail)).not.toContain(f.clientId);
  expect(JSON.stringify(clientDetail)).not.toContain('PRIVATE_PHONE_NOT_PUBLISHED');
  expect(clientDetail.publication.content.totalCents).toBe(2472);
  const changes=decision('request_changes',claimed.publication,'Ajustar el alcance antes de aceptar');
  const changed=await mutate(clientContext,client,changes);expect(changed.status()).toBe(200);
  const requested=(await changed.json()).publication;expect(requested.status).toBe('changes_requested');
  const reply=await mutate(context,f.owner,decision('respond_changes',requested,'Alcance aclarado en esta versión'));expect(reply.status()).toBe(200);
  const replied=(await reply.json()).publication;expect(replied.status).toBe('changes_requested');
  const accept=decision('accept',replied),acceptedResponse=await mutate(clientContext,client,accept);expect(acceptedResponse.status()).toBe(200);
  const accepted=await acceptedResponse.json();expect(accepted.publication.status).toBe('accepted');
  expect(await (await mutate(clientContext,client,accept)).json()).toEqual(accepted);
  const history=await checked(clientContext,{view:'history',publicationId:publish.publicationId});
  expect(history.items.map((item:{action:string})=>item.action)).toEqual(expect.arrayContaining(['publish','claim','request_changes','respond_changes','accept']));
  noPrivateReferences(history);
  expect(await estimateRows(f)).toEqual(draftBefore);expect(await snapshot(f)).toEqual(before);expect(await state(f)).toEqual(privateBefore);expect(await oldDocuments(f)).toEqual(old);
  // The publication retains its exact saved content after private document edits.
  const edited={...command,actionId:crypto.randomUUID(),revision:1,title:'Private document revised after acceptance'};
  expect((await post(context,f.owner,edited)).status()).toBe(200);
  const stable=await checked(clientContext,{view:'detail',publicationId:publish.publicationId});
  expect(stable.publication).toEqual(accepted.publication);
  await f.db.from('pro_memberships').update({status:'inactive'}).eq('user_id',f.owner.id).throwOnError();
  expect((await read(clientContext,{view:'detail',publicationId:publish.publicationId})).status()).toBe(200);
  expect(await checked(clientContext,{view:'action',actionId:accept.actionId})).toEqual({receipt:{inputHash:inputHash(accept),result:accepted}});
  expect((await mutate(clientContext,client,decision('decline',accepted.publication))).status()).toBe(403);
 } finally {
  await clientContext.close();await outsideContext.close();await cleanupDisposableAccount(client);await cleanupDisposableAccount(outsider);await cleanup(f);
 }
});

function nativeDatabase(){const executable=process.env.PRO_LOCAL_PSQL;if(!executable||!process.env.PGPASSWORD)throw Error('Local PostgreSQL test gate credentials are required. Root must provide its isolated native psql environment.');expect(process.env.PGHOST).toMatch(/^(localhost|127\.0\.0\.1)$/);expect(process.env.PGPORT).toBe('54322');expect(process.env.PGDATABASE).toBe('postgres');return executable;}

async function lockPublication(ownerId:string,leadId:string,expectedRevision:number){
 const executable=nativeDatabase(),table='pro_private_estimate_publication_states';for(const value of [ownerId,leadId])expect(value).toMatch(/^[a-f0-9-]{36}$/);const processGate=spawn(executable,['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:process.env,stdio:['pipe','pipe','pipe']});let output='',settled=false,releaseCalled=false,resolveReady:(pid:number)=>void=()=>{},rejectReady:(error:Error)=>void=()=>{};const ready=new Promise<number>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;}),timer=setTimeout(()=>{if(!settled){settled=true;rejectReady(Error('Local file-head gate timed out.'));}},10000),done=new Promise<number>(resolve=>{processGate.on('close',code=>{clearTimeout(timer);if(!settled){settled=true;rejectReady(Error('Local database gate ended before obtaining its file-head lock.'));}resolve(code??255);});});processGate.on('error',()=>{clearTimeout(timer);if(!settled){settled=true;rejectReady(Error('Could not start the isolated PostgreSQL gate.'));}});processGate.stderr.on('data',()=>{});processGate.stdout.on('data',chunk=>{output+=String(chunk);if(!settled&&output.includes('LOCAL_GATE_READY')){clearTimeout(timer);const lines=output.trim().split(/\r?\n/);settled=true;const pid=Number(lines[0]);if(!Number.isSafeInteger(pid)||pid<=0||Number(lines[1])!==expectedRevision)rejectReady(Error('The isolated file-head gate did not lock the expected revision.'));else resolveReady(pid);}});const release=()=>{if(releaseCalled)return;releaseCalled=true;if(processGate.stdin.writable)processGate.stdin.end('COMMIT;\n\\q\n');};processGate.stdin.write(`BEGIN;\nSELECT pg_backend_pid();\nSELECT revision FROM public.${table} WHERE publication_id='${leadId}'::uuid FOR UPDATE;\nSELECT 'LOCAL_GATE_READY';\n`);try{return{pid:await ready,done,release,executable};}catch(error){release();processGate.kill('SIGTERM');await done;throw error;}
}




async function lockClaimAction(ownerId:string,leadId:string){
 const executable=nativeDatabase();for(const value of [ownerId,leadId])expect(value).toMatch(/^[a-f0-9-]{36}$/);const processGate=spawn(executable,['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:process.env,stdio:['pipe','pipe','pipe']});let output='',settled=false,releaseCalled=false,resolveReady:(pid:number)=>void=()=>{},rejectReady:(error:Error)=>void=()=>{};const ready=new Promise<number>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;}),timer=setTimeout(()=>{if(!settled){settled=true;rejectReady(Error('Local file-head gate timed out.'));}},10000),done=new Promise<number>(resolve=>{processGate.on('close',code=>{clearTimeout(timer);if(!settled){settled=true;rejectReady(Error('Local database gate ended before obtaining its file-head lock.'));}resolve(code??255);});});processGate.on('error',()=>{clearTimeout(timer);if(!settled){settled=true;rejectReady(Error('Could not start the isolated PostgreSQL gate.'));}});processGate.stderr.on('data',()=>{});processGate.stdout.on('data',chunk=>{output+=String(chunk);if(!settled&&output.includes('LOCAL_GATE_READY')){clearTimeout(timer);const lines=output.trim().split(/\r?\n/);settled=true;const pid=Number(lines[0]);if(!Number.isSafeInteger(pid)||pid<=0||lines[1]!=='1')rejectReady(Error('The isolated file-head gate did not lock the expected revision.'));else resolveReady(pid);}});const release=()=>{if(releaseCalled)return;releaseCalled=true;if(processGate.stdin.writable)processGate.stdin.end('COMMIT;\n\\q\n');};processGate.stdin.write(`BEGIN;\nSELECT pg_backend_pid();\nSELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended('pro-private-estimate-publication-action:${ownerId}:${leadId}',0))) locked;\nSELECT 'LOCAL_GATE_READY';\n`);try{return{pid:await ready,done,release,executable};}catch(error){release();processGate.kill('SIGTERM');await done;throw error;}
}




test('Private quote publications API: code rotation invalidates prior secrets and post-lock expiry rolls back a client decision',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await fixture(context),client=await createDisposableAccount({prefix:'estimate-publication-gate'});
 const clientContext=await browser.newContext({baseURL});
 let gate:Awaited<ReturnType<typeof lockPublication>>|undefined,pending:ReturnType<typeof mutate>|undefined;
 try {
  await login(clientContext,client);
  const {estimate}=await savedEstimate(context,f),before=await snapshot(f),old=await oldDocuments(f);
  const code=freshCode(),publish={action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:estimate.id,estimateRevision:1,recipient:{kind:'claim',email:client.email,code}};
  const created=await mutate(context,f.owner,publish);expect(created.status()).toBe(200);const first=(await created.json()).publication;
  const rotatedCode=freshCode(),rotate={...decision('rotate_code',first),code:rotatedCode};
  const staleClaim={action:'claim',actionId:crypto.randomUUID(),code};
  gate=await lockClaimAction(client.id,staleClaim.actionId);
  pending=mutate(clientContext,client,staleClaim);
  const native=promisify(execFile);
  await expect.poll(async()=>{
   const result=await native(gate!.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND query LIKE '%pro_private_estimate_publication_mutate%' AND ${gate!.pid}=ANY(pg_blocking_pids(pid));`],{env:process.env});
   return Number(result.stdout.trim());
  }).toBe(1);
  const rotated=await mutate(context,f.owner,rotate);expect(rotated.status()).toBe(200);
  gate.release();expect(await gate.done).toBe(0);expect((await pending).status()).toBe(404);
  expect(await checked(clientContext,{view:'action',actionId:staleClaim.actionId})).toEqual({receipt:null});
  expect((await f.db.from('pro_private_estimate_publication_recipients').select('*').eq('owner_id',f.owner.id).eq('estimate_id',estimate.id).throwOnError()).data).toEqual([]);
  expect((await mutate(clientContext,client,{action:'claim',actionId:crypto.randomUUID(),code})).status()).toBe(404);
  const claim=await mutate(clientContext,client,{action:'claim',actionId:crypto.randomUUID(),code:rotatedCode});expect(claim.status()).toBe(200);const shared=(await claim.json()).publication;
  const command=decision('accept',shared);
  const states=(await f.db.from('pro_private_estimate_publication_states').select('*').eq('publication_id',publish.publicationId).single().throwOnError()).data;
  const events=(await f.db.from('pro_private_estimate_publication_events').select('*').eq('publication_id',publish.publicationId).order('revision').throwOnError()).data;
  gate=await lockPublication(f.owner.id,publish.publicationId,shared.revision);
  pending=mutate(clientContext,client,command);
  const run=promisify(execFile);
  await expect.poll(async()=>{
   const result=await run(gate!.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND query LIKE '%pro_private_estimate_publication_mutate%' AND ${gate!.pid}=ANY(pg_blocking_pids(pid));`],{env:process.env});
   return Number(result.stdout.trim());
  }).toBe(1);
  await run(gate.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`UPDATE public.pro_memberships SET expires_at=clock_timestamp()-interval '1 millisecond' WHERE user_id='${f.owner.id}'::uuid;`],{env:process.env});
  gate.release();expect(await gate.done).toBe(0);expect((await pending).status()).toBe(403);
  expect((await f.db.from('pro_private_estimate_publication_states').select('*').eq('publication_id',publish.publicationId).single().throwOnError()).data).toEqual(states);
  expect((await f.db.from('pro_private_estimate_publication_events').select('*').eq('publication_id',publish.publicationId).order('revision').throwOnError()).data).toEqual(events);
  expect(await checked(clientContext,{view:'action',actionId:command.actionId})).toEqual({receipt:null});
  await f.db.from('pro_memberships').update({expires_at:null}).eq('user_id',f.owner.id).throwOnError();
  const retry=await mutate(clientContext,client,command);expect(retry.status()).toBe(200);expect((await retry.json()).publication.status).toBe('accepted');
  for(const table of ['pro_private_estimate_publications','pro_private_estimate_publication_invites','pro_private_estimate_publication_actions']) {
   const rows=await f.db.from(table).select('*').eq(table.endsWith('_actions')?'actor_id':table.endsWith('_invites')?'publication_id':'owner_id',table.endsWith('_actions')?f.owner.id:table.endsWith('_invites')?publish.publicationId:f.owner.id).throwOnError();
   expect(JSON.stringify(rows.data)).not.toContain(code);expect(JSON.stringify(rows.data)).not.toContain(rotatedCode);
  }
  expect(await snapshot(f)).toEqual(before);expect(await oldDocuments(f)).toEqual(old);
 } finally {
  gate?.release();if(pending)await pending.catch(()=>{});
  await clientContext.close();await cleanupDisposableAccount(client);await cleanup(f);
 }
});

test('Private quote publications API: a new version and acceptance cannot both win and current ACL protects historical proofs',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await fixture(context),client=await createDisposableAccount({prefix:'estimate-publication-race'}),free=await createDisposableAccount({prefix:'estimate-publication-free'});
 const clientContext=await browser.newContext({baseURL}),freeContext=await browser.newContext({baseURL}),foreignContext=await browser.newContext({baseURL}),anonymous=await browser.newContext({baseURL});
 let foreign:Fixture|undefined;
 try {
  await login(clientContext,client);await login(freeContext,free);foreign=await fixture(foreignContext);
  const {command,estimate}=await savedEstimate(context,f),code=freshCode();
  const publish={action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:estimate.id,estimateRevision:1,recipient:{kind:'claim',email:client.email,code}};
  expect((await mutate(context,f.owner,publish)).status()).toBe(200);
  const claim=await mutate(clientContext,client,{action:'claim',actionId:crypto.randomUUID(),code});expect(claim.status()).toBe(200);const shared=(await claim.json()).publication;
  const revisionTwo={...command,actionId:crypto.randomUUID(),revision:1,title:'Nueva versión con alcance revisado'};
  expect((await post(context,f.owner,revisionTwo)).status()).toBe(200);
  const baseline=await snapshot(f),old=await oldDocuments(f);
  const next={action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:estimate.id,estimateRevision:2,recipient:{kind:'existing',recipientId:client.id}};
  const acceptance=decision('accept',shared);
  const responses=await Promise.all([mutate(context,f.owner,next),mutate(clientContext,client,acceptance)]);
  expect(responses.map(response=>response.status()).toSorted()).toEqual([200,409]);
  const first=await checked(clientContext,{view:'detail',publicationId:shared.publicationId});
  if(responses[0].status()===200) {
   expect(first.publication.status).toBe('superseded');
   const latest=await checked(clientContext,{view:'detail',publicationId:next.publicationId});
   expect(latest.publication).toMatchObject({version:2,estimateId:null,status:'shared',content:{title:revisionTwo.title}});
   expect(latest.publication.contentHash).not.toBe(shared.contentHash);
   expect((await mutate(context,f.owner,decision('withdraw',latest.publication))).status()).toBe(200);
  } else {
   expect(first.publication.status).toBe('accepted');
   expect((await read(clientContext,{view:'detail',publicationId:next.publicationId})).status()).toBe(404);
  }
  for(const [actorContext,status]of [[anonymous,401],[freeContext,403]] as const)expect((await read(actorContext,{view:'context',estimateId:estimate.id})).status()).toBe(status);
  expect((await read(foreignContext,{view:'detail',publicationId:shared.publicationId})).status()).toBe(403);
  expect((await read(freeContext,{view:'detail',publicationId:shared.publicationId})).status()).toBe(403);
  expect((await read(clientContext,{view:'list',side:'client',estimateId:estimate.id})).status()).toBe(400);
  await f.db.from('profiles').update({is_disabled:true}).eq('id',client.id).throwOnError();
  expect((await read(clientContext,{view:'detail',publicationId:shared.publicationId})).status()).toBe(403);
  await f.db.from('profiles').update({is_disabled:false}).eq('id',client.id).throwOnError();
  await f.db.from('profiles').update({is_disabled:true}).eq('id',f.owner.id).throwOnError();
  expect((await read(context,{view:'action',actionId:publish.actionId})).status()).toBe(403);
  await f.db.from('profiles').update({is_disabled:false}).eq('id',f.owner.id).throwOnError();
  await f.db.from('professionals').insert({profile_id:f.owner.id,category_id:'desarrollo_web',business_name:'Ficha bloqueada para ACL',slug:'publication-banned-'+f.owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:true}).throwOnError();
  expect((await read(context,{view:'action',actionId:publish.actionId})).status()).toBe(403);
  expect((await mutate(clientContext,client,decision('decline',first.publication))).status()).toBe(403);
  await f.db.from('professionals').delete().eq('profile_id',f.owner.id).throwOnError();
  for(const token of [null,f.token]) {
   const direct=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:'Bearer '+token}}}:{})});
   for(const table of ['pro_private_estimate_publications','pro_private_estimate_publication_states','pro_private_estimate_publication_invites','pro_private_estimate_publication_recipients','pro_private_estimate_publication_events','pro_private_estimate_publication_actions'])expect((await direct.from(table).select('*').limit(1)).error?.code).toBe('42501');
   for(const [name,args] of [
    ['pro_private_estimate_publication_context',{p_actor:f.owner.id,p_estimate:estimate.id}],
    ['pro_private_estimate_publication_read',{p_actor:f.owner.id,p_publication:shared.publicationId}],
    ['pro_private_estimate_publication_action_read',{p_actor:f.owner.id,p_action:publish.actionId}],
    ['pro_private_estimate_publication_mutate',{p_actor:f.owner.id,p_input:publish,p_input_hash:inputHash(publish),p_verified_email:f.owner.email}]
   ] as const)expect((await direct.rpc(name,args)).error?.code).toBe('42501');
  }
  expect(await snapshot(f)).toEqual(baseline);expect(await oldDocuments(f)).toEqual(old);
 } finally {
  await clientContext.close();await freeContext.close();await foreignContext.close();await anonymous.close();
  if(foreign)await cleanup(foreign);await cleanupDisposableAccount(client);await cleanupDisposableAccount(free);await cleanup(f);
 }
});

test('Private quote publications API: linked booking choices and compact version/history cursors stay scoped before limits',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await fixture(context),client=await createDisposableAccount({prefix:'estimate-linked-client'});
 const clientContext=await browser.newContext({baseURL});
 try {
  await login(clientContext,client);
  const professional=(await f.db.from('professionals').insert({profile_id:f.owner.id,category_id:'desarrollo_web',business_name:'Negocio local con cita',slug:'publication-linked-'+f.owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).select('id').single().throwOnError()).data!;
  await f.db.from('pro_work').update({bookingClientId:client.id,stage:'scheduled',start:'2030-01-01T09:00:00-06:00',end:'2030-01-01T10:00:00-06:00'}).eq('user_id',f.owner.id).eq('id',f.workId).throwOnError();
  const requestId=crypto.randomUUID();
  await f.db.from('pro_appointment_requests').insert({id:requestId,professional_id:professional.id,owner_id:f.owner.id,client_user_id:client.id,client_name:'Cliente vinculado real',professional_name:'Negocio local con cita',professional_slug:'publication-linked-'+f.owner.id,service:'Servicio confirmado',duration_minutes:60,location_kind:'agree',location_text:'',note:'PUBLIC_REQUEST_UNCHANGED',requested_start:'2030-01-01T09:00:00-06:00',status:'confirmed',revision:0,work_id:f.workId}).throwOnError();
  await f.db.from('pro_appointment_events').insert({request_id:requestId,actor_id:f.owner.id,side:'provider',action:'confirm',note:'',status:'confirmed'}).throwOnError();
  const {estimate}=await savedEstimate(context,f),before=await snapshot(f),old=await oldDocuments(f),draftRows=await estimateRows(f);
  expect(await checked(context,{view:'bindings',estimateId:estimate.id})).toEqual({items:[{requestId,recipientId:client.id,name:'Cliente vinculado real'}],nextCursor:null});
  const first={action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:estimate.id,estimateRevision:1,recipient:{kind:'linked',requestId,recipientId:client.id}};
  expect((await mutate(context,f.owner,{...first,actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),recipient:{...first.recipient,requestId:crypto.randomUUID()}})).status()).toBe(409);
  const published=await mutate(context,f.owner,first);expect(published.status()).toBe(200);
  expect((await published.json()).publication).toMatchObject({status:'shared',recipientBound:true});
  const ids=[first.publicationId];
  for(let index=0;index<20;index++) {
   const command={...first,actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),recipient:{kind:'existing',recipientId:client.id}};
   expect((await mutate(context,f.owner,command)).status()).toBe(200);ids.push(command.publicationId);
  }
  const page=await checked(clientContext,{view:'list',side:'client'});expect(page.items).toHaveLength(20);expect(page.nextCursor).not.toBeNull();
  const tail=await checked(clientContext,{view:'list',side:'client',after:page.nextCursor});expect(tail.items).toHaveLength(1);expect(tail.nextCursor).toBeNull();
  expect([...page.items,...tail.items].map((item:{publicationId:string})=>item.publicationId).toSorted()).toEqual(ids.toSorted());
  for(const item of [...page.items,...tail.items]){expect(item.estimateId).toBeNull();expect(item).not.toHaveProperty('content');}
  const latestId=ids.at(-1)!;let current=(await checked(clientContext,{view:'detail',publicationId:latestId})).publication;
  for(let index=0;index<10;index++) {
   const requested=await mutate(clientContext,client,decision('request_changes',current,'Aclaración '+index));expect(requested.status()).toBe(200);current=(await requested.json()).publication;
   const replied=await mutate(context,f.owner,decision('respond_changes',current,'Respuesta '+index));expect(replied.status()).toBe(200);current=(await replied.json()).publication;
  }
  const history=await checked(clientContext,{view:'history',publicationId:latestId});expect(history.items).toHaveLength(20);expect(history.nextCursor).not.toBeNull();
  const older=await checked(clientContext,{view:'history',publicationId:latestId,after:history.nextCursor});expect(older.items).toHaveLength(1);expect(older.nextCursor).toBeNull();
  expect(new Set([...history.items,...older.items].map((event:{actionId:string})=>event.actionId)).size).toBe(21);noPrivateReferences(history);
  expect(await estimateRows(f)).toEqual(draftRows);expect(await snapshot(f)).toEqual(before);expect(await oldDocuments(f)).toEqual(old);
 } finally {await clientContext.close();await cleanupDisposableAccount(client);await cleanup(f);}
});

test('Private quote publications API: a historical claim retains its saved customer while future sharing cannot adopt a changed private customer',async({context,browser,baseURL})=>{
 test.setTimeout(120000);local(baseURL);const f=await fixture(context),client=await createDisposableAccount({prefix:'estimate-original-customer'}),clientContext=await browser.newContext({baseURL});
 try {
  await login(clientContext,client);
  const {command,estimate}=await savedEstimate(context,f),code=freshCode(),publish={action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:estimate.id,estimateRevision:1,recipient:{kind:'claim',email:client.email,code}};
  expect((await mutate(context,f.owner,publish)).status()).toBe(200);
  const other=await json(context,{view:'context',clientId:f.secondClient});
  const changed={...command,actionId:crypto.randomUUID(),revision:1,clientId:f.secondClient,clientFingerprint:other.clientFingerprint,title:'Documento trasladado a otro cliente privado'};
  expect((await post(context,f.owner,changed)).status()).toBe(200);
  const before=await snapshot(f),old=await oldDocuments(f),drafts=await estimateRows(f);
  const claim=await mutate(clientContext,client,{action:'claim',actionId:crypto.randomUUID(),code});expect(claim.status()).toBe(200);
  const saved=(await claim.json()).publication;
  expect(saved.content.customer.name).toBe(estimate.client.name);expect(saved.content.title).toBe(estimate.title);
  const incompatible={...publish,actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateRevision:2,recipient:{kind:'existing',recipientId:client.id}};
  expect((await mutate(context,f.owner,incompatible)).status()).toBe(409);
  expect(await checked(context,{view:'action',actionId:incompatible.actionId})).toEqual({receipt:null});
  expect((await f.db.from('pro_private_estimate_publications').select('id').eq('owner_id',f.owner.id).throwOnError()).data).toEqual([{id:publish.publicationId}]);
  expect(await estimateRows(f)).toEqual(drafts);expect(await snapshot(f)).toEqual(before);expect(await oldDocuments(f)).toEqual(old);
 } finally {await clientContext.close();await cleanupDisposableAccount(client);await cleanup(f);}
});
