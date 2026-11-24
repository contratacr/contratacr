import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {ownerFixture,local,origin} from './pro-round2-fixture';

// Area D (price book): cost type, suggested retail price (MSRP), product link and favorite of a catalog item.
// Disposable accounts, loopback only.
for(const language of ['es','en'] as const)test(`Catalog item pricing [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);
 try{
  const productId='pri-'+id;
  await f.db.from('pro_products').insert({user_id:f.owner.id,id:productId,sku:'PRI-'+id,name:'Cemento '+id,stock:1,minimum:0,cost:20000,price:30000,archived:false,itemType:'product'}).throwOnError();
  await warmLocalRoutes(page,['/api/pro/catalog-pricing?ids='+productId]);
  const post=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/catalog-pricing',{headers:{Origin:origin},data});
  const empty=await page.request.get(origin+'/api/pro/catalog-pricing?ids='+productId);expect(empty.status()).toBe(200);
  expect((await empty.json()).items[productId]).toMatchObject({revision:0,costType:null,msrpCents:null,url:null,favorite:false});
  const base={costType:null,msrpCents:null,url:null,favorite:false};
  const first=await post({productId,revision:0,...base,costType:'material_labor',msrpCents:4500000,url:'https://example.com/producto',favorite:true});expect(first.status(),await first.text()).toBe(200);
  expect((await first.json()).pricing).toMatchObject({revision:1,costType:'material_labor',msrpCents:4500000,favorite:true});
  expect((await post({productId,revision:0,...base})).status()).toBe(409);
  expect((await post({productId,revision:1,...base,costType:'otro'})).status()).toBe(400);
  expect((await post({productId,revision:1,...base,url:'javascript:alert(1)'})).status()).toBe(400);
  expect((await post({productId,revision:1,...base,msrpCents:-5})).status()).toBe(400);
  expect((await post({productId:'no-existe-'+id,revision:0,...base})).status()).toBe(404);
  const anonymous=await page.context().browser()!.newContext({baseURL:origin});const denied=await anonymous.request.post(origin+'/api/pro/catalog-pricing',{headers:{Origin:origin},data:{productId,revision:1,...base}});expect(denied.status()).toBe(401);await anonymous.close();
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_inventory&producto=${productId}`);
  const panel=page.locator('[data-catalog-pricing]');await expect(panel).toBeVisible({timeout:90000});
  await expect(panel.locator('[data-pricing-field="costType"]')).toHaveValue('material_labor');
  await expect(panel.locator('[data-pricing-field="favorite"]')).toBeChecked();
  await panel.locator('[data-pricing-field="costType"]').selectOption('labor');await panel.locator('[data-pricing-field="msrp"]').fill('52000');
  await panel.locator('[data-pricing-save]').click();
  await expect(panel.locator('[data-pricing-saved]')).toContainText(tr('Datos guardados.','Details saved.'),{timeout:60000});
  await panel.locator('[data-pricing-field="url"]').fill('ftp://x');await panel.locator('[data-pricing-save]').click();
  await expect(panel.getByRole('alert')).toContainText(tr('El enlace debe comenzar','The link must start'));
  await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});
