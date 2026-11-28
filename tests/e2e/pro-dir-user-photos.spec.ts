import {test,expect,type Page,type Locator} from 'playwright/test';
import sharp from 'sharp';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,login,origin} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {dirDb,hideSeededPlaces,label,openPlaceTab,seedPlace,uid} from './pro-dir-fixture';
import {randomIp} from './pro-dir-features-fixture';

// 547 (LOCAL, 2026-11-27, owner: «que la gente suba fotos y comentarios», Google Maps / Yelp model). Customers add photos
// with a category (Menú only in food places) and the rights checkbox; they stay pending until staff approves; approved
// ones show in the Fotos filters with «Foto de <nombre>», menu photos open the «Menú» tab of a restaurant without a typed
// menu; empty Fotos tab invites the first photos; a review posted without photos asks «¿Tiene fotos? Agréguelas»; a
// review can carry photos; /yo counts and lists the person's photos; the photo route refuses foreign-site hotlinks.
// Phones first: run with --project=chromium-mobile (390 px). Owner of place-photos-tab.tsx and the 547 changes.
test.afterEach(()=>hideSeededPlaces());
const jpeg=(color:string)=>sharp({create:{width:1200,height:900,channels:3,background:color}}).jpeg().toBuffer();
const shotsDir=process.env.USER_PHOTOS_SHOTS_DIR;
const shot=async(page:Page,name:string)=>{if(shotsDir)await page.screenshot({path:`${shotsDir}/${name}.png`,fullPage:true});};
/** No text inside `scope` is cut: no ellipsis and nothing wider than its box. */
async function expectNoCutText(scope:Locator){
 const cut=await scope.evaluate(root=>[...root.querySelectorAll<HTMLElement>('*')].filter(el=>{const cs=getComputedStyle(el);
  return el.childNodes.length>0&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent!.trim())&&(cs.textOverflow==='ellipsis'&&el.scrollWidth>el.clientWidth||el.scrollWidth>el.clientWidth+1&&cs.overflowX!=='auto'&&cs.overflowX!=='scroll');}).map(el=>el.textContent!.trim().slice(0,60)));
 expect(cut).toEqual([]);
}

test('customer photos + Ver menú fallback: category + rights → pending → approved in Fotos filters and Menú tab; review photos; /yo; hotlinks',async({browser},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const db=dirDb(),tag=label(),slug=`soda-clientes-${tag}`,name=`Soda Clientes ${tag}`,bank=`banco-clientes-${tag}`;
 const {placeId}=await seedPlace(db,{slug,vertical:'restaurant',name});
 await seedPlace(db,{slug:bank,vertical:'banking',name:`Banco Clientes ${tag}`});
 const cafe=`cafe-sitio-${tag}`,bakery=`panaderia-ig-${tag}`;
 await seedPlace(db,{slug:cafe,vertical:'cafe_bar',name:`Café Sitio ${tag}`,website:'https://cafe-sitio.example.com/',attributes:{menuUrl:'https://cafe-sitio.example.com/menu'}});
 await seedPlace(db,{slug:bakery,vertical:'food_shop',name:`Panadería IG ${tag}`,attributes:{kind:'bakery',social:{instagram:'https://www.instagram.com/panaderia_ig'}}});
 let customer:DisposableAccount|undefined;
 const anon=await browser.newContext({baseURL:origin,viewport:{width:390,height:844}});const a=await anon.newPage();const aErrors=collectPageErrors(a);
 try{
  // «Ver menú» fallback while ContrataCR has no menu: explicit menu URL > website > Instagram > Facebook > Google Maps; link only.
  await gotoOK(a,`/negocios/${cafe}`);await openPlaceTab(a,'offer');
  let ext=a.locator('[data-place-menu-fallback="menu"] [data-place-menu-external]');
  await expect(ext).toHaveText('Ver menú en su sitio web');await expect(ext).toHaveAttribute('href','https://cafe-sitio.example.com/menu');
  await expect(ext).toHaveAttribute('target','_blank');await expect(ext).toHaveAttribute('rel','noopener noreferrer nofollow');
  await gotoOK(a,`/negocios/${bakery}`);await openPlaceTab(a,'offer');
  await expect(a.locator('[data-place-menu-fallback="instagram"] [data-place-menu-external]')).toHaveText('Ver menú en Instagram');
  // Empty Fotos tab: «Sea el primero en agregar fotos» + «Agregar foto del menú»; the Menú tab only has the Google Maps link.
  await gotoOK(a,`/negocios/${slug}`);await openPlaceTab(a,'offer');
  const fb=a.locator('[data-place-menu-fallback="maps"]');
  await expect(fb).toContainText('Este negocio aún no tiene su menú en ContrataCR');
  ext=fb.locator('[data-place-menu-external]');await expect(ext).toHaveText('Ver menú en Google Maps');
  expect(await ext.getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Soda%20Clientes/);
  await expect(fb.locator('[data-place-photo-add]')).toContainText('Agregar foto del menú');
  await expectNoCutText(fb);await expectNoHorizontalOverflow(a);await shot(a,'menu-ver-en-maps-390');
  await openPlaceTab(a,'photos');
  const empty=a.locator('[data-place-photos-empty]');
  await expect(empty).toContainText('Sea el primero en agregar fotos');
  await expect(empty.locator('[data-place-photo-add]')).toHaveCount(2);
  await expect(empty).toContainText('Agregar foto del menú');
  await expectNoCutText(empty);await expectNoHorizontalOverflow(a);await shot(a,'fotos-vacio-390');
  // A bank has no «Menú» category or CTA.
  await gotoOK(a,`/negocios/${bank}`);await openPlaceTab(a,'photos');
  await expect(a.locator('[data-place-photos-empty]')).not.toContainText('menú');
  await expect(a.locator('[data-place-tab="offer"]')).toHaveCount(0);

  customer=await createDisposableAccount({prefix:'dir-user-photos'});
  const by=((await db.from('profiles').select('full_name').eq('id',customer.id).maybeSingle()).data?.full_name as string|null)?.trim();
  const c=await browser.newContext({baseURL:origin,viewport:{width:390,height:844},extraHTTPHeaders:randomIp()});const p=await c.newPage();const pErrors=collectPageErrors(p);
  try{
   await login(c,customer);
   await gotoOK(p,`/negocios/${slug}`);await openPlaceTab(p,'photos');
   // «Agregar foto del menú» opens the panel with Menú already chosen; the rights checkbox is required.
   await p.locator('[data-place-photos-empty] [data-place-photo-open]').filter({hasText:'Agregar foto del menú'}).click();
   let panel=p.locator('[data-place-photo-panel]').filter({visible:true});
   await expect(panel.locator('[data-place-photo-category-option="menu"]')).toBeChecked();
   await expect(panel.locator('[data-place-photo-category]')).toContainText('Comida y bebida');
   await panel.locator('[data-photo-input]').setInputFiles({name:'menu-del-dia-con-un-nombre-de-archivo-largo.jpg',mimeType:'image/jpeg',buffer:await jpeg('#264653')});
   await expect(panel.locator('[data-place-photo-submit]')).toBeDisabled();
   await expectNoCutText(panel);await expectNoHorizontalOverflow(p);await shot(p,'panel-menu-390');
   await panel.locator('[data-place-photo-rights] input').check();
   await panel.locator('[data-place-photo-submit]').click();
   await expect(p.locator('[data-place-photo-pending]').filter({visible:true})).toContainText('pendiente de revisión',{timeout:45000});
   // Second photo from the general button: a category must be chosen before uploading.
   await gotoOK(p,`/negocios/${slug}`);await openPlaceTab(p,'photos');
   await p.locator('[data-place-photos-empty] [data-place-photo-open]').filter({hasText:'Agregar fotos'}).click();
   panel=p.locator('[data-place-photo-panel]').filter({visible:true});
   await panel.locator('[data-photo-input]').setInputFiles({name:'salon.jpg',mimeType:'image/jpeg',buffer:await jpeg('#e9c46a')});
   await panel.locator('[data-place-photo-rights] input').check();
   await expect(panel.locator('[data-place-photo-submit]')).toBeDisabled();
   await panel.locator('label:has([data-place-photo-category-option="interior"])').click();
   await panel.locator('[data-place-photo-submit]').click();
   await expect(p.locator('[data-place-photo-pending]').filter({visible:true})).toContainText('pendiente de revisión',{timeout:45000});

   // Review without photos → «¿Tiene fotos? Agréguelas».
   await openPlaceTab(p,'reviews');
   const form=p.locator('[data-place-review-form][data-ready]');
   await form.getByRole('button',{name:'5 estrellas',exact:true}).click({timeout:45000});
   await form.locator('textarea').fill('Buen casado y atención rápida.');
   await form.getByRole('button',{name:'Enviar reseña'}).click();
   const ask=p.locator('[data-place-review-ask-photos]');
   await expect(ask).toContainText('¿Tiene fotos? Agréguelas');await expectNoCutText(ask);await shot(p,'resena-tiene-fotos-390');
   // A review with an attached photo (bank: service reviews) → the photo is tied to the review and pending.
   await gotoOK(p,`/negocios/${bank}`);await openPlaceTab(p,'reviews');
   const bform=p.locator('[data-place-review-form][data-ready]');
   await bform.getByRole('button',{name:'4 estrellas',exact:true}).click({timeout:45000});
   await bform.locator('[data-place-review-photos] [data-photo-input]').setInputFiles({name:'fila.jpg',mimeType:'image/jpeg',buffer:await jpeg('#8ab17d')});
   await bform.locator('[data-place-review-photo-rights] input').check();
   await bform.locator('textarea').fill('Atención amable y poca espera en caja.');
   await bform.getByRole('button',{name:'Enviar reseña'}).click();
   await expect(p.locator('[data-place-review-photos-pending]')).toContainText('pendiente',{timeout:45000});
   await expect(p.locator('[data-place-review-ask-photos]')).toHaveCount(0);
  }finally{expect(pErrors()).toEqual([]);await c.close();}

  const rows=(await db.from('dir_place_media').select('id,status,category,review_id,place_id').eq('uploader_id',customer.id).order('created_at')).data!;
  expect(rows.map(r=>[r.status,r.category,!!r.review_id])).toEqual([['pending','menu',false],['pending','interior',false],['pending',null,true]]);
  const [menu,inside]=rows;
  expect((await a.request.get(`/api/fotos-lugar/${menu!.id}?s=320`)).status()).toBe(404);
  for(const r of [menu!,inside!]){
   const ok=await db.rpc('dir_admin_photo_moderate',{p_actor:uid(),p_input:{actionId:uid(),mediaId:r.id,decision:'approve',expectedStatus:'pending'}});expect(ok.error).toBeNull();
  }
  // Hotlinks: a foreign site's Referer → 403 (not cached); no Referer (crawlers, e-mail, app) and our own pages → 200.
  const img=`/api/fotos-lugar/${menu!.id}?s=320`;
  const foreign=await a.request.get(img,{headers:{referer:'https://copiador.example/pagina'}});expect(foreign.status()).toBe(403);expect(foreign.headers()['cache-control']).toBe('no-store');
  expect((await a.request.get(img)).status()).toBe(200);
  expect((await a.request.get(img,{headers:{referer:`${origin}/negocios/${slug}`}})).status()).toBe(200);

  // Approved: «Menú (fotos de clientes)» opens the Menú tab; Fotos filters by category; «Foto de <nombre>» in the lightbox.
  await gotoOK(a,`/negocios/${slug}`);
  await openPlaceTab(a,'offer');
  const menuBox=a.locator('[data-place-menu-photos]');
  await expect(menuBox).toContainText('Menú (fotos de clientes)');await expect(menuBox.locator('[data-place-photo-thumb]')).toHaveCount(1);
  // Now ContrataCR has a menu here: the external link is gone.
  await expect(a.locator('[data-place-menu-fallback]')).toHaveCount(0);
  await expectNoCutText(menuBox);await shot(a,'menu-fotos-clientes-390');
  // The header avatar shows the place (interior), not the menu photo.
  await expect(a.locator('[data-place-header] [data-place-avatar="photo"] img')).toHaveAttribute('src',`/api/fotos-lugar/${inside!.id}?s=320`);
  await openPlaceTab(a,'photos');
  const filters=a.locator('[data-place-photo-filters]');
  await expect(filters.locator('[data-place-photo-filter]')).toHaveText(['Todas (2)','Menú (1)','Interior (1)']);
  const tab=a.locator('section[data-place-photos]');
  await expect(tab.locator('[data-place-photo-thumb]')).toHaveCount(2);
  await filters.locator('[data-place-photo-filter="interior"]').click();
  await expect(tab.locator('[data-place-photo-thumb]')).toHaveCount(1);
  await expect(tab.locator('img').first()).toHaveAttribute('draggable','false');
  await expectNoCutText(tab);await expectNoHorizontalOverflow(a);await shot(a,'fotos-filtro-390');
  // 360 px (small Android): filters and the Menú tab still wrap, nothing cut.
  await a.setViewportSize({width:360,height:780});
  await expectNoCutText(tab);await expectNoHorizontalOverflow(a);await shot(a,'fotos-filtro-360');
  await openPlaceTab(a,'offer');await expectNoCutText(a.locator('[data-place-menu-photos]'));await expectNoHorizontalOverflow(a);
  await openPlaceTab(a,'photos');await a.setViewportSize({width:390,height:844});
  await tab.locator('[data-place-photo-thumb]').first().click();
  const box=a.locator('[data-place-lightbox]');await expect(box).toBeVisible();
  if(by)await expect(box.locator('[data-photo-by]')).toHaveText(`Foto de ${by}`);
  await expect(box.locator('[data-photo-report]')).toBeVisible();
  await a.keyboard.press('Escape');
  expect(aErrors()).toEqual([]);

  // /yo: photos counter (approved) and the list with each photo's state.
  const me=await browser.newContext({baseURL:origin,viewport:{width:390,height:844}});const m=await me.newPage();
  try{
   await login(me,customer);await gotoOK(m,'/yo');
   await expect(m.locator('[data-me-counters]')).toContainText('2');
   await m.locator('[data-me-impact]').getByRole('tab',{name:'Fotos'}).click();
   const list=m.locator('[data-me-photos]');
   await expect(list.locator('[data-me-photo="approved"]')).toHaveCount(2);await expect(list.locator('[data-me-photo="pending"]')).toHaveCount(1);
   await expect(list).toContainText('Pendiente de revisión');
   await expectNoCutText(list);await expectNoHorizontalOverflow(m);await shot(m,'yo-fotos-390');
  }finally{await me.close();}
  expect(placeId).toBeTruthy();
 }finally{await anon.close();await cleanupDisposableAccount(customer);}
});

test('«¿Sabe si este lugar…?»: one question at a time, never a known key; 3 matching answers → «Según clientes»',async({browser},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const db=dirDb(),tag=label(),slug=`soda-preguntas-${tag}`;
 const {placeId}=await seedPlace(db,{slug,vertical:'restaurant',name:`Soda Preguntas ${tag}`,attributes:{reservations:true}});
 // Two earlier customers already said «Sí» to delivery.
 for(let n=0;n<2;n++){const r=await db.rpc('dir_place_attribute_answer',{p_actor:uid(),p_input:{slug,key:'delivery',answer:'yes'}});expect(r.error).toBeNull();}
 const user=await createDisposableAccount({prefix:'dir-attr'});
 const c=await browser.newContext({baseURL:origin,viewport:{width:360,height:780},extraHTTPHeaders:randomIp()});const p=await c.newPage();const errors=collectPageErrors(p);
 try{
  // Without a session the card is there, its buttons lead to the login.
  await gotoOK(p,`/negocios/${slug}`);await openPlaceTab(p,'info');
  let card=p.locator('[data-place-attr-question][data-where="info"]');
  // reservations is already on the place (business/import value wins): the first question is delivery.
  await expect(card).toHaveAttribute('data-place-attr-question','delivery');
  await expect(card).toContainText('¿Sabe si este lugar tiene servicio a domicilio (exprés)?');
  await expectNoCutText(card);await expectNoHorizontalOverflow(p);await shot(p,'pregunta-info-360');
  await login(c,user);
  await gotoOK(p,`/negocios/${slug}`);await openPlaceTab(p,'info');
  card=p.locator('[data-place-attr-question][data-where="info"]');
  await card.locator('[data-attr-answer="yes"]').click();
  await expect(card.locator('[data-place-attr-thanks]')).toBeVisible();
  await expect(card).toHaveAttribute('data-place-attr-question','takeaway');
  // Third matching answer → confirmed: «Servicio a domicilio» with «Según clientes»; never asked again.
  await gotoOK(p,`/negocios/${slug}`);await openPlaceTab(p,'info');
  const row=p.locator('[data-place-amenity="community:delivery"]');
  await expect(row).toContainText('Servicio a domicilio');await expect(row.locator('[data-place-amenity-community]')).toHaveText('Según clientes');
  await expect(p.locator('[data-place-attr-question="delivery"]')).toHaveCount(0);
  await expectNoCutText(p.locator('#comodidades'));await shot(p,'segun-clientes-360');
  const rows=(await db.from('dir_place_attribute_answers').select('key,answer').eq('place_id',placeId).eq('user_id',user.id)).data;
  expect(rows).toEqual([{key:'delivery',answer:'yes'}]);
  // After a review: the question card (next open key) under the form.
  await openPlaceTab(p,'reviews');
  const form=p.locator('[data-place-review-form][data-ready]');
  await form.getByRole('button',{name:'4 estrellas',exact:true}).click({timeout:45000});
  await form.locator('textarea').fill('Buena sazón y precios justos.');
  await form.getByRole('button',{name:'Enviar reseña'}).click();
  const after=p.locator('[data-place-attr-question][data-where="review"]');
  await expect(after).toHaveAttribute('data-place-attr-question','takeaway');
  await after.locator('[data-attr-answer="unsure"]').click();
  await expect(after.locator('[data-place-attr-thanks]')).toBeVisible();
  await expectNoCutText(after);await expectNoHorizontalOverflow(p);
  // A key the place already settles is refused by the API.
  const bad=await p.request.post(`/api/lugar/${slug}/atributos`,{data:{key:'reservations',answer:'no'},headers:{origin}});expect(bad.status()).toBe(400);
  expect(errors()).toEqual([]);
 }finally{await c.close();await cleanupDisposableAccount(user);}
});
