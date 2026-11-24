import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';

// Directory app, Me (Yo) tab + Mis listas tabs + notifications list (WS4). Anonymous /yo goes to login; a signed-in person sees the
// sections of /yo in order, the share fallback («Copiar enlace»), the QR sheet, dismissible «Comparta su experiencia» cards (also
// with localStorage blocked) and /listas with He estado | Quiero ir | Listas and the exact empty-state copy.
test('anónimo: /yo lleva a iniciar sesión',async({page})=>{
 const r=await page.goto('/yo',{waitUntil:'domcontentloaded'});
 if(r&&r.status()===404){test.skip(true,'directorio apagado en este entorno');return;}
 await expect(page).toHaveURL(/\/login\?redirect=/);
 expect(decodeURIComponent(new URL(page.url()).searchParams.get('redirect')??'')).toContain('/yo');
});

for(const vp of [{name:'móvil',width:390,height:844},{name:'escritorio',width:1280,height:800}]){
 test(`sesión: Yo, compartir, QR, listas [${vp.name}]`,async({page,context},info)=>{
  test.setTimeout(240000);local(info.project.use.baseURL);
  await page.setViewportSize({width:vp.width,height:vp.height});
  const errors=collectPageErrors(page);let user:DisposableAccount|undefined;
  try{
   user=await createDisposableAccount({prefix:'dir-me'});await login(context,user);
   // A viewed place, as the place page leaves it, to exercise the experience cards and «Vistos recientemente».
   await page.addInitScript(()=>{try{if(!window.localStorage.getItem('ccr:dir:recent:v1'))window.localStorage.setItem('ccr:dir:recent:v1',JSON.stringify([{slug:'soda-prueba',name:'Soda Prueba',area:'Paraíso',at:Date.now()}]));}catch{/* blocked */}});
   const r=await page.goto('/yo',{waitUntil:'domcontentloaded'});
   if(r&&r.status()===404){test.skip(true,'directorio apagado en este entorno');return;}
   const home=page.locator('[data-me-home]');await expect(home).toBeVisible({timeout:45000});
   const order=['[data-me-quick]','[data-me-experience]','[data-me-impact]','[data-me-recent]','[data-me-contrib]','[data-me-community]','[data-me-more]','[data-me-account]'];
   const ys:number[]=[];for(const s of order)ys.push((await page.locator(s).boundingBox())!.y);
   expect([...ys].sort((a,b)=>a-b)).toEqual(ys);
   await expect(page.locator('[data-me-more]')).toContainText('Profesionales');
   await expect(page.locator('[data-me-more]')).toContainText('Mis solicitudes');
   await expect(page.locator('[data-me-impact]')).toContainText('¡Las reacciones lo esperan! Escriba su primera reseña para ayudar a otros a descubrir un negocio.');
   await expectNoHorizontalOverflow(page);
   // Share: no native share in desktop Chromium → the sheet with «Copiar enlace».
   await page.locator('[data-me-share]').click();
   await expect(page.locator('[data-me-share-sheet]')).toBeVisible();await expect(page.locator('[data-me-copy]')).toContainText('Copiar enlace');
   await page.keyboard.press('Escape');await expect(page.locator('[data-me-share-sheet]')).toHaveCount(0);
   // QR: a generated image plus Compartir.
   await page.locator('[data-me-qr]').click();
   await expect(page.locator('[data-me-qr-image]')).toBeVisible({timeout:15000});await expect(page.locator('[data-me-qr-share]')).toContainText('Compartir');
   if(vp.width===390)await page.screenshot({path:'test-results/me-qr-390.png'});
   await page.keyboard.press('Escape');
   // Experience card: dismiss survives a reload.
   const card=page.locator('[data-experience-card="soda-prueba"]');await expect(card).toBeVisible();
   if(vp.width===390)await page.screenshot({path:'test-results/me-390.png',fullPage:true});else await page.screenshot({path:'test-results/me-1280.png',fullPage:true});
   await card.getByRole('button',{name:/Descartar/}).click();await expect(card).toHaveCount(0);
   await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('[data-me-home]')).toBeVisible();await expect(page.locator('[data-experience-card="soda-prueba"]')).toHaveCount(0);
   // Lists tabs.
   await gotoOK(page,'/listas');
   const tabs=page.locator('[data-my-lists][data-ready]');await expect(tabs).toBeVisible({timeout:45000});
   await expect(tabs.getByRole('heading',{name:'Mis listas'})).toBeVisible();await expect(tabs.locator('[data-lists-map]')).toContainText('Mapa');
   await expect(tabs.locator('[data-lists-tab]')).toHaveText(['He estado','Quiero ir','Listas']);
   await expect(tabs.locator('[data-lists-empty]')).toHaveText('Agregue lugares para registrar, clasificar y compartir dónde ha estado.');
   await expect(tabs.locator('[data-lists-progress]')).toContainText('0/5');await expect(tabs.locator('[data-lists-progress]')).toContainText('Desbloquee su lista top 10 agregando 5 más');
   await tabs.locator('[data-lists-tab="lists"]').click();await expect(tabs.locator('[data-lists-manager]')).toBeVisible();
   await page.screenshot({path:`test-results/listas-${vp.width}.png`,fullPage:true});
   expect(errors().filter(e=>!/Failed to load resource/.test(e))).toEqual([]);
  }finally{if(user)await cleanupDisposableAccount(user);}
 });
}

test('localStorage bloqueado: Yo sigue funcionando',async({page,context},info)=>{
 test.setTimeout(180000);local(info.project.use.baseURL);let user:DisposableAccount|undefined;
 try{
  user=await createDisposableAccount({prefix:'dir-me-b'});await login(context,user);
  await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});});
  const r=await page.goto('/yo',{waitUntil:'domcontentloaded'});
  if(r&&r.status()===404){test.skip(true,'directorio apagado en este entorno');return;}
  await expect(page.locator('[data-me-home]')).toBeVisible({timeout:45000});
 }finally{if(user)await cleanupDisposableAccount(user);}
});
