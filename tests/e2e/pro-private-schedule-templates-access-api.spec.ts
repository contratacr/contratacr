import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
const origin='http://127.0.0.1:3185',api='/api/pro/work-tasks',core='/api/pro/lead-private-core',workApi='/api/pro/lead-private-work',templates='/api/pro/schedule-templates',planApi='/api/pro/work-schedule';
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


async function checked(context:BrowserContext,query:Record<string,string>,path=templates) {
 const response=await read(context,query,path);
 expect(response.status()).toBe(200);
 return response.json();
}
async function graph(context:BrowserContext,f:Fixture,workId:string) {
 const a=taskInput(workId),b={...taskInput(workId),title:'Preparación privada'};
 for(const task of [a,b]) expect((await post(context,f.owner,task)).status()).toBe(200);
 const phaseId=crypto.randomUUID(),milestoneId=crypto.randomUUID();
 const commands=[
  {action:'phase_save',actionId:crypto.randomUUID(),workId,revision:0,phaseId,title:'Fase privada',position:0},
  {action:'task_plan',actionId:crypto.randomUUID(),workId,revision:1,taskId:b.taskId,phaseId,plannedStart:'2024-02-28',plannedEnd:'2024-02-28',dependsOn:[]},
  {action:'task_plan',actionId:crypto.randomUUID(),workId,revision:2,taskId:a.taskId,phaseId,plannedStart:'2024-02-29',plannedEnd:'2024-03-01',dependsOn:[b.taskId]},
  {action:'milestone_save',actionId:crypto.randomUUID(),workId,revision:3,milestoneId,title:'Entrega privada',date:'2024-03-01',notes:'Nota privada del hito'}
 ];
 for(const command of commands) expect((await post(context,f.owner,command,planApi)).status()).toBe(200);
 return {a,b,phaseId,milestoneId};
}
async function workRows(f:Fixture,workId:string) {
 const result:Record<string,unknown>={};
 for(const table of ['pro_work_tasks','pro_work_task_history','pro_work_schedule_heads','pro_work_schedule_phases','pro_work_schedule_plans','pro_work_schedule_dependencies','pro_work_schedule_milestones']) {
  result[table]=(await f.db.from(table).select('*').eq('owner_id',f.owner.id).eq('work_id',workId).throwOnError()).data?.toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 }
 return result;
}
function applyInput(templateId:string,workId:string,workRevision=0) {
 return {action:'apply',actionId:crypto.randomUUID(),templateId,revision:1,workId,workRevision,startDate:'2025-02-28',phaseIds:[crypto.randomUUID()],phaseActionIds:[crypto.randomUUID()],taskIds:[crypto.randomUUID(),crypto.randomUUID()],taskActionIds:[crypto.randomUUID(),crypto.randomUUID()],planActionIds:[crypto.randomUUID(),crypto.randomUUID()],milestoneIds:[crypto.randomUUID()],milestoneActionIds:[crypto.randomUUID()]};
}

test('Private schedule templates API: no-directory capture, exact graph append and immutable historical receipts',async({context,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await fixture(context);
 try {
  const source=await prepare(context,f),target=await prepare(context,f),ids=await graph(context,f,source.workId);
  const existing=taskInput(target.workId);
  expect((await post(context,f.owner,existing)).status()).toBe(200);
  const before=await snapshot(f),privateBefore=await state(f),sourceBefore=await workRows(f,source.workId);
  const capture={action:'capture',actionId:crypto.randomUUID(),templateId:crypto.randomUUID(),revision:0,sourceWorkId:source.workId,sourceRevision:4,anchorDate:'2024-02-28',name:'Plan privado reutilizable',notes:'',selected:[{taskId:ids.b.taskId,revision:1},{taskId:ids.a.taskId,revision:1}],milestoneIds:[ids.milestoneId]};
  const response=await post(context,f.owner,capture,templates);
  expect(response.status()).toBe(200);
  const captured=await response.json();
  expect(captured.template).toMatchObject({revision:1,phaseCount:1,taskCount:2,milestoneCount:1});
  const definition=(await checked(context,{view:'detail',templateId:capture.templateId})).template;
  expect(definition.tasks.every((task:{details:string;assignee:string;dueOffset:null})=>task.details===''&&task.assignee===''&&task.dueOffset===null)).toBe(true);
  expect(definition.milestones[0]).toMatchObject({offset:2,notes:''});
  const preview=await checked(context,{view:'preview',templateId:capture.templateId,workId:target.workId,startDate:'2025-02-28'});
  expect(preview).toMatchObject({revision:0,existingCount:1,existingPhaseCount:0,existingMilestoneCount:0});
  expect(preview.tasks.find((task:{title:string})=>task.title===ids.a.title)).toMatchObject({plannedStart:'2025-03-01',plannedEnd:'2025-03-02',dueDate:null});
  expect(preview.milestones[0].date).toBe('2025-03-02');
  const command=applyInput(capture.templateId,target.workId),applied=await post(context,f.owner,command,templates);
  expect(applied.status()).toBe(200);
  const ack=await applied.json();
  expect(ack).toEqual({action:'apply',templateId:capture.templateId,templateRevision:1,workId:target.workId,revision:4,phaseIds:command.phaseIds,taskIds:command.taskIds,milestoneIds:command.milestoneIds});
  expect(await checked(context,{view:'action',actionId:command.actionId})).toEqual({receipt:{input:command,result:ack}});
  expect(await (await post(context,f.owner,command,templates)).json()).toEqual(ack);
  const saved=await workRows(f,target.workId);
  const tasks=saved.pro_work_tasks as {id:string;status:string;revision:number;details:string;assignee:string}[];
  expect(tasks.find(task=>task.id===existing.taskId)).toMatchObject({revision:1,title:existing.title,details:existing.details,assignee:existing.assignee});
  expect(tasks.filter(task=>command.taskIds.includes(task.id))).toEqual(expect.arrayContaining(command.taskIds.map(id=>expect.objectContaining({id,status:'open',revision:1,details:'',assignee:''}))));
  expect((await post(context,f.owner,{...applyInput(capture.templateId,target.workId),workRevision:0},templates)).status()).toBe(409);
  const edit={action:'save',actionId:crypto.randomUUID(),templateId:capture.templateId,revision:1,name:'Plan privado corregido',notes:'',phases:definition.phases,tasks:definition.tasks,milestones:definition.milestones};
  expect((await post(context,f.owner,edit,templates)).status()).toBe(200);
  for(const [action,revision] of [['archive',2],['restore',3]] as const) expect((await post(context,f.owner,{action,revision,actionId:crypto.randomUUID(),templateId:capture.templateId},templates)).status()).toBe(200);
  expect(await checked(context,{view:'action',actionId:capture.actionId})).toEqual({receipt:{input:capture,result:captured}});
  expect(await checked(context,{view:'action',actionId:command.actionId})).toEqual({receipt:{input:command,result:ack}});
  expect(await workRows(f,target.workId)).toEqual(saved);
  expect(await workRows(f,source.workId)).toEqual(sourceBefore);
  expect(await snapshot(f)).toEqual(before);expect(await state(f)).toEqual(privateBefore);
 } finally {await cleanup(f);}
});

function nativeDatabase(){const executable=process.env.PRO_LOCAL_PSQL;if(!executable||!process.env.PGPASSWORD)throw Error('Local PostgreSQL test gate credentials are required. Root must provide its isolated native psql environment.');expect(process.env.PGHOST).toMatch(/^(localhost|127\.0\.0\.1)$/);expect(process.env.PGPORT).toBe('54322');expect(process.env.PGDATABASE).toBe('postgres');return executable;}

async function lockAction(ownerId:string,leadId:string){
 const executable=nativeDatabase();for(const value of [ownerId,leadId])expect(value).toMatch(/^[a-f0-9-]{36}$/);const processGate=spawn(executable,['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:process.env,stdio:['pipe','pipe','pipe']});let output='',settled=false,releaseCalled=false,resolveReady:(pid:number)=>void=()=>{},rejectReady:(error:Error)=>void=()=>{};const ready=new Promise<number>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;}),timer=setTimeout(()=>{if(!settled){settled=true;rejectReady(Error('Local file-head gate timed out.'));}},10000),done=new Promise<number>(resolve=>{processGate.on('close',code=>{clearTimeout(timer);if(!settled){settled=true;rejectReady(Error('Local database gate ended before obtaining its file-head lock.'));}resolve(code??255);});});processGate.on('error',()=>{clearTimeout(timer);if(!settled){settled=true;rejectReady(Error('Could not start the isolated PostgreSQL gate.'));}});processGate.stderr.on('data',()=>{});processGate.stdout.on('data',chunk=>{output+=String(chunk);if(!settled&&output.includes('LOCAL_GATE_READY')){clearTimeout(timer);const lines=output.trim().split(/\r?\n/);settled=true;const pid=Number(lines[0]);if(!Number.isSafeInteger(pid)||pid<=0||lines[1]!=='1')rejectReady(Error('The isolated file-head gate did not lock the expected revision.'));else resolveReady(pid);}});const release=()=>{if(releaseCalled)return;releaseCalled=true;if(processGate.stdin.writable)processGate.stdin.end('COMMIT;\n\\q\n');};processGate.stdin.write(`BEGIN;\nSELECT pg_backend_pid();\nSELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended('pro-schedule-template-action:${ownerId}:${leadId}',0))) locked;\nSELECT 'LOCAL_GATE_READY';\n`);try{return{pid:await ready,done,release,executable};}catch(error){release();processGate.kill('SIGTERM');await done;throw error;}
}




test('Private schedule templates API: action wait rechecks current expiry and all private readers deny other actors',async({context,browser,baseURL})=>{
 test.setTimeout(120000);local(baseURL);const f=await fixture(context),free=await createDisposableAccount({prefix:'private-plan-template-free'});
 const freeContext=await browser.newContext({baseURL:origin}),foreignContext=await browser.newContext({baseURL:origin}),anonymous=await browser.newContext({baseURL:origin});
 let other:Fixture|undefined,gate:Awaited<ReturnType<typeof lockAction>>|undefined,pending:ReturnType<typeof post>|undefined;
 try {
  await login(freeContext,free);other=await fixture(foreignContext);
  const command={action:'save',actionId:crypto.randomUUID(),templateId:crypto.randomUUID(),revision:0,name:'Plantilla privada en espera',notes:'',phases:[{id:crypto.randomUUID(),title:'Fase conservada',position:0}],tasks:[],milestones:[]};
  const before=await snapshot(f),privateBefore=await state(f);
  gate=await lockAction(f.owner.id,command.actionId);
  pending=post(context,f.owner,command,templates);
  const run=promisify(execFile);
  await expect.poll(async()=>{
   const response=await run(gate!.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND query LIKE '%pro_schedule_templates_mutate%' AND ${gate!.pid}=ANY(pg_blocking_pids(pid));`],{env:process.env});
   return Number(response.stdout.trim());
  }).toBe(1);
  await run(gate.executable,['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`UPDATE public.pro_memberships SET expires_at=clock_timestamp()-interval '1 millisecond' WHERE user_id='${f.owner.id}'::uuid;`],{env:process.env});
  gate.release();expect(await gate.done).toBe(0);expect((await pending).status()).toBe(403);
  for(const table of ['pro_schedule_templates','pro_schedule_template_actions'])expect((await f.db.from(table).select('*').eq(table.endsWith('_actions')?'actor_id':'owner_id',f.owner.id).throwOnError()).data).toEqual([]);
  await f.db.from('pro_memberships').update({expires_at:null}).eq('user_id',f.owner.id).throwOnError();
  expect(await checked(context,{view:'action',actionId:command.actionId})).toEqual({receipt:null});
  const saved=await post(context,f.owner,command,templates);expect(saved.status()).toBe(200);const ack=await saved.json();
  expect(await checked(context,{view:'action',actionId:command.actionId})).toEqual({receipt:{input:command,result:ack}});
  for(const [actorContext,status] of [[anonymous,401],[freeContext,403]] as const)expect((await read(actorContext,{view:'list'},templates)).status()).toBe(status);
  expect((await read(foreignContext,{view:'detail',templateId:command.templateId},templates)).status()).toBe(404);
  expect((await post(foreignContext,other.owner,{...command,actionId:crypto.randomUUID(),revision:1},templates)).status()).toBe(403);
  await f.db.from('profiles').update({is_disabled:true}).eq('id',f.owner.id).throwOnError();
  expect((await read(context,{view:'action',actionId:command.actionId},templates)).status()).toBe(403);
  await f.db.from('profiles').update({is_disabled:false}).eq('id',f.owner.id).throwOnError();
  await f.db.from('professionals').insert({profile_id:f.owner.id,category_id:'desarrollo_web',business_name:'Ficha bloqueada local',slug:'private-schedule-template-'+f.owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:true}).throwOnError();
  expect((await read(context,{view:'list'},templates)).status()).toBe(403);
  await f.db.from('professionals').delete().eq('profile_id',f.owner.id).throwOnError();
  const direct=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:'Bearer '+f.token}},auth:{persistSession:false,autoRefreshToken:false}});
  expect((await direct.rpc('pro_schedule_templates_mutate',{p_actor:f.owner.id,p_input:command})).error?.code).toBe('42501');
  expect(await snapshot(f)).toEqual(before);expect(await state(f)).toEqual(privateBefore);
 } finally {
  gate?.release();if(pending)await pending.catch(()=>{});
  await freeContext.close();await foreignContext.close();await anonymous.close();
  if(other)await cleanup(other);await cleanupDisposableAccount(free);await cleanup(f);
 }
});
