import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,login,origin} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {dirDb,hideSeededPlaces,label,postJson,seedPlace,uid} from './pro-dir-fixture';
import {featureShots,randomIp} from './pro-dir-features-fixture';

// Place features round (LOCAL Pro, 2026-11-17): saved lists. Anonymous «Guardar» leads to sign in; a signed-in person
// creates a list from the place page and saves the place (UI), manages it on /listas (share link on/off, rename);
// the shared page /lista/<token> shows only the list name and public places (no name, e-mail or id of the person); a new
// share issues a new token and the old link answers 404; stale revision → 409; another account cannot touch the list.
// Owner of /api/listas, /[locale]/listas and /[locale]/lista/[token].
test.afterEach(()=>hideSeededPlaces());

test('saved lists: save from the place page, private by default, share link without ids, CAS and isolation',async({page,context,browser},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const tag=label(),db=dirDb(),errors=collectPageErrors(page);
 // «Mis listas» has tabs (He estado | Quiero ir | Listas); the lists manager lives in «Listas» and only after hydration.
 const openLists=async(path:string)=>{await gotoOK(page,path);await expect(page.locator('[data-my-lists][data-ready]')).toBeVisible({timeout:45000});await page.locator('[data-lists-tab="lists"]').click();await expect(page.locator('[data-lists-manager][data-ready]')).toBeVisible({timeout:45000});};
 const a=`soda-lista-${tag}`,b=`ferreteria-lista-${tag}`;
 await seedPlace(db,{slug:a,vertical:'restaurant',name:`Soda Lista ${tag}`,adminArea1:'Cartago',locality:'Paraíso'});
 await seedPlace(db,{slug:b,vertical:'hardware',name:`Ferretería Lista ${tag}`,attributes:{kind:'hardware'}});
 let user:DisposableAccount|undefined,other:DisposableAccount|undefined;
 try{
  await context.setExtraHTTPHeaders(randomIp());
  await gotoOK(page,`/negocios/${a}`);
  await expect(page.locator('[data-save-login]')).toHaveAttribute('href',new RegExp(`/login\\?redirect=.*${a}`));
  expect((await postJson(context,'/api/listas',{actionId:uid(),action:'create',listId:uid(),name:'X'})).status).toBe(401);
  user=await createDisposableAccount({prefix:'dir-lists'});await login(context,user);
  const listName=`Sodas ${tag}`;
  await gotoOK(page,`/negocios/${a}`);
  // Phones (owner 2026-11-27): «Guardar» is an option of the bar's «…» sheet (MenuFicha); from lg it sits in the chip row.
  const phone=(page.viewportSize()?.width??1280)<1024;
  const menuItem=(name:string)=>page.locator('[data-menu-ficha]').filter({visible:true}).getByRole('menuitem',{name});
  if(phone)await expect(async()=>{await page.locator('[data-ccr-section-menu]').filter({visible:true}).first().click();await menuItem('Guardar').click({timeout:1500});
   await expect(page.locator('[data-save-new-name]')).toBeVisible({timeout:3000});}).toPass({timeout:45000});
  else{await expect(page.locator('[data-save-to-list][data-ready]').filter({visible:true})).toBeVisible({timeout:45000});
   await page.locator('[data-save-open]').filter({visible:true}).click();}
  await page.locator('[data-save-new-name]').fill(listName);await page.locator('[data-save-create]').click();
  await expect(page.locator(`[data-save-list="${listName}"]`)).toBeChecked({timeout:20000});
  if(phone){await page.keyboard.press('Escape');await page.locator('[data-ccr-section-menu]').filter({visible:true}).first().click();await expect(menuItem('Guardado')).toBeVisible();await page.keyboard.press('Escape');}
  else await expect(page.locator('[data-save-open]').filter({visible:true})).toHaveText('Guardado');
  // Second place through the API (same list).
  const mine=await (await context.request.get(`${origin}/api/listas?slug=${b}`)).json() as {items:{listId:string;revision:number;name:string;hasPlace:boolean}[]};
  const list=mine.items.find(l=>l.name===listName)!;expect(list.hasPlace).toBe(false);
  expect((await postJson(context,'/api/listas',{actionId:uid(),action:'add',listId:list.listId,revision:list.revision,slug:b})).status).toBe(200);
  const stale=await postJson(context,'/api/listas',{actionId:uid(),action:'rename',listId:list.listId,revision:list.revision,name:'Viejo'});
  expect([stale.status,stale.body?.reason]).toEqual([409,'reload']);
  // Another account cannot change it.
  other=await createDisposableAccount({prefix:'dir-lists-other'});const oc=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});await login(oc,other);
  const foreign=await postJson(oc,'/api/listas',{actionId:uid(),action:'remove',listId:list.listId,revision:list.revision+1,slug:a});expect(foreign.status).toBe(404);
  expect(((await (await oc.request.get(`${origin}/api/listas`)).json()) as {items:unknown[]}).items).toEqual([]);
  await oc.close();

  // /listas: private by default, create a share link.
  for(const language of ['es','en'] as const){
   const prefix=language==='en'?'/en':'/es';
   await openLists(`${prefix}/listas`);
   const card=page.locator(`[data-list="${listName}"]`);await expect(card).toBeVisible();
   await expect(card).toContainText(language==='en'?'Private: only you can see it.':'Privada: solo usted la ve.');
  }
  await openLists('/es/listas');
  const card=page.locator(`[data-list="${listName}"]`);
  await card.locator('[data-list-share="on"]').click();
  const link=card.locator('[data-list-share-link]');await expect(link).toHaveValue(/\/lista\/[a-f0-9]{32}$/);
  const url=new URL(await link.inputValue()),token=url.pathname.split('/').pop()!;
  expect(token).not.toContain(user.id.replace(/-/g,'').slice(0,8));expect(token).not.toContain(list.listId.replace(/-/g,'').slice(0,8));
  await expectNoHorizontalOverflow(page);
  await featureShots(page,'my-lists-es',info);

  // Shared page in a fresh, anonymous context: name + public places only.
  const anon=await browser.newContext({baseURL:origin});const s=await anon.newPage();
  for(const language of ['es','en'] as const){
   const prefix=language==='en'?'/en':'/es';
   await gotoOK(s,`${prefix}/lista/${token}`);
   await expect(s.locator('[data-shared-list] h1')).toHaveText(listName);
   await expect(s.locator('[data-shared-place]')).toHaveCount(2);
   const html=await s.content();
   for(const secret of [user.id,user.email,list.listId])expect(html).not.toContain(secret);
   await expectNoHorizontalOverflow(s);
   await featureShots(s,`saved-list-${language}`,info);
  }
  // Re-share: new token, old one 404.
  await card.locator('[data-list-share="off"]').click();
  await expect(card.locator('[data-list-share="on"]')).toBeVisible();
  expect((await s.goto(`/lista/${token}`))?.status()).toBe(404);
  await card.locator('[data-list-share="on"]').click();
  await expect(card.locator('[data-list-share-link]')).not.toHaveValue(new RegExp(token));
  await anon.close();
  expect(errors()).toEqual([]);
 }finally{await cleanupDisposableAccount(user);await cleanupDisposableAccount(other);}
});
