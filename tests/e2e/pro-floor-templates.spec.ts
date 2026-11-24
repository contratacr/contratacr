import {test,expect} from 'playwright/test';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local} from './pro-round2-fixture';

// Row 15: floor plan templates, duplicate and "My floor plans" with last-modified date. Disposable accounts, loopback only.
for(const language of ['es','en'] as const)test(`Floor plan templates, duplicate and list [${language}]`,async({page},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);const en=language==='en',label=language+crypto.randomUUID().slice(0,6),t=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),label);
 try{
  const errors=collectPageErrors(page);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'takeoffs'}));
  const plans=page.locator('[data-floor-plans]');await expect(plans).toBeVisible({timeout:90000});await plans.scrollIntoViewIfNeeded();
  await expect(plans.locator('[data-floor-template]')).toHaveCount(7);
  await plans.locator('[data-floor-template="kitchen"]').click();
  await expect(plans.locator('[data-floor-name]')).toHaveValue(t('Cocina','Kitchen'));
  await expect(plans.locator('[data-floor-room]')).toHaveCount(1);await expect(plans.locator('[data-floor-object]').first()).toBeVisible();
  await expect(plans.locator('[data-floor-duplicate]')).toBeDisabled();
  await plans.locator('[data-floor-save]').click();await expect(plans.locator('[data-floor-notice]')).toBeVisible({timeout:60000});
  await plans.locator('[data-floor-duplicate]').click();
  await expect(plans.locator('[data-floor-name]')).toHaveValue(t('Copia de Cocina','Copy of Kitchen'),{timeout:60000});
  await plans.locator('[data-floor-list] summary').click();await expect(plans.locator('[data-floor-list-item]')).toHaveCount(2);
  await expect(plans.locator('[data-floor-list-item]').first()).toContainText(t('Última modificación','Last modified'));
  await expect(plans.locator('[data-floor-print]')).toBeEnabled();
  await expectNoHorizontalOverflow(page);expect(errors()).toEqual([]);
 }finally{await f.cleanup();}
});
