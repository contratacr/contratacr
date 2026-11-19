import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes,onAppPageError} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';

// Round 10 (2026-11-15): customer import/dedupe/tags/merge/export, pipeline board with won/lost reasons,
// conversion by channel, schedule dependencies (FS/SS + lag, shift preview/apply/undo, critical path),
// combined schedule, daily log autofill + reminder, task template starters/duplicate/assignee mapping,
// selection tracking/margin/bulk approval and branded prints (quote, change order, selections).
// Disposable accounts, loopback only; nothing is sent, charged or issued.
const shots=process.env.ROUND10_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const label=(language:string)=>language+randomBytes(3).toString('hex');
async function openPro(page:Page,path:string,en:boolean){
 await gotoOK(page,path);
 const failed=page.getByText(en?'Could not verify Pro access. Your data is preserved.':'No se pudo comprobar el acceso a Pro. Sus datos se conservan.');
 const ready=page.locator('[data-independent-pro]');
 await expect(failed.or(ready).first()).toBeVisible({timeout:90000});
 if(await failed.isVisible())await page.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
 await expect(ready.first()).toBeVisible({timeout:90000});
}
const newContext=(browser:import('playwright/test').Browser,info:import('playwright/test').TestInfo)=>browser.newContext({baseURL:origin,viewport:info.project.use.viewport??undefined,isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,userAgent:info.project.use.userAgent});
const crToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const addDays=(day:string,n:number)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};

for(const language of ['es','en'] as const)test(`Round 10: customers import, board and conversion [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const f=await ownerFixture(page.context(),id);
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const owner=f.owner.id,today=crToday();
  await warmLocalRoutes(page,['/api/pro/client-contacts?view=read','/api/pro/lead-board?view=board','/api/pro/lead-board?'+new URLSearchParams({view:'conversion',from:today,to:today,group:'channel'})]);
  // (1) Import with column mapping: one new, one duplicate of the fixture customer (by e-mail), one invalid.
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_clients&organizarClientes=1`,en);
  const organizer=page.locator('[data-contacts-organizer]');await expect(organizer).toBeVisible({timeout:90000});
  const csv=`Nombre completo;Correo;Celular;Etiquetas\nDiana ${id};diana.${id}@example.test;7000-${String(Math.floor(Math.random()*9000)+1000)};VIP, Cocina\nCopia;CLIENTE.${id}@example.test;;\n;sin-nombre@example.test;;\n`;
  await organizer.locator('[data-contacts-file]').setInputFiles({name:'clientes.csv',mimeType:'text/csv',buffer:Buffer.from(csv,'utf8')});
  // Fix 13 (walkthrough C4): «Nombre completo» is now recognized as the name column.
  await expect(organizer.locator('[data-contacts-map="0"]')).toHaveValue('name',{timeout:30000});await expect(organizer.locator('[data-contacts-map="1"]')).toHaveValue('email');await expect(organizer.locator('[data-contacts-map="2"]')).toHaveValue('phone');await expect(organizer.locator('[data-contacts-map="3"]')).toHaveValue('tags');
  await organizer.locator('[data-contacts-review]').click();
  await expect(organizer.locator('[data-contacts-counts]')).toHaveAttribute('data-contacts-counts','1/1/0/1',{timeout:60000});
  await expect(organizer.locator('[data-contacts-row="duplicate"]')).toContainText('Cliente ronda '+id);
  await expectNoHorizontalOverflow(page);await shot(page,`r10-contacts-preview-${language}`,project);
  await organizer.locator('[data-contacts-import-confirm]').click();
  await expect(organizer.locator('[data-contacts-notice]')).toContainText(tr('1 cliente nuevo','1 new customer'),{timeout:60000});
  const created=(await f.db.from('pro_clients').select('id,name').eq('user_id',owner).eq('name','Diana '+id)).data!;expect(created).toHaveLength(1);
  expect((await f.db.from('pro_contact_tags').select('tag').eq('owner_id',owner).eq('client_id',created[0].id)).data!.map(r=>r.tag).sort()).toEqual(['Cocina','VIP']);
  // (2) Duplicates: a second record of the fixture customer (same e-mail, no records) is merged into it.
  const dupId='r10-dup-'+id;const rev=(await f.db.from('pro_workspace_core').select('revision').eq('user_id',owner).single()).data!.revision as number;
  expect((await f.db.rpc('pro_mutate_catalog',{p_user:owner,p_kind:'clients',p_rows:[{id:dupId,name:'Cliente R. '+id,email:'cliente.'+id+'@example.test',phone:'8888-1234',notes:'Prefiere WhatsApp',archived:false}],p_revision:rev,p_movements:[],p_importing:true})).error).toBeNull();
  await page.reload();await expect(organizer).toBeVisible({timeout:90000});
  await organizer.getByRole('tab',{name:new RegExp(tr('Duplicados','Duplicates'))}).click();
  const group=organizer.locator('[data-contacts-group="email"]').filter({hasText:'Cliente R. '+id});await expect(group).toBeVisible({timeout:60000});
  await group.locator(`[data-contacts-merge="${dupId}"]`).click();await page.getByRole('button',{name:tr('Combinar','Merge'),exact:true}).click();
  await expect(organizer.locator('[data-contacts-notice]')).toContainText(tr('Clientes combinados.','Customers merged.'),{timeout:60000});
  const merged=(await f.db.from('pro_clients').select('id,archived,phone,notes').in('id',[f.clientId,dupId]).eq('user_id',owner)).data!;
  expect(merged.find(c=>c.id===dupId)!.archived).toBe(true);expect(merged.find(c=>c.id===f.clientId)!.phone).toBe('8888-1234');expect(merged.find(c=>c.id===f.clientId)!.notes).toContain('Prefiere WhatsApp');
  await shot(page,`r10-contacts-merge-${language}`,project);
  // The job's customer keeps its records; refusing to archive it is enforced by the server (400 + reason).
  const refuse=await page.request.post('/api/pro/client-contacts',{headers:{Origin:origin},data:{action:'merge',actionId:crypto.randomUUID(),revision:rev+2,keepId:created[0].id,mergeId:f.clientId}});expect(refuse.status()).toBe(400);expect((await refuse.json()).reason).toBe('merge_records');
  // (3) Tags and export (CSV for Excel, filtered by tag).
  await organizer.getByRole('tab',{name:tr('Etiquetas y exportar','Tags and export')}).click();
  await organizer.locator('[data-contacts-export-tag]').fill('vip');const download=page.waitForEvent('download',{timeout:60000}).catch(()=>null);await organizer.locator('[data-contacts-export]').click();
  await expect(organizer.locator('[data-contacts-notice]')).toContainText(tr('Exportación lista: 1 cliente.','Export ready: 1 customer.'),{timeout:60000});await download;
  const exported=await page.request.get('/api/pro/client-contacts?'+new URLSearchParams({view:'export',tag:'VIP'}));expect(exported.status()).toBe(200);expect((await exported.json()).items.map((c:{name:string})=>c.name)).toEqual(['Diana '+id]);
  await page.keyboard.press('Escape');
  // (4) Pipeline board: two manual leads; move by keyboard and by «Move to»; mark one lost with a reason.
  const leadA=crypto.randomUUID(),leadB=crypto.randomUUID();
  await f.db.from('pro_lead_center_records').insert([{owner_id:owner,kind:'manual',id:leadA,client_id:f.clientId,title:tr('Cocina tablero ','Kitchen board ')+id,description:'',address:'',source_label:'',project_type:'',currency:'CRC',revenue_cents:250000000,stage_mode:'automatic',revision:1},{owner_id:owner,kind:'manual',id:leadB,client_id:f.clientId,title:tr('Terraza tablero ','Deck board ')+id,description:'',address:'',source_label:'',project_type:'',currency:'CRC',stage_mode:'automatic',revision:1}]).throwOnError();
  await f.db.from('pro_lead_origin_assignments').insert({owner_id:owner,kind:'manual',id:leadA,manual_id:leadA,channel_id:'referral',revision:1}).throwOnError();
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_leads&tablero=1`,en);const board=page.locator('[data-lead-board]');
  const cardA=board.locator(`[data-lead-board-card="${leadA}"]`);await expect(cardA).toBeVisible({timeout:90000});
  await expect(board.locator('[data-lead-board-column="new"]').locator(`[data-lead-board-card="${leadA}"]`)).toBeVisible();await expect(cardA).toContainText(/2[.,]500[.,]000/);
  await cardA.locator('[data-lead-board-handle]').focus();await page.keyboard.press('ArrowRight');
  await expect(board.locator('[data-lead-board-column="followed_up"]').locator(`[data-lead-board-card="${leadA}"]`)).toBeVisible({timeout:60000});
  await board.locator(`[data-lead-board-move="${leadA}"]`).selectOption('estimate_sent');
  await expect(board.locator('[data-lead-board-column="estimate_sent"]').locator(`[data-lead-board-card="${leadA}"]`)).toBeVisible({timeout:60000});
  expect((await f.db.from('pro_lead_center_records').select('stage_id,revision').eq('id',leadA).single()).data).toEqual({stage_id:'estimate_sent',revision:3});
  expect((await f.db.from('pro_lead_center_history').select('action').eq('id',leadA)).data!.filter(r=>r.action==='set_stage')).toHaveLength(2);
  if(!info.project.use.isMobile){// Pointer drag (desktop): leadB from New to Connected.
   const handle=board.locator(`[data-lead-board-card="${leadB}"] [data-lead-board-handle]`),target=board.locator('[data-lead-board-column="connected"]');
   await handle.scrollIntoViewIfNeeded();const from=(await handle.boundingBox())!;await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
   await target.scrollIntoViewIfNeeded();const to=(await target.boundingBox())!;await page.mouse.move(to.x+to.width/2,to.y+60,{steps:8});await page.mouse.up();
   await expect(target.locator(`[data-lead-board-card="${leadB}"]`)).toBeVisible({timeout:60000});
  }
  await board.locator(`[data-lead-board-mark="${leadB}"]`).click();const dialog=page.locator('[data-lead-outcome-dialog]');await expect(dialog).toBeVisible();
  await dialog.locator('[data-lead-outcome-reason]').selectOption('competitor');await page.locator('[data-lead-outcome-save]').click();
  await expect(board.locator(`[data-lead-board-card="${leadB}"] [data-lead-board-outcome="lost"]`)).toContainText(tr('Eligió a otra empresa','Chose another company'),{timeout:60000});
  await expectNoHorizontalOverflow(page);await shot(page,`r10-board-${language}`,project);
  await board.locator('[data-lead-board-hide-lost]').check();await expect(board.locator(`[data-lead-board-card="${leadB}"]`)).toHaveCount(0,{timeout:60000});
  // Stale revision → 409 (no overwrite).
  expect((await page.request.post('/api/pro/lead-board',{headers:{Origin:origin},data:{action:'move',actionId:crypto.randomUUID(),kind:'manual',id:leadA,revision:1,catalogRevision:0,stageId:'won'}})).status()).toBe(409);
  // (5) Conversion by channel and CSV.
  await page.locator('[data-lead-conversion-open]').click();const conv=page.locator('[data-lead-conversion]');
  await expect(conv.locator('[data-lead-conversion-row="referral"] [data-col="estimate"]')).toHaveText('1',{timeout:60000});
  await expect(conv.locator('[data-lead-conversion-row="unspecified"] [data-col="lost"]')).toHaveText('1');
  await shot(page,`r10-conversion-${language}`,project);
  const csvReport=await page.request.get('/api/pro/lead-board?'+new URLSearchParams({view:'conversion',from:today,to:today,group:'channel',format:'csv',lang:language}));expect(csvReport.status()).toBe(200);
  expect((await csvReport.text()).replace(/^﻿/,'').split('\r\n')[0]).toBe(tr('"Canal";"Recibidas";"Llegaron a reunión";"Llegaron a cotización";"Ganadas";"Perdidas";"Convertidas en trabajo";"Conversión %"','"Channel";"Received";"Reached meeting";"Reached quote";"Won";"Lost";"Converted to job";"Conversion %"'));
  expect(runtime).toEqual([]);
 }finally{await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`Round 10: schedule dependencies, combined schedule, daily log and templates [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const f=await ownerFixture(page.context(),id);
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const owner=f.owner.id,today=crToday(),t1=crypto.randomUUID(),t2=crypto.randomUUID(),t3=crypto.randomUUID();
  await warmLocalRoutes(page,['/api/pro/schedule-links?'+new URLSearchParams({view:'links',workId:f.workId}),'/api/pro/project-schedule?'+new URLSearchParams({workId:f.workId}),'/api/pro/daily-log-autofill?'+new URLSearchParams({workId:f.workId,date:today})]);
  await f.db.from('pro_work_tasks').insert([{owner_id:owner,work_id:f.workId,id:t1,title:tr('Demoler ','Demolish ')+id,details:'',assignee:''},{owner_id:owner,work_id:f.workId,id:t2,title:tr('Tubería ','Plumbing ')+id,details:'',assignee:''},{owner_id:owner,work_id:f.workId,id:t3,title:tr('Enchape ','Tiling ')+id,details:'',assignee:''}]).throwOnError();
  await f.db.from('pro_work_schedule_plans').insert([{owner_id:owner,work_id:f.workId,task_id:t1,planned_start:today,planned_end:addDays(today,2)},{owner_id:owner,work_id:f.workId,task_id:t2,planned_start:addDays(today,3),planned_end:addDays(today,5)},{owner_id:owner,work_id:f.workId,task_id:t3,planned_start:addDays(today,6),planned_end:addDays(today,8)}]).throwOnError();
  await f.db.from('pro_work_schedule_dependencies').insert([{owner_id:owner,work_id:f.workId,task_id:t2,predecessor_id:t1},{owner_id:owner,work_id:f.workId,task_id:t3,predecessor_id:t2}]).throwOnError();
  await f.db.from('pro_work_schedule_heads').insert({owner_id:owner,work_id:f.workId,revision:1}).throwOnError();
  // (1) Rules, critical path, shift preview/apply/undo.
  await openPro(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/schedule`,en);const links=page.locator('[data-schedule-links]');
  await expect(links.locator('[data-schedule-critical-item]')).toHaveCount(3,{timeout:90000});
  await page.locator('[data-schedule-mode="gantt"]').first().click();// phones open the list view first
  await expect(page.locator(`[data-schedule-bar="${t3}"]`).first()).toHaveAttribute('data-schedule-critical','true',{timeout:60000});
  const rule=links.locator(`[data-schedule-rule="${t3}:${t2}"]`);await rule.locator('[data-schedule-rule-kind]').selectOption('ss');await rule.locator('[data-schedule-rule-lag]').fill('1');await rule.locator('[data-schedule-rule-save]').click();
  await expect(links.locator('[data-schedule-links-notice]')).toContainText(tr('Dependencia guardada.','Dependency saved.'),{timeout:60000});
  await links.locator('[data-schedule-shift-task]').selectOption(t1);await links.locator('[data-schedule-shift-start]').fill(addDays(today,2));
  await expect(links.locator('[data-schedule-shift-end]')).toHaveValue(addDays(today,4));await links.locator('[data-schedule-shift-preview]').click();
  await expect(links.locator('[data-schedule-shift-change]')).toHaveCount(2,{timeout:60000});await expect(links.locator(`[data-schedule-shift-change="${t2}"]`)).toBeVisible();
  await expectNoHorizontalOverflow(page);await shot(page,`r10-schedule-preview-${language}`,project);
  expect((await f.db.from('pro_work_schedule_plans').select('planned_start').eq('task_id',t1).single()).data!.planned_start).toBe(today);
  await links.locator('[data-schedule-shift-apply]').click();await expect(links.locator('[data-schedule-links-notice]')).toContainText(tr('2 tareas movidas','2 tasks moved'),{timeout:60000});
  const moved=(await f.db.from('pro_work_schedule_plans').select('task_id,planned_start,planned_end').eq('work_id',f.workId)).data!;
  expect(moved.find(r=>r.task_id===t2)).toMatchObject({planned_start:addDays(today,5),planned_end:addDays(today,7)});// SS + 1 after Plumbing's new start: Tiling (already day 6) does not move.
  expect(moved.find(r=>r.task_id===t3)).toMatchObject({planned_start:addDays(today,6),planned_end:addDays(today,8)});
  await links.locator('[data-schedule-undo-button]').click();await expect(links.locator('[data-schedule-links-notice]')).toContainText(tr('Cambio deshecho','Change undone'),{timeout:60000});
  expect((await f.db.from('pro_work_schedule_plans').select('planned_start').eq('task_id',t2).single()).data!.planned_start).toBe(addDays(today,3));
  await shot(page,`r10-schedule-${language}`,project,true);
  // (2) Combined schedule in the task center.
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_tasks`,en);await page.locator('[data-multi-schedule-toggle]').click();
  const multi=page.locator('[data-multi-schedule]');await expect(multi.locator(`[data-multi-schedule-job="${f.workId}"] [data-multi-schedule-task]`)).toHaveCount(3,{timeout:90000});
  await shot(page,`r10-multi-schedule-${language}`,project);
  // (3) Daily log autofill: hours of today and a task completed today; reminder for yesterday.
  expect((await f.db.rpc('pro_time_mutate',{p_actor:owner,p_input:{action:'manual',actionId:crypto.randomUUID(),entryId:crypto.randomUUID(),workId:f.workId,activityId:null,billable:false,date:today,minutes:90,note:''}})).error).toBeNull();
  expect((await f.db.rpc('pro_time_mutate',{p_actor:owner,p_input:{action:'manual',actionId:crypto.randomUUID(),entryId:crypto.randomUUID(),workId:f.workId,activityId:null,billable:false,date:addDays(today,-1),minutes:30,note:''}})).error).toBeNull();
  expect((await f.db.rpc('pro_work_tasks_mutate',{p_actor:owner,p_input:{action:'complete',actionId:crypto.randomUUID(),workId:f.workId,taskId:t1,revision:1}})).error).toBeNull();
  await openPro(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/updates`,en);
  await page.getByRole('button',{name:tr('Nuevo resumen','New daily log'),exact:true}).first().click();const form=page.locator('[data-daily-log-form]');await expect(form).toBeVisible({timeout:60000});
  await form.locator('[data-daily-log-autofill-button]').click();await expect(form.locator('[data-daily-log-autofill-result]')).toBeVisible({timeout:60000});
  const summary=form.getByLabel(tr('Resumen','Summary'),{exact:true});await expect(summary).toHaveValue(new RegExp(tr('Completado: Demoler ','Completed: Demolish ')+id));await expect(summary).toHaveValue(/1 h 30 min/);
  // Fix 13: the sample weather is not written silently; copying it is explicit and keeps the «sample» note.
  expect((await form.locator('textarea').evaluateAll(els=>els.map(e=>(e as HTMLTextAreaElement).value))).some(v=>v.includes(tr('Clima de ejemplo (simulado','Sample weather (simulated')))).toBe(false);
  await form.locator('[data-daily-log-autofill-weather-use]').click();await expect(form.locator('[data-daily-log-autofill-weather-used]')).toBeVisible();
  await expect(form.locator(`select[aria-label="${tr('Clima','Weather')}"]`)).toHaveValue(/^(clear|cloudy|rain)$/);expect((await form.locator('textarea').evaluateAll(els=>els.map(e=>(e as HTMLTextAreaElement).value))).some(v=>v.includes(tr('Clima de ejemplo (simulado','Sample weather (simulated')))).toBe(true);
  await expectNoHorizontalOverflow(page);await shot(page,`r10-daily-autofill-${language}`,project);
  const notif=await page.request.get('/api/pro/notifications?view=all');expect(notif.status()).toBe(200);
  expect((await notif.json()).items.some((n:{event:string;link:{cita?:string}})=>n.event==='daily_log_missing'&&n.link.cita===f.workId)).toBe(true);
  // (4) Task templates: starter → save; duplicate; apply with assignee mapping.
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_tasks`,en);await page.locator('[data-task-templates-trigger]').click();
  await page.locator('[data-task-template-starter]').selectOption('paint');await expect(page.getByLabel(tr('Nombre','Name'),{exact:true})).toHaveValue(tr('Pintura interior','Interior painting'));
  await page.getByRole('button',{name:tr('Guardar plantilla','Save template'),exact:true}).click();
  const tpl=page.locator('[data-task-templates-catalogue]');await expect(tpl).toContainText(tr('Pintura interior','Interior painting'),{timeout:60000});
  const saved=(await f.db.from('pro_task_templates').select('id,name').eq('owner_id',owner)).data!;expect(saved).toHaveLength(1);
  await tpl.getByRole('button',{name:tr('Aplicar a trabajo','Apply to job'),exact:true}).first().click();
  await page.locator(`[data-task-template-job="${f.workId}"]`).getByRole('button',{name:tr('Usar este trabajo','Use this job'),exact:true}).click({timeout:60000});
  await page.getByRole('button',{name:tr('Vista previa','Preview'),exact:true}).click();
  const map=page.locator(`[data-task-template-map="${tr('Pintor','Painter')}"]`);await expect(map).toBeVisible({timeout:60000});await map.selectOption('');
  await shot(page,`r10-template-mapping-${language}`,project);
  await page.getByRole('button',{name:tr('Aplicar plantilla','Apply template'),exact:true}).first().click();await page.getByRole('button',{name:tr('Aplicar plantilla','Apply template'),exact:true}).last().click();
  await expect(page.getByText(tr('Se agregaron las tareas al trabajo con los responsables elegidos.','Tasks added to the job with the chosen assignees.'))).toBeVisible({timeout:60000});
  const applied=(await f.db.from('pro_work_tasks').select('title,assignee').eq('work_id',f.workId).eq('owner_id',owner)).data!;
  expect(applied.filter(r=>r.assignee===tr('Pintor','Painter'))).toHaveLength(0);expect(applied.some(r=>r.title===tr('Preparar superficies','Prepare surfaces')&&r.assignee==='')).toBe(true);
  expect(runtime).toEqual([]);
 }finally{await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`Round 10: selections tracking, bulk approval and branded prints [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const f=await ownerFixture(page.context(),id);let customer:DisposableAccount|null=null;const customerContext:BrowserContext=await newContext(browser,info);
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const owner=f.owner.id,headers={Origin:origin,'X-Pro-Expected-Actor':owner},area=crypto.randomUUID(),i1=crypto.randomUUID(),i2=crypto.randomUUID(),o1=crypto.randomUUID(),o2=crypto.randomUUID(),o3=crypto.randomUUID();
  await warmLocalRoutes(page,['/api/pro/selections-tracking?workId='+encodeURIComponent(f.workId),'/api/pro/selections?workId='+encodeURIComponent(f.workId)]);
  // Customer linked to the job (confirmed request) with the selections section on.
  customer=await createDisposableAccount({prefix:'r10-cust'});await login(customerContext,customer);
  const prof=(await f.db.from('professionals').select('id,slug').eq('profile_id',owner).single()).data!,requestId=crypto.randomUUID();
  await f.db.from('pro_appointment_requests').insert({id:requestId,professional_id:prof.id,owner_id:owner,client_user_id:customer.id,client_name:'Cliente ronda '+id,professional_name:'Remodelaciones',professional_slug:prof.slug,service:'Remodelación de cocina '+id,duration_minutes:60,location_kind:'agree',location_text:'',note:'',requested_start:crToday()+'T11:00:00-06:00',status:'confirmed',revision:0,work_id:f.workId}).throwOnError();
  await f.db.from('pro_client_dashboards').upsert({owner_id:owner,work_id:f.workId,show_selections:true}).throwOnError();
  const steps=[{action:'area_create',actionId:crypto.randomUUID(),id:area,name:tr('Cocina','Kitchen'),workId:f.workId},
   ...[[i1,tr('Grifo','Faucet')],[i2,tr('Sobre','Countertop')]].map(([item,name])=>({action:'item_create',actionId:crypto.randomUUID(),id:item,areaId:area,name,dueDate:null,notes:null,allowanceId:null,workId:f.workId}))];
  for(const input of steps)expect((await page.request.post('/api/pro/selections',{headers,data:input})).status()).toBe(200);
  const opt=(item:string,optionId:string,name:string,unit:number,revision:number)=>({action:'option_add',actionId:crypto.randomUUID(),id:item,optionId,workId:f.workId,revision,name,brand:null,url:null,quantity:2,unitCents:unit,clientNotes:null,imageFileId:null});
  for(const input of [opt(i1,o1,'Grifo A '+id,5000000,1),opt(i1,o2,'Grifo B '+id,9000000,2),opt(i2,o3,'Cuarzo '+id,15000000,1),{action:'recommend',actionId:crypto.randomUUID(),id:i1,optionId:o1,workId:f.workId,revision:3},{action:'recommend',actionId:crypto.randomUUID(),id:i2,optionId:o3,workId:f.workId,revision:2},{action:'publish',actionId:crypto.randomUUID(),id:i1,workId:f.workId,revision:4},{action:'publish',actionId:crypto.randomUUID(),id:i2,workId:f.workId,revision:3}])
   {const r=await page.request.post('/api/pro/selections',{headers,data:input});expect(r.status(),await r.text()).toBe(200);}
  // (1) Customer approves both recommended options in one step.
  const cust=await customerContext.newPage();await gotoOK(cust,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`);
  const bulk=cust.locator('[data-client-bulk-approve]');await expect(bulk).toBeVisible({timeout:90000});await expect(bulk).toContainText(tr('Grifo','Faucet'));
  await expectNoHorizontalOverflow(cust);await shot(cust,`r10-client-bulk-${language}`,project);
  await bulk.locator('[data-client-bulk-approve-button]').click();
  await expect(cust.getByText(tr('2 selecciones aprobadas.','2 selections approved.'))).toBeVisible({timeout:60000});await expect(bulk).toHaveCount(0);
  expect((await f.db.from('pro_work_selection_items').select('status').in('id',[i1,i2])).data!.every(r=>r.status==='approved')).toBe(true);
  expect((await f.db.from('pro_work_selection_history').select('action,side').eq('owner_id',owner).eq('action','approve')).data!.every(r=>r.side==='client')).toBe(true);
  // The owner is not the customer: bulk approval as the owner is refused.
  expect((await page.request.post('/api/pro/selections-tracking',{headers,data:{action:'approve_many',actionId:crypto.randomUUID(),requestId,items:[{id:i1,optionId:o1,revision:6}]}})).status()).toBe(403);
  // (2) Owner: margin from the internal cost and bulk «Ordered».
  await openPro(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/selections`,en);const track=page.locator('[data-selection-tracking]');
  await expect(track.locator(`[data-selection-track-item="${i1}"]`)).toBeVisible({timeout:90000});
  const optCost=track.locator(`[data-selection-option-cost="${o1}"]`);await track.locator(`[data-selection-track-item="${i1}"] summary`).click();
  await optCost.locator('[data-selection-cost-input]').fill('35000');await optCost.locator('[data-selection-cost-save]').click();
  await expect(track.locator(`[data-selection-option-cost="${o1}"] [data-selection-margin]`)).toContainText('30',{timeout:60000});
  for(const item of [i1,i2])await track.locator(`[data-selection-track-item="${item}"]`).getByRole('checkbox').check();
  await track.locator('[data-selection-bulk-status]').selectOption('ordered');await track.locator('[data-selection-bulk-apply]').click();
  await expect(track.locator(`[data-selection-track-item="${i2}"] [data-selection-track-status="ordered"]`)).toBeVisible({timeout:60000});
  await expectNoHorizontalOverflow(page);await shot(page,`r10-selection-tracking-${language}`,project);
  const tracking=(await f.db.from('pro_work_selection_tracking').select('item_id,status,ordered_on').eq('owner_id',owner)).data!;expect(tracking.filter(r=>r.status==='ordered'&&r.ordered_on===crToday())).toHaveLength(2);
  // (3) Branded prints (company branding applies; no internal cost).
  expect((await page.request.post('/api/pro/document-branding',{headers,data:{actionId:crypto.randomUUID(),revision:0,theme:'bosque',displayName:'Remodelaciones '+id,tagline:tr('Calidad en cada detalle','Quality in every detail'),footer:tr('Gracias por su confianza.','Thank you for your trust.'),logo:null}})).status()).toBe(200);
  const sheet=await page.request.get('/api/pro/selections-print?'+new URLSearchParams({workId:f.workId,lang:language}));expect(sheet.status()).toBe(200);const sheetHtml=await sheet.text();
  expect(sheetHtml).toContain('data-selections-print');expect(sheetHtml).toContain('data-document-branding="bosque"');expect(sheetHtml).toContain('Remodelaciones '+id);/* Round 11: the random CSP nonce may contain «35»; check the content without it. */expect(sheetHtml.replace(/nonce="[^"]*"/g,'')).not.toContain('35');expect(sheetHtml).toContain(tr('Pedido','Ordered'));
  const changeId=crypto.randomUUID();
  await f.db.from('pro_work_changes').insert({owner_id:owner,id:changeId,work_id:f.workId,reason:tr('Cambio de grifo','Faucet change'),lines:[{description:tr('Grifo de mayor calidad','Better faucet'),amountCents:3999900,qtyMilli:1000,unitCostCents:3000000,markupBps:3333}],base_cents:10000000,base_position:0,delta_cents:3999900,total_cents:13999900,status:'proposed'}).throwOnError();
  const change=await page.request.get('/api/pro/work-changes-print?'+new URLSearchParams({id:changeId,lang:language}));expect(change.status()).toBe(200);const changeHtml=await change.text();
  expect(changeHtml).toContain('data-change-order-print');expect(changeHtml).toContain('data-change-print-total="13999900"');expect(changeHtml).toContain('data-document-branding="bosque"');expect(changeHtml).not.toContain('3000000');expect(changeHtml).not.toContain('30.000');
  expect((await page.request.get('/api/pro/work-changes-print?'+new URLSearchParams({id:crypto.randomUUID()}))).status()).toBe(404);
  await page.goto('/api/pro/work-changes-print?'+new URLSearchParams({id:changeId,lang:language}));await expect(page.locator('[data-change-order-print]')).toBeVisible();await shot(page,`r10-change-print-${language}`,project,true);
  await page.goto('/api/pro/selections-print?'+new URLSearchParams({workId:f.workId,lang:language}));await expect(page.locator('[data-selections-print]')).toBeVisible();await expectNoHorizontalOverflow(page);await shot(page,`r10-selections-print-${language}`,project,true);
  // Quote print: a private estimate with an internal cost that must not be printed.
  const estimateId=crypto.randomUUID(),ctx=await page.request.get('/api/pro/private-estimates?'+new URLSearchParams({view:'context',clientId:f.clientId}),{headers:{'X-Pro-Expected-Actor':owner}});
  if(ctx.status()===200){const context=await ctx.json();
   const save=await page.request.post('/api/pro/private-estimates',{headers,data:{action:'save',actionId:crypto.randomUUID(),estimateId,revision:0,clientId:f.clientId,refreshClient:false,clientFingerprint:context.clientFingerprint,source:null,issuer:{...context.issuer,issuerName:context.issuer.issuerName||'Remodelaciones '+id},title:tr('Cocina completa ','Full kitchen ')+id,notes:'',currency:'CRC',validUntil:null,lines:[{id:crypto.randomUUID(),description:tr('Gabinetes','Cabinets'),unit:'u',qtyMilli:2000,unitPriceCents:12500000,discountBps:0,taxBps:1300,catalogProductId:null,unitCostCents:7777700,group:tr('Muebles','Furniture')}]}});
   expect(save.status(),await save.text()).toBe(200);
   const quote=await page.request.get('/api/pro/quote-print?'+new URLSearchParams({estimateId,lang:language}));expect(quote.status()).toBe(200);const quoteHtml=await quote.text();
   expect(quoteHtml).toContain('data-quote-print');expect(quoteHtml).toContain('data-document-branding="bosque"');expect(quoteHtml).toContain(tr('Muebles','Furniture'));expect(quoteHtml).not.toContain('77.777');expect(quoteHtml).toContain('data-quote-print-total="28250000"');
   await page.goto('/api/pro/quote-print?'+new URLSearchParams({estimateId,lang:language}));await expect(page.locator('[data-quote-print]')).toBeVisible();await expectNoHorizontalOverflow(page);await shot(page,`r10-quote-print-${language}`,project,true);
  }else throw Error('private estimate context '+ctx.status()+' '+await ctx.text());
  expect(runtime).toEqual([]);
 }finally{await customerContext.close();if(customer)await cleanupDisposableAccount(customer);await f.cleanup();}
});
