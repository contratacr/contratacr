import {test,expect,type Locator,type Page,type BrowserContext} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {newCompanyInviteCode} from '../../src/lib/pro/team-roles';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError,warmLocalRoutes} from './helpers';
import type {Gantt} from '../../src/lib/pro/project-schedule';

// Gap 13 (Houzz parity walkthrough 3, 2026-11-17): the job Gantt (Trabajo › Cronograma) is editable —
// create a task (with assignee) and a phase, drag a bar (mouse and touch) and its edge, keyboard
// alternative, finish-to-start warning with explicit confirmation, one-step undo, assignee filter,
// CAS conflict (409 → «Recargar», nothing overwritten) and a company read-only member without
// editing affordances. Disposable accounts, loopback only; nothing is sent.
const shots=join(tmpdir(),'ccr-gaps-shots');
const scheduleApi='/api/pro/project-schedule',planApi='/api/pro/work-schedule',tasksApi='/api/pro/work-tasks',teamApi='/api/pro/team';
const shift=(iso:string,days:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const DAY=32;// «Días» scale

/** Puts a bar right of the sticky name column and in the middle of the viewport (instant scroll), then waits until it stops moving. */
async function reveal(bar:Locator){
 await bar.evaluate(el=>{el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});const box=el.closest('[data-schedule-gantt]') as HTMLElement;box.scrollTo({left:Math.max(0,(el as HTMLElement).offsetLeft-24),behavior:'instant'});});
 let last='';for(let i=0;i<20;i++){const b=await bar.boundingBox();const now=JSON.stringify(b);if(b&&now===last)return;last=now;await bar.page().waitForTimeout(100);}
}
async function mouseDrag(page:Page,handle:Locator,days:number){
 const box=(await handle.boundingBox())!;const x=box.x+box.width/2,y=box.y+box.height/2;
 await page.mouse.move(x,y);await page.mouse.down();for(let i=1;i<=4;i++)await page.mouse.move(x+days*DAY*i/4,y);await page.mouse.up();
}
/** Touch drag through real PointerEvents with pointerType «touch» (same handlers as a finger). */
async function touchDrag(handle:Locator,days:number){
 const box=(await handle.boundingBox())!;const x=box.x+box.width/2,y=box.y+box.height/2,base={pointerId:41,pointerType:'touch',isPrimary:true,bubbles:true,cancelable:true,composed:true,clientY:y};
 await handle.dispatchEvent('pointerdown',{...base,button:0,buttons:1,clientX:x});
 await handle.dispatchEvent('pointermove',{...base,button:-1,buttons:1,clientX:x+days*DAY/2});
 await handle.dispatchEvent('pointermove',{...base,button:-1,buttons:1,clientX:x+days*DAY});
 await handle.dispatchEvent('pointerup',{...base,button:0,buttons:0,clientX:x+days*DAY});
}

/** Opens the job schedule; a cold «No se pudo comprobar el acceso a Pro» gets its own Retry (as in round 7C). */
async function openSchedule(page:Page,path:string,en:boolean){
 await gotoOK(page,path);
 const failed=page.getByText(en?'Could not verify Pro access. Your data is preserved.':'No se pudo comprobar el acceso a Pro. Sus datos se conservan.'),ready=page.locator('[data-project-schedule]');
 for(let i=0;i<3;i++){await expect(failed.or(ready).first()).toBeVisible({timeout:120000});if(!await failed.isVisible())break;await page.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();}
 await expect(ready).toBeVisible({timeout:120000});return ready;
}

for(const language of ['es','en'] as const)test(`Editable Gantt: create, drag, resize, keyboard, dependency, undo, filter, conflict and read-only [${language}]`,async({page,browser},info)=>{
 test.setTimeout(900000);local(info.project.use.baseURL);const en=language==='en',tr=(es:string,english:string)=>en?english:es,label=language+randomBytes(3).toString('hex');
 if(!info.project.use.isMobile)await page.setViewportSize({width:1440,height:900});
 const f=await ownerFixture(page.context(),label),{owner,workId}=f,today=crTodayISO(),accounts:DisposableAccount[]=[],contexts:BrowserContext[]=[];
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const gantt=async()=>{const r=await page.request.get(origin+scheduleApi+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id},timeout:120000});expect(r.status()).toBe(200);return await r.json() as Gantt;};
  const post=async(url:string,data:Record<string,unknown>,context=page.context(),status=200)=>{const r=await context.request.post(origin+url,{headers:context===page.context()?headers:{Origin:origin},data,timeout:120000});expect(r.status(),url+' '+await r.text()).toBe(status);return await r.json();};
  const plan=async(data:Record<string,unknown>)=>post(planApi,{actionId:crypto.randomUUID(),workId,revision:(await gantt()).revision,...data});
  const newTask=async(title:string)=>((await post(tasksApi,{action:'create',workId,taskId:crypto.randomUUID(),actionId:crypto.randomUUID(),revision:0,title,details:'',dueDate:null,assignee:''})).task as {id:string;revision:number});
  const dates=async(id:string)=>{const t=(await gantt()).tasks.find(x=>x.id===id);return t?[t.plannedStart,t.plannedEnd]:null;};

  // ---- Seed: phase, A → B (finish-to-start), C free; a Team contributor assigned to A. ----
  const phase=crypto.randomUUID(),A=await newTask(tr('Demolición ','Demolition ')+label),B=await newTask(tr('Repello ','Plaster ')+label),C=await newTask(tr('Pintura ','Painting ')+label);
  await plan({action:'phase_save',phaseId:phase,title:tr('Obra gris ','Shell ')+label,position:0});
  await plan({action:'task_plan',taskId:A.id,phaseId:phase,plannedStart:shift(today,-2),plannedEnd:shift(today,1),dependsOn:[]});
  await plan({action:'task_plan',taskId:B.id,phaseId:phase,plannedStart:shift(today,2),plannedEnd:shift(today,4),dependsOn:[A.id]});
  await plan({action:'task_plan',taskId:C.id,phaseId:null,plannedStart:today,plannedEnd:shift(today,1),dependsOn:[]});
  const worker=await createDisposableAccount({prefix:'gantt-worker'});accounts.push(worker);const workerContext=await browser.newContext({baseURL:origin});contexts.push(workerContext);await login(workerContext,worker);
  const teamCode=randomBytes(32).toString('hex');
  await post(teamApi,{action:'invite',actionId:crypto.randomUUID(),workId,email:worker.email,role:'contributor',code:teamCode});
  const grant=(await post(teamApi,{action:'accept',actionId:crypto.randomUUID(),code:teamCode},workerContext)).grant as {id:string;displayName:string};
  await post(teamApi,{action:'assign',actionId:crypto.randomUUID(),workId,taskId:A.id,revision:A.revision,assigneeGrantId:grant.id});

  const view=`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'schedule'});
  await warmLocalRoutes(page,[view,scheduleApi+'?workId='+workId,tasksApi+'?view=assignees&workId='+workId+'&tasks='+A.id]);
  const section=await openSchedule(page,view,en);
  await expect(section).toHaveAttribute('data-gantt-editable','true');
  if(info.project.use.isMobile)await section.locator('[data-schedule-mode="gantt"]').click();
  const chart=section.locator('[data-schedule-gantt]');await expect(chart).toBeVisible();await expect(chart.locator('[data-schedule-bar]')).toHaveCount(3);
  const settled=()=>expect(section).toHaveAttribute('data-gantt-busy','false',{timeout:60000}),notice=section.locator('[data-gantt-notice]'),undo=section.locator('[data-gantt-undo]'),bar=(id:string)=>chart.locator(`[data-schedule-bar="${id}"]`);
  await expect(section.locator('[data-gantt-help]')).toContainText(tr('Mayús+← →','Shift+← →'));

  // (1) Create a phase from the Gantt, then undo it (phase_archive through the same API).
  await section.locator('[data-gantt-new="phase"]').click();
  const phaseForm=section.locator('[data-gantt-create="phase"]');await expect(phaseForm).toContainText(tr('sus fechas se calculan con las tareas','its dates come from the tasks'));
  await phaseForm.locator('[data-gantt-create-field="title"]').fill(tr('Acabados ','Finishes ')+label);await phaseForm.locator('[data-gantt-create-submit]').click();
  await expect(notice).toContainText(tr('Fase creada: Acabados ','Phase created: Finishes ')+label,{timeout:60000});await settled();
  await expect(chart.locator('[data-gantt-phase-label]').filter({hasText:tr('Acabados ','Finishes ')+label})).toHaveCount(1);
  await expect(undo).toBeEnabled();await undo.click();await expect(notice).toContainText(tr('Cambio deshecho.','Change undone.'),{timeout:60000});await settled();
  await expect.poll(async()=>(await gantt()).phases.map(p=>p.title)).toEqual([tr('Obra gris ','Shell ')+label]);
  await expect(chart.locator('[data-gantt-phase-label]').filter({hasText:tr('Acabados ','Finishes ')+label})).toHaveCount(0);

  // (2) Create a task with dates and an assignee (timeline_task_create + Team assignment).
  await section.locator('[data-gantt-new="task"]').click();
  const taskForm=section.locator('[data-gantt-create="task"]');const newTitle=tr('Instalar muebles ','Install cabinets ')+label;
  await taskForm.locator('[data-gantt-create-field="title"]').fill(newTitle);
  await taskForm.locator('[data-gantt-create-field="start"]').fill(shift(today,1));await taskForm.locator('[data-gantt-create-field="end"]').fill(shift(today,3));
  await taskForm.locator('[data-gantt-create-field="phase"]').selectOption(phase);
  await expect(taskForm.locator(`[data-gantt-create-field="assignee"] option[value="${grant.id}"]`)).toHaveCount(1,{timeout:60000});
  await taskForm.locator('[data-gantt-create-field="assignee"]').selectOption(grant.id);
  await taskForm.locator('[data-gantt-create-submit]').click();
  await expect(notice).toContainText(tr('Tarea creada: ','Task created: ')+newTitle,{timeout:60000});await settled();
  const created=(await gantt()).tasks.find(t=>t.title===newTitle)!;expect(created).toMatchObject({plannedStart:shift(today,1),plannedEnd:shift(today,3),phaseId:phase,dependsOn:[]});
  const assignees=await (await page.request.get(origin+tasksApi+'?'+new URLSearchParams({view:'assignees',workId,tasks:created.id}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json();expect(assignees.assignments[created.id].grantId).toBe(grant.id);
  await expect(chart.locator('[data-schedule-bar]')).toHaveCount(4);

  // (3) Mouse drag moves C two days; «Deshacer» writes the previous dates back with the new revision.
  const before=await dates(C.id);expect(before).toEqual([today,shift(today,1)]);
  await reveal(bar(C.id));await mouseDrag(page,bar(C.id),2);
  await expect.poll(()=>dates(C.id),{timeout:60000}).toEqual([shift(today,2),shift(today,3)]);await settled();
  await expect(bar(C.id)).toHaveAttribute('data-gantt-bar-start',shift(today,2));
  await expect(undo).toBeEnabled({timeout:60000});const revisionBeforeUndo=(await gantt()).revision;await undo.click();
  await expect(notice).toContainText(tr('Cambio deshecho.','Change undone.'),{timeout:60000});
  await expect.poll(()=>dates(C.id),{timeout:60000}).toEqual(before);await settled();expect((await gantt()).revision).toBe(revisionBeforeUndo+1);await settled();await expect(undo).toBeDisabled();

  // (4) Edge resize with the mouse (end +1) and a touch drag of the whole bar (−1).
  await reveal(bar(C.id));await mouseDrag(page,bar(C.id).locator('[data-gantt-resize="end"]'),1);
  await expect.poll(()=>dates(C.id),{timeout:60000}).toEqual([today,shift(today,2)]);await settled();
  await expect(bar(C.id)).toHaveAttribute('data-gantt-bar-end',shift(today,2),{timeout:60000});
  await reveal(bar(C.id));await touchDrag(bar(C.id),-1);
  await expect.poll(()=>dates(C.id),{timeout:60000}).toEqual([shift(today,-1),shift(today,1)]);await settled();
  await expect(bar(C.id)).toHaveAttribute('data-gantt-bar-start',shift(today,-1),{timeout:60000});

  // (5) Keyboard alternative: → moves one day, Shift+← shortens the end, Alt+→ moves the start.
  await bar(C.id).focus();await page.keyboard.press('ArrowRight');
  await expect.poll(()=>dates(C.id),{timeout:60000}).toEqual([today,shift(today,2)]);await settled();
  await expect(bar(C.id)).toHaveAttribute('data-gantt-bar-start',today,{timeout:60000});await expect(bar(C.id)).toBeFocused();
  await page.keyboard.press('Shift+ArrowLeft');await expect.poll(()=>dates(C.id),{timeout:60000}).toEqual([today,shift(today,1)]);await settled();
  await expect(bar(C.id)).toHaveAttribute('data-gantt-bar-end',shift(today,1),{timeout:60000});
  await page.keyboard.press('Alt+ArrowRight');await expect.poll(()=>dates(C.id),{timeout:60000}).toEqual([shift(today,1),shift(today,1)]);await settled();
  await expect(bar(C.id)).toHaveAttribute('data-gantt-bar-start',shift(today,1),{timeout:60000});
  // The visible date fields stay available: Enter opens the form with both dates.
  await page.keyboard.press('Enter');const form=section.locator('[data-schedule-editor="task"]');await expect(form.locator('[data-schedule-field="start"]')).toHaveValue(shift(today,1));await form.getByRole('button',{name:tr('Cancelar','Cancel'),exact:true}).click();

  // (6) Dependency rule: moving B to start on A's last day asks for confirmation; cancelling keeps the old dates.
  await reveal(bar(B.id));await bar(B.id).focus();await page.keyboard.press('ArrowLeft');
  const warning=section.locator('[data-gantt-dependency-warning]');await expect(warning).toBeVisible();
  await expect(warning).toContainText(tr(`"${tr('Repello ','Plaster ')+label}" empezaría antes de que termine "${tr('Demolición ','Demolition ')+label}".`,`"Plaster ${label}" would start before "Demolition ${label}" ends.`));
  await expect(chart.locator('[data-schedule-dependency="conflict"]')).toHaveCount(1);
  mkdirSync(shots,{recursive:true});const width=page.viewportSize()!.width;await expectNoHorizontalOverflow(page);
  await section.screenshot({path:`${shots}/gantt-${language}-${width}.png`});
  await warning.locator('[data-gantt-dependency-cancel]').click();await expect(warning).toHaveCount(0);
  await expect(bar(B.id)).toHaveAttribute('data-gantt-bar-start',shift(today,2));expect(await dates(B.id)).toEqual([shift(today,2),shift(today,4)]);
  await bar(B.id).focus();await page.keyboard.press('ArrowLeft');await warning.locator('[data-gantt-dependency-confirm]').click();
  await expect.poll(()=>dates(B.id),{timeout:60000}).toEqual([shift(today,1),shift(today,3)]);await settled();
  await expect(chart.locator('[data-schedule-dependency="conflict"]')).toHaveCount(1,{timeout:60000});

  // (7) Assignee filter: Todos / the Team member / Sin asignar.
  const filter=section.locator('[data-gantt-assignee-filter]');await expect(filter.locator(`option[value="${grant.id}"]`)).toHaveCount(1,{timeout:60000});
  await filter.selectOption(grant.id);await expect(chart.locator('[data-schedule-bar]')).toHaveCount(2);await expect(bar(A.id)).toHaveCount(1);await expect(bar(created.id)).toHaveCount(1);
  await filter.selectOption('__none');await expect(chart.locator('[data-schedule-bar]')).toHaveCount(2);await expect(bar(B.id)).toHaveCount(1);await expect(bar(C.id)).toHaveCount(1);
  await expect(filter.locator('option').nth(1)).toHaveText(tr('Sin asignar','Unassigned'));
  await filter.selectOption('');await expect(chart.locator('[data-schedule-bar]')).toHaveCount(4);

  // (8) CAS: another window changes the plan; the next drag gets 409, shows «Recargar» and overwrites nothing.
  await plan({action:'milestone_save',milestoneId:crypto.randomUUID(),title:tr('Entrega ','Handover ')+label,date:shift(today,6),notes:''});
  const beforeConflict=await dates(C.id);
  await reveal(bar(C.id));await bar(C.id).focus();await page.keyboard.press('ArrowRight');
  const alert=section.locator('[data-gantt-error]');await expect(alert).toContainText(tr('El plan cambió en otra ventana. Recárguelo antes de volver a guardar.','The plan changed in another window. Reload it before saving again.'),{timeout:60000});
  expect(await dates(C.id)).toEqual(beforeConflict);await expect(bar(C.id)).toHaveAttribute('data-gantt-bar-start',beforeConflict![0]!);
  await alert.locator('[data-gantt-reload]').click();await expect(alert).toHaveCount(0);await expect(chart.locator('[data-schedule-milestone]')).toHaveCount(1,{timeout:60000});
  await reveal(bar(C.id));await bar(C.id).focus();await page.keyboard.press('ArrowRight');await expect.poll(()=>dates(C.id),{timeout:60000}).toEqual([shift(beforeConflict![0]!,1),shift(beforeConflict![1]!,1)]);await settled();

  // (9) A company read-only member sees the Gantt without any editing affordance.
  const reader=await createDisposableAccount({prefix:'gantt-reader'});accounts.push(reader);
  const readerContext=await browser.newContext({baseURL:origin,viewport:page.viewportSize()??undefined,isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,userAgent:info.project.use.userAgent});contexts.push(readerContext);await login(readerContext,reader);
  const code=newCompanyInviteCode();
  await post('/api/pro/team-roles',{action:'invite',actionId:crypto.randomUUID(),email:reader.email,role:'read_only',code,locale:language});
  await post('/api/pro/team-roles',{action:'accept',actionId:crypto.randomUUID(),code},readerContext);
  await post('/api/pro/team-roles',{action:'enter',ownerId:owner.id},readerContext);
  const readerPage=await readerContext.newPage();const readerSection=await openSchedule(readerPage,view,en);
  await expect(readerSection).toHaveAttribute('data-gantt-editable','false',{timeout:60000});
  if(info.project.use.isMobile)await readerSection.locator('[data-schedule-mode="gantt"]').click();
  const readerChart=readerSection.locator('[data-schedule-gantt]');await expect(readerChart.locator('[data-schedule-bar]')).toHaveCount(4);
  for(const selector of ['[data-gantt-new]','[data-gantt-undo]','[data-gantt-draggable]','[data-gantt-resize]','[data-gantt-help]','[data-schedule-baseline-open]','button[data-schedule-task-label]','button[data-schedule-milestone]'])await expect(readerSection.locator(selector),selector).toHaveCount(0);
  await expect(readerSection).toContainText(tr('Solo lectura','Read-only'));
  const readerBefore=await dates(C.id);await readerChart.locator(`[data-schedule-bar="${C.id}"]`).click({force:true});await expect(readerSection.locator('[data-schedule-editor]')).toHaveCount(0);expect(await dates(C.id)).toEqual(readerBefore);
  await expectNoHorizontalOverflow(readerPage);
  expect(runtime).toEqual([]);
 }finally{for(const context of contexts)await context.close().catch(()=>{});for(const account of accounts)await cleanupDisposableAccount(account).catch(()=>{});await f.cleanup();}
});
