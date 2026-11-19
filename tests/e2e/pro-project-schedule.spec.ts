import {test,expect,type BrowserContext} from 'playwright/test';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {fixture,local,login,origin,setSections,shiftDay,uploadPhoto,uuid} from './pro-schedule-time-fixture';
import type {Gantt,ClientSchedule} from '../../src/lib/pro/project-schedule';
import type {Punchlist,ClientPunchlist} from '../../src/lib/pro/work-punchlist';

// Families 13/15/79: project schedule (Gantt, baseline, deviation, customer view)
// and punch list (photo, completion counter, customer view). Local only.
const api='/api/pro/project-schedule',plan='/api/pro/work-schedule',tasksApi='/api/pro/work-tasks',punchApi='/api/pro/work-punchlist';

for(const language of ['es','en'] as const)test(`Project schedule and punch list: API, baseline, sharing and UI [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(480000);local(baseURL);const en=language==='en',f=await fixture(page.context(),'sched',3),{owner,client,rival,db}=f,[workId,uiWorkId,emptyWorkId]=f.works,[requestId,uiRequestId]=f.requests;let customer:BrowserContext|undefined,other:BrowserContext|undefined;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const notices=async()=>{const out:Record<string,unknown>={};for(const table of ['notifications','notification_push_outbox'])out[table]=(await db.from(table).select('*').in('user_id',[owner.id,client.id]).order('id').throwOnError()).data;return out;};const noticesBefore=await notices();
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id},today=crTodayISO();
  const gantt=async(id=workId)=>{const r=await page.request.get(origin+api+'?'+new URLSearchParams({workId:id}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as Gantt;};
  const post=async(url:string,data:Record<string,unknown>,status=200)=>{const r=await page.request.post(origin+url,{headers,data});expect(r.status(),url+' '+JSON.stringify(data)+' '+await r.text()).toBe(status);return status===200?await r.json():null;};
  const newTask=async(id:string,title:string,details='')=>(await post(tasksApi,{action:'create',workId:id,taskId:uuid(),actionId:uuid(),revision:0,title,details,dueDate:null,assignee:''})).task as {id:string};
  const schedule=async(id:string,data:Record<string,unknown>)=>{const rev=(await gantt(id)).revision;return post(plan,{actionId:uuid(),workId:id,revision:rev,...data});};
  const seed=async(id:string,titles:{phase:string;a:string;b:string;c:string;milestone:string})=>{
   const phase=uuid(),milestone=uuid();
   await schedule(id,{action:'phase_save',phaseId:phase,title:titles.phase,position:0});
   const a=await newTask(id,titles.a,'NOTA_INTERNA_TAREA'),b=await newTask(id,titles.b),c=await newTask(id,titles.c);
   await schedule(id,{action:'task_plan',taskId:a.id,phaseId:phase,plannedStart:shiftDay(today,-3),plannedEnd:shiftDay(today,2),dependsOn:[]});
   await schedule(id,{action:'task_plan',taskId:b.id,phaseId:phase,plannedStart:shiftDay(today,3),plannedEnd:shiftDay(today,8),dependsOn:[a.id]});
   await schedule(id,{action:'milestone_save',milestoneId:milestone,title:titles.milestone,date:shiftDay(today,10),notes:'NOTA_HITO'});
   return {phase,milestone,a,b,c};
  };

  // ---- Gantt read: empty, validation, isolation ----
  const empty=await gantt();expect(empty).toMatchObject({workId,revision:0,today,baseline:null,baselines:[],tasks:[],phases:[],milestones:[],showSchedule:false,endVarianceDays:null});
  for(const query of ['workId='+workId+'&x=1','workId='+workId+'&workId='+workId,'requestId=no-uuid',''])expect((await page.request.get(origin+api+'?'+query,{headers:{'X-Pro-Expected-Actor':owner.id}})).status(),query).toBe(400);
  expect((await page.request.get(origin+api+'?'+new URLSearchParams({workId:'missing-'+uuid()}),{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(404);
  expect((await page.request.get(origin+api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(403);

  const s=await seed(workId,{phase:'Obra gris',a:'Demolición',b:'Repello',c:'Tarea sin fechas',milestone:'Entrega de llaves'});
  let g=await gantt();
  expect(g.revision).toBe(4);expect(g.phases).toEqual([expect.objectContaining({id:s.phase,title:'Obra gris',plannedStart:shiftDay(today,-3),plannedEnd:shiftDay(today,8),taskCount:2,doneCount:0,baselineStart:null,endVarianceDays:null})]);
  expect(g.tasks.find(t=>t.id===s.b.id)).toMatchObject({phaseId:s.phase,dependsOn:[s.a.id],plannedStart:shiftDay(today,3),plannedEnd:shiftDay(today,8),baselineEnd:null,endVarianceDays:null});
  expect(g.tasks.find(t=>t.id===s.c.id)).toMatchObject({plannedStart:null,plannedEnd:null});
  expect(g).toMatchObject({plannedStart:shiftDay(today,-3),plannedEnd:shiftDay(today,8)});
  expect(g.milestones).toEqual([expect.objectContaining({id:s.milestone,date:shiftDay(today,10),baselineDate:null,varianceDays:null})]);

  // ---- Baseline: validation, 409, idempotency, immutability ----
  const baselineInput={action:'baseline_save',actionId:uuid(),workId,revision:g.revision,title:'Línea base inicial'};
  await post(api,{...baselineInput,revision:g.revision-1},409);
  await post(api,{...baselineInput,title:'   '},400);
  await post(api,{...baselineInput,extra:true},400);
  const first=await post(api,baselineInput);expect(first.baseline).toMatchObject({title:'Línea base inicial',scheduleRevision:4,taskCount:2,milestoneCount:1});
  expect(await post(api,baselineInput)).toEqual(first);
  await post(api,{...baselineInput,title:'Otro nombre'},400);
  await post(api,{action:'baseline_save',actionId:uuid(),workId:emptyWorkId,revision:0,title:'Vacía'},400);// nothing to capture
  const items=(await db.from('pro_work_schedule_baseline_items').select('*').eq('owner_id',owner.id).eq('baseline_id',first.baseline.id).order('planned_start').throwOnError()).data!;
  expect(items.map(i=>[i.kind,i.planned_start,i.planned_end])).toEqual([['task',shiftDay(today,-3),shiftDay(today,2)],['task',shiftDay(today,3),shiftDay(today,8)],['milestone',shiftDay(today,10),shiftDay(today,10)]]);
  expect((await db.from('pro_work_schedule_baseline_items').update({planned_end:today}).eq('owner_id',owner.id).eq('baseline_id',first.baseline.id)).error?.message).toContain('immutable');
  expect((await db.from('pro_work_schedule_baselines').delete().eq('owner_id',owner.id).eq('id',first.baseline.id)).error?.message).toContain('immutable');
  expect((await db.from('pro_work_schedule_baseline_actions').update({result:{}}).eq('actor_id',owner.id)).error?.message).toContain('immutable');

  // ---- Deviation after re-planning ----
  await schedule(workId,{action:'task_plan',taskId:s.b.id,phaseId:s.phase,plannedStart:shiftDay(today,4),plannedEnd:shiftDay(today,11),dependsOn:[s.a.id]});
  await schedule(workId,{action:'milestone_save',milestoneId:s.milestone,title:'Entrega de llaves',date:shiftDay(today,8),notes:'NOTA_HITO'});
  await schedule(workId,{action:'task_plan',taskId:s.c.id,phaseId:null,plannedStart:today,plannedEnd:today,dependsOn:[]});
  g=await gantt();
  expect(g.baseline?.id).toBe(first.baseline.id);
  expect(g.tasks.find(t=>t.id===s.b.id)).toMatchObject({baselineStart:shiftDay(today,3),baselineEnd:shiftDay(today,8),startVarianceDays:1,endVarianceDays:3});
  expect(g.tasks.find(t=>t.id===s.a.id)).toMatchObject({startVarianceDays:0,endVarianceDays:0});
  expect(g.tasks.find(t=>t.id===s.c.id)).toMatchObject({baselineStart:null,endVarianceDays:null});
  expect(g.phases[0]).toMatchObject({baselineEnd:shiftDay(today,8),plannedEnd:shiftDay(today,11),endVarianceDays:3});
  expect(g.milestones[0]).toMatchObject({baselineDate:shiftDay(today,10),varianceDays:-2});
  expect(g).toMatchObject({baselineEnd:shiftDay(today,8),endVarianceDays:3});
  // The snapshot itself never moved.
  expect((await db.from('pro_work_schedule_baseline_items').select('planned_end').eq('owner_id',owner.id).eq('baseline_id',first.baseline.id).eq('ref_id',s.b.id).single().throwOnError()).data!.planned_end).toBe(shiftDay(today,8));
  // A second baseline becomes the comparison; the first stays listed.
  const second=await post(api,{action:'baseline_save',actionId:uuid(),workId,revision:g.revision,title:'Replanificación'});
  g=await gantt();expect(g.baseline?.id).toBe(second.baseline.id);expect(g.baselines.map(b=>b.title)).toEqual(['Replanificación','Línea base inicial']);expect(g.tasks.find(t=>t.id===s.b.id)?.endVarianceDays).toBe(0);

  // ---- Customer view: off by default, phases/key dates only when on ----
  customer=await browser.newContext({baseURL});await login(customer,client);
  const clientGet=async(url:string,id=requestId)=>{const r=await customer!.request.get(origin+url+'?'+new URLSearchParams({requestId:id}),{headers:{'X-Pro-Expected-Actor':client.id}});expect(r.status()).toBe(200);return await r.json();};
  expect(await clientGet(api)).toEqual({visible:false});
  expect((await customer.request.get(origin+api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':client.id}})).status()).toBe(403);
  const settings=await setSections(page,owner,workId,{showSchedule:true});expect(settings).toMatchObject({showSchedule:true,showPunchlist:false,showAllowances:false,showSelections:false});
  expect((await gantt()).showSchedule).toBe(true);
  const shared=await clientGet(api) as ClientSchedule;expect(shared.visible).toBe(true);if(!shared.visible)throw Error('hidden');
  expect(shared.phases).toEqual([{title:'Obra gris',plannedStart:shiftDay(today,-3),plannedEnd:shiftDay(today,11),total:2,done:0}]);
  expect(shared.general).toEqual({plannedStart:today,plannedEnd:today,total:1,done:0});
  expect(shared.milestones).toEqual([{title:'Entrega de llaves',date:shiftDay(today,8)}]);
  const sharedText=JSON.stringify(shared);for(const hidden of ['Demolición','Repello','NOTA_INTERNA_TAREA','NOTA_HITO','Línea base','baseline','dependsOn',s.a.id,s.phase])expect(sharedText).not.toContain(hidden);
  // Old callers without the new keys keep the stored value.
  const legacy=await page.request.post(origin+'/api/pro/client-dashboard',{headers,data:{workId,actionId:uuid(),revision:settings.revision,showUpdates:true,showDailyLogs:true,showFiles:false,welcomeText:null}});expect(legacy.status()).toBe(200);expect((await legacy.json()).settings).toMatchObject({showSchedule:true,showFiles:false});

  // ---- Punch list API ----
  const punch=async(id=workId)=>{const r=await page.request.get(origin+punchApi+'?'+new URLSearchParams({workId:id}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as Punchlist;};
  expect(await punch()).toMatchObject({items:[],counts:{total:0,done:0},showPunchlist:false});
  expect((await punch()).candidates.map(t=>t.title).sort()).toEqual(['Demolición','Repello','Tarea sin fechas']);
  const photo=await uploadPhoto(page,owner,workId,'fisura.png','#a03c1f');
  const createInput={action:'create',actionId:uuid(),workId,taskId:uuid(),title:'Sellar fisura del cielo',details:'NOTA_PUNCH',dueDate:shiftDay(today,-1),assignee:'Maestro de obras',photoFileId:null,photoRequired:true};
  await post(punchApi,{...createInput,unexpected:1},400);await post(punchApi,{...createInput,title:''},400);await post(punchApi,{...createInput,photoFileId:uuid()},400);
  const created=(await post(punchApi,createInput)).item;expect(created).toMatchObject({title:'Sellar fisura del cielo',status:'open',photoRequired:true,photoFileId:null,revision:1,taskRevision:1});
  expect((await post(punchApi,createInput)).item).toEqual(created);await post(punchApi,{...createInput,title:'Cambio'},400);
  // It is the same task entity (task list, history and task center).
  const taskRows=await page.request.get(origin+tasksApi+'?'+new URLSearchParams({workId,status:'all'}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect((await taskRows.json()).items.map((t:{id:string})=>t.id)).toContain(created.taskId);
  await post(punchApi,{action:'complete',actionId:uuid(),workId,taskId:created.taskId,taskRevision:1},400);// photo required
  // QA 2026-11-11: the rule holds on the task itself, also from the task list/center.
  const blocked=await page.request.post(origin+tasksApi,{headers,data:{action:'complete',workId,taskId:created.taskId,actionId:uuid(),revision:1}});expect(blocked.status()).toBe(400);
  expect(await blocked.json()).toEqual({error:'Agregue una foto antes de completar este pendiente.',code:'photo_required'});// specific code for the task list/center
  const updateInput={action:'update',actionId:uuid(),workId,taskId:created.taskId,revision:1,taskRevision:1,title:'Sellar fisura del cielo',details:'NOTA_PUNCH',dueDate:shiftDay(today,-1),assignee:'Maestro de obras',photoFileId:photo,photoRequired:true};
  await post(punchApi,{...updateInput,revision:9},409);
  const withPhoto=(await post(punchApi,updateInput)).item;expect(withPhoto).toMatchObject({photoFileId:photo,revision:2,taskRevision:2});
  await post(punchApi,{...updateInput,actionId:uuid()},409);// stale revision after the update
  const second2=(await post(punchApi,{action:'create',actionId:uuid(),workId,taskId:uuid(),title:'Limpiar vidrios',details:'',dueDate:null,assignee:'',photoFileId:null,photoRequired:false})).item;
  const marked=(await post(punchApi,{action:'mark',actionId:uuid(),workId,taskId:s.c.id})).item;expect(marked).toMatchObject({taskId:s.c.id,title:'Tarea sin fechas'});
  await post(punchApi,{action:'mark',actionId:uuid(),workId,taskId:s.c.id},409);
  const completeInput={action:'complete',actionId:uuid(),workId,taskId:created.taskId,taskRevision:2};
  const done=(await post(punchApi,completeInput)).item;expect(done.status).toBe('done');expect((await post(punchApi,completeInput)).item).toEqual(done);
  await post(punchApi,{...completeInput,actionId:uuid()},409);
  let list=await punch();expect(list.counts).toEqual({total:3,done:1});expect(list.candidates.map(t=>t.title).sort()).toEqual(['Demolición','Repello']);
  await post(punchApi,{action:'archive',actionId:uuid(),workId,taskId:marked.taskId,taskRevision:marked.taskRevision});
  list=await punch();expect(list.counts).toEqual({total:2,done:1});expect(list.items.map(i=>i.title)).toEqual(['Sellar fisura del cielo','Limpiar vidrios']);
  expect((await db.from('pro_work_punch_history').update({action:'mark'}).eq('owner_id',owner.id)).error?.message).toContain('immutable');
  // Photos: owner yes, rival and hidden customer no.
  const ownerImg=await page.request.get(origin+punchApi+'?'+new URLSearchParams({image:created.taskId}));expect(ownerImg.status()).toBe(200);expect(ownerImg.headers()).toMatchObject({'content-type':'image/jpeg','cache-control':'no-store, private'});
  expect((await customer.request.get(origin+punchApi+'?'+new URLSearchParams({image:created.taskId,requestId}))).status()).toBe(404);
  expect(await clientGet(punchApi)).toEqual({visible:false});
  await setSections(page,owner,workId,{showPunchlist:true});
  const sharedPunch=await clientGet(punchApi) as ClientPunchlist;expect(sharedPunch).toEqual({visible:true,counts:{total:2,done:1},items:[{id:created.taskId,title:'Sellar fisura del cielo',status:'done',dueDate:shiftDay(today,-1),hasPhoto:true},{id:second2.taskId,title:'Limpiar vidrios',status:'open',dueDate:null,hasPhoto:false}]});
  for(const hidden of ['NOTA_PUNCH','Maestro de obras','Tarea sin fechas'])expect(JSON.stringify(sharedPunch)).not.toContain(hidden);
  const custImg=await customer.request.get(origin+punchApi+'?'+new URLSearchParams({image:created.taskId,requestId}));expect(custImg.status()).toBe(200);expect((await custImg.body()).subarray(0,2).toString('hex')).toBe('ffd8');
  expect((await customer.request.get(origin+punchApi+'?'+new URLSearchParams({image:created.taskId}))).status()).toBe(403);// owner path needs Pro tools
  // Isolation: another Pro account.
  other=await browser.newContext({baseURL});await login(other,rival);
  const rivalHeaders={Origin:origin,'X-Pro-Expected-Actor':rival.id};
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await other.request.post(origin+api,{headers:rivalHeaders,data:{action:'baseline_save',actionId:uuid(),workId,revision:g.revision,title:'Intruso'}})).status()).toBe(403);
  expect((await other.request.get(origin+punchApi+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await other.request.get(origin+punchApi+'?'+new URLSearchParams({image:created.taskId}))).status()).toBe(404);
  expect((await other.request.post(origin+punchApi,{headers:rivalHeaders,data:{action:'complete',actionId:uuid(),workId,taskId:second2.taskId,taskRevision:1}})).status()).toBe(403);
  expect((await other.request.post(origin+punchApi,{headers:{...rivalHeaders,'X-Pro-Expected-Actor':owner.id},data:{action:'mark',actionId:uuid(),workId,taskId:s.a.id}})).status()).toBe(403);
  // A cancelled request never receives either section.
  await db.from('pro_appointment_requests').update({status:'cancelled'}).eq('id',requestId).throwOnError();
  expect(await clientGet(api)).toEqual({visible:false});expect(await clientGet(punchApi)).toEqual({visible:false});

  // ---- Owner UI ----
  const mobile=(page.viewportSize()?.width??1366)<768,suffix=`${language}${mobile?'-mobile':''}`;
  const t=en?{phase:'Rough work',a:'Demolition',b:'Plastering',c:'Final cleaning',m:'Key handover'}:{phase:'Obra gris',a:'Demolición',b:'Repello',c:'Limpieza final',m:'Entrega de llaves'};
  const ui=await seed(uiWorkId,{phase:t.phase,a:t.a,b:t.b,c:t.c,milestone:t.m});
  await post(api,{action:'baseline_save',actionId:uuid(),workId:uiWorkId,revision:(await gantt(uiWorkId)).revision,title:en?'Initial plan':'Plan inicial'});
  // Empty state on a job without plan; error state with retry.
  // Every read fails until «Retry» is pressed: a first request cancelled by a remount can no longer hide the error state.
  let failReads=true;
  const failRoute=(url:URL)=>url.pathname===api&&url.searchParams.get('workId')===emptyWorkId;
  await page.route(failRoute,async route=>{if(failReads&&route.request().method()==='GET')await route.fulfill({status:503,contentType:'application/json',body:'{"error":"x"}'});else await route.continue();});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:emptyWorkId,vistaTrabajo:'schedule'}));
  const error=page.locator('[data-schedule-error]');await expect(error).toBeVisible({timeout:60000});failReads=false;await error.getByRole('button',{name:en?'Retry':'Reintentar'}).click();
  await expect(page.locator('[data-schedule-empty]')).toContainText(en?'There is nothing to show yet':'Todavía no hay nada que mostrar');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`schedule-empty-${suffix}.png`),fullPage:true});
  await page.unroute(failRoute);

  // QA 2026-11-11 (pulido): due dates are drawn in the Gantt; a past due date makes an open task overdue even if its planned end is later.
  await db.from('pro_work_tasks').update({due_date:shiftDay(today,-1)}).eq('owner_id',owner.id).eq('id',ui.a.id).throwOnError();await db.from('pro_work_tasks').update({due_date:shiftDay(today,6)}).eq('owner_id',owner.id).eq('id',ui.b.id).throwOnError();
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:uiWorkId,vistaTrabajo:'schedule'}));
  const section=page.locator('[data-project-schedule]');await expect(section).toBeVisible({timeout:60000});
  await expect(section.locator('[data-schedule-baseline]')).toContainText(en?'Initial plan':'Plan inicial');
  await expect(section.locator('[data-schedule-share]')).toContainText(en?'Not shared with the customer':'No se comparte con el cliente');
  if(mobile){await expect(section.locator('[data-schedule-list]')).toBeVisible();await expect(section.locator('[data-schedule-list-task]')).toHaveCount(2);await expect(section.locator('[data-schedule-list-milestone]')).toHaveCount(1);
   await expectNoHorizontalOverflow(page);await section.locator('[data-schedule-list]').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`schedule-list-${suffix}.png`),fullPage:true});
   await section.locator('[data-schedule-mode="gantt"]').click();}
  const chart=section.locator('[data-schedule-gantt]');await expect(chart).toBeVisible();
  await expect(chart.locator('[data-schedule-bar]')).toHaveCount(2);await expect(chart.locator('[data-schedule-milestone]')).toHaveCount(1);await expect(chart.locator('[data-schedule-today]')).toBeVisible();
  await expect(chart.locator('[data-schedule-dependency]')).toHaveCount(1);await expect(chart.locator('[data-schedule-dependency="ok"]')).toHaveCount(1);await expect(chart.locator('[data-schedule-baseline-bar]')).toHaveCount(2);
  // The chart scrolls inside its own region; the page does not.
  const box=await chart.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));expect(box.scroll).toBeGreaterThan(box.client);await expectNoHorizontalOverflow(page);
  // QA 2026-11-11: the initial view centers Today in the visible grid (right of the sticky name column), also at 390 px.
  const todayInView=async()=>{const [r,l,m]=await Promise.all([chart.boundingBox(),chart.locator('[data-schedule-label-col]').boundingBox(),chart.locator('[data-schedule-today]').boundingBox()]);return m!.x>l!.x+l!.width+16&&m!.x<r!.x+r!.width-48;};
  await expect.poll(todayInView).toBe(true);
  // The bar label is legible (not clipped to nothing) on day scale.
  const barB=chart.locator(`[data-schedule-bar="${ui.b.id}"]`);await expect(barB).toContainText(t.b);
  await expect(chart.locator('[data-schedule-deadline]')).toHaveCount(2);await expect(chart.locator(`[data-schedule-deadline="${ui.b.id}"]`)).toHaveAttribute('data-schedule-deadline-late','true');await expect(chart.locator(`[data-schedule-deadline="${ui.a.id}"]`)).toHaveAttribute('data-schedule-deadline-late','true');// A ends at +2, after its due date (yesterday)
  await expect(barB).toHaveAttribute('aria-label',new RegExp((en?'Due date: ':'Fecha límite: ')+'.+, '+(en?'Ends after the due date':'Termina después de la fecha límite')));
  await expect(chart.locator(`[data-schedule-bar="${ui.a.id}"]`)).toHaveAttribute('aria-label',new RegExp(', '+(en?'Overdue':'Vencida')+',.*'+(en?'Due date: ':'Fecha límite: ')));
  // The marker sits at the end of the due day: right of the bar start of B (day +3) and left of its end (day +8).
  const [bBox,dBox]=await Promise.all([barB.boundingBox(),chart.locator(`[data-schedule-deadline="${ui.b.id}"]`).boundingBox()]);expect(dBox!.x).toBeGreaterThan(bBox!.x);expect(dBox!.x).toBeLessThan(bBox!.x+bBox!.width);
  // Round 2: the «Today» flag has its own header row and never covers a month name.
  const todayFlag=chart.locator('[data-schedule-today-label]');await expect(todayFlag).toBeVisible();
  const overlaps=await todayFlag.evaluate(flag=>{const f=flag.getBoundingClientRect();return [...flag.parentElement!.children].filter(node=>node!==flag&&node.textContent&&/[A-Za-zá-ú]{3}/.test(node.textContent)).some(node=>{const r=node.getBoundingClientRect();return r.width>0&&f.left<r.right&&f.right>r.left&&f.top<r.bottom&&f.bottom>r.top;});});
  expect(overlaps).toBe(false);
  await chart.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`schedule-gantt-day-${suffix}.png`),fullPage:true});
  for(const scale of ['week','month'] as const){await section.locator(`[data-schedule-scale="${scale}"]`).click();await expect(chart).toHaveAttribute('data-scale',scale);await expect(chart.locator('[data-schedule-bar]')).toHaveCount(2);const width=await chart.evaluate(el=>el.scrollWidth);expect(width).toBeGreaterThan(0);}
  await page.screenshot({path:info.outputPath(`schedule-gantt-month-${suffix}.png`),fullPage:true});
  await section.locator('[data-schedule-scale="day"]').click();
  // Edit dates with the form (keyboard reachable label button), then see deviation.
  const label=chart.locator(`[data-schedule-task-label="${ui.b.id}"]`);await label.focus();await page.keyboard.press('Enter');
  const form=section.locator('[data-schedule-editor="task"]');await expect(form).toBeVisible();
  await form.locator('[data-schedule-field="end"]').fill(shiftDay(today,10));
  await expect(form.locator('[data-schedule-variance="2"]')).toBeVisible();
  await form.locator('[data-schedule-field="start"]').fill(shiftDay(today,12));await expect(form).toContainText(en?'The end cannot be before the start.':'El fin no puede ser anterior al inicio.');await expect(form.getByRole('button',{name:en?'Save dates':'Guardar fechas'})).toBeDisabled();
  await form.locator('[data-schedule-field="start"]').fill(shiftDay(today,3));
  await form.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`schedule-edit-${suffix}.png`),fullPage:true});
  await form.getByRole('button',{name:en?'Save dates':'Guardar fechas'}).click();
  await expect(section.getByRole('status').filter({hasText:en?'Dates saved.':'Fechas guardadas.'})).toBeVisible();
  await expect(chart.locator(`[data-schedule-task-label="${ui.b.id}"]`).locator('xpath=..').locator('[data-schedule-variance="2"]')).toBeVisible();
  await page.reload();await expect(section).toBeVisible({timeout:60000});
  await section.locator('[data-schedule-mode="list"]').click();
  const listItem=section.locator(`[data-schedule-list-task="${ui.b.id}"]`);await expect(listItem).toContainText(en?'2 days late':'2 días de atraso');await expect(listItem.locator('[data-schedule-list-deadline]')).toContainText(en?'Ends after the due date':'Termina después de la fecha límite');await expect(section.locator(`[data-schedule-list-task="${ui.a.id}"]`)).toContainText(en?'Overdue':'Vencida');
  expect((await gantt(uiWorkId)).tasks.find(x=>x.id===ui.b.id)).toMatchObject({plannedEnd:shiftDay(today,10),endVarianceDays:2});
  await listItem.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`schedule-list-variance-${suffix}.png`),fullPage:true});

  // Punch list UI: tab in Tasks, create, counter, complete, reload persisted.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:uiWorkId,vistaTrabajo:'tasks',vistaTareas:'punch'}));
  const punchUi=page.locator('[data-work-punchlist]');await expect(punchUi).toBeVisible({timeout:60000});await expect(punchUi.locator('[data-punchlist-empty]')).toBeVisible();
  await expect(page.locator('[data-work-task-view="punch"]')).toHaveAttribute('aria-pressed','true');
  await punchUi.locator('[data-punchlist-create]').click();const pForm=punchUi.locator('[data-punchlist-form]');
  await pForm.locator('[data-punchlist-field="title"]').fill(en?'Touch up door paint':'Retocar pintura de puerta');
  await pForm.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();await expect(punchUi.getByRole('status')).toContainText(en?'Punch item saved.':'Pendiente guardado.');
  await expect(punchUi.locator('[data-punchlist-counter]')).toHaveText(en?'0 of 1 completed':'0 de 1 completados');
  await punchUi.locator('[data-punchlist-move-open]').click();await punchUi.locator('[data-punchlist-move]').getByRole('button',{name:en?'Add to punch list':'Agregar a pendientes finales'}).click();
  await expect(punchUi.locator('[data-punch-item]')).toHaveCount(2);
  await punchUi.locator('[data-punch-item]').first().locator('[data-punch-toggle]').click();
  await expect(punchUi.locator('[data-punchlist-counter]')).toHaveText(en?'1 of 2 completed':'1 de 2 completados');
  await page.reload();await expect(punchUi.locator('[data-punchlist-counter]')).toHaveText(en?'1 of 2 completed':'1 de 2 completados',{timeout:60000});
  await punchUi.locator('[data-punchlist-filter="done"]').click();await expect(punchUi.locator('[data-punch-item]')).toHaveCount(1);
  await punchUi.locator('[data-punchlist-filter="all"]').click();
  await punchUi.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`punchlist-${suffix}.png`),fullPage:true});
  // QA 2026-11-11 (pulido): completing a photo-required item from the task List says why it was refused.
  const photoTask=(await post(punchApi,{action:'create',actionId:uuid(),workId:emptyWorkId,taskId:uuid(),title:en?'Seal window frame':'Sellar marco de ventana',details:'',dueDate:null,assignee:'',photoFileId:null,photoRequired:true})).item;
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:emptyWorkId,vistaTrabajo:'tasks',vistaTareas:'list'}));
  const listUi=page.locator('[data-work-tasks]');await expect(listUi).toBeVisible({timeout:60000});
  await listUi.locator(`[data-work-task="${photoTask.taskId}"]`).getByRole('button',{name:en?'Complete':'Completar',exact:true}).click();
  await expect(listUi.getByRole('alert')).toHaveText(en?'This item requires a photo. Add it in Punch list before completing it.':'Este pendiente exige una foto. Agréguela en Pendientes finales antes de completarlo.');
  const stillOpen=await page.request.get(origin+tasksApi+'?'+new URLSearchParams({workId:emptyWorkId,taskId:photoTask.taskId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect((await stillOpen.json()).task.status).toBe('open');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`tasks-photo-required-${suffix}.png`),fullPage:true});

  // Customer UI: both sections visible once on, without internal data.
  await setSections(page,owner,uiWorkId,{showSchedule:true,showPunchlist:true});
  const customerPage=await customer.newPage();onAppPageError(customerPage,message=>runtime.push(message));
  await gotoOK(customerPage,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${uiRequestId}`);
  const cSchedule=customerPage.locator('[data-client-schedule]');await expect(cSchedule).toBeVisible({timeout:60000});await expect(cSchedule).toContainText(t.phase);await expect(cSchedule).toContainText(t.m);await expect(cSchedule).not.toContainText(t.a);await expect(cSchedule).not.toContainText('NOTA');
  const cPunch=customerPage.locator('[data-client-punchlist]');await expect(cPunch).toContainText(en?'1 of 2 completed':'1 de 2 completados');
  await cSchedule.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(customerPage);await customerPage.screenshot({path:info.outputPath(`customer-schedule-${suffix}.png`),fullPage:true});
  await cPunch.scrollIntoViewIfNeeded();await customerPage.screenshot({path:info.outputPath(`customer-punchlist-${suffix}.png`),fullPage:true});

  expect(await notices()).toEqual(noticesBefore);
  expect(runtime).toEqual([]);
 }finally{await customer?.close();await other?.close();await f.cleanup();}
});

