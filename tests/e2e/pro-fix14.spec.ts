import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes,onAppPageError} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';

// Fix round 14 (2026-11-16), after Round 13: the leads list counters follow a move on the board and the
// won/lost actions are real buttons; the customer's project has one messages card and its own page
// (/dashboard/mi-proyecto/<id>: Back, deep link, only the linked customer); Gantt leftovers (today line
// above bars, plan period in the sidebar, critical path explained, plan list by date, edit in place,
// unsaved-changes notice under the bell, short rule labels); openings subtracted from an area in
// Mediciones (row 66) and per-item customer approval of a shared quote (row 39).
// Disposable accounts, loopback only; nothing is sent, charged or issued.
const shots=process.env.FIX14_SHOTS_DIR,logs=process.env.FIX14_LOGS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});const size=page.viewportSize();
 if(size&&size.width>=1024){await page.setViewportSize({width:1440,height:size.height});await page.waitForTimeout(300);}
 await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});if(size&&size.width>=1024)await page.setViewportSize(size);}
const label=(language:string)=>language+randomBytes(3).toString('hex');
const newContext=(browser:import('playwright/test').Browser,info:import('playwright/test').TestInfo)=>browser.newContext({baseURL:origin,viewport:info.project.use.viewport??undefined,isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,userAgent:info.project.use.userAgent});
const crToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const addDays=(day:string,n:number)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
async function openPro(page:Page,path:string,en:boolean){
 await gotoOK(page,path);
 const failed=page.getByText(en?'Could not verify Pro access. Your data is preserved.':'No se pudo comprobar el acceso a Pro. Sus datos se conservan.');
 const ready=page.locator('[data-independent-pro]');
 await expect(failed.or(ready).first()).toBeVisible({timeout:90000});
 if(await failed.isVisible())await page.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
 await expect(ready.first()).toBeVisible({timeout:90000});
}
/** Console errors/warnings and the text of the Next dev indicator (investigation of the «1 Issue» badge). */
function watchConsole(page:Page,sink:string[]){page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')sink.push(`[${m.type()}] ${m.text().slice(0,600)}`);});}
async function devIndicator(page:Page){return page.evaluate(()=>{const host=document.querySelector('nextjs-portal');const root=host?.shadowRoot;return root?(root.textContent??'').replace(/\s+/g,' ').trim().slice(0,300):'';});}
async function planImage(){
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="#ffffff"/><g fill="none" stroke="#1f2937" stroke-width="8"><rect x="120" y="60" width="960" height="480"/><line x1="420" y1="60" x2="420" y2="540"/></g></svg>';
 return sharp(Buffer.from(svg)).png().toBuffer();
}

for(const language of ['es','en'] as const)test(`Fix 14: board counters, Gantt leftovers and area openings [${language}]`,async({page},info)=>{
 test.setTimeout(900000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'/es';
 const f=await ownerFixture(page.context(),id);const consoleLines:string[]=[];
 try{
  const owner=f.owner.id,headers={Origin:origin,'X-Pro-Expected-Actor':owner},runtime:string[]=[];onAppPageError(page,m=>runtime.push(m));watchConsole(page,consoleLines);
  const today=crToday(),t1=crypto.randomUUID(),t2=crypto.randomUUID(),t3=crypto.randomUUID();
  await warmLocalRoutes(page,['/api/pro/lead-board?view=board','/api/pro/project-schedule?'+new URLSearchParams({workId:f.workId}),'/api/pro/schedule-links?'+new URLSearchParams({view:'links',workId:f.workId}),'/api/pro/takeoffs?'+new URLSearchParams({workId:f.workId}),'/api/pro/work-header?'+new URLSearchParams({workId:f.workId})]);
  // (1a/1b) Board: the list counters follow a move; «Lost…» / «Won…» are outlined buttons.
  const leads=[crypto.randomUUID(),crypto.randomUUID()];
  await f.db.from('pro_lead_center_records').insert(leads.map((lead,n)=>({owner_id:owner,kind:'manual',id:lead,client_id:f.clientId,title:tr('Solicitud F14 ','Lead F14 ')+n+' '+id,description:'',address:'',source_label:'',project_type:'',currency:'CRC',stage_mode:'automatic',revision:1}))).throwOnError();
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_leads&tablero=1`,en);const board=page.locator('[data-lead-board]');
  const card=board.locator(`[data-lead-board-card="${leads[0]}"]`);await expect(card).toBeVisible({timeout:90000});
  const stages=await board.locator('[data-lead-board-column]').evaluateAll(els=>els.map(e=>(e as HTMLElement).dataset.leadBoardColumn!));
  const target=stages[3];const desktop=(page.viewportSize()?.width??0)>=1024;
  const listCount=async(stage:string)=>desktop?(await page.locator(`[data-lead-inbox="stage:${stage}"] [data-lead-inbox-count]`).textContent())?.trim():
   (await page.locator('[data-lead-inbox-select]').locator(`option[value="stage:${stage}"]`).textContent())?.match(/\((\d+)\)/)?.[1];
  await expect.poll(()=>listCount(stages[0]),{timeout:60000}).toBe('2');await expect.poll(()=>listCount(target)).toBe('0');
  await board.locator(`[data-lead-board-move="${leads[0]}"]`).selectOption(target);
  await expect(board.locator(`[data-lead-board-column="${target}"] [data-lead-board-card="${leads[0]}"]`)).toBeVisible({timeout:60000});
  await expect.poll(()=>listCount(target),{timeout:60000}).toBe('1');await expect.poll(()=>listCount(stages[0])).toBe('1');
  const lost=board.locator(`[data-lead-board-mark="${leads[1]}"]`),won=board.locator(`[data-lead-board-mark-won="${leads[1]}"]`);
  for(const button of [lost,won]){const style=await button.evaluate(el=>{const s=getComputedStyle(el);return {border:parseFloat(s.borderTopWidth),color:s.borderTopColor};});expect(style.border).toBeGreaterThan(0);expect(style.color).not.toBe('rgba(0, 0, 0, 0)');}
  await page.waitForTimeout(1500);consoleLines.push('DEV INDICATOR (board): '+await devIndicator(page));
  await board.locator(`[data-lead-board-card="${leads[0]}"]`).scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await shot(page,`f14-board-moved-${language}`,project);
  // (3) Gantt leftovers on a job with three chained tasks; the first one spans today.
  await f.db.from('pro_work_tasks').insert([{owner_id:owner,work_id:f.workId,id:t1,title:tr('Demoler ','Demolish ')+id,details:'',assignee:''},{owner_id:owner,work_id:f.workId,id:t2,title:tr('Tubería ','Plumbing ')+id,details:'',assignee:''},{owner_id:owner,work_id:f.workId,id:t3,title:tr('Enchape ','Tiling ')+id,details:'',assignee:''}]).throwOnError();
  await f.db.from('pro_work_schedule_plans').insert([{owner_id:owner,work_id:f.workId,task_id:t1,planned_start:addDays(today,-1),planned_end:addDays(today,1)},{owner_id:owner,work_id:f.workId,task_id:t2,planned_start:addDays(today,2),planned_end:addDays(today,4)},{owner_id:owner,work_id:f.workId,task_id:t3,planned_start:addDays(today,5),planned_end:addDays(today,7)}]).throwOnError();
  await f.db.from('pro_work_schedule_dependencies').insert([{owner_id:owner,work_id:f.workId,task_id:t2,predecessor_id:t1},{owner_id:owner,work_id:f.workId,task_id:t3,predecessor_id:t2}]).throwOnError();
  await f.db.from('pro_work_schedule_heads').insert({owner_id:owner,work_id:f.workId,revision:1}).throwOnError();
  await openPro(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/schedule`,en);
  const links=page.locator('[data-schedule-links]');await expect(links.locator('[data-schedule-critical-item]')).toHaveCount(3,{timeout:90000});
  await page.locator('[data-schedule-mode="gantt"]').first().click();
  const bar=page.locator(`[data-schedule-bar="${t1}"]`).first(),line=page.locator('[data-schedule-today-overlay]').first();await expect(bar).toBeVisible({timeout:60000});await expect(line).toBeAttached();
  const [b,l]=[await bar.boundingBox(),await line.boundingBox()];expect(b&&l&&l.x>=b.x&&l.x<=b.x+b.width,'the today line crosses the first bar').toBe(true);
  expect(await line.evaluate(el=>Number(getComputedStyle(el.parentElement!).zIndex))).toBeGreaterThan(5);
  const sidebar=page.locator('[data-work-sidebar-period]');if(await sidebar.count())await expect(sidebar.first()).toContainText('Plan:',{timeout:60000});
  const help=links.locator('[data-schedule-critical-help]');await help.locator('summary').click();await expect(help).toContainText(tr('no tiene margen','has no slack'));
  const rule=links.locator(`[data-schedule-rule="${t3}:${t2}"]`);await expect(rule.locator('[data-schedule-rule-help]')).toContainText(tr('empieza cuando','starts when'));
  await expect(rule.locator('[data-schedule-rule-kind] option[value="fs"]')).toHaveText(tr('Al terminar la otra','After the other ends'));
  await bar.scrollIntoViewIfNeeded();await shot(page,`f14-gantt-today-${language}`,project);
  await rule.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await shot(page,`f14-gantt-rules-${language}`,project);
  // Plan list in date order; editing a task shows its form in place of its card (no second copy).
  await openPro(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/tasks`,en);
  await page.getByRole('button',{name:tr('Plan del trabajo','Job plan'),exact:true}).or(page.getByRole('tab',{name:tr('Plan del trabajo','Job plan'),exact:true})).first().click({timeout:90000});
  const plan=page.locator('[data-work-plan]');await expect(plan.locator(`[data-work-plan-task="${t3}"]`)).toBeVisible({timeout:90000});
  expect(await plan.locator('[data-work-plan-task]').evaluateAll(els=>els.map(e=>(e as HTMLElement).dataset.workPlanTask))).toEqual([t1,t2,t3]);
  await plan.locator(`[data-work-plan-task="${t2}"]`).getByRole('button',{name:tr('Editar plan','Edit plan'),exact:true}).click();
  await expect(plan.locator(`[data-work-plan-editing="${t2}"] [data-work-plan-form]`)).toBeVisible({timeout:30000});
  await expect(plan.locator(`[data-work-plan-task="${t2}"]`)).toHaveCount(0);await expect(page.locator('[data-work-plan-form]')).toHaveCount(1);
  const form=plan.locator('[data-work-plan-form]');await form.getByLabel(tr('Final previsto','Planned finish'),{exact:true}).fill(addDays(today,6));
  await shot(page,`f14-plan-edit-${language}`,project);
  // The bell is blocked by the unsaved form: the notice appears right under the header.
  await page.locator('[data-pro-notification-bell]').first().click();
  const notice=page.locator('[data-pro-blocked-navigation]');await expect(notice).toBeVisible({timeout:15000});
  expect((await notice.boundingBox())!.y).toBeLessThan(220);await expect(notice).toContainText(tr('cambios sin guardar','unsaved changes'));
  await shot(page,`f14-unsaved-notice-${language}`,project);
  await form.getByRole('button',{name:tr('Cancelar','Cancel'),exact:true}).click();const discard=page.getByRole('dialog').last();if(await discard.isVisible().catch(()=>false))await discard.getByRole('button',{name:tr('Descartar','Discard'),exact:true}).click();
  // (row 66) Mediciones: a window subtracted from a wall; the wall shows gross − opening = net.
  const fileId=crypto.randomUUID();
  const up=await page.request.post('/api/pro/work-files',{headers,data:{action:'upload',workId:f.workId,fileId,name:'plano-f14.png',data:(await planImage()).toString('base64')}});expect(up.status(),await up.text()).toBe(200);
  const planId=crypto.randomUUID();const created=await page.request.post('/api/pro/takeoffs',{headers,data:{action:'plan_create',actionId:crypto.randomUUID(),workId:f.workId,id:planId,fileId,title:tr('Planta F14','Floor F14')}});expect(created.status(),await created.text()).toBe(200);
  const wall=crypto.randomUUID(),win=crypto.randomUUID();
  for(const [mid,name,milli] of [[wall,tr('Pared norte','North wall'),20000],[win,tr('Ventana','Window'),2000]] as const){
   const r=await page.request.post('/api/pro/takeoffs',{headers,data:{action:'measurement_create',actionId:crypto.randomUUID(),workId:f.workId,id:mid,planId,pageNumber:1,kind:'area',name,categoryId:null,color:'#0089bb',points:[],manualMilli:milli,multiplierMode:'none',multiplierMilli:null,wasteBps:0,productId:null}});expect(r.status(),await r.text()).toBe(200);}
  // The API refuses to quote an opening alone and a stale revision is a 409.
  await openPro(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/takeoffs`,en);
  await page.locator(`[data-takeoff-plan="${planId}"]`).getByRole('button',{name:new RegExp(en?'^Open':'^Abrir')}).click({timeout:90000});
  const deduct=page.locator(`[data-takeoff-deduct="${win}"]`);await expect(deduct).toBeVisible({timeout:90000});
  await deduct.selectOption(wall);
  const net=page.locator(`[data-takeoff-measurement="${wall}"] [data-takeoff-net]`);await expect(net).toContainText(tr('neto','net'),{timeout:60000});await expect(net).toContainText('18');
  await expect(page.locator(`[data-takeoff-measurement="${wall}"] [data-takeoff-total]`)).toHaveAttribute('data-takeoff-total-milli','18000');
  await expect(page.locator(`[data-takeoff-measurement="${win}"] [data-takeoff-opening-of="${wall}"]`)).toBeVisible();
  await expect(page.locator(`[data-takeoff-measurement="${win}"] [data-takeoff-include]`)).toBeDisabled();
  await page.locator(`[data-takeoff-measurement="${wall}"]`).scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await shot(page,`f14-takeoff-opening-${language}`,project);
  const stale=await page.request.post('/api/pro/takeoffs',{headers,data:{action:'deduction_clear',actionId:crypto.randomUUID(),workId:f.workId,id:win,revision:1}});expect(stale.status()).toBe(409);
  const alone=await page.request.post('/api/pro/takeoffs',{headers,data:{action:'send_estimate',actionId:crypto.randomUUID(),workId:f.workId,measurementIds:[win],estimateId:null,estimateRevision:null,language}});expect(alone.status()).toBe(400);
  expect(runtime).toEqual([]);
 }finally{if(logs){mkdirSync(logs,{recursive:true});writeFileSync(join(logs,`console-board-${language}-${info.project.name}.txt`),consoleLines.join('\n'));}await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`Fix 14: «My project» page and per-item quote approval [${language}]`,async({page,browser},info)=>{
 test.setTimeout(900000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'/es';
 const f=await ownerFixture(page.context(),id);let customer:DisposableAccount|null=null,stranger:DisposableAccount|null=null;const contexts:BrowserContext[]=[];
 try{
  const owner=f.owner.id;
  const customerContext=await newContext(browser,info);contexts.push(customerContext);customer=await createDisposableAccount({prefix:'f14-cust'});await login(customerContext,customer);
  const token='f14-'+id,hash=createHash('sha256').update('ccr-work-invite:v1:'+token).digest('hex');
  expect((await f.db.rpc('pro_work_client_invitations_mutate',{p_actor:owner,p_input:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,invitationId:crypto.randomUUID(),tokenHash:hash,expiresInDays:7}})).error).toBeNull();
  expect((await f.db.rpc('pro_work_client_invitation_accept',{p_actor:customer.id,p_input:{action:'accept',actionId:crypto.randomUUID(),tokenHash:hash}})).error).toBeNull();
  const requestId=(await f.db.from('pro_appointment_requests').select('id').eq('owner_id',owner).eq('client_user_id',customer.id).single()).data!.id as string;
  // A shared quote with two items (internal cost never reaches the customer).
  const ctx=(await f.db.rpc('pro_private_estimate_context',{p_actor:owner,p_client:null,p_kind:'work',p_id:f.workId})).data as {client:{id:string};clientFingerprint:string;source:unknown;issuer:Record<string,unknown>};
  const estimateId=crypto.randomUUID(),l1=crypto.randomUUID(),l2=crypto.randomUUID(),publicationId=crypto.randomUUID();
  const saved=await f.db.rpc('pro_private_estimate_mutate',{p_actor:owner,p_input:{action:'save',actionId:crypto.randomUUID(),estimateId,revision:0,clientId:ctx.client.id,refreshClient:false,clientFingerprint:ctx.clientFingerprint,source:ctx.source,issuer:{...ctx.issuer,issuerName:'Constructora F14'},title:tr('Baño completo','Full bathroom'),notes:'',currency:'CRC',validUntil:null,
   lines:[{id:l1,description:tr('Enchape de pared','Wall tiling'),unit:'m²',qtyMilli:18000,unitPriceCents:1500000,discountBps:0,taxBps:1300,catalogProductId:null,unitCostCents:900000},{id:l2,description:tr('Mueble de lavatorio','Vanity cabinet'),unit:tr('unid.','ea'),qtyMilli:1000,unitPriceCents:25000000,discountBps:0,taxBps:1300,catalogProductId:null,unitCostCents:12000000}]}});expect(saved.error).toBeNull();
  const publish={action:'publish',actionId:crypto.randomUUID(),estimateId,estimateRevision:1,publicationId,recipient:{kind:'linked',requestId,recipientId:customer.id}};
  expect((await f.db.rpc('pro_private_estimate_publication_mutate',{p_actor:owner,p_input:publish,p_input_hash:createHash('sha256').update(JSON.stringify(publish)).digest('hex'),p_verified_email:null})).error).toBeNull();
  await warmLocalRoutes(page,['/api/pro/quote-line-decisions?'+new URLSearchParams({publicationId}),`${prefix}/dashboard/mi-proyecto/${requestId}`]);
  // (2) The old dialog address opens the page; one messages card (1c).
  const cust=await customerContext.newPage();const custErrors:string[]=[];onAppPageError(cust,m=>custErrors.push(m));
  await gotoOK(cust,`${prefix}/dashboard/profesional?tab=appointments`);
  const row=cust.locator('[data-appointment-requests] article button').filter({hasText:tr('Remodelación de cocina','Remodelación de cocina')}).first();await expect(row).toBeVisible({timeout:90000});
  await row.click();await expect(cust).toHaveURL(new RegExp(`/dashboard/mi-proyecto/${requestId}$`),{timeout:90000});
  const projectPage=cust.locator('[data-client-project-page]');await expect(projectPage).toBeVisible({timeout:90000});await expect(cust.getByRole('dialog',{name:tr('Mi proyecto','My project'),exact:true})).toHaveCount(0);
  await expect(cust.locator('[data-client-overview]')).toBeVisible({timeout:90000});
  await expect(cust.locator('[data-client-messages]')).toHaveCount(1);await expect(cust.locator('[data-client-overview-widget="messages"]')).toHaveCount(0);
  await expect(cust.locator('[data-client-messages-summary]')).toContainText(tr('No tiene mensajes sin leer','No unread messages'),{timeout:60000});
  await expectNoHorizontalOverflow(cust);await shot(cust,`f14-client-project-${language}`,project);
  await cust.locator('[data-client-messages]').scrollIntoViewIfNeeded();await shot(cust,`f14-client-messages-${language}`,project);
  // Back returns to the list; Forward and a reload keep the page.
  await cust.goBack();await expect(cust).toHaveURL(/tab=appointments/,{timeout:60000});
  await cust.goForward();await expect(projectPage).toBeVisible({timeout:90000});await cust.reload();await expect(projectPage).toBeVisible({timeout:90000});
  // The dialog address (notifications, invitations) is replaced by the page.
  await gotoOK(cust,`${prefix}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`);await expect(cust).toHaveURL(new RegExp(`/dashboard/mi-proyecto/${requestId}$`),{timeout:90000});
  // A direct link: its back button goes to the list.
  await gotoOK(cust,`${prefix}/dashboard/mi-proyecto/${requestId}`);await expect(projectPage).toBeVisible({timeout:90000});
  await expect(cust.locator('[data-client-overview]')).toBeVisible({timeout:90000});// hydrated and loaded (the shell is server-rendered)
  const wide=(cust.viewportSize()?.width??0)>=1024;
  await (wide?projectPage.locator('[data-client-project-back]'):cust.getByRole('button',{name:tr('Volver','Back'),exact:true}).first()).click();
  // This job reached the customer by a work invitation (origin project_invite): a direct link's Back goes to «Mis proyectos».
  await expect(cust).toHaveURL(/dashboard\/profesional\?tab=sent_projects/,{timeout:60000});
  // Only the linked customer: the owner and another account get 404; signed out → login.
  expect((await page.request.get(`${en?'/en':''}/dashboard/mi-proyecto/${requestId}`,{maxRedirects:0})).status()).toBe(404);
  const strangerContext=await newContext(browser,info);contexts.push(strangerContext);stranger=await createDisposableAccount({prefix:'f14-other'});await login(strangerContext,stranger);
  expect((await strangerContext.request.get(`${en?'/en':''}/dashboard/mi-proyecto/${requestId}`,{maxRedirects:0})).status()).toBe(404);
  expect((await strangerContext.request.get(`${en?'/en':''}/dashboard/mi-proyecto/not-a-uuid`,{maxRedirects:0})).status()).toBe(404);
  const anon=await browser.newContext({baseURL:origin});contexts.push(anon);const out=await anon.request.get(`${en?'/en':''}/dashboard/mi-proyecto/${requestId}`,{maxRedirects:0});
  expect([302,303,307,308]).toContain(out.status());expect(out.headers()['location']??'').toContain('/login');
  // (row 39) Per-item approval of the shared quote.
  await gotoOK(cust,`${prefix}/dashboard/cotizaciones#publicacion=${publicationId}`);
  const proposal=cust.locator(`[data-quote-line-decisions="${publicationId}"]`);await expect(proposal).toBeVisible({timeout:90000});
  await expect(proposal.locator('[data-quote-line]')).toHaveCount(2);await expect(proposal).not.toContainText('9.000');
  await proposal.locator(`[data-quote-line="${l1}"] [data-quote-line-approve]`).click();
  await expect(proposal.locator(`[data-quote-line="${l1}"]`)).toHaveAttribute('data-decision','approved',{timeout:60000});
  await proposal.locator(`[data-quote-line="${l2}"] [data-quote-line-note]`).fill(tr('Prefiero otro modelo','I prefer another model'));
  await proposal.locator(`[data-quote-line="${l2}"] [data-quote-line-decline]`).click();
  await expect(proposal.locator(`[data-quote-line="${l2}"]`)).toHaveAttribute('data-decision','declined',{timeout:60000});
  await expect(proposal.locator('[data-quote-line-summary]')).toContainText(tr('1 aprobadas, 1 no aprobadas, 0 sin decidir','1 approved, 1 not approved, 0 not decided'));
  await expectNoHorizontalOverflow(cust);await proposal.scrollIntoViewIfNeeded();await shot(cust,`f14-quote-lines-${language}`,project);
  // The owner reads the decisions; the owner cannot decide; an unrelated account is refused.
  const ownerRead=await page.request.get('/api/pro/quote-line-decisions?'+new URLSearchParams({publicationId}),{headers:{'X-Pro-Expected-Actor':owner}});expect(ownerRead.status()).toBe(200);
  const view=await ownerRead.json() as {side:string;approvedCount:number;declinedCount:number;approvedCents:number;lines:{lineId:string;note:string}[]};
  expect(view.side).toBe('owner');expect(view.approvedCount).toBe(1);expect(view.declinedCount).toBe(1);expect(view.approvedCents).toBe(30510000);expect(view.lines.find(x=>x.lineId===l2)?.note).toBe(tr('Prefiero otro modelo','I prefer another model'));
  const ownerWrite=await page.request.post('/api/pro/quote-line-decisions',{headers:{Origin:origin,'X-Pro-Expected-Actor':owner},data:{actionId:crypto.randomUUID(),publicationId,lineId:l1,decision:'declined',note:'',revision:1}});expect(ownerWrite.status()).toBe(403);
  expect((await strangerContext.request.get(origin+'/api/pro/quote-line-decisions?'+new URLSearchParams({publicationId}))).status()).toBe(403);
  const stale=await customerContext.request.post(origin+'/api/pro/quote-line-decisions',{headers:{Origin:origin},data:{actionId:crypto.randomUUID(),publicationId,lineId:l1,decision:'declined',note:'',revision:0}});expect(stale.status()).toBe(409);
  expect(custErrors).toEqual([]);
 }finally{for(const c of contexts)await c.close();if(customer)await cleanupDisposableAccount(customer);if(stranger)await cleanupDisposableAccount(stranger);await f.cleanup();}
});

// Row 66: draw an opening directly inside an area; once saved it is subtracted from that area (gross − opening = net).
for(const language of ['es','en'] as const)test(`Takeoffs: draw an opening inside an area [${language}]`,async({page},info)=>{
 test.setTimeout(900000);local(info.project.use.baseURL);const en=language==='en',id=label(language),tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'/es';
 const f=await ownerFixture(page.context(),id);
 try{
  const headers={Origin:origin,'X-Pro-Expected-Actor':f.owner.id};
  const fileId=crypto.randomUUID(),up=await page.request.post('/api/pro/work-files',{headers,data:{action:'upload',workId:f.workId,fileId,name:'plano-hueco.png',data:(await planImage()).toString('base64')}});expect(up.status(),await up.text()).toBe(200);
  const planId=crypto.randomUUID(),created=await page.request.post('/api/pro/takeoffs',{headers,data:{action:'plan_create',actionId:crypto.randomUUID(),workId:f.workId,id:planId,fileId,title:tr('Planta hueco','Opening floor')}});expect(created.status(),await created.text()).toBe(200);
  const plan=(await created.json()).plan as {revision:number;pages:{revision:number}[]};
  const scale=await page.request.post('/api/pro/takeoffs',{headers,data:{action:'page_calibrate',actionId:crypto.randomUUID(),workId:f.workId,id:planId,revision:plan.pages[0].revision,pageNumber:1,unit:'m',calibration:{points:[[0.1,0.5],[0.6,0.5]],lengthMilli:12000}}});expect(scale.status(),await scale.text()).toBe(200);
  const host=crypto.randomUUID(),made=await page.request.post('/api/pro/takeoffs',{headers,data:{action:'measurement_create',actionId:crypto.randomUUID(),workId:f.workId,id:host,planId,pageNumber:1,kind:'area',name:tr('Sala','Living room'),categoryId:null,color:'#0089bb',points:[[0.1,0.1],[0.6,0.1],[0.6,0.9],[0.1,0.9]],manualMilli:null,multiplierMode:'none',multiplierMilli:null,wasteBps:0,productId:null}});expect(made.status(),await made.text()).toBe(200);
  await openPro(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/takeoffs`,en);
  await page.locator(`[data-takeoff-plan="${planId}"]`).getByRole('button',{name:new RegExp(en?'^Open':'^Abrir')}).click({timeout:90000});
  await page.locator(`[data-takeoff-draw-opening="${host}"]`).click({timeout:90000});
  await expect(page.locator('[data-takeoff-opening-banner]')).toBeVisible();
  const canvas=page.locator('[data-takeoff-canvas]');await expect(page.locator('img').first()).toHaveJSProperty('complete',true);
  const at=async(x:number,y:number)=>{const box=(await canvas.boundingBox())!;await canvas.click({position:{x:box.width*x,y:box.height*y}});};
  await at(0.2,0.2);await at(0.3,0.2);await at(0.3,0.4);await at(0.2,0.4);
  await page.getByRole('button',{name:en?'Finish':'Terminar'}).click();
  const form=page.locator('[data-takeoff-form="measurement"]');await expect(form.locator('[data-takeoff-field="name"]')).toHaveValue(tr('Hueco de Sala','Opening of Living room'));
  await form.getByRole('button',{name:en?'Save measurement':'Guardar medición'}).click();
  await expect(page.locator(`[data-takeoff-measurement="${host}"] [data-takeoff-net]`)).toBeVisible({timeout:60000});
  await expect(page.locator(`[data-takeoff-opening-of="${host}"]`)).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});
