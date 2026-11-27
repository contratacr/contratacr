import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,login,origin,ownerFixture,proOff} from './pro-round2-fixture';
// PRO_ENABLED off: the owner side lives in «Mi negocio» (/api/negocio/reservas, /api/negocio/lugar, /dashboard/negocio/reservas).
const RES_API=proOff?'/api/negocio/reservas':'/api/pro/table-reservations',PLACE_API=proOff?'/api/negocio/lugar':'/api/pro/place-events',RES_UI=proOff?'/dashboard/negocio/reservas':'/dashboard/pro/reservas-mesa';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {chooseEdition,claimByEmail,hideSeededPlaces,label,postJson,seedPlace,uid,openPlaceTab} from './pro-dir-fixture';
import {crDay,featureShots,randomIp} from './pro-dir-features-fixture';

// Place features round (LOCAL Pro, 2026-11-17): table reservations + same-day waitlist of a CLAIMED restaurant that
// opted in. Owner (edition restaurantes) turns them on through /api/pro/table-reservations (CAS → 409); a visitor without
// an account books a table and joins the waitlist on /negocios/<slug> (ES/EN UI); capacity is enforced; the owner confirms on
// the bookings screen (/dashboard/pro/reservas-mesa) and notifies «your table is ready» — notices only reach the MOCK
// sender (recorded with sender 'mock'); a company member can manage bookings, read_only cannot; an unclaimed place has
// no form. Also captures the place page with reservation + Q&A + «Pedir» and the owner bookings screen (es/en, 1440+390).
// Pending fixes round (2026-11-17): after booking, the customer gets a private link (/reserva/<token>, no ids) shown once;
// the page shows the status (pending → confirmed, waitlist «table ready») and cancels until the start time (409 once
// closed, idempotent replay, immutable 'customer_cancel' event, mock 'customer_cancelled' notice to the business);
// unknown tokens answer 404; a signed-in customer finds it in «Mis reservas»; a guest is told to use the link.
// Owner of /api/lugar/[slug]/reservas, /api/pro/table-reservations, /api/reservas/[token], /[locale]/reserva/[token],
// /[locale]/mis-reservas and /[locale]/dashboard/pro/reservas-mesa.
test.afterEach(()=>hideSeededPlaces());

test('reservations: opt-in, booking + waitlist, capacity, owner decisions with mock notices, team roles',async({page,context,browser},info)=>{
 test.setTimeout(420000);local(info.project.use.baseURL);
 const tag=label(),f=await ownerFixture(context,'res-'+tag),db=f.db,slug=`soda-reservas-${tag}`,errors=collectPageErrors(page);
 let member:DisposableAccount|undefined,reader:DisposableAccount|undefined,asker:DisposableAccount|undefined;
 try{
  const {placeId}=await seedPlace(db,{slug,vertical:'restaurant',name:`Soda Reservas ${tag}`,phone:'+506 2255 0101',adminArea1:'San José'});
  await seedPlace(db,{slug:`soda-sin-reservas-${tag}`,vertical:'restaurant',name:`Soda Sin Reservas ${tag}`});
  await chooseEdition(db,f.owner.id,'restaurantes');
  await claimByEmail(context,slug);
  await context.setExtraHTTPHeaders(randomIp());
  const pro=(data:unknown)=>postJson(context,RES_API,data,{'X-Pro-Expected-Actor':f.owner.id});
  // Off by default: no form on the page, the public API answers reservations_off.
  expect((await context.request.get(`${origin}/api/lugar/${slug}/reservas`)).status()).toBe(404);
  const list=await context.request.get(`${origin}${RES_API}`,{headers:{'X-Pro-Expected-Actor':f.owner.id}});
  expect(list.status()).toBe(200);expect((await list.json()).places.map((p:{slug:string})=>p.slug)).toContain(slug);
  const slots=[0,1,2,3,4,5,6].flatMap(weekday=>['12:00','19:00'].map(time=>({weekday,time,capacity:6})));
  const settings={placeId,revision:0,enabled:true,waitlistEnabled:true,partyMax:6,horizonDays:30,minNoticeMinutes:0,slots};
  const s1=await pro({op:'settings',input:{...settings,actionId:uid()}});expect(s1.status,JSON.stringify(s1.body)).toBe(200);expect(s1.body?.revision).toBe(1);
  const stale=await pro({op:'settings',input:{...settings,actionId:uid(),partyMax:4}});expect([stale.status,stale.body?.reason]).toEqual([409,'reload']);
  const day=crDay(2);

  // «Pedir» and one question, for the place page capture (both are covered in depth by their own specs).
  expect((await postJson(context,PLACE_API,{op:'order',input:{actionId:uid(),placeId,revision:0,channel:'whatsapp',value:'8888 0101'}},{'X-Pro-Expected-Actor':f.owner.id})).status).toBe(200);
  asker=await createDisposableAccount({prefix:'dir-res-asker'});
  expect((await db.rpc('dir_question_ask',{p_actor:asker.id,p_input:{actionId:uid(),questionId:uid(),slug,body:'¿Tienen mesas al aire libre?',authorName:'Laura Méndez'}})).error).toBeNull();

  // Visitor without an account (own browser context): books a table and joins today's waitlist, ES then EN.
  const guest=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});const g=await guest.newPage();const gErrors=collectPageErrors(g);
  const links:Record<string,string>={};
  try{
   for(const language of ['es','en'] as const){
    const en=language==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
    await gotoOK(g,`${prefix}/negocios/${slug}`);
    await openPlaceTab(g,'info');
    const box=g.locator('[data-place-reservations][data-ready]');await expect(box).toBeVisible({timeout:45000});
    await expect(box.getByRole('heading',{name:t('Reservar mesa','Book a table')})).toBeVisible();
    await box.locator('[data-reservation-day]').fill(day);
    await expect(box.locator('[data-reservation-time="19:00"]')).toBeVisible({timeout:20000});
    await box.locator('[data-reservation-party]').selectOption('2');
    await box.locator('[data-reservation-time="19:00"]').check();
    await box.locator('[data-reservation-name]').fill(en?'Guest Visitor':'Visita Sin Cuenta');
    await box.locator('[data-reservation-phone]').fill('+506 8800 0'+(en?'2':'1')+'00');
    await box.locator('[data-reservation-submit]').click();
    await expect(box.locator('[data-reservation-done="booking"]')).toBeVisible();
    await expect(box.locator('[data-reservation-reference]')).toHaveText(/^[A-Z0-9]{6}$/);
    // Private link, shown once: random token only (no reservation/place id inside).
    const href=await box.locator('[data-reservation-link-href]').getAttribute('href');
    expect(href).toMatch(new RegExp(`^${prefix}/reserva/[A-Za-z0-9_-]{43}$`));links[language]=href!;
    await expectNoHorizontalOverflow(g);
   }
   // Capacity: 6 per slot, 4 already requested at 19:00 → a party of 3 is refused (409 reservation_full).
   const full=await postJson(guest,`/api/lugar/${slug}/reservas`,{kind:'booking',actionId:uid(),reservationId:uid(),day,time:'19:00',partySize:3,name:'Grupo Grande',email:'grupo@ejemplo.test'});
   expect([full.status,full.body?.reason]).toEqual([409,'reservation_full']);
   const noContact=await postJson(guest,`/api/lugar/${slug}/reservas`,{kind:'booking',actionId:uid(),reservationId:uid(),day,time:'12:00',partySize:2,name:'Sin Contacto'});
   expect([noContact.status,noContact.body?.reason]).toEqual([400,'contact_required']);
   // Same-day waitlist through the UI.
   await gotoOK(g,`/negocios/${slug}`);
   await openPlaceTab(g,'info');
   const box=g.locator('[data-place-reservations][data-ready]');await expect(box).toBeVisible({timeout:45000});
   await box.locator('[data-reservation-mode="waitlist"]').click();
   await box.locator('[data-reservation-name]').fill('Lista Espera');await box.locator('[data-reservation-email]').fill('lista@ejemplo.test');
   await box.locator('[data-reservation-submit]').click();
   await expect(box.locator('[data-reservation-done="waitlist"]')).toContainText(/Puesto 1|Position 1/);// the locale cookie of the EN pass may keep English
   links.waitlist=(await box.locator('[data-reservation-link-href]').getAttribute('href'))!;
   // The waitlist link shows the position before the business acts.
   await gotoOK(g,'/es'+links.waitlist.replace(/^\/en/,''));
   await expect(g.locator('[data-reservation-status="waiting"][data-ready]')).toBeVisible({timeout:45000});
   await expect(g.locator('[data-reservation-position]')).toHaveText('1');
   // A place that did not opt in shows no form.
   await gotoOK(g,`/negocios/soda-sin-reservas-${tag}`);await expect(g.locator('[data-place-reservations]')).toHaveCount(0);
   expect(gErrors()).toEqual([]);
  }finally{await guest.close();}

  // Owner bookings screen: confirm one request from the UI (mock notice), notify the waitlist through the API.
  const rows=(await db.from('dir_reservations').select('id,kind,status,revision,reference').eq('place_id',placeId).order('created_at')).data!;
  expect(rows.map(r=>[r.kind,r.status])).toEqual([['booking','pending'],['booking','pending'],['waitlist','waiting']]);
  for(const language of ['es','en'] as const){
   const en=language==='en',prefix=en?'/en':'/es';// explicit /es: a previous EN visit keeps the locale cookie
   await gotoOK(page,`${prefix}${RES_UI}`);
   await expect(page.locator(`[data-table-reservations="${placeId}"]`)).toBeVisible({timeout:45000});
   await page.locator('[data-table-res-day]').fill(day);
   await expect(page.locator(`[data-table-res="${rows[0]!.reference}"]`)).toBeVisible({timeout:20000});
   await expectNoHorizontalOverflow(page);
   await featureShots(page,`owner-bookings-${language}`,info);
  }
  await page.locator(`[data-table-res="${rows[0]!.reference}"] [data-table-res-action="confirm"]`).click();
  await expect(page.locator('[data-table-res-msg="ok"]')).toContainText(/simulated|simulado/i);
  await expect(page.locator(`[data-table-res="${rows[0]!.reference}"]`)).toHaveAttribute('data-status','confirmed');
  const ready=await pro({op:'decide',input:{actionId:uid(),reservationId:rows[2]!.id,revision:1,action:'notify_ready'}});
  expect(ready.status,JSON.stringify(ready.body)).toBe(200);expect(ready.body?.notice).toEqual({kind:'table_ready',channel:'email',sender:'mock',accepted:true});
  expect(JSON.stringify(ready.body)).not.toContain('lista@ejemplo.test');// the destination never reaches the browser
  const notices=(await db.from('dir_reservation_notices').select('kind,sender').in('reservation_id',rows.map(r=>r.id))).data!;
  expect(notices.every(n=>n.sender==='mock')).toBe(true);expect(notices.map(n=>n.kind).sort()).toEqual(['confirmed','received','received','received','table_ready']);
  const staleDecision=await pro({op:'decide',input:{actionId:uid(),reservationId:rows[0]!.id,revision:1,action:'cancel'}});expect(staleDecision.status).toBe(409);

  // Team: a «member» of the owner's company manages bookings; «read_only» cannot.
  member=await createDisposableAccount({prefix:'dir-res-member'});reader=await createDisposableAccount({prefix:'dir-res-reader'});
  await db.from('pro_company_members').insert([{owner_id:f.owner.id,member_user_id:member.id,member_name:'Miembro '+tag,member_email:member.email,role:'member'},
   {owner_id:f.owner.id,member_user_id:reader.id,member_name:'Lector '+tag,member_email:reader.email,role:'read_only'}]).throwOnError();
  if(proOff){// No Pro team without Pro: the owner confirms the second booking from «Mi negocio».
   const rev=Number((await db.from('dir_reservations').select('revision').eq('id',rows[1]!.id).single()).data!.revision);
   const r=await pro({op:'decide',input:{actionId:uid(),reservationId:rows[1]!.id,revision:rev,action:'confirm'}});expect(r.status,JSON.stringify(r.body)).toBe(200);
  }
  for(const [who,expected] of (proOff?[]:[[member,200],[reader,403]]) as readonly (readonly [DisposableAccount,number])[]){
   const c=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});
   try{
    await login(c,who);await c.addCookies([{name:'ccr_pro_ws',value:f.owner.id,url:origin,httpOnly:true,sameSite:'Lax'}]);
    const rev=Number((await db.from('dir_reservations').select('revision').eq('id',rows[1]!.id).single()).data!.revision);
    const r=await postJson(c,'/api/pro/table-reservations',{op:'decide',input:{actionId:uid(),reservationId:rows[1]!.id,revision:rev,action:'confirm'}},{'X-Pro-Expected-Actor':who.id});
    expect(r.status,JSON.stringify(r.body)).toBe(expected);
    expect((await c.request.get(`${origin}/api/pro/table-reservations?placeId=${placeId}`,{headers:{'X-Pro-Expected-Actor':who.id}})).status()).toBe(200);// both can read
   }finally{await c.close();}
  }
  const events=(await db.from('dir_reservation_events').select('action,member_id').eq('reservation_id',rows[1]!.id).order('id')).data!;
  expect(events.map(e=>[e.action,e.member_id])).toEqual([['request',null],['confirm',proOff?null:member!.id]]);// Pro off: confirmed by the owner

  // Place page capture (reservation + «Pedir»), ES and EN, as a signed-in visitor would see it.
  for(const language of ['es','en'] as const){
   const prefix=language==='en'?'/en':'/es';
   await gotoOK(page,`${prefix}/negocios/${slug}`);
   await openPlaceTab(page,'info');
   await expect(page.locator('html')).toHaveAttribute('lang',language);
   await expect(page.locator('[data-place-reservations][data-ready]')).toBeVisible({timeout:45000});
   await expect(page.locator('[data-place-action="order"]').first()).toHaveAttribute('href','https://wa.me/50688880101');
   // «Preguntar» left the place page (owner 2026-11-26): the questions block is no longer shown there.
   await expect(page.locator('[data-place-questions]')).toHaveCount(0);
   await featureShots(page,`place-page-${language}`,info);
  }
  // ---------------------------------------------------------------- customer self-service (private link)
  const guest2=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});const s=await guest2.newPage();const sErrors=collectPageErrors(s);
  try{
   const token=links.es!.split('/').pop()!;
   expect(links.es).not.toContain(placeId);expect(links.es).not.toContain(rows[0]!.id);
   // Unknown or malformed tokens: 404 (page and API).
   expect((await guest2.request.get(`${origin}/api/reservas/${'A'.repeat(43)}`)).status()).toBe(404);
   expect((await guest2.request.get(`${origin}/api/reservas/not-a-token`)).status()).toBe(404);
   expect((await s.goto(`/es/reserva/${'B'.repeat(43)}`))?.status()).toBe(404);
   // Status as the business left it: ES booking confirmed (no contact data or ids in the answer).
   const api=await guest2.request.get(`${origin}/api/reservas/${token}`);expect(api.status()).toBe(200);
   const view=await api.json();expect(view.status).toBe('confirmed');expect(view.reference).toBe(rows[0]!.reference);expect(view.canCancel).toBe(true);
   for(const k of ['id','placeId','phone','email','accessHash'])expect(view).not.toHaveProperty(k);
   // Waitlist entry: «table ready».
   await gotoOK(s,`/es${links.waitlist!.replace(/^\/en/,'')}`);
   await expect(s.locator('[data-reservation-status="notified"]')).toBeVisible({timeout:45000});
   await expect(s.locator('[data-reservation-status-label]')).toHaveText('¡Su mesa está lista!');
   for(const language of ['es','en'] as const){
    const prefix=language==='en'?'/en':'/es';
    await gotoOK(s,`${prefix}/reserva/${token}`);
    await expect(s.locator('html')).toHaveAttribute('lang',language);
    await expect(s.locator('[data-reservation-status="confirmed"][data-ready]')).toBeVisible({timeout:45000});
    await expect(s.locator('[data-reservation-status-ref]')).toHaveText(rows[0]!.reference);
    await expect(s.locator('[data-reservation-cancel]')).toBeVisible();
    await expectNoHorizontalOverflow(s);
    await featureShots(s,`reservation-status-${language}`,info);
   }
   // Cancel from the page (confirmation step), then the business is told through the mock sender.
   await s.locator('[data-reservation-cancel]').click();
   await s.locator('[data-reservation-cancel-confirm]').click();
   await expect(s.locator('[data-reservation-cancel-msg="ok"]')).toContainText(process.env.E2E_PROD_MIRROR==='1'?/Avisamos al negocio|We let the business know/:/simulated|simulado/i);// production copy is neutral
   await expect(s.locator('[data-reservation-status="cancelled"]')).toBeVisible();
   await expect(s.locator('[data-reservation-cancel]')).toHaveCount(0);
   await expect(s.locator('[data-reservation-timeline]')).toContainText(/You cancelled|Usted canceló/);
   const ev=(await db.from('dir_reservation_events').select('action,from_status,to_status').eq('reservation_id',rows[0]!.id).order('id')).data!;
   expect(ev.at(-1)).toEqual({action:'customer_cancel',from_status:'confirmed',to_status:'cancelled'});
   const told=(await db.from('dir_reservation_notices').select('kind,sender').eq('reservation_id',rows[0]!.id).eq('kind','customer_cancelled')).data!;
   expect(told).toEqual([{kind:'customer_cancelled',sender:'mock'}]);
   // Closed now: a second cancel answers 409; a stale revision too; the owner screen shows it cancelled.
   const again=await postJson(guest2,`/api/reservas/${token}`,{actionId:crypto.randomUUID(),revision:Number(view.revision)+1});
   expect([again.status,again.body?.reason]).toEqual([409,'reservation_cancel_closed']);
   const staleCancel=await postJson(guest2,`/api/reservas/${links.en!.split('/').pop()}`,{actionId:crypto.randomUUID(),revision:1});
   expect([staleCancel.status,staleCancel.body?.reason]).toEqual([409,'reload']);
   expect((await postJson(guest2,`/api/reservas/${token}`,{actionId:'x',revision:1})).status).toBe(400);
   // Idempotent: the same actionId replays the same answer and adds no second event.
   const enToken=links.en!.split('/').pop()!,enRev=Number((await (await guest2.request.get(`${origin}/api/reservas/${enToken}`)).json()).revision);
   const aid=crypto.randomUUID(),first=await postJson(guest2,`/api/reservas/${enToken}`,{actionId:aid,revision:enRev}),replay=await postJson(guest2,`/api/reservas/${enToken}`,{actionId:aid,revision:enRev});
   expect(first.status,JSON.stringify(first.body)).toBe(200);expect(replay.body).toEqual(first.body);
   expect((await db.from('dir_reservation_events').select('id').eq('reservation_id',rows[1]!.id).eq('action','customer_cancel')).data!.length).toBe(1);
   // A guest has no «Mis reservas»: the page explains the link and offers to sign in.
   await gotoOK(s,'/es/mis-reservas');await expect(s.locator('[data-my-reservations-guest]')).toBeVisible();
   expect(sErrors()).toEqual([]);
  }finally{await guest2.close();}
  // Signed-in customer: «Mis reservas» lists the booking with its private link.
  const signed=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});
  try{
   await login(signed,asker!);
   const b=await postJson(signed,`/api/lugar/${slug}/reservas`,{kind:'booking',actionId:uid(),reservationId:uid(),day,time:'12:00',partySize:2,name:'Laura Méndez',email:'laura@ejemplo.test'});
   expect(b.status,JSON.stringify(b.body)).toBe(200);expect(b.body).not.toHaveProperty('reservationId');expect(b.body?.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
   const m=await signed.newPage();
   await gotoOK(m,'/es/mis-reservas');
   const row=m.locator(`[data-my-reservation="${b.body!.reference}"]`);await expect(row).toBeVisible({timeout:45000});
   await expect(row).toHaveAttribute('data-status','pending');
   await expect(row.locator('[data-my-reservation-open]')).toHaveAttribute('href',`/reserva/${b.body!.accessToken}`);
   await row.locator('[data-my-reservation-open]').click();
   await expect(m.locator('[data-reservation-status="pending"]')).toBeVisible({timeout:45000});
  }finally{await signed.close();}
  expect(errors()).toEqual([]);
 }finally{await cleanupDisposableAccount(member);await cleanupDisposableAccount(reader);await cleanupDisposableAccount(asker);await f.cleanup();}
});
