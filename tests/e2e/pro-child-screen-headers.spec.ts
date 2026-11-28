import {test,expect,type Page} from 'playwright/test';
import {gotoOK} from './helpers';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {dirDb} from './pro-dir-fixture';

// Owner rule 2026-11-27: on phones a CHILD screen names itself in the bar, «← Título», and the arrow returns to its
// parent (through the history, or to the parent address when the screen was opened directly). No in-page «Volver», no
// duplicated heading, no cut title. Sign-in reached from a gated section is a full-screen interruption: «X Iniciar
// sesión», a line saying why, X back to the screen before the gated one (never a loop), «← paso» inside the flow.
// Directory on (local Pro stack). 390 px.

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const OUT=process.env.HEADERS_SHOTS_DIR??'';
const shot=async(page:Page,name:string)=>{if(OUT)await page.screenshot({path:`${OUT}/${name}.png`});};

const sectionTitle=(page:Page)=>page.locator('[data-ccr-section-title]').filter({visible:true}).first();
const sectionBack=(page:Page)=>page.locator('[data-ccr-section-back]').filter({visible:true}).first();
const hydrated=(page:Page)=>page.waitForFunction(()=>{try{return (JSON.parse(sessionStorage.getItem('ccr:pila-rutas')??'[]') as string[]).some(r=>r.split('?')[0]===(location.pathname.replace(/\/$/,'')||'/'));}catch{return false;}},null,{timeout:30_000});
const here=(page:Page)=>{const u=new URL(page.url());return u.pathname+u.search;};
const dismissCookies=async(page:Page)=>{await page.getByRole('button',{name:'Continuar',exact:true}).click({timeout:2_000}).catch(()=>{});};
// In-app navigation (a link on the parent): a same-origin document navigation, so the screen trail is kept.
// (The target may redirect, e.g. a gated section to sign-in: wait for the address to change, not for `url` itself.)
const openFrom=async(page:Page,url:string)=>{const from=page.url();await page.evaluate(u=>{location.assign(u);},url);await page.waitForURL(u=>u.href!==from,{timeout:45_000});await page.waitForLoadState('load');};
// Plain load (gotoOK's blank-page guard trips on /registro's short «checking session» spinner).
const open=async(page:Page,url:string)=>{await page.goto(url,{waitUntil:'load'});};
async function notCut(page:Page,selector:string){
 const cut=await page.locator(selector).filter({visible:true}).evaluateAll(els=>els.filter(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1).map(e=>e.textContent));
 expect(cut,'header text cut').toEqual([]);
 expect(await page.locator(selector).filter({visible:true}).allTextContents()).not.toContainEqual(expect.stringContaining('…'));
}
async function expectChildBar(page:Page,title:string,inPageBack:string){
 await expect(sectionTitle(page)).toHaveText(title,{timeout:20_000});
 await expect(sectionBack(page)).toBeVisible();
 await notCut(page,'[data-ccr-section-title]');
 await expect(page.locator(inPageBack).filter({visible:true})).toHaveCount(0);
}

type Child={name:string;parent:string;child:string;title:string;inPageBack:string};
async function children():Promise<Child[]>{
 const db=dirDb();
 const brand=(await db.from('dir_brands').select('slug').limit(1).maybeSingle()).data?.slug as string|undefined;
 const item=(await db.from('price_items').select('slug').limit(1).maybeSingle()).data?.slug as string|undefined;
 const list:Child[]=[
  {name:'registro-empresa',parent:'/registro?paso=profesional',child:'/registro/empresa',title:'Agregar mi empresa',inPageBack:'[data-business-signup-back]'},
  {name:'precios-categoria',parent:'/precios',child:'/precios?categoria=granos',title:'Granos',inPageBack:'[data-price-back]'},
 ];
 if(item)list.push({name:'precios-producto',parent:'/precios',child:`/precios?producto=${item}`,title:'Producto',inPageBack:'[data-price-back]'});
 if(brand)list.push({name:'marca',parent:'/como-ordenamos',child:`/marca/${brand}`,title:'Marca',inPageBack:'[data-brand-breadcrumb]'});
 return list;
}

test.describe('child screens: «← title» bar at 390 px',()=>{
 test('opened directly: own title, arrow to the parent address',async({page})=>{
  for(const c of await children()){
   await gotoOK(page,c.child);await dismissCookies(page);
   await expectChildBar(page,c.title,c.inPageBack);
   await shot(page,`${c.name}-390`);
   await hydrated(page);
   await sectionBack(page).click();
   const fallback=c.name==='marca'?'/':c.parent;
   await expect.poll(()=>here(page),{timeout:30_000,message:c.name}).toBe(fallback);
  }
 });
 test('from the parent: the arrow goes back to it',async({page})=>{
  for(const c of await children()){
   await open(page,c.parent);await dismissCookies(page);await hydrated(page);
   await openFrom(page,c.child);
   await expectChildBar(page,c.title,c.inPageBack);
   await hydrated(page);
   await sectionBack(page).click();
   await expect.poll(()=>here(page),{timeout:30_000,message:c.name}).toBe(c.parent);
  }
 });
});

const close=(page:Page)=>page.locator('[data-focused-close]').filter({visible:true});
const stepBack=(page:Page)=>page.locator('[data-native-back="focused-step"]:not([data-focused-close])').filter({visible:true});
const flowTitle=(page:Page)=>page.locator('[data-focused-title]').filter({visible:true});
async function expectInterruption(page:Page){
 await expect(close(page)).toBeVisible({timeout:20_000});
 await expect(close(page)).toHaveAttribute('aria-label','Cerrar');
 await expect(flowTitle(page)).toHaveText('Iniciar sesión');
 await expect(page.locator('[data-login-context]')).toHaveText('Inicie sesión para usar Guardados');
 await notCut(page,'[data-focused-title], [data-login-context]');
 // No site bar on phones: no logo, menu or search.
 await expect(page.locator('[data-ccr-section-title], [data-ccr-section-back]').filter({visible:true})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'ContrataCR'}).filter({visible:true})).toHaveCount(0);
 await expect(page.locator('[data-directory-tabs], .ccr-native-bottom-nav').filter({visible:true})).toHaveCount(0);
}

test.describe('sign-in reached from a gated section (390 px)',()=>{
 test('X returns to the screen before the gated one, no loop',async({page})=>{
  await gotoOK(page,'/como-ordenamos');await dismissCookies(page);await hydrated(page);
  await openFrom(page,'/listas');
  await page.waitForURL(/\/login\?redirect=%2Flistas/,{timeout:45_000});
  await expectInterruption(page);
  await shot(page,'login-interruption-390');
  await hydrated(page);
  await close(page).click();
  await expect.poll(()=>here(page),{timeout:30_000}).toBe('/como-ordenamos');
  await page.waitForTimeout(1_500);
  expect(here(page)).toBe('/como-ordenamos');
 });
 test('opened from outside: X goes home',async({page})=>{
  await gotoOK(page,'/login?redirect=%2Flistas');await dismissCookies(page);
  await expectInterruption(page);
  await hydrated(page);
  await close(page).click();
  await expect.poll(()=>here(page),{timeout:30_000}).toBe('/');
 });
 test('Crear cuenta and Recuperar contraseña are steps: ← goes back to sign-in, X there still leaves',async({page})=>{
  await gotoOK(page,'/como-ordenamos');await dismissCookies(page);await hydrated(page);
  await openFrom(page,'/listas');
  await page.waitForURL(/\/login\?redirect=/,{timeout:45_000});await hydrated(page);
  await page.locator('main a[href*="/registro"]').first().click();
  await page.waitForURL(/\/registro\?redirect=%2Flistas/,{timeout:45_000});
  await expect(flowTitle(page)).toHaveText('Crear cuenta');
  await notCut(page,'[data-focused-title]');
  await expect(stepBack(page)).toBeVisible();
  await expect(close(page)).toHaveCount(0);
  await shot(page,'registro-step-390');
  await hydrated(page);
  await stepBack(page).click();
  await page.waitForURL(/\/login\?redirect=%2Flistas/,{timeout:45_000});
  await expectInterruption(page);
  await hydrated(page);
  await page.locator('main a[href*="/olvide-contrasena"]').first().click();
  await page.waitForURL(/\/olvide-contrasena\?redirect=/,{timeout:45_000});
  await expect(flowTitle(page)).toHaveText('Recuperar contraseña');
  await notCut(page,'[data-focused-title]');
  await shot(page,'olvide-step-390');
  await hydrated(page);
  await stepBack(page).click();
  await page.waitForURL(/\/login\?redirect=%2Flistas/,{timeout:45_000});
  await hydrated(page);
  await close(page).click();
  await expect.poll(()=>here(page),{timeout:30_000}).toBe('/como-ordenamos');
 });
 test('a public page whose action asks to sign in: X returns to that same page',async({page})=>{
  const brand=(await dirDb().from('dir_brands').select('slug').limit(1).maybeSingle()).data?.slug as string|undefined;
  test.skip(!brand,'sin marcas');
  await gotoOK(page,'/como-ordenamos');await dismissCookies(page);await hydrated(page);
  await openFrom(page,`/marca/${brand}`);await hydrated(page);
  const path=new URL(page.url()).pathname;
  // The brand's «Iniciar sesión para reclamar» link (loginHref): redirect = the brand page itself.
  await openFrom(page,`/login?redirect=${encodeURIComponent(path)}`);
  await expect(close(page)).toBeVisible({timeout:20_000});
  await hydrated(page);
  await close(page).click();
  await expect.poll(()=>new URL(page.url()).pathname,{timeout:30_000}).toBe(path);
  await page.waitForTimeout(1_500);
  expect(new URL(page.url()).pathname).toBe(path);
 });
 test('signing in lands on the target and Back does not return to sign-in',async({page})=>{
  const user=await createDisposableAccount({prefix:'child-headers'});
  try{
   await gotoOK(page,'/como-ordenamos');await dismissCookies(page);await hydrated(page);
   await openFrom(page,'/listas');
   await page.waitForURL(/\/login\?redirect=/,{timeout:45_000});
   await page.locator('input[type="email"]').fill(user.email);
   await page.locator('input[type="password"]').fill(user.password);
   await page.locator('main button[type="submit"]').click();
   await page.waitForURL(u=>!u.pathname.startsWith('/login'),{timeout:60_000});
   expect(new URL(page.url()).pathname).not.toMatch(/^\/(?:login|registro)/);
   await page.goBack();
   await expect.poll(()=>new URL(page.url()).pathname,{timeout:30_000}).toBe('/como-ordenamos');
  }finally{await cleanupDisposableAccount(user);}
 });
 test('opened directly from the menu: site bar; with a screen behind, «← Iniciar sesión»',async({page})=>{
  await gotoOK(page,'/login');await dismissCookies(page);await hydrated(page);
  await expect(close(page)).toHaveCount(0);
  await expect(page.locator('[data-login-context]')).toHaveCount(0);
  await expect(sectionBack(page)).toHaveCount(0);
  await gotoOK(page,'/como-ordenamos');await hydrated(page);
  await openFrom(page,'/login');
  await expect(sectionTitle(page)).toHaveText('Iniciar sesión',{timeout:20_000});
  await hydrated(page);
  await sectionBack(page).click();
  await expect.poll(()=>here(page),{timeout:30_000}).toBe('/como-ordenamos');
 });
});
