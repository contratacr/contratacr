import {test,expect} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,login,origin} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {openPlaceTab, claimByEmail,dirDb,hideSeededPlaces,label,postJson,seedPlace,uid} from './pro-dir-fixture';

// Launch without Pro (2026-11-18): «Mi negocio» (/dashboard/negocio/*, /api/negocio/*). An account WITHOUT any Pro
// membership claims a restaurant and uses the free owner tools: contact + hours (shown on the public page), menu editor
// (no menu-from-photo), table reservations, events/«Pedir», and the public reply to a review (now /api/negocio/respuestas).
// Strangers are refused; a Pro company member with the «member» role cannot publish a reply.
test.afterEach(()=>hideSeededPlaces());
const shots=process.env.BUSINESS_SHOTS_DIR;
async function shot(page:import('playwright/test').Page,name:string,project:string){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage:true});}

for(const language of ['es','en'] as const)test(`Mi negocio without Pro: profile, hours, menu, reservations, events, reply [${language}]`,async({page,context,browser},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const en=language==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'',db=dirDb(),tag=label(),slug=`soda-negocio-${tag}`,project=info.project.name;
 await seedPlace(db,{slug,vertical:'restaurant',name:`Soda Negocio ${tag}`,phone:'+506 2244 0012'});
 const errors=collectPageErrors(page);
 let owner:DisposableAccount|undefined,other:DisposableAccount|undefined,member:DisposableAccount|undefined;
 try{
  owner=await createDisposableAccount({prefix:'dir-biz-owner'});
  expect((await db.from('pro_memberships').select('user_id').eq('user_id',owner.id)).data).toEqual([]);
  await login(context,owner);await claimByEmail(context,slug);
  const placeId=(await db.from('dir_places').select('id').eq('slug',slug).single()).data!.id as string;

  // Hub
  await gotoOK(page,`${prefix}/dashboard/negocio`);
  const card=page.locator(`[data-business-place="${slug}"]`);await expect(card).toBeVisible();
  await expect(card).toContainText(t('Dueño','Owner'));await expect(page.locator('[data-business-nav-link="menu"]')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Pro ›');await expectNoHorizontalOverflow(page);await shot(page,`negocio-hub-${language}`,project);

  // Contact + hours
  await gotoOK(page,`${prefix}/dashboard/negocio/perfil?lugar=${slug}`);
  const contact=page.locator('[data-business-contact-form]');await expect(contact.getByLabel(t('Teléfono','Phone'))).toHaveValue('+506 2244 0012',{timeout:30000});
  await contact.getByLabel(t('Sitio web','Website')).fill('https://soda-negocio.example.test');
  await contact.getByLabel(t('Teléfono','Phone')).fill('2244 0099');
  await contact.getByRole('button',{name:t('Guardar contacto','Save contact')}).click();
  await expect(page.locator('[data-business-profile-msg="ok"]')).toBeVisible();
  const hours=page.locator('[data-business-hours-form]');
  const sunday=hours.locator('[data-business-day="0"]');await expect(sunday.getByLabel(t('Cerrado','Closed'))).toBeChecked();
  await hours.locator('[data-business-day="1"]').getByLabel(t('Cerrado','Closed')).uncheck();
  await hours.locator('[data-business-day="1"] input[type="time"]').first().fill('07:30');
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/negocio/perfil')&&r.request().method()==='POST'&&(r.request().postData()??'').includes('"hours"'));
  await hours.getByRole('button',{name:t('Guardar horario','Save hours')}).click();
  expect((await saved).status()).toBe(200);
  await expect(hours.locator('[data-business-profile-msg="ok"]')).toBeVisible();
  await expectNoHorizontalOverflow(page);await shot(page,`negocio-perfil-${language}`,project);
  const pub=(await db.rpc('dir_place_public',{p_slug:slug})).data as {website:string;phone:string;hours:{weekday:number;opens:string}[]};
  expect([pub.website,pub.phone]).toEqual(['https://soda-negocio.example.test','2244 0099']);
  expect(pub.hours).toEqual([{weekday:1,opens:'07:30',closes:'17:00'}].map(h=>expect.objectContaining(h)));
  const prov=(await db.from('dir_field_provenance').select('source_id').eq('place_id',placeId).eq('field','website')).data!;expect(prov.at(-1)?.source_id).toBe('owner');
  // Stale revision → 409; strict fields → 400
  const stale=await postJson(context,'/api/negocio/perfil',{actionId:uid(),placeId,revision:1,action:'contact',place:{phone:'2244 0000'}});expect(stale.status).toBe(409);
  expect((await postJson(context,'/api/negocio/perfil',{actionId:uid(),placeId,revision:9,action:'contact',place:{name:'Otro nombre'}})).status).toBe(400);

  // Menu (no edition, no photo import)
  await gotoOK(page,`${prefix}/dashboard/negocio/menu`);
  await expect(page.locator('[data-business-menu-page]')).toBeVisible();
  await expect(page.getByText(t('Importar desde una foto del menú','Import from a photo of the menu'))).toHaveCount(0);
  await expect(page.getByRole('heading',{level:1})).toBeVisible();await expectNoHorizontalOverflow(page);await shot(page,`negocio-menu-${language}`,project);
  const menu=await page.request.get(`/api/negocio/menu?placeId=${placeId}`);expect(menu.status()).toBe(200);

  // Table reservations + events
  await gotoOK(page,`${prefix}/dashboard/negocio/reservas`);
  await expect(page.locator('[data-business-reservations-page]')).toBeVisible();await expect(page.locator('[data-table-res-off]')).toHaveCount(0);
  await expect(page.locator('[data-table-res-no-place]')).toHaveCount(0);
  const res=await page.request.get(`/api/negocio/reservas?placeId=${placeId}`);expect(res.status()).toBe(200);
  await expectNoHorizontalOverflow(page);await shot(page,`negocio-reservas-${language}`,project);
  await gotoOK(page,`${prefix}/dashboard/negocio/lugar`);
  await expect(page.locator(`[data-place-tools="${placeId}"]`)).toBeVisible({timeout:30000});
  await expect(page.locator('[data-event-new]')).toBeVisible();await expectNoHorizontalOverflow(page);await shot(page,`negocio-lugar-${language}`,project);

  // Reply to a review from the public page (now /api/negocio/respuestas; no Pro)
  const rv=await db.rpc('dir_review_submit',{p_actor:uid(),p_input:{actionId:uid(),reviewId:uid(),slug,revision:0,rating:4,comment:t('Buen casado y buena atención en general.','Good casado and good service overall.'),authorName:'Ana'}});
  expect(rv.error).toBeNull();const reviewId=(rv.data as {reviewId:string}).reviewId;
  await gotoOK(page,`${prefix}/lugar/${slug}`);
  await openPlaceTab(page,'info');
  // «Administrar esta ficha»: only for the owner/managers of this place (a stranger does not see it, checked below).
  await expect(page.locator('[data-place-manage-link]')).toHaveAttribute('href',`${prefix}/dashboard/negocio`);
  await page.locator('[data-place-manage]').scrollIntoViewIfNeeded();await shot(page,`negocio-ficha-administrar-${language}`,project);await openPlaceTab(page,'reviews');
  const editor=page.locator(`[data-owner-reply-editor="${reviewId}"][data-ready]`);await expect(editor).toBeVisible({timeout:45000});
  const replyReq=page.waitForRequest(r=>r.url().endsWith('/api/negocio/respuestas')&&r.method()==='POST');
  await editor.getByRole('button',{name:t('Responder como la empresa','Reply as the business')}).click();
  await editor.getByLabel(t('Respuesta pública de la empresa (máximo 1000 caracteres, sin enlaces)','Public reply from the business (up to 1000 characters, no links)')).fill(t('Gracias por venir.','Thanks for coming.'));
  await editor.getByRole('button',{name:t('Publicar respuesta','Post reply')}).click();await replyReq;
  await expect(editor.locator('[data-owner-reply-saved]')).toBeVisible();

  // Account panel entry
  await gotoOK(page,`${prefix}/dashboard/profesional`);
  await expect(page.locator('[data-business-entry-link]')).toBeVisible({timeout:45000});
  // Account menu entry «Mi negocio» (desktop header menu), shown because this account manages a place.
  const menuButton=page.locator('[data-account-menu-button]:visible').first();
  if(await menuButton.count()){await menuButton.click();await expect(page.locator('[data-account-business]')).toBeVisible();await shot(page,`negocio-menu-cuenta-${language}`,project);await page.keyboard.press('Escape');}

  // Strangers and Pro company members with the «member» role are refused.
  other=await createDisposableAccount({prefix:'dir-biz-other'});const oc=await browser.newContext({baseURL:origin});await login(oc,other);
  const foreign=await oc.request.get(`/api/negocio/perfil?placeId=${placeId}`);expect(foreign.status()).toBe(403);
  {const op=await oc.newPage();await gotoOK(op,`${prefix}/lugar/${slug}`);await expect(op.locator('[data-place-manage]')).toHaveCount(0);await op.close();}
  const foreignWrite=await postJson(oc,'/api/negocio/lugar',{op:'order',input:{actionId:uid(),placeId,revision:0,channel:'phone',value:'2222 3333'}});expect(foreignWrite.status).toBe(403);
  const hub=await oc.request.get('/api/negocio');expect((await hub.json()).places).toEqual([]);await oc.close();
  member=await createDisposableAccount({prefix:'dir-biz-member'});
  await db.from('pro_company_members').insert({owner_id:owner.id,member_user_id:member.id,member_name:'Miembro '+tag,member_email:member.email,role:'member'}).throwOnError();
  const mc=await browser.newContext({baseURL:origin});await login(mc,member);
  await mc.addCookies([{name:'ccr_pro_ws',value:owner.id,url:origin,httpOnly:true,sameSite:'Lax'}]);
  const asMember=await postJson(mc,'/api/negocio/respuestas',{actionId:uid(),reviewId,reply:'Respuesta del equipo',replyRevision:1});
  // Pro on: the team path applies and the «member» role is refused; Pro off: no team path at all, not a manager.
  expect([asMember.status,asMember.body?.reason]).toEqual([403,process.env.E2E_PRO_OFF==='1'?'reply_not_manager':'reply_role']);
  expect((await mc.request.get('/api/negocio')).ok()).toBe(true);await mc.close();
  expect(errors()).toEqual([]);
 }finally{
  if(member&&owner)await db.from('pro_company_members').update({active:false}).eq('owner_id',owner.id).eq('member_user_id',member.id);
  for(const a of [member,other,owner])await cleanupDisposableAccount(a);
 }
});
