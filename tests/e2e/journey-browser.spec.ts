import { test,expect } from 'playwright/test';
import { gotoOK,waitForInteractivePage,openLoginForm } from './helpers';
test('batched journey events omit typed email and password and show no new dialogs',async({page,context})=>{
 await context.clearCookies();
 await page.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
 const bodies:string[]=[];
 await page.route('**/api/analytics/journey',async route=>{bodies.push(route.request().postData()||'');await route.fulfill({status:204});});
 await page.route('**/api/analytics/usage',route=>route.fulfill({status:204}));
 await gotoOK(page,'/login');await waitForInteractivePage(page);await openLoginForm(page);
 await page.locator('main input[type="email"]').fill('private-person@example.com');
 await page.locator('main input[type="password"]').fill('Secret-never-record-this!');
 await expect.poll(()=>bodies.length,{timeout:12000}).toBeGreaterThan(0);
 const sent=bodies.join('');expect(sent).not.toMatch(/private-person|Secret-never|example.com|password|email/);
 expect(sent).toContain('form_start');
 expect(JSON.parse(bodies[0]).events.length).toBeLessThanOrEqual(20);
 await expect(page.locator('[data-legal-acceptance]')).toHaveCount(0);
});
