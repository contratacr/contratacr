import {test,expect} from 'playwright/test';
import {gotoOK,isMobileProject} from './helpers';
import {PLACE_ACTIONS,resolvePlaceActions,placeActionSpec,placeBarActions,placeCardActions,type PlaceActionInput} from '../../src/lib/directory/place-actions';
import {PLACE_SECTIONS} from '../../src/lib/directory/place-verticals';

// Botones principales por categoría (estilo app móvil de Yelp): el mapa vive en src/lib/directory/place-actions.ts.
// Regla: un botón existe solo si el lugar tiene el dato (nunca un botón muerto). Parte 1: el mapa puro. Parte 2: páginas
// reales (la primera ficha de cada categoría que tenga lugares) en móvil y escritorio, ES y EN.

const FULL:PlaceActionInput={slug:'x',name:'Lugar',verticalId:'restaurant',locale:'es',phone:'+506 2222-3333',website:'https://example.com',location:{lat:9.93,lng:-84.08},hasHours:true,hasMenu:true,hasPrices:true,reservation:true,order:{channel:'whatsapp',value:'+506 8888-7777'},reviewable:true};
const EMPTY:PlaceActionInput={slug:'x',name:'Lugar',verticalId:'restaurant',locale:'es'};

test('mapa de botones: cada sección tiene su juego y nunca hay botones muertos',()=>{
 for(const s of PLACE_SECTIONS){
  expect(PLACE_ACTIONS[s.id],`sección ${s.id} sin mapa`).toBeTruthy();
  for(const locale of ['es','en']){
   const full=resolvePlaceActions(placeActionSpec(s.id).side,{...FULL,verticalId:s.id,locale});
   expect(full.length).toBeGreaterThan(0);
   for(const a of full){expect(a.href.length,`${s.id}/${a.id}`).toBeGreaterThan(1);expect(a.label).toBeTruthy();}
   expect(placeBarActions({...FULL,verticalId:s.id,locale}).length).toBeLessThanOrEqual(4);
   expect(placeCardActions({...FULL,verticalId:s.id,locale}).length).toBeLessThanOrEqual(2);
   // Sin datos: solo puede quedar la reseña (y nada con enlace vacío).
   const none=resolvePlaceActions([...placeActionSpec(s.id).side,...placeActionSpec(s.id).bar],{...EMPTY,verticalId:s.id,locale});
   expect(none.every(a=>a.id==='review')).toBe(true);
  }
 }
});

test('restaurantes: Reservar usa la herramienta de reservas o "Llamar para reservar", sin duplicar el teléfono',()=>{
 const withTool=resolvePlaceActions(['reserve','call'],{...FULL,order:null});
 expect(withTool.map(a=>a.id)).toEqual(['reserve','call']);expect(withTool[0]!.href).toBe('#place-reservations');
 const phoneOnly=resolvePlaceActions(['reserve','call'],{...FULL,reservation:false,order:null});
 expect(phoneOnly).toHaveLength(1);expect(phoneOnly[0]).toMatchObject({id:'reserve',label:'Llamar para reservar'});
 expect(resolvePlaceActions(['reserve'],{...FULL,reservation:false,phone:null})).toHaveLength(0);
 expect(resolvePlaceActions(['reserve'],{...FULL,reservation:false,phone:null,locale:'en'})).toHaveLength(0);
 expect(resolvePlaceActions(['reserve'],{...FULL,reservation:false,locale:'en'})[0]!.label).toBe('Call to reserve');
});

test('Cómo llegar ofrece Waze, Google Maps y Apple Maps; WhatsApp y Cotizar salen del enlace del dueño',()=>{
 const [d]=resolvePlaceActions(['directions'],FULL);
 expect(d!.type).toBe('directions');expect(d!.maps!.waze).toContain('waze.com');expect(d!.maps!.google).toContain('google.com/maps');expect(d!.maps!.apple).toContain('maps.apple.com');
 expect(resolvePlaceActions(['whatsapp'],{...FULL,order:null})).toHaveLength(0);
 const q=resolvePlaceActions(['quote','whatsapp'],{...FULL,verticalId:'hardware'});
 expect(q.map(a=>a.id)).toEqual(['quote']);expect(q[0]!.href).toMatch(/^https:\/\/wa\.me\/50688887777\?text=/);
 expect(resolvePlaceActions(['website'],{...FULL,website:'javascript:alert(1)'})).toHaveLength(0);
});

const SECTIONS=['restaurantes','farmacias','gasolineras','supermercados','talleres','salud','belleza'];
for(const locale of ['es','en'] as const)for(const section of SECTIONS)test(`ficha de ${section}: botones por categoría sin botones muertos [${locale}]`,async({page},info)=>{
 const prefix=locale==='en'?'/en':'';
 const res=await page.goto(`${prefix}/${section}`,{waitUntil:'domcontentloaded'});
 if(!res||res.status()>=400){test.skip(true,`${section} no está activa en este entorno`);return;}
 await gotoOK(page,`${prefix}/${section}`);
 const link=page.locator('a[href*="/lugar/"]').first();
 if(!(await link.count())){test.skip(true,`sin lugares en ${section}`);return;}
 const href=(await link.getAttribute('href'))!;
 await gotoOK(page,href);
 const mobile=isMobileProject(info);
 const bar=page.locator('[data-place-mobile-bar]');
 await expect(page.locator('[data-place-page]')).toBeVisible();
 // Sin foto de perfil no hay círculo vacío: o hay foto real o la franja de categoría.
 const avatars=page.locator('[data-place-avatar]');
 if(await avatars.count())await expect(avatars.first().locator('img')).toHaveCount(1);
 else await expect(page.locator('[data-hero-tile]').first()).toBeVisible();
 await expect(page.locator('[data-place-photo-placeholder]')).toHaveCount(0);
 if(mobile){
  await expect(bar).toBeVisible();
  const items=bar.locator('[data-place-bar-item]');
  expect(await items.count()).toBeLessThanOrEqual(4);expect(await items.count()).toBeGreaterThan(0);
 }else{
  await expect(bar).toBeHidden();
  await expect(page.locator('[data-place-side-card]')).toBeVisible();
 }
 // Ningún botón de acción sin destino.
 for(const a of await page.locator('[data-place-side-actions] a, [data-place-mobile-bar] a, [data-place-actions-bar] a').all()){
  const h=await a.getAttribute('href');expect(h,'botón sin enlace').toBeTruthy();expect(h).not.toBe('#');
 }
 // La ficha no se desborda (el encabezado global se mide aparte en navbar-brand-consistency).
 expect(await page.locator('[data-place-page]').evaluate(m=>m.scrollWidth<=m.clientWidth+1),'la ficha desborda').toBe(true);
 // Cómo llegar: elección de aplicación.
 const cta=(mobile?bar:page.locator('[data-place-side-card]')).locator('[data-place-directions-cta]').first();
 if(await cta.count()){
  // Clic real en el centro del botón (la barra es fija: sin el desplazamiento automático de Playwright).
  const opts=page.locator('[data-place-directions-options]');
  // Antes de hidratar el toque se pierde: se repite hasta que el menú abre (nunca se alterna dos veces).
  await expect(async()=>{
   if(!(await opts.count())){const box=(await cta.boundingBox())!;await page.mouse.click(box.x+box.width/2,box.y+box.height/2);}
   await expect(opts).toBeVisible({timeout:1500});
  }).toPass({timeout:15000});
  await expect(opts.locator('[data-directions-app]')).toHaveCount(3);
  for(const app of ['waze','google','apple'])await expect(opts.locator(`[data-directions-app="${app}"]`)).toHaveAttribute('href',/^https:/);
  await page.keyboard.press('Escape');await expect(opts).toHaveCount(0);
 }
});

// Ficha tipo app móvil: pestañas, «¿Recomienda este lugar?» y hoja de compartir (ES y EN).
for(const locale of ['es','en'] as const)test(`ficha: recomendación, pestañas y hoja de compartir [${locale}]`,async({page})=>{
 const prefix=locale==='en'?'/en':'';
 const res=await page.goto(`${prefix}/restaurantes`,{waitUntil:'domcontentloaded'});
 if(!res||res.status()>=400){test.skip(true,'restaurantes no está activa en este entorno');return;}
 const link=page.locator('a[href*="/lugar/"]').first();
 if(!(await link.count())){test.skip(true,'sin lugares');return;}
 await gotoOK(page,(await link.getAttribute('href'))!);
 const en=locale==='en';
 // Pestañas: Información, Reseñas y Más siempre; sin desbordar.
 for(const id of ['info','reviews','more'])await expect(page.locator(`[data-place-tab="${id}"]`)).toBeVisible();
 await expect(page.locator('[data-place-tab="more"]')).toHaveText(en?'More':'Más');
 // Recomendación: tres opciones; «Sí» abre el formulario con 5 estrellas sugeridas.
 const rec=page.locator('[data-place-recommend]');
 await expect(rec).toBeVisible();
 await expect(rec.locator('[data-place-recommend-option]')).toHaveCount(3);
 await expect(rec).toContainText(en?'Would you recommend this place?':'¿Recomienda este lugar?');
 await expect(async()=>{
  await rec.locator('[data-place-recommend-option="maybe"]').click();
  await expect(page.locator('[data-place-review-form]')).toBeVisible({timeout:1500});
  await expect(page.locator('[data-place-review-form] select[name="rating"]')).toHaveValue('3',{timeout:1500});
 }).toPass({timeout:15000});
 // Hoja de compartir: Copiar enlace, Enviar a amigos, Sugerir un cambio.
 const btn=page.locator('[data-place-actions-bar] [data-share-button]');
 await expect(async()=>{await btn.click();await expect(page.locator('[data-share-sheet]')).toBeVisible({timeout:1500});}).toPass({timeout:15000});
 await expect(page.locator('[data-share-copy]')).toHaveText(en?'Copy link':'Copiar enlace');
 await expect(page.locator('[data-share-send]')).toHaveText(en?'Send to friends':'Enviar a amigos');
 await expect(page.locator('[data-share-suggest]')).toHaveText(en?'Suggest an edit':'Sugerir un cambio');
 await page.keyboard.press('Escape');await expect(page.locator('[data-share-sheet]')).toHaveCount(0);
 expect(await page.locator('[data-place-page]').evaluate(m=>m.scrollWidth<=m.clientWidth+1),'la ficha desborda').toBe(true);
});
