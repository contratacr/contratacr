import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

// Row 53 (bid requests): packages per project, vendors from the directory, offers recorded by hand,
// side-by-side comparison, award per line and draft purchase orders through the existing writer.
// Local types on purpose: src/lib/pro/bids.ts only exists after phase 2.
type BidStatus='draft'|'open'|'closed'|'awarded'|'cancelled';
type Offer={supplierId:string;unitCents:number;totalCents:number};
type BidLine={id:string;position:number;description:string;quantity:number;unit:string;budgetCodeId:string|null;quotedCount:number;lowestCents:number|null;lowestSupplierIds:string[];offers:Offer[];award:Offer|null};
type BidVendor={supplierId:string;name:string;kind:'supplier'|'subcontractor';totalCents:number|null;missingCount:number;lowestCount:number;awardedCents:number|null;response:{receivedOn:string}|null;order:{orderId:string;code:string;status:string}|null};
type BidPackage={id:string;workId:string;code:string;title:string;status:BidStatus;dueDate:string|null;revision:number;lines:BidLine[];vendors:BidVendor[];awardedCents:number;comparison:{bestCombinedCents:number|null;unquotedLineCount:number}};
type BidList={workId:string;items:Array<{id:string;code:string;status:BidStatus}>;nextNumber:number;today:string};

const origin='http://127.0.0.1:3185',api='/api/pro/bids';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
const shiftDay=(iso:string,days:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};

async function makePro(db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount,slug:string){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Licitaciones local',slug:slug+'-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
}

async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'bid-owner'}),db=regressionAdminClient();let rival:DisposableAccount|undefined;
 try{
  rival=await createDisposableAccount({prefix:'bid-rival'});await makePro(db,owner,'bid');await makePro(db,rival,'bid-rival');
  const workId=crypto.randomUUID(),uiWorkId=crypto.randomUUID(),day=crTodayISO(),clientId='private-bid-'+owner.id.slice(0,8),document=emptyBusiness();
  document.clients=[{id:clientId,name:'Cliente licitación local',email:'',phone:'',notes:'',archived:false}];
  document.work=[
   {id:workId,clientId,client:'Cliente licitación local',service:'Remodelación de cocina',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false},
   {id:uiWorkId,clientId,client:'Cliente licitación local',service:'Baño principal',stage:'scheduled',start:day+'T14:00:00-06:00',end:day+'T15:00:00-06:00',cancelled:false},
  ];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  for(const id of [workId,uiWorkId])expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId:id,clientId}),{timeout:45000})).status()).toBe(200);
  return {owner,rival,db,workId,uiWorkId,clientId};
 }catch(error){await cleanupDisposableAccount(owner);if(rival)await cleanupDisposableAccount(rival);throw error;}
}

for(const language of ['es','en'] as const)test(`Bid requests: numbering, invitations, offers, comparison, award, draft purchase orders and UI [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(420000);local(baseURL);const en=language==='en',f=await fixture(page.context()),{owner,rival,workId,uiWorkId}=f;let other:BrowserContext|undefined;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const get=async(query:Record<string,string>,status=200)=>{const r=await page.request.get(api+'?'+new URLSearchParams(query),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status(),JSON.stringify(query)).toBe(status);return status===200?await r.json():null;};
  const post=async(data:Record<string,unknown>,status=200,extra:Record<string,string>={})=>{const r=await page.request.post(api,{headers:{...headers,...extra},data});expect(r.status(),JSON.stringify(data).slice(0,300)).toBe(status);return status===200?await r.json() as {package:BidPackage;orders?:Array<{supplierId:string;orderId:string;code:string;totalCents:number}>}:null;};
  const today=crTodayISO(),due=shiftDay(today,7);

  // ---- Vendors from the existing directory (Company › Vendors) ----
  const vendor=async(name:string,kind:'supplier'|'subcontractor')=>{const id=crypto.randomUUID();expect((await page.request.post('/api/pro/company-vendors',{headers,data:{action:'create',actionId:crypto.randomUUID(),id,name,kind,trade:null,contactName:null,email:'',phone:'',identification:'',notes:null}})).status()).toBe(200);return id;};
  const v1=await vendor('Ferretería Central','supplier'),v2=await vendor('Maderas del Valle','subcontractor'),archived=await vendor('Proveedor archivado','supplier');
  expect((await page.request.post('/api/pro/company-vendors',{headers,data:{action:'archive',actionId:crypto.randomUUID(),id:archived,revision:1}})).status()).toBe(200);

  // ---- API: empty list, query validation and isolation ----
  const empty=await get({view:'list',workId}) as BidList;expect(empty).toMatchObject({workId,items:[],nextNumber:1,today});
  const sources=await get({view:'sources',workId});expect(sources.vendors.map((v:{name:string})=>v.name)).toEqual(['Ferretería Central','Maderas del Valle']);
  await get({view:'list'},400);await get({view:'nope',workId},400);await get({view:'detail',workId},400);await get({view:'list',workId,extra:'1'},400);
  expect((await page.request.get(api+'?view=list&workId='+workId+'&workId='+workId)).status()).toBe(400);
  await get({view:'list',workId:'no-such-work'},404);
  expect((await page.request.get(api+'?'+new URLSearchParams({view:'list',workId}),{headers:{'X-Pro-Expected-Actor':rival!.id}})).status()).toBe(403);

  // ---- API: create, validation (400), replay (idempotent) and numbering ----
  const l1=crypto.randomUUID(),l2=crypto.randomUUID(),p1=crypto.randomUUID();
  const create={action:'create',actionId:crypto.randomUUID(),workId,id:p1,title:'Muebles de cocina',scope:'Fabricación e instalación',dueDate:due,
   lines:[{id:l1,description:'Módulo inferior',quantity:2.5,unit:'m',budgetCodeId:null},{id:l2,description:'Sobre de granito',quantity:3,unit:'m²',budgetCodeId:null}]};
  for(const bad of [{...create,extra:true},{...create,title:' '},{...create,lines:[]},{...create,dueDate:'2026-02-30'},{...create,lines:[{...create.lines[0],quantity:0.0001}]},{...create,lines:[create.lines[0],create.lines[0]]}])
   await post({...bad,actionId:crypto.randomUUID(),id:crypto.randomUUID()},400);
  await post({...create,actionId:crypto.randomUUID(),id:crypto.randomUUID(),dueDate:shiftDay(today,-1)},400);
  const created=(await post(create))!.package;expect(created).toMatchObject({code:'LIC-0001',status:'draft',revision:1});
  expect((await post(create))!.package).toEqual(created);
  await post({...create,title:'Otro título'},400);
  expect((await get({view:'list',workId}) as BidList).items.map(i=>i.code)).toEqual(['LIC-0001']);

  // ---- API: transport guards ----
  expect((await page.request.post(api,{headers:{...headers,Origin:'http://evil.example'},data:{...create,actionId:crypto.randomUUID()}})).status()).toBe(403);
  await post({...create,actionId:crypto.randomUUID()},403,{'X-Pro-Expected-Actor':rival!.id});
  expect((await page.request.post(api,{headers:{...headers,'Content-Type':'application/json'},data:JSON.stringify({...create,scope:'x'.repeat(17000)})})).status()).toBe(413);
  other=await browser.newContext();await login(other,rival!);
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({view:'detail',workId,id:p1}),{headers:{'X-Pro-Expected-Actor':rival!.id}})).status()).toBe(404);
  expect((await other.request.post(origin+api,{headers:{Origin:origin,'X-Pro-Expected-Actor':rival!.id},data:{action:'open',actionId:crypto.randomUUID(),workId,id:p1,revision:1}})).status()).toBe(403);

  // ---- Invite, open, offers and comparison ----
  await post({action:'invite',actionId:crypto.randomUUID(),workId,id:p1,revision:1,supplierIds:[archived]},400);
  let pkg=(await post({action:'invite',actionId:crypto.randomUUID(),workId,id:p1,revision:1,supplierIds:[v1,v2]}))!.package;expect(pkg.vendors).toHaveLength(2);expect(pkg.revision).toBe(2);
  await post({action:'open',actionId:crypto.randomUUID(),workId,id:p1,revision:1},409);
  pkg=(await post({action:'open',actionId:crypto.randomUUID(),workId,id:p1,revision:2}))!.package;expect(pkg.status).toBe('open');
  await post({action:'record_response',actionId:crypto.randomUUID(),workId,id:p1,revision:3,supplierId:v1,receivedOn:shiftDay(today,1),leadDays:10,validUntil:null,notes:null,prices:[{lineId:l1,unitCents:100}]},400);
  pkg=(await post({action:'record_response',actionId:crypto.randomUUID(),workId,id:p1,revision:3,supplierId:v1,receivedOn:today,leadDays:15,validUntil:shiftDay(today,30),notes:'Incluye transporte',
   prices:[{lineId:l1,unitCents:12000000},{lineId:l2,unitCents:8000000}]}))!.package;
  pkg=(await post({action:'record_response',actionId:crypto.randomUUID(),workId,id:p1,revision:4,supplierId:v2,receivedOn:today,leadDays:null,validUntil:null,notes:null,prices:[{lineId:l1,unitCents:11000001}]}))!.package;
  expect(pkg.lines[0]).toMatchObject({lowestSupplierIds:[v2],lowestCents:27500003,quotedCount:2});
  expect(pkg.lines[1]).toMatchObject({lowestSupplierIds:[v1],lowestCents:24000000,quotedCount:1});
  expect(pkg.vendors.find(v=>v.supplierId===v2)).toMatchObject({totalCents:27500003,missingCount:1});
  expect(pkg.comparison).toMatchObject({bestCombinedCents:51500003,unquotedLineCount:0});
  await post({action:'update',actionId:crypto.randomUUID(),workId,id:p1,revision:5,title:'Nuevo',scope:null,dueDate:due,lines:create.lines},400);

  // ---- Award per line and draft purchase orders (existing writer, idempotent) ----
  await post({action:'award',actionId:crypto.randomUUID(),workId,id:p1,revision:5,awards:[{lineId:l2,supplierId:v2}]},400);
  pkg=(await post({action:'award',actionId:crypto.randomUUID(),workId,id:p1,revision:5,awards:[{lineId:l1,supplierId:v2},{lineId:l2,supplierId:v1}]}))!.package;
  expect(pkg).toMatchObject({status:'awarded',awardedCents:51500003});
  const generate={action:'generate_orders',actionId:crypto.randomUUID(),workId,id:p1,revision:6,locale:language};
  const generated=(await post(generate))!;expect(generated.orders!.map(o=>o.code).sort()).toEqual(['OC-0001','OC-0002']);
  expect(await post(generate)).toEqual(generated);
  await post({...generate,actionId:crypto.randomUUID(),revision:7},400);
  const orders=await (await page.request.get('/api/pro/purchase-orders?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json();
  expect(orders.items.map((o:{status:string})=>o.status)).toEqual(['draft','draft']);
  expect(orders.items.reduce((sum:number,o:{totalCents:number})=>sum+o.totalCents,0)).toBe(51500003);
  await post({action:'cancel',actionId:crypto.randomUUID(),workId,id:p1,revision:7,reason:null},400);

  // ---- UI on a second, empty project ----
  const mobile=(page.viewportSize()?.width??1366)<1024;let failFirst=true;
  await page.route('**/api/pro/bids?**',async route=>{if(failFirst&&route.request().method()==='GET'&&route.request().url().includes('view=list')){failFirst=false;return route.fulfill({status:503,json:{error:'LOCAL failure'}});}return route.continue();});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:uiWorkId,vistaTrabajo:'bids'}));
  const nav=page.getByRole('navigation',{name:en?'Job workspace':'Gestión del trabajo'});await expect(nav).toBeVisible({timeout:60000});
  const planning=nav.locator(`[data-job-workspace-group="${en?'Planning':'Planificación'}"]`);
  await expect(planning.getByRole('button',{name:en?'Bid requests':'Licitaciones',exact:true})).toHaveAttribute('aria-current','page');
  const view=page.locator('[data-work-bids]');const loadError=view.locator('[data-bids-load-error]');await expect(loadError).toBeVisible({timeout:60000});
  await loadError.getByRole('button',{name:en?'Retry':'Reintentar'}).click();
  await expect(view.locator('[data-bids-empty]')).toContainText(en?'There are no bid requests for this project yet.':'Este proyecto todavía no tiene licitaciones.');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`bids-empty-${language}${mobile?'-mobile':''}.png`),fullPage:true});
  await view.getByRole('button',{name:en?'New bid request':'Nueva licitación'}).click();
  const form=view.locator('[data-bid-form="create"]');await expect(form).toBeVisible();
  await form.getByLabel(en?'Title':'Título',{exact:true}).fill(en?'Bathroom tile':'Enchape del baño');
  await form.getByLabel(en?'Due date for offers':'Fecha límite para ofertas').fill(due);
  await form.getByLabel(en?'Description':'Descripción',{exact:true}).fill(en?'Wall tile':'Enchape de pared');
  await form.getByLabel(en?'Quantity':'Cantidad',{exact:true}).fill(en?'12.5':'12,5');
  await form.getByLabel(en?'Unit':'Unidad',{exact:true}).fill('m²');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`bids-form-${language}${mobile?'-mobile':''}.png`),fullPage:true});
  await form.getByRole('button',{name:en?'Save bid request':'Guardar licitación'}).click();
  await expect(view.getByRole('status').filter({hasText:en?'Bid request saved.':'Licitación guardada.'})).toBeVisible();// the detail may still show its own loading status
  const detail=view.locator('[data-bid-detail="LIC-0002"]');await expect(detail).toBeVisible();
  // Reload: the package persisted with its number and line.
  // Round 2: the open package is kept in the URL, so the reload reopens it directly.
  await expect(page).toHaveURL(/[?&]licitacion=[0-9a-f-]{36}/);
  await page.reload();await expect(detail).toContainText(en?'Wall tile':'Enchape de pared',{timeout:60000});
  await expect(page).toHaveURL(/[?&]licitacion=[0-9a-f-]{36}/);
  await detail.getByRole('button',{name:en?'Invite vendors':'Invitar proveedores'}).click();
  const invite=view.locator('[data-bid-form="invite"]');await invite.getByLabel(/Ferretería Central/).check();await invite.getByLabel(/Maderas del Valle/).check();
  await invite.getByRole('button',{name:en?'Invite selected':'Invitar a los seleccionados'}).click();
  await expect(detail.locator('[data-bid-vendor]')).toHaveCount(2);
  await detail.getByRole('button',{name:en?'Open for offers':'Abrir para ofertas'}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:en?'Open for offers':'Abrir para ofertas'}).click();
  await expect(detail).toContainText(en?'Open':'Abierta');
  for(const [name,price] of [['Ferretería Central','9500'],['Maderas del Valle','8700']] as const){
   await detail.locator(`[data-bid-vendor="${name}"]`).getByRole('button',{name:en?'Record offer':'Registrar oferta'}).click();
   const response=view.locator('[data-bid-form="response"]');await response.getByRole('textbox',{name:new RegExp(en?'Unit price':'Precio unitario')}).fill(price);
   await response.getByRole('button',{name:en?'Save offer':'Guardar oferta'}).click();await expect(view.getByRole('status').filter({hasText:en?'Offer recorded.':'Oferta registrada.'})).toBeVisible();// the detail may still show its own loading status
  }
  const comparison=detail.locator('[data-bid-comparison]');await expect(comparison).toContainText(en?'Lowest':'Más bajo');
  await comparison.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);
  await page.screenshot({path:info.outputPath(`bids-comparison-${language}${mobile?'-mobile':''}.png`),fullPage:true});
  expect(runtime).toEqual([]);
 }finally{await other?.close();await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.rival);}
});
