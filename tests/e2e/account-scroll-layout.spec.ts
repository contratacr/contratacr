import {test, expect} from 'playwright/test';
import {waitForInteractivePage} from './helpers';

test('short account screens fit and center in the available mobile viewport', async ({page}) => {
 for (const route of ['/registro', '/olvide-contrasena']) {
  await page.setViewportSize({width:390,height:844});
  await page.goto(route);await waitForInteractivePage(page);await expect(page.locator('main')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollHeight-innerHeight)).toBeLessThanOrEqual(1);
  const layout=await page.locator('main').evaluate(el=>{
   const r=el.getBoundingClientRect(),c=el.firstElementChild!.getBoundingClientRect();
   return {above:c.top-r.top,below:r.bottom-c.bottom};
  });
  expect(Math.abs(layout.above-layout.below)).toBeLessThanOrEqual(2);
  await expect(page.locator('footer')).toBeHidden();
 }
});

test('long account forms scroll to their final controls without nested visible scroll areas', async ({page}) => {
 for(const route of ['/registro/cliente','/registro/profesional','/login','/reset-password']) {
  await page.setViewportSize({width:320,height:480});
  await page.goto(route);await waitForInteractivePage(page);const main=page.locator('main');await expect(main).toBeVisible();
  await expect(page.locator('footer')).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const controls=main.locator('input,button,a').filter({visible:true});
  await controls.first().scrollIntoViewIfNeeded();await expect(controls.first()).toBeInViewport();
  await controls.last().scrollIntoViewIfNeeded();await expect(controls.last()).toBeInViewport();
  expect(await main.evaluate(el=>[el,...el.querySelectorAll('*')].filter(node=>{
   const e=node as HTMLElement;return e.getClientRects().length>0 && e.scrollHeight>e.clientHeight+2 && ['auto','scroll'].includes(getComputedStyle(e).overflowY);
  }).length)).toBe(0);
 }
});
