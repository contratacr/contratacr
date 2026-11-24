import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {ownerFixture,local,origin} from './pro-round2-fixture';

// Area D: project-level Invoices view (list of the job's invoices with lifecycle, cards and filters). Disposable accounts, loopback only.
for(const language of ['es','en'] as const)test(`Project invoices [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);
 try{
  const draft=(title:string,total:number)=>({user_id:f.owner.id,id:crypto.randomUUID(),client_id:f.clientId,source_kind:'work',source_id:f.workId+':'+title,work_id:f.workId,title,notes:'',receiver_name:'Cliente ronda '+id,
   receiver_identification:'',receiver_email:'',receiver_phone:'',receiver_address:'',total_cents:total,material_count:0,material_cost:0,basis:'manual',source_fingerprint:'fp-'+title});
  await f.db.from('pro_invoice_drafts').insert([draft('Anticipo '+id,100000),draft('Final '+id,250000)]).throwOnError();
  await warmLocalRoutes(page,['/api/pro/work-invoices?workId='+f.workId]);
  const ok=await page.request.get(origin+'/api/pro/work-invoices?workId='+f.workId);expect(ok.status(),await ok.text()).toBe(200);
  const body=await ok.json();expect(body.workId).toBe(f.workId);expect(body.items).toHaveLength(2);expect(body.items[0]).toMatchObject({status:'draft',balanceCents:expect.any(Number)});
  expect((await page.request.get(origin+'/api/pro/work-invoices?workId=no-existe-'+id)).status()).toBe(404);
  expect((await page.request.get(origin+'/api/pro/work-invoices')).status()).toBe(400);
  const anonymous=await page.context().browser()!.newContext({baseURL:origin});expect((await anonymous.request.get(origin+'/api/pro/work-invoices?workId='+f.workId)).status()).toBe(401);await anonymous.close();
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'invoices'}));
  const view=page.locator('[data-work-invoices]');await expect(view).toBeVisible({timeout:90000});
  await expect(view.locator('[data-work-invoice]')).toHaveCount(2);
  await expect(view.locator('[data-finance-card="total"]')).toBeVisible();
  await view.locator('[data-finance-filter="paid"]').click();
  await expect(view.locator('[data-finance-no-match]')).toContainText(tr('Ninguna factura coincide','No invoice matches'));
  await view.locator('[data-finance-filter="draft"]').click();await expect(view.locator('[data-work-invoice]')).toHaveCount(2);
  await view.getByRole('textbox').fill('Anticipo');await expect(view.locator('[data-work-invoice]')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});
