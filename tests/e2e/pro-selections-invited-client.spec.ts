import {test,expect,type Browser} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,login,headersFor,origin,type Owner} from './pro-round2-fixture';
import type {SelectionDetail} from '../../src/lib/pro/selections';

// Row 62 (batch F): the selection approval journey with a customer ACCOUNT linked to the job by project invitation
// (origin project_invite, no booking). The customer approves one option on its own and the recommended ones in one step,
// a stranger can neither read nor decide, the owner sees every item approved, and each customer decision becomes one
// internal 'selection_decided' notice for the owner (pro_notifications_sync, migration 423), idempotent on every read.
const tag=(language:string)=>language+crypto.randomUUID().slice(0,6);
async function customer(browser:Browser,prefix:string,name:string){const account=await createDisposableAccount({prefix});await regressionAdminClient().from('profiles').update({full_name:name}).eq('id',account.id).throwOnError();const context=await browser.newContext({baseURL:origin});await login(context,account);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);return {account,context};}

for(const language of ['es','en'] as const)test(`Selections approved by a customer linked by invitation, with the owner's notices [${language}]`,async({page,browser},info)=>{
 test.setTimeout(360000);local(info.project.use.baseURL);const en=language==='en',id=tag(language),tr=(es:string,english:string)=>en?english:es;
 const f:Owner=await ownerFixture(page.context(),id);let client:Awaited<ReturnType<typeof customer>>|undefined,stranger:Awaited<ReturnType<typeof customer>>|undefined;
 try{
  const ownerErrors=collectPageErrors(page),headers=headersFor(f.owner),api='/api/pro/selections';
  client=await customer(browser,'sel-invited','Clienta Invitada '+id);stranger=await customer(browser,'sel-stranger','Persona Ajena '+id);
  // Link the customer account by invitation (no booking).
  const created=await page.request.post(origin+'/api/pro/work-client-invitations',{headers,data:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,invitationId:crypto.randomUUID(),expiresInDays:7}});
  expect(created.status(),await created.text()).toBe(200);const token=(await created.json()).token as string;
  const accepted=await client.context.request.post(origin+'/api/pro/project-invitation',{headers:{Origin:origin,'X-Pro-Expected-Actor':client.account.id},data:{action:'accept',actionId:crypto.randomUUID(),token}});expect(accepted.status(),await accepted.text()).toBe(200);
  const link=(await f.db.from('pro_appointment_requests').select('id,origin,status,client_user_id').eq('owner_id',f.owner.id).eq('work_id',f.workId).single().throwOnError()).data!;
  expect(link).toMatchObject({origin:'project_invite',status:'confirmed',client_user_id:client.account.id});const requestId=link.id as string;
  const work=(await f.db.from('pro_work').select('bookingClientId').eq('user_id',f.owner.id).eq('id',f.workId).single().throwOnError()).data!;expect(work.bookingClientId??'').toBe('');

  // Owner: three published items; two with a recommended option (bulk), one without (decided on its own).
  const post=async(data:Record<string,unknown>)=>{const r=await page.request.post(origin+api,{headers,data:{workId:f.workId,actionId:crypto.randomUUID(),...data}});expect(r.status(),await r.text()).toBe(200);return await r.json();};
  const area=crypto.randomUUID(),items={faucet:crypto.randomUUID(),counter:crypto.randomUUID(),lamp:crypto.randomUUID()},options={faucetA:crypto.randomUUID(),faucetB:crypto.randomUUID(),quartz:crypto.randomUUID(),lampA:crypto.randomUUID(),lampB:crypto.randomUUID()};
  const names={faucet:tr('Grifo','Faucet'),counter:tr('Sobre','Countertop'),lamp:tr('Lámpara','Lamp')};
  await post({action:'area_create',id:area,name:tr('Cocina','Kitchen')});
  for(const key of ['faucet','counter','lamp'] as const)await post({action:'item_create',id:items[key],areaId:area,name:names[key]+' '+id,dueDate:null,notes:null,allowanceId:null});
  const option=(item:string,optionId:string,name:string,unitCents:number,revision:number)=>({action:'option_add',id:item,optionId,revision,name,brand:null,url:null,quantity:1,unitCents,clientNotes:null,imageFileId:null});
  await post(option(items.faucet,options.faucetA,tr('Grifo acero','Steel faucet'),5000000,1));await post(option(items.faucet,options.faucetB,tr('Grifo negro','Black faucet'),9000000,2));
  await post({action:'recommend',id:items.faucet,optionId:options.faucetA,revision:3});await post({action:'publish',id:items.faucet,revision:4});
  await post(option(items.counter,options.quartz,tr('Cuarzo blanco','White quartz'),15000000,1));await post({action:'recommend',id:items.counter,optionId:options.quartz,revision:2});await post({action:'publish',id:items.counter,revision:3});
  await post(option(items.lamp,options.lampA,tr('Lámpara de techo','Ceiling lamp'),3000000,1));await post(option(items.lamp,options.lampB,tr('Lámpara colgante','Pendant lamp'),4500000,2));await post({action:'publish',id:items.lamp,revision:3});
  const settings=(await (await page.request.get(origin+'/api/pro/client-dashboard?'+new URLSearchParams({workId:f.workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json()).settings;
  expect((await page.request.post(origin+'/api/pro/client-dashboard',{headers,data:{workId:f.workId,actionId:crypto.randomUUID(),revision:settings.revision,showUpdates:true,showDailyLogs:true,showFiles:true,showSelections:true,welcomeText:null}})).status()).toBe(200);

  // The invited customer reads them; a stranger cannot read nor decide.
  const read=await client.context.request.get(origin+api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':client.account.id}});expect(read.status()).toBe(200);
  const shared=await read.json();expect(shared.visible).toBe(true);expect(shared.areas[0].items.map((i:{id:string})=>i.id).sort()).toEqual(Object.values(items).sort());
  expect((await stranger.context.request.get(origin+api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':stranger.account.id}})).status()).toBe(404);
  expect((await stranger.context.request.post(origin+api,{headers:{Origin:origin,'X-Pro-Expected-Actor':stranger.account.id},data:{action:'approve',actionId:crypto.randomUUID(),requestId,id:items.lamp,revision:3,optionId:options.lampB}})).status()).toBe(403);
  expect((await stranger.context.request.post(origin+'/api/pro/selections-tracking',{headers:{Origin:origin,'X-Pro-Expected-Actor':stranger.account.id},data:{action:'approve_many',actionId:crypto.randomUUID(),requestId,items:[{id:items.faucet,optionId:options.faucetA,revision:5}]}})).status()).toBe(403);
  const notices=async()=>{const r=await page.request.get(origin+'/api/pro/notifications?'+new URLSearchParams({view:'all'}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(r.status(),await r.text()).toBe(200);
   return ((await r.json()).items as {event:string;title:string;link:Record<string,unknown>}[]).filter(n=>n.event==='selection_decided');};
  expect(await notices()).toEqual([]);

  // Customer UI: open the project from «Mis proyectos», approve the lamp on its own, then the two recommended ones in one step.
  const clientPage=await client.context.newPage(),clientErrors=collectPageErrors(clientPage);
  await gotoOK(clientPage,`/${language}/dashboard/profesional?tab=sent_projects&mode=use`);
  await clientPage.locator(`[data-client-project-link="${requestId}"]`).click({timeout:90000});await expect(clientPage).toHaveURL(new RegExp(`citaSolicitud=${requestId}`),{timeout:60000});
  const section=clientPage.locator('[data-client-selections]');await expect(section).toBeVisible({timeout:90000});
  await expect(section.locator('[data-client-selection-item]')).toHaveCount(3);
  const bulk=section.locator('[data-client-bulk-approve]');await expect(bulk).toContainText(names.faucet+' '+id);await expect(bulk).toContainText(names.counter+' '+id);await expect(bulk).not.toContainText(names.lamp+' '+id);
  await expectNoHorizontalOverflow(clientPage);await clientPage.screenshot({path:info.outputPath(`invited-client-selections-${language}.png`),fullPage:true});
  const lamp=section.locator(`[data-client-selection-item="${items.lamp}"]`);
  await lamp.locator('[data-selection-option]').nth(1).getByRole('button',{name:tr('Aprobar esta opción','Approve this option')}).click();
  await clientPage.getByRole('dialog').last().getByRole('button',{name:tr('Aprobar esta opción','Approve this option')}).click();
  await expect(lamp.locator('[data-client-selection-approved]')).toContainText(tr('Lámpara colgante','Pendant lamp'),{timeout:60000});
  await bulk.locator('[data-client-bulk-approve-button]').click();
  await expect(clientPage.getByText(tr('2 selecciones aprobadas.','2 selections approved.'))).toBeVisible({timeout:60000});await expect(bulk).toHaveCount(0);
  await clientPage.reload();await expect(clientPage.locator('[data-client-selections] [data-client-selection-approved]')).toHaveCount(3,{timeout:90000});
  await expect(clientPage.locator('[data-client-selections]').getByRole('button',{name:tr('Aprobar esta opción','Approve this option')})).toHaveCount(0);
  await expectNoHorizontalOverflow(clientPage);await clientPage.screenshot({path:info.outputPath(`invited-client-approved-${language}.png`),fullPage:true});

  // Recorded as the customer's decisions, on the invited account.
  const rows=(await f.db.from('pro_work_selection_items').select('id,status,approved_option_id').in('id',Object.values(items)).throwOnError()).data!;
  expect(Object.fromEntries(rows.map(r=>[r.id,[r.status,r.approved_option_id]]))).toEqual({[items.faucet]:['approved',options.faucetA],[items.counter]:['approved',options.quartz],[items.lamp]:['approved',options.lampB]});
  const history=(await f.db.from('pro_work_selection_history').select('action,side').eq('owner_id',f.owner.id).eq('side','client').throwOnError()).data!;
  expect(history.map(h=>h.action)).toEqual(['approve','approve','approve']);

  // Owner: one internal notice per decision (link to the job's selections), the same on every read (idempotent); nothing for the customer.
  const first=await notices();expect(first).toHaveLength(3);
  for(const notice of first)expect(notice.link).toMatchObject({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'selections',decision:'approve'});
  expect(first.map(n=>n.title).sort()).toEqual([names.counter+' '+id,names.faucet+' '+id,names.lamp+' '+id].sort());
  expect(await notices()).toEqual(first);
  expect((await f.db.from('pro_notifications').select('event').eq('owner_id',f.owner.id).eq('event','selection_decided').throwOnError()).data).toHaveLength(3);
  expect((await f.db.from('pro_notifications').select('event').eq('person_id',client.account.id).throwOnError()).data).toEqual([]);

  // Owner UI: the board shows every item approved.
  const detail=await (await page.request.get(origin+api+'?'+new URLSearchParams({workId:f.workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json() as SelectionDetail;
  expect(detail.items.map(i=>i.state)).toEqual(['approved','approved','approved']);
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:'selections'}));
  await expect(page.locator('[data-selection-item] [data-selection-state]')).toHaveCount(3,{timeout:90000});
  for(const state of await page.locator('[data-selection-item] [data-selection-state]').all())await expect(state).toHaveAttribute('data-selection-state','approved');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`owner-selections-approved-${language}.png`),fullPage:true});
  expect(clientErrors()).toEqual([]);expect(ownerErrors()).toEqual([]);
 }finally{await Promise.all([client?.context.close(),stranger?.context.close()].map(p=>p?.catch(()=>undefined)));await cleanupDisposableAccount(client?.account);await cleanupDisposableAccount(stranger?.account);await f.cleanup();}
});
