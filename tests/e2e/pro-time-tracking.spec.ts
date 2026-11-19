import {test,expect,type BrowserContext} from 'playwright/test';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {fixture,local,login,origin,shiftDay,uuid} from './pro-schedule-time-fixture';
import type {TimeRead} from '../../src/lib/pro/time-tracking';

// Families 21/22: own timer (one at a time, server-side), manual hours, activities
// with rates, and job-cost integration without double counting. Local only.
const api='/api/pro/time-tracking';

for(const language of ['es','en'] as const)test(`Time tracking: timer, manual hours, costs integration and UI [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(480000);local(baseURL);const en=language==='en',f=await fixture(page.context(),'time',3),{owner,client,rival,db,linkedClient}=f,[workId,otherWorkId,uiWorkId]=f.works;let other:BrowserContext|undefined,customer:BrowserContext|undefined;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id},today=crTodayISO(),month={from:today.slice(0,8)+'01',to:today};
  const read=async(id=workId,period=month)=>{const r=await page.request.get(origin+api+'?'+new URLSearchParams({workId:id,...period}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as TimeRead;};
  const post=async(data:Record<string,unknown>,status=200)=>{const r=await page.request.post(origin+api,{headers,data});expect(r.status(),JSON.stringify(data)+' '+await r.text()).toBe(status);return status===200?await r.json():null;};
  const costs=async(id=workId)=>{const r=await page.request.get(origin+'/api/pro/work-costs?'+new URLSearchParams({clientId:linkedClient,workId:id}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as {summary:{minutes:number;laborCents:number;uncostedMinutes:number};items:{id:string;kind:string;minutes:number|null;note:string;reversed:boolean}[]};};
  const ageTimer=async(entryId:string,minutes:number)=>{await db.from('pro_time_entries').update({started_at:new Date(Date.now()-minutes*60000).toISOString()}).eq('owner_id',owner.id).eq('id',entryId).throwOnError();};

  // ---- Read and validation ----
  const empty=await read();expect(empty).toMatchObject({workId,running:null,activities:[],entries:[],totals:{entries:0,minutes:0,billableCents:0,costCents:0,byActivity:[]}});
  for(const query of [new URLSearchParams({workId}),new URLSearchParams({workId,from:today,to:today,x:'1'}),new URLSearchParams({workId,from:'2026-02-30',to:today}),new URLSearchParams({workId,from:'2020-01-01',to:today})])expect((await page.request.get(origin+api+'?'+query,{headers:{'X-Pro-Expected-Actor':owner.id}})).status(),String(query)).toBe(400);
  expect((await page.request.get(origin+api+'?'+new URLSearchParams({workId:'x-'+uuid(),...month}),{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(404);
  expect((await page.request.post(origin+api,{headers:{'X-Pro-Expected-Actor':owner.id},data:{action:'discard',actionId:uuid(),entryId:uuid()}})).status()).toBe(403);// no Origin

  // ---- Activities: create, CAS, idempotency ----
  const activityId=uuid(),activityInput={action:'activity_save',actionId:uuid(),activityId,revision:0,name:'Instalación',rateCents:2000000,costCents:1200000,billable:true};
  await post({...activityInput,rateCents:-1},400);await post({...activityInput,name:''},400);
  const activity=(await post(activityInput)).activity;expect(activity).toMatchObject({id:activityId,name:'Instalación',rateCents:2000000,costCents:1200000,billable:true,revision:1});
  expect((await post(activityInput)).activity).toEqual(activity);await post({...activityInput,name:'Otra'},400);
  await post({...activityInput,actionId:uuid()},409);// stale revision 0
  const visitId=uuid();await post({action:'activity_save',actionId:uuid(),activityId:visitId,revision:0,name:'Visita técnica',rateCents:1500000,costCents:null,billable:false});

  // ---- Timer: one active session, persistent, idempotent stop ----
  const entryId=uuid(),startInput={action:'start',actionId:uuid(),entryId,workId,activityId,billable:true,note:'Tubería del baño'};
  const started=(await post(startInput)).entry;expect(started).toMatchObject({id:entryId,status:'running',source:'timer',minutes:null,costEntryId:null,activityName:'Instalación'});
  expect((await post(startInput)).entry).toEqual(started);
  await post({action:'start',actionId:uuid(),entryId:uuid(),workId:otherWorkId,activityId:null,billable:false,note:''},409);// another job, same account
  expect((await read(otherWorkId)).running).toMatchObject({id:entryId,workId,workTitle:'Remodelación de cocina'});// visible from any job/tab
  await ageTimer(entryId,90);
  const stopInput={action:'stop',actionId:uuid(),entryId,minutes:null,note:''};
  await post({...stopInput,minutes:5000},400);await post({...stopInput,minutes:200},400);// more than elapsed
  const stopped=await post(stopInput);expect(stopped.alreadyStopped).toBe(false);expect(stopped.entry).toMatchObject({status:'stopped',minutes:90,recordedOn:today,billable:true,rateCents:2000000,costCents:1200000,billableCents:3000000,voided:false});
  const costEntryId=stopped.entry.costEntryId;expect(costEntryId).toMatch(/^[0-9a-f-]{36}$/);
  expect(await post(stopInput)).toEqual(stopped);// same action replays
  const second=await post({...stopInput,actionId:uuid()});expect(second.alreadyStopped).toBe(true);expect(second.entry.costEntryId).toBe(costEntryId);// other tab: no second line
  let c=await costs();expect(c.summary.minutes).toBe(90);expect(c.summary.laborCents).toBe(1800000);
  expect(c.items.filter(i=>i.kind==='time').map(i=>[i.id,i.minutes,i.note])).toEqual([[costEntryId,90,'Instalación · Tubería del baño']]);
  await post({action:'discard',actionId:uuid(),entryId},409);// not running anymore

  // ---- Manual entry, totals, void without double counting ----
  const manualInput={action:'manual',actionId:uuid(),entryId:uuid(),workId,activityId:visitId,billable:false,date:shiftDay(today,-1)<month.from?today:shiftDay(today,-1),minutes:60,note:'Medición'};
  await post({...manualInput,date:shiftDay(today,1)},400);await post({...manualInput,minutes:0},400);await post({...manualInput,extra:1},400);
  const manual=(await post(manualInput)).entry;expect(manual).toMatchObject({source:'manual',status:'stopped',minutes:60,billable:false,billableCents:null});
  expect((await post(manualInput)).entry).toEqual(manual);
  c=await costs();expect(c.summary.minutes).toBe(150);expect(c.summary.uncostedMinutes).toBe(60);
  let r=await read();expect(r.totals).toMatchObject({entries:2,minutes:150,billableMinutes:90,billableCents:3000000,costCents:1800000,uncostedMinutes:60});
  expect(r.totals.byActivity).toEqual([{activityId,name:'Instalación',minutes:90,billableCents:3000000},{activityId:visitId,name:'Visita técnica',minutes:60,billableCents:0}]);
  const voidInput={action:'void',actionId:uuid(),entryId:manual.id,revision:manual.revision,reason:'Duplicada'};
  await post({...voidInput,reason:' '},400);
  const voided=(await post(voidInput)).entry;expect(voided.voided).toBe(true);
  await post({...voidInput,actionId:uuid(),revision:voided.revision},409);
  c=await costs();expect(c.summary.minutes).toBe(90);r=await read();expect(r.totals.minutes).toBe(90);expect(r.entries.find(e=>e.id===manual.id)?.voided).toBe(true);
  // A line voided from Costs & payments is also void here.
  const costRev=(await page.request.get(origin+'/api/pro/work-costs?'+new URLSearchParams({clientId:linkedClient,workId}),{headers:{'X-Pro-Expected-Actor':owner.id}}).then(x=>x.json())).revision;
  const costVoid=await page.request.post(origin+'/api/pro/work-costs',{headers,data:{action:'void_time',clientId:linkedClient,workId,requestId:uuid(),revision:costRev,entryId:costEntryId,reason:'Corrección'}});expect(costVoid.status(),await costVoid.text()).toBe(200);
  r=await read();expect(r.totals.minutes).toBe(0);expect(r.entries.find(e=>e.id===entryId)?.voided).toBe(true);expect((await costs()).summary.minutes).toBe(0);
  // QA 2026-11-11: a line edited in Costs (edit_time = reverse + new line) is "adjusted",
  // not void; Hours follows the live line (45 min, its cost) and voiding from Hours
  // reverses that live line, so both modules always agree.
  const adj=(await post({action:'manual',actionId:uuid(),entryId:uuid(),workId,activityId,billable:true,date:today,minutes:30,note:'Ajuste'})).entry;
  const costRev2=(await page.request.get(origin+'/api/pro/work-costs?'+new URLSearchParams({clientId:linkedClient,workId}),{headers:{'X-Pro-Expected-Actor':owner.id}}).then(x=>x.json())).revision;
  const editId=uuid(),costEdit=await page.request.post(origin+'/api/pro/work-costs',{headers,data:{action:'edit_time',clientId:linkedClient,workId,requestId:editId,revision:costRev2,entryId:adj.costEntryId,reason:'Faltaron minutos',date:today,minutes:45,hourlyCostCents:600000,note:'Instalación · Ajuste'}});expect(costEdit.status(),await costEdit.text()).toBe(200);
  r=await read();expect(r.entries.find(e=>e.id===adj.id)).toMatchObject({voided:false,adjusted:true,minutes:45,billableCents:1500000,costEntryId:adj.costEntryId});
  expect(r.totals).toMatchObject({entries:1,minutes:45,billableMinutes:45,billableCents:1500000,costCents:450000,uncostedMinutes:0});
  c=await costs();expect(c.summary.minutes).toBe(45);expect(c.summary.laborCents).toBe(450000);
  const adjVoid=(await post({action:'void',actionId:uuid(),entryId:adj.id,revision:adj.revision,reason:'Ya no aplica'})).entry;expect(adjVoid).toMatchObject({voided:true,adjusted:false});
  expect((await costs()).items.find(i=>i.id===editId)?.reversed).toBe(true);expect((await costs()).summary.minutes).toBe(0);expect((await read()).totals.minutes).toBe(0);
  // QA 2026-11-11: real concurrency. Two tabs start at once: exactly one session; two stops at once: one cost line.
  const raceA=uuid(),raceB=uuid();
  const starts=await Promise.all([raceA,raceB].map(id=>page.request.post(origin+api,{headers,data:{action:'start',actionId:uuid(),entryId:id,workId,activityId:null,billable:true,note:''}})));
  expect(starts.map(x=>x.status()).sort()).toEqual([200,409]);const winner=starts[0].status()===200?raceA:raceB;
  expect((await db.from('pro_time_entries').select('id').eq('owner_id',owner.id).eq('status','running').throwOnError()).data!.map(x=>x.id)).toEqual([winner]);
  await ageTimer(winner,12);
  const stops=await Promise.all([0,1].map(()=>page.request.post(origin+api,{headers,data:{action:'stop',actionId:uuid(),entryId:winner,minutes:null,note:''}})));
  expect(stops.map(x=>x.status())).toEqual([200,200]);const stopBodies=await Promise.all(stops.map(x=>x.json()));
  expect(stopBodies.map(x=>x.alreadyStopped).sort()).toEqual([false,true]);expect(new Set(stopBodies.map(x=>x.entry.costEntryId)).size).toBe(1);
  expect((await costs()).summary.minutes).toBe(12);
  await post({action:'void',actionId:uuid(),entryId:winner,revision:stopBodies[0].entry.revision,reason:'Prueba de concurrencia'});expect((await costs()).summary.minutes).toBe(0);
  // Period filter.
  expect((await read(workId,{from:shiftDay(month.from,-40),to:shiftDay(month.from,-1)})).entries).toEqual([]);

  // ---- Discard and long sessions ----
  const discardId=uuid();await post({action:'start',actionId:uuid(),entryId:discardId,workId,activityId:null,billable:true,note:''});
  expect((await post({action:'discard',actionId:uuid(),entryId:discardId})).entry.status).toBe('discarded');
  await post({action:'stop',actionId:uuid(),entryId:discardId,minutes:null,note:''},409);
  const longId=uuid();await post({action:'start',actionId:uuid(),entryId:longId,workId,activityId,billable:true,note:''});await ageTimer(longId,25*60);
  await post({action:'stop',actionId:uuid(),entryId:longId,minutes:null,note:''},400);
  expect((await post({action:'stop',actionId:uuid(),entryId:longId,minutes:480,note:'Jornada'})).entry).toMatchObject({minutes:480,note:'Jornada'});
  expect((await costs()).summary.minutes).toBe(480);
  expect((await db.from('pro_time_history').update({action:'x'}).eq('owner_id',owner.id)).error?.message).toContain('immutable');
  // QA 2026-11-11 (pulido): a job cancelled (or its customer archived) while the timer runs returns a specific code, not a generic 400.
  // A booked appointment cannot be cancelled once started (and stays cancelled), so the cancelled case uses an unbooked job scheduled later.
  const laterJob='later-'+uuid(),later=shiftDay(today,2);await db.from('pro_work').insert({user_id:owner.id,id:laterJob,clientId:linkedClient,client:'Cliente cronograma local',service:'Trabajo posterior',stage:'scheduled',start:later+'T10:00:00-06:00',end:later+'T10:30:00-06:00',cancelled:false}).throwOnError();
  const inactiveId=uuid();await post({action:'start',actionId:uuid(),entryId:inactiveId,workId:laterJob,activityId:null,billable:true,note:''});await ageTimer(inactiveId,10);
  const inactive=async(data:Record<string,unknown>)=>{const r=await page.request.post(origin+api,{headers,data});expect(r.status(),JSON.stringify(data)).toBe(400);return await r.json();};
  await db.from('pro_work').update({cancelled:true}).eq('user_id',owner.id).eq('id',laterJob).throwOnError();
  expect(await inactive({action:'stop',actionId:uuid(),entryId:inactiveId,minutes:null,note:''})).toEqual({error:'El trabajo está cancelado o su cliente está archivado.',code:'inactive_job'});
  expect((await inactive({action:'manual',actionId:uuid(),entryId:uuid(),workId:laterJob,activityId:null,billable:false,date:today,minutes:30,note:''})).code).toBe('inactive_job');
  expect((await post({action:'discard',actionId:uuid(),entryId:inactiveId})).entry.status).toBe('discarded');
  // Customer archived while a timer runs on a booked job.
  const archivedId=uuid();await post({action:'start',actionId:uuid(),entryId:archivedId,workId:otherWorkId,activityId:null,billable:true,note:''});await ageTimer(archivedId,10);
  await db.from('pro_clients').update({archived:true}).eq('user_id',owner.id).eq('id',linkedClient).throwOnError();
  expect((await inactive({action:'stop',actionId:uuid(),entryId:archivedId,minutes:null,note:''})).code).toBe('inactive_job');
  await db.from('pro_clients').update({archived:false}).eq('user_id',owner.id).eq('id',linkedClient).throwOnError();
  expect((await inactive({action:'stop',actionId:uuid(),entryId:archivedId,minutes:5000,note:''})).code).toBeUndefined();// other 400s keep the generic body
  expect((await post({action:'discard',actionId:uuid(),entryId:archivedId})).entry.status).toBe('discarded');expect((await costs(otherWorkId)).summary.minutes).toBe(0);
  // Archived activities cannot start timers.
  await post({action:'activity_archive',actionId:uuid(),activityId:visitId,revision:1});
  await post({action:'start',actionId:uuid(),entryId:uuid(),workId,activityId:visitId,billable:false,note:''},409);

  // ---- Isolation ----
  other=await browser.newContext({baseURL});await login(other,rival);
  const rivalHeaders={Origin:origin,'X-Pro-Expected-Actor':rival.id};
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({workId,...month}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await other.request.post(origin+api,{headers:rivalHeaders,data:{action:'start',actionId:uuid(),entryId:uuid(),workId,activityId:null,billable:true,note:''}})).status()).toBe(403);
  expect((await other.request.post(origin+api,{headers:rivalHeaders,data:{action:'void',actionId:uuid(),entryId:longId,revision:2,reason:'x'}})).status()).toBe(403);
  expect((await other.request.post(origin+api,{headers:rivalHeaders,data:{action:'start',actionId:uuid(),entryId:uuid(),workId:'own-'+uuid(),activityId:activityId,billable:true,note:''}})).status()).toBe(403);
  customer=await browser.newContext({baseURL});await login(customer,client);
  expect((await customer.request.get(origin+api+'?'+new URLSearchParams({workId,...month}),{headers:{'X-Pro-Expected-Actor':client.id}})).status()).toBe(403);

  // ---- UI: empty, start, reload persistence, second tab, stop ----
  const mobile=(page.viewportSize()?.width??1366)<768,suffix=`${language}${mobile?'-mobile':''}`;
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:uiWorkId,vistaTrabajo:'time'}));
  const section=page.locator('[data-time-tracking]');await expect(section).toBeVisible({timeout:60000});
  await expect(section.locator('[data-time-empty]')).toContainText(en?'No hours in this period.':'No hay horas en este período.');
  await expect(section.locator('[data-time-timer]')).toHaveAttribute('data-time-timer','idle');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`time-empty-${suffix}.png`),fullPage:true});
  // New activity through the form.
  await section.locator('[data-time-activities] summary').click();await section.locator('[data-time-activity-new]').click();
  const aForm=section.locator('[data-time-activity-form]');await aForm.locator('[data-time-field="activity-name"]').fill(en?'Painting':'Pintura');await aForm.locator('[data-time-field="activity-rate"]').fill('15.000');await aForm.locator('[data-time-field="activity-cost"]').fill('9000');
  await aForm.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();await expect(section.locator('[data-time-activity]').filter({hasText:en?'Painting':'Pintura'})).toContainText('15');
  const optionValue=await section.locator('[data-time-field="activity"] option').filter({hasText:en?'Painting':'Pintura'}).getAttribute('value');await section.locator('[data-time-field="activity"]').selectOption(optionValue!);
  await section.locator('[data-time-field="note"]').fill(en?'Living room walls':'Paredes de la sala');
  await section.locator('[data-time-start-button]').click();
  const timer=section.locator('[data-time-timer="running"]');await expect(timer).toBeVisible();await expect(timer.locator('[data-time-elapsed]')).toHaveText(/^0:00:0\d$/);
  await expect(timer.locator('[data-time-elapsed]')).not.toHaveText('0:00:00',{timeout:5000});
  await page.reload();await expect(section.locator('[data-time-timer="running"]')).toBeVisible({timeout:60000});await expect(section.locator('[data-time-elapsed]')).toHaveText(/^0:00:\d\d$/);
  // Another tab sees the same running timer; a start there is refused.
  const tab2=await page.context().newPage();onAppPageError(tab2,message=>runtime.push(message));
  await gotoOK(tab2,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:uiWorkId,vistaTrabajo:'time'}));
  await expect(tab2.locator('[data-time-timer="running"]')).toBeVisible({timeout:60000});
  await expect(section.locator('[data-time-timer="running"]')).toBeVisible();
  await section.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`time-running-${suffix}.png`),fullPage:true});
  const runningId=(await read(uiWorkId)).running!.id;await ageTimer(runningId,45);
  await tab2.locator('[data-time-stop]').click();await expect(tab2.locator('[data-time-notice]')).toContainText(en?'Time recorded in Costs & payments.':'Tiempo registrado en Costos y pagos.');
  // The first tab learns about it (broadcast or focus) and does not record twice.
  await page.bringToFront();await expect(section.locator('[data-time-timer]')).toHaveAttribute('data-time-timer','idle',{timeout:20000});
  await tab2.close();
  const row=mobile?section.locator('[data-time-entry-card]'):section.locator('[data-time-entry]');await expect(row).toHaveCount(1);await expect(row.first()).toContainText(en?'Painting':'Pintura');await expect(row.first()).toContainText('45 min');
  await expect(section.locator('[data-time-stat="minutes"]')).toHaveAttribute('data-value','45');await expect(section.locator('[data-time-stat="billableCents"]')).toHaveAttribute('data-value','1125000');
  expect((await costs(uiWorkId)).summary).toMatchObject({minutes:45,laborCents:675000});
  // Manual entry through the form.
  await section.locator('[data-time-manual-open]').click();const mForm=section.locator('[data-time-manual]');
  await mForm.locator('[data-time-field="hours"]').fill('abc');await mForm.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();await expect(section.getByRole('alert')).toContainText(en?'Enter between 0.02 and 24 hours.':'Indique entre 0,02 y 24 horas.');
  await mForm.locator('[data-time-field="hours"]').fill(en?'1.5':'1,5');await mForm.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();
  await expect(section.locator('[data-time-stat="minutes"]')).toHaveAttribute('data-value','135');await expect(row).toHaveCount(2);
  await page.reload();await expect(section.locator('[data-time-stat="minutes"]')).toHaveAttribute('data-value','135',{timeout:60000});
  expect((await costs(uiWorkId)).summary.minutes).toBe(135);
  await section.locator('[data-time-totals]').scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`time-entries-${suffix}.png`),fullPage:true});
  // QA 2026-11-11: a line corrected in Costs shows as "adjusted" (not void) and the totals follow it.
  const manualRow=(await read(uiWorkId)).entries.find(e=>e.source==='manual')!;
  const uiCostRev=(await page.request.get(origin+'/api/pro/work-costs?'+new URLSearchParams({clientId:linkedClient,workId:uiWorkId}),{headers:{'X-Pro-Expected-Actor':owner.id}}).then(x=>x.json())).revision;
  const uiEdit=await page.request.post(origin+'/api/pro/work-costs',{headers,data:{action:'edit_time',clientId:linkedClient,workId:uiWorkId,requestId:uuid(),revision:uiCostRev,entryId:manualRow.costEntryId,reason:'Corrección',date:today,minutes:120,hourlyCostCents:null,note:''}});expect(uiEdit.status(),await uiEdit.text()).toBe(200);
  await page.reload();await expect(section.locator('[data-time-stat="minutes"]')).toHaveAttribute('data-value','165',{timeout:60000});
  const adjustedRow=(mobile?section.locator(`[data-time-entry-card="${manualRow.id}"]`):section.locator(`[data-time-entry="${manualRow.id}"]`));
  await expect(adjustedRow.locator('[data-time-adjusted]')).toHaveText(en?'Adjusted in Costs':'Corregida en Costos');await expect(adjustedRow).toContainText('2 h');
  expect((await costs(uiWorkId)).summary.minutes).toBe(165);
  await adjustedRow.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`time-adjusted-${suffix}.png`),fullPage:true});
  // QA 2026-11-11 (pulido): Stop after the customer was archived meanwhile explains the cause and leaves Discard available.
  const lateId=uuid();await post({action:'start',actionId:uuid(),entryId:lateId,workId:uiWorkId,activityId:null,billable:true,note:''});await ageTimer(lateId,20);
  await page.reload();await expect(section.locator('[data-time-timer="running"]')).toBeVisible({timeout:60000});
  await db.from('pro_clients').update({archived:true}).eq('user_id',owner.id).eq('id',linkedClient).throwOnError();
  await section.locator('[data-time-stop]').click();
  await expect(section.getByRole('alert')).toHaveText(en?'The hours were not recorded: this job is cancelled or its customer is archived. If the customer is archived, restore them to record the hours; otherwise, discard the timer.':'No se registraron las horas: este trabajo está cancelado o su cliente está archivado. Si el cliente está archivado, restáurelo para registrarlas; si no, descarte el cronómetro.');
  await expect(section.locator('[data-time-timer="running"]')).toBeVisible();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`time-inactive-${suffix}.png`),fullPage:true});
  await section.locator('[data-time-discard]').click();await expect(section.locator('[data-time-notice]')).toContainText(en?'Timer discarded; nothing was recorded.':'Cronómetro descartado; no se registró nada.');
  await db.from('pro_clients').update({archived:false}).eq('user_id',owner.id).eq('id',linkedClient).throwOnError();expect((await costs(uiWorkId)).summary.minutes).toBe(165);
  // Error state with retry.
  let failFirst=true;const failRoute=(url:URL)=>url.pathname===api;
  await page.route(failRoute,async route=>{if(failFirst&&route.request().method()==='GET'){failFirst=false;await route.fulfill({status:503,contentType:'application/json',body:'{"error":"x"}'});}else await route.continue();});
  await page.reload();const err=page.locator('[data-time-error]');await expect(err).toBeVisible({timeout:60000});await err.getByRole('button',{name:en?'Retry':'Reintentar'}).click();await expect(section.locator('[data-time-stat="minutes"]')).toHaveAttribute('data-value','165');
  await page.unroute(failRoute);
  expect(runtime).toEqual([]);
 }finally{await other?.close();await customer?.close();await f.cleanup();}
});
