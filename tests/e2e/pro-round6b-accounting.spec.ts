import {test,expect,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin} from './pro-round2-fixture';
import {blankInvoiceLine} from '../../src/lib/pro/invoice-detail';

// Round 6B (2026-11-13): QuickBooks Online in MOCK mode (row 56) + CSV export for any CR accounting system.
// Mock Intuit OAuth, mapping (accounts, IVA codes), sync of customers / invoices / payments, conflict handling
// (remote-only edit kept, edit on both sides → conflict, keep ContrataCR), production refused. Loopback only.
const shots=process.env.ROUND6B_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const line=(patch:Record<string,unknown>={})=>({...blankInvoiceLine(),kind:'service',description:'Remodelación de baño',cabys:'4329000000100',unit:'Sp',quantity:'1',unitPrice:'1000000',taxTreatment:'vat',taxRate:'13',tax:{vatCode:'08',exemption:null},...patch});
for(const language of ['es','en'] as const)test(`Round 6B: QuickBooks sync and CSV export in mock mode [${language}]`,async({page},info)=>{
 test.setTimeout(480000);local(info.project.use.baseURL);const en=language==='en',project=info.project.name,label=language+crypto.randomUUID().slice(0,6);
 const f=await ownerFixture(page.context(),label);
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner);
  // One internal draft (13 % + 4 % lines) with a recorded payment applied to it.
  const draftId=crypto.randomUUID();
  const created=await page.request.post(origin+'/api/pro/invoice-drafts',{headers:h,data:{action:'create_direct',requestId:draftId,clientId:f.clientId,title:en?'Bathroom invoice':'Factura baño',notes:'',lines:[line(),line({description:'Materiales',unitPrice:'500000',taxRate:'4',tax:{vatCode:'04',exemption:null}})]}});
  expect(created.status(),await created.text()).toBe(200);
  const pay=await (await page.request.get(origin+'/api/pro/invoice-payments?id='+draftId)).json();
  expect((await page.request.post(origin+'/api/pro/invoice-payments',{headers:h,data:{action:'apply',requestId:crypto.randomUUID(),draftId,draftRevision:pay.draft.revision,revision:pay.revision,source:'new',amountCents:50000000,receivedOn:'2026-11-13',method:'sinpe',reference:'SINPE-123'}})).status()).toBe(200);
  const api=async()=>(await (await page.request.get(origin+'/api/pro/accounting')).json()) as {mapping:{revision:number};links:{entity:string;localId:string;status:string;remoteId:string|null;conflict:{reason:string}|null}[];gaps:string[];connected:boolean};
  const post=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/accounting',{headers:h,data:{actionId:crypto.randomUUID(),...data}});

  // (1) Company › Accounting: connect QuickBooks through the mock Intuit consent (realmId returned).
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'contabilidad'}));
  const root=page.locator('[data-company-accounting]');await expect(root).toBeVisible({timeout:90000});await expect(root).toHaveAttribute('data-accounting-mode','mock');
  await expect(root.locator('[data-quickbooks]')).toHaveAttribute('data-quickbooks','disconnected');
  expect((await post({action:'sync'})).status()).toBe(409); // not connected
  await root.locator('[data-qbo-connect]').click();
  await expect(page.locator('[data-mock-consent="quickbooks"]')).toBeVisible({timeout:60000});await page.locator('[data-mock-allow]').click();
  await expect(page.locator('[data-oauth-result="connected"]')).toBeVisible({timeout:90000});
  await expect(root.locator('[data-quickbooks]')).toHaveAttribute('data-quickbooks','connected');
  await expect(root.locator('[data-qbo-counts]')).toContainText(en?'0 invoices':'0 facturas'); // default scope: only invoices accepted by Hacienda
  // (2) Mapping: include internal drafts; a missing IVA code blocks the sync until it is mapped.
  const mapping=root.locator('[data-qbo-mapping]');
  await mapping.locator('[data-qbo-field="income"]').selectOption('1');await mapping.locator('[data-qbo-field="deposit"]').selectOption('35');
  await mapping.locator('[data-qbo-vat="08"]').selectOption('5');await mapping.locator('[data-qbo-scope="all"]').check();
  await mapping.locator('[data-qbo-save-mapping]').click();
  await expect(root.locator('[data-qbo-gaps] li')).toHaveText([en?'The tax code is missing for IVA 4 %':'Falta el código de impuesto para IVA 4 %'],{timeout:60000});
  await expect(root.locator('[data-qbo-sync]')).toBeDisabled();
  await mapping.locator('[data-qbo-vat="04"]').selectOption('6');await mapping.locator('[data-qbo-save-mapping]').click();
  await expect(root.locator('[data-accounting-notice]')).toContainText(en?'Mapping saved.':'Mapeo guardado.',{timeout:60000});
  await expect(root.locator('[data-qbo-gaps]')).toHaveCount(0);await expect(root.locator('[data-qbo-counts]')).toContainText(en?'1 invoice':'1 factura');
  expect((await post({action:'save_mapping',revision:0,incomeAccount:'1',depositAccount:'35',vatMap:{'08':'5'},invoiceScope:'all'})).status()).toBe(409); // stale revision
  await expectNoHorizontalOverflow(page);await mapping.scrollIntoViewIfNeeded();await shot(page,`r6b-qbo-mapping-${language}`,project);
  // (3) Sync: customer → invoice → payment created in the mock company.
  await root.locator('[data-qbo-sync]').click();
  await expect(root.locator('[data-accounting-notice]')).toContainText(en?'3 created':'3 creados',{timeout:60000});
  await expect(root.locator('[data-qbo-link-status="synced"]')).toHaveCount(3);
  const remoteInvoice=(await f.db.from('pro_mock_qbo_entities').select('data').eq('owner_id',f.owner.id).eq('entity','invoice').single()).data!.data as {Line:{Amount:number;SalesItemLineDetail:{TaxCodeRef:{value:string}}}[];DocNumber:string;CustomerRef:{value:string}};
  expect(remoteInvoice.Line.map(l=>[l.Amount,l.SalesItemLineDetail.TaxCodeRef.value])).toEqual([[1000000,'5'],[500000,'6']]);expect(remoteInvoice.DocNumber).toMatch(/^BORRADOR-/);
  const remotePayment=(await f.db.from('pro_mock_qbo_entities').select('data').eq('owner_id',f.owner.id).eq('entity','payment').single()).data!.data as {TotalAmt:number;DepositToAccountRef:{value:string}};
  expect(remotePayment).toMatchObject({TotalAmt:500000,DepositToAccountRef:{value:'35'}});
  expect(await (await post({action:'sync'})).json()).toMatchObject({created:0,updated:0,unchanged:3}); // idempotent
  // (4) Edit only in QuickBooks → QuickBooks version kept (nothing overwritten).
  const customerLink=(await api()).links.find(l=>l.entity==='customer')!;
  await root.locator(`[data-qbo-simulate-edit="${customerLink.localId}"]`).click();await expect(root.locator(`[data-qbo-simulate-edit="${customerLink.localId}"]`)).toBeEnabled({timeout:30000});
  expect(await (await post({action:'sync'})).json()).toMatchObject({remoteKept:1,conflicts:0});
  // Edit in BOTH places → conflict shown, resolved keeping ContrataCR (pushed with the fresh SyncToken).
  await f.db.from('pro_clients').update({email:'nuevo.'+label+'@example.test'}).eq('user_id',f.owner.id).eq('id',f.clientId).throwOnError();
  expect((await post({action:'simulate_remote_edit',entity:'customer',localId:customerLink.localId})).status()).toBe(200);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'contabilidad'}));await expect(root).toBeVisible({timeout:90000});
  await root.locator('[data-qbo-sync]').click();
  const conflict=root.locator('[data-qbo-conflict="both_changed"]');await expect(conflict).toBeVisible({timeout:60000});
  await expectNoHorizontalOverflow(page);await conflict.scrollIntoViewIfNeeded();await shot(page,`r6b-qbo-conflict-${language}`,project);
  await conflict.locator('[data-qbo-keep="local"]').click();
  await expect(root.locator('[data-qbo-conflict]')).toHaveCount(0,{timeout:60000});
  const customer=(await f.db.from('pro_mock_qbo_entities').select('data,sync_token').eq('owner_id',f.owner.id).eq('entity','customer').single()).data!;
  expect((customer.data as {PrimaryEmailAddr:{Address:string}}).PrimaryEmailAddr.Address).toBe('nuevo.'+label+'@example.test');expect(customer.sync_token).toBe(3);
  expect((await post({action:'resolve',entity:'customer',localId:customerLink.localId,choice:'keep_local'})).status()).toBe(409); // already resolved
  // (5) CSV export (Excel Costa Rica): BOM, «;», decimal comma, VAT per rate.
  const csv=root.locator('[data-accounting-csv]');await csv.locator('[data-csv-field="scope"]').selectOption('all');
  const href=await csv.locator('[data-csv-download]').getAttribute('href');
  const file=await page.request.get(origin+href!);expect(file.status()).toBe(200);expect(file.headers()['content-type']).toContain('text/csv');expect(file.headers()['content-disposition']).toMatch(en?/contratacr-invoices-/:/contratacr-facturas-/);
  const text=await file.text();const rows=text.replace(/^﻿/,'').trim().split('\r\n');
  expect(rows[0]).toMatch(en?/^Date;Number;Hacienda key;Status/:/^Fecha;Número;Clave Hacienda;Estado/);
  expect(rows).toHaveLength(2);expect(rows[1]).toContain(en?'Internal draft':'Borrador interno');expect(rows[1]).toContain('1000000,00;130000,00');expect(rows[1]).toContain('500000,00;20000,00');
  const emitted=await (await page.request.get(origin+'/api/pro/accounting-export?'+new URLSearchParams({kind:'invoices',format:'standard',scope:'emitted'}))).text();
  expect(emitted.trim().split('\r\n')).toHaveLength(1); // header only: nothing emitted to Hacienda
  const payments=await (await page.request.get(origin+'/api/pro/accounting-export?'+new URLSearchParams({kind:'payments',format:'cr',scope:'all'}))).text();expect(payments).toContain('SINPE-123;500000,00');
  expect((await page.request.get(origin+'/api/pro/accounting-export?'+new URLSearchParams({kind:'invoices',format:'cr',from:'2026-12-01',to:'2026-11-01'}))).status()).toBe(400);
  // (6) Production refused for QuickBooks without the server flag.
  const integrations=(await (await page.request.get(origin+'/api/pro/integrations')).json()) as {providers:{id:string;connection:{revision:number}}[]};
  const refused=await page.request.post(origin+'/api/pro/integrations',{headers:h,data:{action:'set_mode',actionId:crypto.randomUUID(),provider:'quickbooks',revision:integrations.providers.find(p=>p.id==='quickbooks')!.connection.revision,mode:'production',confirm:'ACTIVAR PRODUCCION'}});
  expect(refused.status()).toBe(403);
  await csv.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await shot(page,`r6b-qbo-synced-${language}`,project);
  expect(errors()).toEqual([]);
 }finally{await f.cleanup();}
});
