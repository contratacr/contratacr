import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {test,expect,type BrowserContext} from 'playwright/test';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
const origin='http://127.0.0.1:3185',api='/api/pro/work-tasks',core='/api/pro/lead-private-core',workApi='/api/pro/lead-private-work',team='/api/pro/team';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();expect(result.data.session).not.toBeNull();return result.data.session!.access_token;}
async function fixture(context:BrowserContext){const owner=await createDisposableAccount({prefix:'private-tools-owner'}),db=regressionAdminClient();try{const user=(await db.auth.admin.getUserById(owner.id)).data.user!;expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...user.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();const document=emptyBusiness(),clientId='private-origin-client',secondClient='private-origin-other',workId=crypto.randomUUID(),completedId=crypto.randomUUID(),today=crTodayISO();document.clients=[{id:clientId,name:'Cliente privado sin cuenta',email:'',phone:'',notes:'Conservar cliente',archived:false},{id:secondClient,name:'Cliente alternativo',email:'',phone:'',notes:'Conservar otro',archived:false}];document.work=[{id:workId,clientId,client:'Cliente privado sin cuenta',service:'Trabajo existente sin programar',stage:'new',start:'',end:'',cancelled:false},{id:completedId,clientId,client:'Cliente privado sin cuenta',service:'Trabajo concluido previo',stage:'completed',start:today+'T09:00:00-06:00',end:today+'T10:00:00-06:00',cancelled:false}];await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();const token=await login(context,owner);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(endpoint,{timeout:45000})).status()).toBe(200);for(const id of [workId,completedId])expect((await context.request.get('/api/pro/client-operations?'+new URLSearchParams({workId:id,clientId}),{timeout:45000})).status()).toBe(200);expect((await db.from('professionals').select('id').eq('profile_id',owner.id).throwOnError()).data).toEqual([]);return{owner,db,token,clientId,secondClient,workId,completedId};}catch(error){await cleanupDisposableAccount(owner);throw error;}}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function cleanup(f:Fixture){await cleanupDisposableAccount(f.owner);}
function input(f:Fixture,channel:{id:string;revision:number}|null=null){return{action:'create_lead',actionId:crypto.randomUUID(),channel,lead:{action:'create',actionId:crypto.randomUUID(),kind:'manual',id:crypto.randomUUID(),revision:0,catalogRevision:0,clientId:f.clientId,title:'Solicitud privada sin directorio',description:'Descripción privada conservada',address:'Ubicación por definir',sourceLabel:'Referencia manual anterior',forecast:{projectType:'Instalación',expectedStart:'2024-02-29',currency:'USD',revenueCents:125050,budgetCents:null,profitCents:-2575},stageMode:'automatic',stageId:null}};}
async function post(context:BrowserContext,actor:DisposableAccount,body:unknown,path=api){return context.request.post(path,{headers:{Origin:origin,'X-Pro-Expected-Actor':actor.id},data:body});}
async function read(context:BrowserContext,query:Record<string,string>,path=api){return context.request.get(path+'?'+new URLSearchParams(query));}
async function snapshot(f:Fixture){const result:Record<string,unknown>={};for(const table of ['pro_workspaces','pro_work','pro_clients','pro_quote_links','pro_client_entries','pro_work_cost_entries'])result[table]=(await f.db.from(table).select('*').eq('user_id',f.owner.id).throwOnError()).data;for(const table of ['pro_appointment_requests','pro_request_quotes','pro_request_followups'])result[table]=(await f.db.from(table).select('*').eq('owner_id',f.owner.id).throwOnError()).data;for(const table of ['notifications','notification_push_outbox'])result[table]=(await f.db.from(table).select('*').eq('user_id',f.owner.id).throwOnError()).data;result.directory=(await f.db.from('professionals').select('*').eq('profile_id',f.owner.id).throwOnError()).data;for(const key of Object.keys(result))if(Array.isArray(result[key]))result[key]=(result[key] as unknown[]).toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return result;}
async function state(f:Fixture){const result:Record<string,unknown>={};for(const table of ['pro_lead_center_records','pro_lead_center_actions','pro_lead_center_history','pro_lead_origin_assignments','pro_lead_origin_actions','pro_lead_origin_history','pro_lead_origin_creates','pro_request_pipeline_heads','pro_request_pipeline_stages'])result[table]=(await f.db.from(table).select('*').eq('owner_id',f.owner.id).throwOnError()).data?.toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return result;}
async function seed(context:BrowserContext,f:Fixture,id=crypto.randomUUID()){const body={...input(f).lead,id},response=await post(context,f.owner,body,core);expect(response.status()).toBe(200);return{body,result:await response.json()};}
function conversion(leadId:string,leadRevision=1,workId=crypto.randomUUID()){return{action:'convert',actionId:crypto.randomUUID(),leadId,leadRevision,workId};}
async function prepare(context:BrowserContext,f:Fixture){const lead=await seed(context,f),command=conversion(lead.body.id),response=await post(context,f.owner,command,workApi);expect(response.status()).toBe(200);const result=await response.json();return{lead,result,workId:result.link.workId as string};}
function taskInput(workId:string){return{action:'create',actionId:crypto.randomUUID(),workId,taskId:crypto.randomUUID(),revision:0,title:'Tarea privada%_literal',details:'Detalles privados conservados',dueDate:'2024-02-29',assignee:'Carlos manual'};}

async function teamRead(context: BrowserContext, query: Record<string, string>) {
 const response = await read(context, query, team);
 expect(response.status()).toBe(200);
 return response.json();
}

test('Private Team API: a real converted job admits a verified free member without creating a public issuer', async ({context,browser,baseURL}) => {
 test.setTimeout(180000);
 local(baseURL);
 const f = await fixture(context);
 const member = await createDisposableAccount({prefix:'private-team-member'});
 const memberContext = await browser.newContext({baseURL:origin});
 try {
  await login(memberContext,member);
  const job = await prepare(context,f);
  const before = await snapshot(f), privateBefore = await state(f);
  const task = taskInput(job.workId);
  expect((await post(context,f.owner,task)).status()).toBe(200);
  expect((await f.db.from('pro_memberships').select('*').eq('user_id',member.id).throwOnError()).data).toEqual([]);
  const code = crypto.randomUUID().replaceAll('-','') + crypto.randomUUID().replaceAll('-','');
  const invite = {action:'invite',actionId:crypto.randomUUID(),workId:job.workId,email:member.email,role:'viewer',code};
  const invited = await post(context,f.owner,invite,team);
  expect(invited.status()).toBe(200);
  expect(JSON.stringify(await invited.json())).not.toContain(code);
  const accept = {action:'accept',actionId:crypto.randomUUID(),code};
  const accepted = await post(memberContext,member,accept,team);
  expect(accepted.status()).toBe(200);
  let grant = (await accepted.json()).grant;
  expect(grant).toMatchObject({ownerId:f.owner.id,workId:job.workId,userId:member.id,role:'viewer',revision:1,active:true});
  const projected = await teamRead(memberContext,{view:'tasks',grantId:grant.id});
  expect(projected.items).toEqual([{id:task.taskId,title:task.title,dueDate:task.dueDate,status:'open',revision:1,assignment:null}]);
  expect(JSON.stringify(projected)).not.toContain(task.details);
  expect(JSON.stringify(projected)).not.toContain(task.assignee);
  const complete = {action:'complete',actionId:crypto.randomUUID(),grantId:grant.id,taskId:task.taskId,revision:1};
  expect((await post(memberContext,member,complete,team)).status()).toBe(403);
  const promoted = await post(context,f.owner,{action:'set_role',actionId:crypto.randomUUID(),workId:job.workId,grantId:grant.id,revision:1,role:'contributor'},team);
  expect(promoted.status()).toBe(200);
  grant = (await promoted.json()).grant;
  const assignTask = taskInput(job.workId);
  expect((await post(context,f.owner,assignTask)).status()).toBe(200);
  const assignment = {action:'assign',actionId:crypto.randomUUID(),workId:job.workId,taskId:assignTask.taskId,revision:1,assigneeGrantId:grant.id};
  const assigned = await post(context,f.owner,assignment,team);
  expect(assigned.status()).toBe(200);
  const assignmentResult = await assigned.json();
  expect(assignmentResult.task.assignment).toMatchObject({grantId:grant.id,active:true});
  expect(await (await post(context,f.owner,assignment,team)).json()).toEqual(assignmentResult);
  const targets = await read(memberContext,{view:'targets',grantId:grant.id,taskId:task.taskId},'/api/pro/team-task-mentions');
  expect(targets.status()).toBe(200);
  const ownerTarget = (await targets.json()).items.find((item:{userId:string})=>item.userId===f.owner.id);
  expect(ownerTarget).toMatchObject({grantId:null,sourceInviteId:null});
  const mentioned = {action:'comment',actionId:crypto.randomUUID(),grantId:grant.id,taskId:task.taskId,text:'Revisión interna para el dueño',mentions:[{userId:f.owner.id,grantId:null,sourceInviteId:null}]};
  const discussion = await post(memberContext,member,mentioned,'/api/pro/team-task-discussion');
  expect(discussion.status()).toBe(200);
  expect((await discussion.json()).comment.mentions).toEqual([{userId:f.owner.id,name:ownerTarget.name}]);
  const inbox = await read(context,{view:'inbox'},'/api/pro/team-task-mentions');
  expect(inbox.status()).toBe(200);
  expect((await inbox.json()).items).toEqual([expect.objectContaining({commentId:mentioned.actionId,actorId:member.id,workId:job.workId,taskId:task.taskId})]);
  const finished = await post(memberContext,member,complete,team);
  expect(finished.status()).toBe(200);
  const completed = await finished.json();
  expect(completed.task).toMatchObject({id:task.taskId,status:'done',revision:2});
  expect(await (await post(memberContext,member,complete,team)).json()).toEqual(completed);
  const comment = {action:'comment',actionId:crypto.randomUUID(),grantId:grant.id,text:'Comentario interno del miembro gratuito'};
  const commented = await post(memberContext,member,comment,team);
  expect(commented.status()).toBe(200);
  expect((await commented.json()).comment).toMatchObject({actorId:member.id,text:comment.text});
  const history = (await f.db.from('pro_work_task_history').select('*').eq('owner_id',f.owner.id).eq('action_id',complete.actionId).single().throwOnError()).data!;
  expect(history.before_task).toMatchObject({revision:1,details:task.details,assignee:task.assignee});
  expect(history.after_task).toMatchObject({revision:2,status:'done',details:task.details,assignee:task.assignee});
  expect((await post(context,f.owner,{action:'revoke',actionId:crypto.randomUUID(),workId:job.workId,grantId:grant.id,revision:grant.revision},team)).status()).toBe(200);
  expect((await read(memberContext,{view:'tasks',grantId:grant.id},team)).status()).toBe(403);
  expect((await read(memberContext,{view:'action',actionId:complete.actionId},team)).status()).toBe(403);
  expect((await post(memberContext,member,complete,team)).status()).toBe(403);
  expect((await teamRead(memberContext,{view:'shared'})).items).toEqual([]);
  const nextCode=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
  expect((await post(context,f.owner,{...invite,actionId:crypto.randomUUID(),role:'contributor',code:nextCode},team)).status()).toBe(200);
  expect((await post(memberContext,member,{action:'accept',actionId:crypto.randomUUID(),code:nextCode},team)).status()).toBe(200);
  expect((await read(memberContext,{view:'action',actionId:accept.actionId},team)).status()).toBe(403);
  expect((await read(memberContext,{actionId:mentioned.actionId,grantId:grant.id,taskId:task.taskId},'/api/pro/team-task-discussion')).status()).toBe(403);
  // Board receipts intentionally authorize the current contributor; they are
  // historical projections, unlike invite/discussion generation-bound proofs.
  expect((await read(memberContext,{view:'action',actionId:comment.actionId},team)).status()).toBe(200);

  expect(await snapshot(f)).toEqual(before);
  expect(await state(f)).toEqual(privateBefore);
  expect((await f.db.from('professionals').select('*').in('profile_id',[f.owner.id,member.id]).throwOnError()).data).toEqual([]);
 } finally {
  await memberContext.close();
  await cleanupDisposableAccount(member);
  await cleanup(f);
 }
});

function nativeDatabase(){const executable=process.env.PRO_LOCAL_PSQL;if(!executable||!process.env.PGPASSWORD)throw Error('Local PostgreSQL test gate credentials are required. Root must provide its isolated native psql environment.');expect(process.env.PGHOST).toMatch(/^(localhost|127\.0\.0\.1)$/);expect(process.env.PGPORT).toBe('54322');expect(process.env.PGDATABASE).toBe('postgres');return executable;}

async function lockGrant(ownerId:string,leadId:string){
 const executable=nativeDatabase(),table='pro_team_grants';for(const value of [ownerId,leadId])expect(value).toMatch(/^[a-f0-9-]{36}$/);const processGate=spawn(executable,['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:process.env,stdio:['pipe','pipe','pipe']});let output='',settled=false,releaseCalled=false,resolveReady:(pid:number)=>void=()=>{},rejectReady:(error:Error)=>void=()=>{};const ready=new Promise<number>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;}),timer=setTimeout(()=>{if(!settled){settled=true;rejectReady(Error('Local file-head gate timed out.'));}},10000),done=new Promise<number>(resolve=>{processGate.on('close',code=>{clearTimeout(timer);if(!settled){settled=true;rejectReady(Error('Local database gate ended before obtaining its file-head lock.'));}resolve(code??255);});});processGate.on('error',()=>{clearTimeout(timer);if(!settled){settled=true;rejectReady(Error('Could not start the isolated PostgreSQL gate.'));}});processGate.stderr.on('data',()=>{});processGate.stdout.on('data',chunk=>{output+=String(chunk);if(!settled&&output.includes('LOCAL_GATE_READY')){clearTimeout(timer);const lines=output.trim().split(/\r?\n/);settled=true;const pid=Number(lines[0]);if(!Number.isSafeInteger(pid)||pid<=0||lines[1]!=='1')rejectReady(Error('The isolated file-head gate did not lock the expected revision.'));else resolveReady(pid);}});const release=()=>{if(releaseCalled)return;releaseCalled=true;if(processGate.stdin.writable)processGate.stdin.end('COMMIT;\n\\q\n');};processGate.stdin.write(`BEGIN;\nSELECT pg_backend_pid();\nSELECT revision FROM public.${table} WHERE owner_id='${ownerId}'::uuid AND id='${leadId}'::uuid FOR UPDATE;\nSELECT 'LOCAL_GATE_READY';\n`);try{return{pid:await ready,done,release,executable};}catch(error){release();processGate.kill('SIGTERM');await done;throw error;}
}



test('Private Team API: a grant-row wait rechecks expiry after statement start and rolls back the owner action', async ({context,browser,baseURL}) => {
 test.setTimeout(120000);
 local(baseURL);
 const f = await fixture(context), member = await createDisposableAccount({prefix:'private-team-gate'});
 const memberContext = await browser.newContext({baseURL:origin});
 let gate: Awaited<ReturnType<typeof lockGrant>> | undefined;
 let pending: ReturnType<typeof post> | undefined;
 try {
  await login(memberContext,member);
  const job = await prepare(context,f);
  const code = crypto.randomUUID().replaceAll('-','') + crypto.randomUUID().replaceAll('-','');
  expect((await post(context,f.owner,{action:'invite',actionId:crypto.randomUUID(),workId:job.workId,email:member.email,role:'viewer',code},team)).status()).toBe(200);
  const accepted = await post(memberContext,member,{action:'accept',actionId:crypto.randomUUID(),code},team);
  expect(accepted.status()).toBe(200);
  const grant = (await accepted.json()).grant;
  const rows = async () => {
   const out: Record<string,unknown> = {};
   for (const table of ['pro_team_grants','pro_team_events','pro_team_actions']) {
    out[table] = (await f.db.from(table).select('*').eq(table==='pro_team_actions'?'actor_id':'owner_id',f.owner.id).throwOnError()).data?.toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   }
   return out;
  };
  const before = await rows(), business = await snapshot(f);
  const command = {action:'set_role',actionId:crypto.randomUUID(),workId:job.workId,grantId:grant.id,revision:1,role:'contributor'};
  gate = await lockGrant(f.owner.id,grant.id);
  pending = post(context,f.owner,command,team);
  const run = promisify(execFile);
  await expect.poll(async () => {
   const result = await run(gate!.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND query LIKE '%pro_team_mutate%' AND ${gate!.pid}=ANY(pg_blocking_pids(pid));`],{env:process.env});
   return Number(result.stdout.trim());
  }).toBe(1);
  await run(gate.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`UPDATE public.pro_memberships SET status='active',expires_at=clock_timestamp()-interval '1 millisecond' WHERE user_id='${f.owner.id}'::uuid;`],{env:process.env});
  gate.release();
  expect(await gate.done).toBe(0);
  expect((await pending).status()).toBe(403);
  expect(await rows()).toEqual(before);
  expect(await snapshot(f)).toEqual(business);
  await f.db.from('pro_memberships').update({expires_at:null}).eq('user_id',f.owner.id).throwOnError();
  expect((await post(context,f.owner,command,team)).status()).toBe(200);
  expect((await teamRead(context,{view:'owner',kind:'members',workId:job.workId})).items).toEqual([expect.objectContaining({id:grant.id,role:'contributor',revision:2})]);
 } finally {
  gate?.release();
  if(pending) await pending.catch(()=>{});
  await memberContext.close();
  await cleanupDisposableAccount(member);
  await cleanup(f);
 }
});

test('Private Team API: current owner entitlement and 20-row member projections remain private', async ({context,browser,baseURL}) => {
 test.setTimeout(180000);
 local(baseURL);
 const f=await fixture(context), member=await createDisposableAccount({prefix:'private-team-read'}), outsider=await createDisposableAccount({prefix:'private-team-outsider'});
 const memberContext=await browser.newContext({baseURL:origin}), outsiderContext=await browser.newContext({baseURL:origin}), anonymous=await browser.newContext({baseURL:origin});
 try {
  await login(memberContext,member);
  await login(outsiderContext,outsider);
  const job=await prepare(context,f), before=await snapshot(f);
  const code=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
  const command={action:'invite',actionId:crypto.randomUUID(),workId:job.workId,email:member.email,role:'viewer',code};
  expect((await post(context,f.owner,command,team)).status()).toBe(200);
  const acceptance=await post(memberContext,member,{action:'accept',actionId:crypto.randomUUID(),code},team);
  expect(acceptance.status()).toBe(200);
  const grant=(await acceptance.json()).grant;
  const ids=Array.from({length:21},()=>crypto.randomUUID());
  await f.db.from('pro_work_tasks').insert(ids.map((id,index)=>({owner_id:f.owner.id,work_id:job.workId,id,title:'PRIVATE_TEAM_PAGE_'+index,details:'PRIVATE_DETAILS_NOT_PROJECTED',assignee:'PRIVATE_MANUAL_REFERENCE',due_date:'2100-01-01',status:'open',archived:false,revision:1}))).throwOnError();
  const first=await teamRead(memberContext,{view:'tasks',grantId:grant.id});
  expect(first.items).toHaveLength(20);
  expect(first.nextCursor).not.toBeNull();
  const second=await teamRead(memberContext,{view:'tasks',grantId:grant.id,after:first.nextCursor});
  expect(second.items).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect([...first.items,...second.items].map((item:{id:string})=>item.id).toSorted()).toEqual(ids.toSorted());
  expect(JSON.stringify([first,second])).not.toContain('PRIVATE_DETAILS_NOT_PROJECTED');
  expect(JSON.stringify([first,second])).not.toContain('PRIVATE_MANUAL_REFERENCE');
  expect((await read(anonymous,{view:'owned'},team)).status()).toBe(401);
  expect((await read(outsiderContext,{view:'tasks',grantId:grant.id},team)).status()).toBe(403);
  expect((await read(memberContext,{view:'owned'},team)).status()).toBe(403);
  for(const denied of [{table:'profiles',values:{is_disabled:true},key:'id'},{table:'pro_memberships',values:{status:'inactive'},key:'user_id'}]) {
   await f.db.from(denied.table).update(denied.values).eq(denied.key,f.owner.id).throwOnError();
   expect((await read(context,{view:'owned'},team)).status()).toBe(403);
   expect((await post(context,f.owner,command,team)).status()).toBe(403);
   expect((await read(memberContext,{view:'tasks',grantId:grant.id},team)).status()).toBe(403);
   await f.db.from(denied.table).update(denied.table==='profiles'?{is_disabled:false}:{status:'active'}).eq(denied.key,f.owner.id).throwOnError();
  }
  await f.db.from('professionals').insert({profile_id:f.owner.id,category_id:'desarrollo_web',business_name:'Local banned issuer',slug:'private-team-ban-'+f.owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:true}).throwOnError();
  expect((await read(context,{view:'owned'},team)).status()).toBe(403);
  expect((await read(memberContext,{view:'tasks',grantId:grant.id},team)).status()).toBe(403);
  await f.db.from('professionals').delete().eq('profile_id',f.owner.id).throwOnError();
  for(const token of [null,f.token]) {
   const direct=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:'Bearer '+token}}}:{})});
   for(const [name,args] of [
    ['pro_team_owned_read',{p_actor:f.owner.id,p_after:null}],
    ['pro_team_owner_read',{p_actor:f.owner.id,p_work:job.workId,p_kind:'members',p_after:null}],
    ['pro_team_shared_read',{p_actor:f.owner.id,p_after:null}],
    ['pro_team_mutate',{p_actor:f.owner.id,p_input:command,p_verified_email:f.owner.email}],
    ['pro_team_assignment_action_read',{p_actor:f.owner.id,p_action:command.actionId}]
   ] as const) expect((await direct.rpc(name,args)).error?.code).toBe('42501');
  }
  expect(await snapshot(f)).toEqual(before);
 } finally {
  await memberContext.close();await outsiderContext.close();await anonymous.close();
  await cleanupDisposableAccount(member);await cleanupDisposableAccount(outsider);await cleanup(f);
 }
});
