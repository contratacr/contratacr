import {test,expect,type Browser,type Page} from 'playwright/test';
import {randomBytes,createHash} from 'node:crypto';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,login,headersFor,origin,isMobile,type Owner} from './pro-round2-fixture';
import {estimateInput,json as estimateJson,post as estimatePost} from './pro-private-estimate-publications-fixture';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';

// Round 4A (2026-11-13): project overview widgets, real customer preview, customer Finances,
// printable account statement and quote lines with internal cost / sections. Disposable accounts,
// loopback only; nothing is e-mailed, notified, charged or issued.
const shots=process.env.ROUND4A_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const label=(language:string)=>language+randomBytes(3).toString('hex');
const COST_CENTS=1234567;// ₡12.345,67 internal unit cost: must never reach a customer surface
async function customer(browser:Browser,prefix:string,name:string){const account=await createDisposableAccount({prefix});await regressionAdminClient().from('profiles').update({full_name:name}).eq('id',account.id).throwOnError();const context=await browser.newContext({baseURL:origin});await login(context,account);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);return {account,context};}

/** Links a customer account to the owner's job with the Round 1 invitation (API, no e-mail). */
async function linkCustomer(page:Page,f:Owner,client:{account:DisposableAccount;context:import('playwright/test').BrowserContext}){
 const created=await page.request.post(origin+'/api/pro/work-client-invitations',{headers:headersFor(f.owner),data:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,invitationId:crypto.randomUUID(),expiresInDays:7}});
 expect(created.status(),await created.text()).toBe(200);const token=(await created.json()).token as string;
 const accepted=await client.context.request.post(origin+'/api/pro/project-invitation',{headers:{Origin:origin,'X-Pro-Expected-Actor':client.account.id},data:{action:'accept',actionId:crypto.randomUUID(),token}});
 expect(accepted.status(),await accepted.text()).toBe(200);
 return (await f.db.from('pro_appointment_requests').select('id').eq('owner_id',f.owner.id).eq('work_id',f.workId).single().throwOnError()).data!.id as string;
}
/** Agreement ₡1.500.000, payment ₡400.000 and an invoice document of ₡600.000 on the job ledger. */
async function money(f:Owner){
 const entry=(kind:string,amount:number,label:string)=>({user_id:f.owner.id,id:crypto.randomUUID(),client_id:f.clientId,work_id:f.workId,kind,amount_cents:amount,label,request_hash:createHash('md5').update(crypto.randomUUID()).digest('hex')});
 await f.db.from('pro_client_entries').insert([entry('agreement',150000000,'Acuerdo interno R4A'),entry('payment',40000000,'Nota interna del abono R4A')]).throwOnError();
 await f.db.from('pro_invoice_drafts').insert({user_id:f.owner.id,id:crypto.randomUUID(),client_id:f.clientId,source_kind:'work',source_id:f.workId,work_id:f.workId,title:'Primer avance R4A',receiver_name:'Cliente',receiver_identification:'',receiver_email:'',receiver_phone:'',receiver_address:'',total_cents:60000000,material_count:0,material_cost:0,basis:'agreement',source_fingerprint:createHash('md5').update('r4a').digest('hex')}).throwOnError();
}
/** Quote of the job with two sections and an internal cost on the first line, shared with the customer by code. */
async function sharedQuote(page:Page,f:Owner,client:{account:DisposableAccount;context:import('playwright/test').BrowserContext},title:string){
 const ctx=await estimateJson(page.context(),{view:'context',clientId:f.clientId,sourceKind:'work',sourceId:f.workId});
 const lines=[
  {id:crypto.randomUUID(),description:'Enchape de pared',unit:'m2',qtyMilli:10000,unitPriceCents:2000000,discountBps:0,taxBps:1300,catalogProductId:null,unitCostCents:COST_CENTS,group:'Baño principal'},
  {id:crypto.randomUUID(),description:'Grifería',unit:'unid.',qtyMilli:1000,unitPriceCents:5000000,discountBps:0,taxBps:1300,catalogProductId:null,group:'Baño principal'},
  {id:crypto.randomUUID(),description:'Pintura',unit:'m2',qtyMilli:20000,unitPriceCents:500000,discountBps:0,taxBps:1300,catalogProductId:null,group:'Pasillo'},
 ];
 const saved=await estimatePost(page.context(),f.owner,estimateInput(ctx,{validUntil:'2030-12-31',title,currency:'CRC',lines}));expect(saved.status(),await saved.text()).toBe(200);
 const estimate=(await saved.json()).estimate;expect(estimate.lines[0].unitCostCents).toBe(COST_CENTS);expect(estimate.lines[0].group).toBe('Baño principal');
 const code=randomBytes(32).toString('hex');
 expect((await estimatePost(page.context(),f.owner,{action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:estimate.id,estimateRevision:1,recipient:{kind:'claim',email:client.account.email,code}},'/api/pro/private-estimate-publications')).status()).toBe(200);
 const claimed=await client.context.request.post(origin+'/api/pro/private-estimate-publications',{headers:{Origin:origin,'X-Pro-Expected-Actor':client.account.id},data:{action:'claim',actionId:crypto.randomUUID(),code}});expect(claimed.status(),await claimed.text()).toBe(200);
 // The customer copy of the quote carries neither the internal cost nor its value.
 const claimedText=JSON.stringify(await claimed.json());expect(claimedText).not.toContain('unitCostCents');expect(claimedText).not.toContain(String(COST_CENTS));
 return estimate as {id:string;totalCents:number};
}
const noCost=(text:string)=>{expect(text).not.toContain('unitCostCents');expect(text).not.toContain(String(COST_CENTS));expect(text).not.toContain('12.345,67');expect(text).not.toContain('12,345.67');};

for(const language of ['es','en'] as const)test(`Round 4A: overview widgets, real customer preview, customer finances, printable statement [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name;
 const f=await ownerFixture(page.context(),id,document=>{document.clients[0].phone='50688887777';});
 let client:Awaited<ReturnType<typeof customer>>|undefined,stranger:Awaited<ReturnType<typeof customer>>|undefined;
 try{
  const errors=collectPageErrors(page);
  client=await customer(browser,'r4a-client','Clienta R4A '+id);stranger=await customer(browser,'r4a-stranger','Persona Ajena '+id);
  // (1) Empty job first: every widget has its own empty state.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId}));
  const overview=page.locator('[data-work-overview]');await expect(overview).toBeVisible({timeout:90000});
  const widget=(name:string)=>overview.locator(`[data-work-overview-widget="${name}"]`);
  await expect(widget('client').locator('[data-work-overview-link]')).toHaveAttribute('data-work-overview-link','none',{timeout:60000});
  await expect(widget('client')).toContainText('+506 8888-7777');
  await expect(widget('activity')).toContainText(en?'No files, summaries, updates or changes yet.':'Todavía no hay archivos, resúmenes, avances ni cambios.');
  await expect(widget('open').locator('[data-work-overview-open-empty]')).toBeVisible();
  await expect(widget('schedule')).toContainText(en?'No open tasks.':'No hay tareas abiertas.');
  await expect(widget('finance')).toContainText(en?'Not set':'Sin definir');

  const requestId=await linkCustomer(page,f,client);await money(f);
  const estimate=await sharedQuote(page,f,client,'Baño completo '+id);
  // Owner-only API guards: a customer or a stranger cannot read the overview.
  expect((await client.context.request.get(origin+'/api/pro/work-overview?'+new URLSearchParams({workId:f.workId,part:'finance'}))).status()).toBe(403);
  expect((await page.request.get(origin+'/api/pro/work-overview?'+new URLSearchParams({workId:f.workId,part:'costs'}))).status()).toBe(400);

  // (1) Overview with data; one widget failing does not hide the others and retries alone.
  let failActivity=true;
  await page.route('**/api/pro/work-overview?*',route=>{const url=new URL(route.request().url());if(failActivity&&url.searchParams.get('part')==='activity')return route.fulfill({status:500,body:'{}'});return route.continue();});
  await page.reload();await expect(overview).toBeVisible({timeout:90000});
  await expect(widget('activity').locator('[data-work-overview-error]')).toBeVisible({timeout:60000});
  await expect(widget('finance').locator('[data-work-overview-invoiced]')).toHaveText(en?'₡600,000':'₡600.000',{timeout:60000});
  await expect(widget('finance').locator('[data-work-summary-balance]')).toHaveText(en?'₡1,100,000':'₡1.100.000');
  await expect(widget('finance')).toContainText(en?'₡1,500,000':'₡1.500.000');
  await expect(widget('finance').locator('[data-work-overview-costs]')).toHaveText('₡0');
  await expect(widget('client').locator('[data-work-overview-link]')).toHaveAttribute('data-work-overview-link','linked');
  await expect(widget('client')).toContainText('Clienta R4A '+id);
  await expect(widget('open').locator('[data-work-overview-open="quotes"]')).toHaveText(en?'1 quote waiting for an answer':'1 cotización esperando respuesta');
  failActivity=false;await widget('activity').getByRole('button',{name:en?'Retry':'Reintentar'}).click();
  await expect(widget('activity').locator('[data-work-overview-error]')).toHaveCount(0,{timeout:60000});
  await expect(widget('activity')).toContainText(en?'No files, summaries, updates or changes yet.':'Todavía no hay archivos, resúmenes, avances ni cambios.');
  await page.unroute('**/api/pro/work-overview?*');
  // Same balance as the customer record (single formula).
  /* Closing round: first request to this route compiles it on the dev server (>15 s on a fresh server). */const balance=await page.request.get(origin+'/api/pro/client-balance?'+new URLSearchParams({workId:f.workId}),{timeout:120000});expect((await balance.json()).customerBalanceCents).toBe(110000000);
  const columns=await overview.evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length);expect(columns).toBe(isMobile(page)?1:(page.viewportSize()!.width>=1280?3:2));
  await expectNoHorizontalOverflow(page);await overview.scrollIntoViewIfNeeded();await shot(page,`r4a-overview-${language}`,project,true);
  await widget('open').locator('[data-work-overview-open="quotes"]').click();await expect(page).toHaveURL(/(?:vistaTrabajo=|\/trabajo\/[^/?]+\/)estimates(?:[?&]|$)/);

  // (3) Customer view: Finances off by default, copy says so; (2) preview is the real customer view.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'client'}));
  const editor=page.locator('[data-client-dashboard-editor]');await expect(editor).toBeVisible({timeout:90000});
  const financesSwitch=editor.locator('[data-client-dashboard-section="showFinances"]');await expect(financesSwitch).not.toBeChecked();
  await expect(editor).toContainText(en?'Off by default. Shows the shared quotes, the invoices':'Apagada por defecto. Muestra las cotizaciones compartidas, las facturas');
  const update=crypto.randomUUID();
  expect((await page.request.post(origin+'/api/pro/work-updates',{headers:headersFor(f.owner),data:{action:'create',workId:f.workId,entryId:update,actionId:crypto.randomUUID(),revision:0,title:'Demolición lista R4A',text:'R4A_SHARED_UPDATE'}})).status()).toBe(200);
  expect((await page.request.post(origin+'/api/pro/work-updates',{headers:headersFor(f.owner),data:{action:'publish',workId:f.workId,entryId:update,actionId:crypto.randomUUID(),revision:1,recipientId:client.account.id}})).status()).toBe(200);
  await editor.getByRole('button',{name:en?'Preview':'Vista previa',exact:true}).click();
  const preview=editor.locator('[data-client-dashboard-preview]');
  await expect(preview.locator('[data-client-preview-live]')).toBeVisible();
  await expect(preview.getByText('R4A_SHARED_UPDATE').first()).toBeVisible({timeout:90000});// same reader as the customer
  await expect(preview.locator('[data-client-finances]')).toHaveCount(0);// off: the customer does not see it either
  await expect(preview.locator('[data-client-preview-live]')).toHaveJSProperty('disabled',true);
  expect(await preview.locator('[data-client-preview-live]').evaluate(node=>[...node.querySelectorAll('button,input,select,textarea')].every(control=>control.matches(':disabled')))).toBe(true);
  await financesSwitch.check();await expect(preview.locator('[data-client-preview-unsaved]')).toBeVisible();
  await editor.getByRole('button',{name:en?'Save customer view':'Guardar vista del cliente'}).click();
  await expect(editor.getByRole('status').first()).toContainText(en?'Customer view saved.':'Vista del cliente guardada.',{timeout:60000});
  await editor.getByRole('button',{name:en?'Hide preview':'Ocultar vista previa'}).click();await editor.getByRole('button',{name:en?'Preview':'Vista previa',exact:true}).click();
  const previewFinances=preview.locator('[data-client-finances]');await expect(previewFinances).toBeVisible({timeout:90000});
  await expect(previewFinances.locator('[data-client-finances-balance]')).toHaveText(en?'₡1,100,000':'₡1.100.000');
  await expect(previewFinances.locator('[data-client-finances-invoiced]')).toHaveText(en?'₡600,000':'₡600.000');
  await expect(previewFinances.locator('[data-client-finances-quote]')).toContainText('Baño completo '+id);
  noCost(await preview.innerText());noCost(await preview.innerHTML());
  await expectNoHorizontalOverflow(page);await previewFinances.scrollIntoViewIfNeeded();await shot(page,`r4a-preview-${language}`,project);

  // The customer sees the same finances; the payload has no cost, margin, labels or notes.
  const own=await client.context.request.get(origin+'/api/pro/client-finances?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':client.account.id}});expect(own.status()).toBe(200);
  const body=await own.json(),text=JSON.stringify(body);noCost(text);expect(text).not.toContain('Nota interna');expect(text).not.toContain('Acuerdo interno');expect(text.toLowerCase()).not.toContain('margin');
  expect(body.summary).toEqual({agreedCents:150000000,paidCents:40000000,creditNotesCents:0,balanceCents:110000000,creditCents:0,invoicedCents:60000000});
  expect(body.quotes).toHaveLength(1);expect(body.quotes[0].totalCents).toBe(estimate.totalCents);
  const ownerPreview=await page.request.get(origin+'/api/pro/client-finances?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(await ownerPreview.json()).toEqual(body);
  expect((await stranger.context.request.get(origin+'/api/pro/client-finances?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':stranger.account.id}})).status()).toBe(404);
  // The preview never writes for the customer: a customer write by the owner is still refused.
  const sharedList=await client.context.request.get(origin+'/api/pro/private-estimate-publications?'+new URLSearchParams({view:'client'}),{headers:{'X-Pro-Expected-Actor':client.account.id}});
  if(sharedList.status()===200)noCost(JSON.stringify(await sharedList.json()));
  const clientPage=await client.context.newPage();const clientErrors=collectPageErrors(clientPage);
  await gotoOK(clientPage,`/${language}/dashboard/profesional?tab=sent_projects&mode=use`);
  await clientPage.locator(`[data-client-project-link="${requestId}"]`).click({timeout:90000});await expect(clientPage).toHaveURL(new RegExp(`citaSolicitud=${requestId}`),{timeout:60000});
  const clientFinances=clientPage.locator('[data-client-finances]');await expect(clientFinances).toBeVisible({timeout:90000});
  await expect(clientFinances.locator('[data-client-finances-balance]')).toHaveText(en?'₡1,100,000':'₡1.100.000');
  await expect(clientFinances.locator('[data-client-finances-payment]')).toHaveCount(1);
  noCost(await clientPage.locator('body').innerText());
  await expectNoHorizontalOverflow(clientPage);await clientFinances.scrollIntoViewIfNeeded();await shot(clientPage,`r4a-client-finances-${language}`,project);

  // (4) Printable account statement: same figures, print / copy link only.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_clients',cliente:f.clientId,estadoCuenta:'1'}));
  const statement=page.locator('[data-client-statement]');await expect(statement).toBeVisible({timeout:90000});
  const print=statement.locator('[data-client-statement-print]');await expect(print).toBeVisible({timeout:60000});
  const href=await print.getAttribute('href');expect(href).toBe('/api/pro/client-statement-print?'+new URLSearchParams({clientId:f.clientId,lang:language}));
  if(project==='chromium-desktop')await page.context().grantPermissions(['clipboard-read','clipboard-write']);// WebKit has no clipboard permission: the copy then reports its own fallback status
  await statement.locator('[data-client-statement-copy]').click();await expect(statement.locator('[data-client-statement-share]').getByRole('status')).toBeVisible();
  await shot(page,`r4a-statement-${language}`,project);
  expect((await stranger.context.request.get(origin+href!,{timeout:120000})).status()).not.toBe(200);
  const printed=await page.request.get(origin+href!);expect(printed.status()).toBe(200);expect(printed.headers()['content-type']).toContain('text/html');
  const html=await printed.text();expect(html).toContain('data-print-balance');expect(html).toContain(en?'₡1,100,000':'₡1.100.000');expect(html).toContain(en?'Account statement':'Estado de cuenta');noCost(html);
  const printPage=await page.context().newPage();await printPage.goto(origin+href!);await expect(printPage.locator('[data-client-statement-print]')).toBeVisible();
  await expectNoHorizontalOverflow(printPage);await shot(printPage,`r4a-statement-print-${language}`,project,true);await printPage.close();
  expect((await f.db.from('notifications').select('id').in('user_id',[f.owner.id,client.account.id]).throwOnError()).data).toEqual([]);
  expect(errors()).toEqual([]);expect(clientErrors()).toEqual([]);
 }finally{
  await client?.context.close();await stranger?.context.close();
  if(client)await cleanupDisposableAccount(client.account);if(stranger)await cleanupDisposableAccount(stranger.account);await f.cleanup();
 }
});

for(const language of ['es','en'] as const)test(`Round 4A: quote lines with internal cost, margin, sections and line totals [${language}]`,async({page,browser},info)=>{
 test.setTimeout(420000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name;
 const f=await ownerFixture(page.context(),id);let client:Awaited<ReturnType<typeof customer>>|undefined;
 try{
  const errors=collectPageErrors(page);
  client=await customer(browser,'r4a-quote-client','Cliente Cotización '+id);
  const estimate=await sharedQuote(page,f,client,'Baño por secciones '+id);
  // Invalid internal cost is refused by the server (not silently dropped).
  const ctx=await estimateJson(page.context(),{view:'context',clientId:f.clientId});
  const bad=await estimatePost(page.context(),f.owner,estimateInput(ctx,{lines:[{id:crypto.randomUUID(),description:'x',unit:'',qtyMilli:1000,unitPriceCents:100,discountBps:0,taxBps:0,catalogProductId:null,unitCostCents:-1}]}));expect(bad.status()).toBe(400);
  // Editor (owner): per-line total, internal cost and margin, subtotals by section.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'quotes',estimacionPrivada:estimate.id}));
  const editor=page.locator('[data-private-estimate-editor]');await expect(editor).toBeVisible({timeout:90000});
  const first=editor.locator('[data-private-estimate-line]').first();
  await expect(first.locator('[data-private-estimate-line-group]')).toHaveValue('Baño principal');
  await expect(first.locator('[data-private-estimate-line-total]')).toContainText(en?'₡226,000':'₡226.000');// 10 × 20.000 + 13 %
  await expect(first.locator('[data-private-estimate-line-margin]')).toContainText(en?'₡123,456.70':'₡123.456,70');// 10 × 12.345,67
  await expect(first.locator('[data-private-estimate-line-margin]')).toContainText(en?'₡76,543.30 (38.3%)':'₡76.543,30 (38,3 %)');
  await expect(editor.locator('[data-private-estimate-group-subtotal="Baño principal"]')).toContainText(en?'₡282,500':'₡282.500');
  await expect(editor.locator('[data-private-estimate-group-subtotal="Pasillo"]')).toContainText(en?'₡113,000':'₡113.000');
  await expect(editor.locator('[data-private-estimate-internal]')).toContainText(en?'2 items without a cost are not included':'2 líneas sin costo no se incluyen');
  await expectNoHorizontalOverflow(page);await first.scrollIntoViewIfNeeded();await shot(page,`r4a-quote-editor-${language}`,project);
  await editor.locator('[data-private-estimate-totals]').scrollIntoViewIfNeeded();await shot(page,`r4a-quote-totals-${language}`,project);
  // Change the cost in the editor and save: the margin follows and the saved line keeps the cost.
  await first.getByText(en?'Item options':'Opciones de la línea').click();
  await first.locator('[data-private-estimate-line-cost]').fill('15000');
  await expect(first.locator('[data-private-estimate-line-margin]')).toContainText(en?'₡50,000 (25%)':'₡50.000 (25 %)');
  const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/pro/private-estimates'&&r.request().method()==='POST');
  await page.getByRole('button',{name:en?'Save draft':'Guardar borrador',exact:true}).click();expect((await saved).status()).toBe(200);
  await expect(editor).toHaveCount(0,{timeout:60000});await expect(page.getByText(en?'A quote change needs to be checked.':'Hay un cambio de cotización pendiente de comprobar.')).toHaveCount(0);
  const stored=(await f.db.from('pro_private_estimate_items').select('content,position').eq('owner_id',f.owner.id).eq('estimate_id',estimate.id).order('position').throwOnError()).data!;
  expect(stored[0].content.unitCostCents).toBe(1500000);expect(stored[0].content.group).toBe('Baño principal');expect(stored[2].content.group).toBe('Pasillo');expect('unitCostCents' in stored[1].content).toBe(false);
  // Owner preview (= what the customer would see): totals per line and per section, never the cost.
  await gotoOK(page,`/${language}/dashboard/pro?tab=quotes`);
  const row=page.locator(`[data-sales-estimate="private_estimate:${estimate.id}"]`);await row.getByRole('button',{name:en?'View draft':'Ver borrador',exact:true}).click({timeout:90000});
  const dialog=page.getByRole('dialog').last();
  await expect(dialog.locator('[data-private-estimate-preview-line-total]').first()).toContainText(en?'₡226,000':'₡226.000',{timeout:60000});
  await expect(dialog.locator('[data-private-estimate-preview-group]').first()).toHaveText('Baño principal');
  await expect(dialog.locator('[data-private-estimate-preview-group-subtotal]').first()).toContainText(en?'₡282,500':'₡282.500');
  const previewText=await dialog.innerText();expect(previewText).not.toContain(en?'Internal cost':'Costo interno');expect(previewText).not.toContain(en?'15,000':'15.000');expect(previewText).not.toContain(en?'Margin':'Margen');
  await shot(page,`r4a-quote-preview-${language}`,project);
  // Every stored customer copy (publications) has no internal cost.
  const publications=(await f.db.from('pro_private_estimate_publications').select('content').eq('owner_id',f.owner.id).throwOnError()).data!;
  expect(publications.length).toBeGreaterThan(0);for(const publication of publications)noCost(JSON.stringify(publication.content));
  expect(errors()).toEqual([]);
 }finally{await client?.context.close();if(client)await cleanupDisposableAccount(client.account);await f.cleanup();}
});
