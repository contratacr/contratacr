import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,login,origin} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {dirDb,hideSeededPlaces,label,postJson,seedPlace,uid} from './pro-dir-fixture';
import {opsShot,retireItems,seedItem} from './pro-dir-ops-fixture';

// Multivertical M1 (LOCAL Pro): «Reportar un precio» on a place page. Signed in only; catalogue items allowed for the
// vertical, never prescription medicines (Decreto 36868-S) nor fuel; a single report stays pending (not public); two
// independent matching reports become «Reportado por usuarios · confirmado por varias personas» with their date.
// Owner of /api/lugar/[slug]/precios/reporte.
test.afterEach(()=>hideSeededPlaces());
const crDay=(offsetDays=0)=>new Date(Date.now()+offsetDays*86400e3).toLocaleDateString('en-CA',{timeZone:'America/Costa_Rica'});

for(const language of ['es','en'] as const)test(`M1: user price report, Rx refused, confirmation by a second person [${language}]`,async({page,context,browser},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const en=language==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'',db=dirDb(),tag=label(),slug=`farmacia-precio-${tag}`;
 const place=await seedPlace(db,{slug,vertical:'pharmacy',name:`Farmacia Precio ${tag}`},{license:true});
 await seedPlace(db,{slug:`bomba-${tag}`,vertical:'fuel',name:`Bomba ${tag}`});
 const otc=`acetaminofen-ops-${tag}`,rx=`amoxicilina-ops-${tag}`,rice=`arroz-pr-${tag}`;
 await seedItem(db,place.staff,otc,`Acetaminofén ${tag}`,'medicine',false);await seedItem(db,place.staff,rx,`Amoxicilina ${tag}`,'medicine',true);await seedItem(db,place.staff,rice,`Arroz ${tag}`,'grocery');
 const errors=collectPageErrors(page);
 let a:DisposableAccount|undefined,b:DisposableAccount|undefined;
 try{
  // Anonymous: invitation to sign in; the API refuses.
  await gotoOK(page,`${prefix}/lugar/${slug}`);
  await expect(page.getByRole('link',{name:t('Inicie sesión para reportar un precio','Sign in to report a price')})).toBeVisible();
  expect((await postJson(page,`/api/lugar/${slug}/precios/reporte`,{actionId:uid(),itemSlug:otc,price:1500,observedOn:crDay()})).status).toBe(401);
  // Let the anonymous page finish hydrating before the signed-in navigation (WebKit reports an aborted chunk load as a page error).
  await expect(page.locator('[data-place-price-report][data-ready]')).toBeVisible({timeout:45000});
  a=await createDisposableAccount({prefix:'dir-price-a'});await login(context,a);
  await gotoOK(page,`${prefix}/lugar/${slug}`);
  const section=page.locator('[data-place-price-report][data-ready]');await expect(section).toBeVisible({timeout:45000});
  await section.getByRole('button',{name:t('Reportar un precio','Report a price')}).click();
  const form=section.locator('[data-price-report-form]');await expect(form).toBeVisible({timeout:30000});
  const options=await form.getByLabel(t('Producto','Product')).locator('option').allTextContents();
  expect(options.some(o=>o.includes(`Acetaminofén ${tag}`))).toBe(true);expect(options.some(o=>o.includes(`Arroz ${tag}`))).toBe(true);
  expect(options.some(o=>o.includes(`Amoxicilina ${tag}`))).toBe(false);
  await form.getByLabel(t('Producto','Product')).selectOption(otc);
  await form.getByLabel(t('Precio en colones (₡)','Price in colones (₡)')).fill('1500');
  await expect(form.getByLabel(t('Fecha en que lo vio','Date you saw it'))).toHaveValue(crDay());
  await expectNoHorizontalOverflow(page);
  await section.scrollIntoViewIfNeeded();
  await opsShot(page,`price-report-form-${language}`,info,false);
  await form.getByRole('button',{name:t('Enviar precio','Send price')}).click();
  await expect(section.locator('[data-price-report-sent]')).toBeVisible();
  const first=(await db.from('price_observations').select('moderation_status,confidence,reporter_id,price_items!inner(slug)').eq('price_items.slug',otc)).data!;
  expect(first).toHaveLength(1);expect([first[0]!.moderation_status,first[0]!.confidence,first[0]!.reporter_id]).toEqual(['pending','community',a.id]);
  await page.reload();await expect(page.locator(`[data-price-item="${otc}"]`)).toHaveCount(0);
  if(language==='es'){
   // Hard rules (language independent): Rx refused, no future or old dates, valid price, no reports at fuel stations.
   const rxr=await postJson(context,`/api/lugar/${slug}/precios/reporte`,{actionId:uid(),itemSlug:rx,price:3000,observedOn:crDay()});expect([rxr.status,rxr.body?.reason]).toEqual([400,'rx_not_public']);
   expect((await postJson(context,`/api/lugar/${slug}/precios/reporte`,{actionId:uid(),itemSlug:otc,price:1500,observedOn:crDay(2)})).body?.reason).toBe('date_future');
   expect((await postJson(context,`/api/lugar/${slug}/precios/reporte`,{actionId:uid(),itemSlug:otc,price:1500,observedOn:crDay(-40)})).body?.reason).toBe('stale');
   expect((await postJson(context,`/api/lugar/${slug}/precios/reporte`,{actionId:uid(),itemSlug:otc,price:-5,observedOn:crDay()})).body?.reason).toBe('price_invalid');
   const fuel=await context.request.get(`${origin}/api/lugar/bomba-${tag}/precios/reporte`);expect(fuel.status()).toBe(400);expect((await fuel.json()).reason).toBe('prices_unavailable');
   expect((await db.from('price_observations').select('id,price_items!inner(slug)').eq('price_items.slug',rx)).data).toEqual([]);
  }
  // A second, independent person reports a matching price (within 2 %): both become public and «confirmed».
  b=await createDisposableAccount({prefix:'dir-price-b'});const bc=await browser.newContext({baseURL:origin});await login(bc,b);
  const second=await postJson(bc,`/api/lugar/${slug}/precios/reporte`,{actionId:uid(),itemSlug:otc,price:1510,observedOn:crDay()});
  expect(second.status,JSON.stringify(second.body)).toBe(200);expect(second.body).toEqual({status:'published',confidence:'community_verified'});await bc.close();
  await page.reload();
  const shown=page.locator(`[data-price-item="${otc}"]`);
  await expect(shown).toContainText(t('Reportado por usuarios · confirmado por varias personas','Reported by users · confirmed by several people'));
  await expect(shown).toContainText(t('Dato del ','As of '));
  expect(errors()).toEqual([]);
 }finally{
  await retireItems(db,place.staff,[otc,rx,rice]);
  await cleanupDisposableAccount(a);await cleanupDisposableAccount(b);
 }
});
