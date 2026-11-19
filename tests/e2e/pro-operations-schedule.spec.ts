import {test,expect,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';

// Ronda F2-C (2026-11-19), operations: schedule from a quote (row 13), saved task-center views (15), time clock and
// weekly timesheets (22), daily log crew from the team (20), notification channels with WhatsApp stored only (24)
// and custom roles that only remove permissions (17). Disposable accounts, loopback Supabase; nothing is sent.
const shots=process.env.F2C_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){await expectNoHorizontalOverflow(page);if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
async function openPro(page:Page,path:string,en:boolean){
 await gotoOK(page,path);
 const failed=page.getByText(en?'Could not verify Pro access. Your data is preserved.':'No se pudo comprobar el acceso a Pro. Sus datos se conservan.');
 const ready=page.locator('[data-independent-pro]');
 await expect(failed.or(ready).first()).toBeVisible({timeout:90000});
 if(await failed.isVisible())await page.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
 await expect(ready.first()).toBeVisible({timeout:90000});
}
const crToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const monday=(iso:string)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);};

for(const language of ['es','en'] as const)test(`Operations: schedule from quote, saved views, time clock, crew, channels and roles [${language}]`,async({page,browser},info)=>{
 test.setTimeout(720000);local(info.project.use.baseURL);
 const en=language==='en',tag=language+randomBytes(3).toString('hex'),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const f=await ownerFixture(page.context(),tag);let member:DisposableAccount|undefined,rival:DisposableAccount|undefined;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const owner=f.owner.id,db=f.db,today=crToday(),week=monday(today),headers={Origin:origin,'X-Pro-Expected-Actor':owner};
  member=await createDisposableAccount({prefix:'f2c-member'});rival=await createDisposableAccount({prefix:'f2c-rival'});
  await db.from('pro_company_members').insert({owner_id:owner,member_user_id:member.id,member_name:'Ana Maestra '+tag,member_email:member.email,role:'member'}).throwOnError();
  const memberRow=(await db.from('pro_company_members').select('id').eq('owner_id',owner).eq('member_user_id',member.id).single().throwOnError()).data!.id as string;
  const noticesBefore=(await db.from('notifications').select('id').in('user_id',[owner,member.id]).throwOnError()).data!.length;
  // A quote of this job with two sections and one line without section.
  const estimateId=crypto.randomUUID();
  await db.from('pro_private_estimates').insert({owner_id:owner,id:estimateId,client_id:f.clientId,client_snapshot:{},source:{kind:'work',id:f.workId,fingerprint:'0'.repeat(32)},issuer:{},title:tr('Cotización cocina ','Kitchen quote ')+tag,notes:'',currency:'CRC',subtotal_cents:0,discount_cents:0,tax_cents:0,total_cents:0,revision:1}).throwOnError();
  const lines=[[tr('Demolición','Demolition'),tr('Obra gris','Rough work'),tr('días','days'),3000],[tr('Repello de paredes','Wall plastering'),tr('Obra gris','Rough work'),'m2',24000],[tr('Gabinetes','Cabinets'),tr('Acabados','Finishes'),tr('unidad','unit'),1000],[tr('Limpieza final','Final cleaning'),null,'global',1000]] as const;
  await db.from('pro_private_estimate_items').insert(lines.map(([d,g,u,q],i)=>({owner_id:owner,estimate_id:estimateId,id:crypto.randomUUID(),position:i,content:{id:crypto.randomUUID(),description:d,unit:u,qtyMilli:q,unitPriceCents:10000,discountBps:0,taxBps:0,catalogProductId:null,...(g?{group:g}:{})}}))).throwOnError();

  // ---------- API contracts ----------
  const source=await page.request.get('/api/pro/estimate-schedule?'+new URLSearchParams({workId:f.workId}),{headers:{'X-Pro-Expected-Actor':owner}});expect(source.status()).toBe(200);
  const proposal=await source.json();expect(proposal.estimates[0].lines.map((l:{days:number})=>l.days)).toEqual([3,1,1,1]);
  expect((await page.request.get('/api/pro/estimate-schedule?workId=a&workId=b')).status()).toBe(400);
  expect((await page.request.post('/api/pro/estimate-schedule',{headers:{'X-Pro-Expected-Actor':owner},data:{}})).status()).toBe(403);
  expect((await page.request.post('/api/pro/estimate-schedule',{headers,data:{action:'apply',phases:[]}})).status()).toBe(400);
  expect((await page.request.post('/api/pro/estimate-schedule',{headers,data:{action:'apply',actionId:crypto.randomUUID(),workId:f.workId,estimateId,estimateRevision:1,revision:proposal.revision+3,startDate:today,phases:[{title:'X',tasks:[{lineId:null,title:'Y',days:1,lagDays:0}]}]}})).status()).toBe(409);
  const otherCtx=await browser.newContext({baseURL:origin});await login(otherCtx,rival);
  expect((await otherCtx.request.get(origin+'/api/pro/estimate-schedule?'+new URLSearchParams({workId:f.workId}))).status()).toBe(403);
  expect((await otherCtx.request.get(origin+'/api/pro/task-views')).status()).toBe(403);
  expect((await otherCtx.request.get(origin+'/api/pro/time-clock?'+new URLSearchParams({week}))).status()).toBe(403);
  await otherCtx.close();
  const anonymous=await browser.newContext({baseURL:origin});for(const path of ['/api/pro/task-views','/api/pro/notification-channels','/api/pro/time-clock?week='+week,'/api/pro/team-roles/custom'])expect((await anonymous.request.get(origin+path)).status(),path).toBe(401);await anonymous.close();
  expect((await page.request.get('/api/pro/time-clock?'+new URLSearchParams({week:today===week?addDay(week,1):today}))).status()).toBe(400);
  expect((await page.request.post('/api/pro/time-clock',{headers,data:{action:'clock_in',actionId:crypto.randomUUID(),workId:f.workId,taskId:null,activityId:null,billable:true,note:'',gps:{lat:9.9,lng:-84.1,accuracy:10}}})).status()).toBe(400);

  // ---------- 1. Schedule from the quote (row 13) ----------
  await openPro(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/schedule`,en);
  const schedule=page.locator('[data-project-schedule]');await expect(schedule).toBeVisible({timeout:90000});
  await schedule.locator('[data-estimate-schedule-open]').click();
  const dialog=page.locator('[data-estimate-schedule]');await expect(dialog.locator('[data-estimate-schedule-phase]')).toHaveCount(3,{timeout:60000});
  await expect(dialog.locator('[data-estimate-schedule-start]')).toHaveValue(today);
  await dialog.getByLabel(tr('Días: ','Days: ')+tr('Repello de paredes','Wall plastering'),{exact:true}).fill('2');
  await dialog.getByLabel(tr('Días de espera antes: ','Waiting days before: ')+tr('Repello de paredes','Wall plastering'),{exact:true}).fill('1');
  await dialog.getByLabel(tr('Incluir: ','Include: ')+tr('Limpieza final','Final cleaning'),{exact:true}).uncheck();
  await expect(dialog.locator('[data-estimate-schedule-summary]')).toContainText('3 '+tr('tareas','tasks'));
  await shot(page,`f2c-estimate-schedule-${language}`,project);
  await page.locator('[data-estimate-schedule-create]').click();
  await expect(schedule.locator('[data-gantt-notice]')).toContainText(tr('se agregaron 3 tareas','3 tasks added'),{timeout:60000});
  await expect(schedule).toContainText(tr('Gabinetes','Cabinets'));await expect(schedule).toContainText(tr('Acabados','Finishes'));
  const plans=(await db.from('pro_work_schedule_plans').select('task_id,planned_start,planned_end').eq('owner_id',owner).eq('work_id',f.workId).order('planned_start').throwOnError()).data!;
  expect(plans.map(p=>[p.planned_start,p.planned_end])).toEqual([[today,addDay(today,2)],[addDay(today,4),addDay(today,5)],[addDay(today,6),addDay(today,6)]]);
  expect((await db.from('pro_schedule_link_rules').select('lag_days').eq('owner_id',owner).eq('work_id',f.workId).eq('lag_days',1).throwOnError()).data!).toHaveLength(1);
  await schedule.locator('[data-schedule-mode="gantt"]').click();await schedule.locator('[data-schedule-mode="gantt"]').scrollIntoViewIfNeeded();await schedule.locator("[data-gantt-phase-label]").first().scrollIntoViewIfNeeded();await shot(page,`f2c-gantt-from-quote-${language}`,project);
  await schedule.locator('[data-schedule-mode="list"]').click();await shot(page,`f2c-schedule-list-${language}`,project);

  // ---------- 2. Saved views of the task center (row 15) ----------
  await openPro(page,`${prefix}/dashboard/pro?`+new URLSearchParams({tab:'pro_tasks',taskStatus:'all',taskSearch:tr('Gabinetes','Cabinets')}),en);
  const views=page.locator('[data-task-center-views]');await expect(views).toBeVisible({timeout:90000});
  await views.locator('[data-task-view-save]').click();await views.getByLabel(tr('Nombre de la vista','View name'),{exact:true}).fill(tr('Acabados pendientes','Finishes to do'));
  await views.getByRole('button',{name:tr('Guardar','Save'),exact:true}).click();
  const chip=views.locator(`[data-task-view="${tr('Acabados pendientes','Finishes to do')}"]`);await expect(chip).toHaveAttribute('aria-pressed','true',{timeout:60000});
  await shot(page,`f2c-task-views-${language}`,project);
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_tasks`,en);await expect(chip).toHaveAttribute('aria-pressed','false',{timeout:90000});
  await chip.click();await expect.poll(()=>new URL(page.url()).searchParams.get('taskSearch')).toBe(tr('Gabinetes','Cabinets'));await expect(chip).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-task-center]')).toContainText(tr('Gabinetes','Cabinets'),{timeout:60000});
  await views.locator(`[data-task-view-delete="${tr('Acabados pendientes','Finishes to do')}"]`).click();await expect(chip).toHaveCount(0,{timeout:60000});

  // ---------- 3. Time clock and weekly timesheet (row 22) ----------
  expect((await page.request.post('/api/pro/time-clock',{headers,data:{action:'settings',gpsEnabled:true,revision:0}})).status()).toBe(200);
  await openPro(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}`,en);
  const timer=page.locator('[data-work-timer]').first();await expect(timer.locator('[data-work-timer-task]')).toBeVisible({timeout:90000});
  await expect(timer.locator('[data-work-timer-location]')).not.toBeChecked();
  await timer.locator('[data-work-timer-task]').selectOption({label:tr('Demolición','Demolition')});
  await timer.locator('[data-work-timer-task]').scrollIntoViewIfNeeded();await shot(page,`f2c-clock-in-${language}`,project);
  await timer.getByRole('button',{name:tr('Iniciar cronómetro','Start timer'),exact:true}).click();
  await expect(timer.locator('[data-work-timer-open="running"]')).toBeVisible({timeout:60000});
  const details=(await db.from('pro_time_clock_details').select('task_id,gps').eq('owner_id',owner).throwOnError()).data!;expect(details).toHaveLength(1);expect(details[0].gps).toBeNull();
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_hours`,en);
  const clock=page.locator('[data-time-clock]');await expect(clock.locator('[data-time-clock-open]')).toContainText(tr('Demolición','Demolition'),{timeout:90000});
  // Clock out through the existing timer review (minutes corrected before saving).
  const open=(await (await page.request.get('/api/pro/work-timers')).json()).timer;
  expect((await page.request.post('/api/pro/work-timers',{headers,data:{action:'stop',actionId:crypto.randomUUID(),timerId:open.id,revision:open.revision}})).status()).toBe(200);
  const stopped=(await (await page.request.get('/api/pro/work-timers')).json()).timer;
  expect((await page.request.post('/api/pro/work-timers',{headers,data:{action:'save',actionId:crypto.randomUUID(),timerId:stopped.id,revision:stopped.revision,activityId:null,billable:true,note:tr('Cuadrilla','Crew'),minutes:240,date:today}})).status()).toBe(200);
  await page.reload();await expect(clock).toBeVisible({timeout:90000});
  const ownerName=(await db.from('profiles').select('full_name').eq('id',owner).single()).data!.full_name as string;
  const card=clock.locator('[data-timesheet-state]').filter({has:page.locator('[data-timesheet-total]',{hasText:'4 h'})});await expect(card).toHaveAttribute('data-timesheet-state','pending',{timeout:60000});
  await card.getByRole('button',{name:new RegExp(tr('Ver registros','Show entries'))}).click();await expect(card).toContainText(tr('Demolición','Demolition'));
  await shot(page,`f2c-timesheet-${language}`,project,true);
  await card.locator('[data-timesheet-approve]').click();await expect(card).toHaveAttribute('data-timesheet-state','approved',{timeout:60000});
  const download=page.waitForEvent('download',{timeout:60000});await clock.locator('[data-time-clock-export]').click();const file=await download;
  const csv=await (await import('node:fs/promises')).readFile((await file.path())!,'utf8');expect(csv.startsWith('﻿'+tr('Persona;Fecha','Person;Date'))).toBe(true);expect(csv).toContain(tr('Aprobada','Approved'));
  await shot(page,`f2c-timesheet-approved-${language}`,project);
  expect(ownerName.length).toBeGreaterThan(0);
  const decisions=(await db.from('pro_timesheet_decisions').select('decision,minutes').eq('owner_id',owner).throwOnError()).data!;expect(decisions).toEqual([{decision:'approved',minutes:240}]);

  // ---------- 4. Daily log crew from the team (row 20) ----------
  const logId=crypto.randomUUID();
  await db.from('pro_daily_logs').insert({owner_id:owner,work_id:f.workId,id:logId,log_date:today,title:tr('Avance del día ','Day progress ')+tag,summary:tr('Se terminó la demolición.','Demolition finished.'),sections:{weather:false,plan:false,tasks:false,time:false},weather:null,snapshot:{date:today,tasks:[],plan:[],minutes:null,fingerprint:'0'.repeat(32)},revision:1,created_by:owner,created_by_name:'Dueño'}).throwOnError();
  await openPro(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/updates`,en);
  const entry=page.locator(`[data-journal-entry="${logId}"]`);await expect(entry).toBeVisible({timeout:90000});
  await entry.locator('[data-journal-team-crew]').click();
  const crew=entry.locator('[data-daily-log-crew]');const ana=crew.locator(`[data-daily-log-crew-person="Ana Maestra ${tag}"]`);await expect(ana).toBeVisible({timeout:60000});
  await ana.getByRole('checkbox').check();await ana.getByLabel(tr('Horas de ','Hours of ')+'Ana Maestra '+tag,{exact:true}).fill('8');
  await entry.scrollIntoViewIfNeeded();await shot(page,`f2c-daily-crew-${language}`,project);
  await crew.locator('[data-daily-log-crew-save]').click();await expect(crew).toHaveCount(0,{timeout:60000});
  await expect(entry.locator('[data-journal-crew]')).toBeVisible({timeout:60000});
  const saved=(await db.from('pro_daily_logs').select('crew_count,crew_minutes').eq('owner_id',owner).eq('id',logId).single().throwOnError()).data!;expect(saved).toEqual({crew_count:1,crew_minutes:480});

  // ---------- 5. Notification channels (row 24) ----------
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_notifications`,en);
  const wa=page.locator('[data-notification-whatsapp="task_assigned"]');await expect(wa).toBeVisible({timeout:90000});await expect(wa).not.toBeChecked();
  await wa.check();await page.getByRole('button',{name:tr('Guardar preferencias','Save preferences'),exact:true}).click();
  await expect(page.locator('[data-notification-settings]')).toContainText(tr('Preferencias guardadas.','Preferences saved.'),{timeout:60000});
  await wa.scrollIntoViewIfNeeded();await shot(page,`f2c-notification-channels-${language}`,project);
  const channels=await (await page.request.get('/api/pro/notification-channels')).json();expect(channels.whatsapp.task_assigned).toBe(true);expect(channels.delivery).toBe('stored_not_sent');

  // ---------- 6. Custom roles (row 17) ----------
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_team`,en);
  const roles=page.locator('[data-custom-roles]');await expect(roles).toBeVisible({timeout:90000});
  await roles.locator('[data-custom-role-clone="member"]').click();
  const form=roles.locator('[data-custom-role-form]');await form.getByLabel(tr('Nombre del rol','Role name'),{exact:true}).fill(tr('Cuadrilla','Crew')+' '+tag);
  await expect(form.locator('[data-custom-role-cap="read"]')).toBeDisabled();await form.locator('[data-custom-role-cap="lead.write"]').uncheck();
  await form.scrollIntoViewIfNeeded();await shot(page,`f2c-custom-role-form-${language}`,project);
  await form.getByRole('button',{name:tr('Guardar rol','Save role'),exact:true}).click();
  await expect(roles.locator(`[data-custom-role="${tr('Cuadrilla','Crew')} ${tag}"]`)).toBeVisible({timeout:60000});
  await roles.locator(`[data-custom-role-assign="Ana Maestra ${tag}"]`).selectOption({label:tr('Cuadrilla','Crew')+' '+tag});
  await expect(roles).toContainText(tr('Asignación guardada.','Assignment saved.'),{timeout:60000});
  await roles.scrollIntoViewIfNeeded();await shot(page,`f2c-custom-roles-${language}`,project);
  const assigned=(await db.from('pro_company_member_custom_roles').select('custom_role_id').eq('owner_id',owner).eq('member_id',memberRow).throwOnError()).data!;expect(assigned).toHaveLength(1);
  const gate=await db.rpc('pro_team_route_authorize',{p_member:member.id,p_owner:owner,p_method:'POST',p_path:'/api/pro/lead-board'});expect(gate.error).toBeNull();expect(gate.data).toMatchObject({allowed:false,reason:'role'});
  expect((await db.rpc('pro_team_route_authorize',{p_member:member.id,p_owner:owner,p_method:'POST',p_path:'/api/pro/work-tasks'})).data).toMatchObject({allowed:true});

  // Nothing was sent: no new rows in the app-wide notifications table.
  expect((await db.from('notifications').select('id').in('user_id',[owner,member.id]).throwOnError()).data!.length).toBe(noticesBefore);
  expect(runtime).toEqual([]);
 }finally{const done=await Promise.allSettled([f.cleanup(),...[member,rival].filter((a):a is DisposableAccount=>!!a).map(a=>cleanupDisposableAccount(a))]);const failed=done.find(r=>r.status==='rejected');if(failed)throw (failed as PromiseRejectedResult).reason;}
});
function addDay(iso:string,n:number){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
