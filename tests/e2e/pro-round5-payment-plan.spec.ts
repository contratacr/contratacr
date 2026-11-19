import {test,expect,type Browser,type Page} from 'playwright/test';
import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,login,headersFor,origin,type Owner} from './pro-round2-fixture';

// Round 5 (2026-11-13): «Plan de pagos» — the professional's own installment plan (no lender, no
// interest). Payments of the job ledger are applied oldest-first; overdue by Costa Rica date; optional
// invoice draft per installment without double billing; customer view (off by default) with explicit
// acceptance; overview notices; printable copy. Disposable accounts, loopback only; nothing is e-mailed,
// notified, charged or issued.
const shots=process.env.ROUND5_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const label=(language:string)=>language+randomBytes(3).toString('hex');
const crDay=(offset=0)=>{const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica'}).format(new Date());const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);};
async function customer(browser:Browser,prefix:string,name:string){const account=await createDisposableAccount({prefix});await regressionAdminClient().from('profiles').update({full_name:name}).eq('id',account.id).throwOnError();const context=await browser.newContext({baseURL:origin});await login(context,account);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);return {account,context};}
async function linkCustomer(page:Page,f:Owner,client:{account:DisposableAccount;context:import('playwright/test').BrowserContext}){
 const created=await page.request.post(origin+'/api/pro/work-client-invitations',{headers:headersFor(f.owner),data:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,invitationId:crypto.randomUUID(),expiresInDays:7}});
 expect(created.status(),await created.text()).toBe(200);const token=(await created.json()).token as string;
 const accepted=await client.context.request.post(origin+'/api/pro/project-invitation',{headers:{Origin:origin,'X-Pro-Expected-Actor':client.account.id},data:{action:'accept',actionId:crypto.randomUUID(),token}});
 expect(accepted.status(),await accepted.text()).toBe(200);
 return (await f.db.from('pro_appointment_requests').select('id').eq('owner_id',f.owner.id).eq('work_id',f.workId).single().throwOnError()).data!.id as string;
}
const entry=(f:Owner,kind:string,amount:number,text:string,reversal:string|null=null)=>({user_id:f.owner.id,id:crypto.randomUUID(),client_id:f.clientId,work_id:f.workId,kind,amount_cents:amount,label:text,reversal_id:reversal,request_hash:createHash('md5').update(crypto.randomUUID()).digest('hex')});
const planApi=origin+'/api/pro/payment-plan';

for(const language of ['es','en'] as const)test(`Round 5: payment plan — create, allocate, overdue, invoice once, customer acceptance, notices, print [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name;
 const m=(colones:string)=>en?colones.replaceAll('.',','):colones;// ₡1.200.000 (es) / ₡1,200,000 (en)
 const f=await ownerFixture(page.context(),id);
 let client:Awaited<ReturnType<typeof customer>>|undefined,stranger:Awaited<ReturnType<typeof customer>>|undefined;
 try{
  const errors=collectPageErrors(page);
  client=await customer(browser,'r5-client','Clienta Plan '+id);stranger=await customer(browser,'r5-stranger','Persona Ajena '+id);
  const requestId=await linkCustomer(page,f,client);
  // Agreed ₡1.500.000 and ₡300.000 paid before the plan → balance ₡1.200.000 (single formula).
  await f.db.from('pro_client_entries').insert([entry(f,'agreement',150000000,'Acuerdo R5'),entry(f,'payment',30000000,'Abono previo R5')]).throwOnError();
  const h=headersFor(f.owner);

  // (1) Owner creates the plan from Costs & payments: down ₡200.000 (10 days ago) + 3 monthly installments from 5 days ago.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'costs'}));
  const section=page.locator('[data-work-payment-plan]');await expect(section.locator('[data-payment-plan-empty]')).toBeVisible({timeout:90000});
  await expect(section).toContainText(m('₡1.200.000'));
  await section.locator('[data-payment-plan-create]').click();
  const editor=page.getByRole('dialog',{name:en?'New payment plan':'Nuevo plan de pagos'});await expect(editor).toBeVisible();
  await expect(editor.locator('[data-payment-plan-field="total"]')).toHaveValue('1200000');
  await editor.locator('[data-payment-plan-field="down"]').fill('200000');
  await editor.getByLabel(en?'Down payment date':'Fecha de la prima').fill(crDay(-10));
  await editor.locator('[data-payment-plan-field="count"]').fill('3');
  await editor.locator('[data-payment-plan-field="first"]').fill(crDay(-5));
  const preview=editor.locator('[data-payment-plan-preview]');
  await expect(preview).toContainText(m('₡333.333'));await expect(preview.locator('li').nth(2)).toContainText(m('₡333.334'));// last absorbs the rounding
  await expectNoHorizontalOverflow(page);await shot(page,`r5-plan-editor-${language}`,project);
  await editor.locator('[data-payment-plan-save]').click();await expect(editor).toBeHidden({timeout:60000});
  await expect(section.locator('[data-payment-plan-item]')).toHaveCount(4,{timeout:60000});
  await expect(section.locator('[data-payment-plan-total]')).toHaveText(m('₡1.200.000'));
  await expect(section.locator('[data-payment-plan-item="0"]')).toHaveAttribute('data-status','overdue');
  await expect(section.locator('[data-payment-plan-item="1"]')).toHaveAttribute('data-status','overdue');
  await expect(section.locator('[data-payment-plan-item="2"]')).toHaveAttribute('data-status','pending');
  const created=await (await page.request.get(planApi+'?'+new URLSearchParams({workId:f.workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json();
  expect(created.plan.items.map((item:{amountCents:number})=>item.amountCents)).toEqual([20000000,33333300,33333300,33333400]);
  expect(created.account.customerBalanceCents).toBe(120000000);// the plan does not change the balance

  // (2) A ledger payment of ₡250.000 is applied oldest-first: down paid, installment 1 partially paid (still overdue).
  await f.db.from('pro_client_entries').insert(entry(f,'payment',25000000,'Abono R5')).throwOnError();
  await page.reload();await expect(section.locator('[data-payment-plan-item="0"]')).toHaveAttribute('data-status','paid',{timeout:90000});
  await expect(section.locator('[data-payment-plan-item="1"]')).toHaveAttribute('data-status','overdue');
  await expect(section.locator('[data-payment-plan-item="1"]')).toContainText(m('₡50.000'));
  await expect(section.locator('[data-payment-plan-applied]')).toHaveText(m('₡250.000'));
  await expect(section.locator('[data-payment-plan-remaining]')).toHaveText(m('₡950.000'));
  await expect(section.locator('[data-payment-plan-balance]')).toHaveText(m('₡950.000'));
  await expect(section.locator('[data-payment-plan-notice]')).toContainText(m('₡283.333'));
  await section.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await shot(page,`r5-plan-owner-${language}`,project);

  // (3) Invoice draft for installment 2 (Round 4B direct-draft path); never twice; edit refused while active.
  const plan=created.plan as {planId:string;revision:number};
  const draftResponse=await page.request.post(planApi,{headers:h,data:{action:'invoice',actionId:crypto.randomUUID(),workId:f.workId,planId:plan.planId,revision:plan.revision,seq:2,language}});
  expect(draftResponse.status(),await draftResponse.text()).toBe(200);const draftId=(await draftResponse.json()).draftId as string;
  expect((await f.db.from('pro_invoice_drafts').select('total_cents,work_id,source_kind').eq('user_id',f.owner.id).eq('id',draftId).single().throwOnError()).data).toEqual({total_cents:33333300,work_id:f.workId,source_kind:'direct'});
  expect((await page.request.post(planApi,{headers:h,data:{action:'invoice',actionId:crypto.randomUUID(),workId:f.workId,planId:plan.planId,revision:plan.revision,seq:2,language}})).status()).toBe(409);
  const blockedEdit=await page.request.post(planApi,{headers:h,data:{action:'cancel',actionId:crypto.randomUUID(),workId:f.workId,planId:plan.planId,revision:plan.revision,reason:'x'}});
  expect(blockedEdit.status()).toBe(400);expect((await blockedEdit.json()).reason).toBe('invoiced');
  await page.reload();await expect(section.locator('[data-payment-plan-item="2"] [data-payment-plan-open-draft]')).toBeVisible({timeout:90000});

  // (4) Overview notices (in-app only): overdue installment and plan waiting for the customer.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId}));
  const open=page.locator('[data-work-overview-widget="open"]');
  await expect(open.locator('[data-work-overview-open="payment-overdue"]')).toHaveText(en?'1 overdue payment plan installment · ₡283,333':'1 cuota vencida del plan de pagos · ₡283.333',{timeout:90000});
  await expect(open.locator('[data-work-overview-open="payment-awaiting"]')).toBeVisible();
  await open.scrollIntoViewIfNeeded();await shot(page,`r5-overview-notices-${language}`,project);
  await open.locator('[data-work-overview-open="payment-overdue"] button').click();
  await expect(page).toHaveURL(/(?:vistaTrabajo=|\/trabajo\/[^/?]+\/)costs(?:[?&]|$)/);

  // (5) Customer view: «Payment plan» is off by default; the owner turns it on; the preview is read-only.
  expect(await (await client.context.request.get(planApi+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':client.account.id}})).json()).toEqual({visible:false});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'client'}));
  const dashboard=page.locator('[data-client-dashboard-editor]');await expect(dashboard).toBeVisible({timeout:90000});
  const planSwitch=dashboard.locator('[data-client-dashboard-section="showPaymentPlan"]');await expect(planSwitch).not.toBeChecked();
  await expect(dashboard).toContainText(en?'Off by default. Shows your payment plan for this job':'Apagada por defecto. Muestra su plan de pagos de este trabajo');
  await planSwitch.check();await dashboard.getByRole('button',{name:en?'Save customer view':'Guardar vista del cliente'}).click();
  await expect(dashboard.getByRole('status').first()).toContainText(en?'Customer view saved.':'Vista del cliente guardada.',{timeout:60000});
  await dashboard.getByRole('button',{name:en?'Preview':'Vista previa',exact:true}).click();
  const previewPlan=dashboard.locator('[data-client-dashboard-preview] [data-client-payment-plan]');await expect(previewPlan).toBeVisible({timeout:90000});
  await expect(previewPlan.locator('[data-client-payment-plan-accept]')).toBeDisabled();
  await expect(previewPlan.locator('[data-client-payment-plan-total]')).toHaveText(m('₡1.200.000'));

  // (6) The customer sees the same schedule (no internal keys) and accepts explicitly; owner/stranger cannot.
  const own=await client.context.request.get(planApi+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':client.account.id}});expect(own.status()).toBe(200);
  const body=await own.json(),text=JSON.stringify(body);for(const key of ['base','invoiceDraftId','customerBalance','Abono R5','Acuerdo R5'])expect(text).not.toContain(key);
  expect(body.plan.items.map((item:{status:string})=>item.status)).toEqual(['paid','overdue','pending','pending']);
  expect(await (await page.request.get(planApi+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json()).toEqual(body);// owner preview = customer copy
  expect((await stranger.context.request.get(planApi+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':stranger.account.id}})).status()).toBe(404);
  const acceptance={action:'accept',actionId:crypto.randomUUID(),requestId,planId:body.plan.planId,revision:body.plan.revision,contentHash:body.plan.contentHash};
  expect((await page.request.post(planApi,{headers:h,data:acceptance})).status()).toBe(403);
  expect((await stranger.context.request.post(planApi,{headers:{Origin:origin,'X-Pro-Expected-Actor':stranger.account.id},data:{...acceptance,actionId:crypto.randomUUID()}})).status()).toBe(403);
  const clientPage=await client.context.newPage();const clientErrors=collectPageErrors(clientPage);
  await gotoOK(clientPage,`/${language}/dashboard/profesional?tab=sent_projects&mode=use`);
  await clientPage.locator(`[data-client-project-link="${requestId}"]`).click({timeout:90000});await expect(clientPage).toHaveURL(new RegExp(`citaSolicitud=${requestId}`),{timeout:60000});
  const clientPlan=clientPage.locator('[data-client-payment-plan]');await expect(clientPlan).toBeVisible({timeout:90000});
  await expect(clientPlan.locator('[data-client-payment-plan-remaining]')).toHaveText(m('₡950.000'));
  await expect(clientPlan.locator('[data-client-payment-plan-item="1"]')).toHaveAttribute('data-status','overdue');
  await clientPlan.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(clientPage);await shot(clientPage,`r5-client-plan-${language}`,project);
  await clientPlan.locator('[data-client-payment-plan-accept]').click();await clientPlan.locator('[data-client-payment-plan-confirm]').click();
  await expect(clientPlan.locator('[data-client-payment-plan-accepted]')).toBeVisible({timeout:60000});
  await shot(clientPage,`r5-client-accepted-${language}`,project);
  const stored=(await f.db.from('pro_payment_plan_acceptances').select('client_user_id,request_id,revision,content_hash,accepted_at').eq('owner_id',f.owner.id).throwOnError()).data!;
  expect(stored).toHaveLength(1);expect(stored[0]).toMatchObject({client_user_id:client.account.id,request_id:requestId,revision:1,content_hash:body.plan.contentHash});expect(stored[0].accepted_at).toBeTruthy();

  // (7) Owner sees the acceptance; printable copy (owner only).
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'costs'}));
  await expect(section.locator('[data-payment-plan-acceptance]')).toContainText(en?'Accepted by the customer on':'Aceptado por el cliente el',{timeout:90000});
  const href=await section.locator('[data-payment-plan-print]').getAttribute('href');expect(href).toBe('/api/pro/payment-plan-print?'+new URLSearchParams({workId:f.workId,lang:language}));
  expect((await stranger.context.request.get(origin+href!)).status()).not.toBe(200);
  const printed=await page.request.get(origin+href!);expect(printed.status()).toBe(200);const html=await printed.text();
  expect(html).toContain(en?'Payment plan':'Plan de pagos');expect(html).toContain(m('₡1.200.000'));expect(html).toContain('data-print-installment="3"');expect(html).toContain(en?'Accepted by the customer on':'Aceptado por el cliente el');
  const printPage=await page.context().newPage();await printPage.goto(origin+href!);await expect(printPage.locator('[data-payment-plan-print]')).toBeVisible();
  await expectNoHorizontalOverflow(printPage);await shot(printPage,`r5-plan-print-${language}`,project,true);await printPage.close();

  // (8) Archive the draft, then edit: a new version (custom: last installment absorbs the difference) that needs a new acceptance.
  const current=await (await page.request.get(origin+'/api/pro/invoice-management?id='+draftId)).json();
  expect((await page.request.post(origin+'/api/pro/invoice-management',{headers:h,data:{action:'archive',id:draftId,revision:current.revision,managementRevision:current.managementRevision}})).status()).toBe(200);
  await page.reload();await expect(section.locator('[data-payment-plan-edit]')).toBeEnabled({timeout:90000});
  await section.locator('[data-payment-plan-edit]').click();
  const edit=page.getByRole('dialog',{name:en?'Edit payment plan':'Editar plan de pagos'});await expect(edit).toBeVisible();
  await edit.getByRole('button',{name:en?'Customize these installments':'Personalizar estas cuotas'}).click();
  await edit.getByLabel(en?'Amount #1':'Monto cuota 1').fill('300000');
  await expect(edit.locator('[data-payment-plan-difference]')).toContainText(m('₡33.333'));
  await edit.locator('[data-payment-plan-absorb]').click();
  await expect(edit.locator('[data-payment-plan-difference]')).toContainText(en?'add up exactly':'suman exactamente');
  await shot(page,`r5-plan-edit-custom-${language}`,project);
  await edit.locator('[data-payment-plan-save]').click();await expect(edit).toBeHidden({timeout:60000});
  await expect(section.locator('[data-payment-plan-acceptance]')).toContainText(en?'Waiting for':'Esperando que',{timeout:60000});
  const edited=await (await page.request.get(planApi+'?'+new URLSearchParams({workId:f.workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json();
  expect(edited.plan.revision).toBe(2);expect(edited.plan.items.map((item:{amountCents:number})=>item.amountCents)).toEqual([20000000,30000000,33333300,36666700]);
  expect(edited.revisions.map((row:{revision:number;accepted:boolean})=>[row.revision,row.accepted])).toEqual([[2,false],[1,true]]);
  // Restoring the archived draft of the old version is refused (it would bill an installment twice).
  const archived=await (await page.request.get(origin+'/api/pro/invoice-management?id='+draftId)).json();
  expect((await page.request.post(origin+'/api/pro/invoice-management',{headers:h,data:{action:'restore',id:draftId,revision:archived.revision,managementRevision:archived.managementRevision}})).status()).not.toBe(200);
  expect((await (await page.request.get(origin+'/api/pro/invoice-management?id='+draftId)).json()).archived).toBe(true);

  // Round 12: the only notices allowed are the customer's in-app payment plan reminders (push suppressed); nothing for the owner.
  const notices=(await f.db.from('notifications').select('user_id,type,data').in('user_id',[f.owner.id,client.account.id]).throwOnError()).data as Array<{user_id:string;type:string;data:{push_suppressed?:boolean}}>;
  expect(notices.filter(n=>!(n.user_id===client!.account.id&&n.type==='pro_payment_plan_client'&&n.data?.push_suppressed===true))).toEqual([]);
  expect(errors()).toEqual([]);expect(clientErrors()).toEqual([]);
 }finally{
  await client?.context.close();await stranger?.context.close();
  if(client)await cleanupDisposableAccount(client.account);if(stranger)await cleanupDisposableAccount(stranger.account);await f.cleanup();
 }
});

for(const language of ['es','en'] as const)test(`Round 5: payment plan API guards and a voided payment is re-allocated [${language}]`,async({page},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);const id=label(language);
 const f=await ownerFixture(page.context(),id);
 try{
  const h=headersFor(f.owner),payment=entry(f,'payment',20000000,'Prima R5');
  await f.db.from('pro_client_entries').insert(entry(f,'agreement',60000000,'Acuerdo R5')).throwOnError();
  const input={action:'create',actionId:crypto.randomUUID(),workId:f.workId,planId:crypto.randomUUID(),totalCents:60000000,downPaymentCents:0,downPaymentDate:null,schedule:{mode:'auto',frequency:'weekly',count:3,firstDue:crDay(-1)},feeCents:0,lateFeeCents:0,terms:''};
  expect((await page.request.post(planApi,{headers:{...h,Origin:'http://evil.example'},data:input})).status()).toBe(403);
  expect((await page.request.post(planApi,{headers:{...h,'X-Pro-Expected-Actor':crypto.randomUUID()},data:input})).status()).toBe(403);
  expect((await page.request.post(planApi,{headers:h,data:{...input,interestBps:100}})).status()).toBe(400);
  expect((await page.request.post(planApi,{headers:h,data:{...input,schedule:{mode:'custom',items:[{amountCents:59999999,dueDate:crDay(1),milestoneId:null,taskId:null}]}}})).status()).toBe(400);
  expect((await page.request.post(planApi,{headers:h,data:'x'.repeat(17000)})).status()).toBeGreaterThanOrEqual(400);
  const first=await page.request.post(planApi,{headers:h,data:input});expect(first.status(),await first.text()).toBe(200);
  const retry=await page.request.post(planApi,{headers:h,data:input});expect(await retry.json()).toEqual(await first.json());// idempotent actionId
  const plan=(await first.json()).plan;expect(plan.items.map((item:{amountCents:number})=>item.amountCents)).toEqual([20000000,20000000,20000000]);
  expect(plan.items[0].status).toBe('overdue');// due yesterday (Costa Rica date)
  expect((await page.request.post(planApi,{headers:h,data:{...input,actionId:crypto.randomUUID(),planId:crypto.randomUUID()}})).status()).toBe(409);// one active plan
  expect((await page.request.post(planApi,{headers:h,data:{action:'cancel',actionId:crypto.randomUUID(),workId:f.workId,planId:plan.planId,revision:7,reason:'x'}})).status()).toBe(409);// stale revision
  await f.db.from('pro_client_entries').insert(payment).throwOnError();
  let state=(await (await page.request.get(planApi+'?'+new URLSearchParams({workId:f.workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json()).plan;
  expect(state.items.map((item:{status:string})=>item.status)).toEqual(['paid','pending','pending']);
  await f.db.from('pro_client_entries').insert(entry(f,'payment_void',20000000,'Anulación R5',payment.id)).throwOnError();
  state=(await (await page.request.get(planApi+'?'+new URLSearchParams({workId:f.workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json()).plan;
  expect(state.appliedCents).toBe(0);expect(state.items[0].status).toBe('overdue');
  const notices=await (await page.request.get(planApi+'?'+new URLSearchParams({workId:f.workId,part:'notices'}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json();
  expect(notices).toMatchObject({active:true,overdueCount:1,overdueCents:20000000,awaitingAcceptance:true});
  expect((await page.request.get(planApi+'?'+new URLSearchParams({workId:f.workId,extra:'1'}))).status()).toBe(400);
 }finally{await f.cleanup();}
});
