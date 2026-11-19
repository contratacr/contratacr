import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {createHash,randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes,onAppPageError} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {proMoney} from '../../src/lib/pro/money';

// Round 12 (2026-11-15): customer project overview (approvals, payments, schedule, messages, files) with
// jumps to each section, payment plan reminders in the customer's bell (in-app, push suppressed), the
// reschedule panel no longer fails on a job that is not a booking, and the printable selections sheet
// respects «hide price». Disposable accounts, loopback only; nothing is sent, charged or issued.
const shots=process.env.ROUND12_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const label=(language:string)=>language+randomBytes(3).toString('hex');
const newContext=(browser:import('playwright/test').Browser,info:import('playwright/test').TestInfo)=>browser.newContext({baseURL:origin,viewport:info.project.use.viewport??undefined,isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,userAgent:info.project.use.userAgent});
const crToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const addDays=(day:string,n:number)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};

for(const language of ['es','en'] as const)test(`Round 12: customer project overview, bell reminders and printable selections [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);let customer:DisposableAccount|null=null;const customerContext:BrowserContext=await newContext(browser,info);
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const owner=f.owner.id,headers={Origin:origin,'X-Pro-Expected-Actor':owner},today=crToday(),area=crypto.randomUUID(),i1=crypto.randomUUID(),o1=crypto.randomUUID(),planId=crypto.randomUUID();
  customer=await createDisposableAccount({prefix:'r12-cust'});await login(customerContext,customer);
  const prof=(await f.db.from('professionals').select('id,slug').eq('profile_id',owner).single()).data!,requestId=crypto.randomUUID();
  // The same seeded request as Round 11 (a confirmed request linked to a job that is not a booking).
  await f.db.from('pro_appointment_requests').insert({id:requestId,professional_id:prof.id,owner_id:owner,client_user_id:customer.id,client_name:'Cliente ronda '+id,professional_name:'Remodelaciones',professional_slug:prof.slug,service:'Remodelación de cocina '+id,duration_minutes:60,location_kind:'agree',location_text:'',note:'',requested_start:today+'T11:00:00-06:00',status:'confirmed',revision:0,work_id:f.workId}).throwOnError();
  await f.db.from('pro_client_dashboards').upsert({owner_id:owner,work_id:f.workId,show_selections:true,show_finances:true,show_payment_plan:true,show_schedule:true}).throwOnError();
  // Agreement ₡500.000 and the professional's own plan: down payment 5 days overdue, 4 monthly from in 2 days.
  const revision=(await f.db.from('pro_workspace_core').select('revision').eq('user_id',owner).single()).data!.revision as number;
  expect((await f.db.rpc('pro_record_client_operation',{p_user:owner,p_input:{actionId:crypto.randomUUID(),clientId:f.clientId,workId:f.workId,kind:'agreement',amountCents:50000000,note:'Acuerdo'},p_revision:revision})).error).toBeNull();
  const plan=await f.db.rpc('pro_payment_plan_mutate',{p_actor:owner,p_input:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,planId,totalCents:50000000,downPaymentCents:10000000,downPaymentDate:addDays(today,-5),schedule:{mode:'auto',frequency:'monthly',count:4,firstDue:addDays(today,2)},feeCents:0,lateFeeCents:0,terms:tr('Sin intereses.','No interest.')}});expect(plan.error).toBeNull();
  await f.db.from('pro_work_schedule_milestones').insert({owner_id:owner,work_id:f.workId,id:crypto.randomUUID(),title:tr('Entrega de gabinetes','Cabinet delivery'),milestone_date:addDays(today,6),notes:'',archived:false}).throwOnError();
  for(const input of [{action:'area_create',actionId:crypto.randomUUID(),id:area,name:tr('Cocina','Kitchen'),workId:f.workId},{action:'item_create',actionId:crypto.randomUUID(),id:i1,areaId:area,name:tr('Grifo','Faucet'),dueDate:addDays(today,3),notes:null,allowanceId:null,workId:f.workId},
   {action:'option_add',actionId:crypto.randomUUID(),id:i1,optionId:o1,workId:f.workId,revision:1,name:'Grifo A '+id,brand:'Marca',url:'https://example.test/grifo-'+id,quantity:2,unitCents:5000000,clientNotes:null,imageFileId:null},{action:'publish',actionId:crypto.randomUUID(),id:i1,workId:f.workId,revision:2}])
   {const r=await page.request.post('/api/pro/selections',{headers,data:input});expect(r.status(),await r.text()).toBe(200);}
  {const r=await page.request.post('/api/pro/work-messages',{headers,data:{action:'post',actionId:crypto.randomUUID(),requestId,body:tr('Mañana llegamos a las 8.','We arrive tomorrow at 8.')}});expect(r.status(),await r.text()).toBe(200);}
  await warmLocalRoutes(page,['/api/pro/client-project-overview?requestId='+requestId]);
  // (1) The customer opens the project: overview first, with everything waiting for them.
  const cust=await customerContext.newPage();const custErrors:string[]=[];onAppPageError(cust,message=>custErrors.push(message));
  await gotoOK(cust,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`);
  const overview=cust.locator('[data-client-overview]');await expect(overview).toBeVisible({timeout:90000});
  await expect(overview.getByRole('heading',{name:tr('Resumen de su proyecto','Your project at a glance')})).toBeVisible();
  await expect(overview.locator('[data-client-overview-approval="payment_plan"]')).toBeVisible();
  await expect(overview.locator('[data-client-overview-approval="selection"]')).toContainText(tr('Grifo','Faucet'));
  await expect(overview.locator('[data-client-overview-overdue]')).toContainText(proMoney(100000,en));
  await expect(overview.locator('[data-client-overview-balance]')).toHaveText(proMoney(500000,en));
  // Fix 14: a single messages card (the project section); the overview only keeps the chip with the unread badge.
  await expect(overview.locator('[data-client-overview-widget="messages"]')).toHaveCount(0);
  await expect(cust.locator('[data-client-section="messages"] [data-client-messages-summary]')).toContainText(tr('1 mensaje sin leer','1 unread message'),{timeout:60000});
  await expect(overview.locator('[data-client-overview-chip="messages"]')).toContainText('1');
  await expect(overview.locator('[data-client-overview-widget="schedule"]')).toContainText(tr('Entrega de gabinetes','Cabinet delivery'));
  // Round 11 observation fixed: no reschedule error on a linked job that is not a booking.
  await expect(cust.getByText(tr('No se pudieron consultar los cambios de horario.','Could not load schedule changes.'))).toHaveCount(0);
  await expectNoHorizontalOverflow(cust);await overview.scrollIntoViewIfNeeded();await shot(cust,`r12-client-overview-${language}`,project);
  // Jump to Messages from the overview.
  await overview.locator('[data-client-overview-chip="messages"]').click();
  await expect(cust.locator(`[data-client-section="messages"]`)).toBeInViewport({timeout:15000});
  await expect(cust.locator('[data-client-section="payment-plan"]').getByRole('heading',{name:tr('Plan de pagos','Payment plan')})).toBeVisible({timeout:60000});
  await overview.locator('[data-client-overview-approval="payment_plan"]').getByRole('button').click();
  await expect(cust.locator(`[data-client-section="payment-plan"]`)).toBeInViewport({timeout:15000});await shot(cust,`r12-client-plan-jump-${language}`,project);
  // (2) Bell: opening the project brought the plan reminders up to date (overdue + due within 3 days).
  await expect.poll(async()=>(await f.db.from('notifications').select('id').eq('user_id',customer!.id).eq('type','pro_payment_plan_client').throwOnError()).data!.length,{timeout:30000}).toBe(2);
  const outbox=(await f.db.from('notifications').select('id,notification_push_outbox(status)').eq('user_id',customer.id).eq('type','pro_payment_plan_client').throwOnError()).data as Array<{notification_push_outbox:{status:string}|Array<{status:string}>|null}>;
  for(const row of outbox){const o=Array.isArray(row.notification_push_outbox)?row.notification_push_outbox[0]:row.notification_push_outbox;expect(o?.status??'suppressed').toBe('suppressed');}
  await cust.reload();await expect(overview).toBeVisible({timeout:90000});
  expect((await f.db.from('notifications').select('id').eq('user_id',customer.id).eq('type','pro_payment_plan_client').throwOnError()).data!.length).toBe(2);
  await gotoOK(cust,`/${language}/notificaciones`);
  await expect(cust.getByText(tr('Una cuota de su plan de pagos venció el','An installment of your payment plan was due on')).first()).toBeVisible({timeout:90000});
  await expect(cust.getByText(tr('Una cuota de su plan de pagos vence el','An installment of your payment plan is due on')).first()).toBeVisible();
  await expectNoHorizontalOverflow(cust);await shot(cust,`r12-client-bell-${language}`,project);
  // (3) Printable selections sheet: approved option, then the price hidden.
  const itemRevision=(await f.db.from('pro_work_selection_items').select('revision').eq('id',i1).single()).data!.revision as number;
  expect((await customerContext.request.post(origin+'/api/pro/selections',{headers:{Origin:origin,'X-Pro-Expected-Actor':customer.id},data:{action:'approve',actionId:crypto.randomUUID(),requestId,id:i1,revision:itemRevision,optionId:o1}})).status()).toBe(200);
  let sheet=await page.request.get('/api/pro/selections-print?'+new URLSearchParams({workId:f.workId,lang:language}));expect(sheet.status()).toBe(200);
  expect(await sheet.text()).toContain(proMoney(100000,en));
  {const r=await page.request.post('/api/pro/selections-visibility',{headers,data:{action:'visibility_set',actionId:crypto.randomUUID(),workId:f.workId,items:[{itemId:i1,revision:0,hidePrice:true,hideLink:true}]}});expect(r.status(),await r.text()).toBe(200);}
  sheet=await page.request.get('/api/pro/selections-print?'+new URLSearchParams({workId:f.workId,lang:language}));expect(sheet.status()).toBe(200);
  const html=(await sheet.text()).replace(/nonce-[a-f0-9]+|nonce="[a-f0-9]+"/g,'');
  expect(html).toContain(tr('Precio indicado aparte','Price provided separately'));expect(html).not.toContain(proMoney(100000,en));expect(html).not.toContain('example.test/grifo');
  await page.goto('/api/pro/selections-print?'+new URLSearchParams({workId:f.workId,lang:language}));await expect(page.locator('[data-selections-print-hidden]').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);await shot(page,`r12-selections-print-hidden-${language}`,project);
  expect(runtime).toEqual([]);expect(custErrors).toEqual([]);
 }finally{await customerContext.close();if(customer)await cleanupDisposableAccount(customer);await f.cleanup();}
});

async function clickPlan(page:Page,x:number,y:number){
 await page.locator('[data-floor-canvas]').scrollIntoViewIfNeeded();
 const point=await page.locator('[data-floor-canvas]').evaluate((svg,[px,py])=>{const s=svg as SVGSVGElement,p=s.createSVGPoint();p.x=px!;p.y=py!;const m=s.getScreenCTM()!;const q=p.matrixTransform(m);return {x:q.x,y:q.y};},[x,y]);
 if((page.viewportSize()?.width??1366)<640)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
}
for(const language of ['es','en'] as const)test(`Round 12: getting started checklist, floor plan levels and furniture, mood board template [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  await warmLocalRoutes(page,['/api/pro/getting-started','/api/pro/floor-plans?workId='+encodeURIComponent(f.workId)]);
  // (1) «Primeros pasos» on Inicio: derived from the account's own records; each step explains and opens its place.
  const guide=await page.request.get('/api/pro/getting-started');expect(guide.status()).toBe(200);const body=await guide.json() as {steps:{key:string;done:boolean}[];done:number;total:number};
  expect(body.total).toBe(9);expect(body.steps.find(s=>s.key==='job')?.done).toBe(true);expect(body.steps.find(s=>s.key==='quote')?.done).toBe(false);
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_tools`);
  const card=page.locator('[data-getting-started]');await expect(card).toBeVisible({timeout:90000});
  await expect(card.locator('[data-getting-started-progress]')).toContainText(tr(`${body.done} de 9 pasos listos`,`${body.done} of 9 steps done`));
  await expect(card.locator('[data-getting-started-step="job"]')).toHaveAttribute('data-done','true');
  const quote=card.locator('[data-getting-started-step="quote"]');await quote.getByRole('button',{name:tr('Prepare una cotización','Prepare a quote')}).click();
  await expect(quote.locator('[data-getting-started-help]')).toContainText(tr('compártala con el cliente','share it'));
  await expectNoHorizontalOverflow(page);await card.scrollIntoViewIfNeeded();await shot(page,`r12-getting-started-${language}`,project);
  await quote.getByRole('button',{name:tr('Abrir cotizaciones','Open quotes')}).click();await expect.poll(()=>new URL(page.url()).searchParams.get('tab'),{timeout:30000}).toBe('quotes');
  // (2) Floor plan with a level and a sofa through the API (existing writer), then in the editor: place a bed,
  // save, start the next level from the same walls and save it; the plan list is ordered by level.
  const planId=crypto.randomUUID(),content={walls:[{id:'w1',a:[0,0],b:[5,0],thickness:0.15},{id:'w2',a:[5,0],b:[5,4],thickness:0.15},{id:'w3',a:[5,4],b:[0,4],thickness:0.15},{id:'w4',a:[0,4],b:[0,0],thickness:0.15}],openings:[],
   rooms:[{id:'r1',name:tr('Sala','Living room'),points:[[0,0],[5,0],[5,4],[0,4]]}],dimensions:[],wallHeight:2.4,level:{name:tr('Planta baja','Ground floor'),order:0},objects:[{id:'o1',kind:'sofa',x:2.5,y:1,w:2,d:0.9,rotation:0}]};
  {const r=await page.request.post('/api/pro/floor-plans',{headers:{Origin:origin},data:{action:'create',actionId:crypto.randomUUID(),id:planId,workId:f.workId,name:tr('Casa','House'),unit:'m',content}});expect(r.status(),await r.text()).toBe(200);}
  {const r=await page.request.post('/api/pro/floor-plans',{headers:{Origin:origin},data:{action:'create',actionId:crypto.randomUUID(),id:crypto.randomUUID(),workId:f.workId,name:'X',unit:'m',content:{...content,objects:[{id:'o2',kind:'piano',x:0,y:0,w:1,d:1,rotation:0}]}}});expect(r.status()).toBe(400);}
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'takeoffs'}));
  const plans=page.locator('[data-floor-plans]');await expect(plans).toBeVisible({timeout:90000});await plans.scrollIntoViewIfNeeded();
  await expect(plans.locator('[data-floor-object="sofa"]')).toHaveCount(1,{timeout:60000});await expect(plans.locator('[data-floor-level-name]')).toHaveValue(tr('Planta baja','Ground floor'));
  await plans.locator('[data-floor-tool="object"]').click();await plans.locator('[data-floor-object-kind]').selectOption('bed');await clickPlan(page,1.5,2.8);
  await expect(plans.locator('[data-floor-object="bed"]')).toHaveCount(1);await expect(plans.locator('[data-floor-selection="object"]')).toBeVisible();
  await plans.locator('[data-floor-object-rotate]').click();await expect(plans.locator('[data-floor-object-count]')).toHaveText('2');
  await plans.locator('[data-floor-save]').click();await expect(plans.locator('[data-floor-notice]')).toContainText(tr('Plano guardado.','Plan saved.'),{timeout:60000});
  const saved=(await f.db.from('pro_floor_plans').select('content,summary').eq('id',planId).single()).data!;
  expect((saved.content as {objects:{kind:string;rotation:number}[]}).objects.find(o=>o.kind==='bed')?.rotation).toBe(90);expect(Number((saved.summary as {totalArea:number}).totalArea)).toBe(20);
  await expectNoHorizontalOverflow(page);await plans.locator('[data-floor-canvas]').scrollIntoViewIfNeeded();await shot(page,`r12-floor-objects-${language}`,project);
  await plans.locator('[data-floor-new-level]').click();await expect(plans.locator('[data-floor-level-name]')).toHaveValue(tr('Segundo piso','Second floor'));
  await expect(plans.locator('[data-floor-wall]')).toHaveCount(4);await expect(plans.locator('[data-floor-object="sofa"]')).toHaveCount(0);
  await plans.locator('[data-floor-name]').fill(tr('Casa','House'));await plans.locator('[data-floor-save]').click();await expect(plans.locator('[data-floor-notice]')).toContainText(tr('Plano creado.','Plan created.'),{timeout:60000});
  await expect(plans.locator('[data-floor-select] option')).toHaveText([tr('Planta baja · Casa','Ground floor · House'),tr('Segundo piso · Casa','Second floor · House')]);
  const levels=(await f.db.from('pro_floor_plans').select('content').eq('owner_id',f.owner.id).eq('work_id',f.workId).throwOnError()).data!.map(row=>(row.content as {level?:{order:number}}).level?.order).toSorted();
  expect(levels).toEqual([0,1]);
  await expectNoHorizontalOverflow(page);await plans.scrollIntoViewIfNeeded();await shot(page,`r12-floor-levels-${language}`,project);
  // (3) Mood board from a template (row 61): the first page is saved by the existing page writer, fully editable.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'moodboards'}));
  const boards=page.locator('[data-mood-boards]');await expect(boards).toBeVisible({timeout:90000});
  await boards.getByRole('button',{name:tr('Nuevo tablero','New board')}).click();const form=boards.locator('[data-mood-board-form]');
  await form.locator('[data-mood-field="name"]').fill(tr('Cocina de Ana','Ana kitchen'));await form.locator('[data-mood-field="template"]').selectOption('kitchen');
  await form.getByRole('button',{name:tr('Crear tablero','Create board')}).click();
  const editor=page.locator('[data-mood-board-editor]');await expect(editor).toBeVisible({timeout:60000});
  await expect(editor.locator('[data-mood-canvas="editor"] [data-mood-element]')).toHaveCount(9,{timeout:60000});
  await expect(editor).toContainText(tr('Cocina: ideas y materiales','Kitchen: ideas and materials'));
  const stored=(await f.db.from('pro_mood_board_pages').select('elements').eq('owner_id',f.owner.id).throwOnError()).data!;expect(stored.some(row=>Array.isArray(row.elements)&&(row.elements as unknown[]).length===9)).toBe(true);
  await expectNoHorizontalOverflow(page);await editor.scrollIntoViewIfNeeded();await shot(page,`r12-moodboard-template-${language}`,project);
  expect(runtime).toEqual([]);
 }finally{await f.cleanup();}
});

// Manual-style walkthrough as a real customer: invited to the job, opens the project, reviews the quote,
// answers a message and accepts the payment plan; the overview follows each step.
for(const language of ['es','en'] as const)test(`Round 12: customer walkthrough of the project [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);let customer:DisposableAccount|null=null;const customerContext:BrowserContext=await newContext(browser,info);
 try{
  const owner=f.owner.id,headers={Origin:origin,'X-Pro-Expected-Actor':owner},today=crToday(),token='r12-'+id,hash=createHash('sha256').update('ccr-work-invite:v1:'+token).digest('hex');
  customer=await createDisposableAccount({prefix:'r12-walk'});await login(customerContext,customer);
  expect((await f.db.rpc('pro_work_client_invitations_mutate',{p_actor:owner,p_input:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,invitationId:crypto.randomUUID(),tokenHash:hash,expiresInDays:7}})).error).toBeNull();
  expect((await f.db.rpc('pro_work_client_invitation_accept',{p_actor:customer.id,p_input:{action:'accept',actionId:crypto.randomUUID(),tokenHash:hash}})).error).toBeNull();
  const requestId=(await f.db.from('pro_appointment_requests').select('id').eq('owner_id',owner).eq('client_user_id',customer.id).single()).data!.id as string;
  await f.db.from('pro_client_dashboards').upsert({owner_id:owner,work_id:f.workId,show_finances:true,show_payment_plan:true}).throwOnError();
  // Quote of the job shared to the linked account (real routes).
  const ctx=await (await page.request.get('/api/pro/private-estimates?'+new URLSearchParams({view:'context',sourceKind:'work',sourceId:f.workId}))).json(),estimateId=crypto.randomUUID();
  {const r=await page.request.post('/api/pro/private-estimates',{headers,data:{action:'save',actionId:crypto.randomUUID(),estimateId,revision:0,clientId:ctx.client.id,refreshClient:false,clientFingerprint:ctx.clientFingerprint,source:ctx.source,issuer:{...ctx.issuer,issuerName:'Remodelaciones '+id},title:tr('Cocina completa','Full kitchen'),notes:'',currency:'CRC',validUntil:null,
   lines:[{id:crypto.randomUUID(),description:tr('Gabinetes','Cabinets'),unit:'m',qtyMilli:4000,unitPriceCents:10000000,discountBps:0,taxBps:1300,catalogProductId:null}]}});expect(r.status(),await r.text()).toBe(200);}
  {const r=await page.request.post('/api/pro/private-estimate-publications',{headers,data:{action:'publish',actionId:crypto.randomUUID(),estimateId,estimateRevision:1,publicationId:crypto.randomUUID(),recipient:{kind:'linked',requestId,recipientId:customer.id}}});expect(r.status(),await r.text()).toBe(200);}
  {const r=await page.request.post('/api/pro/work-messages',{headers,data:{action:'post',actionId:crypto.randomUUID(),requestId,body:tr('Le compartí la cotización. ¿Tiene preguntas?','I shared the quote. Any questions?')}});expect(r.status(),await r.text()).toBe(200);}
  const plan=await f.db.rpc('pro_record_client_operation',{p_user:owner,p_input:{actionId:crypto.randomUUID(),clientId:f.clientId,workId:f.workId,kind:'agreement',amountCents:45200000,note:'Acuerdo'},p_revision:(await f.db.from('pro_workspace_core').select('revision').eq('user_id',owner).single()).data!.revision});expect(plan.error).toBeNull();
  expect((await f.db.rpc('pro_payment_plan_mutate',{p_actor:owner,p_input:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,planId:crypto.randomUUID(),totalCents:45200000,downPaymentCents:5200000,downPaymentDate:addDays(today,1),schedule:{mode:'auto',frequency:'monthly',count:4,firstDue:addDays(today,30)},feeCents:0,lateFeeCents:0,terms:tr('Sin intereses.','No interest.')}})).error).toBeNull();
  const cust=await customerContext.newPage();const errors:string[]=[];onAppPageError(cust,message=>errors.push(message));
  await gotoOK(cust,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`);
  const overview=cust.locator('[data-client-overview]');await expect(overview).toBeVisible({timeout:90000});
  await expect(overview.locator('[data-client-overview-approval="quote"]')).toContainText(proMoney(452000,en));
  await expect(overview.locator('[data-client-overview-approval="payment_plan"]')).toBeVisible();
  await expect(overview.locator('[data-client-overview-widget="files"]')).toContainText(tr('todavía no ha compartido archivos','has not shared files yet'));
  await expectNoHorizontalOverflow(cust);await shot(cust,`r12-walk-overview-${language}`,project);
  // Quote: «Review and respond» in the overview jumps to the project's quotes, which open the version.
  await overview.locator('[data-client-overview-approval="quote"]').getByRole('button').click();
  const quotes=cust.locator('[data-client-section="quotes"]');await expect(quotes).toBeInViewport({timeout:15000});await expect(quotes).toContainText(tr('Cocina completa','Full kitchen'));await shot(cust,`r12-walk-quotes-${language}`,project);
  // Message: reply to the professional.
  // The conversation is collapsed by default; the «Mensajes» chip of the overview opens it (Fix 13/14).
  await overview.locator('[data-client-overview-chip="messages"]').click();
  const messages=cust.locator('[data-client-section="messages"]');await expect(messages.getByRole('button',{name:tr('Ocultar','Hide')})).toHaveAttribute('aria-expanded','true');await messages.scrollIntoViewIfNeeded();
  await messages.getByRole('textbox',{name:tr('Mensaje','Message')}).fill(tr('Gracias, la reviso hoy.','Thanks, I will review it today.'));await messages.locator('[data-message-form] button[type="submit"]').click();
  await expect(messages.getByRole('log')).toContainText(tr('Gracias, la reviso hoy.','Thanks, I will review it today.'),{timeout:60000});await shot(cust,`r12-walk-messages-${language}`,project);
  // Payment plan: accept it in its section; the overview then drops the approval.
  const planSection=cust.locator('[data-client-section="payment-plan"]');await planSection.scrollIntoViewIfNeeded();
  await planSection.locator('[data-client-payment-plan-accept]').click();await planSection.locator('[data-client-payment-plan-confirm]').click();
  await expect(planSection.locator('[data-client-payment-plan-accept]')).toHaveCount(0,{timeout:60000});await shot(cust,`r12-walk-plan-${language}`,project);
  await overview.getByRole('button',{name:tr('Actualizar','Refresh')}).click();
  await expect(overview.locator('[data-client-overview-approval="payment_plan"]')).toHaveCount(0,{timeout:60000});
  await expect(messages.locator('[data-client-messages-summary]')).toContainText(tr('No tiene mensajes sin leer','No unread messages'));
  await expectNoHorizontalOverflow(cust);
  expect(errors).toEqual([]);
 }finally{await customerContext.close();if(customer)await cleanupDisposableAccount(customer);await f.cleanup();}
});
