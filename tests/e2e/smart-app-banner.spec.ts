import { waitForInteractivePage } from './helpers';
import { test, expect } from 'playwright/test';
import { readFileSync } from 'node:fs';
import { publicAppEntryUrl } from '../../src/lib/mobile/public-app-entry';

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

test('public app entry preserves destinations and excludes private or authentication URLs', () => {
 expect(publicAppEntryUrl('/profesionales?categoria=soldadura&ubicacion=Heredia')?.href).toBe('https://contratacr.com/profesionales?categoria=soldadura&ubicacion=Heredia');
 expect(publicAppEntryUrl('/profesionales?_rsc=internal&categoria=soldadura')?.href).toBe('https://contratacr.com/profesionales?categoria=soldadura');
 expect(publicAppEntryUrl('/en')?.href).toBe('https://contratacr.com/en');
 for(const path of ['/dashboard','/admin','/login','/auth/callback?code=once','/api/email/baja','/empleos/publicar','/promociones/mis-promociones','/profesionales?access_token=secret','/#access_token=secret','/profesionales#id_token=secret','//evil.example/','/\\evil.example/']) expect(publicAppEntryUrl(path)).toBeNull();
});

test('Safari initial document has the custom bottom notice without native banner metadata', async ({ browser, baseURL }) => {
 const context = await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844},userAgent:iphone});
 try {
  const page=await context.newPage();
  for(const path of ['/', '/profesionales?categoria=soldadura', '/en/proyectos']) {
   const response=await page.goto(`${baseURL}${path}`);
   expect(response!.status()).toBe(200);expect(response!.headers().location).toBeUndefined();
   await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveCount(0);
   const notice=page.getByTestId('mobile-app-download');await expect(notice).toHaveCount(1);
   const box=(await notice.boundingBox())!;expect(box.y+box.height).toBeCloseTo(844,0);
   await expect(notice.getByRole('link')).toHaveText(path.startsWith('/en')?'Open app':'Abrir app');
   // Marketplace lists have their own mobile header instead of LandingNavbar.
   if(path === '/') await expect(page.getByTestId('landing-navbar')).toBeVisible();
   else await expect(page.getByRole('button',{name:/Open menu|Abrir menú|Abrir menu/}).filter({visible:true})).toHaveCount(1);
  }
 } finally {await context.close();}
});

test('Apple association still supports verified app opening without capturing auth routes', () => {
 const association=JSON.parse(readFileSync('public/.well-known/apple-app-site-association','utf8'));
 const paths=association.applinks.details[0].components.map((entry:Record<string,string>)=>entry['/']);
 for(const path of ['/','/en','/es','/profesionales','/en/profesionales','/es/profesionales']) expect(paths).toContain(path);
 for(const path of ['/*','/auth/*','/api/*','/admin*','/login']) expect(paths).not.toContain(path);
 expect(association.webcredentials.apps).toEqual(['LPB3Q4LJ5Z.com.contratacr.app']);
});

test('custom notice keeps one owner through menu, language, private and native navigation', async ({page,context,baseURL}) => {
 const mobile=(page.viewportSize()?.width??1280)<1024;
 const response=await page.goto('/profesionales?ubicacion=Heredia');
 expect(await response!.text()).not.toContain('name="apple-itunes-app"');
 await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveCount(0);
 const notice=page.getByTestId('mobile-app-download');
 if(mobile) await expect(notice).toHaveCount(1);else await expect(notice).toHaveCount(0);
 await waitForInteractivePage(page);
 if(mobile) {
  await page.getByRole('button',{name:/Abrir menú|Abrir menu/}).filter({visible:true}).first().click();
  await expect(page.getByTestId('mobile-menu-store-link').filter({visible:true})).toHaveAttribute('href','/descargar');
  await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveCount(0);
 }
 await page.goto('/en/proyectos');await waitForInteractivePage(page);
 await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveCount(0);
 if(mobile) await expect(notice).toHaveCount(1);
 await page.goto('/login');await waitForInteractivePage(page);
 await expect(notice).toHaveCount(0);
 await page.addInitScript(()=>localStorage.setItem('ccr:native-first-run-onboarding:v12','1'));
 await context.addCookies([{name:'ccr_platform',value:'native',url:baseURL!}]);
 await page.goto('/profesionales');
 await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveCount(0);
 await expect(notice).toHaveCount(0);
 await expect(page.getByTestId('mobile-menu-store-link')).toHaveCount(0);
});
