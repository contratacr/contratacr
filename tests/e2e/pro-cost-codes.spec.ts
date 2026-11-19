import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {proMoney} from '../../src/lib/pro/money';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {BudgetForecast,ClientBudgetSummary,CostCodeLibrary} from '../../src/lib/pro/cost-codes';

// Row 54 (Ronda F1-B): company cost-code library, markup/VAT per budget line, integral forecast and the
// client-visible budget summary (groups and sale totals only), shared and revoked explicitly.
const origin=process.env.PRO_LOCAL_ORIGIN??'http://127.0.0.1:3185',forecastApi='/api/pro/work-budget-forecast',libraryApi='/api/pro/cost-codes';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}

async function makePro(db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount,slug:string){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 return (await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Presupuesto local',slug:slug+'-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError()).data!;
}
async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'cc-owner'}),db=regressionAdminClient();let client:DisposableAccount|undefined,rival:DisposableAccount|undefined;
 try{
  client=await createDisposableAccount({prefix:'cc-client'});rival=await createDisposableAccount({prefix:'cc-rival'});
  const professional=await makePro(db,owner,'cc');await makePro(db,rival,'cc-rival');
  const workId=crypto.randomUUID(),requestId=crypto.randomUUID(),day=crTodayISO(),linkedClient='reservation-'+client.id,document=emptyBusiness();
  document.clients=[{id:linkedClient,name:'Cliente presupuesto local',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId:linkedClient,client:'Cliente presupuesto local',service:'Remodelación de cocina',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false,bookingClientId:client.id}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId,clientId:linkedClient}),{timeout:45000})).status()).toBe(200);
  await db.from('pro_appointment_requests').insert({id:requestId,professional_id:professional.id,owner_id:owner.id,client_user_id:client.id,client_name:'Cliente presupuesto local',professional_name:'Presupuesto local',professional_slug:'cc-'+owner.id,service:'Remodelación de cocina',duration_minutes:60,location_kind:'agree',location_text:'',note:'',requested_start:day+'T11:00:00-06:00',status:'confirmed',revision:0,work_id:workId}).throwOnError();
  await db.from('pro_appointment_events').insert({request_id:requestId,actor_id:owner.id,side:'provider',action:'confirm',note:'',status:'confirmed'}).throwOnError();
  return {owner,client,rival,db,workId,requestId,linkedClient};
 }catch(error){await cleanupDisposableAccount(owner);if(client)await cleanupDisposableAccount(client);if(rival)await cleanupDisposableAccount(rival);throw error;}
}
async function shot(page:Page,path:string,full=false){await expectNoHorizontalOverflow(page);await page.screenshot({path,fullPage:full});}

for(const language of ['es','en'] as const)test(`Cost codes: company library, markup/VAT, forecast and client budget summary [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(480000);local(baseURL);const en=language==='en',f=await fixture(page.context()),{owner,client,rival,db,workId,requestId,linkedClient}=f;
 let customer:BrowserContext|undefined,other:BrowserContext|undefined;
 const money=(cents:number)=>proMoney(cents/100,en),mobile=(page.viewportSize()?.width??1366)<1024,out=(name:string)=>info.outputPath(`${name}-${language}${mobile?'-mobile':''}.png`);
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const notices=async()=>{const result:Record<string,unknown>={};for(const table of ['notifications','notification_push_outbox'])result[table]=(await db.from(table).select('*').in('user_id',[owner.id,client.id]).order('id').throwOnError()).data;return result;};const noticesBefore=await notices();
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const get=async<T,>(path:string,query:Record<string,string>,status=200)=>{const r=await page.request.get(path+'?'+new URLSearchParams(query),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status(),path+JSON.stringify(query)).toBe(status);return (status===200?await r.json():null) as T;};
  const forecast=async()=>await get<BudgetForecast>(forecastApi,{workId});
  const budgetOverview=async()=>await get<{revision:number;work:{clientId:string}}>('/api/pro/work-budget',{view:'overview',workId});
  const budgetWrite=async(fields:Record<string,unknown>)=>{const o=await budgetOverview();expect((await page.request.post('/api/pro/work-budget',{headers,data:{actionId:crypto.randomUUID(),workId,clientId:o.work.clientId,revision:o.revision,...fields}})).status()).toBe(200);};

  // ---- API contract and access ----
  expect(await get<CostCodeLibrary>(libraryApi,{view:'library'})).toMatchObject({revision:0,items:[],activeCount:0,capacity:500});
  await get(libraryApi,{view:'nope'},400);
  expect((await page.request.get(libraryApi+'?view=library&view=library',{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(400);
  expect((await page.request.post(libraryApi,{headers:{'X-Pro-Expected-Actor':owner.id},data:{action:'save'}})).status()).toBe(403);
  expect((await page.request.post(libraryApi,{headers,data:{action:'save',actionId:crypto.randomUUID(),revision:0,id:crypto.randomUUID(),kind:'group',code:'a b',title:'X',parentId:null,unit:null,vatCode:null,markupBp:null}})).status()).toBe(400);
  const empty=await forecast();expect(empty).toMatchObject({canWrite:true,budgetRevision:0,revision:0,rows:[],share:null,customerName:'Cliente presupuesto local'});
  other=await browser.newContext({baseURL});await login(other,rival);
  expect((await other.request.get(origin+forecastApi+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(403);
  customer=await browser.newContext({baseURL});await login(customer,client);
  expect((await customer.request.get(origin+forecastApi+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':client.id}})).status()).toBe(403);
  const anonymous=await browser.newContext({baseURL});expect((await anonymous.request.get(origin+forecastApi+'?'+new URLSearchParams({workId}))).status()).toBe(401);await anonymous.close();
  const clientRead=async()=>{const r=await customer!.request.get(origin+forecastApi+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':client.id}});expect(r.status()).toBe(200);return await r.json() as ClientBudgetSummary;};
  expect(await clientRead()).toEqual({visible:false});

  // ---- Company library (Empresa › Categorías) ----
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'categorias'}));
  const card=page.locator('[data-cost-code-card]');await expect(card).toBeVisible({timeout:60000});
  await card.locator('[data-cost-code-open]').click();
  const library=page.getByRole('dialog',{name:en?'Cost code library':'Biblioteca de códigos de costo'});await expect(library.locator('[data-cost-code-empty]')).toBeVisible({timeout:30000});
  await library.locator('[data-cost-code-starter]').click();
  const picker=library.locator('[data-cost-code-starter-picker]');await expect(picker.locator('[data-cost-code-starter-group]')).toHaveCount(10);
  await expect(picker.locator('[data-cost-code-starter-item="06.03"]')).toBeChecked();
  await picker.getByRole('button',{name:en?'Clear':'Quitar selección'}).click();
  for(const code of ['01.02','04.02','06.02','06.03'])await picker.locator(`[data-cost-code-starter-item="${code}"]`).check();
  await picker.locator('[data-cost-code-starter-group="06"]').scrollIntoViewIfNeeded();await shot(page,out('cc-starter'));
  await page.locator('[data-cost-code-starter-add]').click();
  await expect(library.locator('[data-cost-code-notice]')).toHaveText(en?'7 codes added.':'Se agregaron 7 códigos.');
  await expect(library.locator('[data-cost-code-row]')).toHaveCount(7);
  await expect(library.locator('[data-cost-code-row="06.03"]')).toContainText(en?'Painting':'Pintura');
  await expect(library.locator('[data-cost-code-row="06.03"]')).toContainText(en?'Markup 20%':'Markup 20 %');
  // New code in a group, with unit, VAT and markup.
  await library.locator('[data-cost-code-new="item"]').click();
  const form=library.locator('[data-cost-code-form="new"]');
  await form.locator('[data-cost-code-field="code"]').fill('07.09');await form.locator('[data-cost-code-field="title"]').fill(en?'Custom cabinetry':'Muebles a medida');
  await form.locator('[data-cost-code-field="group"]').selectOption({label:en?'06 · Finishes':'06 · Acabados'});
  await form.locator('[data-cost-code-field="unit"]').fill('ml');await form.locator('[data-cost-code-field="vat"]').selectOption('04');await form.locator('[data-cost-code-field="markup"]').fill(en?'18.5':'18,5');
  await shot(page,out('cc-editor'));
  await page.getByRole('button',{name:en?'Save code':'Guardar código',exact:true}).click();
  await expect(library.locator('[data-cost-code-notice]')).toHaveText(en?'Cost code saved.':'Código guardado.');
  await expect(library.locator('[data-cost-code-row="07.09"]')).toContainText(en?'Markup 18.5%':'Markup 18,5 %');
  // A duplicate code is refused with a clear message.
  await library.locator('[data-cost-code-new="item"]').click();
  await form.locator('[data-cost-code-field="code"]').fill('06.03');await form.locator('[data-cost-code-field="title"]').fill('Repetido');
  await page.getByRole('button',{name:en?'Save code':'Guardar código',exact:true}).click();
  await expect(library.locator('[data-cost-code-error]')).toContainText(en?'That code already exists in the library.':'Ese código ya existe en la biblioteca.');
  await page.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();
  // Archive and restore.
  await library.locator('[data-cost-code-row="07.09"]').getByRole('button',{name:en?'Archive':'Archivar',exact:true}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:en?'Archive':'Archivar',exact:true}).click();
  await expect(library.locator('[data-cost-code-notice]')).toHaveText(en?'Code archived.':'Código archivado.');await expect(library.locator('[data-cost-code-row="07.09"]')).toHaveCount(0);
  await library.locator('[data-cost-code-status="archived"]').click();await expect(library.locator('[data-cost-code-row="07.09"]')).toBeVisible();
  await library.locator('[data-cost-code-row="07.09"]').getByRole('button',{name:en?'Restore':'Restaurar',exact:true}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:en?'Restore':'Restaurar',exact:true}).click();
  await expect(library.locator('[data-cost-code-notice]')).toHaveText(en?'Code restored.':'Código restaurado.');
  await library.locator('[data-cost-code-status="active"]').click();await expect(library.locator('[data-cost-code-row]')).toHaveCount(8);
  await shot(page,out('cc-library'));
  await library.getByRole('button',{name:en?'Close':'Cerrar'}).first().click();await expect(card.locator('[data-cost-code-count]')).toHaveText(en?'8 active codes':'8 códigos activos');
  await card.scrollIntoViewIfNeeded();await shot(page,out('cc-company-card'));

  // ---- Existing per-work budget (kept intact) ----
  const g1=crypto.randomUUID(),paint=crypto.randomUUID(),loose=crypto.randomUUID();
  await budgetWrite({action:'save_group',id:g1,code:'G001',title:en?'Existing work':'Obra existente'});
  await budgetWrite({action:'save_item',id:paint,code:'06.03',title:en?'Existing painting':'Pintura existente',parentId:g1,plannedCents:50000000});
  await budgetWrite({action:'save_item',id:loose,code:'X1',title:en?'Loose item':'Partida suelta',parentId:null,plannedCents:10000000});
  const historyBefore=(await db.from('pro_work_budget_actions').select('action_id').eq('owner_id',owner.id).throwOnError()).data!.map(r=>r.action_id).sort();

  // ---- Project budget view: apply library codes ----
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'budget'}));
  const view=page.locator('[data-budget-forecast]');await expect(view).toBeVisible({timeout:60000});
  await expect(view.locator('[data-budget-row]')).toHaveCount(3);
  await view.locator('[data-budget-apply-library]').click();
  const pick=page.getByRole('dialog',{name:en?'Apply library codes':'Aplicar códigos de la biblioteca'});await expect(pick.locator('[data-budget-picker]')).toBeVisible({timeout:30000});
  await pick.locator('[data-budget-pick="01.02"]').check();await pick.locator('[data-budget-pick="06.03"]').check();
  await expect(pick.locator('li').filter({has:page.locator('[data-budget-pick="06.03"]')})).toContainText(en?'it will be linked without changes':'se vinculará sin cambios');
  await shot(page,out('cc-apply'));
  await pick.locator('[data-budget-pick-apply]').click();
  await expect(view.locator('[data-budget-notice]')).toHaveText(en?'2 codes added to the budget, 1 linked to an existing code.':'Se agregaron 2 códigos al presupuesto; 1 se vinculó a un código existente.');
  await expect(view.locator('[data-budget-row]')).toHaveCount(5);
  const afterApply=await forecast();const row=(code:string,data=afterApply)=>data.rows.find(r=>r.code===code)!;
  expect(row('06.03')).toMatchObject({title:en?'Existing painting':'Pintura existente',costCents:50000000,parentId:g1,libraryCode:'06.03',markupBp:2000,vatCode:'08'});
  expect(row('01.02')).toMatchObject({costCents:0,markupBp:1000,vatCode:'08',libraryCode:'01.02'});
  const historyAfter=(await db.from('pro_work_budget_actions').select('action_id').eq('owner_id',owner.id).throwOnError()).data!.map(r=>r.action_id);
  expect(historyBefore.every(id=>historyAfter.includes(id))).toBe(true);expect(historyAfter.length).toBe(historyBefore.length+2);
  const design=row('01.02');await budgetWrite({action:'save_item',id:design.codeId,code:'01.02',title:design.title,parentId:design.parentId,plannedCents:25000000});

  // ---- Markup and VAT per line ----
  await view.getByRole('button',{name:en?'Refresh':'Actualizar',exact:true}).click();
  await expect(view.locator('[data-budget-row="01.02"] [data-budget-sale]')).toHaveText(money(27500000));
  await view.locator('[data-budget-row="X1"] [data-budget-price-edit]').click();
  const priceForm=view.locator('[data-budget-price-form]');
  await priceForm.locator('[data-budget-price-field="markup"]').fill(en?'12.5':'12,5');await priceForm.locator('[data-budget-price-field="vat"]').selectOption('04');
  await expect(priceForm.locator('[data-budget-price-preview]')).toContainText(money(11250000));
  await priceForm.scrollIntoViewIfNeeded();await shot(page,out('cc-price-editor'));
  await priceForm.locator('[data-budget-price-save]').click();
  await expect(view.locator('[data-budget-notice]')).toHaveText(en?'Markup and VAT saved.':'Markup e IVA guardados.');
  await expect(view.locator('[data-budget-row="X1"] [data-budget-line-total]')).toHaveText(money(11700000));
  await expect(view.locator('[data-budget-row="06.03"] [data-budget-line-total]')).toHaveText(money(67800000));
  await expect(view.locator('[data-budget-row="G001"] [data-budget-sale]')).toHaveText(money(60000000));
  await expect(view.locator('[data-budget-kpi="total"]')).toContainText(money(31075000+67800000+11700000));
  await expect(view.locator('[data-budget-kpi="sale"]')).toContainText(money(27500000+60000000+11250000));
  await view.locator('[data-budget-lines]').scrollIntoViewIfNeeded();await shot(page,out('cc-sale'));

  // ---- Forecast: committed, actual, estimate at completion ----
  const day=crTodayISO();
  expect((await page.request.post('/api/pro/purchase-orders',{headers,data:{action:'create',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),supplierId:null,supplierName:'Ferretería Central',supplierContact:null,title:en?'Paint':'Pintura',issueDate:day,expectedDate:null,notes:null,
   lines:[{id:crypto.randomUUID(),description:en?'Paint 5 gal':'Pintura cubeta',quantity:1,unit:'u',unitCents:46000000,taxRate:0,budgetCodeId:paint,selectionOptionId:null,allowanceId:null}]}})).status()).toBe(200);
  const addTime=async(minutes:number,hourly:number,codeId:string)=>{const costs=await get<{revision:number}>('/api/pro/work-costs',{clientId:linkedClient,workId});
   expect((await page.request.post('/api/pro/work-costs',{headers,data:{requestId:crypto.randomUUID(),clientId:linkedClient,workId,revision:costs.revision,action:'add_time',date:day,minutes,hourlyCostCents:hourly,note:en?'Crew time':'Tiempo de cuadrilla'}})).status()).toBe(200);
   const pending=await get<{items:{kind:string;id:string;fingerprint:string}[]}>('/api/pro/work-budget',{view:'costs',workId,codeId:'unassigned'});
   for(const source of pending.items)await budgetWrite({action:'assign',source:{kind:source.kind,id:source.id,fingerprint:source.fingerprint},codeId});};
  await addTime(60,20000000,paint);await addTime(60,15000000,loose);
  const after=await forecast();
  expect(row('06.03',after)).toMatchObject({committedCents:46000000,actualCents:20000000,projectedCents:46000000,remainingCents:4000000,eacCents:50000000,varianceCents:0,consumedBp:4000,status:'watch'});
  expect(row('X1',after)).toMatchObject({actualCents:15000000,eacCents:15000000,varianceCents:-5000000,status:'over'});
  expect(row('G001',after).status).toBe('watch');expect(after.totals).toMatchObject({overCount:1,watchCount:1,eacCents:25000000+50000000+15000000,varianceCents:-5000000});
  await view.getByRole('button',{name:en?'Refresh':'Actualizar',exact:true}).click();
  await view.locator('[data-budget-tab="forecast"]').click();await expect(view.locator('[data-budget-tab="forecast"]')).toHaveAttribute('aria-pressed','true');
  await expect(view.locator('[data-budget-row="06.03"]')).toHaveAttribute('data-budget-status','watch');
  await expect(view.locator('[data-budget-row="X1"] [data-budget-row-status]')).toHaveText(en?'Over budget':'Sobre lo previsto');
  await expect(view.locator('[data-budget-row="X1"] [data-budget-variance]')).toHaveText('−'+money(5000000));
  await expect(view.locator('[data-budget-warning="over"]')).toHaveText(en?'1 line is expected to exceed its planned cost.':'1 partida va a superar su costo previsto.');
  await expect(view.locator('[data-budget-kpi="eac"]')).toContainText(money(90000000));
  await view.locator('header').first().scrollIntoViewIfNeeded();await shot(page,out('cc-forecast-top'));
  await view.locator('[data-budget-lines]').scrollIntoViewIfNeeded();await shot(page,out('cc-forecast'));

  // ---- Client summary: share, stale, update, revoke ----
  const share=view.locator('[data-budget-share]');await expect(share).toHaveAttribute('data-budget-share','none');
  await expect(share).toContainText(en?'Visible to "Cliente presupuesto local".':'Lo verá "Cliente presupuesto local".');
  await share.locator('[data-budget-share-action]').click();
  const confirmShare=page.getByRole('dialog').last();await expect(confirmShare).toContainText(en?'ContrataCR does not send anything':'ContrataCR no envía nada');
  await confirmShare.getByRole('button',{name:en?'Share with the customer':'Compartir con el cliente',exact:true}).click();
  await expect(view.locator('[data-budget-notice]')).toHaveText(en?'Summary shared with the customer.':'Resumen compartido con el cliente.');
  await expect(share).toHaveAttribute('data-budget-share','active');
  await share.scrollIntoViewIfNeeded();await shot(page,out('cc-share'));
  const summary=await clientRead();expect(summary.visible).toBe(true);
  if(summary.visible){
   expect(summary.groups.map(g=>[g.code,g.saleCents])).toEqual([['01',27500000],['G001',60000000]]);
   expect([summary.otherSaleCents,summary.saleCents,summary.taxCents,summary.totalCents]).toEqual([11250000,98750000,11825000,110575000]);
  }
  const raw=JSON.stringify(summary).toLowerCase();for(const word of ['cost','markup','committed','actual','eac','variance','pintura existente','existing painting'])expect(raw).not.toContain(word);
  const customerPage=await customer.newPage();onAppPageError(customerPage,message=>runtime.push(message));
  await gotoOK(customerPage,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`);
  const section=customerPage.locator('[data-client-budget]');await expect(section).toBeVisible({timeout:60000});
  await expect(section).toContainText(en?'Existing work':'Obra existente');await expect(section.locator('[data-client-budget-total]')).toHaveText(money(110575000));
  await expect(section).not.toContainText(en?'Existing painting':'Pintura existente');await expect(section).not.toContainText('Markup');
  await section.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(customerPage);await section.screenshot({path:out('cc-customer')});await customerPage.screenshot({path:out('cc-customer-page'),fullPage:true});
  // A later change does not reach the customer until shared again.
  await view.locator('[data-budget-tab="sale"]').click();
  await view.locator('[data-budget-row="06.03"] [data-budget-price-edit]').click();await priceForm.locator('[data-budget-price-field="markup"]').fill('25');await priceForm.locator('[data-budget-price-save]').click();
  await expect(share).toHaveAttribute('data-budget-share','stale');await expect(share.locator('[data-budget-share-stale]')).toBeVisible();
  const stale=await clientRead();expect(stale.visible&&stale.totalCents).toBe(110575000);
  await share.locator('[data-budget-share-action]').click();await page.getByRole('dialog').last().getByRole('button',{name:en?'Share with the customer':'Compartir con el cliente',exact:true}).click();
  await expect(share).toHaveAttribute('data-budget-share','active');const updated=await clientRead();expect(updated.visible&&updated.saleCents).toBe(98750000+2500000);
  await share.locator('[data-budget-revoke]').click();const confirmRevoke=page.getByRole('dialog').last();await confirmRevoke.getByRole('button',{name:en?'Stop sharing':'Dejar de compartir',exact:true}).click();
  await expect(view.locator('[data-budget-notice]')).toHaveText(en?'The customer no longer sees the summary.':'El cliente ya no ve el resumen.');
  await expect(share).toHaveAttribute('data-budget-share','none');
  await share.locator('details summary').click();await expect(share.locator('[data-budget-share-entry]')).toHaveCount(2);
  expect(await share.locator('[data-budget-share-entry]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-budget-share-entry')))).toEqual(['revoked','replaced']);
  expect(await clientRead()).toEqual({visible:false});
  await customerPage.reload();await expect(customerPage.locator('[data-client-section]').first()).toBeAttached({timeout:60000});await expect(customerPage.locator('[data-client-budget]')).toHaveCount(0);
  // Nothing is sent: no notification or push for owner or customer.
  expect(await notices()).toEqual(noticesBefore);
  expect(runtime).toEqual([]);
 }finally{await other?.close();await customer?.close();await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.client);await cleanupDisposableAccount(f.rival);}
});
