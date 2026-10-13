import {test,expect} from 'playwright/test';
import {waitForInteractivePage} from './helpers';

declare global {
 interface Window { __homePaint: {title: string;card: string;animation: string;hero: string;geometry: string}[]; }
}
for(const path of ['/', '/en']) test(`native Inicio ${path}: cold and cached entry never hide existing services`,async({page,context,baseURL})=>{
 test.skip((page.viewportSize()?.width??1280)>=1024,'Native phone layout');
 await context.addCookies([{name:'ccr_platform',value:'native',url:baseURL!}]);
 await page.addInitScript(()=>{
  localStorage.setItem('ccr:native-first-run-onboarding:v12','1');
  window.__homePaint=[];
  const start=performance.now();
  const frame=()=>{
   const title=document.querySelector('.ccr-home-services-section h2');
   const card=document.querySelector('#servicios-de-la-seccion > a');
   const hero=document.querySelector('.ccr-hero-foto');
   const photo=hero?.querySelector('.ccr-hero-foto-capa');
   const brands=document.querySelector('.featured-brands-ribbon');
   if(title&&card&&hero&&photo&&brands)window.__homePaint.push({title:getComputedStyle(title).opacity,card:getComputedStyle(card).opacity,animation:getComputedStyle(card).animationName,hero:getComputedStyle(photo).opacity,geometry:JSON.stringify([hero.getBoundingClientRect().top,hero.getBoundingClientRect().height,brands.getBoundingClientRect().top,brands.getBoundingClientRect().height])});
   if(performance.now()-start<2000)requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
 });
 // The sample starts before hydration, so a later "visible" class cannot mask
 // an initial blank/faded frame. Repeat with the same browser/image cache.
 for(const warm of [false,true]) {
  if(warm)await page.reload();else await page.goto(path);
  await waitForInteractivePage(page);
  await expect.poll(()=>page.evaluate(()=>window.__homePaint.length)).toBeGreaterThan(0);
  const trace=await page.evaluate(()=>window.__homePaint);
  expect(trace.filter(s=>s.title!=='1'||s.card!=='1'||s.animation!=='none'||s.hero!=='1')).toEqual([]);
  expect(new Set(trace.map(s=>s.geometry)).size).toBe(1);
 }
 // A remount/revalidation must not depend on the scroll observer revealing it.
 await page.locator('.ccr-home-services-section').evaluate(el=>el.parentElement!.classList.remove('visible'));
 await expect.poll(()=>page.locator('.ccr-home-services-section h2').evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
 await expect.poll(()=>page.locator('#servicios-de-la-seccion > a').first().evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
});

test('home artwork permits browser reuse while page and session data remain fresh',async({browser,browserName,baseURL})=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 try {
  for(const asset of ['/hero/liniero-800.avif','/featured-brands/sg-solutions.webp']) {
   const response=await context.request.get(baseURL!+asset);
   expect(response.ok()).toBe(true);
   expect(response.headers()['cache-control']).toMatch(/max-age=86400(?:,|$)/);
  }
  const home=await context.request.get(baseURL!+'/');
  expect(home.headers()['cache-control']??'').not.toMatch(/max-age=86400(?:,|$)/);
  const prime=await context.newPage();
  await prime.goto(baseURL!+'/');
  await prime.waitForFunction(()=>{const image=document.querySelector('.ccr-hero-foto-capa') as HTMLImageElement;return image?.complete&&image.naturalWidth>0});
  // Preload and <picture> may finish together; let the first visit commit its
  // resource cache before opening a fresh page session (especially WebKit).
  await prime.waitForLoadState('networkidle');
  const warm=await context.newPage();
  await warm.goto(baseURL!+'/');
  await warm.waitForFunction(()=>{const image=document.querySelector('.ccr-hero-foto-capa') as HTMLImageElement;return image?.complete&&image.naturalWidth>0});
  const timings=await warm.evaluate(()=>{
   const image=document.querySelector('.ccr-hero-foto-capa') as HTMLImageElement;
   return performance.getEntriesByName(image.currentSrc).map(e=>(e as PerformanceResourceTiming).transferSize);
  });
  expect(timings.length).toBeGreaterThan(0);
  // Cache reuse is a browser decision: WebKit under the test runner may
  // revalidate a new tab even with fresh headers. Its cached-paint contract
  // is covered frame by frame above; Chromium also verifies zero transfer.
  if(browserName==='chromium')expect(timings.every(bytes=>bytes===0)).toBe(true);
 } finally {await context.close();}
});
