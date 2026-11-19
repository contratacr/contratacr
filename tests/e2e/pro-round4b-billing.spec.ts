import {test,expect,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {workFixture,cleanupWorkFixture,acceptedDocument,newIntent,workEndpoint,post,type WorkFixture} from './private-estimate-work-fixture';

// Round 4B (2026-11-13): invoice drafts from accepted quote lines (full / % per line), progress,
// billable time (with the person) and billable expenses (VAT-included split, receipt); invoiced
// sources cannot be billed twice and archiving the draft releases them. Disposable accounts,
// loopback only; nothing is issued, e-mailed, notified or charged.
const shots=process.env.ROUND4B_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const origin='http://127.0.0.1:3185';
// 10 m2 × ₡20.000 + 13 % = ₡226.000; 1 × ₡50.000 + 13 % = ₡56.500 → agreed ₡282.500
const lines=[
 {id:crypto.randomUUID(),description:'Enchape de pared R4B',unit:'m2',qtyMilli:10000,unitPriceCents:2000000,discountBps:0,taxBps:1300,catalogProductId:null},
 {id:crypto.randomUUID(),description:'Grifería R4B',unit:'unid.',qtyMilli:1000,unitPriceCents:5000000,discountBps:0,taxBps:1300,catalogProductId:null},
];
const png=()=>sharp({create:{width:32,height:24,channels:3,background:'#3a7fb0'}}).png().toBuffer();

async function setup(page:Page,f:WorkFixture){
 const context=page.context(),h={Origin:origin,'X-Pro-Expected-Actor':f.owner.id};
 const document=await acceptedDocument(context,f,undefined,{title:'Cocina R4B',currency:'CRC',lines:lines.map(line=>({...line,id:crypto.randomUUID()}))});
 const workId=crypto.randomUUID(),continued=await post(context,f.owner,newIntent(document,workId),workEndpoint);expect(continued.status(),await continued.text()).toBe(200);
 // Billable activity ₡20.000/h and one manual entry of 1 h 30 min credited to the owner (API).
 const activityId=crypto.randomUUID();
 expect((await context.request.post('/api/pro/time-tracking',{headers:h,data:{action:'activity_save',actionId:crypto.randomUUID(),activityId,revision:0,name:'Mano de obra R4B',rateCents:2000000,costCents:null,billable:true}})).status()).toBe(200);
 const entryId=crypto.randomUUID(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica'}).format(new Date());
 const manual=await context.request.post('/api/pro/time-tracking',{headers:h,data:{action:'manual',actionId:crypto.randomUUID(),entryId,workId,activityId,billable:true,date:today,minutes:90,note:'',personGrantId:null}});
 expect(manual.status(),await manual.text()).toBe(200);expect((await manual.json()).entry.personName).toBeTruthy();
 // Billable expense ₡113.000 with VAT 13 % included, paid by card, linked to the job.
 let expenses=await (await context.request.get('/api/pro/expenses?kind=suppliers')).json();
 const supplierId=crypto.randomUUID(),expenseId=crypto.randomUUID();
 expect((await context.request.post('/api/pro/expenses',{headers:h,data:{action:'supplier',actionId:crypto.randomUUID(),revision:expenses.revision,id:supplierId,name:'Ferretería R4B',identification:'',email:'',phone:'',archived:false}})).status()).toBe(200);
 expenses=await (await context.request.get('/api/pro/expenses?kind=suppliers')).json();
 const saved=await context.request.post('/api/pro/expenses',{headers:h,data:{action:'expense',actionId:crypto.randomUUID(),revision:expenses.revision,id:expenseId,supplierId,date:today,dueDate:null,currency:'CRC',concept:'Cerámica R4B',amountCents:11300000,billable:true,paymentMethod:'card',vatRateBps:1300}});
 expect(saved.status(),await saved.text()).toBe(200);
 const costs=await (await context.request.get('/api/pro/work-costs?'+new URLSearchParams({clientId:f.clientId,workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json();
 const linked=await context.request.post('/api/pro/work-costs',{headers:h,data:{action:'link_expense',clientId:f.clientId,workId,requestId:crypto.randomUUID(),revision:costs.revision,expenseId,expenseRevision:costs.expenseRevision}});
 expect(linked.status(),await linked.text()).toBe(200);
 return{workId,entryId,expenseId,h};
}

for(const language of ['es','en'] as const)test(`Round 4B billing: quote lines with %, time and expenses into one draft; no double billing; archive releases [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);expect(info.project.use.baseURL).toBe(origin);const en=language==='en',project=info.project.name;
 const f=await workFixture(page.context(),browser);
 try{
  const errors=collectPageErrors(page);const {workId,entryId,expenseId,h}=await setup(page,f);
  const sources=await (await page.request.get('/api/pro/work-billing?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json();
  expect(sources.agreedCents).toBe(28250000);expect(sources.lines.map((line:{totalCents:number})=>line.totalCents)).toEqual([22600000,5650000]);
  expect(sources.time).toHaveLength(1);expect(sources.time[0].amountCents).toBe(3000000);expect(sources.expenses[0]).toMatchObject({amountCents:11300000,netCents:10000000,vatRateBps:1300});

  // UI: the job's Costs & payments → Bill from job.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'costs'}));
  await page.locator('[data-work-billing-open]').first().click();
  const dialog=page.getByRole('dialog',{name:en?'Bill from job':'Facturar desde el trabajo'});await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-work-billing-agreed]')).toHaveText(en?'₡282,500':'₡282.500');
  await expect(dialog.locator('[data-work-billing-line]')).toHaveCount(2);
  const first=dialog.locator('[data-work-billing-line]').nth(0),second=dialog.locator('[data-work-billing-line]').nth(1);
  await first.getByRole('checkbox').check();await first.getByLabel(en?'% to bill: Enchape de pared R4B':'% a facturar: Enchape de pared R4B').fill('50');
  await expect(first).toContainText(en?'= ₡113,000':'= ₡113.000');
  await second.getByRole('checkbox').check();
  await dialog.locator(`[data-work-billing-time-row="${entryId}"]`).getByRole('checkbox').check();
  await dialog.locator(`[data-work-billing-expense-row="${expenseId}"]`).getByRole('checkbox').check();
  await expect(dialog.locator(`[data-work-billing-expense-row="${expenseId}"]`)).toContainText(en?'includes VAT 13%: ₡100,000 + ₡13,000':'incluye IVA 13 %: ₡100.000 + ₡13.000');
  // 113.000 + 56.500 + 30.000 + 113.000
  await expect(dialog.locator('[data-work-billing-estimate]')).toHaveText(en?'₡312,500':'₡312.500');
  await shot(page,`billing-dialog-${language}`,project);await expectNoHorizontalOverflow(page);
  await dialog.locator('[data-work-billing-create]').click();
  await expect(dialog).toBeHidden();await expect(page).toHaveURL(/factura=[0-9a-f-]{36}/);
  const draftId=new URL(page.url()).searchParams.get('factura')!;
  const draft=(await f.db.from('pro_invoice_drafts').select('total_cents,tax_cents,work_id,source_kind').eq('user_id',f.owner.id).eq('id',draftId).single().throwOnError()).data!;
  // VAT 13 % kept per quote line and on the expense split; hours have no project VAT → pending.
  expect(draft).toEqual({total_cents:31250000,tax_cents:3250000,work_id:workId,source_kind:'direct'});
  await expect(page.getByText(en?'Preparing data…':'Preparando datos…')).toBeHidden({timeout:30000});await expect(page.getByRole('dialog').filter({hasText:en?'Invoice draft':'Borrador de factura'}).last()).toBeVisible();
  // Capture the loaded draft (its detail action is only rendered once the draft data arrived).
  const opened=page.getByRole('dialog',{name:en?'Invoice draft':'Borrador de factura',exact:true});await expect(opened.getByRole('button',{name:en?'Edit invoice details':'Editar detalle de factura',exact:true}).first()).toBeVisible({timeout:45000});await expect(opened.getByText(en?'Preparing data…':'Preparando datos…')).toHaveCount(0);
  await shot(page,`billing-draft-${language}`,project);

  // Reopening: line 1 shows 50 % billed, line 2 is fully billed, hours and expense are in another draft.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'costs'}));
  await page.locator('[data-work-billing-open]').first().click();await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-work-billing-line]').nth(0)).toContainText(en?'Billed: 50%':'Facturado: 50 %');
  await expect(dialog.locator('[data-work-billing-line]').nth(1).getByRole('checkbox')).toBeDisabled();
  await expect(dialog.locator('[data-work-billing-time]')).toContainText(en?'1 entry is in another active draft.':'1 registro ya está en otro borrador activo.');
  await expect(dialog.locator('[data-work-billing-expenses]')).toContainText(en?'1 expense is in another active draft.':'1 gasto ya está en otro borrador activo.');
  await expect(dialog.locator('[data-work-billing-billed]')).toHaveText(en?'₡169,500':'₡169.500');
  await expect(dialog.locator(`[data-work-billing-draft="${draftId}"]`)).toBeVisible();
  await shot(page,`billing-reopen-${language}`,project);
  await dialog.getByRole('button',{name:en?'Cancel':'Cancelar'}).click();

  // API: the same hour / expense / remaining line share cannot be billed twice.
  const fresh=await (await page.request.get('/api/pro/work-billing?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json();
  const attempt=(extra:Record<string,unknown>)=>page.request.post('/api/pro/work-billing',{headers:h,data:{action:'create_billing',requestId:crypto.randomUUID(),workId,fingerprint:fresh.fingerprint,title:'Doble',notes:'',lines:[],agreementBps:null,timeIds:[],expenseIds:[],...extra}});
  expect((await attempt({timeIds:[entryId]})).status()).toBe(409);
  expect((await attempt({expenseIds:[expenseId]})).status()).toBe(409);
  expect((await attempt({lines:[{key:fresh.lines[0].key,bps:5001}]})).status()).toBe(409);
  expect((await attempt({lines:[{key:fresh.lines[1].key,bps:1}]})).status()).toBe(409);
  // Invoiced hours: «Billed in a draft» and no void action in Time.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'time'}));
  const row=page.locator(`[data-time-entry="${entryId}"],[data-time-entry-card="${entryId}"]`).filter({visible:true});
  await expect(row.locator('[data-time-invoiced]')).toHaveText(en?'Billed in a draft':'En borrador de factura');
  await expect(row.getByRole('button',{name:en?'Void':'Anular'})).toHaveCount(0);
  expect((await page.request.post('/api/pro/work-costs',{headers:h,data:{action:'unlink_expense',clientId:f.clientId,workId,requestId:crypto.randomUUID(),revision:(await (await page.request.get('/api/pro/work-costs?'+new URLSearchParams({clientId:f.clientId,workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json()).revision,entryId:(await f.db.from('pro_work_expense_assignments').select('entry_id').eq('user_id',f.owner.id).eq('expense_id',expenseId).single().throwOnError()).data!.entry_id,reason:'x'}})).status()).toBe(400);

  // Archiving the draft (Invoices › Archive) releases every source.
  const management=await (await page.request.get('/api/pro/invoice-management?id='+draftId)).json();
  const archived=await page.request.post('/api/pro/invoice-management',{headers:h,data:{action:'archive',id:draftId,revision:management.revision,managementRevision:management.managementRevision}});
  expect(archived.status(),await archived.text()).toBe(200);
  const released=await (await page.request.get('/api/pro/work-billing?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json();
  expect(released.billedContractCents).toBe(0);expect(released.time[0].invoicedDraftId).toBeNull();expect(released.expenses[0].invoicedDraftId).toBeNull();expect(released.lines.map((line:{billedBps:number})=>line.billedBps)).toEqual([0,0]);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'costs'}));
  await page.locator('[data-work-billing-open]').first().click();await expect(dialog).toBeVisible();
  await expect(dialog.locator(`[data-work-billing-time-row="${entryId}"]`)).toBeVisible();
  await expect(dialog.locator(`[data-work-billing-draft="${draftId}"]`)).toContainText(en?'Archived (not counted)':'Archivado (no cuenta)');
  // Progress: same % for all lines (30 %) → contract share ₡84.750.
  await dialog.getByLabel(en?'Progress: same % for every line':'Avance: mismo % para todas las líneas').fill('30');
  await dialog.getByRole('button',{name:en?'Apply to all':'Aplicar a todas'}).click();
  await expect(dialog.locator('[data-work-billing-estimate]')).toHaveText(en?'₡84,750':'₡84.750');
  await dialog.locator('[data-work-billing-create]').click();await expect(page).toHaveURL(/factura=[0-9a-f-]{36}/);
  const progressId=new URL(page.url()).searchParams.get('factura')!;expect(progressId).not.toBe(draftId);
  expect((await f.db.from('pro_invoice_drafts').select('total_cents').eq('user_id',f.owner.id).eq('id',progressId).single().throwOnError()).data!.total_cents).toBe(8475000);
  expect(errors()).toEqual([]);
 }finally{await cleanupWorkFixture(f);}
});

for(const language of ['es','en'] as const)test(`Round 4B expenses and time: billable flag, payment method, VAT split, receipt; person from Team [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);expect(info.project.use.baseURL).toBe(origin);const en=language==='en',project=info.project.name;
 const f=await workFixture(page.context(),browser);
 try{
  const errors=collectPageErrors(page);const {workId,expenseId}=await setup(page,f);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_expenses',gasto:expenseId}));
  const dialog=page.getByRole('dialog',{name:en?'Internal expense':'Gasto interno',exact:true});await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-expense-billable]')).toHaveText(en?'Billable to the customer · Paid by Card':'Facturable al cliente · Pagado con Tarjeta');
  await expect(dialog.locator('[data-expense-vat-split]')).toHaveText(en?'Includes VAT 13%: ₡100,000 + ₡13,000 = ₡113,000':'Incluye IVA 13 %: ₡100.000 + ₡13.000 = ₡113.000');
  await dialog.getByLabel(en?'Expense receipt':'Comprobante del gasto').setInputFiles({name:'recibo-r4b.png',mimeType:'image/png',buffer:await png()});
  await expect(dialog.getByText(en?'Receipt saved.':'Comprobante guardado.')).toBeVisible({timeout:45000});
  const link=dialog.locator('[data-expense-receipt]');await expect(link).toHaveText('recibo-r4b.jpg');
  const href=await link.getAttribute('href');const download=await page.request.get(href!);expect(download.status()).toBe(200);expect(download.headers()['content-type']).toBe('image/jpeg');
  // Other accounts never read the receipt (owner-only, reauthorized per request).
  const receiptId=new URL(origin+href!).searchParams.get('receiptId')!;
  const anonymous=await browser.newContext({baseURL:origin});expect([401,403]).toContain((await anonymous.request.get(href!)).status());await anonymous.close();
  expect((await f.recipientContext.request.get(href!)).status()).not.toBe(200);
  expect(receiptId).toMatch(/^[0-9a-f-]{36}$/);
  await shot(page,`expense-receipt-${language}`,project);await expectNoHorizontalOverflow(page);
  // Edit form shows the billing fields with their saved values.
  await dialog.getByRole('button',{name:en?'Edit expense':'Editar gasto'}).click();
  const form=page.locator('[data-expense-billing-fields]');await expect(form).toBeVisible();
  await expect(form.getByLabel(en?'Billable to the customer':'Facturable al cliente')).toBeChecked();
  await expect(form.getByLabel(en?'Expense payment method':'Medio de pago del gasto')).toHaveValue('card');
  await expect(form.getByLabel(en?'VAT included in the amount':'IVA incluido en el importe')).toHaveValue('1300');
  await shot(page,`expense-form-${language}`,project);
  await page.keyboard.press('Escape');

  // Time: manual entry with the person picker (owner / team members of this job).
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'time'}));
  await page.locator('[data-time-manual-open]').click();
  const manual=page.locator('[data-time-manual]');await manual.locator('[data-time-field="hours"]').fill('2');
  const person=manual.getByLabel(en?'Person':'Persona');await expect(person.locator('option')).toHaveCount(2);
  await person.selectOption('self');
  await manual.getByRole('button',{name:en?'Save':'Guardar'}).click();await expect(manual).toBeHidden();
  const owner=(await f.db.from('profiles').select('full_name').eq('id',f.owner.id).single().throwOnError()).data!.full_name as string;
  const entries=(await f.db.from('pro_time_entry_people').select('name,grant_id').eq('owner_id',f.owner.id).throwOnError()).data!;
  expect(entries.filter(row=>row.grant_id===null).length).toBe(2);
  await expect(page.locator('[data-time-person]').filter({visible:true}).first()).toHaveText(owner||(en?'Owner':'Propietario'));
  await shot(page,`time-person-${language}`,project);
  expect(errors()).toEqual([]);
 }finally{await cleanupWorkFixture(f);}
});
