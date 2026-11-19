import {test,expect,type Page} from 'playwright/test';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes,onAppPageError} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {newCompanyInviteCode} from '../../src/lib/pro/team-roles';
import {proMoney} from '../../src/lib/pro/money';

// Round F1-A (register row 55; owner of /api/pro/{payables,cash-flow,income-statement} in
// scripts/ci/verify-app-surface-ownership.mjs): accounts payable over expenses + purchase-order supplier bills (aging by
// supplier, overdue, bill record, payments made through the Expenses / PO writers), cash flow (actual vs expected,
// overdue on today, running balance) and the income statement (management report) in Statistics › Reports, ES/EN, with
// CSV. Disposable accounts, loopback Supabase only; nothing is paid, sent or filed.
const shots=process.env.PAYABLES_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=true){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
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
async function csvOf(page:Page,click:()=>Promise<void>){
 const [download]=await Promise.all([page.waitForEvent('download'),click()]);
 return {name:download.suggestedFilename(),text:readFileSync((await download.path())!,'utf8')};
}

for(const language of ['es','en'] as const)test(`Payables, cash flow and income statement [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const money=(colones:number)=>proMoney(colones,en);
 const f=await ownerFixture(page.context(),id);const accounts:DisposableAccount[]=[];
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const owner=f.owner.id,headers={Origin:origin,'X-Pro-Expected-Actor':owner},today=crToday();
  await warmLocalRoutes(page,['/api/pro/payables','/api/pro/cash-flow?from='+addDays(today,-60)+'&to='+today,'/api/pro/income-statement?from='+addDays(today,-60)+'&to='+today,'/api/pro/reports']);
  // Seed through the module writers: two suppliers (one subcontractor), two expenses, one issued purchase order.
  const expRev=async()=>((await f.db.from('pro_expense_state').select('revision').eq('user_id',owner).maybeSingle()).data?.revision as number|undefined)??0;
  const saveExpense=async(input:Record<string,unknown>)=>{const r=await f.db.rpc('pro_expense_meta_save',{p_user:owner,p_input:{actionId:crypto.randomUUID(),revision:await expRev(),...input}});expect(r.error).toBeNull();};
  const s1=crypto.randomUUID(),s2=crypto.randomUUID(),e1=crypto.randomUUID(),e2=crypto.randomUUID(),p1=crypto.randomUUID();
  const sub='Subcontratos '+id,hardware='Ferretería '+id;
  await saveExpense({action:'supplier',id:s1,name:sub,identification:'',email:'',phone:'',archived:false});
  await saveExpense({action:'supplier',id:s2,name:hardware,identification:'',email:'',phone:'',archived:false});
  await f.db.from('pro_company_vendor_profiles').insert({owner_id:owner,supplier_id:s1,kind:'subcontractor',trade:'Electricidad'}).throwOnError();
  await saveExpense({action:'expense',id:e1,supplierId:s1,date:addDays(today,-40),dueDate:addDays(today,-10),currency:'CRC',concept:tr('Instalación eléctrica','Electrical work'),amountCents:113000,vatRateBps:1300,category:'subcontract'});
  await saveExpense({action:'expense',id:e2,supplierId:s2,date:today,dueDate:null,currency:'CRC',concept:tr('Tornillería','Fasteners'),amountCents:50000});
  const po=async(input:Record<string,unknown>)=>{const r=await f.db.rpc('pro_purchase_orders_mutate',{p_actor:owner,p_input:{actionId:crypto.randomUUID(),workId:f.workId,...input}});expect(r.error).toBeNull();};
  await po({action:'create',id:p1,supplierId:s1,supplierName:null,supplierContact:null,title:tr('Cableado cocina','Kitchen wiring'),issueDate:addDays(today,-3),expectedDate:null,notes:null,lines:[{id:crypto.randomUUID(),description:'Cable',quantity:2,unit:'rollo',unitCents:25000,taxRate:13,budgetCodeId:null,selectionOptionId:null,allowanceId:null}]});
  await po({action:'issue',id:p1,revision:1});
  // Receivable: an invoice draft 10 days old on 30 days of credit, ₡260 received today.
  const i1=crypto.randomUUID(),pay=crypto.randomUUID();
  await f.db.from('pro_invoice_drafts').insert({user_id:owner,id:i1,client_id:f.clientId,source_kind:'work',source_id:f.workId,work_id:f.workId,title:tr('Avance cocina','Kitchen progress'),receiver_name:'Cliente ronda '+id,receiver_identification:'',receiver_email:'',receiver_phone:'',receiver_address:'',total_cents:226000,tax_cents:26000,material_count:0,material_cost:0,basis:'manual',source_fingerprint:'a'.repeat(32),created_at:new Date(Date.now()-10*86400000).toISOString()}).throwOnError();
  await f.db.from('pro_invoice_preparation').insert({user_id:owner,draft_id:i1,issuer_name:'',issuer_id_type:'',issuer_id:'',issuer_email:'',issuer_phone:'',issuer_address:'',issuer_activity:'',planned_date:addDays(today,-10),sale_condition:'credit',credit_days:30,payment_method:'',order_reference:''}).throwOnError();
  await f.db.from('pro_invoice_payments').insert({user_id:owner,id:pay,client_id:f.clientId,work_id:null,amount_cents:26000,received_on:today,method:'sinpe',reference:'F1A-'+id}).throwOnError();
  await f.db.from('pro_invoice_payment_applications').insert({user_id:owner,id:crypto.randomUUID(),draft_id:i1,payment_id:pay,amount_cents:26000}).throwOnError();

  // (1) API: payables, aging by supplier, an order waiting for its bill; a partial payment through the Expenses writer.
  let r=await page.request.get('/api/pro/payables',{headers});expect(r.status(),await r.text()).toBe(200);expect(r.headers()['cache-control']).toContain('no-store');
  const ap=await r.json();
  expect(ap.totals).toMatchObject({openCents:163000,overdueCents:113000,overdueCount:1});
  expect(ap.suppliers.map((s:{supplierName:string;vendorKind:string})=>[s.supplierName,s.vendorKind])).toEqual([[sub,'subcontractor'],[hardware,'supplier']]);
  expect(ap.toRegister.map((p:{purchaseOrderId:string})=>p.purchaseOrderId)).toEqual([p1]);
  const rowE1=ap.items.find((x:{sourceId:string})=>x.sourceId===e1);expect(rowE1).toMatchObject({status:'pending',overdue:true,daysOverdue:10});
  const payE1={action:'pay',actionId:crypto.randomUUID(),sourceKind:'expense',sourceId:e1,revision:0,sourceRevision:rowE1.sourceRevision,amountCents:13000,paidOn:today,method:'transfer',reference:'TR-'+id,note:null};
  r=await page.request.post('/api/pro/payables',{headers,data:payE1});expect(r.status(),await r.text()).toBe(200);const paid=await r.json();expect(paid.payable).toMatchObject({status:'partial',balanceCents:100000});
  r=await page.request.post('/api/pro/payables',{headers,data:payE1});expect(await r.json()).toEqual(paid);
  expect((await page.request.post('/api/pro/payables',{headers,data:{...payE1,actionId:crypto.randomUUID()}})).status()).toBe(409);
  expect((await page.request.post('/api/pro/payables',{headers,data:{...payE1,actionId:crypto.randomUUID(),method:'bitcoin'}})).status()).toBe(400);
  const voidPaid=await page.request.post('/api/pro/payables',{headers,data:{action:'void',actionId:crypto.randomUUID(),sourceKind:'expense',sourceId:e1,revision:0,reason:'x'}});
  expect(voidPaid.status()).toBe(400);expect((await voidPaid.json()).reason).toBe('paid');
  expect((await page.request.post('/api/pro/payables',{headers:{'X-Pro-Expected-Actor':owner},data:payE1})).status()).toBe(403);
  expect((await page.request.get('/api/pro/payables',{headers:{Origin:origin,'X-Pro-Expected-Actor':crypto.randomUUID()}})).status()).toBe(403);
  expect((await page.request.get('/api/pro/payables?status=x',{headers})).status()).toBe(400);
  expect((await page.request.get('/api/pro/cash-flow?from='+today,{headers})).status()).toBe(400);
  expect((await page.request.get(`/api/pro/cash-flow?from=${today}&to=${today}&grain=day`,{headers})).status()).toBe(400);
  expect((await page.request.get(`/api/pro/income-statement?from=${today}&to=${addDays(today,-1)}`,{headers})).status()).toBe(400);

  // (2) UI: Statistics › Reports › Payables, with the shared period.
  await openPro(page,`${prefix}/dashboard/pro?tab=statistics`,en);
  const reports=page.locator('[data-pro-reports]');await expect(reports).toBeVisible({timeout:90000});
  await reports.getByLabel(tr('Desde','From'),{exact:true}).fill(addDays(today,-60));await reports.getByLabel(tr('Hasta','To'),{exact:true}).fill(addDays(today,60));
  await reports.locator('[data-pro-report-tab="payables"]').click();
  const payables=reports.locator('[data-pro-payables]');await expect(payables).toBeVisible({timeout:60000});
  await expect(payables.locator('[data-pro-payables-open]')).toContainText(money(1500));
  await expect(payables.locator('[data-pro-payables-overdue]')).toContainText(money(1000));
  await expect(payables.locator(`[data-pro-payable="${e1}"] [data-pro-payable-overdue]`)).toContainText(en?'Overdue 10 days':'Vencida hace 10 días');
  await expect(payables.locator(`[data-pro-payable="${e1}"] [data-pro-payable-status="partial"]`)).toHaveText(tr('Parcial','Partially paid'));
  await expect(payables.locator(`[data-pro-payables-supplier="${s1}"]`)).toContainText(tr('Subcontratista','Subcontractor'));
  await expectNoHorizontalOverflow(page);await shot(page,`payables-${language}`,project);
  // Record the supplier's bill of the order (dialog), then it becomes payable with its due date.
  await payables.locator(`[data-pro-payables-register="${p1}"]`).click();
  const billForm=page.locator('[data-pro-payable-bill-form]');await expect(billForm).toBeVisible();
  await billForm.locator('[data-pro-payable-bill-number]').fill('FE-'+id);
  await expectNoHorizontalOverflow(page);await shot(page,`payables-bill-dialog-${language}`,project,false);
  await page.locator('[data-pro-payable-submit]').click();
  await expect(payables.locator('[data-pro-payables-notice]')).toHaveText(tr('Factura guardada.','Bill saved.'),{timeout:60000});
  await expect(payables.locator(`[data-pro-payable="${p1}"]`)).toContainText('OC-0001');await expect(payables.locator(`[data-pro-payable="${p1}"]`)).toContainText('FE-'+id);
  await expect(payables.locator('[data-pro-payables-to-register]')).toHaveCount(0);
  // Pay the hardware expense in full from the list (internal record).
  await payables.locator(`[data-pro-payable-pay="${e2}"]`).click();
  const payForm=page.locator('[data-pro-payable-pay-form]');await expect(payForm).toBeVisible();
  await expect(payForm.locator('[data-pro-payable-amount]')).toHaveValue('500');
  await payForm.locator('[data-pro-payable-reference]').fill('SINPE-'+id);
  await expectNoHorizontalOverflow(page);await shot(page,`payables-pay-dialog-${language}`,project,false);
  await page.locator('[data-pro-payable-submit]').click();
  await expect(payables.locator('[data-pro-payables-notice]')).toHaveText(tr('Pago registrado.','Payment recorded.'),{timeout:60000});
  await expect(payables.locator(`[data-pro-payable="${e2}"]`)).toHaveCount(0);
  // Each filter reloads the list (aria-busy while loading); assertions wait for the settled answer.
  const bills=payables.locator('[data-pro-payables-bills]'),settled=()=>expect(bills).toHaveAttribute('aria-busy','false',{timeout:60000});
  await payables.locator('[data-pro-ledger-option="status:paid"]').click();await settled();await expect(payables.locator('[data-pro-payable]')).toHaveCount(1);await expect(payables.locator(`[data-pro-payable="${e2}"][data-status="paid"]`)).toBeVisible();
  await payables.locator('[data-pro-ledger-option="status:open"]').click();await settled();await expect(payables.locator('[data-pro-payable]')).toHaveCount(2);
  await payables.locator('[data-pro-payables-filter-overdue]').check();await settled();await expect(payables.locator('[data-pro-payable]')).toHaveCount(1);await expect(payables.locator(`[data-pro-payable="${e1}"]`)).toBeVisible();
  await payables.locator('[data-pro-payables-filter-overdue]').uncheck();await settled();await expect(payables.locator('[data-pro-payable]')).toHaveCount(2);
  expect((await f.db.from('pro_expense_payments').select('amount_cents,method,reference').eq('user_id',owner).eq('expense_id',e2)).data).toEqual([{amount_cents:50000,method:'transfer',reference:'SINPE-'+id}]);
  const apCsv=await csvOf(page,()=>payables.locator('[data-pro-payables-export]').click());
  expect(apCsv.name).toBe(`cuentas-por-pagar-${today}.csv`);expect(apCsv.text.charCodeAt(0)).toBe(0xfeff);expect(apCsv.text).toContain('1130.00');expect(apCsv.text).toContain('OC-0001');
  const supCsv=await csvOf(page,()=>payables.locator('[data-pro-payables-export-suppliers]').click());expect(supCsv.text).toContain(sub);

  // (3) Cash flow: actual in/out, expected (open invoice, payables), overdue on today, running balance with an opening balance.
  r=await page.request.get(`/api/pro/cash-flow?from=${addDays(today,-60)}&to=${addDays(today,60)}`,{headers});expect(r.status(),await r.text()).toBe(200);const cf=await r.json();
  expect(cf.totals).toMatchObject({actualInCents:26000,actualOutCents:13000+50000,expectedInCents:200000,expectedOutCents:100000+56500});
  expect(cf.overdue.items.map((i:{kind:string;direction:string})=>[i.direction,i.kind])).toEqual([['out','expense']]);
  await reports.locator('[data-pro-report-tab="cashflow"]').click();
  const flow=reports.locator('[data-pro-cashflow]');await expect(flow).toBeVisible({timeout:60000});
  await expect(flow.locator('[data-pro-cashflow-period][data-current="1"] [data-pro-cashflow-overdue-out]')).toContainText(money(1000));
  await expect(flow.locator('[data-pro-cashflow-overdue-item="expense"]')).toContainText(tr('Instalación eléctrica','Electrical work'));
  await expect(flow.locator('[data-pro-cashflow-net]')).toContainText(money((26000-63000+200000-156500)/100));
  await flow.locator('[data-pro-cashflow-opening]').fill('100000');
  await expect(flow.locator('[data-pro-cashflow-net]')).toContainText(money(100000+(26000-63000+200000-156500)/100));
  await expectNoHorizontalOverflow(page);await shot(page,`cashflow-${language}`,project);
  await flow.locator('[data-pro-ledger-option="grain:week"]').click();await expect(flow.locator('[data-pro-cashflow-period]').nth(10)).toBeVisible({timeout:60000});
  const cfCsv=await csvOf(page,()=>flow.locator('[data-pro-cashflow-export]').click());expect(cfCsv.name).toMatch(/^flujo-de-caja-\d{4}-\d\d-\d\d-\d{4}-\d\d-\d\d\.csv$/);expect(cfCsv.text).toContain('260.00');

  // (4) Income statement (management report): income without IVA vs expenses without IVA + PO bill without tax.
  r=await page.request.get(`/api/pro/income-statement?from=${addDays(today,-60)}&to=${addDays(today,60)}&grain=quarter`,{headers});expect(r.status(),await r.text()).toBe(200);const is=await r.json();
  expect(is.totals).toMatchObject({incomeCents:200000,expensesCents:150000,purchaseBillsCents:50000,costCents:200000,resultCents:0,collectedCents:26000});expect(is.basis).toBe('management');
  await reports.locator('[data-pro-report-tab="income"]').click();
  const income=reports.locator('[data-pro-income]');await expect(income).toBeVisible({timeout:60000});
  await expect(income.locator('[data-pro-income-disclaimer]')).toContainText(tr('No es una declaración de impuestos','It is not a tax filing'));
  await expect(income.locator('[data-pro-income-line-income]')).toContainText(money(2000));
  await expect(income.locator('[data-pro-income-line-expenses]')).toContainText(money(1500));
  await expect(income.locator(`[data-pro-income-job="${f.workId}"]`)).toContainText('Remodelación de cocina '+id);
  await expect(income.locator('[data-pro-income-job="none"]')).toContainText(tr('Sin trabajo asignado','No job assigned'));
  await expectNoHorizontalOverflow(page);await shot(page,`income-${language}`,project);
  const isCsv=await csvOf(page,()=>income.locator('[data-pro-income-export]').click());expect(isCsv.text).toContain(tr('Reporte de gestión','Management report'));expect(isCsv.text).toContain('2000.00');

  // (5) A Read-only company member is refused (finance reports are for owner, Administrator and Manager).
  if(language==='es'){
   const member=await createDisposableAccount({prefix:'f1a-reader'});accounts.push(member);
   const memberContext=await browser.newContext({baseURL:origin});await login(memberContext,member);
   const code=newCompanyInviteCode();
   expect((await page.context().request.post(origin+'/api/pro/team-roles',{headers:{Origin:origin},data:{action:'invite',actionId:crypto.randomUUID(),email:member.email,role:'read_only',code,locale:language},timeout:120000})).status()).toBe(200);
   expect((await memberContext.request.post(origin+'/api/pro/team-roles',{headers:{Origin:origin},data:{action:'accept',actionId:crypto.randomUUID(),code},timeout:120000})).status()).toBe(200);
   expect((await memberContext.request.post(origin+'/api/pro/team-roles',{headers:{Origin:origin},data:{action:'enter',ownerId:owner},timeout:120000})).status()).toBe(200);
   for(const path of ['/api/pro/payables',`/api/pro/cash-flow?from=${today}&to=${today}`,`/api/pro/income-statement?from=${today}&to=${today}`])expect((await memberContext.request.get(origin+path,{timeout:120000})).status(),path).toBe(403);
   expect((await memberContext.request.post(origin+'/api/pro/payables',{headers:{Origin:origin},data:{...payE1,actionId:crypto.randomUUID()},timeout:120000})).status()).toBe(403);
   await memberContext.close();
  }
  expect(runtime).toEqual([]);
 }finally{for(const account of accounts)await cleanupDisposableAccount(account);await f.cleanup();}
});
