import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes,onAppPageError} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {proMoney} from '../../src/lib/pro/money';

// Round 11 (2026-11-15): company fiscal identity on new invoice drafts, accounting reports (aging per
// customer, payments received, IVA per rate, result with committed) with CSV, payment plan «due soon»
// reminder (in-app), purchase orders prefilled from approved selections and budget codes, selection price
// and link hidden from the customer, task file rename/trash/restore. Disposable accounts, loopback only;
// nothing is sent, charged or issued.
const shots=process.env.ROUND11_SHOTS_DIR;
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

for(const language of ['es','en'] as const)test(`Round 11: issuer identity, accounting reports and payment plan reminder [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const f=await ownerFixture(page.context(),id);
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const owner=f.owner.id,headers={Origin:origin,'X-Pro-Expected-Actor':owner},today=crToday(),cedula='3101'+String(Math.floor(Math.random()*900000)+100000);
  // Company identity: contact e-mail, phone, address on the company; cédula jurídica on the account.
  await f.db.from('professionals').update({contact_email:`facturas.${id}@example.test`,call_phone:'2222 3333',formatted_address:'Escazú, San José'}).eq('profile_id',owner).throwOnError();
  await f.db.from('profiles').update({cedula}).eq('id',owner).throwOnError();
  await warmLocalRoutes(page,['/api/pro/finance-reports','/api/pro/reports','/api/pro/notifications?view=count']);
  // (1) New draft «Bill from job» (real writer chain) carries the whole issuer; the draft form defaults too.
  const revision=(await f.db.from('pro_workspace_core').select('revision').eq('user_id',owner).single()).data!.revision as number;
  expect((await f.db.rpc('pro_record_client_operation',{p_user:owner,p_input:{actionId:crypto.randomUUID(),clientId:f.clientId,workId:f.workId,kind:'agreement',amountCents:10000000,note:'Acuerdo'},p_revision:revision})).error).toBeNull();
  const sources=(await f.db.rpc('pro_invoice_billing_sources',{p_user:owner,p_work:f.workId})).data as {fingerprint:string};
  const billed=await f.db.rpc('pro_invoice_billing_create',{p_user:owner,p_input:{action:'create_billing',requestId:crypto.randomUUID(),workId:f.workId,fingerprint:sources.fingerprint,title:tr('Avance 40 %','40% progress'),notes:'',lines:[],agreementBps:4000,timeIds:[],expenseIds:[]}});expect(billed.error).toBeNull();
  const prep=(await f.db.from('pro_invoice_preparation').select('issuer_name,issuer_id,issuer_id_type,issuer_email,issuer_phone,issuer_address').eq('user_id',owner).eq('draft_id',billed.data as string).single()).data!;
  expect(prep).toEqual({issuer_name:'Remodelaciones '+id,issuer_id:'',issuer_id_type:'',issuer_email:`facturas.${id}@example.test`,issuer_phone:'+506 2222-3333',issuer_address:'Escazú, San José'});
  const form=await page.request.get('/api/pro/invoice-drafts?'+new URLSearchParams({kind:'work',sourceId:f.workId}),{headers});expect(form.status(),await form.text()).toBe(200);
  expect((await form.json()).preparationDefaults).toMatchObject({issuerName:'Remodelaciones '+id,issuerId:'',issuerIdType:'',issuerPhone:'+506 2222-3333'});
  // (2) An older invoice (40 days) with a ₡300 payment: aging per customer, payments received, IVA.
  const old=crypto.randomUUID(),pay=crypto.randomUUID();
  await f.db.from('pro_invoice_drafts').insert({user_id:owner,id:old,client_id:f.clientId,source_kind:'work',source_id:f.workId,work_id:f.workId,title:'Factura anterior',receiver_name:'Cliente ronda '+id,receiver_identification:'',receiver_email:'',receiver_phone:'',receiver_address:'',total_cents:113000,tax_cents:13000,material_count:0,material_cost:0,basis:'manual',source_fingerprint:'a'.repeat(32),created_at:new Date(Date.now()-40*86400000).toISOString()}).throwOnError();
  await f.db.from('pro_invoice_payments').insert({user_id:owner,id:pay,client_id:f.clientId,work_id:null,amount_cents:30000,received_on:today,method:'sinpe',reference:'R11-'+id}).throwOnError();
  await f.db.from('pro_invoice_payment_applications').insert({user_id:owner,id:crypto.randomUUID(),draft_id:old,payment_id:pay,amount_cents:30000}).throwOnError();
  const api=await page.request.get('/api/pro/finance-reports',{headers});expect(api.status(),await api.text()).toBe(200);const report=await api.json();
  expect(report.customers.find((c:{clientId:string})=>c.clientId===f.clientId)).toMatchObject({d31_60:83000});
  expect(report.paymentTotals).toMatchObject({count:1,collectedCents:30000});
  expect((await page.request.get('/api/pro/finance-reports?from=2030-01-02&to=2030-01-01',{headers})).status()).toBe(400);
  expect((await page.request.get('/api/pro/finance-reports',{headers:{Origin:origin,'X-Pro-Expected-Actor':crypto.randomUUID()}})).status()).toBe(403);
  // (3) Payment plan with an installment due tomorrow → in-app «due soon» reminder (nothing is sent).
  const plan=await page.request.post('/api/pro/payment-plan',{headers,data:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,planId:crypto.randomUUID(),totalCents:100000,downPaymentCents:0,downPaymentDate:null,schedule:{mode:'auto',frequency:'weekly',count:2,firstDue:addDays(today,1)},feeCents:0,lateFeeCents:0,terms:''}});
  expect(plan.status(),await plan.text()).toBe(200);
  // (4) Reports UI: tabs by customer, payments received and IVA, each with its CSV.
  await openPro(page,`${prefix}/dashboard/pro?tab=statistics`,en);
  const reports=page.locator('[data-pro-reports]');await expect(reports).toBeVisible({timeout:90000});
  await expect(reports.locator('[data-pro-report-profitability]')).toContainText('Remodelación de cocina '+id,{timeout:60000});
  await expectNoHorizontalOverflow(page);await shot(page,`r11-report-financial-${language}`,project);
  await reports.locator('[data-pro-report-tab="customers"]').click();
  const customer=reports.locator(`[data-pro-report-customer="${f.clientId}"]`);await expect(customer).toBeVisible({timeout:60000});
  await expect(customer).toContainText('Cliente ronda '+id);await expect(customer).toContainText(proMoney(830,en));
  await expectNoHorizontalOverflow(page);await shot(page,`r11-report-customers-${language}`,project);
  const [csv]=await Promise.all([page.waitForEvent('download'),reports.locator('[data-pro-report-export-customers]').click()]);
  const csvText=readFileSync((await csv.path())!,'utf8');expect(csvText.charCodeAt(0)).toBe(0xfeff);expect(csvText).toContain('Cliente ronda '+id);expect(csvText).toContain('830.00');
  await reports.locator('[data-pro-report-tab="payments"]').click();
  await expect(reports.locator('[data-pro-report-payments-collected]')).toContainText(proMoney(300,en),{timeout:60000});
  await expect(reports.locator(`[data-pro-report-payment="${pay}"]`)).toContainText('SINPE Móvil');
  await expectNoHorizontalOverflow(page);await shot(page,`r11-report-payments-${language}`,project);
  await reports.locator('[data-pro-report-tab="vat"]').click();
  await expect(reports.locator('[data-pro-report-vat]')).toBeVisible({timeout:60000});
  await expect(reports.locator('[data-pro-report-vat-row^="source"]')).toContainText(proMoney(130,en));
  await expectNoHorizontalOverflow(page);await shot(page,`r11-report-vat-${language}`,project);
  const [vatCsv]=await Promise.all([page.waitForEvent('download'),reports.locator('[data-pro-report-export-vat]').click()]);
  expect(readFileSync((await vatCsv.path())!,'utf8')).toContain('130.00');
  // (5) Notification center: the installment due tomorrow (owner, in-app only).
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_notifications`,en);const center=page.locator('[data-notification-center]');await expect(center).toBeVisible({timeout:90000});
  await expect(center.getByText('Remodelación de cocina '+id).first()).toBeVisible({timeout:60000});await expect(center).toContainText(proMoney(500,en));
  await expectNoHorizontalOverflow(page);await shot(page,`r11-notification-plan-${language}`,project);
  expect((await f.db.from('pro_notifications').select('event').eq('owner_id',owner).eq('event','payment_plan_due')).data).toHaveLength(1);
  expect((await f.db.from('pro_notification_email_drafts').select('notification_id').eq('owner_id',owner)).data).toEqual([]);
  expect(runtime).toEqual([]);
 }finally{await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`Round 11: purchase order from selections and budget, hidden selection price [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const f=await ownerFixture(page.context(),id);let customer:DisposableAccount|null=null;const customerContext:BrowserContext=await newContext(browser,info);
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const owner=f.owner.id,headers={Origin:origin,'X-Pro-Expected-Actor':owner},area=crypto.randomUUID(),i1=crypto.randomUUID(),o1=crypto.randomUUID(),code=crypto.randomUUID();
  await warmLocalRoutes(page,['/api/pro/selections-visibility?workId='+encodeURIComponent(f.workId),'/api/pro/purchase-order-sources?workId='+encodeURIComponent(f.workId),'/api/pro/selections?workId='+encodeURIComponent(f.workId)]);
  customer=await createDisposableAccount({prefix:'r11-cust'});await login(customerContext,customer);
  const prof=(await f.db.from('professionals').select('id,slug').eq('profile_id',owner).single()).data!,requestId=crypto.randomUUID();
  await f.db.from('pro_appointment_requests').insert({id:requestId,professional_id:prof.id,owner_id:owner,client_user_id:customer.id,client_name:'Cliente ronda '+id,professional_name:'Remodelaciones',professional_slug:prof.slug,service:'Remodelación de cocina '+id,duration_minutes:60,location_kind:'agree',location_text:'',note:'',requested_start:crToday()+'T11:00:00-06:00',status:'confirmed',revision:0,work_id:f.workId}).throwOnError();
  await f.db.from('pro_client_dashboards').upsert({owner_id:owner,work_id:f.workId,show_selections:true}).throwOnError();
  for(const input of [{action:'area_create',actionId:crypto.randomUUID(),id:area,name:tr('Cocina','Kitchen'),workId:f.workId},{action:'item_create',actionId:crypto.randomUUID(),id:i1,areaId:area,name:tr('Grifo','Faucet'),dueDate:null,notes:null,allowanceId:null,workId:f.workId},
   {action:'option_add',actionId:crypto.randomUUID(),id:i1,optionId:o1,workId:f.workId,revision:1,name:'Grifo A '+id,brand:'Marca',url:'https://example.test/grifo-'+id,quantity:2,unitCents:5000000,clientNotes:null,imageFileId:null},{action:'publish',actionId:crypto.randomUUID(),id:i1,workId:f.workId,revision:2}])
   {const r=await page.request.post('/api/pro/selections',{headers,data:input});expect(r.status(),await r.text()).toBe(200);}
  // (1) Owner hides price and link of the item from the customer.
  await openPro(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/selections`,en);
  const vis=page.locator('[data-selection-visibility]');await expect(vis).toBeVisible({timeout:90000});await vis.locator('[data-selection-visibility-toggle]').click();
  const row=vis.locator(`[data-selection-visibility-item="${i1}"]`);await expect(row).toBeVisible({timeout:60000});
  await row.locator('[data-selection-hide-price]').check();await row.locator('[data-selection-hide-link]').check();await vis.locator('[data-selection-visibility-save]').click();
  await expect(vis.getByRole('status')).toContainText(tr('Visibilidad guardada.','Visibility saved.'),{timeout:60000});
  await expectNoHorizontalOverflow(page);await shot(page,`r11-selection-visibility-${language}`,project);
  const cust=await customerContext.newPage();await gotoOK(cust,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`);
  const item=cust.locator(`[data-client-selection-item="${i1}"]`);await expect(item).toBeVisible({timeout:90000});
  await expect(item.locator('[data-selection-option-price-hidden]')).toBeVisible();await expect(item.locator('[data-selection-option-total]')).toHaveCount(0);
  await expect(item.getByRole('link',{name:tr('Ver producto','View product')})).toHaveCount(0);await expect(item).not.toContainText(proMoney(100000,en));
  await expectNoHorizontalOverflow(cust);await item.scrollIntoViewIfNeeded();await shot(cust,`r11-client-selection-hidden-${language}`,project);
  const clientRead=await customerContext.request.get(origin+'/api/pro/selections?requestId='+requestId);expect(clientRead.status()).toBe(200);const clientText=await clientRead.text();expect(clientText).not.toContain('example.test/grifo');expect(clientText).not.toContain('5000000');
  // Customer approves (existing writer); owner records the internal cost; a budget code with planned amount.
  const revision=(await f.db.from('pro_work_selection_items').select('revision').eq('id',i1).single()).data!.revision as number;
  expect((await customerContext.request.post(origin+'/api/pro/selections',{headers:{Origin:origin,'X-Pro-Expected-Actor':customer.id},data:{action:'approve',actionId:crypto.randomUUID(),requestId,id:i1,revision,optionId:o1}})).status()).toBe(200);
  expect((await page.request.post('/api/pro/selections-tracking',{headers,data:{action:'cost_set',actionId:crypto.randomUUID(),workId:f.workId,optionId:o1,revision:0,unitCostCents:3500000}})).status()).toBe(200);
  await f.db.from('pro_work_budget_state').insert({owner_id:owner,work_id:f.workId,client_id:f.clientId,revision:1}).throwOnError();
  await f.db.from('pro_work_budget_codes').insert({owner_id:owner,work_id:f.workId,id:code,kind:'item',code:'02.01',title:tr('Grifería','Plumbing fixtures'),parent_id:null,planned_cents:9000000,archived:false}).throwOnError();
  // (2) Purchase order prefilled from the approved selection (internal cost) and the budget code.
  await openPro(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/orders`,en);
  const orders=page.locator('[data-purchase-orders]');await expect(orders.locator('[data-po-from-sources-open]')).toBeVisible({timeout:90000});await orders.locator('[data-po-from-sources-open]').click();
  const picker=orders.locator('[data-po-from-sources]');await expect(picker.locator(`[data-po-source="s:${o1}"]`)).toBeVisible({timeout:60000});
  await expect(picker).toContainText(proMoney(35000,en));
  await picker.locator(`[data-po-source="s:${o1}"]`).check();await picker.locator(`[data-po-source="b:${code}"]`).check();
  await expectNoHorizontalOverflow(page);await shot(page,`r11-po-from-sources-${language}`,project);
  await picker.locator('[data-po-from-sources-use]').click();
  const form=orders.locator('[data-purchase-order-form="create"]');await expect(form).toBeVisible({timeout:30000});
  await expect(form.locator('[data-po-line="0"] [data-po-line-field="description"]')).toHaveValue(new RegExp('Grifo A '+id));
  await expect(form.locator('[data-po-line="0"] [data-po-line-field="price"]')).toHaveValue('35000');
  await expect(form.locator('[data-po-line="0"] [data-po-line-field="link"]')).toHaveValue('sel:'+o1);
  await expect(form.locator('[data-po-line="1"] [data-po-line-field="budgetCode"]')).toHaveValue(code);
  await form.locator('[data-po-field="supplierName"]').fill('Ferretería '+id);
  await expectNoHorizontalOverflow(page);await shot(page,`r11-po-form-prefilled-${language}`,project);
  await form.getByRole('button',{name:tr('Guardar orden de compra','Save purchase order'),exact:true}).click();
  await expect.poll(async()=>(await f.db.from('pro_purchase_order_lines').select('selection_option_id,budget_code_id,unit_cents').eq('owner_id',owner).eq('work_id',f.workId)).data?.length??0,{timeout:60000}).toBe(2);
  const lines=(await f.db.from('pro_purchase_order_lines').select('selection_option_id,budget_code_id,unit_cents').eq('owner_id',owner).eq('work_id',f.workId)).data!;
  expect(lines.find(l=>l.selection_option_id===o1)?.unit_cents).toBe(3500000);expect(lines.find(l=>l.budget_code_id===code)?.unit_cents).toBe(9000000);
  const after=await (await page.request.get('/api/pro/purchase-order-sources?workId='+encodeURIComponent(f.workId),{headers})).json();
  expect(after.selections[0].orderedQuantity).toBe(2);expect(after.budget[0].committedCents).toBeGreaterThan(0);
  expect((await page.request.post('/api/pro/selections-visibility',{headers,data:{action:'visibility_set',actionId:crypto.randomUUID(),workId:f.workId,items:[{itemId:i1,revision:0,hidePrice:false,hideLink:false}]}})).status()).toBe(409);
  expect(runtime).toEqual([]);
 }finally{await customerContext.close();if(customer)await cleanupDisposableAccount(customer);await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`Round 11: task file rename, trash and restore [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);const member=await createDisposableAccount({prefix:'r11-member'}),memberContext=await newContext(browser,info);
 try{
  const owner=f.owner.id,taskId=crypto.randomUUID(),fileId=crypto.randomUUID();
  await f.db.from('pro_work_tasks').insert({owner_id:owner,work_id:f.workId,id:taskId,title:tr('Instalar grifo ','Install faucet ')+id,details:'',assignee:'',due_date:null,status:'open',archived:false,revision:1}).throwOnError();
  await login(memberContext,member);const raw=randomBytes(32).toString('hex');
  expect((await page.request.post(origin+'/api/pro/team',{headers:{Origin:origin,'X-Pro-Expected-Actor':owner},data:{action:'invite',actionId:crypto.randomUUID(),workId:f.workId,email:member.email,role:'contributor',code:raw}})).status()).toBe(200);
  const accepted=await memberContext.request.post(origin+'/api/pro/team',{headers:{Origin:origin,'X-Pro-Expected-Actor':member.id},data:{action:'accept',actionId:crypto.randomUUID(),code:raw}});expect(accepted.status()).toBe(200);const grant=(await accepted.json()).grant as {id:string};
  const png=await sharp({create:{width:16,height:12,channels:3,background:{r:0,g:159,b:199}}}).png().toBuffer();
  const up=await memberContext.request.post(origin+'/api/pro/team-task-discussion',{headers:{Origin:origin,'X-Pro-Expected-Actor':member.id},data:{action:'upload',fileId,grantId:grant.id,taskId,name:'foto.png',data:png.toString('base64')}});expect(up.status(),await up.text()).toBe(200);
  const memberPage=await memberContext.newPage();const runtime:string[]=[];onAppPageError(memberPage,message=>runtime.push(message));
  await gotoOK(memberPage,`/${language}/dashboard/pro/equipo`);const team=memberPage.locator('[data-team-space]');
  await team.locator(`[data-team-grant="${grant.id}"]`).getByRole('button',{name:tr('Ver trabajo','View job'),exact:true}).click({timeout:90000});
  await team.locator(`[data-team-task="${taskId}"]`).getByRole('button',{name:tr('Ver tarea','View task'),exact:true}).click({timeout:60000});
  const file=team.locator(`[data-team-task-file="${fileId}"]`);await expect(file).toBeVisible({timeout:60000});
  // Rename the shown name (the stored file keeps its name).
  await file.getByRole('button',{name:tr('Cambiar nombre','Rename'),exact:true}).click();await file.locator('[data-task-file-name]').fill(tr('Grifo instalado','Faucet installed'));
  await file.getByRole('button',{name:tr('Guardar nombre','Save name'),exact:true}).click();
  await expect(file.locator('h5')).toHaveText(tr('Grifo instalado','Faucet installed'),{timeout:60000});
  await expectNoHorizontalOverflow(memberPage);await shot(memberPage,`r11-task-file-renamed-${language}`,project);
  // Trash hides it; the trash lists it; restore brings it back.
  await file.locator(`[data-task-file-trash="${fileId}"]`).click();await expect(file).toHaveCount(0,{timeout:60000});
  const trash=team.locator('[data-task-file-trash-list]');await trash.getByRole('button',{name:tr('Papelera de la tarea','Task trash'),exact:true}).click();
  const trashed=trash.locator(`[data-task-trashed-file="${fileId}"]`);await expect(trashed).toContainText(tr('Grifo instalado','Faucet installed'),{timeout:60000});
  await expectNoHorizontalOverflow(memberPage);await shot(memberPage,`r11-task-file-trash-${language}`,project);
  await trashed.getByRole('button',{name:tr('Restaurar','Restore'),exact:true}).click();await expect(team.locator(`[data-team-task-file="${fileId}"]`)).toBeVisible({timeout:60000});
  const stored=(await f.db.from('pro_team_task_files').select('name').eq('id',fileId).single()).data!;expect(stored.name).toMatch(/\.jpg$/);
  expect((await f.db.from('pro_team_task_file_meta_history').select('action').eq('file_id',fileId)).data!.map(r=>r.action).sort()).toEqual(['file_rename','file_restore','file_trash']);
  expect(runtime).toEqual([]);
 }finally{await memberContext.close();await cleanupDisposableAccount(member);await f.cleanup();}
});
