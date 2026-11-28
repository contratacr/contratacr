import {test,expect,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {origin,local,login} from './pro-round2-fixture';

// Herramientas (owner, 2026-11-27): signed out, /herramientas is the public page; signed in it is the «Herramientas»
// section of «Mi panel» (/dashboard/profesional?tab=tools[&grupo=]). Group screens have no second header on phones: the
// bar itself reads «← <group>» and goes back to the list. Phone width 390 px, no cut text. Loopback only.
const out=process.env.TOOLS_SHOTS_DIR??join(homedir(),'dl','out-tools');
const GROUPS=['sales','work','money','company','free'];
const back=(page:Page)=>page.locator('[data-ccr-section-back], [data-native-back="dashboard-section"]').filter({visible:true}).first();
const barTitle=(page:Page)=>page.locator('[data-ccr-section-title]').filter({visible:true}).first();
const hydrated=(page:Page)=>page.waitForFunction(()=>{try{return (JSON.parse(sessionStorage.getItem('ccr:pila-rutas')??'[]') as string[]).some(r=>r.split('?')[0]===(location.pathname.replace(/\/$/,'')||'/'));}catch{return false;}},null,{timeout:30_000});
const search=(page:Page)=>new URL(page.url()).searchParams;
/** Every row label wraps instead of being cut: no ellipsis, nothing wider than its box. */
async function noCutText(page:Page,scope:string){
 const bad=await page.locator(scope).evaluateAll(nodes=>nodes.flatMap(node=>[...node.querySelectorAll('[data-tools-entry] span, [data-tools-group-tile] span')].filter(el=>{
  const s=getComputedStyle(el);return s.textOverflow==='ellipsis'||el.scrollWidth>el.clientWidth+1||el.getBoundingClientRect().right>window.innerWidth;
 }).map(el=>el.textContent)));
 expect(bad).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
}

test.describe('Herramientas: public page signed out, «Mi panel» section signed in',()=>{
 test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,navigationTimeout:120_000});
 test.beforeAll(()=>{mkdirSync(out,{recursive:true});});

 test('signed out: five groups, «← group» bar, back to the list, a tool asks to sign in',async({page,baseURL})=>{
  test.setTimeout(120_000);local(baseURL);
  await page.goto(origin+'/herramientas');
  for(const id of GROUPS)await expect(page.locator(`[data-tools-group-tile="${id}"]`)).toBeVisible();
  await noCutText(page,'main');
  await expect(page.locator('footer').filter({visible:true})).toHaveCount(0);
  await hydrated(page);
  await page.locator('[data-tools-group-tile="sales"]').click();
  await expect(page).toHaveURL(/\/herramientas\?grupo=sales$/);
  await expect(barTitle(page)).toHaveText('Clientes y ventas');
  // No second header on phones: no in-page back link and no repeated heading.
  await expect(page.locator('[data-tools-back]')).toBeHidden();
  await expect(page.locator('[data-tools-group-heading]')).toBeHidden();
  await expect(page.locator('[data-tools-entry]')).toHaveCount(4);
  await noCutText(page,'main');
  await back(page).click();
  await expect(page).toHaveURL(/\/herramientas$/);
  await expect(page.locator('[data-tools-group-tile="sales"]')).toBeVisible();
  // Opened directly, the arrow still lands on the list.
  await page.goto(origin+'/herramientas?grupo=money');await hydrated(page);
  await expect(barTitle(page)).toHaveText('Finanzas');
  await back(page).click();
  await expect(page).toHaveURL(/\/herramientas$/);
  await page.goto(origin+'/herramientas?grupo=sales');
  await page.locator('[data-tools-entry="customers"]').click();
  await expect(page).toHaveURL(/\/login\?/);
  expect(decodeURIComponent(page.url())).toContain('/dashboard/pro?tab=pro_clients');
 });

 test('signed in: /herramientas opens the panel section; group → tool → back; CV comes back to its group',async({page,baseURL,context})=>{
  test.setTimeout(360_000);local(baseURL);
  let actor:DisposableAccount|undefined;
  try{
   actor=await createDisposableAccount({prefix:'tools-panel'});await login(context,actor);
   // Server redirect (replace): the public page never paints and Back does not return to it.
   await page.goto(origin+'/');
   await page.goto(origin+'/herramientas?grupo=work');
   await expect(page).toHaveURL(/\/dashboard\/profesional\?tab=tools&grupo=work$/);
   await expect(page.locator('[data-tools-group="work"]')).toBeVisible();
   await expect(barTitle(page)).toHaveText('Trabajos y proyectos');
   expect(search(page).get('grupo')).toBe('work');
   await page.goBack();await expect.poll(()=>new URL(page.url()).pathname).toBe('/');
   await page.goto(origin+'/herramientas?grupo=nada');
   await expect(page).toHaveURL(/\/dashboard\/profesional\?tab=tools$/);
   for(const id of GROUPS)await expect(page.locator(`[data-tools-group-tile="${id}"]`)).toBeVisible();
   await expect(barTitle(page)).toHaveText('Herramientas');
   await noCutText(page,'[data-tools-panel]');
   await expect(page.locator('.ccr-dashboard-footer footer').filter({visible:true})).toHaveCount(0);
   await page.screenshot({path:join(out,'panel-herramientas-390.png'),fullPage:true});
   // Group: own screen, «← group» bar, no second header.
   await page.locator('[data-tools-group-tile="sales"]').click();
   await expect(page).toHaveURL(/tab=tools&grupo=sales$/);
   await expect(barTitle(page)).toHaveText('Clientes y ventas');
   await expect(page.locator('[data-tools-back]')).toBeHidden();
   await expect(page.locator('[data-tools-group-heading]')).toBeHidden();
   await noCutText(page,'[data-tools-panel]');
   await page.screenshot({path:join(out,'panel-herramientas-ventas-390.png'),fullPage:true});
   // Pro tool → the Pro space; Back returns to the group.
   await page.locator('[data-tools-entry="customers"]').click();
   await expect.poll(()=>new URL(page.url()).pathname,{timeout:30_000}).toBe('/dashboard/pro');
   expect(search(page).get('tab')).toBe('pro_clients');
   await page.goBack();
   await expect(page).toHaveURL(/\/dashboard\/profesional\?tab=tools&grupo=sales$/);
   await expect(page.locator('[data-tools-group="sales"]')).toBeVisible();
   // The bar's arrow goes back to the list, then to Mi panel.
   await back(page).click();
   await expect(page).toHaveURL(/\/dashboard\/profesional\?tab=tools$/);
   await expect(page.locator('[data-tools-group-tile="free"]')).toBeVisible();
   // Free group → CV (panel section) → arrow → the group, not the list.
   await page.locator('[data-tools-group-tile="free"]').click();
   await expect(barTitle(page)).toHaveText('Búsqueda de empleo');
   await page.screenshot({path:join(out,'panel-herramientas-empleo-390.png'),fullPage:true});
   await page.locator('[data-tools-entry="cv"]').click();
   await expect(page).toHaveURL(/tab=cv/);
   // A new account gets a first CV opened in its editor: the first arrow closes the editor (existing behaviour).
   await back(page).click();
   if(search(page).get('tab')==='cv'){await expect(page.locator('[data-tools-group]')).toHaveCount(0);await back(page).click();}
   await expect(page).toHaveURL(/tab=tools&grupo=free$/);
   await expect(page.locator('[data-tools-group="free"]')).toBeVisible();
   await back(page).click();
   await expect(page).toHaveURL(/tab=tools$/);
   await back(page).click();
   await expect.poll(()=>search(page).get('tab')).not.toBe('tools');
   // Drawer link points into the panel while signed in.
   await page.goto(origin+'/');
   await page.getByRole('button',{name:/menú|menu/i}).first().click();
   await expect(page.locator('[data-testid="menu-herramientas"]').filter({visible:true}).first()).toHaveAttribute('href',/\/dashboard\/profesional\?tab=tools$/);
  }finally{await cleanupDisposableAccount(actor);}
 });
});
