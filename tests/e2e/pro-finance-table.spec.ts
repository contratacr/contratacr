import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {ownerFixture,local,origin} from './pro-round2-fixture';

// Area D: table view of the project invoices (columns, sortable headers, column picker, linked docs and updated fields). Disposable accounts, loopback only.
for(const language of ['es','en'] as const)test(`Invoices table view [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);
 try{
  const draft=(title:string,total:number)=>({user_id:f.owner.id,id:crypto.randomUUID(),client_id:f.clientId,source_kind:'work',source_id:f.workId+':'+title,work_id:f.workId,title,notes:'',receiver_name:'Cliente tabla '+id,
   receiver_identification:'',receiver_email:'',receiver_phone:'',receiver_address:'',total_cents:total,material_count:0,material_cost:0,basis:'manual',source_fingerprint:'fp-'+title});
  await f.db.from('pro_invoice_drafts').insert([draft('Anticipo '+id,100000),draft('Final '+id,250000)]).throwOnError();
  await warmLocalRoutes(page,['/api/pro/work-invoices?workId='+f.workId]);
  const ok=await page.request.get(origin+'/api/pro/work-invoices?workId='+f.workId);expect(ok.status(),await ok.text()).toBe(200);
  const body=await ok.json();expect(body.items[0]).toMatchObject({linkedDocs:0,updatedAt:expect.any(String)});
  await page.addInitScript(()=>{try{if(window.sessionStorage.getItem('finance-table-spec-reset'))return;window.sessionStorage.setItem('finance-table-spec-reset','1');window.localStorage.removeItem('pro-finance-view:invoices');window.localStorage.removeItem('pro-finance-columns:invoices');}catch{/* private window */}});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'invoices'}));
  const view=page.locator('[data-work-invoices]');await expect(view).toBeVisible({timeout:90000});
  await expect(view.locator('[data-work-invoice]')).toHaveCount(2);
  await view.locator('[data-finance-view="table"]').click();
  const table=view.locator('[data-finance-table="invoices"]');await expect(table).toBeVisible();
  await expect(table.locator('[data-finance-row]')).toHaveCount(2);
  for(const key of ['title','recipient','code','status','shared','created','total','balance','due','linked','sent','updated'])await expect(table.locator(`[data-finance-column="${key}"]`)).toBeVisible();
  await expect(table.locator('[data-finance-column="total"]')).toContainText('Total');
  await expect(table.locator('[data-finance-column="linked"]')).toContainText(tr('Documentos vinculados','Linked docs'));
  await expect(table.locator('[data-finance-row] [data-finance-cell="code"]').first()).toHaveText(/^FAC-[0-9A-F]{6}$/);
  // Sorting by total: ascending first, then descending.
  const totals=async()=>table.locator('[data-finance-cell="total"]').allInnerTexts();
  await table.locator('[data-finance-sort="total"]').click();await expect(table.locator('[data-finance-column="total"]')).toHaveAttribute('aria-sort','ascending');
  const asc=await totals();await table.locator('[data-finance-sort="total"]').click();await expect(table.locator('[data-finance-column="total"]')).toHaveAttribute('aria-sort','descending');
  expect(await totals()).toEqual([...asc].reverse());
  // Column picker hides and restores a column, and the choice survives a reload.
  await table.locator('[data-finance-columns-toggle]').click();
  await table.locator('[data-finance-column-option="due"]').uncheck();await expect(table.locator('[data-finance-column="due"]')).toHaveCount(0);
  await expect(table.locator('[data-finance-column-option="title"]')).toBeDisabled();
  await page.reload();await expect(view).toBeVisible({timeout:90000});await expect(view.locator('[data-finance-table="invoices"]')).toBeVisible();
  await expect(view.locator('[data-finance-column="due"]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await view.locator('[data-finance-open]').first().click();await expect(page).toHaveURL(/tab=pro_billing/);
 }finally{await f.cleanup();}
});
