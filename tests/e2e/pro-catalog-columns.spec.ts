import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {local,ownerFixture} from './pro-round2-fixture';

// Row 59 (batch F): «Mostrar en cada artículo» chooses what each catalogue row shows (stock, price, cost, margin, chips).
// Kept in this browser only; the default matches the list before the option; "Por reponer" always shows.
for(const language of ['es','en'] as const)test(`Catalogue list: choose what each item shows [${language}]`,async({page},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const en=language==='en',id=language+randomBytes(3).toString('hex'),tr=(es:string,english:string)=>en?english:es,f=await ownerFixture(page.context(),id);
 try{
  await f.db.from('pro_products').insert([
   {user_id:f.owner.id,id:'col-a-'+id,sku:'COL-A-'+id,name:'Cemento '+id,stock:5,minimum:0,cost:20000,price:30000,archived:false,itemType:'product'},
   {user_id:f.owner.id,id:'col-b-'+id,sku:'COL-B-'+id,name:'Arena '+id,stock:2,minimum:3,cost:6000,price:12000,archived:false,itemType:'product'}]).throwOnError();
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_inventory`);
  const cards=page.locator('[data-pro-record-card]');await expect(cards).toHaveCount(2,{timeout:90000});
  const cement=cards.filter({hasText:'Cemento '+id}),sand=cards.filter({hasText:'Arena '+id});
  // Default: stock and price, as before.
  await expect(cement).toContainText('5 '+tr('unidades','units'));await expect(cement).not.toContainText(tr('Costo','Cost'));
  const picker=page.locator('[data-catalog-columns]');await picker.locator('summary').click();
  await expect(picker.locator('[data-catalog-column="stock"]')).toBeChecked();await expect(picker.locator('[data-catalog-column="cost"]')).not.toBeChecked();
  await picker.locator('[data-catalog-column="cost"]').check();await picker.locator('[data-catalog-column="margin"]').check();await picker.locator('[data-catalog-column="stock"]').uncheck();
  await expect(cement).toContainText(tr('Costo','Cost'));await expect(cement).toContainText(tr('Margen','Margin'));await expect(cement).toContainText('(33 %)');
  await expect(cement).not.toContainText('5 '+tr('unidades','units'));
  // Low stock keeps its warning whatever the choice.
  await expect(sand).toContainText(tr('Por reponer','To replenish'));await expect(sand).toContainText('(50 %)');
  await expectNoHorizontalOverflow(page);
  // Kept in this browser after a reload.
  await page.reload();await expect(cards).toHaveCount(2,{timeout:90000});
  await expect(cement).toContainText(tr('Margen','Margin'),{timeout:30000});await expect(cement).not.toContainText('5 '+tr('unidades','units'));
  expect(await page.evaluate(()=>localStorage.getItem('ccr:pro:catalog-columns:v1'))).toBe(JSON.stringify(['price','cost','margin','chips']));
  // Nothing about the items changed on the server.
  const rows=(await f.db.from('pro_products').select('id,stock,cost,price').eq('user_id',f.owner.id).order('id').throwOnError()).data!;
  expect(rows.map(r=>[r.id,Number(r.stock),Number(r.cost),Number(r.price)])).toEqual([['col-a-'+id,5,20000,30000],['col-b-'+id,2,6000,12000]]);
 }finally{await page.goto('about:blank').catch(()=>{});await f.cleanup();}
});
