import {test,expect} from 'playwright/test';
import {gotoOK} from './helpers';
import {directoryActiveTab,directoryBadgeText,DIRECTORY_TAB_ORDER} from '../../src/components/mobile/directory-tabs-model';

// Barra de abajo del directorio (estructura Yelp): 5 pestañas Buscar, Proyectos, Asistente, Mis listas, Yo.

test('pestaña encendida por ruta',()=>{
 const S=['restaurantes','farmacias'];
 const caso:[string,string|null][]=[['/','buscar'],['/buscar','buscar'],['/restaurantes','buscar'],['/lugares','buscar'],['/servicios','buscar'],['/profesionales','buscar'],['/solicitudes','proyectos'],['/solicitudes/abc','proyectos'],['/asistente','asistente'],['/listas','listas'],['/lista/x','listas'],['/yo','yo'],['/notificaciones','yo'],['/mensajes','yo'],['/dashboard/profesional','yo'],['/empleos/mis-empleos','yo'],['/promociones/mis-promociones','yo'],['/empleos',null],['/promociones',null]];
 for(const [ruta,esperada] of caso)expect(directoryActiveTab(ruta,S),ruta).toBe(esperada);
 expect(DIRECTORY_TAB_ORDER).toEqual(['buscar','proyectos','asistente','listas','yo']);
});

test('insignia: oculta en 0, tope 99+',()=>{
 expect(directoryBadgeText(0)).toBeNull();expect(directoryBadgeText(7)).toBe('7');expect(directoryBadgeText(99)).toBe('99');expect(directoryBadgeText(100)).toBe('99+');
});

const ETIQUETAS={es:['Buscar','Proyectos','Asistente','Mis listas','Yo'],en:['Search','Projects','Assistant','My Lists','Me']};

for(const locale of ['es','en'] as const){
 test(`móvil 390x844: cinco pestañas en orden y una sola activa [${locale}]`,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const p=locale==='en'?'/en':'';
  await gotoOK(page,`${p}/`);
  const bar=page.locator('[data-directory-tabs]');
  if(!(await bar.count())){test.skip(true,'directorio apagado en este entorno');return;}
  await expect(bar).toBeVisible();
  const tabs=bar.locator('[data-directory-tab]');
  await expect(tabs).toHaveCount(5);
  expect((await tabs.allInnerTexts()).map(t=>t.trim())).toEqual(ETIQUETAS[locale]);
  await expect(bar.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(bar.locator('[data-directory-tab="buscar"]')).toHaveAttribute('aria-current','page');
  for(const [ruta,id] of [['/solicitudes','proyectos'],['/listas','listas'],['/buscar','buscar']] as const){
   await page.goto(`${p}${ruta}`,{waitUntil:'domcontentloaded'});
   if(await page.locator('[data-directory-tabs]').count()===0)continue;
   await expect(page.locator('[data-directory-tabs] [aria-current="page"]')).toHaveCount(1);
   await expect(page.locator(`[data-directory-tabs] [data-directory-tab="${id}"]`)).toHaveAttribute('aria-current','page');
  }
 });
}

test('escritorio 1280: sin barra de abajo',async({page})=>{
 await page.setViewportSize({width:1280,height:800});
 await gotoOK(page,'/');
 const bar=page.locator('[data-directory-tabs]');
 if(!(await bar.count())){test.skip(true,'directorio apagado en este entorno');return;}
 await expect(bar).toBeHidden();
});

test('móvil: sin barra en fichas de lugar ni en el panel admin',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/admin',{waitUntil:'domcontentloaded'});
 await expect(page.locator('[data-directory-tabs]')).toHaveCount(0);
 await gotoOK(page,'/');
 if(!(await page.locator('[data-directory-tabs]').count())){test.skip(true,'directorio apagado en este entorno');return;}
 const link=page.locator('a[href*="/lugar/"]').first();
 if(await link.count()){await page.goto((await link.getAttribute('href'))!,{waitUntil:'domcontentloaded'});await expect(page.locator('[data-directory-tabs]')).toHaveCount(0);}
});
