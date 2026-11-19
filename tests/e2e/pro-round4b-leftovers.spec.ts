import {test,expect,type Browser,type Page} from 'playwright/test';
import {createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,login,headersFor,origin,type Owner} from './pro-round2-fixture';

// Round 4B (2026-11-13), item 6 leftovers: vendor address, manual lead stage after sharing a quote,
// customer created inline from a lead and preselected (gaps 2026-11-17), extras/changes for a customer linked by
// invitation, and the provider-record race on direct links (?tab=jobs). Loopback only; nothing
// is e-mailed, notified, charged or issued.
const shots=process.env.ROUND4B_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`left-${name}-${project}.png`),fullPage});}
const tag=(language:string)=>language+crypto.randomUUID().slice(0,6);
async function customer(browser:Browser,prefix:string,name:string){const account=await createDisposableAccount({prefix});await regressionAdminClient().from('profiles').update({full_name:name}).eq('id',account.id).throwOnError();const context=await browser.newContext({baseURL:origin});await login(context,account);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);return {account,context};}
async function readyHub(page:Page,en:boolean,ready:string){
 const temporary=page.locator('main').getByRole('alert').filter({hasText:en?/^Could not verify Pro access/:/^No se pudo comprobar el acceso a Pro/});
 for(let attempt=0;attempt<3;attempt++){await expect.poll(async()=>await page.locator(ready).isVisible()||await temporary.isVisible(),{timeout:60000}).toBe(true);if(!await temporary.isVisible())break;await page.locator('main').getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();}
 await expect(page.locator(ready)).toBeVisible({timeout:60000});
}

for(const language of ['es','en'] as const){
 test(`Round 4B leftovers: vendor address and inline customer preselected in a new lead [${language}]`,async({page},info)=>{
  test.setTimeout(300000);local(info.project.use.baseURL);const en=language==='en',id=tag(language),project=info.project.name;
  const f:Owner=await ownerFixture(page.context(),id);
  try{
   const errors=collectPageErrors(page);
   // (a) Vendor address: Company › Suppliers form, list and saved record.
   await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'proveedores'}));await readyHub(page,en,'[data-company-hub="proveedores"]');
   await page.getByRole('button',{name:en?'Add supplier':'Agregar proveedor'}).click();
   await page.getByLabel(en?'Name or company name':'Nombre o razón social').fill('Ferretería Dirección '+id);
   await page.getByLabel(en?'Address (optional)':'Dirección (opcional)').fill('San José, Barrio Escalante, 100 m norte del parque');
   await page.getByRole('button',{name:en?'Save supplier':'Guardar proveedor'}).click();
   const row=page.locator('[data-company-vendor]').filter({hasText:'Ferretería Dirección '+id}).filter({visible:true});
   await expect(row).toContainText('San José, Barrio Escalante, 100 m norte del parque',{timeout:60000});
   const saved=(await f.db.from('pro_company_vendor_profiles').select('address').eq('owner_id',f.owner.id).single().throwOnError()).data!;expect(saved.address).toBe('San José, Barrio Escalante, 100 m norte del parque');
   await expectNoHorizontalOverflow(page);await shot(page,'vendor-address-'+language,project);
   // (c) «Add customer» inside a new lead creates the customer INLINE (walkthrough 3 gap: it used to jump to
   // Customers and back) through the Customers write contract, then preselects it; the draft is never lost.
   await gotoOK(page,`/${language}/dashboard/pro?tab=pro_leads`);
   const add=page.getByRole('button',{name:'+ '+(en?'Add lead':'Agregar solicitud')});await expect(add).toBeEnabled({timeout:90000});await add.click();
   const dialog=page.getByRole('dialog',{name:en?'Add lead':'Agregar solicitud',exact:true});await expect(dialog).toBeVisible({timeout:60000});
   await dialog.getByLabel(en?'Service or project':'Servicio o proyecto',{exact:true}).fill('Pérgola '+id);
   const leadUrl=page.url();
   await dialog.getByRole('button',{name:en?'Add customer':'Agregar cliente',exact:true}).click();
   const inline=dialog.getByRole('group',{name:en?'New customer':'Nuevo cliente'});await expect(inline).toBeVisible();
   await expect(inline.getByLabel(en?'Customer e-mail (optional)':'Correo del cliente (opcional)')).toHaveAttribute('placeholder',en?'you@email.com':'nombre@correo.com');
   const name='Cliente nuevo '+id;await inline.getByLabel(en?'Customer name':'Nombre del cliente').fill(name);
   await inline.getByRole('button',{name:en?'Create customer':'Crear cliente',exact:true}).click();
   await expect(dialog.locator('[data-inline-customer-message]')).toHaveText(en?'Customer created and selected.':'Cliente creado y seleccionado.',{timeout:60000});
   expect(page.url()).toBe(leadUrl);await expect(page).not.toHaveURL(/tab=pro_clients|editar=new/);
   await expect(dialog.getByLabel(en?'Service or project':'Servicio o proyecto',{exact:true})).toHaveValue('Pérgola '+id);
   await expect(dialog).toContainText(name,{timeout:30000});
   const created=(await f.db.from('pro_clients').select('id').eq('user_id',f.owner.id).eq('name',name).single().throwOnError()).data!;
   expect(await page.evaluate(actor=>localStorage.getItem('ccr:pro:client-write:v1:'+actor),f.owner.id)).toBeNull();
   await expectNoHorizontalOverflow(page);await shot(page,'lead-customer-selected-'+language,project);
   await dialog.getByRole('button',{name:en?'Save lead':'Guardar solicitud',exact:true}).click();
   await expect.poll(async()=>(await f.db.from('pro_lead_center_records').select('client_id').eq('owner_id',f.owner.id).eq('kind','manual').eq('title','Pérgola '+id).maybeSingle()).data?.client_id??null,{timeout:60000}).toBe(created.id);
   expect(errors()).toEqual([]);
  }finally{await f.cleanup();}
 });

 test(`Round 4B leftovers: manual lead advances to «quote sent» when its quote is shared [${language}]`,async({page},info)=>{
  test.setTimeout(240000);local(info.project.use.baseURL);const en=language==='en',id=tag(language),project=info.project.name;
  const f:Owner=await ownerFixture(page.context(),id);
  try{
   const leadId=crypto.randomUUID(),headers=headersFor(f.owner);
   const lead={action:'create',actionId:crypto.randomUUID(),kind:'manual',id:leadId,revision:0,catalogRevision:0,clientId:f.clientId,title:'Cocina '+id,description:'',address:'',sourceLabel:'',forecast:{projectType:'',expectedStart:null,currency:'CRC',revenueCents:null,budgetCents:null,profitCents:null},stageMode:'automatic',stageId:null};
   const createdLead=await page.request.post(origin+'/api/pro/lead-private-core',{headers,data:lead});expect(createdLead.status(),await createdLead.text()).toBe(200);
   const stages=async()=>{const r=await page.request.get(origin+'/api/pro/lead-commercial-progress?'+new URLSearchParams({view:'list'}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(r.status(),await r.text()).toBe(200);const body=await r.json();return {stage:body.stages.find((s:{id:string})=>s.id===leadId),counts:body.page.counts as {stageId:string;count:number}[]};};
   const first=await stages();expect(first.stage).toMatchObject({kind:'manual',mode:'automatic',automaticStageId:'new',effectiveStageId:'new',conversion:null});
   // A quote created from that lead and shared with the customer (status sent), linked as the product does.
   const professional=(await f.db.from('professionals').select('id').eq('profile_id',f.owner.id).single().throwOnError()).data!;
   const quoteId=crypto.randomUUID();
   await f.db.from('quotes').insert({id:quoteId,professional_id:professional.id,public_code:'R4B'+createHash('md5').update(quoteId).digest('hex').slice(0,14).toUpperCase(),title:'Cocina '+id,items:[],status:'sent'}).throwOnError();
   await f.db.from('pro_quote_links').insert({user_id:f.owner.id,quoteId,clientId:f.clientId}).throwOnError();
   await f.db.from('pro_manual_lead_quotes').insert({owner_id:f.owner.id,action_id:crypto.randomUUID(),lead_id:leadId,source_lead_revision:1,source_client_id:f.clientId,source_snapshot:{},quote_id:quoteId,input:{},result:{},actor_name:'Dueña'}).throwOnError();
   const second=await stages();expect(second.stage).toMatchObject({mode:'automatic',automaticStageId:'estimate_sent',effectiveStageId:'estimate_sent',conversion:null});
   expect(second.counts.find(c=>c.stageId==='estimate_sent')!.count).toBeGreaterThanOrEqual(1);expect(second.counts.find(c=>c.stageId==='new')!.count).toBe(first.counts.find(c=>c.stageId==='new')!.count-1);
   await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_leads',solicitudManual:leadId}));
   const source=page.getByRole('dialog',{name:en?'Lead details':'Detalle de la solicitud',exact:true}),select=source.locator(`[data-manual-lead-stage="${leadId}"]`).getByLabel(en?'Lead stage':'Etapa de la solicitud');
   await expect(select).toHaveValue('automatic',{timeout:90000});await expect(select.locator('option[value="automatic"]')).toHaveText(en?'Automatic · Quote sent':'Automática · Cotización enviada');
   await shot(page,'lead-stage-'+language,project);
  }finally{await f.cleanup();}
 });

 test(`Round 4B leftovers: extras and changes for a customer linked by invitation [${language}]`,async({page,browser},info)=>{
  test.setTimeout(300000);local(info.project.use.baseURL);const en=language==='en',id=tag(language),project=info.project.name;
  const f:Owner=await ownerFixture(page.context(),id);let client:Awaited<ReturnType<typeof customer>>|undefined,stranger:Awaited<ReturnType<typeof customer>>|undefined;
  try{
   client=await customer(browser,'r4b-invited','Clienta Invitada '+id);stranger=await customer(browser,'r4b-stranger','Persona Ajena '+id);
   const created=await page.request.post(origin+'/api/pro/work-client-invitations',{headers:headersFor(f.owner),data:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,invitationId:crypto.randomUUID(),expiresInDays:7}});
   expect(created.status(),await created.text()).toBe(200);const token=(await created.json()).token as string;
   const accepted=await client.context.request.post(origin+'/api/pro/project-invitation',{headers:{Origin:origin,'X-Pro-Expected-Actor':client.account.id},data:{action:'accept',actionId:crypto.randomUUID(),token}});expect(accepted.status(),await accepted.text()).toBe(200);
   const requestId=(await f.db.from('pro_appointment_requests').select('id,origin').eq('owner_id',f.owner.id).eq('work_id',f.workId).single().throwOnError()).data!;expect(requestId.origin).toBe('project_invite');
   await f.db.from('pro_client_entries').insert({user_id:f.owner.id,id:crypto.randomUUID(),client_id:f.clientId,work_id:f.workId,kind:'agreement',amount_cents:100000000,label:'Acuerdo R4B',request_hash:createHash('md5').update(crypto.randomUUID()).digest('hex')}).throwOnError();
   const changeId=crypto.randomUUID();
   const proposed=await page.request.post(origin+'/api/pro/work-changes',{headers:headersFor(f.owner),data:{action:'propose',id:changeId,actionId:crypto.randomUUID(),workId:f.workId,baseCents:100000000,reason:'Azulejo adicional '+id,lines:[{description:'Azulejo extra',amountCents:5000000}]}});
   expect(proposed.status(),await proposed.text()).toBe(200);
   // The invited customer reads it (previously 404); a stranger cannot.
   const read=await client.context.request.get(origin+'/api/pro/work-changes?'+new URLSearchParams({requestId:requestId.id}),{headers:{'X-Pro-Expected-Actor':client.account.id}});expect(read.status(),await read.text()).toBe(200);
   const body=await read.json();expect(body).toMatchObject({side:'client',clientLinked:true});expect(body.items.map((i:{id:string;status:string})=>[i.id,i.status])).toEqual([[changeId,'proposed']]);
   expect((await stranger.context.request.get(origin+'/api/pro/work-changes?'+new URLSearchParams({requestId:requestId.id}),{headers:{'X-Pro-Expected-Actor':stranger.account.id}})).status()).toBe(404);
   expect((await stranger.context.request.post(origin+'/api/pro/work-changes',{headers:{Origin:origin,'X-Pro-Expected-Actor':stranger.account.id},data:{action:'accept',id:changeId,actionId:crypto.randomUUID(),revision:1}})).status()).toBe(403);
   // Customer view: the change is listed and the customer accepts it.
   const clientPage=await client.context.newPage(),clientErrors=collectPageErrors(clientPage);
   await gotoOK(clientPage,`/${language}/dashboard/profesional?tab=sent_projects&mode=use`);
   await clientPage.locator(`[data-client-project-link="${requestId.id}"]`).click({timeout:90000});await expect(clientPage).toHaveURL(new RegExp(`citaSolicitud=${requestId.id}`),{timeout:60000});
   const changes=clientPage.locator('[data-work-changes]');await expect(changes).toContainText('Azulejo adicional '+id,{timeout:90000});
   await changes.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(clientPage);await shot(clientPage,'client-changes-'+language,project);
   await changes.getByRole('button',{name:en?'Accept change':'Aceptar cambio',exact:true}).click();
   const confirm=clientPage.getByRole('alertdialog').or(clientPage.getByRole('dialog',{name:en?'Accept the new total?':'¿Aceptar el nuevo total?'}));await confirm.getByRole('button',{name:en?'Accept change':'Aceptar cambio'}).last().click();
   await expect(changes).toContainText(en?'Accepted by customer':'Aceptado por el cliente',{timeout:60000});
   const account=await page.request.get(origin+'/api/pro/client-balance?'+new URLSearchParams({workId:f.workId}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});
   expect(account.status()).toBe(200);expect((await account.json()).agreedCents).toBe(105000000);
   expect((await f.db.from('pro_work_changes').select('status,client_user_id').eq('id',changeId).single().throwOnError()).data).toEqual({status:'accepted',client_user_id:client.account.id});
   expect(clientErrors()).toEqual([]);
  }finally{await Promise.all([client?.context.close(),stranger?.context.close()].map(p=>p?.catch(()=>undefined)));await cleanupDisposableAccount(client?.account);await cleanupDisposableAccount(stranger?.account);await f.cleanup();}
 });
}

// (f) Race: the professional record of an account that says it is a provider can arrive empty
// once (the dashboard retries). The direct link must survive: no rewrite to «Mis proyectos» /
// client mode, and «Empleos» opens when the record arrives.
test('Round 4B leftovers: ?tab=jobs survives a professional record that arrives empty once',async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);const id=tag('es');
 const f:Owner=await ownerFixture(page.context(),id);
 try{
  const errors=collectPageErrors(page);let emptied=0;
  await page.route('**/rest/v1/professionals?*',async route=>{const url=new URL(route.request().url());if(route.request().method()==='GET'&&emptied===0&&url.searchParams.get('profile_id')===`eq.${f.owner.id}`&&url.searchParams.get('select')==='*'){emptied++;return route.fulfill({status:200,contentType:'application/json',body:'[]'});}return route.continue();});
  const urls:string[]=[];page.on('framenavigated',frame=>{if(frame===page.mainFrame())urls.push(frame.url());});
  await gotoOK(page,'/es/dashboard/profesional?tab=jobs');
  const title=page.getByRole('banner').getByRole('paragraph').filter({hasText:/^Empleos$/}).or(page.getByRole('heading',{name:'Empleos',exact:true})).filter({visible:true});
  await expect(title).toBeVisible({timeout:60000});expect(emptied).toBe(1);
  await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('jobs');expect(new URL(page.url()).searchParams.get('mode')).toBeNull();
  expect(urls.some(url=>/tab=(sent_projects|home)/.test(url))).toBe(false);
  expect(errors().filter(e=>!/professional load|PGRST/i.test(String(e)))).toEqual([]);
 }finally{await f.cleanup();}
});
