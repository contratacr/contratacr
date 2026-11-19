import {test,expect,type BrowserContext} from 'playwright/test';
import {createHash} from 'node:crypto';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {proMoney} from '../../src/lib/pro/money';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

// Row 53: vendor portal. Single-use random invitation link (only its keyed hash stored), expiry,
// revocation, vendor-only view (no internal costs, other offers or the owner's notes) and offers
// sent until the bid closes. One session cookie per link. Nothing is e-mailed: the owner copies
// the link. The dev server needs PRO_BID_PORTAL_SECRET (scripts/dev-local-test-env.js provides an
// ephemeral one per process when no env source defines it).
const origin='http://127.0.0.1:3185',api='/api/pro/bids',links='/api/pro/bid-portal-links',portal='/api/pro/bid-portal';
const sha=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
const cookieName=(linkId:string)=>'ccr_bid_portal_'+linkId.replace(/-/g,'');
const shiftDay=(iso:string,days:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();}
type PortalView={revision:number;vendor:string;business:string|null;package:{code:string;status:string;lines:Array<{id:string;description:string;quantity:number;unit:string}>};offer:null|{prices:Array<{lineId:string;unitCents:number;totalCents:number}>};submissions:number};

for(const language of ['es','en'] as const)test(`Bid vendor portal: single-use link, vendor-only view, offers until closing, revocation [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(360000);expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const en=language==='en',db=regressionAdminClient(),owner=await createDisposableAccount({prefix:'bid-portal'}),errors=collectPageErrors(page);
 const mobile=(page.viewportSize()?.width??1366)<1024,suffix=`${language}${mobile?'-mobile':''}`;let vendorContext:BrowserContext|undefined,second:BrowserContext|undefined;
 try{
  const user=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Constructora Portal Local',slug:'bid-portal-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
  const workId=crypto.randomUUID(),clientId='bid-portal-'+owner.id.slice(0,8),today=crTodayISO(),document=emptyBusiness();
  document.clients=[{id:clientId,name:'Cliente portal',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId,client:'Cliente portal',service:'Remodelación de cocina',stage:'scheduled',start:today+'T09:00:00-06:00',end:today+'T10:00:00-06:00',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(page.context(),owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
  expect((await page.request.get('/api/pro/client-operations?'+new URLSearchParams({workId,clientId}),{timeout:45000})).status()).toBe(200);
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const bid=async(data:Record<string,unknown>)=>{const r=await page.request.post(api,{headers,data});expect(r.status(),JSON.stringify(data).slice(0,200)).toBe(200);return (await r.json()).package as {id:string;revision:number;lines:Array<{id:string}>};};
  const vendor=async(name:string)=>{const id=crypto.randomUUID();expect((await page.request.post('/api/pro/company-vendors',{headers,data:{action:'create',actionId:crypto.randomUUID(),id,name,kind:'supplier',trade:null,contactName:null,email:'',phone:'',identification:'',notes:null}})).status()).toBe(200);return id;};
  const v1=await vendor('Ferretería Central'),v2=await vendor('Maderas del Valle');
  const packageId=crypto.randomUUID(),l1=crypto.randomUUID(),l2=crypto.randomUUID();
  let pkg=await bid({action:'create',actionId:crypto.randomUUID(),workId,id:packageId,title:'Muebles de cocina',scope:'Fabricación e instalación.',dueDate:shiftDay(today,7),lines:[{id:l1,description:'Módulo inferior',quantity:2.5,unit:'m',budgetCodeId:null},{id:l2,description:'Sobre de granito',quantity:3,unit:'m²',budgetCodeId:null}]});
  pkg=await bid({action:'invite',actionId:crypto.randomUUID(),workId,id:packageId,revision:pkg.revision,supplierIds:[v1,v2]});
  pkg=await bid({action:'open',actionId:crypto.randomUUID(),workId,id:packageId,revision:pkg.revision});
  // The owner records Maderas' offer by hand (the vendor portal must never show it).
  pkg=await bid({action:'record_response',actionId:crypto.randomUUID(),workId,id:packageId,revision:pkg.revision,supplierId:v2,receivedOn:today,leadDays:null,validUntil:null,notes:'Oferta privada de Maderas',prices:[{lineId:l1,unitCents:777700}]});

  // ---- Owner API: validation ----
  const ownerPost=(data:Record<string,unknown>,extra:Record<string,string>={})=>page.request.post(links,{headers:{...headers,...extra},data});
  expect((await ownerPost({action:'create_link',actionId:crypto.randomUUID(),id:crypto.randomUUID(),workId,packageId,supplierId:v1,replacesLinkId:null,expiresInDays:31})).status()).toBe(400);
  expect((await ownerPost({action:'create_link',actionId:crypto.randomUUID(),id:crypto.randomUUID(),workId,packageId,supplierId:v1,replacesLinkId:null,expiresInDays:14,tokenHash:'x'})).status()).toBe(400);
  expect((await ownerPost({action:'create_link',actionId:crypto.randomUUID(),id:crypto.randomUUID(),workId,packageId,supplierId:v1,replacesLinkId:null,expiresInDays:14},{Origin:'http://evil.example'})).status()).toBe(403);
  expect((await page.request.post(links,{headers:{...headers,'Content-Type':'application/json'},data:'{"pad":"'+'x'.repeat(17000)+'"}'})).status()).toBe(413);

  // ---- Owner UI: create and copy the link ----
  await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin}).catch(()=>{});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'bids'}));
  await page.locator('[data-bid-item="LIC-0001"]').getByRole('button').click({timeout:60000});
  const panel=page.locator('[data-bid-detail="LIC-0001"] [data-bid-portal-links]');await expect(panel).toBeVisible({timeout:60000});
  await expect(panel.getByRole('heading',{name:en?'Vendor portal':'Portal de proveedores'})).toBeVisible();await expect(panel).toContainText(en?'ContrataCR does not send anything.':'ContrataCR no envía nada.');
  const card=panel.locator('[data-bid-portal-vendor="Ferretería Central"]');await expect(card.locator('[data-bid-portal-link-status]')).toHaveAttribute('data-bid-portal-link-status','none');
  await card.getByLabel(en?'Valid for':'Vigencia').selectOption('7');
  const created=page.waitForResponse(response=>new URL(response.url()).pathname===links&&response.request().method()==='POST');
  await card.getByRole('button',{name:en?'Create link':'Crear enlace'}).click();const createdBody=await (await created).json();
  const url=await card.locator('[data-bid-portal-url]').inputValue();const pagePath=`${origin}${en?'/en':''}/licitacion-proveedor`;expect(url).toMatch(new RegExp(`^${pagePath}#acceso=[A-Za-z0-9_-]{43}$`));
  const token=url.split('#acceso=')[1];expect(createdBody.token).toBe(token);const link1=createdBody.link.id as string;
  await expect(card.locator('[data-bid-portal-link-status]')).toHaveAttribute('data-bid-portal-link-status','active');await expect(card).toContainText(en?'Shown only now.':'Solo se muestra ahora.');
  for(const button of await panel.getByRole('button').all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);await card.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`bid-portal-owner-link-${suffix}.png`)});
  // Only the hash is stored; the token never reaches the database.
  const stored=(await db.from('pro_bid_portal_links').select('*').eq('owner_id',owner.id).throwOnError()).data!;expect(stored).toHaveLength(1);
  // Keyed hash (HMAC with PRO_BID_PORTAL_SECRET): 32 bytes, never the token nor its plain SHA-256.
  expect(JSON.stringify(stored)).not.toContain(token);const storedHash=String(stored[0].token_hash).replace(/^\\x/,'');expect(storedHash).toMatch(/^[0-9a-f]{64}$/);expect(storedHash).not.toBe(sha(token));
  expect(JSON.stringify((await db.from('pro_bid_portal_actions').select('*').eq('actor_id',owner.id).throwOnError()).data)).not.toContain(token);
  expect(stored[0].expires_at>new Date(Date.now()+6.9*86400000).toISOString()&&stored[0].expires_at<new Date(Date.now()+7.1*86400000).toISOString()).toBe(true);
  // Retrying the same create (lost answer): same link, no new row, and the token is never shown again.
  const replayed=await ownerPost((await created).request().postDataJSON());expect(replayed.status()).toBe(200);const replayedBody=await replayed.json();
  expect(replayedBody.replayed).toBe(true);expect(replayedBody.link.id).toBe(link1);expect(replayedBody.token).toBeUndefined();expect(JSON.stringify(replayedBody)).not.toContain(token);
  expect((await db.from('pro_bid_portal_links').select('id').eq('owner_id',owner.id).throwOnError()).data).toHaveLength(1);

  // ---- Vendor: a separate browser without a ContrataCR account ----
  vendorContext=await browser.newContext({viewport:page.viewportSize()??undefined,locale:en?'en-US':'es-CR'});
  await stabilizeLocalProRuntime(vendorContext,origin);
  const vendorPage=await vendorContext.newPage(),vendorErrors=collectPageErrors(vendorPage);
  const vendorRequests:string[]=[];vendorPage.on('request',request=>{if(request.resourceType()!=='document')vendorRequests.push(request.url());});
  await vendorPage.goto(url);const root=vendorPage.locator('[data-bid-portal]');await expect(root.getByRole('heading',{level:1})).toHaveText('Muebles de cocina',{timeout:60000});
  // Only the (non-secret) link id stays in the address, so a reload reopens this invitation.
  await expect.poll(()=>vendorPage.url()).toBe(`${pagePath}?invitacion=${link1}`);expect(vendorRequests.some(u=>u.includes(token))).toBe(false);
  await expect(root).toContainText(en?'Invitation from Constructora Portal Local':'Invitación de Constructora Portal Local');await expect(root).toContainText((en?'For: ':'Para: ')+'Ferretería Central');
  await expect(root.locator('[data-bid-portal-status]')).toHaveAttribute('data-bid-portal-status','open');await expect(root.locator('[data-bid-portal-line]')).toHaveCount(2);
  for(const hidden of ['Maderas del Valle','Oferta privada de Maderas','7.777','7 777','Cliente portal'])await expect(root).not.toContainText(hidden);
  const raw=await vendorContext.request.get(origin+portal);expect(raw.status()).toBe(200);const view=await raw.json() as PortalView;
  expect(JSON.stringify(view)).not.toMatch(/budget|Maderas|777700|lowest|comparison|award|clientId|Cliente portal/);expect(view.offer).toBeNull();
  expect((await vendorContext.cookies(origin)).some(c=>c.name.startsWith('ccr_bid_portal'))).toBe(false);const vendorCookies=await vendorContext.cookies(origin+portal);const portalCookie=vendorCookies.find(c=>c.name===cookieName(link1))!;expect(portalCookie).toMatchObject({httpOnly:true,sameSite:'Strict',path:'/api/pro/bid-portal',secure:false});expect(portalCookie.value).not.toBe(token);
  expect((await vendorContext.request.get(origin+portal+'?link='+link1)).status()).toBe(200);expect((await vendorContext.request.get(origin+portal+'?link='+crypto.randomUUID())).status()).toBe(401);
  await expectNoHorizontalOverflow(vendorPage);await vendorPage.screenshot({path:info.outputPath(`bid-portal-vendor-open-${suffix}.png`),fullPage:true});
  // Fill prices in the locale's decimal format; one invalid price first.
  const price=(n:number)=>root.locator(`[data-bid-portal-line="${n}"] input`);
  await price(1).fill('15000,505');await root.getByRole('button',{name:en?'Send offer':'Enviar oferta'}).click();await expect(root.locator('[data-bid-portal-form-error]')).toContainText(en?'Check the prices':'Revise los precios');
  await price(1).fill(en?'15000.50':'15000,50');await price(2).fill('40000');
  await expect(root.locator('[data-bid-portal-line="1"] [data-bid-portal-line-total]')).toHaveText(proMoney(37501.25,en));await expect(root.locator('[data-bid-portal-total]')).toHaveText(proMoney(157501.25,en));
  await root.getByLabel(en?'Lead time in days (optional)':'Plazo de entrega en días (opcional)').fill('10');await root.getByLabel(en?'Notes (optional)':'Notas (opcional)').fill('Incluye instalación');
  for(const input of await root.locator('input,button,select,textarea').all())if(await input.isVisible())expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await root.getByRole('button',{name:en?'Send offer':'Enviar oferta'}).click();await expect(root.locator('[data-bid-portal-notice]')).toContainText(en?'Offer received on':'Oferta recibida el');
  // Round 2: the confirmation is shown next to the buttons, in view; «Reload request» is distinct from «Update offer».
  await expect(root.locator('[data-bid-portal-notice]')).toBeInViewport();await expect(root.getByRole('button',{name:en?'Reload request':'Recargar solicitud',exact:true})).toBeVisible();
  await expect(root.getByRole('button',{name:en?'Update offer':'Actualizar oferta'})).toBeVisible();
  const resp=(await db.from('pro_bid_responses').select('received_on,lead_days,notes').eq('owner_id',owner.id).eq('supplier_id',v1).single().throwOnError()).data!;expect(resp).toEqual({received_on:today,lead_days:10,notes:'Incluye instalación'});
  expect((await db.from('pro_bid_response_prices').select('line_id,unit_cents').eq('owner_id',owner.id).eq('supplier_id',v1).order('unit_cents').throwOnError()).data).toEqual([{line_id:l1,unit_cents:1500050},{line_id:l2,unit_cents:4000000}]);
  // The owner edits that offer by hand with an internal note: the vendor never sees it (only what it sent).
  pkg=(await (await page.request.get(api+'?'+new URLSearchParams({view:'detail',workId,id:packageId}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json()).package;
  pkg=await bid({action:'record_response',actionId:crypto.randomUUID(),workId,id:packageId,revision:pkg.revision,supplierId:v1,receivedOn:today,leadDays:99,validUntil:null,notes:'Nota interna del dueño: negociar 10 %',prices:[{lineId:l1,unitCents:1500050},{lineId:l2,unitCents:4000000}]});
  const afterNote=await (await vendorContext.request.get(origin+portal)).json() as PortalView&{offer:{notes:string|null;leadDays:number|null}};
  expect(JSON.stringify(afterNote)).not.toContain('Nota interna');expect(afterNote.offer).toMatchObject({notes:'Incluye instalación',leadDays:10});
  await vendorPage.reload();await expect(root.getByRole('heading',{level:1})).toHaveText('Muebles de cocina',{timeout:60000});await expect(root).not.toContainText('Nota interna');
  await expect(root.getByLabel(en?'Notes (optional)':'Notas (opcional)')).toHaveValue('Incluye instalación');await expect(root.getByLabel(en?'Lead time in days (optional)':'Plazo de entrega en días (opcional)')).toHaveValue('10');
  await expectNoHorizontalOverflow(vendorPage);await vendorPage.screenshot({path:info.outputPath(`bid-portal-vendor-sent-${suffix}.png`),fullPage:true});
  // Update (only line 2, line 1 left unquoted).
  await price(1).fill('');await price(2).fill(en?'38000.75':'38000,75');await expect(root.locator('[data-bid-portal-line="1"] [data-bid-portal-line-total]')).toHaveText(en?'Not quoted':'Sin cotizar');
  await root.getByRole('button',{name:en?'Update offer':'Actualizar oferta'}).click();await expect(root).toContainText(en?'Sent 2 times from this link.':'Enviada 2 veces desde este enlace.');
  expect((await db.from('pro_bid_response_prices').select('line_id,unit_cents').eq('owner_id',owner.id).eq('supplier_id',v1).throwOnError()).data).toEqual([{line_id:l2,unit_cents:3800075}]);
  // API: stale revision (other tab) -> 409; foreign line -> 400; body limit -> 413; cross-origin -> 403.
  const current=await (await vendorContext.request.get(origin+portal)).json() as PortalView;
  const offer=(extra:Record<string,unknown>)=>({action:'submit',actionId:crypto.randomUUID(),revision:current.revision,leadDays:null,validUntil:null,notes:null,prices:[{lineId:l2,unitCents:1}],...extra});
  expect((await vendorContext.request.post(origin+portal,{headers:{Origin:origin},data:offer({revision:current.revision-1})})).status()).toBe(409);
  expect((await vendorContext.request.post(origin+portal,{headers:{Origin:origin},data:offer({prices:[{lineId:crypto.randomUUID(),unitCents:1}]})})).status()).toBe(400);
  expect((await vendorContext.request.post(origin+portal,{headers:{Origin:origin},data:offer({supplierId:v2})})).status()).toBe(400);
  expect((await vendorContext.request.post(origin+portal,{headers:{Origin:origin,'Content-Type':'application/json'},data:'{"pad":"'+'x'.repeat(17000)+'"}'})).status()).toBe(413);
  expect((await vendorContext.request.post(origin+portal,{headers:{Origin:'http://evil.example'},data:offer({})})).status()).toBe(403);
  // Idempotent retry of the same action.
  const retry=offer({prices:[{lineId:l2,unitCents:3700000}]});const first=await vendorContext.request.post(origin+portal,{headers:{Origin:origin},data:retry});expect(first.status()).toBe(200);
  const again=await vendorContext.request.post(origin+portal,{headers:{Origin:origin},data:retry});expect(again.status()).toBe(200);expect((await again.json()).replayed).toBe(true);
  expect((await db.from('pro_bid_portal_submissions').select('action_id').eq('owner_id',owner.id).throwOnError()).data).toHaveLength(3);

  // ---- Single use: the same link on another device is refused ----
  second=await browser.newContext({viewport:page.viewportSize()??undefined});await stabilizeLocalProRuntime(second,origin);const secondPage=await second.newPage();
  await secondPage.goto(url);await expect(secondPage.locator('[data-bid-portal-error]')).toHaveAttribute('data-bid-portal-error','used',{timeout:60000});
  await expect(secondPage.locator('[data-bid-portal-error]')).toContainText(en?'This link was already used.':'Este enlace ya se usó.');
  expect((await second.request.get(origin+portal)).status()).toBe(401);
  await expectNoHorizontalOverflow(secondPage);await secondPage.screenshot({path:info.outputPath(`bid-portal-used-${suffix}.png`)});
  // The vendor's own browser reopens its link: its session still works.
  await vendorPage.goto('about:blank');await vendorPage.goto(url);await expect(root.getByRole('heading',{level:1})).toHaveText('Muebles de cocina',{timeout:60000});await expect.poll(()=>vendorPage.url()).toBe(`${pagePath}?invitacion=${link1}`);

  // ---- Owner sees the portal offer in the comparison ----
  await panel.getByRole('button',{name:en?'Refresh links':'Actualizar enlaces'}).click();
  await expect(card.locator('[data-bid-portal-link-status]')).toHaveAttribute('data-bid-portal-link-status','claimed');await expect(card.locator('[data-bid-portal-submissions]')).toHaveAttribute('data-bid-portal-submissions','3');
  await expect(page.locator('[data-bid-detail="LIC-0001"] [data-bid-vendor="Ferretería Central"]')).toContainText(proMoney(111000,en));
  await expectNoHorizontalOverflow(page);await card.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`bid-portal-owner-claimed-${suffix}.png`)});

  // ---- Revoke: the session stops working; the offer is kept ----
  await card.getByRole('button',{name:en?'Cancel link':'Anular enlace'}).click();await page.getByRole('alertdialog').or(page.getByRole('dialog').last()).getByRole('button',{name:en?'Cancel link':'Anular enlace'}).click();
  await expect(card.locator('[data-bid-portal-link-status]')).toHaveAttribute('data-bid-portal-link-status','revoked');
  expect((await vendorContext.request.get(origin+portal)).status()).toBe(401);await vendorPage.reload();await expect(vendorPage.locator('[data-bid-portal-error]')).toHaveAttribute('data-bid-portal-error','session',{timeout:60000});
  expect((await db.from('pro_bid_response_prices').select('unit_cents').eq('owner_id',owner.id).eq('supplier_id',v1).throwOnError()).data).toEqual([{unit_cents:3700000}]);
  // A vendor with portal offers cannot be removed (the immutable record is kept), even after clearing its offer.
  pkg=(await (await page.request.get(api+'?'+new URLSearchParams({view:'detail',workId,id:packageId}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json()).package;
  pkg=await bid({action:'clear_response',actionId:crypto.randomUUID(),workId,id:packageId,revision:pkg.revision,supplierId:v1});
  const uninvite=await page.request.post(api,{headers,data:{action:'uninvite',actionId:crypto.randomUUID(),workId,id:packageId,revision:pkg.revision,supplierId:v1}});
  expect(uninvite.status()).toBe(400);expect((await uninvite.json()).reason).toBe('portal_submissions');
  expect((await db.from('pro_bid_portal_submissions').select('action_id').eq('owner_id',owner.id).throwOnError()).data).toHaveLength(3);

  // ---- New link; closing the bid ends offers ----
  const created2=page.waitForResponse(response=>new URL(response.url()).pathname===links&&response.request().method()==='POST');
  await card.getByRole('button',{name:en?'Create link':'Crear enlace'}).click();const link2=(await (await created2).json()).link.id as string;const url2=await card.locator('[data-bid-portal-url]').inputValue();expect(url2).not.toBe(url);
  // Pasting the new link in the same tab (only the fragment changes) opens it too.
  await vendorPage.goto(url2);await expect(root.getByRole('heading',{level:1})).toHaveText('Muebles de cocina',{timeout:60000});await expect.poll(()=>vendorPage.url()).toBe(`${pagePath}?invitacion=${link2}`);
  // One cookie per link: both stay in the browser; the request names the link.
  // (cookies(url) also lists the site's own Path=/ cookies: locale, consent; only the portal ones count.)
  const portalCookies=(await vendorContext.cookies(origin+portal)).filter(c=>c.name.startsWith('ccr_bid_portal'));
  expect(portalCookies.map(c=>c.name).sort()).toEqual([cookieName(link1),cookieName(link2)].sort());
  for(const cookie of portalCookies)expect({path:cookie.path,httpOnly:cookie.httpOnly,sameSite:cookie.sameSite}).toEqual({path:'/api/pro/bid-portal',httpOnly:true,sameSite:'Strict'});
  expect((await vendorContext.request.get(origin+portal)).status()).toBe(401);expect((await vendorContext.request.get(origin+portal+'?link='+link2)).status()).toBe(200);
  // HTTPS (e.g. a local tunnel): the session cookie is Secure. Another vendor link, claimed over https.
  const viaHttps=await ownerPost({action:'create_link',actionId:crypto.randomUUID(),id:crypto.randomUUID(),workId,packageId,supplierId:v2,replacesLinkId:null,expiresInDays:1});expect(viaHttps.status()).toBe(200);const httpsLink=await viaHttps.json();
  // Next may rebuild req.url as https from X-Forwarded-Proto; the same-origin check then expects an https Origin (403 claims nothing).
  let httpsClaim=await second.request.post(origin+portal,{headers:{Origin:origin.replace('http:','https:'),'X-Forwarded-Proto':'https'},data:{action:'claim',token:httpsLink.token}});
  if(httpsClaim.status()===403)httpsClaim=await second.request.post(origin+portal,{headers:{Origin:origin,'X-Forwarded-Proto':'https'},data:{action:'claim',token:httpsLink.token}});
  expect(httpsClaim.status()).toBe(200);
  expect(httpsClaim.headers()['set-cookie']).toMatch(new RegExp(`^${cookieName(httpsLink.link.id)}=[A-Za-z0-9_-]{43}; Path=/api/pro/bid-portal; HttpOnly; SameSite=Strict; Max-Age=\\d+; Secure$`));
  // Expired link (the guard keeps expiry immutable): a fresh link's row is re-inserted already expired.
  const expiring=await ownerPost({action:'create_link',actionId:crypto.randomUUID(),id:crypto.randomUUID(),workId,packageId,supplierId:v2,replacesLinkId:httpsLink.link.id,expiresInDays:1});expect(expiring.status()).toBe(200);const expiringLink=await expiring.json();
  const expiringRow=(await db.from('pro_bid_portal_links').select('id,token_hash').eq('id',expiringLink.link.id).single().throwOnError()).data!;
  await db.from('pro_bid_portal_links').delete().eq('id',expiringRow.id).throwOnError();
  await db.from('pro_bid_portal_links').insert({owner_id:owner.id,id:expiringRow.id,package_id:packageId,supplier_id:v2,token_hash:expiringRow.token_hash,expires_at:new Date(Date.now()-86400000).toISOString(),created_at:new Date(Date.now()-3*86400000).toISOString()}).throwOnError();
  pkg=(await (await page.request.get(api+'?'+new URLSearchParams({view:'detail',workId,id:packageId}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json()).package;
  await bid({action:'close',actionId:crypto.randomUUID(),workId,id:packageId,revision:pkg.revision});
  await vendorPage.reload();await expect(root.locator('[data-bid-portal-closed]')).toContainText(en?'no longer accepts offers':'ya no recibe ofertas',{timeout:60000});await expect(root.getByRole('button',{name:en?'Update offer':'Actualizar oferta'})).toHaveCount(0);
  const closedView=await (await vendorContext.request.get(origin+portal+'?link='+link2)).json() as PortalView;expect(closedView.package.status).toBe('closed');
  const late=await vendorContext.request.post(origin+portal,{headers:{Origin:origin},data:{action:'submit',link:link2,actionId:crypto.randomUUID(),revision:closedView.revision,leadDays:null,validUntil:null,notes:null,prices:[{lineId:l1,unitCents:1}]}});expect(late.status()).toBe(409);expect((await late.json()).reason).toBe('closed');
  await expectNoHorizontalOverflow(vendorPage);await vendorPage.screenshot({path:info.outputPath(`bid-portal-vendor-closed-${suffix}.png`),fullPage:true});
  // Expired link (re-inserted above already past its expiry): refused.
  const expired=await second.request.post(origin+portal,{headers:{Origin:origin},data:{action:'claim',token:expiringLink.token}});expect(expired.status()).toBe(410);expect((await expired.json()).reason).toBe('expired');
  expect((await second.request.post(origin+portal,{headers:{Origin:origin},data:{action:'claim',token:'B'.repeat(43)}})).status()).toBe(404);
  // Nothing was e-mailed or notified.
  for(const table of ['notifications','notification_push_outbox'])expect((await db.from(table).select('id').eq('user_id',owner.id).throwOnError()).data).toEqual([]);
  expect(errors()).toEqual([]);expect(vendorErrors()).toEqual([]);
 }finally{await second?.close().catch(()=>{});await vendorContext?.close().catch(()=>{});await page.goto('about:blank').catch(()=>{});await cleanupDisposableAccount(owner);}
});
