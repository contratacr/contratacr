import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,origin,headersFor} from './pro-round2-fixture';
import {resolveReportRange} from '../../src/lib/pro/saved-reports';

// Area E (reports): saved custom reports (report type + period under a name). Disposable accounts, loopback only.
test('Saved reports: rolling ranges resolve against today',()=>{
 expect(resolveReportRange('this_month','2026-11-24',null,null)).toEqual({from:'2026-11-01',to:'2026-11-30'});
 expect(resolveReportRange('last_month','2026-01-15',null,null)).toEqual({from:'2025-12-01',to:'2025-12-31'});
 expect(resolveReportRange('last_30','2026-11-24',null,null)).toEqual({from:'2026-10-26',to:'2026-11-24'});
 expect(resolveReportRange('this_year','2026-11-24',null,null)).toEqual({from:'2026-01-01',to:'2026-12-31'});
 expect(resolveReportRange('fixed','2026-11-24','2026-02-01','2026-02-28')).toEqual({from:'2026-02-01',to:'2026-02-28'});
 expect(resolveReportRange('all','2026-11-24',null,null)).toEqual({from:'',to:''});
});
for(const language of ['es','en'] as const)test(`Saved reports [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const id=language+randomBytes(3).toString('hex'),f=await ownerFixture(page.context(),id),h=headersFor(f.owner);
 try{
  const post=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/saved-reports',{headers:h,data});
  expect(await (await page.request.get(origin+'/api/pro/saved-reports')).json()).toEqual({reports:[]});
  const rid=crypto.randomUUID();
  const ok=await post({action:'save',id:rid,name:'IVA del año',report:'vat',range:'this_year',from:null,to:null});expect(ok.status(),await ok.text()).toBe(200);
  expect((await ok.json()).reports[0]).toMatchObject({id:rid,name:'IVA del año',report:'vat',range:'this_year',from:null,to:null});
  expect((await post({action:'save',id:crypto.randomUUID(),name:'iva del año',report:'jobs',range:'all',from:null,to:null})).status()).toBe(409);
  expect((await post({action:'save',id:crypto.randomUUID(),name:'Mala',report:'nope',range:'all',from:null,to:null})).status()).toBe(400);
  expect((await post({action:'save',id:crypto.randomUUID(),name:'Fechas',report:'jobs',range:'fixed',from:'2026-05-02',to:'2026-05-01'})).status()).toBe(400);
  expect((await post({action:'save',id:crypto.randomUUID(),name:'Sin fechas',report:'jobs',range:'fixed',from:null,to:null})).status()).toBe(400);
  expect((await post({action:'save',id:crypto.randomUUID(),name:'  ',report:'jobs',range:'all',from:null,to:null})).status()).toBe(400);
  const fixed=await post({action:'save',id:crypto.randomUUID(),name:'Mayo',report:'jobs',range:'fixed',from:'2026-05-01',to:'2026-05-31'});expect(fixed.status(),await fixed.text()).toBe(200);
  expect((await post({action:'delete',id:crypto.randomUUID()})).status()).toBe(404);
  const anonymous=await page.context().browser()!.newContext({baseURL:origin});expect((await anonymous.request.get(origin+'/api/pro/saved-reports')).status()).toBe(401);await anonymous.close();

  await gotoOK(page,`/${language}/dashboard/pro?tab=statistics`);
  const reports=page.locator('[data-pro-reports]');await expect(reports).toBeVisible({timeout:90000});
  const bar=reports.locator('[data-saved-reports]');await expect(bar.locator('[data-saved-report]')).toHaveCount(2,{timeout:60000});
  await bar.locator(`[data-saved-report="${rid}"] [data-saved-report-open]`).click();
  await expect(reports.locator('[data-pro-report-tab="vat"]')).toHaveAttribute('aria-selected','true');
  const year=String(new Date().getFullYear());await expect(reports.locator('input[type="date"]').first()).toHaveValue(year+'-01-01');
  await reports.locator('[data-pro-report-tab="jobs"]').click();
  await bar.locator('[data-saved-report-name]').fill('Trabajos '+id);await bar.locator('[data-saved-report-range]').selectOption('last_30');await bar.locator('[data-saved-report-save]').click();
  await expect(bar.locator('[data-saved-report]')).toHaveCount(3,{timeout:60000});
  await bar.locator('[data-saved-report-delete]').last().click();await expect(bar.locator('[data-saved-report]')).toHaveCount(2,{timeout:60000});
  await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});
