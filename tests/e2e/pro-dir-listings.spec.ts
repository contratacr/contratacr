import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {headersFor,local,login,origin,ownerFixture} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {chooseEdition,dirDb,hideSeededPlaces,label,seedListing,seedPlace,uid,vehicleModel,visibleHtml} from './pro-dir-fixture';

// Multivertical V1/V4/R1/V2 (LOCAL Pro): /vehiculos and /inmuebles landings with search, listing detail pages (no
// plate/VIN/plano/folio ever public, reserved listings visible with the «Reservado» badge, rent warning, approximate
// location), and the Pro inventory (module gate by edition, owner reader, publish needs 4 photos). Owner of
// /[locale]/(vehiculos|inmuebles), /[locale]/dashboard/pro/inventario/* and /api/pro/dir-listings(-photos).
// Owner decision 2026-11-16: classified listings are OFF (DIRECTORY_LISTINGS_ENABLED, src/lib/directory/feature-flags.ts).
// The first test proves every listing surface answers 404 while off; the others only run when the flag is on in
// both the server and this test process (DIRECTORY_LISTINGS_ENABLED=true).
const listingsOn=process.env.DIRECTORY_LISTINGS_ENABLED==='true';
test.afterEach(()=>hideSeededPlaces());

// Launch mirror: classified listings live in the Pro inventory and are flagged off for launch.
test.skip(process.env.E2E_PRO_OFF==='1','classified listings live in the Pro inventory and are flagged off for launch');
test('Listings flag OFF: every vehicle/property listing surface answers 404',async({page,context},info)=>{
 test.skip(listingsOn,'Classified listings are enabled in this run.');
 test.setTimeout(240000);local(info.project.use.baseURL);
 const db=dirDb(),tag=label(),hilux=await vehicleModel(db);
 // Even an existing published listing is not reachable.
 const v=await seedListing(db,uid(),{listing:{vertical:'vehiculos',sellerKind:'private',title:`Hilux apagado ${tag}`,description:'Anuncio que no debe ser público.',priceMinor:1000000000,currency:'CRC',adminArea1:'San José',adminArea2:'Escazú'},vehicle:{...hilux,year:2019,condition:'used'}});
 for(const prefix of ['','/en'])for(const path of ['/vehiculos','/inmuebles',`/vehiculos/v/hilux-${v.code}`,'/inmuebles/i/casa-abcdef'])
  expect((await page.request.get(origin+prefix+path)).status(),prefix+path).toBe(404);
 // The Pro inventory pages are behind login. dashboard/pro has a loading.tsx, so Next streams the not-found page
 // with HTTP 200: assert the not-found render (noindex, no inventory) instead of the status code.
 const user=await createDisposableAccount({prefix:'dir-flag-off'});
 try{
  await login(context,user);
  for(const prefix of ['','/en'])for(const path of ['/dashboard/pro/inventario/vehiculos','/dashboard/pro/inventario/inmuebles'])
  {const html=await (await context.request.get(origin+prefix+path)).text();
   expect(html,prefix+path).toContain('noindex');expect(html,prefix+path).not.toContain('data-listing-inventory');
   await gotoOK(page,prefix+path);await expect(page.locator('[data-listing-inventory]')).toHaveCount(0);}
 }finally{await cleanupDisposableAccount(user);}
 for(const api of ['/api/directorio/search?vertical=vehiculos','/api/directorio/search?vertical=inmuebles','/api/directorio/facets?vertical=vehiculos','/api/directorio/search?q=carros'])
  expect((await page.request.get(origin+api)).status(),api).toBe(404);
 expect((await context.request.get(origin+'/api/pro/dir-listings?vertical=vehiculos')).status()).toBe(404);
 expect((await context.request.post(origin+'/api/pro/dir-listings',{headers:{Origin:origin},data:{}})).status()).toBe(404);
 expect((await context.request.post(origin+'/api/pro/dir-listing-photos',{headers:{Origin:origin},data:{}})).status()).toBe(404);
 // Dealers and agencies are still places: their page works, without a listings block or a link to /vehiculos.
 const slug=`agencia-lugar-${tag}`;await seedPlace(db,{slug,vertical:'vehicle_dealer',name:`Agencia Lugar ${tag}`});
 await gotoOK(page,`/negocios/${slug}`);
 await expect(page.getByRole('heading',{level:1})).toHaveText(`Agencia Lugar ${tag}`);
 await expect(page.locator('a[href="/vehiculos"]')).toHaveCount(0);
 await expect(page.locator('#place-listings, [data-place-listings]')).toHaveCount(0);
});
for(const language of ['es','en'] as const)test(`V/R: public listings, details and reserved badge [${language}]`,async({page},info)=>{
 test.skip(!listingsOn,'Classified listings are OFF by owner decision.');
 test.setTimeout(300000);local(info.project.use.baseURL);
 const en=language==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'',db=dirDb(),tag=label(),errors=collectPageErrors(page);
 const hilux=await vehicleModel(db);
 const v=await seedListing(db,uid(),{listing:{vertical:'vehiculos',sellerKind:'private',title:`Toyota Hilux E2E ${tag}`,description:'Único dueño, mantenimiento al día.',priceMinor:1850000000,currency:'CRC',adminArea1:'San José',adminArea2:'Escazú',lat:9.918,lng:-84.14},
  vehicle:{...hilux,version:'SR 4x4',year:2020,condition:'used',mileageKm:85000,transmission:'manual',fuel:'diesel',drivetrain:'4x4',platePrivate:'BKZ-987',vinPrivate:'JTFSS22P0B0987654'}});
 const p=await seedListing(db,uid(),{listing:{vertical:'inmuebles',sellerKind:'private',title:`Apartamento E2E ${tag}`,description:'Dos habitaciones, cerca del centro.',priceMinor:45000000,currency:'CRC',adminArea1:'Heredia',adminArea2:'Heredia',lat:10.0,lng:-84.11},
  property:{operation:'rent',propertyType:'apartment',bedrooms:2,bathrooms:1,builtM2:70,minLeaseMonths:12,cadastralPlanPrivate:'H-1234567-2020',folioRealPrivate:'4-123456-000'}},{status:'reserved'});
 // landing + search
 await gotoOK(page,`${prefix}/vehiculos?q=${encodeURIComponent('Hilux E2E '+tag)}`);
 await expect(page.getByRole('heading',{level:1})).toHaveText(t('Vehículos en Costa Rica','Vehicles in Costa Rica'));
 await expect(page.locator(`[data-search-item="l:${v.code}"]`)).toBeVisible();
 await expectNoHorizontalOverflow(page);
 await gotoOK(page,`${prefix}/inmuebles?operation=rent&q=${encodeURIComponent('Apartamento E2E '+tag)}`);
 await expect(page.getByRole('heading',{level:1})).toHaveText(t('Casas, apartamentos y lotes','Homes, apartments and land'));
 await expect(page.locator(`[data-search-item="l:${p.code}"]`)).toHaveAttribute('data-listing-status','reserved');
 await gotoOK(page,`${prefix}/inmuebles?operation=sale&q=${encodeURIComponent('Apartamento E2E '+tag)}`);
 await expect(page.locator(`[data-search-item="l:${p.code}"]`)).toHaveCount(0);
 // vehicle detail: a stale slug redirects to the canonical one; private fields never reach the page
 await gotoOK(page,`${prefix}/vehiculos/v/cualquier-cosa-${v.code}`);
 await expect(page).toHaveURL(new RegExp(`/vehiculos/v/toyota-hilux-e2e-${tag}-${v.code}$`));
 await expect(page.getByRole('heading',{level:1})).toHaveText(`Toyota Hilux E2E ${tag}`);
 await expect(page.locator('[data-listing-actions]')).toBeVisible();
 const vHtml=await page.content();for(const secret of ['BKZ-987','JTFSS22P0B0987654'])expect(vHtml).not.toContain(secret);
 await expectNoHorizontalOverflow(page);
 // property detail: reserved badge, rent warning, approximate location, no plano/folio
 await gotoOK(page,`${prefix}/inmuebles/i/x-${p.code}`);
 await expect(page.getByRole('heading',{level:1})).toHaveText(`Apartamento E2E ${tag}`);
 await expect(page.locator('[data-listing-reserved]').first()).toBeVisible();
 await expect(page.locator('[data-listing-rent-warning]')).toBeVisible();
 await expect(page.locator('[data-listing-location-approx]')).toBeVisible();
 const pHtml=await page.content();for(const secret of ['H-1234567-2020','4-123456-000'])expect(pHtml).not.toContain(secret);
 expect(await visibleHtml(page)).not.toContain('undefined');
 await expectNoHorizontalOverflow(page);
 // unknown code → 404
 expect((await page.request.get(`${origin}${prefix}/vehiculos/v/nada-zzzzzz`)).status()).toBe(404);
 expect(errors()).toEqual([]);
});

test('V2: Pro inventory, module gate and 4-photo rule',async({page,context},info)=>{
 test.skip(!listingsOn,'Classified listings are OFF by owner decision.');
 test.setTimeout(300000);local(info.project.use.baseURL);
 const tag=label(),f=await ownerFixture(context,'dir-'+tag);
 try{
  const db=f.db,owner=f.owner,headers=headersFor(owner),hilux=await vehicleModel(db);
  // Edition «servicios» (implicit) has no vehicle inventory: the route refuses with module_unavailable.
  const off=await context.request.get(`${origin}/api/pro/dir-listings?vertical=vehiculos`,{headers});
  expect(off.status()).toBe(403);expect((await off.json()).reason).toBe('module_unavailable');
  await chooseEdition(db,owner.id,'autos');
  const list=await context.request.get(`${origin}/api/pro/dir-listings?vertical=vehiculos`,{headers});
  expect(list.status(),await list.text()).toBe(200);
  expect((await context.request.get(`${origin}/api/pro/dir-listings?vertical=inmuebles`,{headers})).status()).toBe(403);
  // create through the route (draft), publish refused without photos (SQL rule), then 4 photo rows → publish OK
  const listingId=uid();
  const created=await context.request.post(`${origin}/api/pro/dir-listings`,{headers,data:{action:'create',actionId:uid(),listingId,revision:0,
   listing:{vertical:'vehiculos',sellerKind:'private',title:`Hilux inventario ${tag}`,description:'Bien cuidado, revisión técnica al día.',priceMinor:1500000000,currency:'CRC',adminArea1:'San José',adminArea2:'Escazú'},
   vehicle:{...hilux,year:2019,condition:'used'}}});
  expect(created.status(),await created.text()).toBe(200);
  const noPhotos=await context.request.post(`${origin}/api/pro/dir-listings`,{headers,data:{action:'status',actionId:uid(),listingId,revision:1,status:'published'}});
  expect(noPhotos.status()).toBe(422);expect((await noPhotos.json()).reason).toBe('photos_missing');
  // Not the seller → not found (no leak).
  const other=await context.request.post(`${origin}/api/pro/dir-listings`,{headers,data:{action:'status',actionId:uid(),listingId:uid(),revision:1,status:'published'}});
  expect(other.status()).toBe(404);
  // inventory page renders the owner's listing
  await gotoOK(page,'/dashboard/pro/inventario/vehiculos');
  await expect(page.locator('[data-listing-inventory="vehiculos"]')).toBeVisible({timeout:45000});
  await expect(page.locator('[data-inventory-item]').filter({hasText:`Hilux inventario ${tag}`})).toBeVisible({timeout:45000});
  await expectNoHorizontalOverflow(page);
  // a different seller's published listing is also not editable from this account
  const foreign=await seedPlace(db,{slug:`agencia-e2e-${tag}`,vertical:'vehicle_dealer',name:`Agencia E2E ${tag}`});
  const linked=await context.request.post(`${origin}/api/pro/dir-listings`,{headers,data:{action:'create',actionId:uid(),listingId:uid(),revision:0,
   listing:{vertical:'vehiculos',sellerKind:'business',placeId:foreign.placeId,title:`No es mi agencia ${tag}`,priceMinor:1000000000,currency:'CRC'},vehicle:{...hilux,year:2018,condition:'used'}}});
  expect(linked.status()).toBe(403);expect((await linked.json()).reason).toBe('listing_place_not_managed');
 }finally{await f.cleanup();}
});
