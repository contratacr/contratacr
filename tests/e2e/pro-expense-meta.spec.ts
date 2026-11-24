import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {ownerFixture,local,origin} from './pro-round2-fixture';

// Area D: automatic reference number (GA-00001, per account) and Taxable flag of internal expenses. Disposable accounts, loopback only.
for(const language of ['es','en'] as const)test(`Expense reference and taxable [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);
 try{
  const supplierId=crypto.randomUUID(),first=crypto.randomUUID(),second=crypto.randomUUID();
  await f.db.from('pro_expense_suppliers').insert({user_id:f.owner.id,id:supplierId,name:'Ferreteria '+id}).throwOnError();
  const expense=(expenseId:string,concept:string)=>({user_id:f.owner.id,id:expenseId,supplier_id:supplierId,supplier_name:'Ferreteria '+id,expense_date:'2026-11-20',currency:'CRC',concept,amount_cents:150000});
  await f.db.from('pro_internal_expenses').insert(expense(first,'Clavos '+id)).throwOnError();
  await f.db.from('pro_internal_expenses').insert(expense(second,'Tornillos '+id)).throwOnError();
  await warmLocalRoutes(page,['/api/pro/expense-meta?ids='+first]);
  const read=async(ids:string)=>{const r=await page.request.get(origin+'/api/pro/expense-meta?ids='+ids);expect(r.status(),await r.text()).toBe(200);return (await r.json()).items as Record<string,{ref:string;taxable:boolean;revision:number}>;};
  const items=await read(first+','+second);
  expect(items[first]).toMatchObject({ref:'GA-00001',taxable:false,revision:1});expect(items[second]).toMatchObject({ref:'GA-00002',taxable:false,revision:1});
  const post=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/expense-meta',{headers:{Origin:origin},data});
  const saved=await post({expenseId:first,revision:1,taxable:true});expect(saved.status(),await saved.text()).toBe(200);
  expect((await saved.json()).meta).toMatchObject({ref:'GA-00001',taxable:true,revision:2});
  expect((await post({expenseId:first,revision:1,taxable:false})).status()).toBe(409);
  expect((await post({expenseId:first,revision:2,taxable:'si'})).status()).toBe(400);
  expect((await post({expenseId:crypto.randomUUID(),revision:1,taxable:true})).status()).toBe(404);
  expect((await page.request.get(origin+'/api/pro/expense-meta?ids=no-es-uuid')).status()).toBe(400);
  const anonymous=await page.context().browser()!.newContext({baseURL:origin});expect((await anonymous.request.get(origin+'/api/pro/expense-meta?ids='+first)).status()).toBe(401);await anonymous.close();
  await gotoOK(page,`/${language}/dashboard/profesional?tab=pro_expenses&gasto=${second}`);
  const panel=page.locator('[data-expense-meta]');await expect(panel).toBeVisible({timeout:90000});
  await expect(panel.locator('[data-expense-ref]')).toHaveText('GA-00002');
  await expect(panel.locator('[data-expense-taxable]')).not.toBeChecked();
  await panel.locator('[data-expense-taxable]').check();
  await expect(panel.locator('[data-expense-meta-saved]')).toContainText(tr('Datos guardados.','Details saved.'),{timeout:60000});
  expect((await read(second))[second].taxable).toBe(true);
  await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});
