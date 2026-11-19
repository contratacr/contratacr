import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import type {WorkTask} from '../../src/lib/pro/work-tasks';
const api='/api/pro/task-center',origin='http://127.0.0.1:3185';
function assertLocal(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
type CenterPage={items:{task:WorkTask;work:{id:string;service:string;client:string;stage:string;cancelled:boolean}}[];nextCursor:string|null;counts:{open:number;done:number;overdue:number}};
async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'pro-task-center'}),db=regressionAdminClient();
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
async function seed(f:Fixture){
 const today=crTodayISO(),shift=(n:number)=>new Date(Date.parse(today+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 const rows=Array.from({length:23},(_,index)=>({owner_id:f.owner.id,work_id:f.workId,id:crypto.randomUUID(),title:`PAGE ${String(index).padStart(2,'0')}`,details:'',assignee:'',due_date:today,status:'open',archived:false,revision:1}));
 rows.push({owner_id:f.owner.id,work_id:f.workId,id:crypto.randomUUID(),title:'100% literal_only',details:'PRIVATE_CENTER_NOTE',assignee:'Ana %_ Técnica',due_date:shift(-1),status:'open',archived:false,revision:1});
 rows.push({owner_id:f.owner.id,work_id:f.otherWorkId,id:crypto.randomUUID(),title:'Future unique',details:'',assignee:'',due_date:shift(1),status:'open',archived:false,revision:1});
 rows.push({owner_id:f.owner.id,work_id:f.workId,id:crypto.randomUUID(),title:'Completed unique',details:'',assignee:'',due_date:shift(-1),status:'done',archived:false,revision:1});
 rows.push({owner_id:f.owner.id,work_id:f.workId,id:crypto.randomUUID(),title:'ARCHIVED MUST STAY HIDDEN',details:'',assignee:'',due_date:today,status:'open',archived:true,revision:1});
 await f.db.from('pro_work_tasks').insert(rows).throwOnError();
 const undated=crypto.randomUUID();await f.db.from('pro_work_tasks').insert({owner_id:f.owner.id,work_id:f.workId,id:undated,title:'Undated unique',details:'',assignee:'',due_date:null,status:'open',archived:false,revision:1}).throwOnError();
 return {rows,today,undated,special:rows[23],future:rows[24],done:rows[25]};
}
async function read(page:Page,f:Fixture,query:Record<string,string>={}){const response=await page.request.get(api+'?'+new URLSearchParams(query),{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(response.status()).toBe(200);return await response.json() as CenterPage;}
async function snapshot(f:Fixture){const result:Record<string,unknown>={};
 for(const table of ['pro_workspaces','pro_work','pro_clients'])result[table]=(await f.db.from(table).select('*').eq('user_id',f.owner.id).order(table==='pro_workspaces'?'user_id':'id').throwOnError()).data;
 for(const table of ['pro_work_tasks','pro_work_task_history'])result[table]=(await f.db.from(table).select('*').eq('owner_id',f.owner.id).order(table==='pro_work_tasks'?'id':'action_id').throwOnError()).data;
 result.actions=(await f.db.from('pro_work_task_actions').select('*').eq('actor_id',f.owner.id).order('action_id').throwOnError()).data;
 result.notifications=(await f.db.from('notifications').select('*').eq('user_id',f.owner.id).order('id').throwOnError()).data;
 result.outbox=(await f.db.from('notification_push_outbox').select('*').eq('user_id',f.owner.id).order('id').throwOnError()).data;
 return result;
}

for(const language of ['es','en'] as const)test(`Task center: filters, existing editor and retained draft [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(180000);assertLocal(baseURL);const en=language==='en',f=await fixture(page.context());
 try{
  const data=await seed(f),before=await snapshot(f),runtime:string[]=[],centerWrites:string[]=[],taskWrites:string[]=[];let failRead=true;
  onAppPageError(page,message=>runtime.push(message));page.on('request',request=>{if(request.method()==='POST'){if(new URL(request.url()).pathname===api)centerWrites.push(request.postData()??'');if(new URL(request.url()).pathname==='/api/pro/work-tasks')taskWrites.push(request.postData()??'');}});
  await page.route('**/api/pro/task-center**',route=>{if(failRead&&route.request().method()==='GET'){failRead=false;return route.fulfill({status:503,json:{error:'LOCAL_CENTER_READ_FAILURE'}});}return route.continue();});
  const centerUrl=`/${language}/dashboard/pro?tab=pro_tasks`;await gotoOK(page,centerUrl);
  const center=page.locator('[data-task-center]');await expect(center).toBeVisible({timeout:45000});await expect(center.getByRole('alert')).toBeVisible();await center.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
  const search=center.getByLabel(en?'Search tasks':'Buscar tareas',{exact:true}),date=center.getByLabel(en?'Date':'Fecha',{exact:true});
  await expect(center.getByRole('button',{name:en?'Clear filters':'Limpiar filtros',exact:true})).toHaveCount(0);
  for(const label of en?['Completed','All']:['Completadas','Todas']){await center.getByRole('button',{name:label,exact:true}).click();await expect(center.getByRole('button',{name:en?'Clear filters':'Limpiar filtros',exact:true})).toHaveCount(0);}
  await center.getByRole('button',{name:en?'Pending':'Pendientes',exact:true}).click();
  await search.fill('100%');const special=center.locator(`[data-task-center-item="${data.special.id}"]:visible`);await expect(special).toBeVisible();await expect(center.locator('[data-task-center-item]:visible')).toHaveCount(1);await expect(special).toContainText('100% literal_only');
  await expect(page).toHaveURL(/taskSearch=100%25/);await date.selectOption('overdue');await expect(special).toBeVisible();
  await center.getByRole('button',{name:en?'Completed':'Completadas',exact:true}).click();await expect(center.locator('[data-task-center-item]:visible')).toHaveCount(0);
  await center.getByRole('button',{name:en?'Clear filters':'Limpiar filtros',exact:true}).click();await expect(search).toHaveValue('');await expect(date).toHaveValue('all');await expect(center.getByRole('button',{name:en?'Completed':'Completadas',exact:true})).toHaveAttribute('aria-pressed','true');await expect(center.getByRole('button',{name:en?'Clear filters':'Limpiar filtros',exact:true})).toHaveCount(0);const completedRow=center.locator(`[data-task-center-item="${data.done.id}"]:visible`);await expect(completedRow).toBeVisible();await completedRow.getByRole('button',{name:en?'Open job':'Abrir trabajo',exact:true}).click();await expect(page).toHaveURL(/workTaskStatus=done/);const completedTasks=page.locator('[data-work-tasks]');await expect(completedTasks.locator(`[data-work-task="${data.done.id}"]`)).toBeVisible({timeout:45000});await expect(completedTasks.getByRole('button',{name:en?'Completed':'Completadas',exact:true})).toHaveAttribute('aria-pressed','true');/* Round 9 (intentional, QA «Ronda 9»): the original task opens on the job's own page; its back arrow returns to the task center. */await page.locator('[data-job-route] header').getByRole('button',{name:en?'Back':'Volver',exact:true}).click();await expect(center).toBeVisible({timeout:60000});await expect(center.getByRole('button',{name:en?'Completed':'Completadas',exact:true})).toHaveAttribute('aria-pressed','true');await center.getByRole('button',{name:en?'Pending':'Pendientes',exact:true}).click();
  await date.selectOption('upcoming');await expect(center.locator(`[data-task-center-item="${data.future.id}"]:visible`)).toBeVisible();await expect(center.locator('[data-task-center-item]:visible')).toHaveCount(1);
  await date.selectOption('today');await expect(center.locator('[data-task-center-item]:visible')).toHaveCount(20);await center.getByRole('button',{name:en?'Show more tasks':'Ver más tareas',exact:true}).click();await expect(center.locator('[data-task-center-item]:visible')).toHaveCount(23);
  await center.getByRole('button',{name:en?'Clear filters':'Limpiar filtros',exact:true}).click();
  expect(centerWrites).toEqual([]);expect(taskWrites).toEqual([]);expect(await snapshot(f)).toEqual(before);
  await search.fill('100%');await expect(special).toBeVisible();await special.getByRole('button',{name:en?'Open job':'Abrir trabajo',exact:true}).click();
  const workspace=page.locator('[data-job-workspace]'),tasks=workspace.locator('[data-work-tasks]');await expect(tasks).toBeVisible({timeout:45000});await expect(page).toHaveURL(new RegExp('(?:cita=|/trabajo/)'+f.workId));await expect(page).toHaveURL(/(?:vistaTrabajo=|\/trabajo\/[^/?]+\/)tasks(?:[?&]|$)/);
  const task=tasks.locator(`[data-work-task="${data.special.id}"]`);await expect(task).toContainText('100% literal_only');await task.getByRole('button',{name:en?'Edit':'Editar',exact:true}).click();
  const form=tasks.locator('[data-work-task-form]'),field=form.getByLabel(en?'Task':'Tarea',{exact:true});await field.fill('CENTER_DRAFT_PRESERVED');
  const draftKey='ccr:pro:work-task-draft:v1:'+f.owner.id+':'+encodeURIComponent(f.workId);await expect.poll(()=>page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toContain('CENTER_DRAFT_PRESERVED');
  // A full document navigation models leaving the editor without discarding the
  // durable tab draft. The center itself must not send, complete or resave it.
  page.once('dialog',async dialog=>{expect(dialog.type()).toBe('beforeunload');await dialog.accept();});
  await gotoOK(page,centerUrl);await expect(center).toBeVisible({timeout:45000});expect(taskWrites).toEqual([]);expect(centerWrites).toEqual([]);
  await search.fill('100%');await expect(special).toBeVisible();await special.getByRole('button',{name:en?'Open job':'Abrir trabajo',exact:true}).click();await expect(field).toHaveValue('CENTER_DRAFT_PRESERVED',{timeout:45000});
  await form.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();await expect(form).toHaveCount(0);await expect(task).toContainText('CENTER_DRAFT_PRESERVED');expect(taskWrites).toHaveLength(1);
  await gotoOK(page,centerUrl);await expect(center).toBeVisible({timeout:45000});await search.fill('CENTER_DRAFT_PRESERVED');await expect(special).toBeVisible();
  await center.getByRole('button',{name:en?'New task':'Nueva tarea',exact:true}).click();const picker=center.locator('[data-task-center-picker]');await expect(picker).toBeVisible();await picker.getByLabel(en?'Search jobs or customers':'Buscar trabajo o cliente',{exact:true}).fill('Segundo trabajo');
  const job=picker.locator(`[data-task-center-job="${f.otherWorkId}"]`);await expect(job).toBeVisible();await job.getByRole('button',{name:en?'Use this job':'Usar este trabajo',exact:true}).click();await expect(tasks).toBeVisible({timeout:45000});await expect(page).toHaveURL(new RegExp('(?:cita=|/trabajo/)'+f.otherWorkId));
  // Reuse the existing task creator; the global picker never creates a task.
  await tasks.getByRole('button',{name:en?'New task':'Nueva tarea',exact:true}).click();await field.fill(en?'Created in original editor':'Creada en editor original');await form.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();await expect(form).toHaveCount(0);await expect(tasks).toContainText(en?'Created in original editor':'Creada en editor original');expect(taskWrites).toHaveLength(2);expect(centerWrites).toEqual([]);
  await gotoOK(page,centerUrl);await expect(center).toBeVisible({timeout:45000});await search.fill(en?'Created in original editor':'Creada en editor original');await expect(center.locator('[data-task-center-item]:visible')).toHaveCount(1);await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath('task-center-'+language+'.png'),fullPage:false});expect(runtime).toEqual([]);
 }finally{await page.goto('about:blank').catch(()=>{});await cleanupDisposableAccount(f.owner);}
});

test('Task center API: read-only owner scope, literal filters, CR dates, paging and denied direct access',async({page,browser,baseURL})=>{
 test.setTimeout(180000);assertLocal(baseURL);const f=await fixture(page.context()),foreignContext=await browser.newContext({baseURL});let other:Fixture|null=null;
 try{
  const data=await seed(f);
  const template=(await f.db.from('pro_work').select('user_id,client,service,stage,start,end,clientId,cancelled').eq('user_id',f.owner.id).eq('id',f.workId).single().throwOnError()).data!;
  const jobIds=Array.from({length:23},()=>crypto.randomUUID()).sort();
  await f.db.from('pro_work').insert(jobIds.map((id,index)=>({...template,id,service:'PICKER '+String(index).padStart(2,'0'),stage:index===0?'completed':'scheduled'}))).throwOnError();
  const cancelledId=crypto.randomUUID();await f.db.from('pro_work').insert({...template,id:cancelledId,service:'CANCELLED PICKER',cancelled:true}).throwOnError();
  const cancelledTask=crypto.randomUUID();await f.db.from('pro_work_tasks').insert({owner_id:f.owner.id,work_id:cancelledId,id:cancelledTask,title:'Cancelled job unique',due_date:null,status:'open',archived:false,revision:1}).throwOnError();
  const before=await snapshot(f);
  expect((await foreignContext.request.get(origin+api)).status()).toBe(401);other=await fixture(foreignContext);await seed(other);
  const all=await read(page,f,{status:'all'});expect(all.items).toHaveLength(20);expect(all.nextCursor).not.toBeNull();expect(all.counts).toEqual({open:27,done:1,overdue:1});
  const second=await read(page,f,{status:'all',after:all.nextCursor!});expect(second.items).toHaveLength(8);expect(second.nextCursor).toBeNull();expect(new Set([...all.items,...second.items].map(row=>row.task.id)).size).toBe(28);
  expect([...all.items,...second.items].every(row=>[f.workId,f.otherWorkId,cancelledId].includes(row.task.workId))).toBe(true);expect([...all.items,...second.items].some(row=>row.task.archived)).toBe(false);
  expect((await read(page,f,{q:'Cancelled job unique'})).items[0]).toMatchObject({task:{id:cancelledTask},work:{id:cancelledId,cancelled:true}});
  for(const query of ['100%','literal_','PRIVATE_CENTER_NOTE','Ana %_']){const result=await read(page,f,{q:query,status:'all'});expect(result.items.map(row=>row.task.id)).toEqual([data.special.id]);expect(result.counts).toEqual({open:1,done:0,overdue:1});}
  expect((await read(page,f,{q:'%',status:'all'})).items.map(row=>row.task.id)).toEqual([data.special.id]);expect((await read(page,f,{q:'_',status:'all'})).items.map(row=>row.task.id)).toEqual([data.special.id]);
  expect((await read(page,f,{q:'cliente local tareas',status:'all'})).counts).toEqual(all.counts);expect((await read(page,f,{q:'Segundo trabajo local',status:'all'})).items.map(row=>row.task.id)).toEqual([data.future.id]);
  expect((await read(page,f,{timing:'overdue',status:'all'})).items.map(row=>row.task.id)).toEqual([data.special.id]);
  const current=await read(page,f,{timing:'today',status:'all'});expect(current.items).toHaveLength(20);expect(current.counts).toEqual(all.counts);expect(current.items.every(row=>row.task.dueDate===data.today)).toBe(true);
  expect((await read(page,f,{timing:'upcoming',status:'all'})).items.map(row=>row.task.id)).toEqual([data.future.id]);expect((await read(page,f,{status:'done'})).items.map(row=>row.task.id)).toEqual([data.done.id]);
  expect((await read(page,f,{q:'Undated',timing:'today',status:'all'})).items).toEqual([]);expect((await read(page,f,{q:'Undated',status:'all'})).items[0].task.id).toBe(data.undated);
  for(const query of ([{status:'bad'},{timing:'bad'},{q:'a'.repeat(101)},{after:'not-a-uuid'},{after:crypto.randomUUID()},{after:data.special.id,q:'PAGE'}] as Record<string,string>[]))expect((await page.request.get(api+'?'+new URLSearchParams(query),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).status()).toBe(400);
  expect((await page.request.get(api,{headers:{'X-Pro-Expected-Actor':other.owner.id}})).status()).toBe(403);
  expect((await foreignContext.request.get(origin+api+'?'+new URLSearchParams({after:data.special.id}),{headers:{'X-Pro-Expected-Actor':other.owner.id}})).status()).toBe(400);
  await other.db.from('pro_memberships').delete().eq('user_id',other.owner.id).throwOnError();for(const path of [api,api+'?view=jobs'])expect((await foreignContext.request.get(origin+path)).status()).toBe(403);await other.db.from('pro_memberships').insert({user_id:other.owner.id,status:'active'}).throwOnError();
  expect((await page.request.get(api+'?status=open&status=all')).status()).toBe(400);expect((await page.request.get(api+'?unknown=1')).status()).toBe(400);
  for(const client of [createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}}),createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:'Bearer '+f.token}},auth:{persistSession:false}})]){
   expect((await client.from('pro_work_tasks').select('*').eq('owner_id',f.owner.id)).error?.code).toBe('42501');
   expect((await client.rpc('pro_task_center_read',{p_actor:f.owner.id,p_status:'all',p_timing:'all',p_query:'',p_after:null})).error?.code).toBe('42501');
   expect((await client.rpc('pro_task_center_jobs_read',{p_actor:f.owner.id,p_query:'',p_after:null})).error?.code).toBe('42501');
  }
  const jobsResponse=await page.request.get(api+'?view=jobs&q=PICKER',{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(jobsResponse.status()).toBe(200);const jobs=await jobsResponse.json();expect(jobs.items.map((row:{id:string})=>row.id)).toEqual(jobIds.slice(0,20));expect(jobs.nextCursor).toBe(jobIds[19]);expect(jobs.items[0].stage).toBe('completed');
  const jobsNextResponse=await page.request.get(api+'?'+new URLSearchParams({view:'jobs',q:'PICKER',after:jobs.nextCursor}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(jobsNextResponse.status()).toBe(200);const jobsNext=await jobsNextResponse.json();expect(jobsNext.items.map((row:{id:string})=>row.id)).toEqual(jobIds.slice(20));expect(jobsNext.nextCursor).toBeNull();
  for(const query of ([{view:'jobs',q:'absent',after:jobIds[0]},{view:'jobs',after:cancelledId},{view:'jobs',after:other.workId},{view:'jobs',q:'%'}] as Record<string,string>[])){
   const response=await page.request.get(api+'?'+new URLSearchParams(query),{headers:{'X-Pro-Expected-Actor':f.owner.id}});if(query.q==='%'){expect(response.status()).toBe(200);expect((await response.json()).items).toEqual([]);}else expect(response.status()).toBe(400);
  }
  expect((await page.request.post(api,{headers:{Origin:origin,'X-Pro-Expected-Actor':f.owner.id},data:{action:'complete',taskId:data.special.id}})).status()).toBe(405);
  await f.db.from('pro_memberships').update({status:'inactive'}).eq('user_id',f.owner.id).throwOnError();expect((await page.request.get(api)).status()).toBe(403);await f.db.from('pro_memberships').update({status:'active'}).eq('user_id',f.owner.id).throwOnError();
  await f.db.from('profiles').update({is_disabled:true}).eq('id',f.owner.id).throwOnError();expect((await page.request.get(api)).status()).toBe(403);await f.db.from('profiles').update({is_disabled:false}).eq('id',f.owner.id).throwOnError();
  expect(await snapshot(f)).toEqual(before);
 }finally{await foreignContext.close();if(other)await cleanupDisposableAccount(other.owner);await cleanupDisposableAccount(f.owner);}
});
