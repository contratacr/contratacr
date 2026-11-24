import {test,expect,type BrowserContext,type Browser,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
const origin='http://127.0.0.1:3185',leadApi='/api/pro/lead-center',logApi='/api/pro/lead-log';

function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
async function makePro(prefix:string){const db=regressionAdminClient(),owner=await createDisposableAccount({prefix});try{const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();return owner;}catch(error){await cleanupDisposableAccount(owner);throw error;}}
async function warm(context:BrowserContext){for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);}
async function fixture(context:BrowserContext){
 await stabilizeLocalProRuntime(context,origin);
 const db=regressionAdminClient(),owner=await makePro('inbox-owner');let client:DisposableAccount|undefined;
 try{
  client=await createDisposableAccount({prefix:'inbox-client'});
  const professional=(await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Bandejas local',slug:'inbox-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError()).data!;
  const workId=crypto.randomUUID(),requestId=crypto.randomUUID(),day=crTodayISO(),linked='reservation-'+client.id,document=emptyBusiness();
  document.clients=[{id:'cli-ana',name:'Ana Local',email:'ana@example.test',phone:'8888-1111',notes:'',archived:false},{id:'cli-beto',name:'Beto Local',email:'beto@example.test',phone:'',address:'Avenida 2, San Jose',notes:'',archived:false},{id:linked,name:'Cliente vinculado',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId:linked,client:'Cliente vinculado',service:'Electricidad',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false,bookingClientId:client.id}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);await warm(context);
  expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId,clientId:linked}),{timeout:45000})).status()).toBe(200);
  await db.from('pro_appointment_requests').insert({id:requestId,professional_id:professional.id,owner_id:owner.id,client_user_id:client.id,client_name:'Cliente vinculado',professional_name:'Bandejas local',professional_slug:'inbox-'+owner.id,service:'Electricidad',duration_minutes:60,location_kind:'agree',location_text:'',note:'',requested_start:day+'T11:00:00-06:00',status:'confirmed',revision:0,work_id:workId}).throwOnError();
  await db.from('pro_appointment_events').insert({request_id:requestId,actor_id:owner.id,side:'provider',action:'confirm',note:'',status:'confirmed'}).throwOnError();
  const manual=async(clientId:string,title:string,projectType:string)=>{const input={action:'create',actionId:crypto.randomUUID(),kind:'manual',id:crypto.randomUUID(),revision:0,catalogRevision:0,clientId,title,description:'',address:'',sourceLabel:'',forecast:{projectType,expectedStart:null,currency:'CRC',revenueCents:null,budgetCents:null,profitCents:null},stageMode:'automatic',stageId:null},response=await context.request.post(origin+leadApi,{headers:{Origin:origin,'X-Pro-Expected-Actor':owner.id},data:input});expect(response.status()).toBe(200);return input.id;};
  const paint=await manual('cli-ana','Pintura de casa','Pintura'),roof=await manual('cli-beto','Techos','');
  return {owner,client,professional,db,workId,requestId,paint,roof,day};
 }catch(error){await cleanupDisposableAccount(owner);if(client)await cleanupDisposableAccount(client);throw error;}
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function cleanup(f:Fixture){await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.client);}
const post=(c:BrowserContext,actor:string,data:unknown)=>c.request.post(origin+logApi,{headers:{Origin:origin,'X-Pro-Expected-Actor':actor},data});
const get=(c:BrowserContext,actor:string,q:Record<string,string>)=>c.request.get(origin+logApi+'?'+new URLSearchParams(q),{headers:{'X-Pro-Expected-Actor':actor}});
async function openLeads(page:Page,language:'es'|'en'){await gotoOK(page,`/${language}/dashboard/pro?tab=pro_leads`);await expect(page.locator('[data-lead-inbox-layout]')).toBeVisible({timeout:45000});}

// Leads area: notes, call log and tags of a lead (manual opportunity and ContrataCR request), idempotency, CAS, isolation.
test('lead log API: notes, call log, tags, idempotency, revision conflicts, validation and isolation',async({page,baseURL,browser}:{page:Page;baseURL:string|undefined;browser:Browser})=>{
 test.setTimeout(240000);local(baseURL);const f=await fixture(page.context()),c=page.context(),other=await browser.newContext();
 try{
  const lead=f.paint,base={kind:'manual',leadId:lead};
  const empty=await get(c,f.owner.id,{kind:'manual',leadId:lead});expect(empty.status()).toBe(200);expect(await empty.json()).toMatchObject({kind:'manual',leadId:lead,items:[],tags:[]});
  const noteId=crypto.randomUUID(),add={action:'add',actionId:crypto.randomUUID(),id:noteId,...base,entry:'note',outcome:null,body:'Pidió visita el lunes'};
  const one=await post(c,f.owner.id,add);expect(one.status()).toBe(200);expect((await one.json()).items).toMatchObject([{id:noteId,entry:'note',body:'Pidió visita el lunes',revision:1}]);
  const again=await post(c,f.owner.id,add);expect(again.status()).toBe(200);expect((await again.json()).items).toHaveLength(1);
  expect((await post(c,f.owner.id,{...add,body:'otro texto'})).status()).toBe(400);
  const call={action:'add',actionId:crypto.randomUUID(),id:crypto.randomUUID(),...base,entry:'call',outcome:'no_answer',body:''};
  const two=await post(c,f.owner.id,call);expect(two.status()).toBe(200);const items=(await two.json()).items;expect(items).toHaveLength(2);expect(items[0]).toMatchObject({entry:'call',outcome:'no_answer'});
  expect((await post(c,f.owner.id,{...call,actionId:crypto.randomUUID(),id:crypto.randomUUID(),outcome:'otra'})).status()).toBe(400);
  expect((await post(c,f.owner.id,{...add,actionId:crypto.randomUUID(),id:crypto.randomUUID(),body:'   '})).status()).toBe(400);
  const edit={action:'edit',actionId:crypto.randomUUID(),id:noteId,...base,revision:1,body:'Visita confirmada'};
  const edited=await post(c,f.owner.id,edit);expect(edited.status()).toBe(200);expect((await edited.json()).items.find((i:{id:string})=>i.id===noteId)).toMatchObject({body:'Visita confirmada',revision:2});
  expect((await post(c,f.owner.id,edit)).status()).toBe(200);
  expect((await post(c,f.owner.id,{...edit,actionId:crypto.randomUUID(),body:'Tarde'})).status()).toBe(409);
  const tagged=await post(c,f.owner.id,{action:'tag_add',...base,tag:'  Urgente  '});expect(tagged.status()).toBe(200);expect((await tagged.json()).tags).toEqual(['Urgente']);
  expect((await (await post(c,f.owner.id,{action:'tag_add',...base,tag:'urgente'})).json()).tags).toEqual(['Urgente']);
  expect((await post(c,f.owner.id,{action:'tag_add',...base,tag:''})).status()).toBe(400);
  expect((await (await post(c,f.owner.id,{action:'tag_remove',...base,tag:'URGENTE'})).json()).tags).toEqual([]);
  const removed=await post(c,f.owner.id,{action:'remove',actionId:crypto.randomUUID(),id:noteId,...base,revision:2});expect(removed.status()).toBe(200);expect((await removed.json()).items).toHaveLength(1);
  expect((await post(c,f.owner.id,{action:'remove',actionId:crypto.randomUUID(),id:noteId,...base,revision:3})).status()).toBe(409);
  // A ContrataCR request is a lead too.
  const reqNote={action:'add',actionId:crypto.randomUUID(),id:crypto.randomUUID(),kind:'request',leadId:f.requestId,entry:'note',outcome:null,body:'Nota de solicitud'};
  expect((await post(c,f.owner.id,reqNote)).status()).toBe(200);expect((await (await get(c,f.owner.id,{kind:'request',leadId:f.requestId})).json()).items).toHaveLength(1);
  // Wrong kind for the id, unknown lead, auth and extra fields.
  expect((await get(c,f.owner.id,{kind:'request',leadId:lead})).status()).toBe(404);
  expect((await post(c,f.owner.id,{...reqNote,actionId:crypto.randomUUID(),id:crypto.randomUUID(),leadId:crypto.randomUUID()})).status()).toBe(404);
  expect((await post(c,f.owner.id,{...reqNote,actionId:crypto.randomUUID(),id:crypto.randomUUID(),extra:1})).status()).toBe(400);
  expect((await c.request.get(origin+logApi+'?kind=manual&leadId='+lead,{headers:{'X-Pro-Expected-Actor':crypto.randomUUID()}})).status()).toBe(403);
  expect((await other.request.get(origin+logApi+'?kind=manual&leadId='+lead)).status()).toBe(401);
  const stranger=await createDisposableAccount({prefix:'log-stranger'});
  try{await login(other,stranger);expect((await other.request.get(origin+logApi+'?kind=manual&leadId='+lead,{headers:{'X-Pro-Expected-Actor':stranger.id}})).status()).not.toBe(200);}finally{await cleanupDisposableAccount(stranger);}
 }finally{await other.close();await page.goto('about:blank').catch(()=>{});await cleanup(f);}
});

for(const language of ['es','en'] as const){
 test(`${language}: lead detail notes, call log and tags, and the table view with customizable columns`,async({page,baseURL}:{page:Page;baseURL:string|undefined})=>{
  test.setTimeout(240000);local(baseURL);const en=language==='en',f=await fixture(page.context()),errors:string[]=[];onAppPageError(page,message=>errors.push(message));
  try{
   await openLeads(page,language);
   // Table view and column chooser.
   await page.locator('[data-lead-view="table"]').click();
   const table=page.locator('[data-lead-table-view]');await expect(table).toBeVisible();
   await expect(table.locator('[data-lead-table-row]')).toHaveCount(3);
   await expect(table.getByRole('columnheader',{name:en?'Lead name':'Nombre de la solicitud'})).toBeVisible();
   await expect(table.locator('[data-lead-col="projectType"]').first()).toBeVisible();
   await page.locator('[data-lead-customize]').click();
   await page.locator('[data-lead-col-toggle="projectType"]').uncheck();
   await page.locator('[data-lead-columns-save]').click();
   await expect(table.locator('[data-lead-col="projectType"]')).toHaveCount(0);
   await page.reload();await expect(page.locator('[data-lead-inbox-layout]')).toBeVisible({timeout:45000});
   await expect(table.locator('[data-lead-col="projectType"]')).toHaveCount(0);
   await page.locator('[data-lead-sort="client"]').click();
   await expect(table.getByRole('columnheader',{name:en?/Client name/:/Cliente/})).toHaveAttribute('aria-sort','ascending');
   await expectNoHorizontalOverflow(page);
   await page.locator('[data-lead-customize]').click();
   await page.getByRole('button',{name:en?'Reset to defaults':'Restablecer valores'}).click();
   await page.locator('[data-lead-columns-save]').click();
   await expect(table.locator('[data-lead-col="projectType"]').first()).toBeVisible();
   // Notes, calls and tags inside the lead.
   await page.locator('[data-lead-view="cards"]').click();
   await page.locator(`[data-pro-lead="${f.paint}"]`).getByRole('button',{name:en?'Open lead':'Abrir solicitud'}).first().click();
   const log=page.locator('[data-lead-log]');await expect(log).toBeVisible({timeout:45000});
   await log.locator('[data-lead-note-input]').fill('Llamar al cliente');
   await log.getByRole('button',{name:en?'Add note':'Agregar nota'}).click();
   await expect(log.locator('[data-lead-log-entry="note"]')).toHaveCount(1);
   await log.locator('[data-lead-call-outcome]').selectOption('call_later');
   await log.getByRole('button',{name:en?'Add call entry':'Agregar registro de llamada'}).click();
   await expect(log.locator('[data-lead-log-entry="call"]')).toHaveCount(1);
   await log.locator('[data-lead-tag-input]').fill('Prioridad');
   await log.locator('[data-lead-tags]').getByRole('button',{name:en?'Add':'Agregar',exact:true}).click();
   await expect(log.locator('[data-lead-tags] li')).toHaveCount(1);
   await log.getByRole('button',{name:en?'Notes':'Notas',exact:true}).click();
   await expect(log.locator('[data-lead-log-entry]')).toHaveCount(1);
   await page.reload();await expect(log).toBeVisible({timeout:45000});
   await expect(log.locator('[data-lead-tags] li')).toHaveCount(1);
   // Bulk select and bulk archive in the table view.
   await page.locator('[data-lead-view="table"]').click();
   const bulk=page.locator('[data-lead-table-view]');await expect(bulk.locator('[data-lead-bulk-bar]')).toHaveCount(0);
   const before=await bulk.locator('[data-lead-table-row]').count();
   // Task and Managers columns, pinned columns and bulk assignment.
   await expect(bulk.locator('[data-lead-col="task"]').first()).toBeVisible();await expect(bulk.locator('[data-lead-col="managers"]').first()).toBeVisible();
   await expect(bulk.locator(`[data-lead-table-row="${f.roof}"] [data-lead-task-add]`)).toBeVisible({timeout:45000});
   if((page.viewportSize()?.width??1280)>=640){
    const pin=bulk.locator('[data-lead-pin="client"]');await pin.click();await expect(pin).toHaveAttribute('aria-pressed','true');
    await page.reload();await expect(page.locator('[data-lead-inbox-layout]')).toBeVisible({timeout:45000});
    await expect(page.locator('[data-lead-table-view] [data-lead-pin="client"]')).toHaveAttribute('aria-pressed','true');
    await page.locator('[data-lead-table-view] [data-lead-pin="client"]').click();await expect(page.locator('[data-lead-table-view] [data-lead-pin="client"]')).toHaveAttribute('aria-pressed','false');
   }
   await bulk.locator(`[data-lead-select="${f.paint}"]`).check();await bulk.locator(`[data-lead-select="${f.roof}"]`).check();
   await bulk.locator('[data-lead-bulk-assignee]').selectOption(f.owner.id);await bulk.locator('[data-lead-bulk-assign]').click();
   await expect(bulk.locator(`[data-lead-table-row="${f.paint}"] [data-lead-col="managers"]`)).not.toHaveText('—',{timeout:45000});
   await expect(bulk.locator('[data-lead-bulk-bar]')).toHaveCount(0);
   await bulk.locator(`[data-lead-select="${f.roof}"]`).check();
   await expect(bulk.locator('[data-lead-bulk-count]')).toContainText('1');
   await bulk.locator('[data-lead-bulk-archive]').click();
   await page.getByRole('button',{name:en?/Archive 1 leads/:/Archivar 1 solicitudes/}).click();
   await expect(bulk.locator('[data-lead-table-row]')).toHaveCount(before-1,{timeout:45000});
   await expect(bulk.locator(`[data-lead-table-row="${f.roof}"]`)).toHaveCount(0);
   await expectNoHorizontalOverflow(page);
   expect(errors).toEqual([]);
  }finally{await page.goto('about:blank').catch(()=>{});await cleanup(f);}
 });
}

for(const language of ['es','en'] as const){
 test(`${language}: new lead copies the customer address by default and lets you change it`,async({page,baseURL}:{page:Page;baseURL:string|undefined})=>{
  test.setTimeout(240000);local(baseURL);const en=language==='en',f=await fixture(page.context()),errors:string[]=[];onAppPageError(page,message=>errors.push(message));
  try{
   await openLeads(page,language);
   const add=page.getByRole('button',{name:en?'+ Add lead':'+ Agregar solicitud',exact:true});await expect(add).toBeEnabled({timeout:45000});await add.click();
   const dialog=page.getByRole('dialog',{name:en?'Add lead':'Agregar solicitud',exact:true}),form=dialog.locator('[data-manual-lead-form]'),customer=form.getByLabel(en?'Customer':'Cliente',{exact:true});
   await expect(customer.locator('option[value="cli-beto"]')).toHaveCount(1,{timeout:45000});
   await customer.selectOption('cli-ana');
   await form.locator('summary').filter({hasText:en?'More details':'Más datos'}).click();
   const address=form.getByLabel(en?'Address (optional)':'Dirección (opcional)',{exact:true}),same=form.locator('[data-lead-same-address]');
   await expect(same).toHaveCount(0);await expect(address).toHaveValue('');
   await customer.selectOption('cli-beto');
   await expect(same).toBeChecked();await expect(address).toHaveValue('Avenida 2, San Jose');await expect(address).toBeDisabled();
   await same.uncheck();await expect(address).toBeEnabled();await address.fill('Otra calle 5');
   await same.check();await expect(address).toHaveValue('Avenida 2, San Jose');
   await expectNoHorizontalOverflow(page);
   expect(errors).toEqual([]);
  }finally{await page.goto('about:blank').catch(()=>{});await cleanup(f);}
 });
}
