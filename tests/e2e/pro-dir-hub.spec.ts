import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,login,origin,ownerFixture} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {chooseEdition,claimByEmail,hideSeededPlaces,label,seedPlace} from './pro-dir-fixture';
import {featureShots,randomIp} from './pro-dir-features-fixture';

// Pending fixes round (LOCAL Pro, 2026-11-17): the Pro hub lists «Mi negocio en el directorio» — «Reservas de mesa»,
// «Menú» and «Mi lugar» — only when the workspace manages a CLAIMED place of the right section and has the module.
// A Pro account without claimed places sees nothing new; a restaurant owner on the «Restaurantes» edition sees the three
// entries (cards on «Inicio» and the desktop sidebar) and they open the module pages, which link to each other; with
// another edition only «Mi lugar» stays; a company member (read_only) sees reservations and «Mi lugar» but not «Menú»
// (owner-scoped editor). Owner of /api/pro/place-hub. Captures the hub with the new entries (es/en, 1440+390).
test.afterEach(()=>hideSeededPlaces());

// PRO_ENABLED off (E2E_PRO_OFF=1): Pro hub (/api/pro/place-hub) answers 404 by design; the free owner tools are covered by pro-dir-business-tools.
test.skip(process.env.E2E_PRO_OFF==='1','Pro surface closed while PRO_ENABLED is off');
test('Pro hub: directory entries follow the claimed place, the module and the team role',async({page,context,browser},info)=>{
 test.setTimeout(360000);local(info.project.use.baseURL);
 const tag=label(),f=await ownerFixture(context,'hub-'+tag),db=f.db,slug=`soda-hub-${tag}`,errors=collectPageErrors(page);
 let reader:DisposableAccount|undefined;
 const hub=async(c=context)=>{const r=await c.request.get(`${origin}/api/pro/place-hub`);expect(r.status()).toBe(200);return r.json();};
 try{
  await context.setExtraHTTPHeaders(randomIp());
  // No claimed place: no directory entries (and the API never errors).
  expect(await hub()).toEqual({menu:false,reservations:false,place:false});
  await gotoOK(page,'/es/dashboard/pro');
  await expect(page.locator('[data-pro-tools]')).toBeVisible({timeout:60000});
  await expect(page.locator('[data-pro-hub-group="directory"]')).toHaveCount(0);

  // Claimed restaurant + «Restaurantes» edition: three entries.
  await seedPlace(db,{slug,vertical:'restaurant',name:`Soda Hub ${tag}`,phone:'+506 2255 0303',adminArea1:'San José'});
  await chooseEdition(db,f.owner.id,'restaurantes');
  await claimByEmail(context,slug);
  expect(await hub()).toEqual({menu:true,reservations:true,place:true});
  for(const language of ['es','en'] as const){
   const en=language==='en',prefix=en?'/en':'/es';
   await gotoOK(page,`${prefix}/dashboard/pro`);
   const group=page.locator('[data-pro-hub-group="directory"]');
   await expect(group).toBeVisible({timeout:60000});
   await expect(group.getByRole('heading',{name:en?'My business in the directory':'Mi negocio en el directorio'})).toBeVisible();
   await expect(group.locator('[data-pro-hub-card]')).toHaveCount(3);
   for(const key of ['table_reservations','menu','place'])await expect(group.locator(`[data-pro-hub-card="${key}"]`)).toBeVisible();
   await expect(group.locator('[data-pro-hub-card="table_reservations"]')).toContainText(en?'Table reservations':'Reservas de mesa');
   await expect(group.locator('[data-pro-hub-card="place"]')).toContainText(en?'My place':'Mi lugar');
   await expectNoHorizontalOverflow(page);
   await featureShots(page,`pro-hub-directory-${language}`,info);
  }
  // Desktop sidebar (lg+) lists the same entries on the other Pro sections.
  if((page.viewportSize()?.width??0)>=1024){
   await gotoOK(page,'/es/dashboard/pro?tab=pro_clients');
   await expect(page.locator('[data-pro-hub-entry="table_reservations"]')).toBeVisible({timeout:60000});
   await expect(page.locator('[data-pro-hub-entry="menu"]')).toBeVisible();await expect(page.locator('[data-pro-hub-entry="place"]')).toBeVisible();
  }
  // The card opens the module page; the module pages link to each other and back to Pro.
  await gotoOK(page,'/es/dashboard/pro');
  await page.locator('[data-pro-hub-group="directory"] [data-pro-hub-card="table_reservations"] button').click();
  await expect(page).toHaveURL(/\/dashboard\/pro\/reservas-mesa$/,{timeout:60000});
  const nav=page.locator('[data-place-module-nav]');
  await expect(nav.locator('[data-place-module-link="table_reservations"]')).toHaveAttribute('aria-current','page');
  // (The menu editor itself is covered by pro-dir-menu.spec.ts; here only its link.)
  await expect(nav.locator('[data-place-module-link="menu"]')).toHaveAttribute('href','/dashboard/pro/menu');
  const menuHtml=await (await page.request.get(`${origin}/es/dashboard/pro/menu`)).text();
  expect(menuHtml).toMatch(/data-place-module-link="menu" aria-current="page"/);expect(menuHtml).toContain('data-place-module-link="table_reservations"');
  await nav.locator('[data-place-module-link="place"]').click();
  await expect(page).toHaveURL(/\/dashboard\/pro\/lugar$/,{timeout:60000});
  await expect(page.locator('[data-place-module-nav] [data-place-module-link="pro"]')).toHaveAttribute('href','/dashboard/pro');
  await expectNoHorizontalOverflow(page);

  // Team: a read_only member working in the owner's company sees reservations and «Mi lugar», not the owner-scoped menu.
  reader=await createDisposableAccount({prefix:'dir-hub-reader'});
  await db.from('pro_company_members').insert({owner_id:f.owner.id,member_user_id:reader.id,member_name:'Lector '+tag,member_email:reader.email,role:'read_only'}).throwOnError();
  const c=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});
  try{
   await login(c,reader);await c.addCookies([{name:'ccr_pro_ws',value:f.owner.id,url:origin,httpOnly:true,sameSite:'Lax'}]);
   expect(await hub(c)).toEqual({menu:false,reservations:true,place:true});
  }finally{await c.close();}

  // Another edition: the restaurant modules disappear, «Mi lugar» stays (any claimed place).
  await chooseEdition(db,f.owner.id,'servicios');
  expect(await hub()).toEqual({menu:false,reservations:false,place:true});
  await gotoOK(page,'/es/dashboard/pro');
  const group=page.locator('[data-pro-hub-group="directory"]');
  await expect(group.locator('[data-pro-hub-card="place"]')).toBeVisible({timeout:60000});
  await expect(group.locator('[data-pro-hub-card]')).toHaveCount(1);
  expect(errors()).toEqual([]);
 }finally{await cleanupDisposableAccount(reader);await f.cleanup();}
});
