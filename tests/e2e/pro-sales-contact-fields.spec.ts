import {test,expect,type Page} from 'playwright/test';
import {randomBytes,randomUUID as uuid} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes,onAppPageError} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {newCompanyInviteCode} from '../../src/lib/pro/team-roles';
import type {ContactExtrasRead,ContactFieldsRead} from '../../src/lib/pro/contact-fields';

// Ronda F2-B (row 05): customer custom fields (company definitions), values and additional phones/e-mails in
// the customer record, import mapping to a custom field / additional phone, duplicates by an additional
// e-mail, and the role gate (Read-only cannot write). Owner of /api/pro/client-contacts/fields.
// Disposable accounts, loopback only; nothing is sent.
const shots=process.env.F2B_SHOTS_DIR?join(process.env.F2B_SHOTS_DIR,'r05'):null;
async function shot(page:Page,name:string,project:string){if(!shots)return;mkdirSync(shots,{recursive:true});await expectNoHorizontalOverflow(page);await page.screenshot({path:join(shots,`${name}-${project}.png`)});}
const api='/api/pro/client-contacts/fields';
async function openPro(page:Page,path:string,en:boolean){
 await gotoOK(page,path);
 const failed=page.getByText(en?'Could not verify Pro access. Your data is preserved.':'No se pudo comprobar el acceso a Pro. Sus datos se conservan.');
 const ready=page.locator('[data-independent-pro]');
 await expect(failed.or(ready).first()).toBeVisible({timeout:90000});
 if(await failed.isVisible())await page.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
 await expect(ready.first()).toBeVisible({timeout:90000});
}

for(const language of ['es','en'] as const)test(`Contact custom fields and additional channels [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);
 const en=language==='en',id=language+randomBytes(3).toString('hex'),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const f=await ownerFixture(page.context(),id);let member:DisposableAccount|null=null;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  await warmLocalRoutes(page,[api+'?view=fields','/api/pro/client-contacts?view=read']);
  // (0) Contract: unauthenticated 401, other origin 403, bad body 400, unknown customer 400.
  const anon=await browser.newContext({baseURL:origin});
  expect((await anon.request.get(origin+api+'?view=fields')).status()).toBe(401);await anon.close();
  expect((await page.request.post(api,{headers:{Origin:'https://evil.example'},data:{}})).status()).toBe(403);
  expect((await page.request.post(api,{headers:{Origin:origin},data:{action:'field_save'}})).status()).toBe(400);
  expect((await page.request.get(api+'?view=nope')).status()).toBe(400);
  expect((await page.request.get(api+'?'+new URLSearchParams({view:'extras',clientId:'nope'}))).status()).toBe(400);

  // (1) Definitions from the customer record: a select and a number field.
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_clients&cliente=${encodeURIComponent(f.clientId)}`,en);
  const panel=page.locator('[data-contact-extras]');await expect(panel).toBeVisible({timeout:90000});
  await expect(panel).toContainText(tr('Sin datos adicionales','No additional details'),{timeout:60000});
  await panel.locator('[data-contact-fields-manage]').click();
  const manager=page.locator('[data-contact-fields-manager]');await expect(manager).toBeVisible();
  await manager.locator('[data-contact-fields-new]').click();
  await manager.locator('[data-contact-fields-label]').fill(tr('Tipo de propiedad','Property type'));
  await manager.locator('[data-contact-fields-kind]').selectOption('select');
  await manager.locator('[data-contact-fields-options]').fill(tr('Casa\nApartamento\nLocal','House\nApartment\nStore'));
  await manager.locator('[data-contact-fields-save]').click();
  await expect(manager.locator('[data-contact-fields-count]')).toHaveAttribute('data-contact-fields-count','1',{timeout:60000});
  await manager.locator('[data-contact-fields-new]').click();
  await manager.locator('[data-contact-fields-label]').fill(tr('Área (m²)','Area (m²)'));
  await manager.locator('[data-contact-fields-kind]').selectOption('number');
  await manager.locator('[data-contact-fields-save]').click();
  await expect(manager.locator('[data-contact-fields-count]')).toHaveAttribute('data-contact-fields-count','2',{timeout:60000});
  await shot(page,`r05-fields-manager-${language}`,project);
  await page.getByRole('dialog',{name:tr('Campos personalizados de clientes','Customer custom fields')}).getByRole('button',{name:tr('Cerrar','Close'),exact:true}).click();await expect(manager).toBeHidden();
  const defs=(await (await page.request.get(api+'?view=fields')).json()) as ContactFieldsRead;expect(defs.fields.map(d=>d.kind)).toEqual(['select','number']);
  const [typeField,areaField]=defs.fields;

  // (2) Values and additional channels in the customer record.
  await expect(panel.locator('[data-contact-extras-edit]')).toBeEnabled({timeout:60000});await panel.locator('[data-contact-extras-edit]').click();
  await panel.locator(`[data-contact-extras-input="${typeField.id}"]`).selectOption(tr('Casa','House'));
  await panel.locator(`[data-contact-extras-input="${areaField.id}"]`).fill('12x');
  await panel.locator('[data-contact-extras-add="phone"]').click();await panel.locator('[data-contact-extras-channel-value="0"]').fill('7000-1234');
  await panel.locator('[data-contact-extras-add="email"]').click();await panel.locator('[data-contact-extras-channel-value="1"]').fill(`oficina.${id}@example.test`);
  await panel.locator('[data-contact-extras-save]').click();
  await expect(panel.getByRole('alert')).toContainText(tr('Revise los valores marcados.','Check the highlighted values.'));
  await panel.locator(`[data-contact-extras-input="${areaField.id}"]`).fill('120,5');
  await shot(page,`r05-extras-edit-${language}`,project);
  await panel.locator('[data-contact-extras-save]').click();
  await expect(panel.locator('[data-contact-extras-notice]')).toContainText(tr('Datos guardados.','Details saved.'),{timeout:60000});
  await expect(panel.locator(`[data-contact-extras-value="${typeField.id}"]`)).toContainText(tr('Casa','House'));
  await expect(panel.locator(`[data-contact-extras-value="${areaField.id}"]`)).toContainText(en?'120.5':'120,5');
  await expect(panel.locator('[data-contact-extras-channel="phone"]')).toContainText('7000');
  await expect(panel.locator('[data-contact-extras-channel="email"]')).toContainText(`oficina.${id}@example.test`);
  await shot(page,`r05-extras-detail-${language}`,project);
  const saved=(await (await page.request.get(api+'?'+new URLSearchParams({view:'extras',clientId:f.clientId}))).json()) as ContactExtrasRead;
  expect(saved.revision).toBe(1);expect(saved.values.find(v=>v.fieldId===areaField.id)?.value).toBe('120.5');expect(saved.history[0].action).toBe('extras_save');
  // Stale revision → 409 (another tab); the panel keeps the data.
  const stale=await page.request.post(api,{headers:{Origin:origin},data:{action:'extras_save',actionId:uuid(),revision:0,clientId:f.clientId,values:{},channels:[]}});expect(stale.status()).toBe(409);
  // Survives a reload.
  await page.reload();await expect(page.locator('[data-contact-extras]').locator(`[data-contact-extras-value="${typeField.id}"]`)).toContainText(tr('Casa','House'),{timeout:90000});

  // (3) Import: header guessed to the custom field and to "additional phone"; a row equal to the
  // additional e-mail of the existing customer already exists; an option that does not exist is an error.
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_clients&organizarClientes=1`,en);
  const organizer=page.locator('[data-contacts-organizer]');await expect(organizer).toBeVisible({timeout:90000});
  await expect(organizer.locator('[data-contacts-fields-manage]')).toContainText('(2)',{timeout:60000});
  const csv=[[tr('Nombre','Name'),tr('Correo','Email'),tr('Teléfono','Phone'),tr('Tipo de propiedad','Property type'),tr('Teléfono adicional','Phone 2')].join(','),
   `Nueva ${id},nueva.${id}@example.test,6111-2222,${tr('Apartamento','Apartment')},6333-4444`,`Repetida ${id},oficina.${id}@example.test,,,`,`Mala ${id},mala.${id}@example.test,,${tr('Bodega','Warehouse')},`].join('\n');
  await organizer.locator('[data-contacts-file]').setInputFiles({name:'clientes.csv',mimeType:'text/csv',buffer:Buffer.from(csv,'utf8')});
  await expect(organizer.locator('[data-contacts-map="3"]')).toHaveValue('custom:'+typeField.id,{timeout:30000});await expect(organizer.locator('[data-contacts-map="4"]')).toHaveValue('phone2');
  await organizer.locator('[data-contacts-review]').click();
  await expect(organizer.locator('[data-contacts-counts]')).toHaveAttribute('data-contacts-counts','1/1/0/1',{timeout:60000});
  await expect(organizer.locator('[data-contacts-row="duplicate"]')).toContainText('Cliente ronda '+id);
  await expect(organizer.locator('[data-contacts-row="invalid"]')).toContainText(tr(`valor inválido en "Tipo de propiedad"`,`invalid value in "Property type"`));
  await shot(page,`r05-import-preview-${language}`,project);
  await organizer.locator('[data-contacts-import-confirm]').click();
  await expect(organizer.locator('[data-contacts-notice]')).toContainText(tr('1 cliente nuevo','1 new customer'),{timeout:60000});
  const exported=(await (await page.request.get('/api/pro/client-contacts?view=export')).json()).items as {id:string;name:string}[];
  const created=exported.find(c=>c.name===`Nueva ${id}`)!;expect(created).toBeTruthy();expect(exported.some(c=>c.name===`Repetida ${id}`||c.name===`Mala ${id}`)).toBe(false);
  const createdExtras=(await (await page.request.get(api+'?'+new URLSearchParams({view:'extras',clientId:created.id}))).json()) as ContactExtrasRead;
  expect(createdExtras.values).toEqual([{fieldId:typeField.id,value:tr('Apartamento','Apartment')}]);expect(createdExtras.channels.map(c=>[c.kind,c.value])).toEqual([['phone','6333-4444']]);
  const exportExtras=await page.request.get(api+'?view=export');expect(exportExtras.status()).toBe(200);expect(Object.keys((await exportExtras.json()).items)).toContain(created.id);

  // (4) Read-only member of the company: reads, but cannot write values or definitions.
  const memberContext=await browser.newContext({baseURL:origin});
  try{
   member=await createDisposableAccount({prefix:'cf-member'});await login(memberContext,member);
   const code=newCompanyInviteCode(),team=(ctx:typeof memberContext,data:Record<string,unknown>)=>ctx.request.post(origin+'/api/pro/team-roles',{headers:{Origin:origin},data,timeout:120000});
   expect((await team(page.context(),{action:'invite',actionId:uuid(),email:member.email,role:'read_only',code,locale:language})).status()).toBe(200);
   expect((await team(memberContext,{action:'accept',actionId:uuid(),code})).status()).toBe(200);
   expect((await team(memberContext,{action:'enter',ownerId:f.owner.id})).status()).toBe(200);
   expect((await memberContext.request.get(origin+api+'?view=fields',{timeout:120000})).status()).toBe(200);
   const write=await memberContext.request.post(origin+api,{headers:{Origin:origin},data:{action:'extras_save',actionId:uuid(),revision:1,clientId:f.clientId,values:{},channels:[]},timeout:120000});
   expect(write.status()).toBe(403);expect((await write.json()).code).toBe('pro_role');
   const define=await memberContext.request.post(origin+api,{headers:{Origin:origin},data:{action:'field_save',actionId:uuid(),revision:defs.revision,id:uuid(),label:'X',kind:'text',options:[]},timeout:120000});expect(define.status()).toBe(403);
  }finally{await memberContext.close();}
  expect(runtime).toEqual([]);
 }finally{if(member)await cleanupDisposableAccount(member);await f.cleanup();}
});
