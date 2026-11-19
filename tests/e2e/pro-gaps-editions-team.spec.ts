import {mkdirSync} from 'node:fs';
import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,login,origin,ownerFixture} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {chooseEdition,claimByEmail,hideSeededPlaces,label,postJson,seedPlace,uid} from './pro-dir-fixture';
import {randomIp} from './pro-dir-features-fixture';

// Gaps round (LOCAL Pro, 2026-11-17).
//  (1) Pro › Ediciones: the owner (or a company admin) chooses the edition (choose_edition: CAS revision → 409, idempotent
//      actionId → replayed); a «member» only reads (403); the Menú empty state points to the picker, not to Support.
//  (2) «Equipo» is a section of the Pro space: the sidebar/card opens it without leaving the Pro document, and the team
//      page (/dashboard/pro/equipo) uses the same chrome (no «Volver a Pro»).
//  (3) Company members use «Menú» for the WORKSPACE's claimed restaurant: a «member» writes drafts but cannot publish
//      (price_role); a manager publishes; read_only does not get the entry.
// Screenshots (es/en, 1440 + 390) go to GAPS_SHOTS_DIR when set.
test.afterEach(()=>hideSeededPlaces());
async function shots(page:Page,name:string){
 const dir=process.env.GAPS_SHOTS_DIR;if(!dir)return;mkdirSync(dir,{recursive:true});
 const before=page.viewportSize();
 for(const width of [1440,390]){await page.setViewportSize({width,height:width>800?900:844});await page.waitForTimeout(400);await expectNoHorizontalOverflow(page);await page.screenshot({path:`${dir}/${name}-${width}.png`,fullPage:true});}
 if(before)await page.setViewportSize(before);
}
async function member(db:Awaited<ReturnType<typeof ownerFixture>>['db'],owner:string,role:'admin'|'manager'|'member'|'read_only',browser:import('playwright/test').Browser){
 const account=await createDisposableAccount({prefix:'gaps-'+role.replace('_','')});
 await db.from('pro_company_members').insert({owner_id:owner,member_user_id:account.id,member_name:'Equipo '+role,member_email:account.email,role}).throwOnError();
 const context=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});
 await login(context,account);await context.addCookies([{name:'ccr_pro_ws',value:owner,url:origin,httpOnly:true,sameSite:'Lax'}]);
 return {account,context};
}
const editions=async(c:BrowserContext)=>{const r=await c.request.get(`${origin}/api/pro/editions`);expect(r.status()).toBe(200);return r.json();};

test('Pro editions: owner chooses (CAS + idempotent), member reads only, Menú empty state links to the picker',async({page,context,browser},info)=>{
 test.setTimeout(420000);local(info.project.use.baseURL);
 const f=await ownerFixture(context,'editions-'+label()),errors=collectPageErrors(page),people:{account:DisposableAccount;context:BrowserContext}[]=[];
 const headers={'X-Pro-Expected-Actor':f.owner.id};
 try{
  await context.setExtraHTTPHeaders(randomIp());
  const first=await editions(context);
  expect(first).toMatchObject({ownerId:f.owner.id,edition:'servicios',implicit:true,revision:0,canChoose:true,role:'owner'});
  // Menú without the «Restaurantes» edition: the next step opens the picker with the edition preselected (no Support link).
  const menuHtml=await (await context.request.get(`${origin}/es/dashboard/pro/menu`)).text();
  expect(menuHtml).toContain('data-edition-choose');expect(menuHtml).toContain('/dashboard/pro?tab=pro_editions&amp;edicion=restaurantes');expect(menuHtml).not.toContain('/soporte?');
  for(const language of ['es','en'] as const){
   const en=language==='en',prefix=en?'/en':'/es',target=en?'servicios':'restaurantes';
   await gotoOK(page,`${prefix}/dashboard/pro/menu`);
   // ES: the module is off → «Elegir la edición». EN (now on Restaurantes, no claimed place) → the claim step's edition link.
   await page.locator(en?'[data-place-claim-edition]':'[data-edition-choose]').click();
   await expect(page).toHaveURL(/\/dashboard\/pro\?tab=pro_editions&edicion=restaurantes$/,{timeout:90000});
   const settings=page.locator('[data-edition-settings]');await expect(settings).toBeVisible({timeout:90000});
   await expect(page.getByRole('heading',{level:1,name:en?'Pro edition':'Edición de Pro',exact:true})).toBeVisible();
   await expect(settings).toContainText(en?'During the launch every feature':'Durante el lanzamiento todas');
   await expect(settings.locator('[data-edition-option]')).toHaveCount(4);
   if(en)await settings.locator('[data-edition-option="servicios"] input').check();
   else await expect(settings.locator('[data-edition-option="restaurantes"] input')).toBeChecked();
   await shots(page,`editions-${language}`);
   await settings.locator('[data-edition-save]').click();
   await expect(settings.locator('[data-edition-message="ok"]')).toBeVisible({timeout:45000});
   await expect(settings).toHaveAttribute('data-edition-current',target);
  }
  const after=await editions(context);expect(after).toMatchObject({edition:'servicios',implicit:false,revision:2});
  // CAS: a stale revision is refused; the same actionId+body answers the saved result once (replayed).
  expect((await postJson(context,'/api/pro/editions',{actionId:uid(),edition:'comercio',revision:0},headers)).status).toBe(409);
  const body={actionId:uid(),edition:'comercio',revision:2};
  const once=await postJson(context,'/api/pro/editions',body,headers);expect(once.status).toBe(200);expect(once.body).toMatchObject({edition:'comercio',revision:3,replayed:false});
  const twice=await postJson(context,'/api/pro/editions',body,headers);expect(twice.status).toBe(200);expect(twice.body).toMatchObject({edition:'comercio',revision:3,replayed:true});
  expect((await postJson(context,'/api/pro/editions',{actionId:uid(),edition:'bienes_raices',revision:3},headers)).status).toBe(400);
  expect((await postJson(context,'/api/pro/editions',{actionId:uid(),edition:'autos',revision:3,tier:'plus'},headers)).status).toBe(400);
  // Roles: a «member» reads (no button, POST 403); a company admin chooses.
  const m=await member(f.db,f.owner.id,'member',browser);people.push(m);
  const seen=await editions(m.context);expect(seen).toMatchObject({ownerId:f.owner.id,edition:'comercio',canChoose:false,role:'member'});
  expect((await postJson(m.context,'/api/pro/editions',{actionId:uid(),edition:'autos',revision:3},{'X-Pro-Expected-Actor':f.owner.id})).status).toBe(403);
  const mp=await m.context.newPage();await gotoOK(mp,'/es/dashboard/pro?tab=pro_editions');
  await expect(mp.locator('[data-edition-readonly]')).toBeVisible({timeout:90000});await expect(mp.locator('[data-edition-save]')).toHaveCount(0);
  const a=await member(f.db,f.owner.id,'admin',browser);people.push(a);
  expect((await editions(a.context)).canChoose).toBe(true);
  const byAdmin=await postJson(a.context,'/api/pro/editions',{actionId:uid(),edition:'autos',revision:3},{'X-Pro-Expected-Actor':f.owner.id});
  expect(byAdmin.status).toBe(200);expect(byAdmin.body).toMatchObject({edition:'autos',revision:4});
  // Nothing about billing changed: tier and source stay (free during the launch).
  const row=(await f.db.from('pro_workspace_editions').select('edition,tier,source').eq('owner_id',f.owner.id).single().throwOnError()).data;
  expect(row).toEqual({edition:'autos',tier:'basico',source:'launch_free'});
  expect(errors()).toEqual([]);
 }finally{for(const p of people){await p.context.close();await cleanupDisposableAccount(p.account);}await f.cleanup();}
});

test('Equipo is a section of the Pro space (same document and chrome)',async({page,context},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const f=await ownerFixture(context,'team-shell-'+label()),errors=collectPageErrors(page);
 try{
  for(const language of ['es','en'] as const){
   const en=language==='en',prefix=en?'/en':'/es';
   await gotoOK(page,`${prefix}/dashboard/pro`);await expect(page.locator('[data-pro-tools]')).toBeVisible({timeout:90000});
   await page.evaluate(()=>{(window as unknown as {gapsMarker?:number}).gapsMarker=1;});
   await page.locator('[data-pro-tools] [data-pro-hub-card="team"] button').click();
   await expect(page).toHaveURL(/\/dashboard\/pro\?tab=pro_team$/,{timeout:90000});
   await expect(page.locator('[data-pro-team-shell]')).toBeVisible({timeout:90000});await expect(page.locator('[data-team-space]')).toBeVisible({timeout:90000});
   expect(await page.evaluate(()=>(window as unknown as {gapsMarker?:number}).gapsMarker)).toBe(1);// never left the Pro document
   await expect(page.getByRole('heading',{level:1,name:en?'Team':'Equipo',exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:en?'Back to Pro':'Volver a Pro',exact:true})).toHaveCount(0);
   await expect(page.getByRole('button',{name:en?'Back to My panel':'Volver a Mi panel',exact:true})).toBeVisible();
   if((page.viewportSize()?.width??0)>=1024)await expect(page.locator('[data-pro-hub-entry="team"]')).toHaveAttribute('aria-current','page');
   await shots(page,`team-${language}`);
   // The team page keeps working (invitation links) with the same chrome.
   await gotoOK(page,`${prefix}/dashboard/pro/equipo`);
   await expect(page.locator('[data-pro-team-shell]')).toBeVisible({timeout:90000});
   await expect(page.getByRole('button',{name:en?'Back to Pro':'Volver a Pro',exact:true})).toHaveCount(0);
   await expect(page.locator('[data-independent-pro] header')).toHaveCount(1);
  }
  expect(errors()).toEqual([]);
 }finally{await f.cleanup();}
});

test('Company members use «Menú» for the workspace restaurant; only admin/manager publish prices',async({context,browser},info)=>{
 test.setTimeout(420000);local(info.project.use.baseURL);
 const tag=label(),f=await ownerFixture(context,'menu-team-'+tag),slug=`soda-equipo-${tag}`,people:{account:DisposableAccount;context:BrowserContext}[]=[];
 try{
  await context.setExtraHTTPHeaders(randomIp());
  const {placeId}=await seedPlace(f.db,{slug,vertical:'restaurant',name:`Soda Equipo ${tag}`,phone:'+506 2255 0404',adminArea1:'San José'});
  await chooseEdition(f.db,f.owner.id,'restaurantes');await claimByEmail(context,slug);
  const m=await member(f.db,f.owner.id,'member',browser),g=await member(f.db,f.owner.id,'manager',browser),r=await member(f.db,f.owner.id,'read_only',browser);people.push(m,g,r);
  const hub=async(c:BrowserContext)=>(await (await c.request.get(`${origin}/api/pro/place-hub`)).json()) as {menu:boolean};
  expect((await hub(m.context)).menu).toBe(true);expect((await hub(g.context)).menu).toBe(true);expect((await hub(r.context)).menu).toBe(false);
  // The member's menu page edits the OWNER's restaurant (the member manages no place of their own).
  for(const language of ['es','en'] as const){
   const page=await m.context.newPage(),en=language==='en';
   await gotoOK(page,`${en?'/en':'/es'}/dashboard/pro/menu`);
   await expect(page.locator(`[data-menu-editor="${placeId}"]`)).toBeVisible({timeout:90000});
   await expect(page.locator('[data-menu-price-role]')).toContainText(en?'administrator or manager':'administrador o encargado');
   await page.close();
  }
  const headers={'X-Pro-Expected-Actor':f.owner.id};
  const post=(c:BrowserContext,data:Record<string,unknown>)=>postJson(c,'/api/pro/menu',{actionId:uid(),placeId,...data},headers);
  const sectionId=uid(),itemId=uid(),draftId=uid();
  expect((await post(m.context,{action:'section_create',sectionId,section:{nameEs:'Platos fuertes'}})).status).toBe(200);
  const draft=await post(m.context,{action:'item_create',itemId,sectionId,item:{nameEs:'Casado',priceMinor:450000}});expect(draft.status,JSON.stringify(draft.body)).toBe(200);
  const blocked=await post(m.context,{action:'items_publish',itemIds:[itemId]});expect(blocked.status).toBe(403);expect(blocked.body?.reason).toBe('price_role');
  expect((await post(m.context,{action:'item_create',itemId:draftId,sectionId,item:{nameEs:'Olla de carne',priceMinor:520000,status:'published'}})).body?.reason).toBe('price_role');
  expect((await post(m.context,{action:'settings',revision:0,pricesIncludeIva:false,pricesIncludeService:false,serviceCharge:true})).body?.reason).toBe('price_role');
  expect((await post(r.context,{action:'item_create',itemId:draftId,sectionId,item:{nameEs:'Olla de carne',priceMinor:520000}})).status).toBe(403);
  const published=await post(g.context,{action:'items_publish',itemIds:[itemId]});expect(published.status,JSON.stringify(published.body)).toBe(200);
  // After publishing, the member may edit the text but not the published price.
  const item=(await f.db.from('pro_menu_items').select('revision,status').eq('id',itemId).single().throwOnError()).data!;expect(item.status).toBe('published');
  expect((await post(m.context,{action:'item_update',itemId,revision:item.revision,sectionId,item:{nameEs:'Casado',priceMinor:470000,status:'published'}})).body?.reason).toBe('price_role');
  expect((await post(m.context,{action:'item_update',itemId,revision:item.revision,sectionId,item:{nameEs:'Casado con pollo',priceMinor:450000,status:'published'}})).status).toBe(200);
  const history=(await f.db.from('pro_menu_history').select('member_id,action').eq('place_id',placeId).order('id').throwOnError()).data!;
  expect(history.map(h=>[h.action,h.member_id])).toEqual([['section_create',m.account.id],['item_create',m.account.id],['items_publish',g.account.id],['item_update',m.account.id]]);
 }finally{for(const p of people){await p.context.close();await cleanupDisposableAccount(p.account);}await f.cleanup();}
});
