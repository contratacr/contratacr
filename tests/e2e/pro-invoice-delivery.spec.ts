import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {proMoney} from '../../src/lib/pro/money';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

// Rows 42/44: the owner sends an invoice draft of a job to the customer; its status is derived (sent, viewed, partly paid, paid, overdue).
// The linked customer's first opening is recorded once. E-mail is sandbox only: nothing is sent.
const origin=process.env.PRO_LOCAL_ORIGIN??'http://127.0.0.1:3185',api='/api/pro/invoice-delivery';
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

for(const language of ['es','en'] as const)test(`Invoice delivery: send, customer opening, status and recall [${language}]`,async({page,baseURL})=>{
 test.setTimeout(300000);local(baseURL);const f=await fixture(page.context()),{owner,client,rival,db,workId,requestId,linkedClient}=f;
 let customer:BrowserContext|undefined;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const draftId=crypto.randomUUID();
  await db.from('pro_invoice_drafts').insert({user_id:owner.id,id:draftId,client_id:linkedClient,source_kind:'direct',source_id:draftId,work_id:workId,title:'Avance de cocina',receiver_name:'Cliente',receiver_identification:'',receiver_email:'',receiver_phone:'',receiver_address:'',total_cents:500000,tax_cents:0,material_count:0,material_cost:0,basis:'manual',source_fingerprint:'a'.repeat(32)}).throwOnError();
  await db.from('pro_client_dashboards').upsert({owner_id:owner.id,work_id:workId,show_finances:true}).throwOnError();
  const get=async(query:Record<string,string>,who=owner.id)=>await page.request.get(api+'?'+new URLSearchParams(query),{headers:{'X-Pro-Expected-Actor':who}});
  expect(await (await get({draftId})).json()).toMatchObject({status:'draft',delivered:false,totalCents:500000,balanceCents:500000,events:[]});
  // Access and strict input.
  // A mismatched actor header on the owner's session is refused as an account change; real isolation uses the rival's own session.
  expect((await get({draftId},rival.id)).status()).toBe(403);
  const rivalContext=await page.context().browser()!.newContext();
  try{await login(rivalContext,rival);expect((await rivalContext.request.get(origin+api+'?'+new URLSearchParams({draftId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);}finally{await rivalContext.close();}
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':owner.id},data:{action:'send'}})).status()).toBe(403);
  expect((await page.request.post(api,{headers,data:{action:'send',actionId:crypto.randomUUID(),draftId,email:false,extra:1}})).status()).toBe(400);
  expect((await page.request.post(api,{headers:{...headers,'X-Pro-Expected-Actor':rival.id},data:{action:'send',actionId:crypto.randomUUID(),draftId,email:false}})).status()).toBe(403);
  // Send (idempotent), then the owner's preview does not count as the customer opening it.
  const actionId=crypto.randomUUID(),body={action:'send',actionId,draftId,email:false};
  const sent=await page.request.post(api,{headers,data:body});expect(sent.status()).toBe(200);expect(await sent.json()).toMatchObject({status:'sent',delivered:true});
  expect(await (await page.request.post(api,{headers,data:body})).json()).toMatchObject({status:'sent'});
  expect((await get({requestId})).status()).toBe(200);
  expect((await (await get({draftId})).json()).viewedAt).toBeNull();
  // The linked customer opens it: recorded once, status shown with due date and balance.
  customer=await page.context().browser()!.newContext();await login(customer,client);
  const seen=await customer.request.get(origin+api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':client.id}});expect(seen.status()).toBe(200);
  expect(await seen.json()).toMatchObject({visible:true,invoices:[{id:draftId,status:'viewed',balanceCents:500000}]});
  await customer.request.get(origin+api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':client.id}});
  const after=await (await get({draftId})).json();expect(after.status).toBe('viewed');expect(after.events.filter((e:{action:string})=>e.action==='view')).toHaveLength(1);
  // Recall hides it; sending again works; nothing is e-mailed for real (no e-mail saved: refused with 400).
  expect((await page.request.post(api,{headers,data:{action:'recall',actionId:crypto.randomUUID(),draftId}})).status()).toBe(200);
  expect((await (await customer.request.get(origin+api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':client.id}})).json()).invoices).toEqual([]);
  expect((await page.request.post(api,{headers,data:{action:'send',actionId:crypto.randomUUID(),draftId,email:true}})).status()).toBe(400);
  expect(runtime).toEqual([]);
 }finally{await customer?.close();await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.client);await cleanupDisposableAccount(f.rival);}
});
