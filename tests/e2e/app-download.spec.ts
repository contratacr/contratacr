import { mkdirSync } from "node:fs";
import { test, expect } from 'playwright/test';

test('web: tiendas correctas, reserva, teclado y cierre persistente', async ({page}) => {
  if(test.info().project.name==='android-download')await page.setViewportSize({width:320,height:780});
  test.skip((page.viewportSize()?.width ?? 1280) >= 1024);
  await page.goto('/');
  await expect(page.getByTestId('app-download-section')).toBeHidden();
  const banner=page.getByTestId('mobile-app-download');
  await expect(banner).toBeVisible();
  const href=await banner.locator('a').getAttribute('href');
  const android=await page.evaluate(()=>/Android/.test(navigator.userAgent));
  expect(href).toContain(android?'play.google.com/store/apps/details?id=com.contratacr.app':'apps.apple.com/cr/app/contratacr/id6794559661');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const sizes=await banner.evaluate(el=>({spacer:el.getBoundingClientRect().height,notice:el.querySelector('aside')!.getBoundingClientRect().height}));
  expect(sizes.spacer).toEqual(sizes.notice);
  const notice=await banner.boundingBox(), header=await page.getByTestId('landing-navbar').boundingBox();
  expect(notice!.y).toBe(0);expect(header!.y).toBe(notice!.height);
  await expect(page.getByTestId('app-store-footer-links')).toBeHidden();
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


test('shared download anchor always remains useful, including after dismissing the mobile notice',async({page})=>{
 await page.goto('/#descargar-app');
 if ((page.viewportSize()?.width ?? 1280) < 1024) {
  const banner=page.getByTestId('mobile-app-download');
  await expect(banner).toBeVisible();
  await banner.getByRole('button').click();await expect(banner).toHaveCount(0);
  await page.reload();await expect(banner).toBeVisible();
  expect(await page.evaluate(()=>scrollY)).toBe(0);
  if (process.env.DOWNLOAD_DESIGN_EVIDENCE) {
   mkdirSync(process.env.DOWNLOAD_DESIGN_EVIDENCE,{recursive:true});
   const os=await page.evaluate(()=>/Android/.test(navigator.userAgent)?'android':'ios');
   await page.screenshot({path:`${process.env.DOWNLOAD_DESIGN_EVIDENCE}/${os}.png`});
  }
 } else {
  const section=page.getByTestId('app-download-section');await expect(section).toBeVisible();
  await expect(section.getByRole('heading',{name:'Descarga la app de ContrataCR'})).toBeVisible();
  await expect(section.getByTestId('app-phone-screen').locator('img')).toHaveAttribute('src',/profesionales/);
  await expect(section).toBeInViewport();
  await expect(page.getByTestId('app-store-footer-links')).toBeVisible();
  if (process.env.DOWNLOAD_DESIGN_EVIDENCE) {
   mkdirSync(process.env.DOWNLOAD_DESIGN_EVIDENCE,{recursive:true});
   await section.screenshot({path:`${process.env.DOWNLOAD_DESIGN_EVIDENCE}/desktop.png`});
   await page.locator('footer').first().screenshot({path:`${process.env.DOWNLOAD_DESIGN_EVIDENCE}/footer.png`});
  }
 }
});

test('mobile download notice and header are correctly positioned before JavaScript hydration',async({page,browser,baseURL})=>{
 test.skip((page.viewportSize()?.width ?? 1280)>=1024);
 const ua=await page.evaluate(()=>navigator.userAgent);
 const context=await browser.newContext({javaScriptEnabled:false,userAgent:ua,viewport:{width:390,height:844}});
 try {
  await context.addCookies([{name:'ccr_sin_analitica',value:'1',url:baseURL!}]);
  const cold=await context.newPage();await cold.goto(`${baseURL}/`);
  const notice=await cold.getByTestId('mobile-app-download').boundingBox();
  const header=await cold.getByTestId('landing-navbar').boundingBox();
  expect(notice?.y).toBe(0);expect(header?.y).toBe(76);
 }finally{await context.close();}
});


test('download link also works in a narrow desktop browser with no mobile OS detected',async({page})=>{
 test.skip(test.info().project.name!=='chromium-desktop' && test.info().project.name!=='desktop-download');
 await page.setViewportSize({width:800,height:900});await page.goto('/#descargar-app');
 const banner=page.getByTestId('mobile-app-download');await expect(banner).toBeVisible();
 await expect(banner.locator('a')).toHaveCount(2);
 expect(await banner.locator('a').first().getAttribute('href')).toContain('apps.apple.com');
 expect(await banner.locator('a').last().getAttribute('href')).toContain('play.google.com');
});

test('notice is centered, remains above the header on public pages and respects account/form routes',async({page})=>{
 test.skip((page.viewportSize()?.width ?? 1280)>=1024);
 for(const route of ['/proyectos','/empleos','/promociones','/profesionales','/ayuda']) {
  await page.goto(route);
  const notice=page.getByTestId('mobile-app-download');
  await expect(notice).toBeVisible();
  await expect(notice).not.toContainText('Llévala contigo');
  expect(await notice.locator('p').evaluate(el=>getComputedStyle(el.parentElement!).textAlign)).toBe('center');
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect.poll(async()=>Math.round((await notice.locator('aside').boundingBox())?.y ?? -999)).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 for(const route of ['/login','/registro','/reset-password','/olvide-contrasena','/empleos/publicar','/publicar-proyecto']) {
  await page.goto(route);await expect(page.getByTestId('mobile-app-download')).toHaveCount(0);
 }
});

test('desktop footer uses Apple and Android symbols with accessible store links',async({page})=>{
 test.skip((page.viewportSize()?.width ?? 1280)<1024);
 await page.goto('/');const links=page.getByTestId('app-store-footer-links');
 await expect(links.locator('a')).toHaveCount(2);await expect(links.locator('img')).toHaveCount(2);
 await expect(links.getByRole('link',{name:'Descargar ContrataCR para iOS'})).toHaveAttribute('href',/apps.apple.com/);
 await expect(links.getByRole('link',{name:'Descargar ContrataCR para Android'})).toHaveAttribute('href',/play.google.com/);
});
