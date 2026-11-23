import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {proMoney} from '../../src/lib/pro/money';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {BudgetForecast,BudgetSync} from '../../src/lib/pro/cost-codes';

// Row 54 (budget synchronisation): an approved change order is applied once to the project budget from the budget view.
// The accepted-quote path is covered by scripts/pro/verify-pro-budget-sync-db.mjs (it needs a published, accepted estimate).
const origin=process.env.PRO_LOCAL_ORIGIN??'http://127.0.0.1:3185',forecastApi='/api/pro/work-budget-forecast',syncApi='/api/pro/work-budget-sync';
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

for(const language of ['es','en'] as const)test(`Budget sync: approved change order creates budget codes once [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(300000);local(baseURL);const en=language==='en',f=await fixture(page.context()),{owner,client,rival,db,workId}=f;
 const mobile=(page.viewportSize()?.width??1366)<1024,out=(name:string)=>info.outputPath(`${name}-${language}${mobile?'-mobile':''}.png`);
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const sync=async()=>{const r=await page.request.get(syncApi+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as BudgetSync;};
  expect(await sync()).toMatchObject({sources:[],budgetRevision:0,canWrite:true});
  await db.from('pro_work_changes').insert({owner_id:owner.id,id:crypto.randomUUID(),work_id:workId,reason:'Ampliación de terraza',lines:[{description:'Techo adicional',amountCents:250000},{description:'Descuento por acabado',amountCents:-50000}],
   base_cents:1000000,base_position:0,delta_cents:200000,total_cents:1200000,status:'accepted'}).throwOnError();
  const before=await sync();expect(before.sources).toHaveLength(1);
  expect(before.sources[0]).toMatchObject({kind:'change',applied:false,itemCount:1,plannedCents:200000,unallocatedCents:0});
  // Access and strict input.
  expect((await page.request.get(syncApi+'?workId='+workId+'&workId=x',{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(400);
  expect((await page.request.post(syncApi,{headers:{'X-Pro-Expected-Actor':owner.id},data:{action:'apply'}})).status()).toBe(403);
  expect((await page.request.post(syncApi,{headers,data:{action:'apply',extra:1}})).status()).toBe(400);
  expect((await page.request.post(syncApi,{headers:{...headers,'X-Pro-Expected-Actor':rival.id},data:{action:'apply',actionId:crypto.randomUUID(),workId,revision:0,sourceKind:'change',sourceId:before.sources[0].id}})).status()).toBe(403);
  // UI: apply from the budget view.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'budget'}));
  const view=page.locator('[data-budget-forecast]');await expect(view).toBeVisible({timeout:60000});
  const card=view.locator('[data-budget-sync]');await expect(card.locator('[data-budget-sync-source="change"]')).toHaveAttribute('data-budget-sync-state','pending',{timeout:30000});
  await shot(page,out('sync-pending'));
  await card.locator('[data-budget-sync-apply]').click();
  await page.getByRole('dialog').last().getByRole('button',{name:en?'Apply to budget':'Aplicar al presupuesto',exact:true}).click();
  await expect(view.locator('[data-budget-notice]')).toHaveText(en?'2 codes added to the budget.':'Se agregaron 2 códigos al presupuesto.');
  await expect(card.locator('[data-budget-sync-source="change"]')).toHaveAttribute('data-budget-sync-state','applied');
  await expect(card.locator('[data-budget-sync-apply]')).toHaveCount(0);
  await expect(view.locator('[data-budget-row]')).toHaveCount(2);
  await shot(page,out('sync-applied'),true);
  // Applied once: the budget shows the planned amount net of the reduction and the same source is refused.
  const forecast=await (await page.request.get(forecastApi+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json() as BudgetForecast;
  expect(forecast.totals.costCents).toBe(200000);
  const applied=await sync();expect(applied.sources[0].applied).toBe(true);
  expect((await page.request.post(syncApi,{headers,data:{action:'apply',actionId:crypto.randomUUID(),workId,revision:applied.budgetRevision,sourceKind:'change',sourceId:applied.sources[0].id}})).status()).toBe(409);
  expect(runtime).toEqual([]);
  void client;
 }finally{await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.client);await cleanupDisposableAccount(f.rival);}
});
