import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,login,origin} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {openPlaceTab, dirDb,hideSeededPlaces,isNextDevServer,label,postJson,readClaimMailbox,seedPlace,uid,visibleHtml} from './pro-dir-fixture';

// Multivertical F3/F5 + P1 (LOCAL Pro): claim of a place by the e-mail already on it (email_listed, owner decision
// 2026-11-17: e-mail instead of SMS; mock sender, the code is read from the local test mailbox, never shown on the page),
// SMS (phone_listed) refused while DIR_CLAIM_SMS_ENABLED is off, free mailboxes refused for the website-domain method,
// reviews with and without account (guest only after contacting the business from this device), price observations on
// the place page (source, date, stale greyed) and the hard Rx rule. Owner of /api/lugar/[slug]/(reclamo|contacto|resenas)
// and /api/reclamos/[id]/(codigo|verificar|buzon-prueba). CLAIM_EMAIL_SHOTS_DIR=<dir> also saves claim-page screenshots
// (1440 and 390 wide).
test.afterEach(()=>hideSeededPlaces());

const shotsDir=process.env.CLAIM_EMAIL_SHOTS_DIR;
for(const language of ['es','en'] as const)test(`F3: claim by the e-mail on the place, code from the mock outbox [${language}]`,async({page,context},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const en=language==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'',db=dirDb(),tag=label(),slug=`soda-reclamo-${tag}`;
 // Synthetic, non-deliverable address (.test); the mock sender records it and nothing is ever sent.
 await seedPlace(db,{slug,vertical:'restaurant',name:`Soda Reclamo ${tag}`,phone:'+506 2244 0007',website:`https://soda${tag}.cr`,email:`sodareclamo${tag}@negocio-e2e.test`});
 const masked=`so***@negocio-e2e.test`;
 await context.setExtraHTTPHeaders({'x-forwarded-for':`10.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}`});// own rate-limit bucket (several claim calls per test)
 const errors=collectPageErrors(page);
 const shot=async(name:string)=>{if(!shotsDir)return;for(const width of [1440,390]){await page.setViewportSize({width,height:width>800?900:844});
  await page.locator('[data-place-claim]').screenshot({path:`${shotsDir}/${name}-${language}-${width}-${info.project.name}.png`});}};
 // Anonymous: the place page carries only the compact claim link (2026-11-19, Yelp model); the claim page explains
 // what claiming gives and invites to sign in; the API refuses.
 await gotoOK(page,`${prefix}/lugar/${slug}`);
 await expect(page.locator('[data-claim-benefits]')).toHaveCount(0);
 await expect(page.locator('[data-place-claim-link] a')).toHaveAttribute('href',`${prefix}/lugar/${slug}/reclamar`);
 await gotoOK(page,`${prefix}/lugar/${slug}/reclamar`);
 await expect(page.getByRole('heading',{name:t('¿Es su negocio? Reclámelo gratis','Is this your business? Claim it for free')})).toBeVisible();
 const benefits=page.locator('[data-claim-benefits]');
 await expect(benefits.getByRole('heading',{name:t('¿Qué gana al reclamar su negocio?','What do you get by claiming your business?')})).toBeVisible();
 // Restaurant (2026-11-17): benefits tailored to the section — menu, reservations, «Pedir», events.
 await expect(benefits.locator('li')).toHaveCount(process.env.E2E_PRO_OFF==='1'?8:9);
 await expect(benefits).toContainText(t('Publicar su menú con precios finales.','Publish your menu with final prices.'));
 await expect(benefits).toContainText(t('Recibir reservas de mesa','Take table reservations'));
 await expect(benefits).toContainText(t('Responder las reseñas','Reply to your customers'));
 await expect(page.locator('[data-claim-neutrality]')).toHaveText(t('No puede pagar para salir primero ni borrar reseñas.','You cannot pay to appear first or to remove reviews.'));
 await expect(page.getByRole('link',{name:t('Inicie sesión para reclamar','Sign in to claim')})).toBeVisible();
 expect((await postJson(page,`/api/lugar/${slug}/reclamo`,{actionId:uid(),claimId:uid(),method:'email_listed'})).status).toBe(401);
 // Let the anonymous page finish hydrating before the signed-in navigation (WebKit reports an aborted chunk load as a page error).
 await expect(page.locator('[data-place-claim][data-ready]')).toBeVisible({timeout:45000});
 const user=await createDisposableAccount({prefix:'dir-claim'});
 try{
  await login(context,user);
  // SMS is off: phone_listed refused cleanly; a typed address is never accepted for email_listed.
  const smsOff=await postJson(context,`/api/lugar/${slug}/reclamo`,{actionId:uid(),claimId:uid(),method:'phone_listed'});
  expect(smsOff.status).toBe(400);expect(smsOff.body?.reason).toBe('claim_sms_disabled');
  expect((await postJson(context,`/api/lugar/${slug}/reclamo`,{actionId:uid(),claimId:uid(),method:'email_listed',email:'otra@gmail.com'})).status).toBe(400);
  await gotoOK(page,`${prefix}/lugar/${slug}/reclamar`);
  await expect(page.locator('[data-place-claim][data-ready]')).toBeVisible({timeout:45000});
  // Order: (a) code to the listed e-mail, (b) website-domain e-mail, then documents / cédula jurídica. No SMS choice.
  const choices=page.locator('[data-claim-choices] > li');
  await expect(choices).toHaveCount(2);
  await expect(choices.nth(0)).toHaveAttribute('data-claim-method','email_listed');
  await expect(choices.nth(1)).toHaveAttribute('data-claim-method','email_domain');
  await expect(page.locator('[data-claim-method="phone_listed"]')).toHaveCount(0);
  await expect(page.locator('[data-claim-reviewed]')).toBeVisible();
  await expect(page.locator('[data-claim-email-masked]')).toHaveText(masked);
  expect(await visibleHtml(page)).not.toContain(`sodareclamo${tag}@`);
  await expectNoHorizontalOverflow(page);
  await shot('claim-choices');
  // Free mailbox on the website-domain method: refused, nothing opened.
  await page.getByLabel(t(`Su correo en soda${tag}.cr`,`Your e-mail on soda${tag}.cr`)).fill('duena@gmail.com');
  await page.getByRole('button',{name:t('Enviar código a este correo','Send code to this e-mail')}).click();
  await expect(page.locator('[data-place-claim-error]')).toContainText(t('no se aceptan Gmail','Gmail, Hotmail and other free mailboxes are not accepted'));
  // Code to the listed e-mail.
  await page.getByRole('button',{name:t('Enviar código al correo','Send code to the e-mail')}).click();
  await expect(page.locator(`[data-claim-sent-to="${masked}"]`)).toContainText(t('Enviamos un código al correo','We sent a code to the e-mail'));
  await expect(page.locator('[data-claim-dev-code]')).toHaveCount(0);
  // A production build never shows the test-mailbox hint (claim-local-echo.ts); a local production build still reads
  // the mock code through the DIR_TEST_MAILBOX loopback route below. Which build runs is read from the server.
  if(await isNextDevServer())await expect(page.locator('[data-claim-test-mailbox]')).toBeVisible();
  else await expect(page.locator('[data-claim-test-mailbox]')).toHaveCount(0);
  const claimId=(await db.from('dir_place_claims').select('id,method,status,contact_email').eq('place_id',(await db.from('dir_places').select('id').eq('slug',slug).single()).data!.id).eq('status','code_sent').single()).data!;
  expect([claimId.method,claimId.contact_email]).toEqual(['email_listed',null]);
  const mail=await readClaimMailbox(context,claimId.id);
  expect(mail.to).toBe(masked);expect(mail.subject).toContain(t('código','code'));expect(mail.text).toContain(mail.code!);
  await shot('claim-code');
  await page.getByLabel(t('Código de 6 dígitos','6-digit code')).fill(mail.code==='000000'?'111111':'000000');
  await page.getByRole('button',{name:t('Confirmar código','Confirm code')}).click();
  await expect(page.locator('[data-place-claim-error]')).toContainText(t('Intentos restantes: 4','Attempts left: 4'));
  await page.getByLabel(t('Código de 6 dígitos','6-digit code')).fill(mail.code!);
  await page.getByRole('button',{name:t('Confirmar código','Confirm code')}).click();
  await expect(page.locator('[data-place-claim-done]')).toBeVisible();
  const row=(await db.from('dir_places').select('claim_status,verification_level').eq('slug',slug).single()).data!;
  expect(row).toEqual({claim_status:'claimed',verification_level:'claimed'});
  await gotoOK(page,`${prefix}/lugar/${slug}`);
  await expect(page.locator('[data-place-verification="claimed"]')).toBeVisible();
  await expect(page.locator('[data-place-claim]')).toHaveCount(0);
  await expect(page.locator('[data-place-claim-link]')).toHaveCount(0);
  await page.goto(`${origin}${prefix}/lugar/${slug}/reclamar`);await expect(page).toHaveURL(new RegExp(`/lugar/${slug}$`));// claimed: back to the place
  // The owner cannot review their own place.
  const own=await postJson(context,`/api/lugar/${slug}/resenas`,{actionId:uid(),rating:5,comment:'Excelente lugar'});
  expect(own.status).toBe(403);expect(own.body?.reason).toBe('review_own_place');
  await expectNoHorizontalOverflow(page);
  expect(errors()).toEqual([]);
 }finally{await cleanupDisposableAccount(user);}
});

// A place without an e-mail and without a website offers only the staff-reviewed ways (documents / cédula jurídica).
test('F3: without e-mail nor website only staff review is offered',async({page,context},info)=>{
 test.setTimeout(180000);local(info.project.use.baseURL);
 const db=dirDb(),tag=label(),slug=`soda-sin-correo-${tag}`;
 await seedPlace(db,{slug,vertical:'restaurant',name:`Soda Sin Correo ${tag}`,phone:'+506 2244 0009'});
 await context.setExtraHTTPHeaders({'x-forwarded-for':`10.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}`});// own rate-limit bucket (several claim calls per test)
 const user=await createDisposableAccount({prefix:'dir-claim-none'});
 try{
  await login(context,user);
  await gotoOK(page,`/lugar/${slug}/reclamar`);
  await expect(page.locator('[data-place-claim][data-ready]')).toBeVisible({timeout:45000});
  await expect(page.locator('[data-claim-choices]')).toHaveCount(0);
  await expect(page.locator('[data-claim-reviewed]')).toContainText('Reclame con la cédula jurídica o con documentos');
  const r=await postJson(context,`/api/lugar/${slug}/reclamo`,{actionId:uid(),claimId:uid(),method:'email_listed'});
  expect(r.status).toBe(400);expect(r.body?.reason).toBe('claim_email_unavailable');
 }finally{await cleanupDisposableAccount(user);}
});

for(const language of ['es','en'] as const)test(`F5: reviews with account, and guest only after contacting [${language}]`,async({page,context,browser},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const en=language==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'',db=dirDb(),tag=label(),slug=`soda-resenas-${tag}`;
 await seedPlace(db,{slug,vertical:'restaurant',name:`Soda Reseñas ${tag}`,phone:'+506 2244 0008'});
 const errors=collectPageErrors(page);
 const user=await createDisposableAccount({prefix:'dir-review'});
 try{
  await login(context,user);
  await gotoOK(page,`${prefix}/lugar/${slug}`);await openPlaceTab(page,'reviews');
  await expect(page.getByText(t('Todavía no hay reseñas.','No reviews yet.'))).toBeVisible();
  /* 2026-11-26: «¿Ya visitó este lugar?» — a tap on the fourth star opens the form with 4 stars. */await page.locator('[data-place-review-open][data-ready] [data-place-review-star="4"]').click({timeout:45000});
  await expect(page.locator('[data-place-review-form][data-ready]')).toBeVisible({timeout:45000});
  await expect(page.locator('[data-place-review-form] input[name="rating"]')).toHaveValue('4');
  await page.getByLabel(t('Comentario (máximo 300 caracteres)','Comment (up to 300 characters)')).fill(t('Muy buena comida y atención rápida.','Great food and quick service.'));
  await page.getByRole('button',{name:t('Enviar reseña','Submit review')}).click();
  await expect(page.locator('[data-place-review-sent]')).toBeVisible();
  await page.reload();await openPlaceTab(page,'reviews');
  await expect(page.locator('[data-place-review]')).toHaveCount(1);
  await expect(page.locator('[data-rating-summary]')).toContainText('4.0');// one decimal with a point in both languages, like the professional profile
  // Links are refused by the shared review rules.
  const bad=await postJson(context,`/api/lugar/${slug}/resenas`,{actionId:uid(),rating:5,comment:'Vean https://ejemplo.com'});expect(bad.status).toBe(400);
 }finally{await cleanupDisposableAccount(user);}
 // Guest: refused until this device contacted the business through ContrataCR.
 const guest=await browser.newContext({baseURL:origin});const g=await guest.newPage();
 try{
  await gotoOK(g,`${prefix}/lugar/${slug}`);await openPlaceTab(g,'reviews');
  await g.locator('[data-place-review-open][data-ready] [data-place-review-star="5"]').click({timeout:45000});
  await expect(g.locator('[data-place-review-form][data-ready]')).toBeVisible({timeout:45000});
  await g.getByLabel(t('Su nombre','Your name')).fill('Lucía Mora');
  await g.getByLabel(t('Comentario (máximo 300 caracteres)','Comment (up to 300 characters)')).fill(t('Buen servicio.','Good service.'));
  await g.getByRole('button',{name:t('Enviar reseña','Submit review')}).click();
  await expect(g.locator('[data-place-review-error]')).toContainText(t('contacte primero a la empresa','first contact the business'));
  const contact=await postJson(g,`/api/lugar/${slug}/contacto`,{channel:'call'});expect(contact.status).toBe(200);
  await g.getByRole('button',{name:t('Enviar reseña','Submit review')}).click();
  await expect(g.locator('[data-place-review-sent]')).toBeVisible();
  await g.reload();await openPlaceTab(g,'reviews');
  await expect(g.locator('[data-place-review]')).toHaveCount(2);
  await expect(g.locator('[data-place-reviews]')).toContainText(t('sin cuenta, contactó a la empresa','no account, contacted the business'));
 }finally{await guest.close();}
 expect(errors()).toEqual([]);
});

for(const language of ['es','en'] as const)test(`P1: prices with source and date, stale greyed, prescription never shown [${language}]`,async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const en=language==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'',db=dirDb(),tag=label(),staff=uid();
 const superSlug=`super-precios-${tag}`,pharmacySlug=`farmacia-precios-${tag}`;
 await seedPlace(db,{slug:superSlug,vertical:'grocery',name:`Super Precios ${tag}`});
 await seedPlace(db,{slug:pharmacySlug,vertical:'pharmacy',name:`Farmacia Precios ${tag}`},{license:true});
 const item=async(input:Record<string,unknown>)=>{const r=await db.rpc('price_item_upsert',{p_actor:staff,p_input:{actionId:uid(),...input}});if(r.error)throw r.error;};
 await item({slug:`arroz-${tag}`,kind:'grocery',name:`Arroz E2E ${tag}`,presentation:'1 kg',unitBase:'kg',unitQty:1});
 await item({slug:`frijol-${tag}`,kind:'grocery',name:`Frijoles E2E ${tag}`,presentation:'1 kg',unitBase:'kg',unitQty:1});
 await item({slug:`acetaminofen-${tag}`,kind:'medicine',name:`Acetaminofén E2E ${tag}`,unitBase:'unit',unitQty:1,rxRequired:false});
 await item({slug:`amoxicilina-${tag}`,kind:'medicine',name:`Amoxicilina E2E ${tag}`,unitBase:'unit',unitQty:1,rxRequired:true});
 const ago=(d:number)=>new Date(Date.now()-d*864e5).toISOString();
 const obs=(input:Record<string,unknown>)=>db.rpc('price_observation_record',{p_actor:staff,p_input:{actionId:uid(),sourceKind:'business',observedAt:ago(0.01),...input}});
 expect((await obs({itemSlug:`arroz-${tag}`,placeSlug:superSlug,price:1250})).error).toBeNull();
 expect((await obs({itemSlug:`frijol-${tag}`,placeSlug:superSlug,price:1890,observedAt:ago(45)})).error).toBeNull();// stale after 30 days
 expect((await obs({itemSlug:`acetaminofen-${tag}`,placeSlug:pharmacySlug,price:950})).error).toBeNull();
 const rx=await obs({itemSlug:`amoxicilina-${tag}`,placeSlug:pharmacySlug,price:3200});
 expect(rx.error?.code).toBeTruthy();// Decreto 36868-S: prescription medicines never get observations
 await gotoOK(page,`${prefix}/lugar/${superSlug}`);await openPlaceTab(page,'offer');
 const prices=page.locator('[data-place-prices]');
 await expect(prices.getByRole('heading',{name:t('Precios','Prices')})).toBeVisible();
 const rice=prices.locator(`[data-price-item="arroz-${tag}"]`);
 await expect(rice).toContainText(t('Informado por la empresa','Reported by the business'));await expect(rice).toContainText(/1[\s.,\u00a0\u202f]?250/);
 await expect(rice.locator('[data-price-stale]')).toHaveCount(0);
 await expect(prices.locator(`[data-price-item="frijol-${tag}"] [data-price-stale]`)).toHaveText(t('desactualizado','out of date'));
 await expectNoHorizontalOverflow(page);
 await gotoOK(page,`${prefix}/lugar/${pharmacySlug}`);await openPlaceTab(page,'offer');
 await expect(page.locator(`[data-price-item="acetaminofen-${tag}"]`)).toBeVisible();
 const text=await visibleHtml(page);expect(text).not.toContain(`Amoxicilina E2E ${tag}`);
 await expect(page.locator(`[data-price-item="amoxicilina-${tag}"]`)).toHaveCount(0);
});
