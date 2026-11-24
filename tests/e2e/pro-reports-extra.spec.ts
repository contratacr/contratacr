import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,origin,headersFor} from './pro-round2-fixture';

// Area E (reports): time billing by member and by project, and the global selections tracker report. Disposable accounts, loopback only.
for(const language of ['es','en'] as const)test(`Extra report tabs [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const id=language+randomBytes(3).toString('hex'),f=await ownerFixture(page.context(),id),h=headersFor(f.owner);
 try{
  const areaId=crypto.randomUUID(),sel=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/selections',{headers:h,data:{actionId:crypto.randomUUID(),workId:f.workId,...data}});
  expect((await sel({action:'area_create',id:areaId,name:'Sala '+id})).status()).toBe(200);
  expect((await sel({action:'item_create',id:crypto.randomUUID(),areaId,name:'Lámpara '+id,dueDate:null,notes:null,allowanceId:null})).status()).toBe(200);
  await gotoOK(page,`/${language}/dashboard/pro?tab=statistics`);
  const reports=page.locator('[data-pro-reports]');await expect(reports).toBeVisible({timeout:90000});
  await reports.locator('[data-pro-report-tab="timeMember"]').click();await expect(reports.locator('[data-report-time="member"]')).toBeVisible({timeout:60000});
  await expect(reports.locator('[data-report-empty]')).toBeVisible();await expect(reports.locator('[data-report-time-export]')).toBeDisabled();
  await reports.locator('[data-pro-report-tab="timeProject"]').click();await expect(reports.locator('[data-report-time="project"]')).toBeVisible({timeout:60000});
  await reports.locator('[data-pro-report-tab="selections"]').click();await expect(reports.locator('[data-report-selections]')).toBeVisible({timeout:60000});
  await expect(reports.locator('[data-report-count]')).toHaveText('1');await expect(reports.locator('[data-report-selections-export]')).toBeEnabled();
  await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});
