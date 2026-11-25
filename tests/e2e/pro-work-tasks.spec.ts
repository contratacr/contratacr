import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {createServerClient} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import type {WorkTask,WorkTaskMutation,WorkTasksPage,WorkTaskDetail} from '../../src/lib/pro/work-tasks';
import {stableSnapshotRows} from './stable-rows';

const api='/api/pro/work-tasks';
const origin='http://127.0.0.1:3185';
function assertLocal(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function fixture(context:BrowserContext){
 await stabilizeLocalProRuntime(context,origin);
 const owner=await createDisposableAccount({prefix:'pro-work-tasks'}),db=regressionAdminClient();
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
// Round 4B: the responsible person is a Team member of the job. A real contributor grant is
// created through the Team API (invite + accept by the member's own session).
async function contributor(ownerContext:BrowserContext,owner:DisposableAccount,memberContext:BrowserContext,member:DisposableAccount,workId:string){
 await stabilizeLocalProRuntime(memberContext,origin);
 const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>memberContext.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:origin,sameSite:'Lax' as const})))}});
 expect((await auth.auth.signInWithPassword({email:member.email,password:member.password})).error).toBeNull();
 const code=randomBytes(32).toString('hex'),headers=(actor:DisposableAccount)=>({Origin:origin,'X-Pro-Expected-Actor':actor.id});
 expect((await ownerContext.request.post(origin+'/api/pro/team',{headers:headers(owner),data:{action:'invite',actionId:crypto.randomUUID(),workId,email:member.email,role:'contributor',code}})).status()).toBe(200);
 const accepted=await memberContext.request.post(origin+'/api/pro/team',{headers:headers(member),data:{action:'accept',actionId:crypto.randomUUID(),code}});expect(accepted.status()).toBe(200);
 return(await accepted.json()).grant as {id:string;displayName:string};
}
async function post(page:Page,owner:DisposableAccount,input:WorkTaskMutation){return page.request.post(api,{headers:{Origin:origin,'X-Pro-Expected-Actor':owner.id},data:input});}
async function read(page:Page,owner:DisposableAccount,workId:string,status='all',archived=false){const response=await page.request.get(api+'?'+new URLSearchParams({workId,status,...archived?{archived:'1'}:{}}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(response.status()).toBe(200);return await response.json() as WorkTasksPage;}

for(const language of ['es','en'] as const)test(`Private work tasks: form, dates, history and exact recovery [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(300000);assertLocal(baseURL);const en=language==='en',f=await fixture(page.context()),{owner,workId,otherWorkId,db}=f;
 const member=await createDisposableAccount({prefix:'pro-work-tasks-member'}),memberContext=await browser.newContext({baseURL});
 const title=en?'Check the electrical installation':'Revisar la instalación eléctrica',changedTitle=en?'Check installation and grounding':'Revisar instalación y puesta a tierra';
 try{
  const teamMember=await contributor(page.context(),owner,memberContext,member,workId),assigneeLabel=en?'Assignee (optional)':'Responsable (opcional)';
  const preserved=async()=>{
   const result:Record<string,unknown>={};
   for(const table of ['pro_workspaces','pro_clients','pro_work','pro_client_entries','pro_quote_links'])result[table]=stableSnapshotRows((await db.from(table).select('*').eq('user_id',owner.id).throwOnError()).data);
   for(const table of ['pro_work_delivery_drafts','pro_work_delivery_versions','pro_work_delivery_photos'])result[table]=stableSnapshotRows((await db.from(table).select('*').eq('owner_id',owner.id).throwOnError()).data);
   return result;
  };
  const before=await preserved(),runtime:string[]=[],bodies:string[]=[];let loseNextWrite=false,failNextRead=true;
  let finishLostResponse:()=>void=()=>{};const lostResponseFinished=new Promise<void>(resolve=>{finishLostResponse=resolve;});
  onAppPageError(page,message=>runtime.push(message));
  await page.route('**/api/pro/work-tasks**',async route=>{
   const req=route.request();
   if(req.method()==='GET'&&failNextRead){failNextRead=false;return route.fulfill({status:503,json:{error:'LOCAL_READ_FAILURE'}});}
   if(req.method()==='POST'){
    bodies.push(req.postData()!);
    if(loseNextWrite){loseNextWrite=false;const response=await route.fetch();expect(response.status()).toBe(200);await route.fulfill({status:503,json:{error:'LOCAL_RESPONSE_LOST_AFTER_COMMIT'}});finishLostResponse();return;}
   }
   return route.continue();
  });
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${workId}&vistaTrabajo=tasks`);
  const workspace=page.locator('[data-job-workspace]'),tasks=workspace.locator('[data-work-tasks]');
  await expect(tasks).toBeVisible({timeout:45000});
  await expect(tasks.getByRole('alert')).toBeVisible();
  await tasks.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
  await expect(tasks.getByRole('button',{name:en?'New task':'Nueva tarea',exact:true})).toBeEnabled();
  await tasks.getByRole('button',{name:en?'New task':'Nueva tarea',exact:true}).click();
  const form=tasks.locator('[data-work-task-form]');
  await form.getByLabel(en?'Task':'Tarea',{exact:true}).fill(title);
  const dirtyPath=page.url();
  await workspace.getByRole('navigation').getByRole('button',{name:en?'Changes':'Extras y cambios',exact:true}).dispatchEvent('click');
  await expect(page).toHaveURL(dirtyPath);await expect(form).toBeVisible();await expect(form.getByLabel(en?'Task':'Tarea',{exact:true})).toHaveValue(title);
  await form.getByLabel(en?'Due date (optional)':'Fecha límite (opcional)',{exact:true}).fill('2026-12-15');
  await form.getByLabel(assigneeLabel,{exact:true}).selectOption(teamMember.id);
  await form.getByLabel(en?'Notes (optional)':'Notas (opcional)',{exact:true}).fill('PRIVATE_TASK_NOTE');
  const draftKey='ccr:pro:work-task-draft:v1:'+owner.id+':'+encodeURIComponent(workId);
  await expect.poll(()=>page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toContain('PRIVATE_TASK_NOTE');
  const retainedDraft=await page.evaluate(key=>sessionStorage.getItem(key),draftKey);
  await form.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();
  const confirmation=page.getByRole('dialog').last();await expect(confirmation.getByRole('button',{name:en?'Keep editing':'Seguir editando',exact:true})).toBeVisible();
  await confirmation.getByRole('button',{name:en?'Keep editing':'Seguir editando',exact:true}).click();
  await expect(form).toBeVisible();await expect(form.getByLabel(en?'Task':'Tarea',{exact:true})).toHaveValue(title);await expect(form.getByLabel(en?'Due date (optional)':'Fecha límite (opcional)',{exact:true})).toHaveValue('2026-12-15');await expect(form.getByLabel(assigneeLabel,{exact:true})).toHaveValue(teamMember.id);await expect(form.getByLabel(en?'Notes (optional)':'Notas (opcional)',{exact:true})).toHaveValue('PRIVATE_TASK_NOTE');expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(retainedDraft);
  await form.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();await confirmation.getByRole('button',{name:en?'Discard changes':'Descartar cambios',exact:true}).click();
  await expect(form).toHaveCount(0);expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBeNull();expect(bodies).toEqual([]);
  await tasks.getByRole('button',{name:en?'New task':'Nueva tarea',exact:true}).click();
  await form.getByLabel(en?'Task':'Tarea',{exact:true}).fill(title);await form.getByLabel(en?'Due date (optional)':'Fecha límite (opcional)',{exact:true}).fill('2026-12-15');await form.getByLabel(assigneeLabel,{exact:true}).selectOption(teamMember.id);await form.getByLabel(en?'Notes (optional)':'Notas (opcional)',{exact:true}).fill('PRIVATE_TASK_NOTE');
  loseNextWrite=true;
  await form.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();
  // The pending journal appears before the request commits. Wait for the fake
  // lost-response handler, then assert the real committed row without polling
  // an absent row into a false success.
  await lostResponseFinished;
  const recovery=tasks.locator('[data-work-task-recovery]');await expect(recovery).toBeVisible();
  expect(bodies).toHaveLength(1);const originalBody=bodies[0],operation=JSON.parse(originalBody) as WorkTaskMutation;
  let stored=await read(page,owner,workId);expect(stored.items).toHaveLength(1);expect(operation).toMatchObject({action:'create',assignee:''});expect(stored.items[0]).toMatchObject({id:operation.taskId,title,dueDate:'2026-12-15',assignee:'',details:'PRIVATE_TASK_NOTE',status:'open',revision:1});
  const assignment=()=>db.from('pro_team_task_assignments').select('grant_id').eq('owner_id',owner.id).eq('task_id',operation.taskId).throwOnError().then(r=>r.data);expect(await assignment()).toEqual([]);
  await page.reload();await expect(recovery).toBeVisible({timeout:45000});expect(bodies).toEqual([originalBody]);await expect(form.getByLabel(assigneeLabel,{exact:true})).toHaveValue(teamMember.id);
  await recovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true}).click();
  await expect(recovery).toHaveCount(0);expect(bodies).toEqual([originalBody,originalBody]);
  // The confirmed save then applies the Team member chosen before the answer was lost (Team writer: +1 revision).
  await expect(tasks.getByText(en?'Assignee set.':'Responsable asignado.',{exact:true})).toBeVisible();expect(await assignment()).toEqual([{grant_id:teamMember.id}]);
  stored=await read(page,owner,workId);expect(stored.items).toHaveLength(1);expect(stored.items[0].revision).toBe(2);expect(stored.items[0].assignee).toBe('');
  const card=tasks.locator(`[data-work-task="${operation.taskId}"]`);await expect(card).toContainText(title);
  await card.getByRole('button',{name:en?'Edit':'Editar',exact:true}).click();
  await expect(form.getByLabel(assigneeLabel,{exact:true})).toHaveValue(teamMember.id);await form.getByLabel(en?'Task':'Tarea',{exact:true}).fill(changedTitle);await form.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();
  await expect(form).toHaveCount(0);await expect(card).toContainText(changedTitle);
  await card.getByRole('button',{name:en?'Complete':'Completar',exact:true}).click();await expect(card).toHaveCount(0);
  await tasks.getByRole('button',{name:en?'Completed':'Completadas',exact:true}).click();await expect(card).toContainText(changedTitle);
  await card.getByRole('button',{name:en?'Reopen':'Reabrir',exact:true}).click();await expect(card).toHaveCount(0);
  await tasks.getByRole('button',{name:en?'Open':'Pendientes',exact:true}).click();await expect(card).toContainText(changedTitle);
  await card.locator(en?'summary[aria-label="More options"]':'summary[aria-label="Más opciones"]').click();
  await card.getByRole('button',{name:en?'History':'Historial',exact:true}).click();
  const history=tasks.locator('[data-work-task-history]');await expect(history).toBeVisible();await expect(history).toContainText(title);await expect(history).toContainText(changedTitle);
  // History visibility never grants access to the assignee named in the form.
  const detailResponse=await page.request.get(api+'?'+new URLSearchParams({workId,taskId:operation.taskId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(detailResponse.status()).toBe(200);
  const detail=await detailResponse.json() as WorkTaskDetail;expect(detail.history).toHaveLength(5);expect(detail.history.map(row=>row.action).sort()).toEqual(['complete','create','reopen','update','update']);expect(detail.history.filter(row=>row.action==='create')).toHaveLength(1);
  await card.getByRole('button',{name:en?'Archive':'Archivar',exact:true}).click();await expect(card).toHaveCount(0);
  await tasks.locator(en?'summary[aria-label="Options"]':'summary[aria-label="Opciones"]').click();await tasks.getByRole('button',{name:en?'Show archived':'Ver archivadas',exact:true}).click();await expect(card).toContainText(changedTitle);
  await card.locator(en?'summary[aria-label="More options"]':'summary[aria-label="Más opciones"]').click();await card.getByRole('button',{name:en?'Restore':'Restaurar',exact:true}).click();await expect(card).toHaveCount(0);
  const restored=await read(page,owner,workId);expect(restored.items).toHaveLength(1);expect(restored.items[0]).toMatchObject({title:changedTitle,archived:false,status:'open',dueDate:'2026-12-15',assignee:'',revision:7});expect(restored.counts).toEqual({open:1,done:0});expect(await assignment()).toEqual([{grant_id:teamMember.id}]);
  // Legacy free text (written before Round 4B or through the API) stays readable as reference
  // and is kept on unrelated edits; it is never turned into a Team assignment.
  const legacyId=crypto.randomUUID();expect((await post(page,owner,{action:'create',workId,taskId:legacyId,actionId:crypto.randomUUID(),revision:0,title:'Legacy task',details:'',dueDate:null,assignee:'Técnico local'})).status()).toBe(200);
  await page.reload();const legacyCard=tasks.locator(`[data-work-task="${legacyId}"]`);await expect(legacyCard).toBeVisible({timeout:45000});await legacyCard.getByRole('button',{name:en?'Edit':'Editar',exact:true}).click();
  await expect(form.locator('[data-work-task-legacy]')).toContainText('Técnico local');await expect(form.getByLabel(assigneeLabel,{exact:true})).toHaveValue('');
  await form.getByLabel(en?'Task':'Tarea',{exact:true}).fill('Legacy task kept');await form.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();await expect(form).toHaveCount(0);
  const legacy=(await read(page,owner,workId)).items.find(item=>item.id===legacyId);expect(legacy).toMatchObject({title:'Legacy task kept',assignee:'Técnico local',revision:2});
  expect((await db.from('pro_team_task_assignments').select('task_id').eq('owner_id',owner.id).eq('task_id',legacyId).throwOnError()).data).toEqual([]);
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${otherWorkId}&vistaTrabajo=tasks`);await expect(tasks).toBeVisible({timeout:45000});await expect(tasks.locator('[data-work-task]')).toHaveCount(0);await expect(tasks).not.toContainText(changedTitle);
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${workId}`);const summary=page.locator('[data-work-tasks-summary]');await expect(summary).toBeVisible({timeout:45000});await expect(summary).toContainText(changedTitle);
  await expectNoHorizontalOverflow(page);await summary.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('work-tasks-'+language+'.png'),fullPage:false});
  expect(runtime).toEqual([]);expect(await preserved()).toEqual(before);
 }finally{await page.goto('about:blank').catch(()=>{});await memberContext.close().catch(()=>{});await cleanupDisposableAccount(member);await cleanupDisposableAccount(owner);}
});

test('Work task API: ownership, CAS, idempotency, dates, pagination and deny-direct RLS',async({page,browser,baseURL})=>{
 test.setTimeout(240000);assertLocal(baseURL);const f=await fixture(page.context()),foreignContext=await browser.newContext({baseURL}),{owner,workId,otherWorkId,db}=f;let other:Awaited<ReturnType<typeof fixture>>|null=null;
 try{
  expect((await foreignContext.request.get(origin+api+'?'+new URLSearchParams({workId}))).status()).toBe(401);
  other=await fixture(foreignContext);
  const id=crypto.randomUUID(),create:WorkTaskMutation={action:'create',workId,taskId:id,actionId:crypto.randomUUID(),revision:0,title:'API local task',details:'API private details',dueDate:'2026-12-15',assignee:'Sin acceso por nombre'};
  expect((await page.request.post(api,{headers:{Origin:'https://foreign.invalid','X-Pro-Expected-Actor':owner.id},data:create})).status()).toBe(403);
  const created=await post(page,owner,create);expect(created.status()).toBe(200);const first=await created.json() as {task:WorkTask};expect(first.task).toMatchObject({id,revision:1,status:'open',archived:false});
  const updated:WorkTaskMutation={...create,action:'update',revision:1,actionId:crypto.randomUUID(),title:'API local task edited'};
  const update=await post(page,owner,updated);expect(update.status()).toBe(200);const second=await update.json() as {task:WorkTask};expect(second.task.revision).toBe(2);
  const replay=await post(page,owner,create);expect(replay.status()).toBe(200);expect(await replay.json()).toEqual(first);
  expect((await post(page,owner,{...create,title:'Changed bytes, same identity'})).status()).toBe(400);
  expect((await post(page,owner,{...updated,actionId:crypto.randomUUID(),title:'STALE MUST NOT SAVE'})).status()).toBe(409);
  expect((await post(page,owner,{...create,taskId:crypto.randomUUID(),actionId:crypto.randomUUID(),dueDate:'2026-02-30'})).status()).toBe(400);
  const foreignHeaders={Origin:origin,'X-Pro-Expected-Actor':other.owner.id};
  expect((await foreignContext.request.get(origin+api+'?'+new URLSearchParams({workId,taskId:id}),{headers:foreignHeaders})).status()).toBe(404);
  expect((await foreignContext.request.post(origin+api,{headers:foreignHeaders,data:{action:'complete',workId,taskId:id,actionId:crypto.randomUUID(),revision:2}})).status()).toBe(403);
  expect((await page.request.get(api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':other.owner.id}})).status()).toBe(403);
  for(const client of [createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}),createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:'Bearer '+f.token}},auth:{persistSession:false,autoRefreshToken:false}})]){
   const direct=await client.from('pro_work_tasks').select('*').eq('owner_id',owner.id);expect(direct.error?.code).toBe('42501');
   const insert=await client.from('pro_work_tasks').insert({owner_id:owner.id,work_id:workId,id:crypto.randomUUID(),title:'DIRECT MUST NOT SAVE'});expect(insert.error?.code).toBe('42501');
   const rpc=await client.rpc('pro_work_tasks_mutate',{p_actor:owner.id,p_input:create});expect(rpc.error?.code).toBe('42501');
  }
  // Pagination is scoped to a second work and never includes the first task.
  const ids=Array.from({length:23},()=>crypto.randomUUID()).sort();
  await db.from('pro_work_tasks').insert(ids.map((taskId,index)=>({owner_id:owner.id,work_id:otherWorkId,id:taskId,title:'PAGE '+index,details:'',due_date:null,assignee:'',status:'open',archived:false,revision:1}))).throwOnError();
  const firstPage=await read(page,owner,otherWorkId);expect(firstPage.items).toHaveLength(20);expect(firstPage.nextCursor).not.toBeNull();expect(firstPage.counts).toEqual({open:23,done:0});
  const next=await page.request.get(api+'?'+new URLSearchParams({workId:otherWorkId,status:'all',after:firstPage.nextCursor!}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(next.status()).toBe(200);const last=await next.json() as WorkTasksPage;expect(last.items).toHaveLength(3);expect(last.nextCursor).toBeNull();expect(new Set([...firstPage.items,...last.items].map(task=>task.id))).toEqual(new Set(ids));
  const latest=await read(page,owner,workId);expect(latest.items).toHaveLength(1);expect(latest.items[0]).toMatchObject({id,title:'API local task edited',revision:2});
  const concurrent:WorkTaskMutation={...create,taskId:crypto.randomUUID(),actionId:crypto.randomUUID(),title:'CONCURRENT_CREATE'};
  const duplicate=await Promise.all([post(page,owner,concurrent),post(page,owner,concurrent)]);expect(duplicate.map(response=>response.status())).toEqual([200,200]);
  const duplicateBodies=await Promise.all(duplicate.map(response=>response.json()));expect(duplicateBodies[0]).toEqual(duplicateBodies[1]);
  const concurrentDetails=await page.request.get(api+'?'+new URLSearchParams({workId,taskId:concurrent.taskId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(concurrentDetails.status()).toBe(200);
  const createdDetails=await concurrentDetails.json() as WorkTaskDetail;expect(createdDetails.task.revision).toBe(1);expect(createdDetails.history).toHaveLength(1);expect(createdDetails.history[0].actionId).toBe(concurrent.actionId);
  const competing:Extract<WorkTaskMutation,{action:'update'}>[]=['WINNER_A','WINNER_B'].map(title=>({...concurrent,action:'update',actionId:crypto.randomUUID(),revision:1,title}));
  const competition=await Promise.all(competing.map(input=>post(page,owner,input)));expect(competition.map(response=>response.status()).sort()).toEqual([200,409]);
  const winningIndex=competition.findIndex(response=>response.status()===200),winner=await competition[winningIndex].json() as {task:WorkTask};expect(winner.task).toMatchObject({id:concurrent.taskId,title:competing[winningIndex].title,revision:2});
  const readTables=async()=>({tasks:(await db.from('pro_work_tasks').select('*').eq('owner_id',owner.id).order('id').throwOnError()).data,history:(await db.from('pro_work_task_history').select('*').eq('owner_id',owner.id).order('action_id').throwOnError()).data,actions:(await db.from('pro_work_task_actions').select('*').eq('actor_id',owner.id).order('action_id').throwOnError()).data});
  const rowsBeforeReads=await readTables();
  const afterCompetition=await read(page,owner,workId);expect(afterCompetition.items).toHaveLength(2);expect(afterCompetition.items.find(task=>task.id===concurrent.taskId)).toEqual(winner.task);
  const historyRead=await page.request.get(api+'?'+new URLSearchParams({workId,taskId:concurrent.taskId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(historyRead.status()).toBe(200);const finalDetails=await historyRead.json() as WorkTaskDetail;expect(finalDetails.history).toHaveLength(2);expect(finalDetails.history.map(row=>row.after.revision)).toEqual([2,1]);expect(finalDetails.history[0].after).toEqual(winner.task);expect(await readTables()).toEqual(rowsBeforeReads);
  const rewrite=await db.from('pro_work_task_history').update({action:'archive'}).eq('owner_id',owner.id).eq('action_id',concurrent.actionId);expect(rewrite.error?.code).toBe('23514');expect(await readTables()).toEqual(rowsBeforeReads);
  await db.from('pro_memberships').update({status:'inactive'}).eq('user_id',owner.id).throwOnError();
  expect((await page.request.get(api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(403);expect((await post(page,owner,{action:'complete',workId,taskId:id,actionId:crypto.randomUUID(),revision:2})).status()).toBe(403);
  await db.from('pro_memberships').update({status:'active'}).eq('user_id',owner.id).throwOnError();
  await db.from('profiles').update({is_disabled:true}).eq('id',owner.id).throwOnError();
  expect((await page.request.get(api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(403);
  expect((await post(page,owner,{action:'complete',workId,taskId:id,actionId:crypto.randomUUID(),revision:2})).status()).toBe(403);
 }finally{await page.goto('about:blank').catch(()=>{});await foreignContext.close();if(other)await cleanupDisposableAccount(other.owner);await cleanupDisposableAccount(owner);}
});
