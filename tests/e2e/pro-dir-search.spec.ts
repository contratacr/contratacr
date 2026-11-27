import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,origin} from './pro-round2-fixture';
import {dirDb,hideSeededPlaces,label,seedPlace,syntheticFuelSet,uid} from './pro-dir-fixture';
import {ordenFinal,type SearchFiltersResolved,type SearchResult} from '@/lib/search/query-core';

// 2026-11-19: the places sections use the /profesionales layout; the complete GET form lives in the «Filtros» drawer
// (chip next to the title on desktop, in the results sheet on phones). Open it before using a field.
async function openFilters(page:import('playwright/test').Page){const form=page.locator('form[role="search"]');if(await form.isVisible())return;
 const b=page.locator('[data-dir-filters-button]').filter({visible:true}).first();
 await expect(async()=>{if(!(await form.isVisible()))await b.click();await expect(form).toBeVisible({timeout:1500});}).toPass({timeout:30000});}


// Multivertical F6 + F0 (LOCAL Pro): public section pages /restaurantes, /farmacias, /supermercados, /gasolineras with
// the shared search (plain GET filters), the national fuel banner, the search/facets APIs (public data only) and the
// public «Cómo ordenamos» page. Owner of those pages and of /api/directorio/* in verify-app-surface-ownership.mjs.
const SECTIONS=[['restaurantes','restaurant','Restaurantes en Costa Rica','Restaurants in Costa Rica'],['supermercados','grocery','Supermercados en Costa Rica','Supermarkets in Costa Rica'],
 ['gasolineras','fuel','Gasolineras en Costa Rica','Fuel stations in Costa Rica'],['farmacias','pharmacy','Farmacias en Costa Rica','Pharmacies in Costa Rica']] as const;

test.afterEach(()=>hideSeededPlaces());

for(const language of ['es','en'] as const)test(`F6: section pages, filters and pharmacy licence status [${language}]`,async({page},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const en=language==='en',prefix=en?'/en':'',db=dirDb(),tag=label(),errors=collectPageErrors(page),phone=(page.viewportSize()?.width??1280)<1024;
 const names:Record<string,string>={};
 for(const [section,vertical] of SECTIONS){
  names[section]=`E2E ${section} ${tag}`;
  await seedPlace(db,{slug:`e2e-${section}-${tag}`,vertical,name:names[section]!,adminArea1:'Heredia',adminArea2:'Heredia',locality:'Heredia',phone:'+506 2260 0001'},{license:vertical==='pharmacy'});
 }
 await seedPlace(db,{slug:`e2e-farmacia-sin-permiso-${tag}`,vertical:'pharmacy',name:`E2E farmacia sin permiso ${tag}`,adminArea1:'Heredia'});
 for(const [section,,es,english] of SECTIONS){
  await gotoOK(page,`${prefix}/${section}?q=${encodeURIComponent('E2E '+section+' '+tag)}&province=Heredia`);
  await expect(page.getByRole('heading',{level:1})).toHaveText(en?english:es);
  await expect(page.locator(`[data-search-item="p:e2e-${section}-${tag}"]`)).toBeVisible();
  // 2026-11-19: /profesionales layout; no order/disclaimer notes on the results screen (they live in the Terms 13.1).
  await expect(page.locator(`[data-places-home="${section}"]`)).not.toContainText(en?'never depends on payment':'nunca depende de pagos');
  await expect(page.locator('[data-unverified-notice]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  // 0bc09b683 (owner 2026-11-26): phones have no «Filtros» button (the location lives in the search); computers keep it.
  if(phone)await expect(page.locator('[data-dir-filters-button]').filter({visible:true})).toHaveCount(0);
  else{await openFilters(page);await expect(page.locator('form[role="search"]')).toBeVisible();}
 }
 // Owner decision 2026-11-17: every pharmacy is shown. Without a verified licence: a neutral note; verified: the badge.
 await gotoOK(page,`${prefix}/farmacias?q=${encodeURIComponent('E2E farmacia sin permiso '+tag)}`);
 const unlicensed=page.locator(`[data-search-item="p:e2e-farmacia-sin-permiso-${tag}"]`);
 await expect(unlicensed).toBeVisible();
 // Owner decision 2026-11-27: no permit chip on result cards; the permit lives only on the place page (Información).
 await expect(unlicensed.locator('[data-pharmacy-license]')).toHaveCount(0);
 await gotoOK(page,`${prefix}/farmacias?q=${encodeURIComponent(names.farmacias!)}&province=Heredia`);
 await expect(page.locator(`[data-search-item="p:e2e-farmacias-${tag}"]`)).toBeVisible();
 await expect(page.locator(`[data-search-item="p:e2e-farmacias-${tag}"] [data-pharmacy-license]`)).toHaveCount(0);
 // Filters are a plain GET form: choosing another province empties the result.
 if(phone)await gotoOK(page,`${prefix}/restaurantes?q=${encodeURIComponent(names.restaurantes!)}&province=${encodeURIComponent('Limón')}`);
 else{
  await gotoOK(page,`${prefix}/restaurantes?q=${encodeURIComponent(names.restaurantes!)}`);
  await openFilters(page);
  await page.locator('form[role="search"]').getByLabel(en?'Province':'Provincia').fill('Limón');
  await page.getByRole('button',{name:en?'Apply filters':'Aplicar filtros'}).click();
  await expect(page).toHaveURL(/province=Lim/);
 }
 await expect(page.locator(`[data-search-item="p:e2e-restaurantes-${tag}"]`)).toHaveCount(0);
 await expect(page.getByRole('status')).toContainText(en?'No results':'No encontramos resultados');
 // Invalid filters answer with a message, never an error page.
 await gotoOK(page,`${prefix}/restaurantes?openNow=maybe`);
 await expect(page.locator('[data-search-problem="invalid"]')).toBeVisible();
 expect(errors()).toEqual([]);
});

test('F6: national ARESEP fuel price banner on /gasolineras',async({page},info)=>{
 test.setTimeout(180000);local(info.project.use.baseURL);
 const db=dirDb(),staff=uid(),year=new Date().getFullYear();
 for(const [slug,name] of [['fuel-regular','Gasolina regular'],['fuel-super','Gasolina súper'],['fuel-diesel','Diésel']] as const){
  // Never rename the real items loaded by import-aresep-fuel.mjs: create them only when missing.
  if((await db.from('price_items').select('slug').eq('slug',slug).maybeSingle()).data)continue;
  const r=await db.rpc('price_item_upsert',{p_actor:staff,p_input:{actionId:uid(),slug,kind:'fuel',name,unitBase:'l',unitQty:1}});
  if(r.error&&r.error.code!=='22023')throw r.error;// 22023 = item already exists with other fields (shared local DB)
 }
 // Synthetic set (short validity); restore() takes it down and puts back the official set that was current before.
 const ref=`RE-${String(Math.floor(Math.random()*9000)+1000)}-IE-${year}`;
 const restore=await syntheticFuelSet(db,staff,ref,[{itemSlug:'fuel-regular',price:701.5},{itemSlug:'fuel-super',price:722.25},{itemSlug:'fuel-diesel',price:655}]);
 try{
  await gotoOK(page,'/gasolineras');
  const banner=page.locator('[data-national-fuel]');
  await expect(banner).toContainText('ARESEP');await expect(banner).toContainText(ref);
  await expect(banner.locator('[data-price-item="fuel-regular"]')).toContainText('701,5');
  await gotoOK(page,'/en/gasolineras');
  await expect(page.locator('[data-national-fuel]')).toContainText('the same at every station');
 }finally{await restore();}
 await gotoOK(page,'/gasolineras');
 // Without an official set in the local database the banner is gone altogether; with one it must not show the synthetic reference.
 await expect(page.locator('[data-national-fuel]').filter({hasText:ref})).toHaveCount(0);
});

test('F6: search and facets APIs expose public data only',async({request},info)=>{
 test.setTimeout(120000);local(info.project.use.baseURL);
 const db=dirDb(),tag=label(),slug=`e2e-api-${tag}`;
 await seedPlace(db,{slug,vertical:'restaurant',name:`Soda API ${tag}`,phone:'+506 2200 0099'});
 const s=await request.get(`${origin}/api/directorio/search?vertical=restaurantes&q=${encodeURIComponent('Soda API '+tag)}`);
 expect(s.status()).toBe(200);const body=await s.json() as {items:{key:string;ranking_reason:string[]}[]};
 expect(body.items.map(i=>i.key)).toContain('p:'+slug);
 const raw=JSON.stringify(body);for(const k of ['placeId','place_id','seller_profile_id','is_featured','pro_memberships','revision'])expect(raw).not.toContain(k);
 const f=await request.get(`${origin}/api/directorio/facets?vertical=restaurantes`);expect(f.status()).toBe(200);
 expect((await request.get(`${origin}/api/directorio/search?vertical=barcos`)).status()).toBe(400);
 // Price sorts exist where prices apply (2026-11-17), never at fuel stations; pharmacies need a product.
 expect((await request.get(`${origin}/api/directorio/search?vertical=gasolineras&sort=price_asc`)).status()).toBe(400);
 expect((await request.get(`${origin}/api/directorio/search?vertical=gasolineras&priceMin=1`)).status()).toBe(400);
 expect((await request.get(`${origin}/api/directorio/search?vertical=farmacias&sort=price_asc`)).status()).toBe(400);
 expect((await request.get(`${origin}/api/directorio/search?vertical=restaurantes&sort=price_asc&limit=1`)).status()).toBe(200);
});

test('F0: featured flag never changes the professional order',()=>{
 const c=(id:string,fields:Partial<SearchResult>)=>({id,ratingAvg:4.5,reviewCount:8,verificationStatus:'verified',isFeatured:false,...fields}) as SearchResult;
 const filters={sortBy:'rating'} as SearchFiltersResolved;
 expect(ordenFinal([c('plain',{}),c('featured',{isFeatured:true})],filters).map(p=>p.id)).toEqual(['plain','featured']);
 expect(ordenFinal([c('featured',{isFeatured:true}),c('plain',{})],filters).map(p=>p.id)).toEqual(['featured','plain']);
});

for(const language of ['es','en'] as const)test(`F0: public «Cómo ordenamos» page [${language}]`,async({page},info)=>{
 test.setTimeout(120000);local(info.project.use.baseURL);
 const en=language==='en',errors=collectPageErrors(page);
 await gotoOK(page,(en?'/en':'')+'/como-ordenamos');
 await expect(page.getByRole('heading',{level:1})).toHaveText(en?'How we rank results':'Cómo ordenamos los resultados');
 await expect(page.locator('[data-rank-section="pagos"]')).toContainText(en?'No payment, Pro plan':'Ningún pago, plan Pro');
 // Classified listings are OFF by owner decision: their ranking paragraphs are not shown.
 await expect(page.locator('[data-rank-section="directorio"]')).not.toContainText(en?'editing a listing':'editar un anuncio');
 await expect(page.locator('[data-rank-section="directorio"]')).toContainText(en?'never shows prices of prescription medicines':'nunca muestra precios de medicamentos que requieren receta');
 await expectNoHorizontalOverflow(page);
 expect(errors()).toEqual([]);
});
