import { waitForInteractivePage } from "./helpers";
import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { smartAppBannerContent, prefersNativeIosAppBanner } from "../../src/lib/mobile/smart-app-banner";

test("Apple banner preserves public destinations while excluding private and authentication URLs",()=>{
  expect(smartAppBannerContent('/profesionales?categoria=soldadura&ubicacion=Heredia')).toBe('app-id=6794559661, app-argument=https://contratacr.com/profesionales?categoria=soldadura&ubicacion=Heredia');
  expect(smartAppBannerContent('/profesionales?_rsc=internal&categoria=soldadura')).toBe('app-id=6794559661, app-argument=https://contratacr.com/profesionales?categoria=soldadura');
  expect(smartAppBannerContent('/en')).toContain('app-argument=https://contratacr.com/en');
  for(const path of ['/dashboard','/admin','/login','/auth/callback?code=once','/api/email/baja','/empleos/publicar','/promociones/mis-promociones','/profesionales?access_token=secret','/#access_token=secret','/profesionales#id_token=secret','//evil.example/','/\\evil.example/'])expect(smartAppBannerContent(path)).toBeNull();
});
test("native banner detection distinguishes Safari from other iOS browsers and embedded WebViews",()=>{
  expect(prefersNativeIosAppBanner('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe(true);
  expect(prefersNativeIosAppBanner('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Mobile/15E148 Safari/604.1')).toBe(true);
  for(const ua of ['Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148','Mozilla/5.0 (iPhone) CriOS/140.0 Mobile/15E148 Safari/604.1','Mozilla/5.0 (iPhone) Version/18.0 Mobile/15E148 Safari/604.1 [FBAN/FBIOS]','Mozilla/5.0 (iPhone) Version/18.0 Mobile/15E148 Safari/604.1 GSA/300.0','Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile Safari/537.36','Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1'])expect(prefersNativeIosAppBanner(ua)).toBe(false);
});
test("Apple association covers homepage and exact professional search without broadening auth routes",()=>{
  const association=JSON.parse(readFileSync('public/.well-known/apple-app-site-association','utf8'));
  const paths=association.applinks.details[0].components.map((entry:Record<string,string>)=>entry['/']);
  for(const path of ['/','/en','/es','/profesionales','/en/profesionales','/es/profesionales'])expect(paths).toContain(path);
  for(const path of ['/*','/auth/*','/api/*','/admin*','/login'])expect(paths).not.toContain(path);
  expect(association.webcredentials.apps).toEqual(['LPB3Q4LJ5Z.com.contratacr.app']);
});
test("public web pages use one localized notice without Apple promotion metadata",async({page,context,baseURL})=>{
  const response=await page.goto('/profesionales?ubicacion=Heredia');
  const html=await response!.text();
  expect(html.includes('name="apple-itunes-app"')).toBe(false);
  await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveCount(0);
  if((page.viewportSize()?.width??1280)<1024) await expect(page.getByTestId('mobile-app-download')).toBeVisible();
  await waitForInteractivePage(page);
  if((page.viewportSize()?.width??1280)<1024){
    await page.getByRole('button',{name:/Abrir menú|Abrir menu/}).filter({visible:true}).first().click();
    await expect(page.getByTestId('mobile-menu-store-link').filter({visible:true})).toBeVisible();
    await expect(page.getByTestId('mobile-menu-store-link').filter({visible:true})).toHaveAttribute('href','/descargar');
    await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveCount(0);
  }
  await page.goto('/en/proyectos');
  await page.goto('/login');
  await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveCount(0);
  await expect(page.getByTestId('mobile-app-download')).toHaveCount(0);
  await page.addInitScript(()=>localStorage.setItem('ccr:native-first-run-onboarding:v12','1'));
  await context.addCookies([{name:'ccr_platform',value:'native',url:baseURL!}]);
  await page.goto('/profesionales');
  await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveCount(0);
  await expect(page.getByTestId('mobile-app-download')).toHaveCount(0);
  await expect(page.getByTestId('mobile-menu-store-link')).toHaveCount(0);
});

for (const browserToken of ['CriOS/142.0', '[FBAN/FBIOS]']) {
 test(`iPhone ${browserToken} uses only our translated notice`,async({browser,baseURL})=>{
  test.skip(test.info().project.name!=='webkit-mobile','iOS browser presentation');
  const context=await browser.newContext({viewport:{width:390,height:844},userAgent:`Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 ${browserToken} Mobile/15E148 Safari/604.1`});
  try {
   await context.addCookies([{name:'ccr_sin_analitica',value:'1',url:baseURL!}]);
   const page=await context.newPage();
   await page.goto(`${baseURL}/en/proyectos`);
   await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveCount(0);
   const notice=page.getByTestId('mobile-app-download');
   await expect(notice).toBeVisible();
   await expect(notice.getByRole('link')).toHaveText('Open app');
   await expect(notice.getByRole('link')).toHaveAttribute('href',/^https:\/\/www\.contratacr\.com\/en\/proyectos\?_ccr_open=ios$/);
  }finally{await context.close();}
 });
}
