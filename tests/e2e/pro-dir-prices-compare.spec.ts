import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local} from './pro-round2-fixture';
import {dirDb,hideSeededPlaces,seedSyntheticFuel,visibleHtml} from './pro-dir-fixture';
import {pricesShot,seedPriceComparison} from './pro-dir-prices-fixture';

// Multivertical P3 (LOCAL Pro): /precios and /en/precios. Search by name or barcode, compare one product across stores:
// current prices first, lowest price per kg first, out-of-date prices last and flagged, source + date + staleness +
// confidence on every price, official-file provenance link, per-province summary. Prescription medicines are never
// searchable nor comparable (Decreto 36868-S); every pharmacy appears (owner decision 2026-11-17), and a ₡ price range
// (precioMin/precioMax) filters the offers. Synthetic data only (cleaned up).
// Owner of /[locale]/precios.
test.afterEach(()=>hideSeededPlaces());

for(const language of ['es','en'] as const)test(`P3: price comparison, neutral order, sources and Rx never shown [${language}]`,async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const en=language==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'',db=dirDb();
 const seed=await seedPriceComparison(db);
 // The landing shows the national ARESEP set; the local stack has no official one, so record a synthetic set (taken down in the finally).
 const fuel=await seedSyntheticFuel(db);
 const errors=collectPageErrors(page);
 try{
  // Search page: the product is found by a word of its name; the Rx product is not.
  await gotoOK(page,`${prefix}/precios`);
  const form=page.locator('[data-price-search-form]');await expect(form).toBeVisible();
  // 2026-11-19: the prescription notice moved to the Terms (13.1); prescription products stay unsearchable (below).
  await expect(page.locator('[data-price-rx-note]')).toHaveCount(0);
  // 2026-11-19 redesign: the landing carries today's national ARESEP fuel prices (→ /gasolineras) and the invitations.
  await expect(page.locator('[data-price-fuel]')).toContainText('ARESEP');
  await expect(page.locator('[data-price-fuel] a[href$="/gasolineras"]')).toBeVisible();
  await expect(page.locator('[data-price-invite-business]')).toHaveAttribute('href',`${prefix}/dashboard/negocio`);
  await form.getByLabel(t('Producto o código de barras','Product or barcode')).fill(`arroz ${seed.tag}`);
  await Promise.all([page.waitForURL(/\/precios\?q=/),form.getByRole('button',{name:t('Buscar','Search')}).click()]);
  const result=page.locator(`[data-price-search-item="${seed.rice}"]`);
  await expect(result).toContainText(seed.riceName);await expect(result).toContainText(t('2 comercios con precio vigente','2 stores with a current price'));
  await expectNoHorizontalOverflow(page);
  if(info.project.name==='chromium-desktop'){await pricesShot(page,`precios-busqueda-${language}`,1440);await pricesShot(page,`precios-busqueda-${language}`,390);await page.setViewportSize({width:1440,height:900});}

  // Comparison: Heredia ₡1190 < San José ₡1250 < (stale) Cartago ₡900.
  await result.click();
  const cmp=page.locator(`[data-price-comparison="${seed.rice}"]`);await expect(cmp).toBeVisible();
  const offers=cmp.locator('[data-price-offer]');
  await expect(offers).toHaveCount(3);
  expect(await offers.evaluateAll(els=>els.map(e=>e.getAttribute('data-price-offer')))).toEqual([seed.places.norte,seed.places.centro,seed.places.viejo]);
  const first=cmp.locator(`[data-price-offer="${seed.places.norte}"]`);
  await expect(first.locator('[data-price-unit]')).toContainText(t('por kg','per kg'));
  await expect(first.locator('[data-price-source]')).toContainText(t('Fuente: MEIC, estudio de precios','Source: MEIC price survey'));
  await expect(first.locator('[data-price-source]')).toContainText(`E2E-${seed.tag}`);
  // 2026-11-19 redesign: short labels — «Actualizado el», «Vigente hasta el» and the confidence badge; «Mejor precio» on the first.
  await expect(first.locator('[data-price-updated]')).toContainText(t('Actualizado el','Updated on'));
  await expect(first.locator('[data-price-staleness]')).toContainText(t('Vigente hasta el','Valid until'));
  await expect(first.locator('[data-price-confidence]')).toHaveText(t('Dato oficial','Official data'));
  await expect(first.locator('[data-price-best-label]')).toHaveText(t('Mejor precio','Best price'));
  await expect(cmp.locator('[data-price-best-label]')).toHaveCount(1);
  await expect(cmp.locator('[data-price-low30]')).toContainText(t('Precio más bajo en 30 días','Lowest price in 30 days'));
  await expect(cmp.locator('[data-price-low30]')).toContainText(en?'₡1,190':'₡1.190');
  await expect(cmp.locator('[data-price-history]')).toBeVisible();
  await expect(first.locator('[data-price-provenance] a')).toHaveAttribute('href',`https://example.invalid/e2e/${seed.tag}.csv`);
  const stale=cmp.locator(`[data-price-offer="${seed.places.viejo}"]`);
  await expect(stale).toHaveAttribute('data-price-stale','1');
  await expect(stale).toContainText(t('desactualizado','out of date'));
  await expect(stale.locator('[data-price-staleness]')).toContainText(t('Desactualizado: puede haber cambiado','Out of date: it may have changed'));
  await expect(cmp.locator('[data-price-region]')).toHaveCount(2);
  await expect(cmp.locator('[data-price-region="Heredia"]')).toContainText('1');
  await expectNoHorizontalOverflow(page);
  if(info.project.name==='chromium-desktop'){await pricesShot(page,`precios-resultados-${language}`,1440);await pricesShot(page,`precios-resultados-${language}`,390);await page.setViewportSize({width:1440,height:900});}

  // Sort by store name (alphabetical), then province filter.
  await Promise.all([page.waitForURL(/orden=place/),cmp.locator('[data-chip="place"]').click()]);
  // «Almacén Centro» before «Mercado Norte»; the out-of-date price stays last.
  expect(await page.locator('[data-price-offer]').evaluateAll(els=>els.map(e=>e.getAttribute('data-price-offer')))).toEqual([seed.places.centro,seed.places.norte,seed.places.viejo]);
  await gotoOK(page,`${prefix}/precios?producto=${seed.rice}&provincia=Heredia`);
  expect(await page.locator('[data-price-offer]').evaluateAll(els=>els.map(e=>e.getAttribute('data-price-offer')))).toEqual([seed.places.norte]);
  // ₡ range through the «Filtros» drawer of the comparison (2026-11-19): ≥ ₡1 200 keeps San José ₡1 250 only (the stale ₡900 is out too).
  await gotoOK(page,`${prefix}/precios?producto=${seed.rice}`);
  const range=page.locator('[data-price-range-form]');
  await expect(async()=>{if(!(await range.isVisible()))await page.locator('[data-dir-filters-button]').first().click();await expect(range).toBeVisible({timeout:1500});}).toPass({timeout:30000});
  await range.getByLabel(t('Precio mínimo (₡)','Minimum price (₡)')).fill('1200');
  await Promise.all([page.waitForURL(/precioMin=1200/),range.getByRole('button',{name:t('Aplicar filtros','Apply filters')}).click()]);
  expect(await page.locator('[data-price-offer]').evaluateAll(els=>els.map(e=>e.getAttribute('data-price-offer')))).toEqual([seed.places.centro]);
  await expect(page.locator('[data-price-range-note]')).toContainText(t('Rango de precio del producto','Product price range'));
  await gotoOK(page,`${prefix}/precios?producto=${seed.rice}&precioMax=1190`);
  expect(await page.locator('[data-price-offer]').evaluateAll(els=>els.map(e=>e.getAttribute('data-price-offer')))).toEqual([seed.places.norte,seed.places.viejo]);// the stale ₡900 stays, last and flagged
  await gotoOK(page,`${prefix}/precios?producto=${seed.rice}&precioMin=5000&precioMax=10`);
  await expect(page.getByRole('alert').filter({hasText:t('Revise la búsqueda','Please check your search')})).toHaveCount(1);

  // Pharmacies: the OTC product at every pharmacy (₡700 without a verified licence, ₡850 verified); the Rx product never
  // (search, barcode, direct URL).
  await gotoOK(page,`${prefix}/precios?producto=${seed.otc}&tipo=farmacias`);
  expect(await page.locator('[data-price-offer]').evaluateAll(els=>els.map(e=>e.getAttribute('data-price-offer')))).toEqual([seed.places.sinPermiso,seed.places.farmacia]);
  await expect(page.locator('[data-price-unit]')).toHaveCount(2);
  await expect(page.locator(`[data-price-offer="${seed.places.sinPermiso}"] [data-price-unit]`)).toContainText(t('por unidad','per unit'));
  await gotoOK(page,`${prefix}/precios?q=${encodeURIComponent(seed.rxName)}`);
  await expect(page.locator('[data-price-empty]')).toBeVisible();
  await gotoOK(page,`${prefix}/precios?producto=${seed.rx}`);
  await expect(page.locator('[data-price-comparison]')).toHaveCount(0);
  expect(await visibleHtml(page)).not.toContain(seed.rxName);
  // Invalid parameters are refused politely (no 500).
  await gotoOK(page,`${prefix}/precios?orden=pagado`);
  await expect(page.getByRole('alert').filter({hasText:t('Revise la búsqueda','Please check your search')})).toHaveCount(1);
  expect(errors()).toEqual([]);
 }finally{await fuel.restore();await seed.cleanup();}
 // After cleanup the synthetic product is no longer searchable.
 expect(((await db.rpc('public_price_search',{p_q:`arroz ${seed.tag}`,p_vertical:null,p_limit:5})).data as {items:unknown[]}).items).toEqual([]);
});
