import { waitForInteractivePage } from "./helpers";
import { mkdirSync } from "node:fs";
import { PWA_STARTUP_DEVICES } from "../../src/lib/pwa-startup";
import sharp from "sharp";
import { test, expect } from 'playwright/test';

test('web: tiendas correctas, reserva, teclado y cierre persistente', async ({page}) => {
  if(test.info().project.name==='android-download')await page.setViewportSize({width:320,height:780});
  test.skip((page.viewportSize()?.width ?? 1280) >= 1024, "The download notice only appears on mobile web.");
 if(test.info().project.name==='webkit-mobile') await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{configurable:true,value:true}));
  await page.addInitScript(() => Object.defineProperty(navigator, 'getInstalledRelatedApps', { configurable: true, value: async () => [] }));
  await page.goto('/');
  await expect(page.getByTestId('app-download-section')).toBeVisible();
  const banner=page.getByTestId('mobile-app-download');

  await expect(banner).toBeVisible();
  const android=await page.evaluate(()=>/Android/.test(navigator.userAgent));
  await expect(banner.getByRole('link')).toHaveText(android ? 'Usar app' : 'Abrir app');
  const row=await banner.locator('aside').evaluate(el=>{
    const logo=el.querySelector('[aria-label="ContrataCR"]') ?? el.querySelector('img');
    const action=el.querySelector('a')!;
    const a=action.getBoundingClientRect(), b=logo!.getBoundingClientRect();
    return {sameRow:Math.abs((a.top+a.height/2)-(b.top+b.height/2))<3, overflow:el.scrollWidth>el.clientWidth};
  });
  expect(row).toEqual({sameRow:true,overflow:false});

  await expect(banner.locator('a')).toHaveAttribute('href',android?/^intent:/:/^https:\/\/www\.contratacr\.com\/\?_ccr_open=ios$/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const notice=await banner.locator('aside').boundingBox(), header=await page.getByTestId('landing-navbar').boundingBox();
  expect(notice!.y + notice!.height).toBeCloseTo(await page.evaluate(()=>(window.visualViewport?.height ?? innerHeight) + (window.visualViewport?.offsetTop ?? 0)), 0);
  expect(header!.y).toBe(0);
  expect(await page.evaluate(()=>parseFloat(getComputedStyle(document.body).paddingBottom))).toBeGreaterThanOrEqual(notice!.height);
  await expect(page.getByTestId('app-store-footer-links')).toBeVisible();
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
 if(test.info().project.name==='webkit-mobile') await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{configurable:true,value:true}));
 await page.goto('/#descargar-app');
 if ((page.viewportSize()?.width ?? 1280) < 1024) {
  const banner=page.getByTestId('mobile-app-download');

  await expect(banner).toBeVisible();
  await banner.getByRole('button').click();await expect(banner).toHaveCount(0);
  await page.reload();await expect(banner).toBeVisible();
  await expect(page.getByTestId('app-download-section')).toBeInViewport();
  await expect.poll(async()=>page.evaluate(()=>{const section=document.querySelector('#descargar-app')!.getBoundingClientRect();const header=document.querySelector('[data-testid=landing-navbar]')!.getBoundingClientRect();return section.top>=header.bottom-1;})).toBe(true);
  if (process.env.DOWNLOAD_DESIGN_EVIDENCE) {
   mkdirSync(process.env.DOWNLOAD_DESIGN_EVIDENCE,{recursive:true});
   const os=await page.evaluate(()=>/Android/.test(navigator.userAgent)?'android':'ios');
   await page.screenshot({path:`${process.env.DOWNLOAD_DESIGN_EVIDENCE}/${os}.png`});
  }
 } else {
  const section=page.getByTestId('app-download-section');await expect(section).toBeVisible();
  await expect(section.getByRole('heading',{name:'Descarga la app de ContrataCR'})).toBeVisible();
  await expect(section.getByTestId('app-download-artwork')).toHaveAttribute('src','/stores/app-workshop-desktop-welcome-20261013.webp');
  await expect(section).toBeInViewport();
  await expect(page.getByTestId('app-store-footer-links')).toBeVisible();
  if (process.env.DOWNLOAD_DESIGN_EVIDENCE) {
   mkdirSync(process.env.DOWNLOAD_DESIGN_EVIDENCE,{recursive:true});
   await section.screenshot({path:`${process.env.DOWNLOAD_DESIGN_EVIDENCE}/desktop.png`});
   await page.locator('footer').first().screenshot({path:`${process.env.DOWNLOAD_DESIGN_EVIDENCE}/footer.png`});
  }
 }
});

test('shared download link does not pause at the how-it-works section on a cold visit',async({page})=>{
 await page.goto('/#descargar-app',{waitUntil:'domcontentloaded'});
 await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
 await page.waitForTimeout(300);
 const position=await page.evaluate(()=>{
  const section=document.getElementById('descargar-app')!.getBoundingClientRect();
  return {top:section.top,bottom:section.bottom,height:innerHeight};
 });
 expect(position.top).toBeLessThan(position.height);
 expect(position.bottom).toBeGreaterThan(0);
});

test('mobile download notice and header are correctly positioned before JavaScript hydration',async({page,browser,baseURL})=>{
 test.skip((page.viewportSize()?.width ?? 1280)>=1024, "The download notice only appears on mobile web.");
 const ua=await page.evaluate(()=>navigator.userAgent);
 const context=await browser.newContext({javaScriptEnabled:false,userAgent:ua,viewport:{width:390,height:844}});
 try {
  await context.addCookies([{name:'ccr_sin_analitica',value:'1',url:baseURL!}]);
  const cold=await context.newPage();await cold.goto(`${baseURL}/`);
  const noticeLocator=cold.getByTestId('mobile-app-download');
  const header=await cold.getByTestId('landing-navbar').boundingBox();

  if(test.info().project.name==='webkit-mobile') {
   await expect(noticeLocator).toHaveCount(0);
   await expect(cold.locator('meta[name="apple-itunes-app"]')).toHaveAttribute('content','app-id=6794559661, app-argument=https://contratacr.com/');
   expect(header?.y).toBe(0);
   return;
  }
  const notice=await noticeLocator.boundingBox();
  expect(notice).not.toBeNull();
  expect(notice!.y + notice!.height).toBeCloseTo(844, 0);
  expect(notice!.height).toBeGreaterThanOrEqual(80);
  expect(header?.y).toBe(0);
 }finally{await context.close();}
});


test('narrow desktop windows have no mobile notice or navbar gap, while download links remain available',async({page,browser,baseURL})=>{
 test.skip(test.info().project.name!=='chromium-desktop' && test.info().project.name!=='desktop-download', 'Requires a desktop user agent without a mobile OS.');
 for(const width of [390,800,1000]) {
  await page.setViewportSize({width,height:900});await page.goto('/');
  await expect(page.getByTestId('mobile-app-download')).toHaveCount(0);
  await expect.poll(()=>page.getByTestId('landing-navbar').evaluate(el=>el.getBoundingClientRect().top)).toBe(0);
  expect(await page.locator('html').getAttribute('data-web-download-banner')).toBeNull();
 }
 await page.goto('/#descargar-app');
 const links=page.getByTestId('app-download-section').getByTestId('app-store-links').locator('a');
 await expect(links).toHaveCount(2);
 await expect(links.first()).toHaveAttribute('href',/apps\.apple\.com/);
 await expect(links.last()).toHaveAttribute('href',/play\.google\.com/);
 // The server-rendered page must not briefly show the desktop notice either.
 const ua=await page.evaluate(()=>navigator.userAgent);
 const cold=await browser.newContext({javaScriptEnabled:false,userAgent:ua,viewport:{width:800,height:900}});
 try {
  const p=await cold.newPage();await p.goto(`${baseURL}/`);
  await expect(p.getByTestId('mobile-app-download')).toHaveCount(0);
  expect((await p.getByTestId('landing-navbar').boundingBox())?.y).toBe(0);
 } finally {await cold.close();}
});

test('notice stays at the bottom on public pages and respects account/form routes',async({page})=>{
 test.skip((page.viewportSize()?.width ?? 1280)>=1024, "The download notice only appears on mobile web.");
 if(test.info().project.name==='webkit-mobile') await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{configurable:true,value:true}));
 for(const route of ['/proyectos','/empleos','/promociones','/profesionales','/ayuda']) {
  await page.goto(route);
  await waitForInteractivePage(page);
  const notice=page.getByTestId('mobile-app-download');

  await expect(notice).toBeVisible();
  await expect(notice).not.toContainText('Llévala contigo');
  await expect(notice.locator('a')).toHaveText(/^(Abrir app|Usar app)$/);
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect.poll(async()=>{
   const box=await notice.locator('aside').boundingBox();
   const bottom=await page.evaluate(()=>(window.visualViewport?.height ?? innerHeight)+(window.visualViewport?.offsetTop ?? 0));
   return Math.abs((box ? box.y+box.height : -999)-bottom);
  }).toBeLessThan(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 for(const route of ['/login','/registro','/reset-password','/olvide-contrasena','/empleos/publicar','/publicar-proyecto']) {
  await page.goto(route);await expect(page.getByTestId('mobile-app-download')).toHaveCount(0);
 }
});

test('web footer uses Apple and Android symbols with accessible store links',async({page})=>{
 await page.goto('/');const links=page.getByTestId('app-store-footer-links');
 await expect(links.locator('a')).toHaveCount(2);await expect(links.locator('img')).toHaveCount(2);
 await expect(links.getByRole('link',{name:'Descargar ContrataCR para iOS'})).toHaveAttribute('href',/apps.apple.com/);
 await expect(links.getByRole('link',{name:'Descargar ContrataCR para Android'})).toHaveAttribute('href',/play.google.com/);
});

test('QR download opens the correct store without caching another device choice', async ({request}) => {
 const scans = [
  {ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148', expected:'https://apps.apple.com/cr/app/contratacr/id6794559661'},
  {ua:'Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/130.0 Mobile Safari/537.36', expected:'https://play.google.com/store/apps/details?id=com.contratacr.app'},
  {ua:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile/15E148', expected:'https://apps.apple.com/cr/app/contratacr/id6794559661'},
  {ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Mobile/15E148 Safari/604.1', expected:'https://apps.apple.com/cr/app/contratacr/id6794559661'},
  {ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36', expected:'/#descargar-app'},
 ];
 for(const scan of scans) {
  const response=await request.get('/descargar',{headers:{'user-agent':scan.ua},maxRedirects:0});
  expect(response.status()).toBe(307);expect(response.headers().location).toBe(scan.expected);
  expect(response.headers()['cache-control']).toContain('no-store');expect(response.headers().vary).toContain('User-Agent');
 }
});

test('responsive download artwork and store actions fit the viewport, including Safari tablet sizing', async ({page}) => {
 await page.goto('/#descargar-app');
 const section=page.getByTestId('app-download-section');
 for(const width of [320,768,1440]) {
  await page.setViewportSize({width,height:1000});
  await section.scrollIntoViewIfNeeded();
  await expect.poll(()=>section.evaluate(el=>{
   const image=el.querySelector('picture img') as HTMLImageElement | null;
   return !!image?.complete&&image.naturalWidth>0;
  })).toBe(true);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // Read all rectangles in one frame; the shared anchor can still align the
  // page while images/fonts settle after a viewport change.
  await expect.poll(()=>section.evaluate(el=>{
   const bounds=el.getBoundingClientRect();
   return bounds.width<=innerWidth&&[...el.querySelectorAll('[data-testid="app-store-links"] a')].every(link=>{
    const box=link.getBoundingClientRect();
    return box.left>=bounds.left&&box.right<=bounds.right&&box.bottom<=bounds.bottom;
   });
  })).toBe(true);
 }
});

test('home-screen launch uses a white surface even in dark mode before external CSS', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }));
  await page.route(/\.css(?:\?|$)/, route => route.abort());
  await page.goto('/');
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'light');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('html')).not.toHaveClass(/ccr-native-app/);
  const images = page.locator('link[rel="apple-touch-startup-image"]');
  await expect(images).toHaveCount(45);
  await expect(page.locator('link[rel="apple-touch-startup-image"][media]').first()).toHaveAttribute('media', /device-width.*device-height.*pixel-ratio.*portrait/);
});

test('iOS launch images have the exact declared device dimensions and a white corner', async () => {
  for (const [width, height, scale] of PWA_STARTUP_DEVICES) {
    for (const orientation of ['portrait', 'landscape']) {
      const path = `public/pwa/startup/${width}x${height}@${scale}-${orientation}.png`;
      const metadata = await sharp(path).metadata();
      expect(metadata.width).toBe((orientation === 'portrait' ? width : height) * scale);
      expect(metadata.height).toBe((orientation === 'portrait' ? height : width) * scale);
      const { data } = await sharp(path).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([...data]).toEqual([255, 255, 255]);
    }
  }
});

test('home-screen launch shell is public, white and independent of the session', async ({ page, request, baseURL }) => {
 const manifest = await request.get('/site.webmanifest');
 expect((await manifest.json()).start_url).toBe('/abrir-app');
 const shell = await request.get('/abrir-app');
 expect(shell.status()).toBe(200);
 expect(shell.headers()['content-type']).toContain('text/html; charset=utf-8');
 expect(shell.headers()['set-cookie']).toBeUndefined();
 const html = await shell.text();
 expect(html).not.toContain('__NEXT_DATA__');
 expect(html).not.toContain('supabase');
 const isolated = await page.context().browser()!.newContext({javaScriptEnabled:false,colorScheme:'dark'});
 const launch = await isolated.newPage();
 await launch.goto(`${baseURL}/abrir-app`);
 // noscript redirects as well; check the shell with its refresh disabled.
 await launch.route('**/abrir-app', async route => route.fulfill({contentType:'text/html',body:html.replace(/<noscript>[\s\S]*?<\/noscript>/,'')}));
 await launch.goto(`${baseURL}/abrir-app`);
 expect(await launch.evaluate(()=>getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
 await expect(launch.getByRole('link',{name:'Abrir ContrataCR'})).toBeVisible();
 await isolated.close();
 await page.goto('/abrir-app');
 await expect(page).toHaveURL(/\/(?:en\/)?$/);
 await expect(page.getByTestId('landing-navbar')).toBeVisible();
});

test('mobile listings stay behind the download notice and keep their last result reachable', async ({page}) => {
 test.skip((page.viewportSize()?.width ?? 1280)>=1024, 'The download notice only appears on mobile web.');
 if(test.info().project.name==='webkit-mobile') await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{configurable:true,value:true}));
 for (const route of ['/empleos','/proyectos','/promociones']) {
  await page.goto(route);
  const banner=page.getByTestId('mobile-app-download');

  await expect(banner).toBeVisible();
  const shell=page.locator('.ccr-cascaron-tablero');
  const before=await shell.boundingBox();
  const list=page.locator('.ccr-tablero-marco > section').first();
  await expect(list).toBeVisible();
  const notice=await banner.boundingBox(), box=await list.boundingBox();
  expect(box!.y+box!.height).toBeGreaterThan(notice!.y+20);
  expect(await list.evaluate(el=>parseFloat(getComputedStyle(el).paddingBottom))).toBeGreaterThanOrEqual(notice!.height);
  await list.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const last=list.locator('article').last();
  if(await last.count()) expect((await last.boundingBox())!.y+(await last.boundingBox())!.height).toBeLessThanOrEqual(notice!.y+1);
  // Hiding the notice must not resize the listing or shift the page.
  await banner.getByRole('button').click();
  await expect(banner).toHaveCount(0);
  expect((await shell.boundingBox())!.height).toBeCloseTo(before!.height,0);
  await page.context().clearCookies();
  await page.evaluate(()=>localStorage.removeItem('ccr:app-download-dismissed-until:v2'));
 }
});

test('home-screen web app can show the store notice without being treated as native', async ({page}) => {
 test.skip((page.viewportSize()?.width ?? 1280)>=1024, 'The download notice only appears on mobile web.');
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'standalone',{configurable:true,value:true});
  const original=window.matchMedia.bind(window);
  window.matchMedia=query=>{const result=original(query);if(query==='(display-mode: standalone)')Object.defineProperty(result,'matches',{value:true});return result;};
 });
 await page.goto('/empleos');
 await expect(page.locator('html')).not.toHaveClass(/ccr-native-app/);
 await expect(page.getByTestId('mobile-app-download')).toBeVisible();
});


for (const locale of ["es", "en"] as const) {
 for (const store of ["ios", "android"] as const) {
  test(`download section ${locale}: ${store} button activates its exact store link`, async ({ page, context, browserName }) => {
   const target = store === "ios" ? "https://apps.apple.com/cr/app/contratacr/id6794559661" : "https://play.google.com/store/apps/details?id=com.contratacr.app";
   // Intercept only the destination: exercise the real link without opening a
   // store account or installing an app during automated regression.
   await context.route(target, route => route.fulfill({ contentType: "text/html", body: "<title>Store destination verified</title>" }));
   await page.goto(locale === "en" ? "/en#descargar-app" : "/#descargar-app");
   const section = page.getByTestId("app-download-section");
   const name = `${locale === "en" ? "Download on" : "Descargar en"} ${store === "ios" ? "App Store" : "Google Play"}`;
   const link = section.getByRole("link", { name, exact: true });
   await link.scrollIntoViewIfNeeded();
   await expect(link).toHaveAttribute("href", target);
   if (browserName === "webkit" && store === "ios") {
    // WebKit delegates apps.apple.com to the OS before network interception.
    // Assert an uncancelled activation here; actual store opening is manual.
    let activated = false;
    await page.exposeFunction("recordStoreActivation", (allowed: boolean) => { activated = allowed; });
    await link.evaluate(element => element.addEventListener("click", event => {
     queueMicrotask(() => {
      void (window as unknown as { recordStoreActivation: (allowed: boolean) => Promise<void> }).recordStoreActivation(!event.defaultPrevented);
     });
    }, { once: true }));
    await link.click();
    // Linux WebKit follows the mocked URL; macOS can hand it to the OS.
    // Keep the activation evidence outside the document that may unload.
    await expect.poll(() => activated || page.url() === target).toBe(true);
    if (page.url() === target) await expect(page).toHaveTitle("Store destination verified");
   } else {
    await link.click();
    await expect(page).toHaveURL(target);
    await expect(page).toHaveTitle("Store destination verified");
   }
  });
 }
}

for (const standalone of [false, true]) {
 test(`corrected iPhone notice survives legacy dismissals (standalone=${standalone})`, async ({page,context,baseURL})=>{
  test.skip(test.info().project.name !== 'webkit-mobile', 'iPhone Safari regression');
  await context.addCookies([{name:'ccr_download_dismissed_until',value:String(Date.now()+86400000),url:baseURL!}]);
  await page.addInitScript(({standalone})=>{
   localStorage.setItem('ccr:app-download-dismissed-until:v1',String(Date.now()+86400000));
   Object.defineProperty(navigator,'standalone',{configurable:true,value:standalone});
  },{standalone});
  await page.goto('/profesionales');
  const notice=page.getByTestId('mobile-app-download');

  if(!standalone) {
   await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveAttribute('content','app-id=6794559661, app-argument=https://contratacr.com/profesionales');
   await expect(notice).toHaveCount(0);
   return;
  }
  await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveCount(0);
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('link')).toHaveText('Abrir app');
  await expect(notice.getByRole('link')).toHaveAttribute('href',/^https:\/\/www\.contratacr\.com\/profesionales\?_ccr_open=ios$/);
  if (process.env.DOWNLOAD_DESIGN_EVIDENCE) {
   mkdirSync(process.env.DOWNLOAD_DESIGN_EVIDENCE,{recursive:true});
   await page.screenshot({path:`${process.env.DOWNLOAD_DESIGN_EVIDENCE}/iphone-${standalone?'inicio':'safari'}.png`});
  }
  await notice.getByRole('button').click();
  await page.reload();
  await expect(notice).toHaveCount(0);
 });
}

for (const locale of ['es', 'en'] as const) {
 test(`download notice translates its label and accessibility text in ${locale}`,async({page})=>{
  test.skip((page.viewportSize()?.width??1280)>=1024,'Mobile notice');
  if (test.info().project.name==='webkit-mobile') await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{configurable:true,value:true}));
  await page.addInitScript(()=>Object.defineProperty(navigator,'getInstalledRelatedApps',{configurable:true,value:async()=>[]}));
  await page.goto(locale==='en'?'/en/proyectos':'/proyectos');
  const notice=page.getByTestId('mobile-app-download');
  await expect(notice).toBeVisible();
  const android=await page.evaluate(()=>/Android/.test(navigator.userAgent));
  const label=android?(locale==='en'?'Use app':'Usar app'):(locale==='en'?'Open app':'Abrir app');
  await expect(notice.getByRole('link',{name:`${label} ContrataCR`})).toHaveText(label);
  await expect(notice.getByRole('button',{name:locale==='en'?'Dismiss app notice':'Cerrar aviso de la app'})).toBeVisible();
  if(android) await expect(notice).toContainText(locale==='en'?'for':'para');
  await page.getByRole('button',{name:/Abrir menú|Abrir menu|Open menu/}).filter({visible:true}).first().click();
  await expect(page.getByTestId('mobile-menu-store-link').filter({visible:true})).toHaveText(locale==='en'?'Download app':'Descargar app');
  await page.getByRole('button',{name:locale==='en'?'Español':'English',exact:true}).filter({visible:true}).click();
  await expect(notice.getByRole('link')).toHaveText(android?(locale==='en'?'Usar app':'Use app'):(locale==='en'?'Abrir app':'Open app'));
 });
}
