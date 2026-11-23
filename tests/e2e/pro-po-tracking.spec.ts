import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

// Family 52: carrier, tracking guide, dates and per-line state of an issued purchase order.
const origin='http://127.0.0.1:3185',api='/api/pro/purchase-order-tracking';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
const shiftDay=(iso:string,days:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};

async function makePro(db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount,slug:string){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Órdenes de compra local',slug:slug+'-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
}

async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'po-owner'}),db=regressionAdminClient();let rival:DisposableAccount|undefined;
 try{
  rival=await createDisposableAccount({prefix:'po-rival'});await makePro(db,owner,'po');await makePro(db,rival,'po-rival');
  const workId=crypto.randomUUID(),uiWorkId=crypto.randomUUID(),day=crTodayISO(),clientId='private-po-'+owner.id.slice(0,8),document=emptyBusiness();
  document.clients=[{id:clientId,name:'Cliente compras local',email:'',phone:'',notes:'',archived:false}];
  document.work=[
   {id:workId,clientId,client:'Cliente compras local',service:'Remodelación de cocina',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false},
   {id:uiWorkId,clientId,client:'Cliente compras local',service:'Baño principal',stage:'scheduled',start:day+'T14:00:00-06:00',end:day+'T15:00:00-06:00',cancelled:false},
  ];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  for(const id of [workId,uiWorkId])expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId:id,clientId}),{timeout:45000})).status()).toBe(200);
  return {owner,rival,db,workId,uiWorkId,clientId};
 }catch(error){await cleanupDisposableAccount(owner);if(rival)await cleanupDisposableAccount(rival);throw error;}
}


test('Order tracking: owner-only, optimistic concurrency, dates and line states',async({page,baseURL})=>{
 test.setTimeout(240000);local(baseURL);const f=await fixture(page.context()),{owner,rival,db,workId}=f;
 try{
  const today=crTodayISO(),headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const rpc=async(input:Record<string,unknown>)=>{const r=await db.rpc('pro_purchase_orders_mutate',{p_actor:owner.id,p_input:input});expect(r.error).toBeNull();return (r.data as {order:{id:string;revision:number;lines:{id:string}[]}}).order;};
  const lineA=crypto.randomUUID(),lineB=crypto.randomUUID();
  const mk=(id:string)=>({action:'create',actionId:crypto.randomUUID(),workId,id,supplierId:null,supplierName:'Proveedor demo',supplierContact:null,title:'Gabinetes',issueDate:today,expectedDate:null,notes:null,
   lines:[{id:lineA,description:'Gabinete alto',quantity:1,unit:'u',unitCents:100000,taxRate:13,budgetCodeId:null,selectionOptionId:null,allowanceId:null},{id:lineB,description:'Gabinete bajo',quantity:2,unit:'u',unitCents:50000,taxRate:13,budgetCodeId:null,selectionOptionId:null,allowanceId:null}]});
  const draft=await rpc(mk(crypto.randomUUID()));
  const get=(query:Record<string,string>)=>page.request.get(api+'?'+new URLSearchParams(query),{headers:{'X-Pro-Expected-Actor':owner.id}});
  const post=(data:Record<string,unknown>)=>page.request.post(api,{headers,data});
  const input=(id:string,revision:number,fields:Record<string,unknown>={})=>({workId,id,revision,carrier:'Correos de Costa Rica',trackingNumber:'CR123456789',shippedOn:today,etaOn:null,installOn:null,note:null,lineStates:{},...fields});

  // A draft order cannot be tracked yet.
  expect((await post(input(draft.id,0))).status()).toBe(400);
  const issued=await rpc({action:'issue',actionId:crypto.randomUUID(),workId,id:draft.id,revision:draft.revision});
  expect(issued).toBeTruthy();

  // Empty record first (revision 0), then the first save needs revision 0.
  const empty=await (await get({workId,id:draft.id})).json();expect(empty).toMatchObject({revision:0,carrier:null,lineStates:{}});
  expect((await post(input(draft.id,3))).status()).toBe(409);
  const first=await post(input(draft.id,0,{etaOn:shiftDay(today,5),installOn:shiftDay(today,7),lineStates:{[lineA]:'En tránsito',[lineB]:'Pedido'}}));
  expect(first.status()).toBe(200);expect(await first.json()).toMatchObject({revision:1,carrier:'Correos de Costa Rica',trackingNumber:'CR123456789',lineStates:{[lineA]:'En tránsito',[lineB]:'Pedido'}});

  // Optimistic concurrency, validation and ownership.
  expect((await post(input(draft.id,0))).status()).toBe(409);
  expect((await post(input(draft.id,1,{etaOn:shiftDay(today,-3)}))).status()).toBe(400);
  expect((await post(input(draft.id,1,{lineStates:{[crypto.randomUUID()]:'Entregado'}}))).status()).toBe(400);
  expect((await post(input(draft.id,1,{lineStates:{[lineA]:'x'.repeat(41)}}))).status()).toBe(400);
  expect((await post({...input(draft.id,1),extra:true})).status()).toBe(400);
  const second=await post(input(draft.id,1,{carrier:null,trackingNumber:null,lineStates:{[lineA]:'Entregado',[lineB]:null}}));
  expect(second.status()).toBe(200);expect(await second.json()).toMatchObject({revision:2,carrier:null,lineStates:{[lineA]:'Entregado'}});

  // Another account sees nothing and writes nothing; anonymous is rejected.
  const other=await page.context().browser()!.newContext();
  try{
   await login(other,rival);
   expect((await other.request.get(origin+api+'?'+new URLSearchParams({workId,id:draft.id}))).status()).toBe(404);
   expect((await other.request.post(origin+api,{headers:{Origin:origin},data:input(draft.id,2)})).status()).toBeGreaterThanOrEqual(400);
  }finally{await other.close();}
  const anon=await page.context().browser()!.newContext();
  try{expect((await anon.request.get(origin+api+'?'+new URLSearchParams({workId,id:draft.id}))).status()).toBe(401);}finally{await anon.close();}
 }finally{await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.rival);}
});
