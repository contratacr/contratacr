import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {headersFor,local,login,origin,ownerFixture} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {chooseEdition,claimByEmail,hideSeededPlaces,label,seedPlace,uid} from './pro-dir-fixture';

// Multivertical P2 (LOCAL Pro): restaurant menu of a CLAIMED place. Owner (edition restaurantes) claims the place
// with the mock code, creates a section and a dish through /api/pro/menu, the draft stays hidden on
// /lugar/<slug>/menu until published, then shows the final price with its breakdown; the editor page renders;
// a stale revision answers 409; an account that does not manage the place is refused. Owner of /api/pro/menu,
// /[locale]/dashboard/pro/menu and /[locale]/lugar/[slug]/menu.
test.afterEach(()=>hideSeededPlaces());

// PRO_ENABLED off (E2E_PRO_OFF=1): Pro menu editor (/api/pro/menu, edition gate) answers 404 by design; the free owner tools are covered by pro-dir-business-tools.
test.skip(process.env.E2E_PRO_OFF==='1','Pro surface closed while PRO_ENABLED is off');
test('P2: menu editor, drafts hidden until published, final price public',async({page,context},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const tag=label(),f=await ownerFixture(context,'menu-'+tag),errors=collectPageErrors(page);
 const stranger=await createDisposableAccount({prefix:'dir-menu-stranger'});
 try{
  const db=f.db,headers=headersFor(f.owner),slug=`restaurante-menu-${tag}`;
  const {placeId}=await seedPlace(db,{slug,vertical:'restaurant',name:`Restaurante Menú ${tag}`,phone:'+506 2255 0042'});
  await chooseEdition(db,f.owner.id,'restaurantes');
  // Before the claim the account does not manage the place.
  const before=await context.request.get(`${origin}/api/pro/menu?placeId=${placeId}`,{headers});expect(before.status()).toBe(403);
  await claimByEmail(context,slug);
  const post=async(data:Record<string,unknown>)=>{const r=await context.request.post(`${origin}/api/pro/menu`,{headers,data:{actionId:uid(),placeId,...data}});return {status:r.status(),body:await r.json().catch(()=>null)};};
  const sectionId=uid(),itemId=uid();
  const s=await post({action:'section_create',sectionId,section:{nameEs:'Platos fuertes',nameEn:'Main dishes'}});expect(s.status,JSON.stringify(s.body)).toBe(200);
  const i=await post({action:'item_create',itemId,sectionId,item:{nameEs:'Casado con pollo',nameEn:'Chicken casado',priceMinor:450000}});expect(i.status,JSON.stringify(i.body)).toBe(200);
  // Draft: not public.
  await gotoOK(page,`/lugar/${slug}/menu`);
  await expect(page.locator('[data-menu-item]')).toHaveCount(0);
  const pub=await post({action:'items_publish',itemIds:[itemId]});expect(pub.status,JSON.stringify(pub.body)).toBe(200);
  for(const prefix of ['','/en']){
   await gotoOK(page,`${prefix}/lugar/${slug}/menu`);
   const item=page.locator('[data-menu-item]');await expect(item).toHaveCount(1);
   await expect(item).toContainText(prefix?'Chicken casado':'Casado con pollo');
   await expect(item.locator('[data-menu-total]')).toBeVisible();await expect(item.locator('[data-menu-breakdown]')).toBeVisible();
   await expect(page.locator('[data-menu-price-note]')).toBeVisible();
   await expectNoHorizontalOverflow(page);
   await gotoOK(page,`${prefix}/lugar/${slug}`);
   await expect(page.locator('[data-place-menu-link]')).toHaveText(prefix?'See the menu':'Ver el menú');
  }
  // Stale revision → 409 (another tab changed the section).
  const stale=await post({action:'section_update',sectionId,revision:0,section:{nameEs:'Otro nombre'}});expect(stale.status).toBe(409);
  // Editor page.
  await gotoOK(page,'/dashboard/pro/menu');
  await expect(page.locator(`[data-menu-editor="${placeId}"]`)).toBeVisible({timeout:45000});
  await expect(page.getByText('Casado con pollo').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  // Another account cannot read or write this menu.
  const other=await context.browser()!.newContext();
  try{
   await login(other,stranger);
   const r=await other.request.get(`${origin}/api/pro/menu?placeId=${placeId}`,{headers:{Origin:origin,'X-Pro-Expected-Actor':stranger.id}});expect(r.status()).toBe(403);
  }finally{await other.close();}
  expect(errors()).toEqual([]);
 }finally{await cleanupDisposableAccount(stranger);await f.cleanup();}
});
