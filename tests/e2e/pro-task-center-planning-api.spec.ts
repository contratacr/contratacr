import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
const origin='http://127.0.0.1:3185',api='/api/pro/team';
const center='/api/pro/task-center';
function assertLocal(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'pro-team-owner'}),db=regressionAdminClient();
 try{
  const account=await db.auth.admin.getUserById(owner.id);
  expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();
  await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Tareas locales',slug:'tasks-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  const document=emptyBusiness(),workId=crypto.randomUUID(),otherWorkId=crypto.randomUUID(),day=crTodayISO(),clientId='tasks-local-customer';
  document.clients=[{id:clientId,name:'Cliente local tareas',email:'',phone:'',notes:'No modificar',archived:false}];
  document.work=[workId,otherWorkId].map((id,index)=>({id,clientId,client:'Cliente local tareas',service:index?'Segundo trabajo local':'Trabajo local tareas',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T11:00:00-06:00',cancelled:false}));
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:origin,sameSite:'Lax' as const})))}});
  const signed=await auth.auth.signInWithPassword({email:owner.email,password:owner.password});expect(signed.error).toBeNull();expect(signed.data.session).not.toBeNull();
  // Compile/warm the real local auth/access handlers before the UI's bounded
  // access probe starts. This setup budget does not alter product timeouts.
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  for(const id of [workId,otherWorkId])expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({clientId,workId:id}),{timeout:45000})).status()).toBe(200);
  return {owner,workId,otherWorkId,db,token:signed.data.session!.access_token};
 }catch(error){await cleanupDisposableAccount(owner);throw error;}
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function login(context:BrowserContext,account:DisposableAccount){
 const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:origin,sameSite:'Lax' as const})))}});
 const result=await auth.auth.signInWithPassword({email:account.email,password:account.password});expect(result.error).toBeNull();expect(result.data.session).not.toBeNull();
 for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
 return result.data.session!.access_token;
}
async function post(context:BrowserContext,actor:DisposableAccount,input:Record<string,unknown>){return context.request.post(origin+api,{headers:{Origin:origin,'X-Pro-Expected-Actor':actor.id},data:input});}
const code=()=>randomBytes(32).toString('hex');
async function grantAccess(ownerContext:BrowserContext,owner:DisposableAccount,memberContext:BrowserContext,member:DisposableAccount,workId:string,role='contributor'){
 const raw=code();expect((await post(ownerContext,owner,{action:'invite',actionId:crypto.randomUUID(),workId,email:member.email,role,code:raw})).status()).toBe(200);const accepted=await post(memberContext,member,{action:'accept',actionId:crypto.randomUUID(),code:raw});expect(accepted.status()).toBe(200);return (await accepted.json()).grant as {id:string;role:string;revision:number;displayName:string;canAssign:boolean};
}
async function planning(context:BrowserContext,actor:DisposableAccount,query:Record<string,string>={}){
 const response=await context.request.get(origin+center+'?'+new URLSearchParams({view:'planning',...query}),{headers:{'X-Pro-Expected-Actor':actor.id}});expect(response.status()).toBe(200);expect(response.headers()['cache-control']).toContain('no-store');const body=await response.json();expect(body.context.map((row:{taskId:string})=>row.taskId)).toEqual(body.page.items.map((row:{task:{id:string}})=>row.task.id));expect(body.context.length).toBeLessThanOrEqual(20);return body;
}
async function frozenData(f:Fixture,memberId:string){const snapshot:Record<string,unknown>={};
 for(const table of ['pro_workspaces','pro_work','pro_clients'])snapshot[table]=(await f.db.from(table).select('*').eq('user_id',f.owner.id).order(table==='pro_workspaces'?'user_id':'id').throwOnError()).data;
 for(const table of ['pro_work_tasks','pro_work_task_history','pro_work_schedule_heads','pro_work_schedule_phases','pro_work_schedule_plans','pro_work_schedule_dependencies','pro_team_task_assignments','pro_team_grants'])snapshot[table]=(await f.db.from(table).select('*').eq('owner_id',f.owner.id).throwOnError()).data;
 for(const table of ['pro_work_task_actions','pro_work_schedule_actions','pro_team_actions'])snapshot[table]=(await f.db.from(table).select('*').eq('actor_id',f.owner.id).throwOnError()).data;
 for(const table of ['notifications','notification_push_outbox'])snapshot[table]=(await f.db.from(table).select('*').in('user_id',[f.owner.id,memberId]).order('id').throwOnError()).data;
 return snapshot;
}
test('Task center planning API: exact page context, assignment generation, planned dates, literal search and read-only isolation',async({page,browser,baseURL})=>{
 test.setTimeout(240000);assertLocal(baseURL);const f=await fixture(page.context()),member=await createDisposableAccount({prefix:'planning-member'}),memberContext=await browser.newContext({baseURL}),otherContext=await browser.newContext({baseURL}),anonymous=await browser.newContext({baseURL});let other:Fixture|null=null;
 try{
  const memberToken=await login(memberContext,member);let grant=await grantAccess(page.context(),f.owner,memberContext,member,f.workId);const phaseId=crypto.randomUUID(),archivedPhase=crypto.randomUUID(),taskId=crypto.randomUUID(),archivedTask=crypto.randomUUID(),due='2031-07-20';
  const rows=Array.from({length:23},(_,index)=>({owner_id:f.owner.id,work_id:f.workId,id:index===0?taskId:crypto.randomUUID(),title:'PAGE '+String(index).padStart(2,'0'),details:'',assignee:index===0?'MANUAL_RESPONSABLE_PRESERVED':'',due_date:due,status:'open',archived:false,revision:1}));
  rows.push({owner_id:f.owner.id,work_id:f.otherWorkId,id:crypto.randomUUID(),title:'OTHER_WORK_NO_PLAN',details:'',assignee:'',due_date:due,status:'open',archived:false,revision:1});rows.push({owner_id:f.owner.id,work_id:f.workId,id:archivedTask,title:'ARCHIVED_TASK_SECRET',details:'',assignee:'',due_date:due,status:'open',archived:true,revision:1});
  await f.db.from('pro_work_tasks').insert(rows).throwOnError();await f.db.from('pro_work_schedule_heads').insert({owner_id:f.owner.id,work_id:f.workId,revision:1}).throwOnError();await f.db.from('pro_work_schedule_phases').insert([{owner_id:f.owner.id,work_id:f.workId,id:phaseId,title:'FASE %_ ÚNICA',position:0,archived:false},{owner_id:f.owner.id,work_id:f.workId,id:archivedPhase,title:'ARCHIVED_PHASE_SECRET',position:1,archived:true}]).throwOnError();
  await f.db.from('pro_work_schedule_plans').insert([{owner_id:f.owner.id,work_id:f.workId,task_id:taskId,phase_id:phaseId,planned_start:'2024-02-29',planned_end:'2024-03-02'},{owner_id:f.owner.id,work_id:f.workId,task_id:rows[1].id,phase_id:archivedPhase,planned_start:null,planned_end:null}]).throwOnError();
  const assignment={action:'assign',actionId:crypto.randomUUID(),workId:f.workId,taskId,revision:1,assigneeGrantId:grant.id};expect((await post(page.context(),f.owner,assignment)).status()).toBe(200);
  other=await fixture(otherContext);await other.db.from('pro_work').update({id:f.workId}).eq('user_id',other.owner.id).eq('id',other.workId).throwOnError();await other.db.from('pro_work_tasks').insert({owner_id:other.owner.id,work_id:f.workId,id:taskId,title:'FOREIGN_OWNER_SECRET',details:'',assignee:'FOREIGN_ASSIGNEE_SECRET',due_date:due,status:'open',archived:false,revision:1}).throwOnError();
  const before=await frozenData(f,member.id);const result=await planning(page.context(),f.owner,{q:'FASE %_'});expect(result.page.items.map((row:{task:{id:string}})=>row.task.id)).toEqual([taskId]);expect(result.context).toEqual([{taskId,assignment:{grantId:grant.id,name:grant.displayName,active:true},plan:{phaseId,phaseName:'FASE %_ ÚNICA',phaseArchived:false,plannedStart:'2024-02-29',plannedEnd:'2024-03-02'}}]);expect(result.page.items[0].task).toMatchObject({assignee:'MANUAL_RESPONSABLE_PRESERVED',dueDate:due,revision:2});
  for(const q of ['%','_','fase %_','MANUAL_RESPONSABLE_PRESERVED',grant.displayName])expect((await planning(page.context(),f.owner,{q})).page.items.some((row:{task:{id:string}})=>row.task.id===taskId)).toBe(true);
  const first=await planning(page.context(),f.owner);const legacy=await page.request.get(center);expect(legacy.status()).toBe(200);expect(first.page).toEqual(await legacy.json());const second=await planning(page.context(),f.owner,{after:first.page.nextCursor});expect(first.page.items).toHaveLength(20);expect(second.page.items).toHaveLength(4);expect(second.page.nextCursor).toBeNull();expect(new Set([...first.page.items,...second.page.items].map(row=>row.task.id)).size).toBe(24);const allContext=[...first.context,...second.context];expect(allContext.find(row=>row.taskId===rows[1].id).plan).toEqual({phaseId:archivedPhase,phaseName:'ARCHIVED_PHASE_SECRET',phaseArchived:true,plannedStart:null,plannedEnd:null});expect(allContext.find(row=>row.taskId===rows[23].id)).toEqual({taskId:rows[23].id,assignment:null,plan:null});
  expect((await planning(page.context(),f.owner,{q:'ARCHIVED_PHASE_SECRET'})).page.items).toEqual([]);for(const q of ['FOREIGN_OWNER_SECRET','FOREIGN_ASSIGNEE_SECRET','ARCHIVED_TASK_SECRET'])expect((await planning(page.context(),f.owner,{q})).page.items).toEqual([]);expect((await planning(otherContext,other.owner)).page.items.map((row:{task:{title:string}})=>row.task.title)).toEqual(['FOREIGN_OWNER_SECRET']);expect(await frozenData(f,member.id)).toEqual(before);
  // Read permissions are owner Pro, independent of a legitimate collaborator grant.
  expect((await anonymous.request.get(origin+center+'?view=planning')).status()).toBe(401);expect((await memberContext.request.get(origin+center+'?view=planning')).status()).toBe(403);expect((await page.request.get(center+'?view=planning',{headers:{'X-Pro-Expected-Actor':other.owner.id}})).status()).toBe(403);
  for(const query of ['view=planning&after=bad','view=planning&after='+crypto.randomUUID(),'view=planning&after='+archivedTask,'view=planning&after='+taskId+'&q=OTHER_WORK_NO_PLAN','view=planning&status=bad','view=planning&status=open&status=all','view=planning&unknown=1','view=planning&q='+('a'.repeat(101))])expect((await page.request.get(center+'?'+query)).status()).toBe(400);
  await other.db.from('pro_memberships').delete().eq('user_id',other.owner.id).throwOnError();expect((await otherContext.request.get(origin+center+'?view=planning')).status()).toBe(403);await other.db.from('pro_memberships').insert({user_id:other.owner.id,status:'active'}).throwOnError();
  for(const accessToken of [null,f.token,memberToken]){const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(accessToken?{global:{headers:{Authorization:'Bearer '+accessToken}}}:{})});expect((await client.rpc('pro_task_center_planning_read',{p_actor:f.owner.id,p_status:'open',p_timing:'all',p_query:'',p_after:null})).error?.code).toBe('42501');}
  for(const [table,field,value,restore] of [['profiles','is_disabled',true,false],['pro_memberships','status','inactive','active']]as const){await f.db.from(table).update({[field]:value}).eq(table==='profiles'?'id':'user_id',f.owner.id).throwOnError();expect((await page.request.get(center+'?view=planning')).status()).toBe(403);await f.db.from(table).update({[field]:restore}).eq(table==='profiles'?'id':'user_id',f.owner.id).throwOnError();}
  expect((await page.request.post(center+'?view=planning',{data:{action:'save'}})).status()).toBe(405);
  // A removed/reissued generation must never silently reactivate an old assignment.
  expect((await post(page.context(),f.owner,{action:'revoke',actionId:crypto.randomUUID(),workId:f.workId,grantId:grant.id,revision:grant.revision})).status()).toBe(200);expect((await planning(page.context(),f.owner,{q:'PAGE 00'})).context[0].assignment.active).toBe(false);expect((await planning(page.context(),f.owner,{q:grant.displayName})).page.items).toEqual([]);grant=await grantAccess(page.context(),f.owner,memberContext,member,f.workId);expect((await planning(page.context(),f.owner,{q:'PAGE 00'})).context[0].assignment.active).toBe(false);expect((await post(page.context(),f.owner,{...assignment,actionId:crypto.randomUUID(),revision:2,assigneeGrantId:grant.id})).status()).toBe(200);expect((await planning(page.context(),f.owner,{q:'PAGE 00'})).context[0].assignment.active).toBe(true);
  expect((await f.db.from('pro_work_tasks').select('assignee,due_date').eq('owner_id',f.owner.id).eq('id',taskId).single().throwOnError()).data).toEqual({assignee:'MANUAL_RESPONSABLE_PRESERVED',due_date:due});expect((await f.db.from('pro_workspaces').select('*').eq('user_id',f.owner.id).throwOnError()).data).toEqual(before.pro_workspaces);
 }finally{await memberContext.close();await otherContext.close();await anonymous.close();if(other)await cleanupDisposableAccount(other.owner);await cleanupDisposableAccount(member);await cleanupDisposableAccount(f.owner);}
});
