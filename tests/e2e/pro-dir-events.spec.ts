import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,login,origin,ownerFixture,proOff} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {claimByEmail,hideSeededPlaces,label,postJson,seedPlace,uid,openPlaceTab} from './pro-dir-fixture';
import {crDay,featureShots,randomIp} from './pro-dir-features-fixture';

// Place features round (LOCAL Pro, 2026-11-17): local events and the «Pedir» link-out. The owner of a claimed bar creates an
// event in /dashboard/pro/lugar (UI) and another through the API; /eventos lists them by start time with province and
// section filters (ES/EN), the place page shows upcoming events; a stale edit → 409; a «member» of the company cannot
// publish (listing.publish) — a «manager» can; staff hide an event from the queue (immutable log) and it disappears.
// «Pedir»: the owner sets its WhatsApp (UI) → wa.me link-out on the place page; no button in health places.
// Owner of /api/pro/place-events, /[locale]/dashboard/pro/lugar and /[locale]/eventos.
test.afterEach(()=>hideSeededPlaces());

test('events + «Pedir»: owner publishes, /eventos filters, team role, staff moderation, link-out only',async({page,context,browser},info)=>{
 test.setTimeout(360000);local(info.project.use.baseURL);
 const tag=label(),f=await ownerFixture(context,'ev-'+tag),db=f.db,slug=`bar-eventos-${tag}`,clinic=`clinica-eventos-${tag}`,errors=collectPageErrors(page);
 let member:DisposableAccount|undefined,manager:DisposableAccount|undefined;
 try{
  const {placeId}=await seedPlace(db,{slug,vertical:'cafe_bar',name:`Bar Eventos ${tag}`,adminArea1:'Guanacaste',locality:'Liberia',attributes:{kind:'bar'}});
  const {placeId:clinicId}=await seedPlace(db,{slug:clinic,vertical:'health',name:`Clínica Eventos ${tag}`,attributes:{kind:'clinic'}});
  await claimByEmail(context,slug);await claimByEmail(context,clinic);
  await context.setExtraHTTPHeaders(randomIp());
  // PRO_ENABLED off: the same tools live in «Mi negocio» (/dashboard/negocio/lugar → /api/negocio/lugar), owner acting as self.
  const pro=(data:unknown,actor=f.owner.id)=>postJson(context,proOff?'/api/negocio/lugar':'/api/pro/place-events',data,{'X-Pro-Expected-Actor':actor});
  const title=`Noche de trova ${tag}`,day=crDay(3);

  // Owner creates an event through the UI (ES).
  await gotoOK(page,proOff?'/dashboard/negocio/lugar':'/dashboard/pro/lugar');
  const tools=page.locator('[data-place-tools]');await expect(tools).toBeVisible({timeout:45000});
  await page.locator('select').first().selectOption(placeId);
  await page.locator('[data-event-new]').click();
  const form=page.locator('[data-event-form]');
  await form.locator('[data-event-title]').fill(title);await form.locator('[data-event-start]').fill(`${day}T20:00`);await form.locator('[data-event-price]').fill('Entrada ₡3 000');
  await form.locator('[data-event-save]').click();
  await expect(page.locator('[data-place-tools-msg="ok"]')).toBeVisible();
  await expect(page.locator(`[data-owner-event="${title}"]`)).toBeVisible();
  // «Pedir» through the UI.
  await page.locator('[data-order-channel]').selectOption('whatsapp');await page.locator('[data-order-value]').fill('8877 6655');
  await page.locator('[data-order-save]').click();await expect(page.locator('[data-place-tools-msg="ok"]')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  // A second event through the API; links and stale revisions are refused.
  const second=await pro({op:'event',input:{action:'create',actionId:uid(),eventId:uid(),placeId,event:{title:`Feria artesanal ${tag}`,startsAt:new Date(`${crDay(1)}T15:00:00-06:00`).toISOString(),priceText:'Gratis'}}});
  expect(second.status,JSON.stringify(second.body)).toBe(200);
  expect((await pro({op:'event',input:{action:'create',actionId:uid(),eventId:uid(),placeId,event:{title:'Promo www.ejemplo.com',startsAt:new Date(`${day}T15:00:00-06:00`).toISOString()}}})).status).toBe(400);
  const staleEdit=await pro({op:'event',input:{action:'update',actionId:uid(),eventId:second.body!.id,revision:5,event:{title:`Feria artesanal ${tag}`,startsAt:new Date(`${crDay(1)}T16:00:00-06:00`).toISOString()}}});
  expect([staleEdit.status,staleEdit.body?.reason]).toEqual([409,'reload']);
  const noOrder=await pro({op:'order',input:{actionId:uid(),placeId:clinicId,revision:0,channel:'phone',value:'+506 2222 3333'}});
  expect([noOrder.status,noOrder.body?.reason]).toEqual([400,'order_section_off']);

  // Team: «member» cannot publish events; «manager» can.
  member=await createDisposableAccount({prefix:'dir-ev-member'});manager=await createDisposableAccount({prefix:'dir-ev-manager'});
  await db.from('pro_company_members').insert([{owner_id:f.owner.id,member_user_id:member.id,member_name:'Miembro '+tag,member_email:member.email,role:'member'},
   {owner_id:f.owner.id,member_user_id:manager.id,member_name:'Gerente '+tag,member_email:manager.email,role:'manager'}]).throwOnError();
  if(proOff){// No Pro team without Pro: the owner publishes the third event; the team endpoint is closed.
   expect((await pro({op:'event',input:{action:'create',actionId:uid(),eventId:uid(),placeId,event:{title:`Evento del equipo ${tag}`,startsAt:new Date(`${crDay(5)}T19:00:00-06:00`).toISOString()}}})).status).toBe(200);
   expect((await context.request.get(`${origin}/api/pro/place-events`)).status()).toBe(404);
  }
  for(const [who,expected,reason] of (proOff?[]:[[member,403,'tool_role'],[manager,200,undefined]]) as readonly (readonly [DisposableAccount,number,string|undefined])[]){
   const c=await browser.newContext({baseURL:origin,extraHTTPHeaders:randomIp()});
   try{
    await login(c,who);await c.addCookies([{name:'ccr_pro_ws',value:f.owner.id,url:origin,httpOnly:true,sameSite:'Lax'}]);
    const r=await postJson(c,'/api/pro/place-events',{op:'event',input:{action:'create',actionId:uid(),eventId:uid(),placeId,event:{title:`Evento del equipo ${who.id.slice(0,4)} ${tag}`,startsAt:new Date(`${crDay(5)}T19:00:00-06:00`).toISOString()}}},{'X-Pro-Expected-Actor':who.id});
    expect(r.status,JSON.stringify(r.body)).toBe(expected);if(reason)expect(r.body?.reason).toBe(reason);
   }finally{await c.close();}
  }

  // Public /eventos (ES/EN): ordered by start, province filter; place page with upcoming events and «Pedir».
  const anon=await browser.newContext({baseURL:origin});const p=await anon.newPage();const pErrors=collectPageErrors(p);
  try{
   const salud=(await p.request.get(`${origin}/salud`,{maxRedirects:0})).status();expect([200,404],'/salud status').toContain(salud);const healthOn=salud===200;
   for(const language of ['es','en'] as const){
    const prefix=language==='en'?'/en':'/es';
    await gotoOK(p,`${prefix}/eventos?provincia=Guanacaste`);
    const ours=p.locator('[data-event]').filter({hasText:tag});
    await expect(ours).toHaveCount(3);
    await expect(ours.first()).toContainText(`Feria artesanal ${tag}`);// earliest first
    await expect(p.locator('[data-events-province]')).toHaveValue('Guanacaste');
    await expectNoHorizontalOverflow(p);
    await featureShots(p,`eventos-${language}`,info);
    await gotoOK(p,`${prefix}/eventos?provincia=Lim%C3%B3n`);await expect(p.locator('[data-event]').filter({hasText:tag})).toHaveCount(0);
    await gotoOK(p,`${prefix}/negocios/${slug}`);
    await openPlaceTab(p,'info');
    await expect(p.locator('[data-place-events]')).toContainText(title);
    await expect(p.locator('[data-place-action="order"]').first()).toHaveAttribute('href','https://wa.me/50688776655');
    await expect(p.locator('[data-place-action="order"]').first()).toHaveAttribute('rel',/nofollow/);
    await expect(p.locator('[data-place-order-note]')).toHaveCount(0);// 2026-11-19: the «Pedir» explanation lives in the Terms (13.1)
    // Health place pages exist only with DIR_HEALTH_ENABLED (off by default in a production build): read the server's
    // own flag from /salud instead of a manual env var; off → the clinic page must answer 404, on → no «Pedir» button.
    if(healthOn){await gotoOK(p,`${prefix}/negocios/${clinic}`);await expect(p.locator('[data-place-action="order"]')).toHaveCount(0);}
    else expect((await p.request.get(`${origin}${prefix}/negocios/${clinic}`)).status(),'health place while DIR_HEALTH_ENABLED is off').toBe(404);
   }
   // Staff: the new events are in the queue; hiding one removes it from /eventos (logged with the reason).
   const queue=(await db.rpc('dir_admin_event_queue',{p_filter:'new',p_limit:200})).data as {id:string;title:string;revision:number}[];
   const ev=queue.find(e=>e.title===title)!;expect(ev).toBeTruthy();
   const staff=uid();
   const hide=await db.rpc('dir_admin_event_moderate',{p_actor:staff,p_input:{actionId:uid(),eventId:ev.id,decision:'hide',reason:'Información engañosa (E2E)',expectedRevision:ev.revision}});
   expect(hide.error).toBeNull();
   expect((await db.from('dir_moderation_log').select('kind,decision,reason').eq('target_id',ev.id)).data).toEqual([{kind:'event',decision:'hide',reason:'Información engañosa (E2E)'}]);
   await gotoOK(p,'/eventos?provincia=Guanacaste');await expect(p.locator('[data-event]').filter({hasText:title})).toHaveCount(0);
   expect(pErrors()).toEqual([]);
  }finally{await anon.close();}
  // The owner sees the staff reason.
  await gotoOK(page,proOff?'/dashboard/negocio/lugar':'/dashboard/pro/lugar');await page.locator('select').first().selectOption(placeId);
  await expect(page.locator(`[data-owner-event="${title}"]`)).toContainText('Información engañosa (E2E)');
  expect(errors()).toEqual([]);
 }finally{await cleanupDisposableAccount(member);await cleanupDisposableAccount(manager);await f.cleanup();}
});
