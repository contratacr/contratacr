import {test,expect} from 'playwright/test';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local} from './pro-round2-fixture';

// Area E (help center): browse by feature chips, suggested topics and resource cards. Disposable account, loopback only.
for(const language of ['es','en'] as const)test(`Help center categories [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const label=language+crypto.randomUUID().slice(0,6),f=await ownerFixture(page.context(),label);
 try{
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'ayuda'}));
  const help=page.locator('[data-help-center]');await expect(help).toBeVisible({timeout:90000});
  const all=await help.locator('[data-help-article]').count();expect(all).toBeGreaterThanOrEqual(60);
  await help.locator('[data-help-area-chip="selections"]').click();
  await expect(help.locator('[data-help-area]')).toHaveCount(1);await expect(help.locator('[data-help-area="selections"]')).toBeVisible();
  expect(await help.locator('[data-help-article]').count()).toBeLessThan(all);
  await help.locator('[data-help-quick]').nth(1).click();
  await expect(help.locator('[data-help-area-chip="all"]')).toHaveAttribute('aria-pressed','true');
  await expect(help.locator('[data-help-article="first_quote"]')).toBeVisible();
  await help.locator('[data-help-resource="soporte"]').click();
  await expect(page).toHaveURL(/empresa=soporte/,{timeout:60000});
  await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});
