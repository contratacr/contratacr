import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {ClientDashboardDetail,ClientDashboardMutation,AppointmentDashboard} from '../../src/lib/pro/client-dashboard';

const origin='http://127.0.0.1:3185',api='/api/pro/client-dashboard';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}

async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'dash-owner'}),db=regressionAdminClient();let client:DisposableAccount|undefined,stranger:DisposableAccount|undefined;
 try{
  client=await createDisposableAccount({prefix:'dash-client'});stranger=await createDisposableAccount({prefix:'dash-stranger'});
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  const professional=(await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Vista cliente local',slug:'dash-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError()).data!;
  const workId=crypto.randomUUID(),requestId=crypto.randomUUID(),day=crTodayISO(),linkedClient='reservation-'+client.id,document=emptyBusiness();
  document.clients=[{id:linkedClient,name:'Cliente vinculado local',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId:linkedClient,client:'Cliente vinculado local',service:'Remodelación de cocina',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false,bookingClientId:client.id}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId,clientId:linkedClient}),{timeout:45000})).status()).toBe(200);
  await db.from('pro_appointment_requests').insert({id:requestId,professional_id:professional.id,owner_id:owner.id,client_user_id:client.id,client_name:'Cliente vinculado local',professional_name:'Vista cliente local',professional_slug:'dash-'+owner.id,service:'Remodelación de cocina',duration_minutes:60,location_kind:'agree',location_text:'',note:'',requested_start:day+'T11:00:00-06:00',status:'confirmed',revision:0,work_id:workId}).throwOnError();
  await db.from('pro_appointment_events').insert({request_id:requestId,actor_id:owner.id,side:'provider',action:'confirm',note:'',status:'confirmed'}).throwOnError();
  // One shared update so the customer view has a section that can be hidden.
  const entryId=crypto.randomUUID(),headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  expect((await context.request.post(origin+'/api/pro/work-updates',{headers,data:{action:'create',workId,entryId,actionId:crypto.randomUUID(),revision:0,title:'Demolición lista',text:'SHARED_UPDATE_VISIBLE'}})).status()).toBe(200);
  expect((await context.request.post(origin+'/api/pro/work-updates',{headers,data:{action:'publish',workId,entryId,actionId:crypto.randomUUID(),revision:1,recipientId:client.id}})).status()).toBe(200);
  return {owner,client,stranger,db,workId,requestId};
 }catch(error){await cleanupDisposableAccount(owner);if(client)await cleanupDisposableAccount(client);if(stranger)await cleanupDisposableAccount(stranger);throw error;}
}

for(const language of ['es','en'] as const)test(`Customer view: owner chooses sections and welcome message; customer sees only that [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(300000);local(baseURL);const en=language==='en',f=await fixture(page.context()),{owner,client,stranger,db,workId,requestId}=f;let customer:BrowserContext|undefined,other:BrowserContext|undefined;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const notices=async()=>{const out:Record<string,unknown>={};for(const table of ['notifications','notification_push_outbox'])out[table]=(await db.from(table).select('*').in('user_id',[owner.id,client.id]).order('id').throwOnError()).data;return out;};const noticesBefore=await notices();
  const ownerHeaders={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const read=async()=>{const r=await page.request.get(api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as ClientDashboardDetail;};
  // Defaults reproduce the previous customer view.
  const initial=await read();expect(initial.settings).toMatchObject({workId,showUpdates:true,showDailyLogs:true,showFiles:true,welcomeText:null,revision:0,updatedAt:null});expect(initial.history).toEqual([]);expect(initial.recipientName).toBe('Cliente vinculado local');
  customer=await browser.newContext({baseURL});await login(customer,client);
  const clientRead=async()=>{const r=await customer!.request.get(origin+api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':client.id}});expect(r.status()).toBe(200);return await r.json() as AppointmentDashboard;};
  expect(await clientRead()).toEqual({showUpdates:true,showDailyLogs:true,showFiles:true,welcomeText:null});
  // Validation, idempotent replay, reused identity and stale revision.
  const base:ClientDashboardMutation={workId,actionId:crypto.randomUUID(),revision:0,showUpdates:false,showDailyLogs:true,showFiles:true,welcomeText:'API_WELCOME'};
  expect((await page.request.post(api,{headers:ownerHeaders,data:{...base,extra:true}})).status()).toBe(400);
  expect((await page.request.post(api,{headers:ownerHeaders,data:{...base,welcomeText:'x'.repeat(1001)}})).status()).toBe(400);
  const first=await page.request.post(api,{headers:ownerHeaders,data:base});expect(first.status()).toBe(200);const firstBody=await first.json();expect(firstBody.settings).toMatchObject({showUpdates:false,welcomeText:'API_WELCOME',revision:1});
  const replay=await page.request.post(api,{headers:ownerHeaders,data:base});expect(replay.status()).toBe(200);expect(await replay.json()).toEqual(firstBody);
  expect((await page.request.post(api,{headers:ownerHeaders,data:{...base,showFiles:false}})).status()).toBe(400);
  expect((await page.request.post(api,{headers:ownerHeaders,data:{...base,actionId:crypto.randomUUID(),showFiles:false}})).status()).toBe(409);
  expect((await page.request.post(api,{headers:ownerHeaders,data:{...base,actionId:crypto.randomUUID(),revision:1}})).status()).toBe(400);
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':owner.id},data:{...base,actionId:crypto.randomUUID(),revision:1,showFiles:false}})).status()).toBe(403);
  expect(await clientRead()).toEqual({showUpdates:false,showDailyLogs:true,showFiles:true,welcomeText:'API_WELCOME'});
  // Customer cannot change it; a stranger cannot read it.
  expect((await customer.request.post(origin+api,{headers:{Origin:origin,'X-Pro-Expected-Actor':client.id},data:{...base,actionId:crypto.randomUUID(),revision:1}})).status()).toBe(403);
  other=await browser.newContext({baseURL});await login(other,stranger);
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':stranger.id}})).status()).toBe(404);
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':stranger.id}})).status()).toBe(403);
  // The shared update itself stays readable: hiding is not a revocation.
  const shared=await customer.request.get(origin+'/api/pro/work-updates?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':client.id}});expect(shared.status()).toBe(200);expect(JSON.stringify(await shared.json())).toContain('SHARED_UPDATE_VISIBLE');

  // Owner UI: change the message, turn updates back on, preview and save.
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${workId}&vistaTrabajo=client`);
  const editor=page.locator('[data-client-dashboard-editor]');await expect(editor).toBeVisible({timeout:60000});
  await expect(editor.getByText(en?'Linked customer: Cliente vinculado local':'Cliente vinculado: Cliente vinculado local')).toBeVisible();
  const updatesSwitch=editor.locator('[data-client-dashboard-section="showUpdates"]'),filesSwitch=editor.locator('[data-client-dashboard-section="showFiles"]');
  await expect(updatesSwitch).not.toBeChecked();await expect(editor.locator('[data-client-dashboard-welcome]')).toHaveValue('API_WELCOME');
  const welcome=en?'Welcome! Here you will see the progress of your kitchen.':'¡Bienvenido! Aquí verá el avance de su cocina.';
  await updatesSwitch.check();await filesSwitch.uncheck();await editor.locator('[data-client-dashboard-welcome]').fill(welcome);
  await editor.getByRole('button',{name:en?'Preview':'Vista previa'}).click();
  // Round 4A: the preview is the linked customer's REAL view (saved settings, same readers), read-only.
  const preview=editor.locator('[data-client-dashboard-preview]');await expect(preview.locator('[data-client-preview-live]')).toHaveJSProperty('disabled',true);
  await expect(preview.locator('[data-client-preview-unsaved]')).toBeVisible();// unsaved edits are not shown yet
  await expect(preview).toContainText('API_WELCOME',{timeout:60000});await expect(preview.locator('[data-client-journal]')).toHaveCount(0);
  await editor.getByRole('button',{name:en?'Save customer view':'Guardar vista del cliente'}).click();
  await expect(editor.getByRole('status').filter({hasText:en?'Customer view saved.':'Vista del cliente guardada.'})).toBeVisible();
  await expect(preview.locator('[data-client-preview-unsaved]')).toHaveCount(0);
  await expect(preview).toContainText(welcome,{timeout:60000});await expect(preview.getByText('SHARED_UPDATE_VISIBLE').first()).toBeVisible({timeout:60000});await expect(preview.locator('[data-appointment-files]')).toHaveCount(0);
  await editor.getByRole('button',{name:en?'Hide preview':'Ocultar vista previa'}).click();
  await expect(editor.locator('ol li')).toHaveCount(2);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({path:info.outputPath(`owner-${language}.png`),fullPage:true});
  const saved=await read();expect(saved.settings).toMatchObject({showUpdates:true,showDailyLogs:true,showFiles:false,welcomeText:welcome,revision:2});expect(saved.history).toHaveLength(2);
  await page.reload();await expect(page.locator('[data-client-dashboard-editor] [data-client-dashboard-welcome]')).toHaveValue(welcome,{timeout:60000});

  // Customer UI shows the message and the shared update.
  const customerPage=await customer.newPage();onAppPageError(customerPage,message=>runtime.push(message));
  await gotoOK(customerPage,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`);
  await expect(customerPage.locator('[data-client-dashboard-welcome-view]')).toContainText(welcome,{timeout:60000});await expect(customerPage.locator('[data-client-dashboard-welcome-view]').getByRole('heading',{name:en?'Message from your professional':'Mensaje de su profesional',exact:true})).toBeVisible();await expect(customerPage.getByRole('region',{name:en?'Message from your professional':'Mensaje de su profesional',exact:true})).toContainText(welcome);
  await expect(customerPage.locator('[data-client-journal]')).toContainText('SHARED_UPDATE_VISIBLE');
  await customerPage.screenshot({path:info.outputPath(`customer-${language}.png`),fullPage:true});
  // Hidden again: section disappears for the customer, message stays.
  const hide=await page.request.post(api,{headers:ownerHeaders,data:{workId,actionId:crypto.randomUUID(),revision:2,showUpdates:false,showDailyLogs:true,showFiles:false,welcomeText:welcome}});expect(hide.status()).toBe(200);
  await customerPage.reload();await expect(customerPage.locator('[data-client-dashboard-welcome-view]')).toContainText(welcome,{timeout:60000});
  // Round 7C: one Daily Log; entries copied from updates follow the «updates» switch.
  await expect(customerPage.locator('[data-client-journal]')).not.toContainText('SHARED_UPDATE_VISIBLE',{timeout:60000});
  await expectNoHorizontalOverflow(customerPage);
  // Nothing else was written: no notifications or outbox rows for either account.
  expect(await notices()).toEqual(noticesBefore);
  // A request that is no longer confirmed keeps the section choices but never receives
  // later owner text: the editor names no linked customer in that case (QA 2026-11-10).
  await db.from('pro_appointment_requests').update({status:'cancelled'}).eq('id',requestId).throwOnError();
  expect((await read()).recipientName).toBeNull();
  expect(await clientRead()).toEqual({showUpdates:false,showDailyLogs:true,showFiles:false,welcomeText:null});
  expect(runtime).toEqual([]);
 }finally{await customer?.close();await other?.close();await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.client);await cleanupDisposableAccount(f.stranger);}
});
