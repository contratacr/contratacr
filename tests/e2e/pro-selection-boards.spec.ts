import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,origin,headersFor} from './pro-round2-fixture';

// Area E (selections): budget and assignee per room, board templates, tracker views saved to the account and the global tracker.
// Disposable accounts, loopback only.
for(const language of ['es','en'] as const)test(`Selection rooms, templates, views and global tracker [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id),h=headersFor(f.owner);
 try{
  const uuid=()=>crypto.randomUUID(),areaId=uuid(),itemId=uuid();
  const sel=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/selections',{headers:h,data:{actionId:uuid(),workId:f.workId,...data}});
  expect((await sel({action:'area_create',id:areaId,name:'Cocina '+id})).status()).toBe(200);
  expect((await sel({action:'item_create',id:itemId,areaId,name:'Grifo '+id,dueDate:null,notes:null,allowanceId:null})).status()).toBe(200);

  // Room budget and assignee: compare-and-set, bounds, owner only.
  const setMeta=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/selection-boards',{headers:h,data});
  const first=await setMeta({areaId,revision:0,budgetCents:5000000,assignee:'Ana'});expect(first.status(),await first.text()).toBe(200);
  expect((await first.json()).room).toMatchObject({areaId,revision:1,budgetCents:5000000,assignee:'Ana',approvedCents:0});
  expect((await setMeta({areaId,revision:0,budgetCents:1,assignee:null})).status()).toBe(409);
  expect((await setMeta({areaId,revision:1,budgetCents:-5,assignee:null})).status()).toBe(400);
  expect((await setMeta({areaId:uuid(),revision:0,budgetCents:null,assignee:null})).status()).toBe(404);
  const read=await page.request.get(origin+'/api/pro/selection-boards?'+new URLSearchParams({workId:f.workId}));expect(read.status()).toBe(200);
  expect((await read.json()).areas[0]).toMatchObject({areaId,budgetCents:5000000,assignee:'Ana',pending:0,declined:0,approved:0});

  // Board templates.
  const tpl=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/selection-board-templates',{headers:h,data});
  const saved=await tpl({action:'save',name:'Cocina base',items:['Grifo','Mueble']});expect(saved.status(),await saved.text()).toBe(200);
  const tplId=(await saved.json()).template.id as string;
  expect((await tpl({action:'save',name:'',items:[]})).status()).toBe(400);
  const listed=await page.request.get(origin+'/api/pro/selection-board-templates');expect((await listed.json()).templates).toEqual([{id:tplId,name:'Cocina base',items:['Grifo','Mueble']}]);

  // Saved tracker views.
  const view=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/selection-tracker-views',{headers:h,data});
  const v=await view({action:'save',name:'Mi vista',columns:['item','area','total']});expect(v.status(),await v.text()).toBe(200);const viewId=(await v.json()).view.id as string;
  expect((await view({action:'save',name:'Mala',columns:['no valida!']})).status()).toBe(400);
  expect((await (await page.request.get(origin+'/api/pro/selection-tracker-views')).json()).views).toHaveLength(1);

  // Global tracker.
  const global=await page.request.get(origin+'/api/pro/selections-global');expect(global.status()).toBe(200);
  const gbody=await global.json();expect(gbody.items.map((r:{name:string})=>r.name)).toContain('Grifo '+id);expect(gbody.truncated).toBe(false);

  // Anonymous callers are rejected.
  const anonymous=await page.context().browser()!.newContext({baseURL:origin});
  for(const path of ['/api/pro/selection-boards?workId='+f.workId,'/api/pro/selection-board-templates','/api/pro/selection-tracker-views','/api/pro/selections-global'])expect((await anonymous.request.get(origin+path)).status()).toBe(401);
  await anonymous.close();

  // UI: budget bar, template creation, global tab.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'selections'}));
  const bar=page.locator(`[data-room-budget="${areaId}"]`);await expect(bar).toBeVisible({timeout:90000});
  await expect(bar.locator('[data-room-budget-text]')).toContainText(en?'/':'/');await expect(bar.locator('[data-room-assignee]')).toContainText('Ana');
  await bar.locator('[data-room-budget-edit]').click();await bar.locator('[data-room-budget-input]').fill('80000');await bar.locator('[data-room-assignee-input]').fill('Luis');await bar.locator('[data-room-budget-save]').click();
  await expect(bar.locator('[data-room-assignee]')).toContainText('Luis',{timeout:60000});
  await page.locator('[data-board-templates-toggle]').click();
  await page.locator('[data-template-use]').selectOption(tplId);await page.locator('[data-template-room-name]').fill('Baño '+id);await page.locator('[data-template-create]').click();
  await expect(page.locator('[data-board-template-notice]')).toContainText(tr('Habitación creada desde la plantilla.','Room created from the template.'),{timeout:90000});
  await expect(page.locator('[data-selection-area]')).toHaveCount(2,{timeout:60000});
  await page.locator('[data-selections-mode="global"]').click();
  await expect(page.locator('[data-selections-global]')).toBeVisible({timeout:60000});
  await expect(page.locator('[data-global-row], [data-global-card]').first()).toBeVisible();
  await page.locator('[data-global-filter="query"]').fill('zzzz-no-existe');await expect(page.locator('[data-global-empty]')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect((await tpl({action:'delete',id:tplId})).status()).toBe(200);expect((await view({action:'delete',id:viewId})).status()).toBe(200);
 }finally{await f.cleanup();}
});
