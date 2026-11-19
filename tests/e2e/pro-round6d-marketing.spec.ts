import {test,expect,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin} from './pro-round2-fixture';

// Round 6D (row 71): email campaigns and automations in MOCK mode. Consent recorded explicitly (customer without
// consent never receives anything), test send only to the owner, campaign to the consenting audience → outbox
// «simulado» with SIMULATED metrics, review-request automation creates a draft that needs approval, scheduled
// campaign dispatched once, unsubscribe link → suppression (cannot be re-added). Nothing leaves the machine.
const shots=process.env.ROUND6D_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
for(const language of ['es','en'] as const)test(`Round 6D: email campaigns with consent, automations with approval and unsubscribe [${language}]`,async({page,browser},info)=>{
 test.setTimeout(480000);local(info.project.use.baseURL);const en=language==='en',project=info.project.name,label=language+crypto.randomUUID().slice(0,6),t=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),label,(document,ids)=>{
  document.clients.push({id:'sin-permiso-'+label,name:'Diego Sin Permiso',email:`diego.${label}@example.test`,phone:'',notes:'',archived:false});
  document.work[0]={...document.work[0]!,stage:'completed',start:'2026-11-02T09:00:00-06:00',end:'2026-11-02T11:00:00-06:00'};
  document.work.push({id:crypto.randomUUID(),clientId:'sin-permiso-'+label,client:'Diego Sin Permiso',service:'Pintura',stage:'completed',start:'2026-11-03T09:00:00-06:00',end:'2026-11-03T11:00:00-06:00',cancelled:false});void ids;
 });
 let visitor:Awaited<ReturnType<typeof browser.newContext>>|null=null;
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner),carla=`cliente.${label}@example.test`,diego=`diego.${label}@example.test`;
  const read=async()=>(await (await page.request.get(origin+'/api/pro/marketing')).json()) as {ownerEmail:string;outbox:{kind:string;to:string;body:string;delivery:string}[];contacts:{email:string;consent:string;suppressed:boolean}[];campaigns:{id:string;status:string;revision:number;recipients:number|null}[]};
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'correo'}));
  const root=page.locator('[data-company-marketing]');await expect(root).toHaveAttribute('data-company-marketing','mock',{timeout:90000});
  await expect(root.locator('[data-simulated]').first()).toBeVisible();await expect(root.locator('[data-mkt-count="without"] dd')).toHaveText('2');await expect(root.locator('[data-mkt-count="granted"] dd')).toHaveText('0');
  // (1) Consent recorded for Carla only (chosen from the customers), with evidence and text.
  await root.locator('[data-mkt-candidate]').selectOption({label:`Cliente ronda ${label} · ${carla}`});await root.locator('[data-mkt-field="evidence"]').selectOption('written');
  await root.locator('[data-mkt-consent-save]').click();await expect(root.locator(`[data-mkt-contact="${carla}"]`)).toHaveAttribute('data-consent','granted',{timeout:60000});
  await expect(root.locator('[data-mkt-count="granted"] dd')).toHaveText('1');
  // (2) Automation «review request» → a DRAFT for Carla's completed job only (Diego has no consent); nothing queued.
  const review=root.locator('[data-mkt-automation="review_request"]');await review.locator('[data-mkt-automation-enabled]').check();await review.locator('input[type=number]').fill('0');await review.locator('[data-mkt-automation-save]').click();
  await expect(root.locator('[data-mkt-notice]')).toContainText(t('Automatización guardada','Automation saved'),{timeout:60000});
  await root.locator('[data-mkt-scan]').click();await expect(root.locator('[data-mkt-draft="pending_approval"]')).toHaveCount(1,{timeout:60000});
  await expect(root.locator('[data-mkt-draft="pending_approval"]')).toContainText(carla);expect((await read()).outbox).toEqual([]);
  await root.locator('[data-mkt-draft="pending_approval"]').scrollIntoViewIfNeeded();await shot(page,`r6d-mkt-draft-${language}`,project);
  await root.locator('[data-mkt-approve]').click();await expect(root.locator('[data-mkt-draft="approved"]')).toHaveCount(1,{timeout:60000});
  // (3) Campaign: draft → test send (owner only) → send now to the consenting audience.
  await root.locator('[data-mkt-new-campaign]').click();await root.locator('[data-mkt-field="campaign-name"]').fill('Promo '+label);await root.locator('[data-mkt-field="subject"]').fill(t('Hola {{nombre}}, descuento de diciembre','Hello {{nombre}}, December discount'));
  await root.locator('[data-mkt-campaign-save]').click();const campaign=root.locator('[data-mkt-campaign="draft"]');await expect(campaign).toHaveCount(1,{timeout:60000});
  await expect(campaign).toContainText(en?'1 contact':'1 contacto');
  await campaign.locator('[data-mkt-test]').click();await expect(root.locator('[data-mkt-message="test"]')).toHaveCount(1,{timeout:60000});
  await campaign.locator('[data-mkt-send]').click();await page.getByRole('button',{name:t('Enviar','Send'),exact:true}).last().click();
  await expect(root.locator('[data-mkt-campaign="sent"]')).toHaveCount(1,{timeout:60000});await expect(root.locator('[data-mkt-metrics]')).toContainText(t('No son datos reales','Not real data'));
  const box=await read();
  expect(box.outbox.find(m=>m.kind==='test')!.to).toBe(box.ownerEmail);expect(box.outbox.filter(m=>m.kind==='campaign').map(m=>m.to)).toEqual([carla]);expect(box.outbox.find(m=>m.kind==='automation')!.to).toBe(carla);
  expect(box.outbox.every(m=>m.delivery==='simulado')).toBe(true);expect(box.outbox.some(m=>m.to===diego)).toBe(false);
  await root.locator('[data-mkt-message="campaign"] button').first().click();await expect(root.locator('[data-mkt-message-body]')).toContainText('/baja-pro#t=');
  await expectNoHorizontalOverflow(page);await root.locator('[data-mkt-outbox]').scrollIntoViewIfNeeded();await shot(page,`r6d-mkt-outbox-${language}`,project,true);
  // (4) Scheduled campaign dispatched once when due (server claim), never twice.
  const second=crypto.randomUUID();
  expect((await page.request.post(origin+'/api/pro/marketing',{headers:h,data:{action:'campaign_save',actionId:crypto.randomUUID(),id:second,revision:0,name:'Programada',subject:'Aviso',body:'Texto',segment:'all'}})).status()).toBe(200);
  expect((await page.request.post(origin+'/api/pro/marketing',{headers:h,data:{action:'campaign_schedule',actionId:crypto.randomUUID(),id:second,revision:1,scheduledAt:new Date(Date.now()+3600000).toISOString()}})).status()).toBe(200);
  await f.db.from('pro_mkt_campaigns').update({scheduled_at:new Date(Date.now()-60000).toISOString()}).eq('owner_id',f.owner.id).eq('id',second).throwOnError();
  const due=await (await page.request.post(origin+'/api/pro/marketing',{headers:h,data:{action:'run_due'}})).json() as {sent:{id:string;recipients:number}[]};expect(due.sent).toEqual([{id:second,recipients:1}]);
  expect((await (await page.request.post(origin+'/api/pro/marketing',{headers:h,data:{action:'run_due'}})).json()).sent).toEqual([]);
  // (5) The recipient unsubscribes from the link in the email (no account).
  const body=(await read()).outbox.find(m=>m.kind==='campaign')!.body,link=/(https?:\/\/[^\s]+\/baja-pro#t=[a-f0-9]{64})/.exec(body)![1]!;
  visitor=await browser.newContext({viewport:page.viewportSize()??undefined});const v=await visitor.newPage();const vErrors=collectPageErrors(v);
  await v.goto(link.replace('/baja-pro',(en?'/en':'')+'/baja-pro'));await expect(v.locator('[data-unsubscribe-confirm]')).toBeVisible({timeout:90000});await expect(v.getByRole('main')).toContainText('Remodelaciones '+label);
  await v.locator('[data-unsubscribe-confirm]').click();await expect(v.locator('[data-unsubscribe="done"]')).toBeVisible({timeout:60000});await shot(v,`r6d-mkt-unsubscribed-${language}`,project);expect(vErrors()).toEqual([]);
  const after=await read();expect(after.contacts.find(c=>c.email===carla)).toMatchObject({consent:'revoked',suppressed:true});
  const again=await page.request.post(origin+'/api/pro/marketing',{headers:h,data:{action:'contact_consent',actionId:crypto.randomUUID(),email:carla,name:'Carla',clientId:null,consentText:'Dijo que sí otra vez por teléfono, de verdad.',evidence:'verbal',note:''}});
  expect(again.status()).toBe(409);expect((await again.json()).reason).toBe('suppressed');
  // A new campaign now has nobody to send to; the DB would refuse a message to a non-consenting address anyway.
  const third=crypto.randomUUID();await page.request.post(origin+'/api/pro/marketing',{headers:h,data:{action:'campaign_save',actionId:crypto.randomUUID(),id:third,revision:0,name:'Vacía',subject:'x',body:'y',segment:'all'}});
  expect(await (await page.request.post(origin+'/api/pro/marketing',{headers:h,data:{action:'campaign_send_now',actionId:crypto.randomUUID(),id:third,revision:1}})).json()).toMatchObject({campaign:{status:'sent',recipients:0}});
  expect((await page.request.post(origin+'/api/pro/marketing-unsubscribe',{headers:{Origin:origin},data:{token:'0'.repeat(64),confirm:true}})).status()).toBe(404);
  // (6) Post-security fixes, RFC 8058 one-click: the mailbox provider POSTs «List-Unsubscribe=One-Click» to the header
  // URI (token in the query), from another origin and without cookies. Same answer for valid / unknown / malformed.
  const third2=`tercero.${label}@example.test`;
  expect((await page.request.post(origin+'/api/pro/marketing',{headers:h,data:{action:'contact_consent',actionId:crypto.randomUUID(),email:third2,name:'Tercero',clientId:null,consentText:'Aceptó por escrito recibir novedades y promociones por correo.',evidence:'written',note:''}})).status()).toBe(200);
  const fourth=crypto.randomUUID();
  expect((await page.request.post(origin+'/api/pro/marketing',{headers:h,data:{action:'campaign_save',actionId:crypto.randomUUID(),id:fourth,revision:0,name:'Cuarta',subject:'Aviso',body:'Texto',segment:'all'}})).status()).toBe(200);
  expect(await (await page.request.post(origin+'/api/pro/marketing',{headers:h,data:{action:'campaign_send_now',actionId:crypto.randomUUID(),id:fourth,revision:1}})).json()).toMatchObject({campaign:{status:'sent',recipients:1}});
  const page4=(await read()).outbox.find(m=>m.kind==='campaign'&&m.to===third2)!.body,token4=/\/baja-pro#t=([a-f0-9]{64})/.exec(page4)![1]!;
  const oneClick=(token:string,form:Record<string,string>={'List-Unsubscribe':'One-Click'},extra:Record<string,string>={})=>page.request.post(origin+'/api/pro/marketing-unsubscribe/one-click?t='+token,{headers:{Origin:'https://mail.example',...extra},form});
  const refused=await oneClick(token4,{'List-Unsubscribe':'Other'});expect(refused.status(),'not the exact RFC 8058 body: same-origin rule applies').toBe(403);
  expect((await read()).contacts.find(c=>c.email===third2)).toMatchObject({consent:'granted',suppressed:false});
  const answers:[number,string][]=[];for(const token of [token4,token4,'0'.repeat(64),'nope']){const r=await oneClick(token);answers.push([r.status(),await r.text()]);}
  expect(answers,'idempotent and identical for valid, repeated, unknown and malformed tokens').toEqual([[200,'OK'],[200,'OK'],[200,'OK'],[200,'OK']]);
  expect((await read()).contacts.find(c=>c.email===third2)).toMatchObject({consent:'revoked',suppressed:true});
  const get=await page.request.get(origin+'/api/pro/marketing-unsubscribe/one-click?t='+token4,{maxRedirects:0});expect(get.status(),'GET never unsubscribes: it only redirects to the page').toBe(303);expect(get.headers().location).toBe('/baja-pro#t='+token4);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'correo'}));await expect(root.locator(`[data-mkt-contact="${carla}"]`)).toHaveAttribute('data-consent','suppressed',{timeout:90000});
  await expectNoHorizontalOverflow(page);await shot(page,`r6d-mkt-contacts-${language}`,project);
  expect(errors()).toEqual([]);
 }finally{await visitor?.close();await f.cleanup();}
});
