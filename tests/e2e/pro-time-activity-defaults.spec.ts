import {test,expect} from 'playwright/test';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {fixture,local,login,origin,uuid} from './pro-schedule-time-fixture';
import {bpsToPercent,percentToBps} from '../../src/lib/pro/time-activity-defaults';

// Area A (time management): default markup % and taxable flag per activity, used as the start of a manual time entry.
const api='/api/pro/time-activity-defaults',time='/api/pro/time-tracking';
test('activity defaults: percent conversion',()=>{
 expect(percentToBps('')).toBe(0);expect(percentToBps('12,5')).toBe(1250);expect(percentToBps('1000')).toBe(100000);
 for(const bad of ['1001','-1','abc','1.234','12345'])expect(percentToBps(bad),bad).toBeNull();
 expect(bpsToPercent(0)).toBe('');expect(bpsToPercent(1250)).toBe('12.5');
});
for(const language of ['es','en'] as const)test(`Time activity defaults: markup and taxable per activity [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(300000);local(baseURL);const en=language==='en',f=await fixture(page.context(),'tad',1),{owner,rival}=f,[workId]=f.works;
 try{
  await login(page.context(),owner);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  const activityId=uuid(),create=await page.request.post(origin+time,{headers:{Origin:origin},data:{action:'activity_save',actionId:uuid(),activityId,revision:0,name:'Pintura',rateCents:1500000,costCents:900000,billable:true}});expect(create.status(),await create.text()).toBe(200);
  const post=(data:Record<string,unknown>)=>page.request.post(origin+api,{headers:{Origin:origin},data});
  expect((await (await page.request.get(origin+api)).json()).items).toEqual({});
  const saved=await post({activityId,revision:0,markupBps:1500,taxable:true});expect(saved.status(),await saved.text()).toBe(200);expect(await saved.json()).toMatchObject({revision:1,markupBps:1500,taxable:true});
  expect((await (await page.request.get(origin+api)).json()).items[activityId]).toEqual({revision:1,markupBps:1500,taxable:true});
  expect((await post({activityId,revision:0,markupBps:0,taxable:false})).status()).toBe(409);
  for(const bad of [{markupBps:100001},{markupBps:-1},{taxable:'si'},{activityId:'x'},{extra:1}])expect((await post({activityId,revision:1,markupBps:0,taxable:false,...bad})).status()).toBe(400);
  expect((await post({activityId:uuid(),revision:0,markupBps:0,taxable:false})).status()).toBe(404);
  expect((await page.request.get(origin+api+'?x=1')).status()).toBe(400);
  const other=await browser.newContext({baseURL});await login(other,rival);expect((await other.request.get(origin+api)).status()).toBe(200);expect((await (await other.request.get(origin+api)).json()).items).toEqual({});
  expect((await other.request.post(origin+api,{headers:{Origin:origin},data:{activityId,revision:1,markupBps:0,taxable:false}})).status()).toBe(404);await other.close();
  const anonymous=await browser.newContext({baseURL:origin});expect((await anonymous.request.get(origin+api)).status()).toBe(401);await anonymous.close();
  // UI: the saved defaults appear in the activity editor and prefill a manual entry.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'time'}));
  const section=page.locator('[data-time-tracking]');await expect(section).toBeVisible({timeout:60000});
  await section.locator('[data-time-activities] summary').click();
  await section.locator(`[data-time-activity="${activityId}"]`).getByRole('button',{name:en?'Edit':'Editar'}).click();
  const form=section.locator('[data-time-activity-form]');
  await expect(form.locator('[data-time-field="activity-markup"]')).toHaveValue('15');await expect(form.locator('[data-time-field="activity-taxable"]')).toBeChecked();
  await form.locator('[data-time-field="activity-markup"]').fill('20');await form.locator('[data-time-field="activity-taxable"]').uncheck();
  await form.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();await expect(form).toHaveCount(0);
  await expect.poll(async()=>(await (await page.request.get(origin+api)).json()).items[activityId]).toEqual({revision:2,markupBps:2000,taxable:false});
  await section.locator('[data-time-manual-open]').click();
  const manual=section.locator('[data-time-manual]');await expect(manual).toBeVisible();
  await manual.locator('select').filter({hasText:'Pintura'}).selectOption(activityId);
  await expect(manual.locator('input[data-time-field="markup"]')).toHaveValue('20');await expect(manual.locator('input[data-time-field="taxable"]')).not.toBeChecked();
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`time-activity-defaults-${language}.png`),fullPage:true});
 }finally{await f.cleanup();}
});
