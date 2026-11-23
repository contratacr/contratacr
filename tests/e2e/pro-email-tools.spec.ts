import {test,expect} from 'playwright/test';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,headersFor,origin} from './pro-round2-fixture';

// Family 10: email templates and the synced inbox (mock mode). Templates: CRUD with revision and archive; inbox: read-only copy
// of three deterministic sample messages, idempotent, linkable to a job. Nothing is sent. Disposable accounts, loopback only.
for(const language of ['es','en'] as const)test(`Email templates and inbox [${language}]`,async({page},info)=>{
 test.setTimeout(480000);local(info.project.use.baseURL);const en=language==='en',label=language+crypto.randomUUID().slice(0,6),tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),label);
 try{
  const errors=collectPageErrors(page),h=headersFor(f.owner);
  const api=origin+'/api/pro/company-email-tools';
  const post=(data:Record<string,unknown>)=>page.request.post(api,{headers:h,data});
  const read=async()=>(await (await page.request.get(api)).json()) as {templates:{id:string;name:string;revision:number;archived:boolean;subject:string}[];inbox:{remoteId:string;workId:string|null;fromEmail:string}[]};

  // (1) Without a connected mailbox the sync is refused and nothing is stored.
  const early=await post({action:'inbox_sync',provider:'google'});expect(early.status()).toBe(409);
  expect((await read()).inbox).toHaveLength(0);

  // (2) Templates through the API: create, stale revision, duplicate name, bounds, archive.
  const created=await post({action:'template_save',id:null,revision:0,name:'Seguimiento '+label,subject:'Hola {{cliente}}, avance de {{trabajo}}',body:'Le escribimos el {{fecha}}.',locale:'es'});
  expect(created.status(),await created.text()).toBe(200);const template=(await created.json()).template as {id:string;revision:number};expect(template.revision).toBe(1);
  expect((await post({action:'template_save',id:template.id,revision:0,name:'Otro',subject:'a',body:'b',locale:'es'})).status()).toBe(409);
  expect((await post({action:'template_save',id:null,revision:0,name:('Seguimiento '+label).toUpperCase(),subject:'a',body:'b',locale:'es'})).status()).toBe(409);
  expect((await post({action:'template_save',id:null,revision:0,name:'x'.repeat(81),subject:'a',body:'b',locale:'es'})).status()).toBe(400);
  expect((await post({action:'template_save',id:null,revision:0,name:'Extra',subject:'a',body:'b',locale:'fr'})).status()).toBe(400);
  const denied=await page.context().browser()!.newContext({baseURL:origin});
  expect((await denied.request.post(api,{headers:{Origin:origin},data:{action:'inbox_sync',provider:'google'}})).status()).toBe(401);await denied.close();

  // (3) Company › Email and calendar: connect Google through the mock consent, then use the screens.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'conectores'}));
  const root=page.locator('[data-company-connectors]');await expect(root).toBeVisible({timeout:90000});
  await expect(root.locator('[data-mail-tools]')).toHaveCount(0);
  await root.locator('[data-connector="google"] [data-connector-connect]').click();
  await expect(page.locator('[data-mock-consent="google"]')).toBeVisible({timeout:60000});
  await page.locator('[data-mock-allow]').click();
  await expect(page.locator('[data-oauth-result="connected"]')).toBeVisible({timeout:90000});
  const tools=root.locator('[data-mail-tools]');await expect(tools).toBeVisible({timeout:60000});
  await expect(tools.locator(`[data-template-item="${template.id}"]`)).toBeVisible();
  // New template from the form.
  await tools.locator('[data-template-new]').click();
  const form=tools.locator('[data-template-form]');
  await form.locator('[data-template-field="name"]').fill('Recordatorio '+label);
  await form.locator('[data-template-field="subject"]').fill(tr('Recordatorio de {{trabajo}}','Reminder for {{trabajo}}'));
  await form.locator('[data-template-field="body"]').fill(tr('Mañana pasamos por la obra.','We will visit the site tomorrow.'));
  await form.locator('[data-template-save]').click();
  await expect(tools.getByText(tr('Plantilla guardada.','Template saved.'))).toBeVisible({timeout:60000});
  await expect(tools.locator('[data-template-item]')).toHaveCount(2);
  await expectNoHorizontalOverflow(page);

  // (4) Inbox: sync copies three samples; syncing again is idempotent; nothing was recorded as sent.
  await expect(tools.locator('[data-inbox-item]')).toHaveCount(0);
  await tools.locator('[data-inbox-sync="google"]').click();
  await expect(tools.locator('[data-inbox-item]')).toHaveCount(3,{timeout:60000});
  await tools.locator('[data-inbox-sync="google"]').click();
  await expect(tools.getByText(tr('0 mensaje(s) nuevo(s) copiado(s).','0 new message(s) copied.'))).toBeVisible({timeout:60000});
  await expect(tools.locator('[data-inbox-item]')).toHaveCount(3);
  expect((await f.db.from('pro_email_outbox').select('id').eq('owner_id',f.owner.id)).data).toHaveLength(0);
  // Link one message to the job and read it back.
  const first=tools.locator('[data-inbox-item]').first();
  await first.locator('[data-inbox-link]').selectOption(f.workId);
  await expect(tools.getByText(tr('Vínculo guardado.','Link saved.'))).toBeVisible({timeout:60000});
  expect((await read()).inbox.filter(message=>message.workId===f.workId)).toHaveLength(1);
  expect((await post({action:'inbox_link',provider:'google',remoteId:'mock-inbox-google-1',workId:'no-existe-'+label})).status()).toBe(404);
  // Conversation log of the job: the linked received message is readable per job (row 10); another job and a missing job give nothing.
  const log=await page.request.get(api.replace('company-email-tools','work-email-log')+'?workId='+encodeURIComponent(f.workId));
  expect(log.status()).toBe(200);expect(((await log.json()) as {messages:{workId:string}[]}).messages.map(message=>message.workId)).toEqual([f.workId]);
  expect((await page.request.get(api.replace('company-email-tools','work-email-log')+'?workId=no-existe-'+label)).status()).toBe(404);
  expect((await page.request.get(api.replace('company-email-tools','work-email-log'))).status()).toBe(400);

  // (5) The project-email form offers the templates and fills subject and message.
  const composer=root.locator('[data-email-composer]');await expect(composer).toBeVisible();
  await composer.locator('[data-email-template-pick]').selectOption({label:'Recordatorio '+label});
  await expect(composer.locator('[data-email-field="subject"]')).toHaveValue(tr('Recordatorio de {{trabajo}}','Reminder for {{trabajo}}'));
  await expect(composer.locator('[data-email-field="body"]')).toHaveValue(tr('Mañana pasamos por la obra.','We will visit the site tomorrow.'));

  // (6) Archive removes it from the list and the picker.
  await tools.locator(`[data-template-item="${template.id}"] [data-template-archive]`).click();
  await expect(tools.locator(`[data-template-item="${template.id}"]`)).toHaveCount(0,{timeout:60000});
  expect((await read()).templates.find(item=>item.id===template.id)?.archived).toBe(true);
  expect(errors()).toEqual([]);
 }finally{await f.cleanup();}
});
