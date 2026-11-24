import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,origin,headersFor} from './pro-round2-fixture';

// Area E (calendar): meeting types (name, length, where, video app, description). Disposable accounts, loopback only.
for(const language of ['es','en'] as const)test(`Meeting types [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const f=await ownerFixture(page.context(),language+randomBytes(3).toString('hex')),h=headersFor(f.owner);
 try{
  const post=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/meeting-types',{headers:h,data});
  const id=crypto.randomUUID(),body={action:'save',id,revision:0,name:'Visita inicial',minutes:45,locationKind:'project_address',videoApp:null,description:'Primera visita al sitio'};
  const created=await post(body);expect(created.status(),await created.text()).toBe(200);expect((await created.json()).type).toMatchObject({id,minutes:45,locationKind:'project_address',revision:1});
  expect((await post({...body,id:crypto.randomUUID(),name:'visita inicial'})).status()).toBe(409);
  expect((await post({...body,revision:0})).status()).toBe(409);
  expect((await post({...body,revision:1,minutes:2})).status()).toBe(400);
  expect((await post({...body,revision:1,videoApp:'zoom'})).status()).toBe(400);
  const upd=await post({...body,revision:1,minutes:60,locationKind:'video',videoApp:'meet'});expect(upd.status()).toBe(200);expect((await upd.json()).type).toMatchObject({minutes:60,videoApp:'meet',revision:2});
  const anonymous=await page.context().browser()!.newContext({baseURL:origin});expect((await anonymous.request.get(origin+'/api/pro/meeting-types')).status()).toBe(401);await anonymous.close();
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'reuniones'}));
  const root=page.locator('[data-meeting-types]');await expect(root).toBeVisible({timeout:90000});await expect(root.locator(`[data-meeting-type="${id}"]`)).toContainText('60');
  await root.locator('[data-meeting-type-new]').click();await root.locator('[data-meeting-type-field="name"]').fill('Revisión de avance');await root.locator('[data-meeting-type-field="minutes"]').fill('30');await root.locator('[data-meeting-type-save]').click();
  await expect(root.locator('[data-meeting-type]')).toHaveCount(2,{timeout:60000});
  await root.locator('[data-meeting-type-delete]').last().click();await expect(root.locator('[data-meeting-type]')).toHaveCount(1,{timeout:60000});
  await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});
