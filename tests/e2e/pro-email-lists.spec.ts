import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,origin,headersFor} from './pro-round2-fixture';

// Area E (email marketing): custom email lists next to the system lists, used as the audience of a campaign. Disposable accounts, loopback only.
for(const language of ['es','en'] as const)test(`Email lists [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',label=language+randomBytes(3).toString('hex');
 const f=await ownerFixture(page.context(),label),h=headersFor(f.owner);
 try{
  const mail=`lista.${label}@example.test`,other=`otra.${label}@example.test`;
  for(const [email,name] of [[mail,'Ana Lista'],[other,'Beto Otra']])expect((await page.request.post(origin+'/api/pro/marketing',{headers:h,data:{action:'contact_consent',actionId:crypto.randomUUID(),email,name,clientId:null,consentText:'La persona aceptó recibir novedades por correo.',evidence:'written'}})).status()).toBe(200);
  const lists=()=>page.request.get(origin+'/api/pro/marketing-lists').then(r=>r.json());
  const post=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/marketing-lists',{headers:h,data});
  const base=await lists();expect(base.system.all).toBe(2);expect(base.lists).toEqual([]);expect(base.contacts).toHaveLength(2);
  const listId=crypto.randomUUID();
  const created=await post({action:'create',id:listId,name:'Clientes VIP'});expect(created.status(),await created.text()).toBe(200);
  expect((await post({action:'create',id:crypto.randomUUID(),name:'clientes vip'})).status()).toBe(409);
  expect((await post({action:'create',id:crypto.randomUUID(),name:'  '})).status()).toBe(400);
  const contactId=base.contacts.find((c:{email:string})=>c.email===mail).id as string;
  expect((await post({action:'set_members',id:listId,contactIds:[crypto.randomUUID()]})).status()).toBe(400);
  const set=await post({action:'set_members',id:listId,contactIds:[contactId]});expect(set.status(),await set.text()).toBe(200);
  expect((await set.json()).lists[0]).toMatchObject({id:listId,name:'Clientes VIP',audience:1,contactIds:[contactId]});
  // A campaign can target the list; its audience counts only that list. A bad segment is rejected.
  const campaign=crypto.randomUUID(),save=(segment:string)=>page.request.post(origin+'/api/pro/marketing',{headers:h,data:{action:'campaign_save',actionId:crypto.randomUUID(),id:campaign,revision:0,name:'Para VIP',subject:'Hola',body:'Texto',segment}});
  expect((await save('lista:xyz')).status()).toBe(400);expect((await save('list:not-a-uuid')).status()).toBe(400);
  const ok=await save('list:'+listId);expect(ok.status(),await ok.text()).toBe(200);
  const overview=await (await page.request.get(origin+'/api/pro/marketing')).json() as {campaigns:{id:string;segment:string;audience:number}[]};
  expect(overview.campaigns.find(c=>c.id===campaign)).toMatchObject({segment:'list:'+listId,audience:1});
  const anonymous=await page.context().browser()!.newContext({baseURL:origin});expect((await anonymous.request.get(origin+'/api/pro/marketing-lists')).status()).toBe(401);await anonymous.close();

  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'correo'}));
  const root=page.locator('[data-mkt-lists]');await expect(root).toBeVisible({timeout:90000});
  await expect(root.locator('[data-mkt-system-list="all"] [data-mkt-list-count]')).toHaveText('2');
  await expect(root.locator(`[data-mkt-list="${listId}"] [data-mkt-list-audience]`)).toContainText('1');
  await root.locator('[data-mkt-list-name]').fill('Segunda '+label);await root.locator('[data-mkt-list-create]').click();
  await expect(root.locator('[data-mkt-list]')).toHaveCount(2,{timeout:60000});
  await root.locator('[data-mkt-list-delete]').last().click();await expect(root.locator('[data-mkt-list]')).toHaveCount(1,{timeout:60000});
  void en;await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});
