import { test, expect, type Page } from 'playwright/test';
import {waitForInteractivePage} from './helpers';

declare global { interface Window { __searchFocusTrace: { tag: string; to: string | null }[]; } }
const routes = [
 { path:'/profesionales', query:'Cámaras' },
 { path:'/proyectos', query:'web' },
 { path:'/empleos', query:'Téc' },
 { path:'/promociones', query:'web' },
];
async function openSearch(page: Page, path: string) {
 await page.goto(path);
 await waitForInteractivePage(page);
 if(path==='/profesionales') {
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ccr:open-native-search')));
 } else await page.getByPlaceholder(/Qué .* buscas/).filter({visible:true}).tap();
 const panel=page.locator(path==='/profesionales'?'.ccr-native-search-panel':'.ccr-hoja-buscador');
 await expect(panel).toBeVisible();
 await expect(panel.locator('input').first()).toBeFocused();
 return panel;
}
async function traceFocus(page: Page) {
 await page.evaluate(()=>{
  window.__searchFocusTrace=[];
  document.addEventListener('focusout',event=>window.__searchFocusTrace.push({tag:(event.target as Element).tagName,to:(event.relatedTarget as Element|null)?.tagName??null}));
 });
}
for(const native of [false,true])for(const route of routes) {
 test(`${native?'app':'mobile web'} ${route.path}: selections transfer focus directly in both directions`,async({page,context,baseURL})=>{
  test.skip((page.viewportSize()?.width??1280)>=1024,'Mobile search sheet');
  if(native)await context.addCookies([{name:'ccr_platform',value:'native',url:baseURL!}]);
  await page.addInitScript(()=>localStorage.setItem('ccr:native-first-run-onboarding:v12','1'));
  let panel=await openSearch(page,route.path);
  await panel.locator('input').first().fill(route.query);await traceFocus(page);
  const choice=route.path==='/profesionales'?panel.getByRole('option').first():panel.locator('button').filter({hasText:route.path==='/empleos'?/Técnico/:/web/i}).first();
  await choice.tap();await expect(panel).toBeVisible();await expect(panel.locator('input').nth(1)).toBeFocused();
  expect(await page.evaluate(()=>window.__searchFocusTrace.some(e=>e.to!=='INPUT'))).toBe(false);
  // Fresh sheet: choosing location first must keep it open and focus service.
  panel=await openSearch(page,route.path);await panel.locator('input').nth(1).fill('Alajuela');await traceFocus(page);
  await (route.path==='/profesionales'?panel.getByRole('option').filter({hasText:'Alajuela'}).first():panel.getByRole('button',{name:/^Alajuela(?:\s|$)/}).first()).tap();
  await expect(panel).toBeVisible();await expect(panel.locator('input').first()).toBeFocused();
  expect(await page.evaluate(()=>window.__searchFocusTrace.some(e=>e.to!=='INPUT'))).toBe(false);
 });
}
test('professional search stays over old results while navigation is pending, including same-search submission',async({page})=>{
 test.skip((page.viewportSize()?.width??1280)>=1024,'Mobile search sheet');
 const panel=await openSearch(page,'/profesionales');
 await panel.locator('input').nth(1).fill('Alajuela');await panel.getByRole('option').filter({hasText:'Alajuela'}).first().tap();
 await panel.getByLabel('Servicio',{exact:true}).fill('Cámaras');
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/*',async route=>{if(route.request().headers().rsc==='1')await gate;await route.continue();});
 const initial=page.url();await panel.getByRole('option').filter({hasText:'Cámaras de seguridad'}).first().tap();
 await expect(panel).toBeVisible();expect(page.url()).toBe(initial);
 await page.evaluate(()=>{
  const state=window as unknown as {__searchPaints:{fixed:boolean;overlay:boolean}[]};state.__searchPaints=[];
  const sample=()=>{if(location.pathname.includes('/camaras-seguridad/alajuela'))state.__searchPaints.push({fixed:document.body.style.position==='fixed',overlay:document.documentElement.classList.contains('ccr-native-search-overlay-open')});if(state.__searchPaints.length<20)requestAnimationFrame(sample);};requestAnimationFrame(sample);
 });
 release();await page.waitForURL(/\/camaras-seguridad\/alajuela/);await expect(panel).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {__searchPaints:unknown[]}).__searchPaints.length)).toBeGreaterThanOrEqual(20);
 expect(await page.evaluate(()=>(window as unknown as {__searchPaints:{fixed:boolean;overlay:boolean}[]}).__searchPaints.some(frame=>frame.fixed||frame.overlay))).toBe(false);
 await page.unrouteAll({behavior:'wait'});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ccr:open-native-search')));await expect(panel).toBeVisible();
 await panel.getByLabel('Servicio',{exact:true}).fill('Cámaras');await panel.getByRole('option').filter({hasText:'Cámaras de seguridad'}).first().tap();
 // Selecting the same completed search dismisses it without another Enter.
 await expect(panel).toHaveCount(0);
});

test('hidden desktop navbar never opens a second professional search sheet',async({page})=>{
 test.skip((page.viewportSize()?.width??1280)>=1024,'Mobile search sheet');
 for(const path of ['/proyectos','/empleos','/promociones']) {
  await page.goto(path);await waitForInteractivePage(page);
  const before=await page.evaluate(()=>({position:document.body.style.position,overflow:document.body.style.overflow}));
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ccr:open-native-search',{detail:{atendido:false}})));
  const panel=page.locator('.ccr-native-search-panel');await expect(panel).toHaveCount(1);await expect(panel).toBeVisible();
  await panel.locator('button').first().tap();await expect(panel).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>({position:document.body.style.position,overflow:document.body.style.overflow}))).toEqual(before);
 }
});

test('Enter in location submits marketplace search without a service',async({page})=>{
 test.skip((page.viewportSize()?.width??1280)>=1024,'Mobile search sheet');
 for(const path of ['/proyectos','/empleos','/promociones']) {
  const panel=await openSearch(page,path);const location=panel.locator('input').nth(1);
  await location.fill('Alajuela');await location.press('Enter');
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/location=Alajuela/);
 }
});
