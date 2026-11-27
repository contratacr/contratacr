import {test,expect,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local} from './pro-round2-fixture';
import {dirDb,hideSeededPlaces,label,seedPlace,seedSyntheticFuel,uid,type Db,openPlaceTab} from './pro-dir-fixture';
import {seedPriceComparison} from './pro-dir-prices-fixture';

// 2026-11-19: the places sections use the /profesionales layout; the complete GET form lives in the «Filtros» drawer
// (chip next to the title on desktop, in the results sheet on phones). Open it before using a field.
async function openFilters(page:import('playwright/test').Page){const form=page.locator('form[role="search"]');if(await form.isVisible())return;
 const b=page.locator('[data-dir-filters-button]').filter({visible:true}).first();
 await expect(async()=>{if(!(await form.isVisible()))await b.click();await expect(form).toBeVisible({timeout:1500});}).toPass({timeout:30000});}


// Owner decision 2026-11-17 (LOCAL Pro): «farmacias quiero mostrar todo y en todo donde aplique filtrar precios, solo
// gasolineras no porque todo es igual».
// - /restaurantes: ₡ range + price sorts on the menu's typical price (median dish, IVA + service included); restaurants
//   without a published menu stay listed (last) unless a range is set.
// - /supermercados and /farmacias: a product (text) + ₡ range + price sorts on that product's current price, with source
//   and date on each card; without a product the range is hidden behind a hint and refused in the URL.
// - every pharmacy is listed: «Permiso sin verificar por ContrataCR» (neutral) or «Permiso de funcionamiento verificado».
// - /gasolineras: no price filter and no price sort (national ARESEP price).
// Synthetic data only; places are hidden after each test (hideSeededPlaces) and price items retired (seed.cleanup).
test.afterEach(()=>hideSeededPlaces());

async function shot(page:Page,name:string,width:1440|390){
 const dir=process.env.PHARM_PRICE_SHOTS_DIR;if(!dir)return;
 mkdirSync(dir,{recursive:true});
 await page.setViewportSize({width,height:width===390?844:900});await page.waitForTimeout(400);
 await page.screenshot({path:join(dir,`${name}-${width}.png`),fullPage:true});
 await page.setViewportSize({width:1440,height:900});
}
const keys=(page:Page)=>page.locator('[data-search-item]').evaluateAll(els=>els.map(e=>e.getAttribute('data-search-item')));
const must=<T extends {error:unknown}>(r:T)=>{if(r.error)throw new Error(JSON.stringify(r.error));return r;};
/** Published menu of a restaurant (synthetic CLAIMED state written directly: the claim and menu editor flows are covered by pro-dir-claims-reviews and pro-dir-menu). */
async function seedMenu(db:Db,placeId:string,minors:number[]){
 must(await db.from('dir_places').update({claim_status:'claimed'}).eq('id',placeId));
 must(await db.from('pro_menu_settings').insert({place_id:placeId,prices_include_iva:true,prices_include_service:false,service_charge:true,service_bps:1000}));
 const sectionId=uid();must(await db.from('pro_menu_sections').insert({id:sectionId,place_id:placeId,name_es:'Platos',sort:0,status:'active'}));
 must(await db.from('pro_menu_items').insert(minors.map((m,i)=>({id:uid(),place_id:placeId,section_id:sectionId,name_es:`Plato ${i+1}`,price_minor:m,sort:i,status:'published'}))));
}

for(const language of ['es','en'] as const)test(`2026-11-17: restaurant price filter and sort on the menu's typical price [${language}]`,async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const en=language==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'',db=dirDb(),tag=label(),errors=collectPageErrors(page);
 const name=(x:string)=>`Soda Precio ${tag} ${x}`;
 const a=await seedPlace(db,{slug:`soda-precio-a-${tag}`,vertical:'restaurant',name:name('A'),adminArea1:'Heredia'});
 const b=await seedPlace(db,{slug:`soda-precio-b-${tag}`,vertical:'restaurant',name:name('B'),adminArea1:'Heredia'});
 await seedPlace(db,{slug:`soda-precio-c-${tag}`,vertical:'restaurant',name:name('C'),adminArea1:'Heredia'});
 await seedMenu(db,a.placeId,[300000,500000]);// ₡3 000 and ₡5 000 with IVA → typical ≈ ₡4 354 with service
 await seedMenu(db,b.placeId,[1200000]);// ₡12 000 → ≈ ₡13 062
 const q=encodeURIComponent(`Soda Precio ${tag}`);
 await gotoOK(page,`${prefix}/restaurantes?q=${q}&sort=price_asc`);
 expect(await keys(page)).toEqual([`p:soda-precio-a-${tag}`,`p:soda-precio-b-${tag}`,`p:soda-precio-c-${tag}`]);
 const cardA=page.locator(`[data-search-item="p:soda-precio-a-${tag}"]`);
 await expect(cardA.locator('[data-place-price="menu"]')).toContainText(t('Precio típico','Typical price'));
 await expect(cardA.locator('[data-place-price="menu"]')).toContainText(t('2 platos del menú, con IVA y servicio','2 dishes on the menu, VAT and service included'));
 await expect(cardA.locator('[data-place-price="menu"]')).toHaveAttribute('data-price-amount','4354');
 await expect(page.locator(`[data-search-item="p:soda-precio-c-${tag}"] [data-place-price]`)).toHaveCount(0);
 // 2026-11-19: the ranking reasons are no longer shown («¿Por qué aparece aquí?» moved to /como-ordenamos); they stay machine-readable.
 await expect(page.locator(`[data-search-item="p:soda-precio-c-${tag}"]`)).toHaveAttribute('data-ranking-reasons',/(^| )price_missing( |$)/);
 await gotoOK(page,`${prefix}/restaurantes?q=${q}&sort=price_desc`);
 expect(await keys(page)).toEqual([`p:soda-precio-b-${tag}`,`p:soda-precio-a-${tag}`,`p:soda-precio-c-${tag}`]);
 // The range from the plain GET form drops the places outside it, including the one without a menu.
 await openFilters(page);const form=page.locator('form[role="search"]');
 await expect(form.locator('[data-price-filters="menu"]')).toBeVisible();
 await form.getByLabel(t('Precio máximo (₡)','Maximum price (₡)')).fill('8000');
 await Promise.all([page.waitForURL(/priceMax=8000/),form.getByRole('button',{name:t('Aplicar filtros','Apply filters')}).click()]);
 expect(await keys(page)).toEqual([`p:soda-precio-a-${tag}`]);
 await expectNoHorizontalOverflow(page);
 if(info.project.name==='chromium-desktop'){await gotoOK(page,`${prefix}/restaurantes?q=${q}&sort=price_asc`);await shot(page,`restaurantes-precio-${language}`,1440);await shot(page,`restaurantes-precio-${language}`,390);}
 await gotoOK(page,`${prefix}/restaurantes?q=${q}&priceMin=9000&priceMax=1000`);
 await expect(page.locator('[data-search-problem="invalid"]')).toBeVisible();
 expect(errors()).toEqual([]);
});

for(const language of ['es','en'] as const)test(`2026-11-17: product price filter at supermarkets and pharmacies, every pharmacy with its permit status [${language}]`,async({page},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const en=language==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'',db=dirDb(),errors=collectPageErrors(page);
 const seed=await seedPriceComparison(db);
 try{
  // Supermarkets: the product typed as text is resolved to one catalogue item; current prices first, lowest first.
  await gotoOK(page,`${prefix}/supermercados?product=${encodeURIComponent('arroz '+seed.tag)}&sort=price_asc`);
  await expect(page.locator(`[data-price-product="${seed.rice}"]`)).toContainText(seed.riceName);
  expect((await keys(page)).slice(0,2)).toEqual([`p:${seed.places.norte}`,`p:${seed.places.centro}`]);
  const norte=page.locator(`[data-search-item="p:${seed.places.norte}"] [data-place-price="product"]`);
  await expect(norte).toHaveAttribute('data-price-amount','1190');
  await expect(norte).toContainText(t('Fuente: MEIC, estudio de precios','Source: MEIC price survey'));
  await expect(norte).toContainText(t('dato del','as of'));
  // The out-of-date ₡900 never counts as a current price.
  await expect(page.locator(`[data-search-item="p:${seed.places.viejo}"] [data-place-price]`)).toHaveCount(0);
  await openFilters(page);const form=page.locator('form[role="search"]');
  await form.getByLabel(t('Precio máximo (₡)','Maximum price (₡)')).fill('1200');
  await Promise.all([page.waitForURL(/priceMax=1200/),form.getByRole('button',{name:t('Aplicar filtros','Apply filters')}).click()]);
  expect(await keys(page)).toEqual([`p:${seed.places.norte}`]);
  if(info.project.name==='chromium-desktop'){await shot(page,`supermercados-producto-${language}`,1440);await shot(page,`supermercados-producto-${language}`,390);}

  // Pharmacies without a product: no range inputs, a hint instead, and no price sort; a range in the URL is refused.
  await gotoOK(page,`${prefix}/farmacias`);
  // 2026-11-19: no hint paragraph on the screen; the drawer offers the product field instead of the range inputs.
  await expect(page.locator('[data-price-filters-hint]')).toHaveCount(0);
  await openFilters(page);await expect(page.locator('form[role="search"] input[name="product"]')).toBeVisible();
  await expect(page.locator('form[role="search"] input[name="priceMin"]')).toHaveCount(0);
  await expect(page.locator('select[name="sort"] option[value="price_asc"]')).toHaveCount(0);
  await gotoOK(page,`${prefix}/farmacias?priceMax=900`);
  await expect(page.locator('[data-search-problem="product"]')).toContainText(t('Escriba un producto','Please type a product'));
  // With the OTC product: both pharmacies, the one without a verified permit listed (cheaper) with a neutral note.
  await gotoOK(page,`${prefix}/farmacias?product=${seed.otc}&sort=price_asc`);
  expect((await keys(page)).slice(0,2)).toEqual([`p:${seed.places.sinPermiso}`,`p:${seed.places.farmacia}`]);
  const sin=page.locator(`[data-search-item="p:${seed.places.sinPermiso}"]`),con=page.locator(`[data-search-item="p:${seed.places.farmacia}"]`);
  await expect(sin.locator('[data-pharmacy-license="unverified"]')).toHaveText(t('Permiso sin verificar por ContrataCR','License not verified by ContrataCR'));
  await expect(con.locator('[data-pharmacy-license="verified"]')).toHaveText(t('Permiso de funcionamiento verificado','Operating license verified'));
  await expect(sin.locator('[data-place-price="product"]')).toHaveAttribute('data-price-amount','700');
  await expect(con.locator('[data-place-price="product"]')).toHaveAttribute('data-price-amount','850');
  await gotoOK(page,`${prefix}/farmacias?product=${seed.otc}&priceMin=800`);
  expect(await keys(page)).toEqual([`p:${seed.places.farmacia}`]);
  await expectNoHorizontalOverflow(page);
  if(info.project.name==='chromium-desktop'){await gotoOK(page,`${prefix}/farmacias?product=${seed.otc}&sort=price_asc`);await shot(page,`farmacias-producto-${language}`,1440);await shot(page,`farmacias-producto-${language}`,390);}
  // The place page of the unverified pharmacy: public, neutral note; prescription prices never.
  await gotoOK(page,`${prefix}/negocios/${seed.places.sinPermiso}`);
  await openPlaceTab(page,'info');
  await expect(page.locator('[data-pharmacy-license="unverified"]')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(seed.rxName);
  // A prescription product is never resolvable as a price filter.
  await gotoOK(page,`${prefix}/farmacias?product=${seed.rx}&sort=price_asc`);
  await expect(page.locator('[data-price-product]')).toHaveCount(0);await expect(page.locator('[data-price-product-missing]')).toBeVisible();
  await expect(page.locator('[data-place-price]')).toHaveCount(0);
  expect(errors()).toEqual([]);
 }finally{await seed.cleanup();}
});

test('2026-11-17: fuel stations have no price filter nor price sort (national ARESEP price)',async({page},info)=>{
 test.setTimeout(180000);local(info.project.use.baseURL);
 const db=dirDb(),tag=label(),errors=collectPageErrors(page);
 await seedPlace(db,{slug:`bomba-precio-${tag}`,vertical:'fuel',name:`Bomba Precio ${tag}`,adminArea1:'Heredia'});
 // The national ARESEP price comes from an official set; the local stack has none, so record a synthetic one (taken down at the end).
 const fuel=await seedSyntheticFuel(db);
 try{
 for(const prefix of ['','/en']){
  await gotoOK(page,`${prefix}/gasolineras?q=${encodeURIComponent('Bomba Precio '+tag)}`);
  await expect(page.locator(`[data-search-item="p:bomba-precio-${tag}"]`)).toBeVisible();
  await expect(page.locator('[data-price-filters]')).toHaveCount(0);
  await expect(page.locator('form[role="search"] input[name="priceMin"], form[role="search"] input[name="product"]')).toHaveCount(0);
  await expect(page.locator('select[name="sort"] option[value="price_asc"], select[name="sort"] option[value="price_desc"]')).toHaveCount(0);
  await expect(page.locator('[data-place-price]')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('ARESEP');
  await gotoOK(page,`${prefix}/gasolineras?priceMin=1`);await expect(page.locator('[data-search-problem="invalid"]')).toBeVisible();
  await gotoOK(page,`${prefix}/gasolineras?sort=price_asc`);await expect(page.locator('[data-search-problem="sort"]')).toBeVisible();
 }
 expect(errors()).toEqual([]);
 }finally{await fuel.restore();}
});
