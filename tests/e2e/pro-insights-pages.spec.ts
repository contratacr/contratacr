import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local} from './pro-round2-fixture';
import {insightsChecklist,websiteChecks,type InsightsSite} from '../../src/lib/pro/insights';

// Area E: marketing insights sub-pages (profile and reviews, exposure, photos, website, leads, campaigns).
const base=():InsightsSite=>({profile:{bio:'',services:[],photos:[],rating:{average:null,count:null}},site:null,submissions:0});
test('Insights checklists are computed from real profile data',()=>{
 expect(insightsChecklist(base(),false).every(x=>!x.done)).toBe(true);
 const full:InsightsSite={profile:{bio:'x'.repeat(80),services:[{name:'Pintura'}],photos:['a','b','c','d','e'],rating:{average:5,count:2}},site:{published:true,sections:[{type:'contact',enabled:true},{type:'portfolio',enabled:true},{type:'reviews',enabled:true}]},submissions:3};
 expect(insightsChecklist(full,true).every(x=>x.done)).toBe(true);expect(websiteChecks(full,true).every(x=>x.done)).toBe(true);
 expect(websiteChecks(base(),false).find(x=>x.key==='published')!.done).toBe(false);
});
for(const language of ['es','en'] as const)test(`Marketing insights pages [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const f=await ownerFixture(page.context(),language+randomBytes(3).toString('hex'));
 try{
  await f.db.from('professionals').update({portfolio_urls:['https://photos.ins.test/1.png','https://photos.ins.test/2.png'],bio:'Hacemos remodelaciones completas de cocinas y baños en Heredia con acabados de calidad.'}).eq('profile_id',f.owner.id).throwOnError();
  const url=(seccion?:string)=>`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'insights',...(seccion?{seccion}:{})});
  await gotoOK(page,url());
  const root=page.locator('[data-company-insights]');await expect(root).toHaveAttribute('data-company-insights','profile',{timeout:90000});
  await expect(root.locator('[data-insights-step="description"]')).toHaveAttribute('data-done','true',{timeout:60000});
  await expect(root.locator('[data-insights-step="photos"]')).toHaveAttribute('data-done','false');
  await root.locator('[data-insights-tab="photos"]').click();await expect(root.locator('[data-insights-photos]')).toBeVisible({timeout:60000});
  await root.locator('[data-insights-tab="website"]').click();await expect(root.locator('[data-insights-check="published"]')).toHaveAttribute('data-done','false',{timeout:60000});
  await root.locator('[data-insights-tab="exposure"]').click();await expect(root.locator('[data-insights-kpi="submissions"]')).toHaveText('0',{timeout:60000});
  await root.locator('[data-insights-tab="leads"]').click();await expect(root.locator('[data-lead-origin-metrics]')).toBeVisible({timeout:60000});
  // Row 19: lead insights (periods, comparison, sources, funnel, honest note, request box).
  await expect(root.locator('[data-lead-insights]')).toBeVisible({timeout:60000});await expect(root.locator('[data-lead-insights-kpi="total"]')).toBeVisible({timeout:60000});
  await expect(root.locator('[data-lead-insights-funnel] [data-lead-insights-stage]').first()).toBeVisible();await expect(root.locator('[data-lead-insights-note]')).toBeVisible();
  await root.locator('[data-lead-insights-range="1y"]').click();await expect(root.locator('[data-lead-insights-period]')).toBeVisible({timeout:60000});
  await root.locator('[data-lead-insights-request-text]').fill('Quiero ver el costo por solicitud');await root.locator('[data-lead-insights-request-send]').click();await expect(root.locator('[data-lead-insights-request-sent]')).toBeVisible({timeout:60000});
  await root.locator('[data-insights-tab="campaigns"]').click();await expect(page.locator('[data-company-ads]')).toBeVisible({timeout:60000});
  await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});
