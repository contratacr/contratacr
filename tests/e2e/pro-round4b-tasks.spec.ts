import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {randomBytes} from 'node:crypto';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';

// Round 4B items 3 and 4: task assignee chosen from the job's Team (legacy free text kept
// readable) and Gantt editing (create from the timeline, drag to move, drag the edge to
// resize, 409 on a stale plan, keyboard path to dates and dependencies).
const origin='http://127.0.0.1:3185',shots=process.env.ROUND4B_SHOTS_DIR;
const addDays=(day:string,n:number)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
async function signIn(context:BrowserContext,account:DisposableAccount){
 await stabilizeLocalProRuntime(context,origin);
 const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:origin,sameSite:'Lax' as const})))}});
 const signed=await auth.auth.signInWithPassword({email:account.email,password:account.password});expect(signed.error).toBeNull();
 for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
}
async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'r4b-tasks-owner'}),db=regressionAdminClient();
 try{
  const account=await db.auth.admin.getUserById(owner.id);
  expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();
  await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Tareas 4B',slug:'r4b-tasks-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  const document=emptyBusiness(),workId=crypto.randomUUID(),otherWorkId=crypto.randomUUID(),day=crTodayISO(),clientId='r4b-tasks-customer';
  document.clients=[{id:clientId,name:'Cliente tareas 4B',email:'',phone:'',notes:'',archived:false}];
  document.work=[workId,otherWorkId].map((id,index)=>({id,clientId,client:'Cliente tareas 4B',service:index?'Otro trabajo 4B':'Remodelación 4B',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T11:00:00-06:00',cancelled:false}));
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  await signIn(context,owner);
  expect((await context.request.get(origin+'/api/pro/access',{timeout:45000})).status()).toBe(200);
  for(const id of [workId,otherWorkId])expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({clientId,workId:id}),{timeout:45000})).status()).toBe(200);
  return{owner,db,workId,otherWorkId};
 }catch(error){await cleanupDisposableAccount(owner);throw error;}
}
const post=(context:BrowserContext,actor:DisposableAccount,path:string,data:Record<string,unknown>)=>context.request.post(origin+path,{headers:{Origin:origin,'X-Pro-Expected-Actor':actor.id},data});
async function grant(ownerContext:BrowserContext,owner:DisposableAccount,memberContext:BrowserContext,member:DisposableAccount,workId:string,role:'viewer'|'contributor'){
 const code=randomBytes(32).toString('hex');
 expect((await post(ownerContext,owner,'/api/pro/team',{action:'invite',actionId:crypto.randomUUID(),workId,email:member.email,role,code})).status()).toBe(200);
 const accepted=await post(memberContext,member,'/api/pro/team',{action:'accept',actionId:crypto.randomUUID(),code});expect(accepted.status()).toBe(200);
 return(await accepted.json()).grant as {id:string;displayName:string};
}
async function shot(page:Page,name:string){if(shots)await page.screenshot({path:`${shots}/tasks-${name}.png`,fullPage:false});}

for(const language of ['es','en'] as const)test(`Round 4B tasks: Team assignee and Gantt editing [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(420000);expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const en=language==='en',t=(es:string,english:string)=>en?english:es,mobile=info.project.name.includes('webkit');
 const f=await fixture(page.context()),members=await Promise.all(['r4b-contrib','r4b-viewer','r4b-other'].map(prefix=>createDisposableAccount({prefix}))),contexts=await Promise.all(members.map(()=>browser.newContext({baseURL})));
 try{
  for(let i=0;i<members.length;i++)await signIn(contexts[i],members[i]);
  const contributor=await grant(page.context(),f.owner,contexts[0],members[0],f.workId,'contributor'),viewer=await grant(page.context(),f.owner,contexts[1],members[1],f.workId,'viewer'),other=await grant(page.context(),f.owner,contexts[2],members[2],f.otherWorkId,'contributor');
  const legacyTask=crypto.randomUUID();
  await f.db.from('pro_work_tasks').insert({owner_id:f.owner.id,work_id:f.workId,id:legacyTask,title:'Instalar gabinetes 4B',details:'',assignee:'Don Mario (texto anterior)',due_date:null,status:'open',archived:false,revision:1}).throwOnError();

  // Guards: the assignee options are owner-only and bounded.
  const optionsUrl=origin+'/api/pro/work-tasks?'+new URLSearchParams({view:'assignees',workId:f.workId,tasks:legacyTask});
  expect((await contexts[0].request.get(optionsUrl,{headers:{'X-Pro-Expected-Actor':members[0].id}})).status()).toBe(403);
  expect((await page.context().request.get(origin+'/api/pro/work-tasks?'+new URLSearchParams({view:'assignees',workId:f.workId,tasks:Array.from({length:21},()=>crypto.randomUUID()).join(',')}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).status()).toBe(400);
  const options=await (await page.context().request.get(optionsUrl,{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json();
  expect(options.members.map((m:{grantId:string;canAssign:boolean})=>[m.grantId,m.canAssign]).sort()).toEqual([[contributor.id,true],[viewer.id,false]].sort());
  expect(options.others.map((o:{name:string})=>o.name)).toEqual([other.displayName]);expect(options.assignments).toEqual({});

  // 3. Assignee from the Team; the legacy text stays readable until the owner removes it.
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${f.workId}&vistaTrabajo=tasks`);
  const tasks=page.locator('[data-work-tasks]'),card=tasks.locator(`[data-work-task="${legacyTask}"]`);
  // Cold compiles of the shared dev server: setup budget only, product timeouts unchanged.
  await expect(card).toBeVisible({timeout:120000});
  await expect(card.locator('[data-work-task-legacy-assignee]')).toHaveText(t('Responsable anotado antes: ','Previously noted assignee: ')+'Don Mario (texto anterior)');
  await card.getByRole('button',{name:t('Editar','Edit'),exact:true}).click();
  const form=tasks.locator('[data-work-task-form]'),select=form.getByLabel(t('Responsable (opcional)','Assignee (optional)'),{exact:true});
  await expect(select).toBeEnabled();await expect(select).toHaveValue('');
  await expect(select.locator(`option[value="${contributor.id}"]`)).not.toHaveAttribute('disabled');
  await expect(select.locator(`option[value="${viewer.id}"]`)).toHaveAttribute('disabled','');await expect(select.locator(`option[value="${viewer.id}"]`)).toContainText(t('solo lectura','view only'));
  await expect(select.locator('option',{hasText:other.displayName})).toHaveAttribute('disabled','');
  await expect(form.locator('[data-work-task-legacy]')).toContainText('Don Mario (texto anterior)');
  await select.selectOption(contributor.id);
  await shot(page,`assignee-form-${language}-${mobile?'mobile':'desktop'}`);
  const assigned=page.waitForResponse(r=>r.url().endsWith('/api/pro/team')&&r.request().method()==='POST');
  await form.getByRole('button',{name:t('Guardar','Save'),exact:true}).click();expect((await assigned).status()).toBe(200);
  await expect(tasks.getByRole('status')).toHaveText(t('Responsable asignado.','Assignee set.'));
  await expect(card.locator('[data-work-task-assignee]')).toHaveText(t('Responsable: ','Assignee: ')+contributor.displayName);
  await expect(card.locator('[data-work-task-legacy-assignee]')).toContainText('Don Mario (texto anterior)');
  let row=(await f.db.from('pro_work_tasks').select('assignee,revision').eq('owner_id',f.owner.id).eq('id',legacyTask).single()).data!;
  expect(row).toEqual({assignee:'Don Mario (texto anterior)',revision:2});
  expect((await f.db.from('pro_team_task_assignments').select('grant_id').eq('owner_id',f.owner.id).eq('task_id',legacyTask).single()).data!.grant_id).toBe(contributor.id);
  await expectNoHorizontalOverflow(page);await shot(page,`assignee-list-${language}-${mobile?'mobile':'desktop'}`);
  // Removing the legacy text and changing the title saves the task, then keeps the same assignee.
  await card.getByRole('button',{name:t('Editar','Edit'),exact:true}).click();
  await expect(select).toHaveValue(contributor.id);
  await form.getByRole('button',{name:t('Quitar texto anterior','Remove previous text'),exact:true}).click();
  await form.getByLabel(t('Tarea','Task'),{exact:true}).fill('Instalar gabinetes 4B (cocina)');
  await form.getByRole('button',{name:t('Guardar','Save'),exact:true}).click();
  await expect(tasks.getByRole('status')).toHaveText(t('Tarea guardada.','Task saved.'));
  await expect(card.locator('[data-work-task-legacy-assignee]')).toHaveCount(0);
  await expect(card.locator('[data-work-task-assignee]')).toHaveText(t('Responsable: ','Assignee: ')+contributor.displayName);
  row=(await f.db.from('pro_work_tasks').select('assignee,revision').eq('owner_id',f.owner.id).eq('id',legacyTask).single()).data!;expect(row).toEqual({assignee:'',revision:3});
  // "No assignee" removes the real assignment.
  await card.getByRole('button',{name:t('Editar','Edit'),exact:true}).click();await select.selectOption('');
  await form.getByRole('button',{name:t('Guardar','Save'),exact:true}).click();
  await expect(tasks.getByRole('status')).toHaveText(t('Responsable quitado.','Assignee removed.'));
  await expect(card.locator('[data-work-task-assignee]')).toHaveCount(0);
  expect((await f.db.from('pro_team_task_assignments').select('grant_id').eq('owner_id',f.owner.id).eq('task_id',legacyTask)).data).toEqual([]);

  // 4. Gantt: create from the timeline, drag to move, drag the edge to resize.
  const today=crTodayISO();
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${f.workId}&vistaTrabajo=tasks&vistaTareas=plan`);
  const plan=page.locator('[data-work-plan]'),details=plan.locator('[data-work-timeline-details]'),chart=details.locator('[data-work-timeline]');
  await expect(details).toBeVisible({timeout:120000});
  await expect(details.locator('summary')).toHaveAttribute('aria-disabled','false');await details.locator('summary').click();
  await expect(chart).toHaveAttribute('aria-busy','false');
  await chart.locator('[data-work-timeline-create]').click();
  const dialog=page.getByRole('dialog',{name:t('Nueva tarea en el cronograma','New task in timeline')});
  await dialog.getByLabel(t('Tarea','Task'),{exact:true}).fill('Demolición 4B');
  await expect(dialog.getByLabel(t('Inicio previsto','Planned start'),{exact:true})).toHaveValue(today);
  await dialog.getByLabel(t('Final previsto','Planned finish'),{exact:true}).fill(addDays(today,2));
  await shot(page,`gantt-create-${language}-${mobile?'mobile':'desktop'}`);
  const created=page.waitForResponse(r=>r.url().endsWith('/api/pro/work-schedule')&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:t('Crear tarea','Create task'),exact:true}).click();expect((await created).status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  const createdTask=(await f.db.from('pro_work_tasks').select('id,title,assignee,due_date').eq('owner_id',f.owner.id).eq('work_id',f.workId).eq('title','Demolición 4B').single()).data!;
  expect(createdTask).toMatchObject({assignee:'',due_date:null});
  const planRow=async()=>(await f.db.from('pro_work_schedule_plans').select('planned_start,planned_end').eq('owner_id',f.owner.id).eq('task_id',createdTask.id).single()).data;
  expect(await planRow()).toEqual({planned_start:today,planned_end:addDays(today,2)});
  const entry=chart.locator(`[data-work-timeline-entry="task:${createdTask.id}"]`),bar=entry.locator('[data-work-timeline-bar]');
  await expect(bar).toBeVisible();expect(await bar.evaluate(e=>(e as HTMLElement).style.width)).toBe('96px');
  await expect(plan.locator(`[data-work-plan-task="${createdTask.id}"]`)).toBeVisible();
  async function drag(target:ReturnType<typeof page.locator>,fromX:(box:{x:number;width:number})=>number,dx:number){
   await expect(bar).toHaveAttribute('data-work-timeline-drag-ready','true');
   await target.scrollIntoViewIfNeeded();const box=(await target.boundingBox())!;const y=box.y+box.height/2,x=fromX(box);
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx/2,y,{steps:4});await page.mouse.move(x+dx,y,{steps:4});await page.mouse.up();
  }
  // A stale plan (revision bumped elsewhere) is refused with 409 and nothing changes.
  const state=await (await page.context().request.get(origin+'/api/pro/work-schedule?'+new URLSearchParams({workId:f.workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json();
  expect((await post(page.context(),f.owner,'/api/pro/work-schedule',{action:'phase_save',actionId:crypto.randomUUID(),workId:f.workId,revision:state.revision,phaseId:crypto.randomUUID(),title:'Fase 4B',position:0})).status()).toBe(200);
  let write=page.waitForResponse(r=>r.url().endsWith('/api/pro/work-schedule')&&r.request().method()==='POST');
  await drag(bar,box=>box.x+box.width/2,64);expect((await write).status()).toBe(409);
  await expect(plan.getByRole('alert').first()).toContainText(t('El plan cambió','The plan changed'));
  expect(await planRow()).toEqual({planned_start:today,planned_end:addDays(today,2)});
  await expect(chart).toHaveAttribute('aria-busy','false');
  await expect.poll(()=>bar.evaluate(e=>(e as HTMLElement).style.left)).toBe('0px');
  // Move by two days, then widen by one day from the right edge.
  write=page.waitForResponse(r=>r.url().endsWith('/api/pro/work-schedule')&&r.request().method()==='POST');
  await drag(bar,box=>box.x+box.width/2,64);expect((await write).status()).toBe(200);
  await expect.poll(planRow).toEqual({planned_start:addDays(today,2),planned_end:addDays(today,4)});
  await expect.poll(()=>bar.evaluate(e=>(e as HTMLElement).style.left)).toBe('64px');
  write=page.waitForResponse(r=>r.url().endsWith('/api/pro/work-schedule')&&r.request().method()==='POST');
  await drag(bar.locator('[data-work-timeline-resize="end"]'),box=>box.x+box.width/2,32);expect((await write).status()).toBe(200);
  await expect.poll(planRow).toEqual({planned_start:addDays(today,2),planned_end:addDays(today,5)});
  await expect.poll(()=>bar.evaluate(e=>(e as HTMLElement).style.width)).toBe('128px');
  // The move kept the phase/dependency fields (none) and wrote exactly one task_plan per drop.
  await expect(bar).toHaveAttribute('data-work-timeline-drag-ready','true');await expect(plan.locator('[data-work-plan-recovery]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);await shot(page,`gantt-dragged-${language}-${mobile?'mobile':'desktop'}`);
  // Keyboard path: each bar row opens the plan editor with its dates and dependencies.
  await expect(bar).toHaveAttribute('data-work-timeline-drag-ready','true');await expect(entry.locator('[data-work-timeline-dates]')).toContainText(new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(addDays(today,5)+'T12:00:00Z')));
  const row4b=entry;await row4b.focus();await row4b.press('Enter');
  const planForm=plan.locator('[data-work-plan-form]');
  await expect(planForm.getByLabel(t('Inicio previsto','Planned start'),{exact:true})).toHaveValue(addDays(today,2));
  await expect(planForm.getByLabel(t('Final previsto','Planned finish'),{exact:true})).toHaveValue(addDays(today,5));
  await planForm.locator('[data-work-plan-dependencies] summary').click();
  await planForm.getByRole('button',{name:'Instalar gabinetes 4B (cocina)',exact:true}).click();
  await planForm.getByRole('button',{name:t('Guardar','Save'),exact:true}).click();
  await expect(planForm).toHaveCount(0);
  expect((await f.db.from('pro_work_schedule_dependencies').select('predecessor_id').eq('owner_id',f.owner.id).eq('task_id',createdTask.id)).data).toEqual([{predecessor_id:legacyTask}]);
  await expect(details.locator('summary')).toHaveAttribute('aria-disabled','false'); await details.locator('summary').click();await expect(chart).toHaveAttribute('aria-busy','false');
  await expect(entry.locator('[data-work-timeline-dependencies]')).toHaveText(t('Después de: ','After: ')+'Instalar gabinetes 4B (cocina)');
  await expect(entry.locator('[data-work-timeline-dates]')).toContainText(new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(addDays(today,2)+'T12:00:00Z')));
  await entry.scrollIntoViewIfNeeded();
  await shot(page,`gantt-dependency-${language}-${mobile?'mobile':'desktop'}`);
  // Only the created task has a plan row (the stale drop wrote nothing).
  expect(await f.db.from('pro_work_schedule_plans').select('task_id').eq('owner_id',f.owner.id).eq('work_id',f.workId).then(r=>r.data!.length)).toBe(1);
 }finally{for(const context of contexts)await context.close();for(const member of members)await cleanupDisposableAccount(member);await cleanupDisposableAccount(f.owner);}
});
