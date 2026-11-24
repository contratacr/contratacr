import {test,expect,type BrowserContext} from 'playwright/test';
import {createHash} from 'node:crypto';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

// Rows 51, 52 and 53: complete journey of a purchase order. Product decision (2026-11-23): the vendor answers through a secure single-use link WITHOUT a
// ContrataCR account. Journey: order with address and terms, issue, secure link (hash only, expiry, one session cookie), vendor page (confirm, propose a date,
// idempotent retry), stale answer after an edit of the terms, revoke, duplicate, combine drafts, receive, reverse the receipt, return, sync with the selection
// tracking, CSV export (BOM) and ES/EN texts on every screen. Nothing is e-mailed: the owner copies the link.
const origin='http://127.0.0.1:3185',orders='/api/pro/purchase-orders',tools='/api/pro/purchase-order-tools',links='/api/pro/purchase-order-vendor-links',portal='/api/pro/po-portal';
const sha=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
const cookieName=(linkId:string)=>'ccr_po_portal_'+linkId.replace(/-/g,'');
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();}
type Order={id:string;code:string;revision:number;status:string;lines:Array<{id:string;receivedQuantity:number}>;receipts:Array<{id:string;lineId:string;kind:string;reversed:boolean}>};

for(const language of ['es','en'] as const)test(`Purchase order journey: terms, secure vendor link without account, corrections, selection sync, export [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(420000);expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const en=language==='en',db=regressionAdminClient(),owner=await createDisposableAccount({prefix:'po-link'}),errors=collectPageErrors(page);
 const mobile=(page.viewportSize()?.width??1366)<1024,suffix=`${language}${mobile?'-mobile':''}`;let vendorContext:BrowserContext|undefined;
 try{
  const user=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Constructora Orden Local',slug:'po-link-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
  const workId=crypto.randomUUID(),clientId='po-link-'+owner.id.slice(0,8),today=crTodayISO(),document=emptyBusiness();
  document.clients=[{id:clientId,name:'Cliente orden',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId,client:'Cliente orden',service:'Remodelación de cocina',stage:'scheduled',start:today+'T09:00:00-06:00',end:today+'T10:00:00-06:00',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(page.context(),owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
  expect((await page.request.get('/api/pro/client-operations?'+new URLSearchParams({workId,clientId}),{timeout:45000})).status()).toBe(200);
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const po=async(data:Record<string,unknown>,status=200)=>{const r=await page.request.post(orders,{headers,data});expect(r.status(),JSON.stringify(data).slice(0,300)).toBe(status);return (status===200?(await r.json()).order:null) as Order;};
  const detail=async(id:string)=>(await (await page.request.get(orders+'?'+new URLSearchParams({workId,view:'detail',id}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json()).order as Order;
  const tool=(data:Record<string,unknown>,extra:Record<string,string>={})=>page.request.post(tools,{headers:{...headers,...extra},data});
  const lineOf=(description:string,quantity=4,unitCents=250000,selectionOptionId:string|null=null)=>({id:crypto.randomUUID(),description,quantity,unit:'unidad',unitCents,taxRate:13,budgetCodeId:null,selectionOptionId,allowanceId:null});
  const create=async(title:string,lines:ReturnType<typeof lineOf>[],supplierName='Ferretería Central')=>po({action:'create',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),supplierId:null,supplierName,supplierContact:null,title,issueDate:today,expectedDate:null,notes:null,lines});
  // Approved selection linked to a line (row 52 sync).
  const areaId=crypto.randomUUID(),itemId=crypto.randomUUID(),optionId=crypto.randomUUID();
  await db.from('pro_work_selection_areas').insert({owner_id:owner.id,id:areaId,work_id:workId,name:'Cocina'}).throwOnError();
  await db.from('pro_work_selection_items').insert({owner_id:owner.id,id:itemId,work_id:workId,area_id:areaId,name:'Fregadero'}).throwOnError();
  await db.from('pro_work_selection_options').insert({owner_id:owner.id,id:optionId,work_id:workId,item_id:itemId,name:'Fregadero doble',quantity:4,unit_cents:250000}).throwOnError();
  await db.from('pro_work_selection_items').update({status:'approved',approved_option_id:optionId,approved_at:new Date().toISOString()}).eq('owner_id',owner.id).eq('id',itemId).throwOnError();

  // ---- Row 51: order, address and terms, issue ----
  const first=await create('Fregaderos de cocina',[lineOf('Fregadero doble',4,250000,optionId),lineOf('Grifo',2,80000)]);
  const termsBody={action:'terms',workId,id:first.id,revision:0,deliveryAddress:'Bodega San José, 200 m norte del parque',paymentTerms:'50 % anticipo, 50 % contra entrega'};
  expect((await tool({...termsBody,extra:1})).status()).toBe(400);expect((await tool(termsBody,{Origin:'http://evil.example'})).status()).toBe(403);
  expect((await tool({...termsBody,revision:3})).status()).toBe(409);
  expect((await tool(termsBody)).status()).toBe(200);
  const termsRead=await (await page.request.get(tools+'?'+new URLSearchParams({view:'terms',workId,id:first.id}))).json();expect(termsRead).toMatchObject({revision:1,deliveryAddress:termsBody.deliveryAddress,paymentTerms:termsBody.paymentTerms});
  const draftRevision=(await detail(first.id)).revision;
  // A secure link is only for issued orders.
  expect((await page.request.post(links,{headers,data:{action:'create_link',actionId:crypto.randomUUID(),id:crypto.randomUUID(),workId,orderId:first.id,replacesLinkId:null,expiresInDays:7}})).status()).toBe(400);
  await po({action:'issue',actionId:crypto.randomUUID(),workId,id:first.id,revision:draftRevision});

  // ---- Owner UI: create and copy the secure link ----
  await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin}).catch(()=>{});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'orders'}));
  const view=page.locator('[data-purchase-orders]');await view.locator(`[data-purchase-order="${first.code}"]`).getByRole('button',{name:en?'Open':'Abrir',exact:true}).click({timeout:60000});
  const detailView=view.locator(`[data-purchase-order-detail="${first.code}"]`);await expect(detailView).toBeVisible({timeout:60000});
  await expect(detailView.locator('[data-po-terms-address]')).toContainText('Bodega San José');await expect(detailView.locator('[data-po-terms-payment]')).toContainText('50 %');
  const panel=detailView.locator('[data-po-vendor-link]');await expect(panel.getByRole('heading',{name:en?'Vendor confirmation (secure link)':'Confirmación del proveedor (enlace seguro)'})).toBeVisible();
  await expect(panel).toContainText(en?'The vendor does not need an account':'El proveedor no necesita cuenta');await expect(panel.locator('[data-po-vendor-link-status]')).toHaveAttribute('data-po-vendor-link-status','none');
  await panel.locator('[data-po-vendor-days]').selectOption('7');
  const created=page.waitForResponse(response=>new URL(response.url()).pathname===links&&response.request().method()==='POST');
  await panel.locator('[data-po-vendor-create]').click();const createdBody=await (await created).json();
  const url=await panel.locator('[data-po-vendor-url]').inputValue(),pagePath=`${origin}${en?'/en':''}/orden-proveedor`;expect(url).toMatch(new RegExp(`^${pagePath}#acceso=[A-Za-z0-9_-]{43}$`));
  const token=url.split('#acceso=')[1]!,link1=createdBody.link.id as string;expect(createdBody.token).toBe(token);
  await expect(panel.locator('[data-po-vendor-link-status]')).toHaveAttribute('data-po-vendor-link-status','active');await expect(panel).toContainText(en?'Shown only now.':'Solo se muestra ahora.');
  for(const button of await panel.getByRole('button').all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);await panel.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`po-owner-link-${suffix}.png`)});
  // Only a keyed hash is stored, with a vencimiento of 7 days.
  const stored=(await db.from('pro_po_vendor_links').select('*').eq('owner_id',owner.id).throwOnError()).data!;expect(stored).toHaveLength(1);
  expect(JSON.stringify(stored)).not.toContain(token);const hash=String(stored[0].token_hash).replace(/^\\x/,'');expect(hash).toMatch(/^[0-9a-f]{64}$/);expect(hash).not.toBe(sha(token));
  expect(JSON.stringify((await db.from('pro_po_vendor_actions').select('*').eq('actor_id',owner.id).throwOnError()).data)).not.toContain(token);
  expect(stored[0].expires_at>new Date(Date.now()+6.9*86400000).toISOString()&&stored[0].expires_at<new Date(Date.now()+7.1*86400000).toISOString()).toBe(true);
  // Retry of the same create: same link, no second row, token never shown again.
  const replay=await page.request.post(links,{headers,data:(await created).request().postDataJSON()});expect(replay.status()).toBe(200);const replayBody=await replay.json();
  expect(replayBody.replayed).toBe(true);expect(replayBody.link.id).toBe(link1);expect(replayBody.token).toBeUndefined();expect((await db.from('pro_po_vendor_links').select('id').eq('owner_id',owner.id).throwOnError()).data).toHaveLength(1);
  expect((await page.request.post(links,{headers,data:{action:'create_link',actionId:crypto.randomUUID(),id:crypto.randomUUID(),workId,orderId:first.id,replacesLinkId:link1,expiresInDays:31}})).status()).toBe(400);

  // ---- Vendor: a separate browser, no ContrataCR account ----
  vendorContext=await browser.newContext({viewport:page.viewportSize()??undefined,locale:en?'en-US':'es-CR'});await stabilizeLocalProRuntime(vendorContext,origin);
  const vendorPage=await vendorContext.newPage(),vendorErrors=collectPageErrors(vendorPage),vendorRequests:string[]=[];vendorPage.on('request',request=>{if(request.resourceType()!=='document')vendorRequests.push(request.url());});
  await vendorPage.goto(url);const root=vendorPage.locator('[data-po-portal]');await expect(root.getByRole('heading',{level:1})).toHaveText('Fregaderos de cocina',{timeout:60000});
  await expect.poll(()=>vendorPage.url()).toBe(`${pagePath}?orden=${link1}`);expect(vendorRequests.some(u=>u.includes(token))).toBe(false);
  await expect(root).toContainText(en?'Order from Constructora Orden Local':'Orden de Constructora Orden Local');await expect(root.locator('[data-po-portal-address]')).toContainText('Bodega San José');await expect(root.locator('[data-po-portal-terms]')).toContainText('anticipo');
  await expect(root.locator('[data-po-portal-line]')).toHaveCount(2);for(const hidden of ['Cliente orden','Remodelación de cocina','budget'])await expect(root).not.toContainText(hidden);
  const raw=await vendorContext.request.get(origin+portal);expect(raw.status()).toBe(200);expect(JSON.stringify(await raw.json())).not.toMatch(/clientId|Cliente orden|owner_id|budgetCode|notes"/);
  const cookie=(await vendorContext.cookies(origin+portal)).find(c=>c.name===cookieName(link1))!;expect(cookie).toMatchObject({httpOnly:true,sameSite:'Strict',path:'/api/pro/po-portal'});expect(cookie.value).not.toBe(token);
  expect((await vendorContext.request.get(origin+portal+'?link='+crypto.randomUUID())).status()).toBe(401);
  // The link is single-use: a second browser cannot open it.
  const thief=await browser.newContext({locale:en?'en-US':'es-CR'});await stabilizeLocalProRuntime(thief,origin);const thiefPage=await thief.newPage();await thiefPage.goto(url);
  await expect(thiefPage.locator('[data-po-portal-error]')).toBeVisible({timeout:60000});await thief.close();
  await expectNoHorizontalOverflow(vendorPage);await vendorPage.screenshot({path:info.outputPath(`po-vendor-open-${suffix}.png`),fullPage:true});
  for(const input of await root.locator('input,button,select,textarea').all())if(await input.isVisible()){const radio=(await input.getAttribute('type'))==='radio';/* a radio's touch target is its wrapping label */const target=radio?input.locator('xpath=ancestor::label[1]'):input;expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);}
  // Propose a date (a past date is refused on the page), then confirm. Both answers are kept; the last one is current.
  await root.locator('[data-po-portal-choice="propose_date"]').check();await root.locator('[data-po-portal-send]').click();await expect(root.locator('[data-po-portal-form-error]')).toBeVisible();
  const proposed=new Date(Date.now()+5*86400000).toISOString().slice(0,10);await root.locator('[data-po-portal-date]').fill(proposed);await root.locator('[data-po-portal-note]').fill('Llega con el proximo lote');
  await root.locator('[data-po-portal-send]').click();await expect(root.locator('[data-po-portal-notice]')).toContainText(en?'Answer received':'Respuesta recibida');await expect(root.locator('[data-po-portal-current]')).toHaveAttribute('data-po-portal-current','propose_date');
  // Idempotent: the same actionId sent twice counts once.
  const respondBody=(actionId:string,revision:number,response:string)=>({action:'respond',link:link1,actionId,revision,response,proposedDate:response==='propose_date'?proposed:null,note:null});
  const viewJson=await (await vendorContext.request.get(origin+portal)).json() as {revision:number};
  const sameAction=crypto.randomUUID();
  for(let i=0;i<2;i++)expect((await vendorContext.request.post(origin+portal,{headers:{Origin:origin},data:respondBody(sameAction,viewJson.revision,'confirm')})).status()).toBe(200);
  expect((await db.from('pro_po_vendor_responses').select('id').eq('owner_id',owner.id).eq('action_id',sameAction).throwOnError()).data).toHaveLength(1);
  expect((await vendorContext.request.post(origin+portal,{headers:{Origin:origin},data:respondBody(crypto.randomUUID(),viewJson.revision+9,'confirm')})).status()).toBe(409);
  expect((await vendorContext.request.post(origin+portal,{headers:{Origin:'http://evil.example'},data:respondBody(crypto.randomUUID(),viewJson.revision,'confirm')})).status()).toBe(403);
  expect((await vendorContext.request.post(origin+portal,{headers:{Origin:origin},data:{...respondBody(crypto.randomUUID(),viewJson.revision,'confirm'),proposedDate:proposed}})).status()).toBe(400);
  await vendorPage.reload();await expect(root.locator('[data-po-portal-current]')).toHaveAttribute('data-po-portal-current','confirm',{timeout:60000});
  await vendorPage.screenshot({path:info.outputPath(`po-vendor-answered-${suffix}.png`),fullPage:true});

  // ---- Owner sees the answers; editing the terms makes them stale ----
  await page.reload();await view.locator(`[data-purchase-order="${first.code}"]`).getByRole('button',{name:en?'Open':'Abrir',exact:true}).click({timeout:60000});
  await expect(detailView.locator('[data-po-vendor-answer="confirm"]')).toBeVisible({timeout:60000});await expect(detailView.locator('[data-po-vendor-answer="propose_date"]')).toBeVisible();
  await expect(detailView.locator('[data-po-vendor-stale]')).toHaveCount(0);
  await detailView.locator('[data-po-terms-edit]').click();await detailView.locator('[data-po-terms-field="address"]').fill('Obra, Escazú');
  await detailView.locator('[data-po-terms]').getByRole('button',{name:en?'Save':'Guardar'}).click();await expect(detailView.locator('[data-po-terms-address]')).toContainText('Escazú',{timeout:60000});
  await expect(detailView.locator('[data-po-vendor-stale]').first()).toBeVisible({timeout:60000});
  await vendorPage.reload();await expect(root.locator('[data-po-portal-stale]')).toBeVisible({timeout:60000});await expect(root.locator('[data-po-portal-address]')).toContainText('Escazú');

  // ---- Revoke: the vendor loses access, answers are kept ----
  await detailView.locator('[data-po-vendor-revoke]').click();await page.getByRole('button',{name:en?'Cancel link':'Anular enlace'}).last().click();
  await expect(detailView.locator('[data-po-vendor-link-status]')).toHaveAttribute('data-po-vendor-link-status','revoked',{timeout:60000});
  expect((await vendorContext.request.get(origin+portal+'?link='+link1)).status()).toBe(401);
  await expect(detailView.locator('[data-po-vendor-answer]')).toHaveCount(2);

  // ---- Row 51: duplicate and combine drafts ----
  await detailView.locator('[data-po-duplicate]').click();
  const form=view.locator('form').first();await expect(form).toBeVisible({timeout:60000});await expect(form.locator('input').first()).toBeVisible();
  await expect(view).toContainText(en?'(copy)':'(copia)');
  await form.getByRole('button',{name:en?'Save purchase order':'Guardar orden de compra'}).click();
  await expect(view.locator('[data-purchase-order-detail]')).toBeVisible({timeout:60000});
  const copyCount=(await (await page.request.get(orders+'?'+new URLSearchParams({workId}))).json()).items.length;expect(copyCount).toBe(2);
  const d1=await create('Borrador A',[lineOf('Tubo PVC')],'Plomeria Sur'),d2=await create('Borrador B',[lineOf('Codo PVC')],'Plomeria Sur');
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'orders'}));
  await view.locator('[data-po-merge-open]').click({timeout:60000});
  await view.locator(`[data-po-merge-pick="${d1.code}"]`).check();await view.locator(`[data-po-merge-pick="${d2.code}"]`).check();await view.locator('[data-po-merge-title]').fill('Plomería combinada');
  await view.locator('[data-po-merge-do]').click();await expect(view).toContainText(en?'Orders combined into a new draft.':'Órdenes combinadas en un borrador nuevo.',{timeout:60000});
  const afterMerge=(await (await page.request.get(orders+'?'+new URLSearchParams({workId}))).json()).items as Array<{title:string;status:string}>;
  expect(afterMerge.find(item=>item.title==='Plomería combinada')).toMatchObject({status:'draft'});expect((await detail(d1.id)).status).toBe('cancelled');expect((await detail(d2.id)).status).toBe('cancelled');

  // ---- Row 52: receive, reverse the receipt, return, selection sync ----
  const current=await detail(first.id);const fregadero=current.lines[0]!;
  await po({action:'receive',actionId:crypto.randomUUID(),workId,id:first.id,revision:current.revision,receivedOn:today,note:null,entries:[{lineId:fregadero.id,quantity:4}]});
  await page.reload();await view.locator(`[data-purchase-order="${first.code}"]`).getByRole('button',{name:en?'Open':'Abrir',exact:true}).click({timeout:60000});
  const sync=detailView.locator('[data-po-selection-sync]');await expect(sync.locator('[data-po-sync-item="Fregadero"]')).toBeVisible({timeout:60000});
  await expect(sync.locator('[data-po-sync-current]')).toHaveText(en?'Not ordered':'Sin pedir');await expect(sync.locator('[data-po-sync-suggested]')).toHaveText(en?'Delivered':'Entregado');
  await sync.locator('[data-po-sync-apply]').click();await expect(sync.locator('[data-po-sync-current]')).toHaveText(en?'Delivered':'Entregado',{timeout:60000});await expect(sync.locator('[data-po-sync-apply]')).toHaveCount(0);
  expect((await db.from('pro_work_selection_tracking').select('status').eq('owner_id',owner.id).eq('item_id',itemId).single().throwOnError()).data!.status).toBe('delivered');
  // Reverse the delivery through the UI: the quantity goes back, the record stays.
  const adjust=detailView.locator('[data-po-adjust]');await adjust.locator('[data-po-reverse-receipt-open]').click();await adjust.locator('[data-po-adjust-field="reason"]').fill('Se registró por error');
  await adjust.getByRole('button',{name:en?'Save reversal':'Guardar reverso'}).click();await expect(detailView.locator('[data-po-receipt-kind="reverse"]')).toBeVisible({timeout:60000});
  const afterReverse=await detail(first.id);expect(afterReverse.lines[0]!.receivedQuantity).toBe(0);expect(afterReverse.status).toBe('issued');expect(afterReverse.receipts.some(r=>r.kind==='receipt'&&r.reversed)).toBe(true);
  // Receive again, then return one unit; returning more than delivered is refused.
  await po({action:'receive',actionId:crypto.randomUUID(),workId,id:first.id,revision:afterReverse.revision,receivedOn:today,note:null,entries:[{lineId:fregadero.id,quantity:4}]});
  const delivered=await detail(first.id);
  expect((await tool({action:'return',actionId:crypto.randomUUID(),workId,id:first.id,revision:delivered.revision,lineId:fregadero.id,quantity:5,returnedOn:today,reason:'Exceso'})).status()).toBe(400);
  await page.reload();await view.locator(`[data-purchase-order="${first.code}"]`).getByRole('button',{name:en?'Open':'Abrir',exact:true}).click({timeout:60000});
  await adjust.locator('[data-po-return-open]').click({timeout:60000});await adjust.locator('[data-po-adjust-field="quantity"]').fill('1');await adjust.locator('[data-po-adjust-field="reason"]').fill('Defecto de fábrica');
  await adjust.getByRole('button',{name:en?'Save return':'Guardar devolución'}).click();await expect(detailView.locator('[data-po-receipt-kind="return"]')).toBeVisible({timeout:60000});
  expect((await detail(first.id)).lines[0]!.receivedQuantity).toBe(3);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`po-owner-corrections-${suffix}.png`),fullPage:true});
  // Idempotent adjustment: the same actionId twice is one record.
  const adjustId=crypto.randomUUID(),base=await detail(first.id);
  const returnBody={action:'return',actionId:adjustId,workId,id:first.id,revision:base.revision,lineId:fregadero.id,quantity:1,returnedOn:today,reason:'Segundo defecto'};
  expect((await tool(returnBody)).status()).toBe(200);expect((await tool(returnBody)).status()).toBe(200);expect((await detail(first.id)).lines[0]!.receivedQuantity).toBe(2);

  // ---- Export: flat CSV with BOM ----
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'orders'}));
  const download=page.waitForEvent('download');await view.locator('[data-po-export]').click({timeout:60000});const file=await download;
  expect(file.suggestedFilename()).toMatch(en?/^purchase-orders-\d{4}-\d{2}-\d{2}\.csv$/:/^ordenes-de-compra-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv=await (await import('node:fs/promises')).readFile(await file.path()!,'utf8');expect(csv.charCodeAt(0)).toBe(0xFEFF);
  expect(csv).toContain(en?'Delivery address':'Dirección de entrega');expect(csv).toContain('Fregadero doble');expect(csv).toContain('2500.00');expect(csv).toContain('Obra, Escazú');
  expect(csv.split('\r\n').length).toBeGreaterThan(4);

  // ---- Permissions: another account sees nothing and no link works for it ----
  const rival=await createDisposableAccount({prefix:'po-link-rival'});
  try{
   const rivalContext=await browser.newContext();await login(rivalContext,rival);
   expect((await rivalContext.request.get(origin+links+'?'+new URLSearchParams({workId,id:first.id}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).not.toBe(200);
   expect((await rivalContext.request.get(origin+tools+'?'+new URLSearchParams({view:'export',workId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).not.toBe(200);
   await rivalContext.close();
  }finally{await cleanupDisposableAccount(rival);}
  expect(errors()).toEqual([]);expect(vendorErrors()).toEqual([]);
 }finally{await vendorContext?.close();await cleanupDisposableAccount(owner);}
});
