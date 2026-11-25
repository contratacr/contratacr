import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,origin} from './pro-round2-fixture';
import {openPlaceTab, dirDb,hideSeededPlaces,label,seedPlace} from './pro-dir-fixture';
import {PLACE_SECTIONS} from '@/lib/directory/place-verticals';

// 2026-11-19: the places sections use the /profesionales layout; the complete GET form lives in the «Filtros» drawer
// (chip next to the title on desktop, in the results sheet on phones). Open it before using a field.
async function openFilters(page:import('playwright/test').Page){const form=page.locator('form[role="search"]');if(await form.isVisible())return;
 const b=page.locator('[data-dir-filters-button]').filter({visible:true}).first();
 await expect(async()=>{if(!(await form.isVisible()))await b.click();await expect(form).toBeVisible({timeout:1500});}).toPass({timeout:30000});}


// Owner approval 2026-11-17 (LOCAL Pro): the eleven new place sections /cafes, /pulperias, /ferreterias, /hospedaje,
// /salud, /veterinarias, /talleres, /belleza, /gimnasios, /tours, /bancos. Owner of those pages in
// verify-app-surface-ownership.mjs. Checks: every listing loads with search, province + type chips and the kind label;
// the imported cafés moved out of /restaurantes (same slug, history kept); banks show no prices (no price filter or
// price order, no price reports, claim still possible) and, since the owner decision of 2026-11-17, accept reviews about
// service only (visible note, no rates/financial advice; claim benefits without anything price-related); health/vet places carry the neutral permit line
// and the review-scope note; price filters only where prices apply.
// Health exists only with DIR_HEALTH_ENABLED (off by default in a production build): read the server's own flag from
// /salud (200 on, 404 off; same probe as pro-dir-events) instead of a manual env var. Off → /salud, /en/salud and a
// health place page must answer 404 and the health assertions are skipped.
async function healthEnabled(page:import('playwright/test').Page){
 const status=(await page.request.get(`${origin}/salud`,{maxRedirects:0})).status();expect([200,404],'/salud status').toContain(status);return status===200;}

test.afterEach(()=>hideSeededPlaces());

for(const language of ['es','en'] as const)test(`new sections: listings, type chips, kind labels and price modes [${language}]`,async({page},info)=>{
 test.setTimeout(420000);local(info.project.use.baseURL);
 const en=language==='en',prefix=en?'/en':'',db=dirDb(),tag=label(),errors=collectPageErrors(page);
 const healthOn=await healthEnabled(page);
 if(!healthOn)expect((await page.request.get(`${origin}${prefix}/salud`,{maxRedirects:0})).status(),'health listing while DIR_HEALTH_ENABLED is off').toBe(404);
 for(const s of PLACE_SECTIONS.filter(x=>x.added&&(healthOn||x.section!=='salud'))){
  const kind=s.kinds[0]!;
  await seedPlace(db,{slug:`e2e-${s.section}-${tag}`,vertical:s.id,name:`E2E ${s.section} ${tag}`,adminArea1:'Heredia',adminArea2:'Heredia',locality:'Heredia',attributes:{kind:kind.value}});
  await gotoOK(page,`${prefix}/${s.section}`);
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  // 2026-11-19: the kind filter is a «Tipo» chip menu next to the title (desktop) and a field of the filters drawer.
  const tipo=page.locator('[data-chip-menu="kind"] > button').filter({visible:true});
  if(await tipo.count()){await expect(async()=>{if((await tipo.getAttribute('aria-expanded'))!=='true')await tipo.click();
   await expect(page.locator(`[data-chip="kind-${kind.value}"]`)).toBeVisible({timeout:1500});}).toPass({timeout:30000});await page.keyboard.press('Escape');}
  await openFilters(page);
  await expect(page.locator('form[role="search"]')).toBeVisible();
  await expect(page.locator(`form[role="search"] select[name="kind"] option[value="${kind.value}"]`)).toHaveCount(1);
  expect(await page.locator('[data-search-item]').count(),`${s.section} lists imported places`).toBeGreaterThan(0);
  await expect(page.locator('[data-search-item] [data-place-kind]').first()).toBeVisible();
  // Price filter only where prices apply (menu: cafes; product: pulperías, ferreterías, veterinarias).
  if(s.priceMode)await expect(page.locator(`[data-price-filters="${s.priceMode}"]`)).toBeVisible();
  else{await expect(page.locator('[data-price-filters]')).toHaveCount(0);
   await expect(page.locator('select[name="sort"] option[value="price_asc"]')).toHaveCount(0);}
  await gotoOK(page,`${prefix}/${s.section}?q=${encodeURIComponent(`E2E ${s.section} ${tag}`)}&province=Heredia&kind=${kind.value}`);
  const card=page.locator(`[data-search-item="p:e2e-${s.section}-${tag}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator(`[data-place-kind="${kind.value}"]`)).toContainText(en?kind.en:kind.es);
  await expectNoHorizontalOverflow(page);
 }
 // The kind filter really filters: another kind hides the seeded café.
 await gotoOK(page,`${prefix}/cafes?q=${encodeURIComponent(`E2E cafes ${tag}`)}&kind=bar`);
 await expect(page.locator(`[data-search-item="p:e2e-cafes-${tag}"]`)).toHaveCount(0);
 // API mirrors the page: unknown kind or a price order at banks are refused; cafés sort by menu price.
 for(const [q,status] of [['vertical=bancos&sort=price_asc',400],['vertical=salud&priceMin=1',400],['vertical=cafes&kind=clinic',400],['vertical=cafes&sort=price_asc',200],['vertical=ferreterias&sort=price_asc',400],['vertical=ferreterias&product=cemento',200]] as const){
  const r=await page.request.get(`${origin}/api/directorio/search?${q}`);expect(r.status(),q).toBe(status);}
 expect(errors()).toEqual([]);
});

for(const language of ['es','en'] as const)test(`cafés moved out of restaurants; banks map-only; health permit and review note [${language}]`,async({page},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const en=language==='en',prefix=en?'/en':'',db=dirDb(),tag=label(),errors=collectPageErrors(page);
 // A café imported from OpenStreetMap as a restaurant and moved by reference (dir_import_reclassify). The local stack has
 // no real OSM seed, so the test imports its own synthetic restaurant and moves it, exactly like the production import does.
 // History row written by the move: before restaurant → after cafe_bar (same place id and slug).
 const cafeSlug=`e2e-cafe-${tag}`,cafeName=`E2E Café ${tag}`;
 await seedPlace(db,{slug:cafeSlug,vertical:'restaurant',name:cafeName,adminArea1:'Heredia'});
 const move=await db.rpc('dir_import_reclassify',{p_actor:crypto.randomUUID(),p_input:{actionId:crypto.randomUUID(),sourceId:'osm',from:'restaurant',to:'cafe_bar',rows:[{ref:`node/e2e-${cafeSlug}`,attributes:{kind:'cafe'}}]}});
 expect(move.error,'reclassify the imported café').toBeNull();
 expect((move.data as {moved:number}).moved,'one place moved').toBe(1);
 const cafe=(await db.from('dir_places').select('id,slug,name,vertical_id,status').eq('slug',cafeSlug).eq('vertical_id','cafe_bar').eq('status','published').limit(1)).data?.[0];
 expect(cafe,'a moved café exists').toBeTruthy();
 const prov=await db.from('dir_field_provenance').select('source_id,source_ref').eq('place_id',cafe!.id).eq('field','vertical').order('id',{ascending:false}).limit(1);
 expect(prov.data?.[0]?.source_id,'move recorded with the OSM source').toBe('osm');
 const hist=await db.from('dir_place_history').select('before,after').eq('place_id',cafe!.id).order('id',{ascending:false}).limit(5);
 expect((hist.data??[]).some(h=>(h.before as {vertical?:string}|null)?.vertical==='restaurant'&&(h.after as {vertical?:string}).vertical==='cafe_bar'),'history before/after').toBe(true);
 await gotoOK(page,`${prefix}/cafes?q=${encodeURIComponent(cafe!.name as string)}`);
 await expect(page.locator(`[data-search-item="p:${cafe!.slug}"]`)).toBeVisible();
 await gotoOK(page,`${prefix}/restaurantes?q=${encodeURIComponent(cafe!.name as string)}`);
 await expect(page.locator(`[data-search-item="p:${cafe!.slug}"]`)).toHaveCount(0);
 await gotoOK(page,`${prefix}/lugar/${cafe!.slug}`);
 await expect(page.getByRole('navigation',{name:en?'Breadcrumb':'Ruta de navegación'}).getByRole('link',{name:en?'Cafés, bakeries and bars':'Cafés, panaderías y bares'})).toHaveAttribute('href',`${prefix}/cafes`);

 // Banks: map points only.
 await seedPlace(db,{slug:`e2e-banco-${tag}`,vertical:'banking',name:`E2E Banco ${tag}`,adminArea1:'Heredia',attributes:{kind:'bank',atm:true}});
 await gotoOK(page,`${prefix}/bancos`);
 // 2026-11-19: the policy notes are not on the results screen or the place page; they live in the Terms (13.1).
 await expect(page.locator('[data-places-home="bancos"]')).not.toContainText(en?'does not compare rates':'no compara tasas');
 await gotoOK(page,`${prefix}/lugar/e2e-banco-${tag}`);await openPlaceTab(page,'reviews');
 await expect(page.locator('[data-place-map-only]')).toHaveCount(0);
 await expect(page.locator('[data-place-reviews]')).toBeVisible();// service reviews (2026-11-17)
 await expect(page.locator('[data-place-review-note]')).toContainText(en?'not about rates, fees, financial products':'No tratan sobre tasas, comisiones, productos financieros');
 await expect(page.locator('[data-place-price-report]')).toHaveCount(0);
 await expect(page.locator('[data-place-claim-link]')).toBeVisible();// the business can still claim and fix its listing
 await gotoOK(page,`${prefix}/lugar/e2e-banco-${tag}/reclamar`);// 2026-11-19: the claim flow and its benefits have their own page
 await expect(page.locator('[data-place-claim]')).toBeVisible();
 await expect(page.locator('[data-claim-benefits]')).not.toContainText(en?'prices':'precios');
 await expect(page.locator('[data-claim-benefits]')).not.toContainText(en?'menu':'menú');
 // Without an account a review still needs a contact from this device first (same rule as every place).
 const review=await page.request.post(`${origin}/api/lugar/e2e-banco-${tag}/resenas`,{data:{actionId:crypto.randomUUID(),rating:5,comment:'Muy buen banco',authorName:'Ana'}});
 expect(review.status(),'guest review without contact').toBe(403);

 // Health: neutral permit line on card and page, review-scope note, no consultation prices.
 await seedPlace(db,{slug:`e2e-clinica-${tag}`,vertical:'health',name:`E2E Clínica ${tag}`,adminArea1:'Heredia',attributes:{kind:'clinic',publicService:true}});
 if(!(await healthEnabled(page))){
  expect((await page.request.get(`${origin}${prefix}/salud`,{maxRedirects:0})).status(),'health listing while DIR_HEALTH_ENABLED is off').toBe(404);
  expect((await page.request.get(`${origin}${prefix}/lugar/e2e-clinica-${tag}`,{maxRedirects:0})).status(),'health place while DIR_HEALTH_ENABLED is off').toBe(404);
 }else{
 await gotoOK(page,`${prefix}/salud?q=${encodeURIComponent(`E2E Clínica ${tag}`)}`);
 const card=page.locator(`[data-search-item="p:e2e-clinica-${tag}"]`);
 await expect(card.locator('[data-health-permit="unverified"]')).toHaveText(en?'Permit not verified by ContrataCR':'Habilitación sin verificar por ContrataCR');
 await expect(card.locator('[data-public-service]')).toBeVisible();
 await expect(page.locator('[data-places-home="salud"]')).not.toContainText(en?'medical or veterinary advice':'no da consejo médico');
 await gotoOK(page,`${prefix}/lugar/e2e-clinica-${tag}`);
 await expect(page.locator('[data-health-permit="unverified"]')).toContainText(en?'Permit not verified by ContrataCR.':'Habilitación sin verificar por ContrataCR.');
 await openPlaceTab(page,'reviews');await expect(page.locator('[data-place-review-note]')).toContainText(en?'attention and service':'la atención y el servicio');
 await expect(page.locator('[data-place-price-report]')).toHaveCount(0);
 }
 // Lodging: no ICT declaratoria claimed.
 await seedPlace(db,{slug:`e2e-hotel-${tag}`,vertical:'lodging',name:`E2E Hotel ${tag}`,adminArea1:'Heredia',attributes:{kind:'hotel'}});
 await gotoOK(page,`${prefix}/lugar/e2e-hotel-${tag}`);
 await expect(page.locator('[data-place-tourism-note]')).toHaveCount(0);
 await expectNoHorizontalOverflow(page);
 // Where those notes went: the Terms, section 13.1 «Directorio de lugares y negocios», with the ranking page one tap away.
 await gotoOK(page,`${prefix}/terminos`);
 const terms=page.locator('#'+(en?'directory':'directorio'));
 for(const text of en?['does not compare rates','gives no medical or veterinary advice','ICT tourism declaration','prescription medicines']:['no compara tasas','no da consejo médico','declaratoria turística del ICT','requieren receta médica'])await expect(terms).toContainText(text);
 await expect(terms.getByRole('link',{name:en?'How we rank results':'Cómo ordenamos los resultados'})).toHaveAttribute('href',`${prefix}/como-ordenamos`);
 expect(errors()).toEqual([]);
});
