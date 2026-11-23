import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {ownerFixture,local,origin} from './pro-round2-fixture';

// Family 59: specifications (brand, model, finish, color, material, dimensions, warranty) of a catalog item.
// Disposable accounts, loopback only.
for(const language of ['es','en'] as const)test(`Catalog item specifications [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);
 try{
  const productId='spec-'+id;
  await f.db.from('pro_products').insert({user_id:f.owner.id,id:productId,sku:'SPEC-'+id,name:'Lavatorio '+id,stock:1,minimum:0,cost:20000,price:30000,archived:false,itemType:'product'}).throwOnError();
  await warmLocalRoutes(page,['/api/pro/catalog-specs?ids='+productId]);
  const post=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/catalog-specs',{headers:{Origin:origin},data});
  const empty=await page.request.get(origin+'/api/pro/catalog-specs?ids='+productId);expect(empty.status()).toBe(200);
  expect((await empty.json()).items[productId]).toMatchObject({revision:0,brand:null,dimensions:null});
  const blank={brand:null,model:null,finish:null,color:null,material:null,dimensions:null,warranty:null};
  const first=await post({productId,revision:0,...blank,brand:'Corona',model:'Nova 60',finish:'Mate',dimensions:'60 x 45 cm'});expect(first.status(),await first.text()).toBe(200);
  expect((await first.json()).specs).toMatchObject({revision:1,brand:'Corona',model:'Nova 60',finish:'Mate',dimensions:'60 x 45 cm',color:null});
  const stale=await post({productId,revision:0,...blank,brand:'Otra'});expect(stale.status()).toBe(409);
  const tooLong=await post({productId,revision:1,...blank,brand:'x'.repeat(81)});expect(tooLong.status()).toBe(400);
  const foreign=await post({productId:'no-existe-'+id,revision:0,...blank});expect(foreign.status()).toBe(404);
  const anonymous=await page.context().browser()!.newContext({baseURL:origin});const denied=await anonymous.request.post(origin+'/api/pro/catalog-specs',{headers:{Origin:origin},data:{productId,revision:1,...blank}});expect(denied.status()).toBe(401);await anonymous.close();
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_inventory&producto=${productId}`);
  const panel=page.locator('[data-catalog-specs]');await expect(panel).toBeVisible({timeout:90000});
  await expect(panel.locator('[data-spec-field="brand"]')).toHaveValue('Corona');
  await panel.locator('[data-spec-field="color"]').fill('Blanco');await panel.locator('[data-spec-save]').click();
  await expect(panel.locator('[data-spec-saved]')).toContainText(tr('Especificaciones guardadas.','Specifications saved.'),{timeout:60000});
  await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});
