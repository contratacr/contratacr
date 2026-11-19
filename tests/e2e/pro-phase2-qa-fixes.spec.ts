import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {proMoney} from '../../src/lib/pro/money';
import {inputCents} from '../../src/lib/pro/client-operations';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {parseMilli,formatMilli} from '../../src/lib/pro/takeoffs';
import {projectBudgetToCents,PROJECT_BUDGET_MAX_CENTS} from '../../src/lib/pro/project-details';
import {VAT_OPTIONS,vatOptionLabel} from '../../src/lib/pro/invoice-tax';
import {applyProjectVat,blankInvoiceLine} from '../../src/lib/pro/invoice-detail';
import {projectDefaultVatFrom,projectVatInput} from '../../src/lib/pro/project-default-vat';
import {contractMoney,contractPercent} from '../../src/lib/pro/contracts';
import {BID_BODY_MAX,bidBytes} from '../../src/lib/pro/bids';
import type {InvoicePaymentsPage} from '../../src/lib/pro/invoice-payments';

// QA fase 2 (12-nov-2026): P1-1 pagos con notas de crédito, P1-2 cantidades de mediciones, P1-3 tope del
// presupuesto, «13 %» en español, IVA predeterminado del proyecto en borradores nuevos (más P2-2/P2-5 puros).
// Local loopback only; nothing is charged, issued or sent.
const origin='http://127.0.0.1:3185';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}

// ---------------------------------------------------------------- pure rules (no page, no data)
test.describe('QA fase 2 · reglas puras',()=>{
 test('P1-2: takeoff quantities follow the language grouping rule',()=>{
  // Spanish: «.» groups thousands, «,» is the decimal mark (same as colones and the other Pro quantities).
  expect(parseMilli('1.200',1e12,false)).toBe(1200000);expect(parseMilli('2,4',1e12,false)).toBe(2400);expect(parseMilli('1.200,5',1e12,false)).toBe(1200500);
  expect(parseMilli('12.000.000',1e12,false)).toBe(12000000000);expect(parseMilli('1 200,25',1e12,false)).toBe(1200250);
  // English: «,» groups thousands, «.» is the decimal mark.
  expect(parseMilli('1,200',1e12,true)).toBe(1200000);expect(parseMilli('2.4',1e12,true)).toBe(2400);expect(parseMilli('1,200.5',1e12,true)).toBe(1200500);
  // Limits and invalid input are unchanged.
  expect(parseMilli('0',1e12,false)).toBeNull();expect(parseMilli('abc',1e12,true)).toBeNull();expect(parseMilli('1.2345',1e12,true)).toBeNull();expect(parseMilli('1001',1000000,false)).toBeNull();
  // What is shown can be typed back in the same language.
  for(const [value,en] of [[1200500,false],[1200500,true],[2400,false],[987654321,true]] as const)expect(parseMilli(formatMilli(value,en),1e12,en)).toBe(Math.round(value/10)*10);
  // Legacy two-argument call keeps the previous behaviour.
  expect(parseMilli('2.4',1e12)).toBe(2400);
 });
 test('P1-3: planned budget accepts the full column range with its own «too large» result',()=>{
  expect(projectBudgetToCents('2.500.000')).toEqual({cents:250000000});expect(projectBudgetToCents('₡ 2 500 000,50')).toEqual({cents:250000050});
  expect(projectBudgetToCents('2,500,000.50')).toEqual({cents:250000050});expect(projectBudgetToCents('1234,5')).toEqual({cents:123450});
  // Above colonesToCents' old 8-digit limit (P1-3): up to ₡100 000 000 000.
  expect(projectBudgetToCents('250.000.000')).toEqual({cents:25000000000});expect(projectBudgetToCents('100.000.000.000')).toEqual({cents:PROJECT_BUDGET_MAX_CENTS});
  expect(projectBudgetToCents('100.000.000.000,01')).toEqual({error:'max'});expect(projectBudgetToCents('999999999999999')).toEqual({error:'max'});
  expect(projectBudgetToCents('12,345')).toEqual({cents:1234500});expect(projectBudgetToCents('abc')).toEqual({error:'format'});expect(projectBudgetToCents('1,234')).toEqual({cents:123400});
 });
 test('13 %: Spanish VAT labels use a space before the sign; English does not',()=>{
  for(const option of VAT_OPTIONS){expect(option.label).not.toMatch(/\d%/);expect(vatOptionLabel(option.code,false)).toBe(option.label);}
  expect(vatOptionLabel('08',false)).toBe('Tarifa general 13 %');expect(vatOptionLabel('09',false)).toBe('Tarifa reducida 0,5 %');
  expect(vatOptionLabel('08',true)).toBe('General rate 13%');expect(vatOptionLabel('09',true)).toBe('Reduced rate 0.5%');expect(vatOptionLabel('zz',true)).toBe('zz');
 });
 test('IVA predeterminado: only lines still «Por definir» take the project VAT',()=>{
  expect(projectDefaultVatFrom({details:{defaultVatCode:'08'}})).toEqual({code:'08',rate:'13'});expect(projectDefaultVatFrom({details:{defaultVatCode:null}})).toBeNull();expect(projectDefaultVatFrom({details:{defaultVatCode:'05'}})).toBeNull();
  expect(projectVatInput({code:'09',rate:'0.5'},false)).toBe('0,5');expect(projectVatInput({code:'09',rate:'0.5'},true)).toBe('0.5');expect(projectVatInput({code:'10',rate:'0'},false)).toBe('');expect(projectVatInput(null,true)).toBe('');
  const pending=blankInvoiceLine();expect(applyProjectVat(pending,'08')).toMatchObject({taxTreatment:'vat',taxRate:'13',tax:{vatCode:'08',exemption:null}});
  expect(applyProjectVat(pending,'10')).toMatchObject({taxTreatment:'exempt',taxRate:'0',tax:{vatCode:'10'}});expect(applyProjectVat(pending,null)).toBe(pending);
  const chosen={...pending,taxTreatment:'vat' as const,taxRate:'4',tax:{vatCode:'04' as const,exemption:null}};expect(applyProjectVat(chosen,'08')).toBe(chosen);
 });
 test('P2-2 / P2-5: contract amounts by language and bid body size',()=>{
  expect(contractMoney(123456750,'CRC')).toBe('₡1.234.567,50');expect(contractMoney(123456750,'CRC',true)).toBe('₡1,234,567.50');expect(contractMoney(500000,'USD',true)).toBe('US$5,000');
  expect(contractPercent(12.5,false)).toBe('12,5 %');expect(contractPercent(12.5,true)).toBe('12.5%');
  const lines=Array.from({length:100},()=>({id:crypto.randomUUID(),description:'x'.repeat(300),quantity:1,unit:'u',budgetCodeId:null}));
  expect(bidBytes({action:'create',lines})).toBeGreaterThan(BID_BODY_MAX);expect(bidBytes({action:'create',lines:lines.slice(0,10)})).toBeLessThan(BID_BODY_MAX);
 });
});

// ---------------------------------------------------------------- fixture with a real local account
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
type Db=ReturnType<typeof regressionAdminClient>;
async function makePro(db:Db,account:DisposableAccount){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'QA fase 2 local',slug:'qa-phase2-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
}
async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'qa-phase2'}),db=regressionAdminClient();
 try{
  await makePro(db,owner);const workId=crypto.randomUUID(),day=crTodayISO(),clientId='qa-phase2-'+owner.id.slice(0,8),document=emptyBusiness();
  document.clients=[{id:clientId,name:'Cliente QA fase 2',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId,client:'Cliente QA fase 2',service:'Remodelación de baño',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId,clientId}),{timeout:45000})).status()).toBe(200);
  return {owner,db,workId,clientId};
 }catch(error){await cleanupDisposableAccount(owner);throw error;}
}
async function ledger(db:Db,owner:string,input:Record<string,unknown>){
 const core=await db.from('pro_workspace_core').select('revision').eq('user_id',owner).single().throwOnError();
 const r=await db.rpc('pro_record_client_operation',{p_user:owner,p_input:{actionId:crypto.randomUUID(),...input},p_revision:core.data!.revision});expect(r.error).toBeNull();
}
async function workDraft(db:Db,owner:string,workId:string,clientId:string){
 const source=await db.rpc('pro_invoice_source',{p_user:owner,p_kind:'work',p_id:workId});expect(source.error).toBeNull();
 const r=await db.rpc('pro_invoice_draft_save',{p_user:owner,p_input:{action:'create',kind:'work',sourceId:workId,clientId,title:'Factura QA fase 2',notes:'',receiver:{name:'Cliente QA fase 2',identification:'',email:'',phone:'',address:''},fingerprint:(source.data as {fingerprint:string}).fingerprint}});
 expect(r.error).toBeNull();return r.data as string;
}

for(const language of ['es','en'] as const)test(`QA fase 2 · P1-1 invoice payments subtract applied credit notes [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(300000);local(baseURL);const en=language==='en',{owner,db,workId,clientId}=await fixture(page.context());
 try{
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  await ledger(db,owner.id,{workId,clientId,kind:'agreement',amountCents:1000000});
  const draftId=await workDraft(db,owner.id,workId,clientId);
  const note=crypto.randomUUID();
  const credit=async(data:Record<string,unknown>)=>{const r=await page.request.post('/api/pro/credits-retainers',{headers,data});expect(r.status(),JSON.stringify(data)).toBe(200);};
  await credit({action:'create_credit_note',actionId:crypto.randomUUID(),workId,id:note,title:'Descuento pactado',amountCents:600000,reason:'Retraso de entrega',note:null});
  await credit({action:'apply',actionId:crypto.randomUUID(),workId,id:note,revision:1,draftId,amountCents:600000});
  const read=async():Promise<InvoicePaymentsPage>=>{const r=await page.request.get('/api/pro/invoice-payments?'+new URLSearchParams({id:draftId}));expect(r.status()).toBe(200);return r.json();};
  let view=await read();expect(view.summary).toMatchObject({appliedCents:0,creditNotesCents:600000,balanceCents:400000,canRecord:true});
  const apply=(amountCents:number)=>page.request.post('/api/pro/invoice-payments',{headers:{Origin:origin},data:{action:'apply',requestId:crypto.randomUUID(),draftId,draftRevision:view.draft.revision,revision:view.revision,source:'new',amountCents,receivedOn:crTodayISO(),method:'transfer',reference:'QA-NC'}});
  // Above the balance left after the credit note: own reason (ES text from the API, both languages in the UI).
  const over=await apply(400001);expect(over.status()).toBe(400);expect(await over.json()).toMatchObject({reason:'credit_notes'});
  const plain=await apply(1000001);expect(plain.status()).toBe(400);
  // UI: the summary shows the credit notes and the balance that is left.
  await gotoOK(page,`/${language}/dashboard/profesional?`+new URLSearchParams({tab:'pro_billing',factura:draftId,pagosFactura:draftId}));
  const payments=page.getByRole('dialog',{name:en?'Draft payments':'Pagos del borrador',exact:true});await expect(payments).toBeVisible({timeout:60000});
  const summary=payments.locator('[data-invoice-payment-summary]');
  await expect(summary).toContainText(en?'Credit notes':'Notas de crédito');await expect(summary).toContainText(proMoney(6000,en));await expect(summary).toContainText(proMoney(4000,en));await expect(payments.locator('[data-invoice-payment-credit-notes]')).toBeVisible();
  const amount=payments.getByLabel(en?'Amount to apply ₡':'Importe a aplicar ₡',{exact:true});
  // The suggested amount follows the locale's decimal separator; saving accepts either separator.
  await expect(amount).toHaveValue(en?'4000.00':'4000,00');expect([inputCents('4000,00'),inputCents('4000.00'),inputCents(' 4000,5 ')]).toEqual([400000,400000,400050]);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`payments-credit-notes-${language}.png`),fullPage:true});
  // The exact remaining balance is accepted; then nothing is left to allocate.
  const exact=await apply(400000);expect(exact.status()).toBe(200);view=await read();expect(view.summary).toMatchObject({appliedCents:400000,creditNotesCents:600000,balanceCents:0,canRecord:false});
 }finally{await cleanupDisposableAccount(owner);}
});

for(const language of ['es','en'] as const)test(`QA fase 2 · project default VAT, 13 % and budget limit in the UI [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(300000);local(baseURL);const en=language==='en',{owner,db,workId,clientId}=await fixture(page.context());
 try{
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  // Project details with IVA 08 (13 %).
  const detail=await page.request.get('/api/pro/project-details?'+new URLSearchParams({view:'detail',workId}),{headers});expect(detail.status()).toBe(200);
  const saved=await page.request.post('/api/pro/project-details',{headers,data:{action:'save',actionId:crypto.randomUUID(),workId,revision:(await detail.json()).details.revision,color:null,typeId:null,code:null,budgetCents:null,address:null,billingAddress:null,shippingAddress:null,defaultVatCode:'08',tags:[]}});
  expect(saved.status()).toBe(200);

  // P1-3 + 13 %: the details form shows the Spanish label with a space and rejects a budget over the limit with its own text.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId}));
  const workspace=page.locator('[data-job-workspace]'),header=workspace.locator('[data-job-workspace-header]');
  await header.getByRole('button',{name:en?'Project details':'Detalles del proyecto',exact:true}).click();
  const details=workspace.locator('[data-project-details]');await expect(details.locator('[data-project-details-form]')).toBeVisible({timeout:60000});
  const vat=details.getByLabel(en?'Default IVA':'IVA predeterminado');await expect(vat).toHaveValue('08');
  await expect(vat.locator('option:checked')).toHaveText(en?'08 · General rate 13%':'08 · Tarifa general 13 %');
  const budget=details.getByLabel(en?'Planned budget (₡, optional)':'Presupuesto previsto (₡, opcional)',{exact:true});
  await budget.fill(en?'250,000,000':'250.000.000');await details.getByRole('button',{name:en?'Save details':'Guardar detalles'}).click();
  await expect(details.getByText(en?'Details saved.':'Detalles guardados.',{exact:true})).toBeVisible();
  const after=await (await page.request.get('/api/pro/project-details?'+new URLSearchParams({view:'detail',workId}),{headers})).json();expect(after.details.budgetCents).toBe(25000000000);
  await budget.fill(en?'200,000,000,000':'200.000.000.000');await details.getByRole('button',{name:en?'Save details':'Guardar detalles'}).click();
  await expect(details.getByText(en?'The planned budget can be up to ₡100,000,000,000.':'El presupuesto previsto puede ser de hasta ₡100.000.000.000.',{exact:true})).toBeVisible();
  // P2-4: 44 px touch target on the form buttons.
  expect((await details.getByRole('button',{name:en?'Save details':'Guardar detalles'}).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({path:info.outputPath(`details-budget-${language}.png`),fullPage:true});

  // Purchase orders: a new order and each added line start with the project VAT.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'orders'}));
  const orders=page.locator('[data-purchase-orders]');await expect(orders).toBeVisible({timeout:60000});
  await orders.getByRole('button',{name:en?'New purchase order':'Nueva orden de compra'}).click();
  const form=orders.locator('[data-purchase-order-form="create"]');await expect(form).toBeVisible();
  await expect(form.locator('[data-po-line="0"] [data-po-line-field="tax"]')).toHaveValue('13');
  await form.getByRole('button',{name:en?'Add line':'Agregar línea'}).click();await expect(form.locator('[data-po-line="1"] [data-po-line-field="tax"]')).toHaveValue('13');

  // Invoice of the job: source lines still «Por definir» take IVA 08, also a line added before saving.
  if(en)return; // The invoice editor flow below is the Spanish one used by pro-invoice-tax.spec.ts.
  await ledger(db,owner.id,{workId,clientId,kind:'agreement',amountCents:500000});
  const draftId=await workDraft(db,owner.id,workId,clientId);
  // A fresh tab: the purchase order form above is intentionally left dirty.
  const invoicePage=await page.context().newPage();
  await gotoOK(invoicePage,'/es/dashboard/profesional?tab=pro_billing&factura='+draftId);
  await invoicePage.getByRole('dialog',{name:'Borrador de factura',exact:true}).getByRole('button',{name:'Editar detalle de factura',exact:true}).click();
  const editor=invoicePage.getByRole('dialog',{name:'Detalle de factura',exact:true});await expect(editor).toBeVisible({timeout:60000});
  await editor.getByRole('button',{name:'Agregar línea',exact:true}).click();
  const lines=editor.getByRole('group',{name:/^Línea \d+$/});await expect(lines.first()).toBeVisible();
  for(const line of await lines.all()){
   // The detail editor is an accordion (one line open at a time): open this line first.
   const toggle=line.locator('button[aria-expanded]').first();if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');
   await line.getByText('Descuento, impuestos y CABYS',{exact:true}).click();
   await expect(line.getByLabel('Tratamiento de IVA',{exact:true})).toHaveValue('vat');
   const rate=line.getByLabel('Tarifa de IVA',{exact:true});await expect(rate).toHaveValue('08');await expect(rate.locator('option:checked')).toHaveText('Tarifa general 13 % · 08');
  }
  await invoicePage.screenshot({path:info.outputPath('invoice-project-vat-es.png'),fullPage:true});
 }finally{await cleanupDisposableAccount(owner);}
});
