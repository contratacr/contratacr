import {test,expect,type Page} from 'playwright/test';
import {gotoOK,isMobileProject} from './helpers';

// Salir de la ficha de un negocio (dueño 2026-11-27, iOS Simulator: «no me deja salirme del perfil del restaurante»).
// La flecha «Volver» de la barra hacía un solo history.back(): los anclajes de la página (#fotos, #resenas) y el mapa grande
// dejaban entradas de la MISMA ficha y la flecha se quedaba en ella. Ahora vuelve a la pantalla anterior de la app (o a la
// portada si la ficha se abrió directo), los anclajes no crean entradas y la flecha del navegador también sale.

const SECTION='/restaurantes';
const onPlace=/\/negocios\/[^/?#]+/;

// Counts history.pushState calls made by the page (Next's own navigations included) from the moment it loads.
async function watchHistory(page:Page){
 await page.addInitScript(()=>{
  const w=window as unknown as {__ccrPushes:string[]};w.__ccrPushes=[];
  const push=history.pushState.bind(history);
  history.pushState=function(s:unknown,t:string,u?:string|URL|null){w.__ccrPushes.push(String(u??''));return push(s,t,u);};
 });
}
const pushes=(page:Page)=>page.evaluate(()=>(window as unknown as {__ccrPushes?:string[]}).__ccrPushes??[]);
const back=(page:Page)=>page.locator('[data-ccr-section-back]').filter({visible:true}).first();
// The arrow is painted by the server: wait until the app has hydrated (the screen tracker noted this screen) before tapping.
const hydrated=(page:Page)=>page.waitForFunction(()=>{try{return (JSON.parse(sessionStorage.getItem('ccr:pila-rutas')??'[]') as string[]).some(r=>r.split('?')[0]===(location.pathname.replace(/\/$/,'')||'/'));}catch{return false;}},null,{timeout:30_000});
// A cross-document back can report an intermediate cancelled navigation in WebKit: poll the address instead.
const expectPath=(page:Page,ok:(p:string)=>boolean,timeout=45_000)=>expect.poll(()=>ok(new URL(page.url()).pathname),{timeout}).toBe(true);
async function bigMapOpenClose(page:Page,how:'arrow'|'esc'|'back'){
 const open=page.locator('[data-place-map-open]').filter({visible:true}).first();
 await open.click();
 await expect(page.locator('[data-place-map-dialog]')).toBeVisible();
 if(how==='arrow')await page.locator('[data-place-map-close]').click();
 else if(how==='esc')await page.keyboard.press('Escape');
 else await page.evaluate(()=>history.back());
 await expect(page.locator('[data-place-map-dialog]')).toHaveCount(0);
 expect(page.url()).toMatch(onPlace);
}
async function openLocationTab(page:Page){
 const tab=page.getByRole('tab',{name:/Ubicaci|Location/});
 if(!(await tab.count()))return false;
 await tab.first().click();
 return (await page.locator('[data-place-map-open]').filter({visible:true}).count())>0;
}

async function openSection(page:Page){
 await watchHistory(page);
 const res=await page.request.get(SECTION);
 if(res.status()>=400){test.skip(true,'restaurantes no está activa en este entorno');return null;}
 await gotoOK(page,SECTION);
 await hydrated(page);
 const card=page.locator('a[href*="/negocios/"]').filter({visible:true}).first();
 if(!(await card.count())){test.skip(true,'sin lugares');return null;}
 return card;
}
async function tapCard(page:Page){
 const card=page.locator('a[href*="/negocios/"]').filter({visible:true}).first();
 await card.click();
 await page.waitForURL(onPlace,{timeout:45_000});
 await expect(back(page)).toBeVisible({timeout:20_000});
 await hydrated(page);
}

test.describe('salir de la ficha de negocio',()=>{
 test.beforeEach(({},info)=>{test.skip(!isMobileProject(info),'la flecha «Volver» de la barra es del teléfono');});

 test('la sección no navega sola y «Volver» regresa a ella, también tras anclajes y el mapa grande',async({page})=>{
  test.setTimeout(240_000);
  if(!(await openSection(page)))return;
  // Nada se mueve sin que la persona haga algo: ni entradas nuevas ni cambio de dirección en 8 s.
  const len=await page.evaluate(()=>history.length);
  await page.waitForTimeout(8_000);
  expect(await pushes(page),'pushState sin acción de la persona').toEqual([]);
  expect(await page.evaluate(()=>history.length)).toBe(len);
  expect(new URL(page.url()).pathname).toBe(SECTION);

  // Tocar una tarjeta siempre entra; «Volver» sale.
  await tapCard(page);
  await back(page).click();
  await expectPath(page,p=>p===SECTION);

  // Otra vez, ahora con anclajes de la página y el mapa grande abierto y cerrado de las tres formas.
  await tapCard(page);
  const before=await page.evaluate(()=>history.length);
  const avatar=page.locator('a[href="#resenas"], a[href="#fotos"]').filter({visible:true}).first();
  if(await avatar.count()){await avatar.click();await page.waitForTimeout(300);}
  expect(await page.evaluate(()=>history.length),'un anclaje de la página no crea entrada').toBe(before);
  await page.evaluate(()=>{location.hash='horario';});// an old pushed anchor (shared link, older build): still skipped
  if(await openLocationTab(page))for(const how of ['arrow','esc','back'] as const)await bigMapOpenClose(page,how);
  await back(page).click();
  await expectPath(page,p=>p===SECTION);
 });

 test('la flecha atrás del navegador sale de la ficha',async({page})=>{
  test.setTimeout(180_000);
  if(!(await openSection(page)))return;
  await tapCard(page);
  const avatar=page.locator('a[href="#resenas"], a[href="#fotos"]').filter({visible:true}).first();
  if(await avatar.count()){await avatar.click();await page.waitForTimeout(300);}
  // The big map closed with its arrow leaves no entry behind either.
  if(await openLocationTab(page))await bigMapOpenClose(page,'arrow');
  await page.goBack({waitUntil:'commit'}).catch(()=>{});
  await expectPath(page,p=>p===SECTION);
 });

 test('abierta directo, «Volver» lleva a la portada',async({page})=>{
  test.setTimeout(180_000);
  const card=await openSection(page);
  if(!card)return;
  const href=(await card.getAttribute('href'))!;
  const fresh=await page.context().newPage();
  await gotoOK(fresh,href);
  await expect(back(fresh)).toBeVisible({timeout:20_000});
  await hydrated(fresh);
  await back(fresh).click();
  await expectPath(fresh,p=>p==='/'||p==='/en',90_000);
  await fresh.close();
 });

 test('perfil profesional: «Volver» regresa a la lista',async({page})=>{
  test.setTimeout(180_000);
  await gotoOK(page,'/profesionales');
  const card=page.locator('a[href*="/profesionales/"]').filter({visible:true}).first();
  if(!(await card.count())){test.skip(true,'sin profesionales');return;}
  await card.click();
  await page.waitForURL(/\/profesionales\/[^/?#]+/,{timeout:45_000});
  await expect(back(page)).toBeVisible({timeout:20_000});
  await hydrated(page);
  await back(page).click();
  await expectPath(page,p=>p==='/profesionales');
 });
});
