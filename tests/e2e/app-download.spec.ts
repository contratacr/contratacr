import { test, expect } from 'playwright/test';

test('web: tiendas correctas, reserva, teclado y cierre persistente', async ({page}) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 1024);
  await page.goto('/');
  await expect(page.getByTestId('app-download-section')).toBeVisible();
  const banner=page.getByTestId('mobile-app-download');
  await expect(banner).toBeVisible();
  const href=await banner.locator('a').getAttribute('href');
  const android=await page.evaluate(()=>/Android/.test(navigator.userAgent));
  expect(href).toContain(android?'play.google.com/store/apps/details?id=com.contratacr.app':'apps.apple.com/cr/app/contratacr/id6794559661');
  const sizes=await banner.evaluate(el=>({spacer:el.getBoundingClientRect().height,notice:el.querySelector('aside')!.getBoundingClientRect().height}));
  expect(sizes.spacer).toEqual(sizes.notice);
  await page.evaluate(()=>document.documentElement.setAttribute('data-keyboard-open',''));
  await expect(banner).toHaveCount(0);
  await page.evaluate(()=>document.documentElement.removeAttribute('data-keyboard-open'));
  await expect(banner).toBeVisible();
  await banner.getByRole('button').click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(banner).toHaveCount(0);
});

test('native: no download section, links or banner; form: no banner', async ({page,context,baseURL}) => {
  await context.addCookies([{name:'ccr_platform',value:'native',url:baseURL!}]);
  await page.addInitScript(()=>{localStorage.setItem('ccr:native-first-run-onboarding:v12','1'); const runtime={isNativePlatform:()=>true}; Object.defineProperty(window,'Capacitor',{configurable:true,get:()=>runtime,set:value=>{Object.assign(runtime,value);runtime.isNativePlatform=()=>true;}});});
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/ccr-native-app/);
  await expect(page.getByTestId('app-download-section')).toHaveCount(0);
  await expect(page.getByTestId('app-store-links')).toHaveCount(0);
  await expect(page.getByTestId('mobile-app-download')).toHaveCount(0);
});

test('web forms never display download banner',async({page})=>{
 await page.goto('/publicar-proyecto');
 await expect(page.getByTestId('mobile-app-download')).toHaveCount(0);
});
