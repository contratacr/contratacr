import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {AllowanceItem,SurchargeDetail} from '../../src/lib/pro/allowances';

// Row 75: send the positive difference of a defined allowance to a draft estimate of the same job as a surcharge line.
const origin='http://127.0.0.1:3185',api='/api/pro/allowances',sapi='/api/pro/allowance-surcharge';
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

async function draftEstimate(db:ReturnType<typeof regressionAdminClient>,ownerId:string,workId:string,clientId:string,currency='CRC'){
 const id=crypto.randomUUID(),line={catalogProductId:null,description:'Cocina base',discountBps:0,id:crypto.randomUUID(),qtyMilli:1000,taxBps:1300,unit:'u',unitPriceCents:100000};
 await db.from('pro_private_estimates').insert({owner_id:ownerId,id,client_id:clientId,client_snapshot:{id:clientId,name:'Cliente montos local'},source:{kind:'work',id:workId,fingerprint:'x'},issuer:{issuerName:'Emisor'},title:'Cotizacion base '+currency,notes:'',currency,subtotal_cents:100000,discount_cents:0,tax_cents:13000,total_cents:113000,revision:1}).throwOnError();
 await db.from('pro_private_estimate_items').insert({owner_id:ownerId,estimate_id:id,id:line.id,position:1,content:line}).throwOnError();
 return id;
}

for(const language of ['es','en'] as const)test(`Allowance surcharge: send the difference to a draft quote, idempotent, CAS and recovery [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(240000);local(baseURL);const en=language==='en',f=await fixture(page.context()),{owner,client,rival,db,workId,linkedClient}=f;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const h={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const post=async(data:Record<string,unknown>,status=200)=>{const r=await page.request.post(api,{headers:h,data});expect(r.status(),JSON.stringify(data)).toBe(status);return status===200?(await r.json()).item as AllowanceItem:null;};
  const send=async(data:Record<string,unknown>,status=200)=>{const r=await page.request.post(sapi,{headers:h,data});expect(r.status(),JSON.stringify(data)).toBe(status);return status===200?await r.json():null;};
  const read=async()=>{const r=await page.request.get(sapi+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as SurchargeDetail;};
  const make=async(name:string,planned:number,actual:number|null)=>{
   const id=crypto.randomUUID();let item=await post({action:'create',actionId:crypto.randomUUID(),workId,id,name,category:null,plannedCents:planned,dueDate:null,notes:null})!;
   if(actual!==null)item=await post({action:'decide',actionId:crypto.randomUUID(),workId,id,revision:item!.revision,choiceDescription:'Elegido '+name,supplier:null,quantity:1,actualCents:actual})!;
   return item!;
  };
  // Access and validation.
  expect((await page.request.get(sapi+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':client.id}})).status()).toBe(403);
  expect((await page.request.get(sapi)).status()).toBe(400);
  const over=await make('Grifería',15000000,17000000),under=await make('Cerámica',4000000,3000000),open=await make('Lámpara',500000,null);
  expect(await read()).toMatchObject({workId,estimates:[],links:[]});
  const base=await draftEstimate(db,owner.id,workId,linkedClient);
  await draftEstimate(db,owner.id,workId,linkedClient,'USD');
  const detail=await read();expect(detail.estimates).toHaveLength(1);expect(detail.estimates[0]).toMatchObject({id:base,revision:1,totalCents:113000,lineCount:1});
  const body=(extra:Record<string,unknown>={})=>({action:'send_to_estimate',actionId:crypto.randomUUID(),workId,id:over.id,revision:over.revision,estimateId:base,estimateRevision:1,lineId:crypto.randomUUID(),taxBps:1300,...extra});
  // Rejections: extra key, bad tax, no difference, open allowance, stale revisions, other account.
  await send({...body(),extra:true},400);await send(body({taxBps:10001}),400);await send(body({taxBps:-1}),400);
  await send(body({id:under.id,revision:under.revision}),400);await send(body({id:open.id,revision:open.revision}),400);
  await send(body({revision:over.revision+5}),409);await send(body({estimateRevision:9}),409);
  expect((await page.request.post(sapi,{headers:{Origin:origin},data:body()})).status()).toBe(403);
  const rivalCtx=await page.context().browser()!.newContext();try{await login(rivalCtx,rival);const r=await rivalCtx.request.post(origin+sapi,{headers:{Origin:origin,'X-Pro-Expected-Actor':rival.id},data:body()});expect([403,404]).toContain(r.status());}finally{await rivalCtx.close();}
  // Send once: same receipt on replay, other payload with the same actionId rejected.
  const first=body(),result=await send(first);
  expect(result).toMatchObject({allowanceId:over.id,estimateId:base,estimateRevision:2,amountCents:2000000,taxBps:1300,estimateTotalCents:113000+2260000});
  expect(await send(first)).toEqual(result);await send({...first,taxBps:0},400);
  const est=(await db.from('pro_private_estimates').select('revision,subtotal_cents,tax_cents,total_cents').eq('owner_id',owner.id).eq('id',base).single().throwOnError()).data!;
  expect(est).toMatchObject({revision:2,subtotal_cents:2100000,tax_cents:273000,total_cents:2373000});
  const items=(await db.from('pro_private_estimate_items').select('position,content').eq('owner_id',owner.id).eq('estimate_id',base).order('position').throwOnError()).data!;
  expect(items).toHaveLength(2);expect(items[1].content).toMatchObject({description:'Recargo por monto previsto: Grifería',unitPriceCents:2000000,qtyMilli:1000,taxBps:1300});
  expect((await db.from('pro_private_estimate_history').select('action_id').eq('owner_id',owner.id).eq('estimate_id',base).throwOnError()).data).toHaveLength(1);
  // One live surcharge per allowance (409); the link is reported.
  await send(body({estimateRevision:2}),409);
  let after=await read();expect(after.links).toMatchObject([{allowanceId:over.id,estimateId:base,amountCents:2000000,present:true}]);
  // Removing the line from the estimate allows sending again.
  await db.from('pro_private_estimate_items').delete().eq('owner_id',owner.id).eq('id',(result as {lineId:string}).lineId).throwOnError();
  after=await read();expect(after.links[0].present).toBe(false);
  const again=await send(body({estimateRevision:2}));expect(again).toMatchObject({estimateRevision:3,amountCents:2000000});
  // Archived estimate cannot receive it.
  await db.from('pro_private_estimates').update({archived:true}).eq('owner_id',owner.id).eq('id',base).throwOnError();
  await send(body({estimateRevision:3,lineId:crypto.randomUUID()}),409);await db.from('pro_private_estimates').update({archived:false}).eq('owner_id',owner.id).eq('id',base).throwOnError();

  // ---- UI ----
  await page.setViewportSize(info.project.name.includes('mobile')?{width:390,height:844}:{width:1366,height:900});
  await page.context().addCookies([{name:'NEXT_LOCALE',value:language,url:origin}]);
  const second=await make('Pintura especial',1000000,1600000);
  await gotoOK(page,origin+'/'+language+'/dashboard/pro?'+new URLSearchParams({tab:'pro_agenda',cita:f.uiWorkId,vistaTrabajo:'allowances'}));
  const card=page.locator(`[data-allowance-item="${second.id}"]`);await expect(card).toBeVisible({timeout:60000});
  await expect(card.locator('[data-allowance-surcharge]')).toBeVisible();
  await card.locator('[data-allowance-surcharge-open]').click();
  await expect(card.locator('[data-allowance-surcharge-none]')).toBeVisible();
  await expect(card.locator('[data-allowance-surcharge-confirm]')).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  const ui=await draftEstimate(db,owner.id,f.uiWorkId,linkedClient);
  await page.reload();await expect(card).toBeVisible({timeout:60000});
  await card.locator('[data-allowance-surcharge-open]').click();
  await card.locator('[data-allowance-surcharge-estimate]').selectOption(ui);
  await card.locator('[data-allowance-surcharge-tax]').selectOption('0');
  await expectNoHorizontalOverflow(page);
  await card.locator('[data-allowance-surcharge-confirm]').click();
  await expect(card.locator('[data-allowance-surcharge="sent"]')).toBeVisible({timeout:30000});
  await expect(card.locator('[data-allowance-surcharge="sent"]')).toContainText(en?'Surcharge of':'Recargo de');
  expect((await db.from('pro_private_estimate_items').select('id').eq('owner_id',owner.id).eq('estimate_id',ui).throwOnError()).data).toHaveLength(2);
  expect(runtime).toEqual([]);
 }finally{await cleanupDisposableAccount(owner);await cleanupDisposableAccount(client);await cleanupDisposableAccount(rival);}
});
