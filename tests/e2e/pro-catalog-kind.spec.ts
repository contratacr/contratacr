import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {ownerFixture,local,origin} from './pro-round2-fixture';

// Area D (price book): item kind (standard, placeholder, assembly) and assembly parts with computed cost. Disposable accounts, loopback only.
for(const language of ['es','en'] as const)test(`Catalog item kind and assembly [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);
 try{
  const kit='kit-'+id,cement='cem-'+id,sand='san-'+id;
  const product=(pid:string,name:string,cost:number)=>({user_id:f.owner.id,id:pid,sku:pid.toUpperCase(),name,stock:1,minimum:0,cost,price:cost*2,archived:false,itemType:'product'});
  await f.db.from('pro_products').insert([product(kit,'Kit de muro '+id,0),product(cement,'Cemento '+id,20000),product(sand,'Arena '+id,5000)]).throwOnError();
  await warmLocalRoutes(page,['/api/pro/catalog-kind?id='+kit]);
  const post=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/catalog-kind',{headers:{Origin:origin},data});
  const empty=await page.request.get(origin+'/api/pro/catalog-kind?id='+kit);expect(empty.status(),await empty.text()).toBe(200);
  expect((await empty.json()).item).toMatchObject({revision:0,kind:'standard',parts:[],costCents:null});
  const saved=await post({productId:kit,revision:0,kind:'assembly',parts:[{partId:cement,qtyMilli:2000},{partId:sand,qtyMilli:1500}]});expect(saved.status(),await saved.text()).toBe(200);
  const item=(await saved.json()).item;expect(item).toMatchObject({revision:1,kind:'assembly',costCents:2000000*2+500000*1.5});expect(item.parts.map((p:{partId:string})=>p.partId)).toEqual([cement,sand]);
  expect((await post({productId:kit,revision:0,kind:'standard',parts:[]})).status()).toBe(409);
  expect((await post({productId:cement,revision:0,kind:'assembly',parts:[]})).status(),'a part cannot become an assembly').toBe(400);
  expect((await post({productId:sand,revision:0,kind:'assembly',parts:[{partId:kit,qtyMilli:1000}]})).status(),'an assembly cannot hold an assembly').toBe(400);
  expect((await post({productId:kit,revision:1,kind:'assembly',parts:[{partId:'no-existe-'+id,qtyMilli:1000}]})).status()).toBe(404);
  expect((await post({productId:kit,revision:1,kind:'standard',parts:[{partId:cement,qtyMilli:1000}]})).status()).toBe(400);
  expect((await post({productId:'no-existe-'+id,revision:0,kind:'standard',parts:[]})).status()).toBe(404);
  const anonymous=await page.context().browser()!.newContext({baseURL:origin});expect((await anonymous.request.post(origin+'/api/pro/catalog-kind',{headers:{Origin:origin},data:{productId:kit,revision:1,kind:'standard',parts:[]}})).status()).toBe(401);await anonymous.close();
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_inventory&producto=${kit}`);
  const panel=page.locator('[data-catalog-kind]');await expect(panel).toBeVisible({timeout:90000});
  await expect(panel.locator('[data-kind-field="kind"]')).toHaveValue('assembly');
  await expect(panel.locator('[data-kind-part]')).toHaveCount(2);
  await expect(panel.locator('[data-kind-cost]')).toContainText('₡');
  await panel.locator('[data-kind-part-qty]').first().fill('3');
  await panel.locator('[data-kind-part-remove]').nth(1).click();await expect(panel.locator('[data-kind-part]')).toHaveCount(1);
  await panel.locator('[data-kind-save]').click();
  await expect(panel.locator('[data-kind-saved]')).toContainText(tr('Datos guardados.','Details saved.'),{timeout:60000});
  await panel.locator('[data-kind-part-qty]').first().fill('x');await panel.locator('[data-kind-save]').click();
  await expect(panel.getByRole('alert')).toContainText(tr('Revise las cantidades','Check the part quantities'));
  await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});
