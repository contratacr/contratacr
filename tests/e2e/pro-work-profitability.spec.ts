import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {WorkProfitability} from '../../src/lib/pro/work-profitability';

// Row 23: profitability of a job: agreed vs real cost, commitments, projection at close, minimum-margin alert.
const origin='http://127.0.0.1:3185',api='/api/pro/work-profitability';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
const shiftDay=(iso:string,days:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};

async function makePro(db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount,slug:string){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 return (await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Montos previstos local',slug:slug+'-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError()).data!;
}

async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'allow-owner'}),db=regressionAdminClient();let client:DisposableAccount|undefined,rival:DisposableAccount|undefined;
 try{
  client=await createDisposableAccount({prefix:'allow-client'});rival=await createDisposableAccount({prefix:'allow-rival'});
  const professional=await makePro(db,owner,'allow');await makePro(db,rival,'allow-rival');
  const workId=crypto.randomUUID(),uiWorkId=crypto.randomUUID(),requestId=crypto.randomUUID(),day=crTodayISO(),linkedClient='reservation-'+client.id,document=emptyBusiness();
  document.clients=[{id:linkedClient,name:'Cliente montos local',email:'',phone:'',notes:'',archived:false}];
  document.work=[
   {id:workId,clientId:linkedClient,client:'Cliente montos local',service:'Remodelación de cocina',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false,bookingClientId:client.id},
   {id:uiWorkId,clientId:linkedClient,client:'Cliente montos local',service:'Baño principal',stage:'scheduled',start:day+'T14:00:00-06:00',end:day+'T15:00:00-06:00',cancelled:false},
  ];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  for(const id of [workId,uiWorkId])expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId:id,clientId:linkedClient}),{timeout:45000})).status()).toBe(200);
  await db.from('pro_appointment_requests').insert({id:requestId,professional_id:professional.id,owner_id:owner.id,client_user_id:client.id,client_name:'Cliente montos local',professional_name:'Montos previstos local',professional_slug:'allow-'+owner.id,service:'Remodelación de cocina',duration_minutes:60,location_kind:'agree',location_text:'',note:'',requested_start:day+'T11:00:00-06:00',status:'confirmed',revision:0,work_id:workId}).throwOnError();
  await db.from('pro_appointment_events').insert({request_id:requestId,actor_id:owner.id,side:'provider',action:'confirm',note:'',status:'confirmed'}).throwOnError();
  // An agreed amount on the UI project so the optional extra can be proposed.
  const revision=(await db.from('pro_workspace_core').select('revision').eq('user_id',owner.id).single().throwOnError()).data!.revision;
  expect((await context.request.post(origin+'/api/pro/client-operations',{headers:{Origin:origin},data:{kind:'agreement',clientId:linkedClient,workId:uiWorkId,actionId:crypto.randomUUID(),revision,amountCents:100000000}})).status()).toBe(200);
  return {owner,client,rival,db,workId,uiWorkId,requestId,linkedClient};
 }catch(error){await cleanupDisposableAccount(owner);if(client)await cleanupDisposableAccount(client);if(rival)await cleanupDisposableAccount(rival);throw error;}
}

for(const language of ['es','en'] as const)test(`Work profitability: projection, alerts, minimum margin and access [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(240000);local(baseURL);const en=language==='en',f=await fixture(page.context()),{owner,client,rival,db,workId,uiWorkId}=f;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const h={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const read=async(id:string,status=200)=>{const r=await page.request.get(api+'?'+new URLSearchParams({workId:id}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(status);return status===200?await r.json() as WorkProfitability:null;};
  const target=async(data:Record<string,unknown>,status=200)=>{const r=await page.request.post(api,{headers:h,data});expect(r.status(),JSON.stringify(data)).toBe(status);return status===200?await r.json():null;};
  // Access and validation.
  expect((await page.request.get(api+'?'+new URLSearchParams({workId:uiWorkId}),{headers:{'X-Pro-Expected-Actor':client.id}})).status()).toBe(403);
  expect((await page.request.get(api)).status()).toBe(400);
  expect((await page.request.get(api+'?workId='+uiWorkId+'&x=1')).status()).toBe(400);
  await read(crypto.randomUUID(),404);
  // A job without an agreed amount cannot show a margin.
  const none=await read(workId);expect(none).toMatchObject({agreedCents:null,projectedMarginCents:null,currentMarginCents:null});expect(none!.alerts.map(a=>a.code)).toContain('no_agreed');
  // Agreed ₡1.000.000 (UI job), one allowance still to choose (₡5.000) and one proposed change.
  const alw=await page.request.post('/api/pro/allowances',{headers:h,data:{action:'create',actionId:crypto.randomUUID(),workId:uiWorkId,id:crypto.randomUUID(),name:'Grifería',category:null,plannedCents:500000,dueDate:null,notes:null}});expect(alw.status()).toBe(200);
  const base=await read(uiWorkId);
  expect(base).toMatchObject({workId:uiWorkId,currency:'CRC',agreedCents:100000000,actualCostCents:0,committedCents:0,pendingAllowancesCents:500000,projectedCostCents:500000,projectedMarginCents:99500000,projectedMarginBp:9950,minMarginBp:1000,settingsRevision:0,approvedChangesCount:0});
  expect(base!.alerts.map(a=>a.code)).not.toContain('low_margin');
  await db.from('pro_work_changes').insert({owner_id:owner.id,id:crypto.randomUUID(),work_id:uiWorkId,reason:'Extra',lines:[{description:'Extra'}],base_cents:100000000,base_position:0,delta_cents:2000000,total_cents:102000000,status:'proposed'}).throwOnError();
  expect(await read(uiWorkId)).toMatchObject({proposedChangesCount:1,proposedChangesCents:2000000,approvedChangesCount:0,agreedCents:100000000});
  // Minimum margin: validation, idempotent replay, CAS, identity reuse.
  const set=(extra:Record<string,unknown>={})=>({action:'set_target',actionId:crypto.randomUUID(),workId:uiWorkId,revision:0,minMarginBp:9990,...extra});
  await target({...set(),extra:true},400);await target(set({minMarginBp:10001}),400);await target(set({minMarginBp:-1}),400);
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':owner.id},data:set()})).status()).toBe(403);
  const first=set(),saved=await target(first);expect(saved).toMatchObject({workId:uiWorkId,minMarginBp:9990,settingsRevision:1});
  expect(await target(first)).toEqual(saved);await target({...first,minMarginBp:5000},400);await target(set(),409);
  const after=await read(uiWorkId);expect(after).toMatchObject({minMarginBp:9990,settingsRevision:1});expect(after!.alerts.map(a=>a.code)).toContain('low_margin');
  expect((await db.from('pro_work_profit_settings').select('revision').eq('owner_id',owner.id).eq('work_id',uiWorkId).single().throwOnError()).data!.revision).toBe(1);
  // Another account sees nothing of this job.
  const rivalCtx=await page.context().browser()!.newContext();try{await login(rivalCtx,rival);const r=await rivalCtx.request.get(origin+api+'?'+new URLSearchParams({workId:uiWorkId}),{headers:{'X-Pro-Expected-Actor':rival.id}});expect([403,404]).toContain(r.status());}finally{await rivalCtx.close();}

  // ---- UI ----
  await page.setViewportSize(info.project.name.includes('mobile')?{width:390,height:844}:{width:1366,height:900});
  await page.context().addCookies([{name:'NEXT_LOCALE',value:language,url:origin}]);
  await gotoOK(page,origin+'/dashboard/profesional?'+new URLSearchParams({tab:'pro_agenda',cita:uiWorkId,vistaTrabajo:'budget'}));
  const box=page.locator('[data-work-profitability]');await expect(box).toBeVisible({timeout:60000});
  await expect(box.locator('[data-profit-figure="margin-projected"]')).toContainText('99');
  await expect(box.locator('[data-profit-alert="low_margin"]')).toBeVisible();
  await expect(box.locator('[data-profit-pending-changes]')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await box.locator('[data-profit-target]').fill('abc');await box.locator('[data-profit-save]').click();await expect(box.locator('[data-profit-form-error]')).toBeVisible();
  await box.locator('[data-profit-target]').fill(en?'50':'50');await box.locator('[data-profit-save]').click();
  await expect(box.locator('[data-profit-notice]')).toBeVisible({timeout:30000});await expect(box.locator('[data-profit-alert="low_margin"]')).toHaveCount(0);
  expect((await db.from('pro_work_profit_settings').select('min_margin_bp,revision').eq('owner_id',owner.id).eq('work_id',uiWorkId).single().throwOnError()).data).toMatchObject({min_margin_bp:5000,revision:2});
  await expectNoHorizontalOverflow(page);expect(runtime).toEqual([]);
 }finally{await cleanupDisposableAccount(owner);await cleanupDisposableAccount(client);await cleanupDisposableAccount(rival);}
});
