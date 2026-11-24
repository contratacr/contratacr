import {test,expect,type BrowserContext,type Page,type TestInfo} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {proMoney} from '../../src/lib/pro/money';
import {detectCsvDelimiter,parseCatalogCsv,previewCatalogImport} from '../../src/lib/pro/catalog-import';
import {parseLeadImportCsv} from '../../src/lib/pro/lead-inboxes';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {CompanyVendor,CompanyVendorPage,CompanyVendorDetail} from '../../src/lib/pro/company-vendors';

// Company hub (Houzz "Company"): vendors directory, categories, library views, marketing states and CSV with ';'.
const origin='http://127.0.0.1:3185',api='/api/pro/company-vendors';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
async function warm(context:BrowserContext){for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);}
type Db=ReturnType<typeof regressionAdminClient>;
async function makePro(db:Db,account:DisposableAccount,slug:string){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Empresa local',slug:slug+'-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
}
async function fixture(context:BrowserContext){
 const db=regressionAdminClient(),owner=await createDisposableAccount({prefix:'company-owner'});let rival:DisposableAccount|undefined,plain:DisposableAccount|undefined;
 try{
  rival=await createDisposableAccount({prefix:'company-rival'});plain=await createDisposableAccount({prefix:'company-plain'});
  await makePro(db,owner,'company');await makePro(db,rival,'company-rival');
  const workId=crypto.randomUUID(),day=crTodayISO(),clientId='private-company-'+owner.id.slice(0,8),document=emptyBusiness();
  document.clients=[{id:clientId,name:'Cliente empresa local',email:'',phone:'',notes:'',archived:false,tradeName:'Condominio Las Palmas',group:'Condominios'}];
  document.work=[{id:workId,clientId,client:'Cliente empresa local',service:'Remodelación',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);await warm(context);
  expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId,clientId}),{timeout:45000})).status()).toBe(200);
  return {db,owner,rival,plain,workId,clientId,day};
 }catch(error){await cleanupDisposableAccount(owner);await cleanupDisposableAccount(rival);await cleanupDisposableAccount(plain);throw error;}
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
const desktop=(page:Page)=>(page.viewportSize()?.width??0)>=640;
async function shot(page:Page,info:TestInfo,name:string){await page.screenshot({path:info.outputPath(name+'.png'),fullPage:true,animations:'disabled'});}
// Environment-only recovery: the product's own Retry for its temporary Pro verification error (at most 3 clicks).
async function openHub(page:Page,language:'es'|'en',view:string,extra:Record<string,string>={}){
 const en=language==='en';await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:view,...extra}));
 const temporary=page.locator('main').getByRole('alert').filter({hasText:en?/^Could not verify Pro access/:/^No se pudo comprobar el acceso a Pro/}),ready=page.locator(`[data-company-hub="${view}"]`);
 for(let attempt=0;attempt<3;attempt++){await expect.poll(async()=>await ready.isVisible()||await temporary.isVisible(),{timeout:45000}).toBe(true);if(!await temporary.isVisible())break;await page.locator('main').getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();await expect.poll(async()=>await ready.isVisible()||!await temporary.isVisible(),{timeout:20000}).toBe(true).catch(()=>{});}
 await expect(ready).toBeVisible({timeout:45000});
}
async function goView(page:Page,en:boolean,label:string,view:string){
 if(desktop(page))await page.getByRole('navigation',{name:en?'Company sections':'Secciones de Empresa',exact:true}).getByRole('button',{name:label,exact:true}).click();
 else await page.getByLabel(en?'Company section':'Sección de Empresa',{exact:true}).selectOption(view);
 await expect(page.locator(`[data-company-hub="${view}"]`)).toBeVisible({timeout:45000});
}

test('CSV separator: comma and semicolon headers, quoted separators, decimal comma only with semicolons',()=>{
 expect(detectCsvDelimiter('name,email\r\nA,b@c.cr')).toBe(',');
 expect(detectCsvDelimiter('﻿name;email;phone\r\nA;b@c.cr;8888')).toBe(';');
 expect(detectCsvDelimiter('"a;b";"c;d",x\nv')).toBe(',');
 expect(detectCsvDelimiter('"x,y";z\nv')).toBe(';');
 expect(detectCsvDelimiter('name\nA,B;C')).toBe(',');
 expect(parseCatalogCsv('sku;name;price\r\nA-1;"Tubo; PVC";1250,50\r\n')).toEqual([['sku','name','price'],['A-1','Tubo; PVC','1250,50']]);
 expect(parseCatalogCsv('sku,name\nA-1,"Tubo, PVC"')).toEqual([['sku','name'],['A-1','Tubo, PVC']]);
 const semicolon=previewCatalogImport('sku;name;price;cost;itemType\nA-1;Tubo PVC;1250,50;900;product\nS-1;Instalación;15000;0;service',"products",emptyBusiness(),()=>crypto.randomUUID());
 expect(semicolon.issues).toEqual([]);expect(semicolon.products.map(p=>[p.sku,p.price,p.cost])).toEqual([['A-1',1250.5,900],['S-1',15000,0]]);
 const comma=previewCatalogImport('sku,name,price\nA-1,Tubo,"1250,50"',"products",emptyBusiness(),()=>crypto.randomUUID());expect(comma.issues).toHaveLength(1);
 expect(previewCatalogImport('sku;name;price\nA-1;Tubo;1.250,50',"products",emptyBusiness(),()=>crypto.randomUUID()).issues).toHaveLength(1);
 expect(parseLeadImportCsv('nombre;correo;servicio\nAna;ana@example.test;Pintura').map(r=>[r.name,r.email,r.service])).toEqual([['Ana','ana@example.test','Pintura']]);
});

for(const language of ['es','en'] as const)test(`Company hub: vendor API, isolation, totals, categories, CSV with ';' and UI [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(420000);local(baseURL);const en=language==='en',f:Fixture=await fixture(page.context()),{db,owner,rival,plain,workId,day}=f;let other:BrowserContext|undefined,anonymous:BrowserContext|undefined;
 try{
  const runtime=collectPageErrors(page);
  const tr=(es:string,eng:string)=>en?eng:es;
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const get=async(query:Record<string,string>,status=200)=>{const r=await page.request.get(api+'?'+new URLSearchParams(query),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status(),JSON.stringify(query)).toBe(status);return status===200?await r.json():null;};
  const list=async(query:Record<string,string>={})=>await get({view:'list',...query}) as CompanyVendorPage;
  const post=async(data:Record<string,unknown>,status=200)=>{const r=await page.request.post(api,{headers,data});expect(r.status(),JSON.stringify(data).slice(0,300)).toBe(status);return status===200?(await r.json()).vendor as CompanyVendor:null;};
  const vendor=(fields:Record<string,unknown>={})=>({action:'create',actionId:crypto.randomUUID(),id:crypto.randomUUID(),name:'Ferretería El Roble',kind:'supplier',trade:'Ferretería',contactName:'Laura Mora',email:'ventas@roble.test',phone:'2222-1111',identification:'3-101-123456',notes:null,...fields});

  // ---- UI first: empty state, load error with retry, create/edit/archive (persisted after reload) ----
  if(desktop(page)&&(page.viewportSize()?.width??0)>=1024)await page.setViewportSize({width:1366,height:1000});
  await openHub(page,language,'proveedores');
  const hub=page.locator('[data-company-hub]');
  await expect(page.getByRole('heading',{level:1,name:tr('Empresa','Company'),exact:true})).toBeVisible();
  await expect(hub.getByRole('heading',{level:2,name:tr('Proveedores y subcontratistas','Suppliers and subcontractors'),exact:true})).toBeVisible();
  await expect(page.locator('[data-company-vendors-empty]')).toContainText(tr('Todavía no tiene proveedores.','You have no suppliers yet.'));
  if(desktop(page)){const nav=page.getByRole('navigation',{name:tr('Secciones de Empresa','Company sections'),exact:true});for(const g of en?['Collaborators','Library','Marketing','Help','Settings']:['Colaboradores','Biblioteca','Marketing','Ayuda','Configuración'])await expect(nav.getByRole('group',{name:g,exact:true})).toBeVisible();await expect(nav.getByRole('button')).toHaveCount(24);await expect(nav.getByRole('button',{name:tr('Proveedores','Suppliers'),exact:true})).toHaveAttribute('aria-current','page');}
  else await expect(page.getByLabel(tr('Sección de Empresa','Company section'),{exact:true})).toHaveValue('proveedores');
  await expectNoHorizontalOverflow(page);await shot(page,info,'vendors-empty-'+language);
  let failNext=true;await page.route(url=>url.pathname===api,async route=>{if(failNext&&route.request().method()==='GET'){failNext=false;await route.fulfill({status:503,contentType:'application/json',body:'{"error":"x"}'});}else await route.fallback();});
  await page.getByRole('button',{name:tr('Archivados','Archived'),exact:false}).click();
  const alert=page.locator('[data-company-vendors]').getByRole('alert');await expect(alert).toContainText(tr('No se pudieron cargar los proveedores','Suppliers could not be loaded'));
  await alert.getByRole('button',{name:tr('Reintentar','Retry'),exact:true}).click();await expect(alert).toHaveCount(0);await expect(page.locator('[data-company-vendors-empty]')).toContainText(tr('No tiene proveedores archivados.','You have no archived suppliers.'));
  await page.unroute(url=>url.pathname===api);
  await page.getByRole('button',{name:tr('Activos','Active'),exact:false}).click();
  await page.getByRole('button',{name:tr('Agregar proveedor','Add supplier'),exact:true}).click();
  const dialog=page.getByRole('dialog',{name:tr('Agregar proveedor','Add supplier')});await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:tr('Guardar proveedor','Save supplier'),exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText(tr('Escriba el nombre del proveedor','Enter the supplier name'));
  await dialog.getByLabel(tr('Nombre o razón social','Name or company name')).fill('Pinturas del Valle');
  await dialog.getByLabel(tr('Correo (opcional)','Email (optional)')).fill('no-es-correo');
  await dialog.getByRole('button',{name:tr('Guardar proveedor','Save supplier'),exact:true}).click();await expect(dialog.getByRole('alert')).toContainText(tr('Revise el correo electrónico.','Check the email address.'));
  await dialog.getByLabel(tr('Correo (opcional)','Email (optional)')).fill('ventas@valle.test');
  await dialog.getByLabel(tr('Tipo','Type'),{exact:true}).selectOption('subcontractor');
  await dialog.getByLabel(tr('Etiquetas u oficio (opcional, separe con comas)','Tags or trade (optional, separate with commas)')).fill(tr('Pintura','Painting'));
  await dialog.getByLabel(tr('Persona de contacto (opcional)','Contact person (optional)')).fill('Mario Solís');
  await dialog.getByLabel(tr('Teléfono (opcional)','Phone (optional)')).fill('8888-2222');
  await shot(page,info,'vendor-editor-'+language);
  await dialog.getByRole('button',{name:tr('Guardar proveedor','Save supplier'),exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-company-vendors]').getByRole('status')).toContainText('Pinturas del Valle');
  const row=page.locator('[data-company-vendor]').filter({visible:true}).filter({hasText:'Pinturas del Valle'});await expect(row).toHaveCount(1);
  await expect(row).toContainText(tr('Subcontratista','Subcontractor'));await expect(row).toContainText('Mario Solís');await expect(row).toContainText(tr('Pintura','Painting'));
  await row.getByRole('button',{name:tr('Editar Pinturas del Valle','Edit Pinturas del Valle'),exact:true}).click();
  const edit=page.getByRole('dialog',{name:tr('Editar proveedor','Edit supplier')});await expect(edit.getByLabel(tr('Nombre o razón social','Name or company name'))).toHaveValue('Pinturas del Valle');
  await edit.getByRole('button',{name:tr('Guardar proveedor','Save supplier'),exact:true}).click();await expect(edit.getByRole('alert')).toContainText(tr('No hay cambios que guardar.','There are no changes to save.'));
  await edit.getByLabel(tr('Notas internas (opcional)','Internal notes (optional)')).fill(tr('Trabaja fines de semana','Works on weekends'));
  // Discard confirmation keeps the editor when cancelled.
  await edit.getByRole('button',{name:tr('Cancelar','Cancel'),exact:true}).click();await page.getByRole('button',{name:tr('Descartar cambios','Discard changes'),exact:true}).click();await expect(edit).toHaveCount(0);
  await row.getByRole('button',{name:tr('Editar Pinturas del Valle','Edit Pinturas del Valle'),exact:true}).click();
  await edit.getByLabel(tr('Notas internas (opcional)','Internal notes (optional)')).fill(tr('Trabaja fines de semana','Works on weekends'));
  await edit.getByRole('button',{name:tr('Guardar proveedor','Save supplier'),exact:true}).click();await expect(edit).toHaveCount(0);
  await page.reload();await expect(page.locator('[data-company-hub="proveedores"]')).toBeVisible({timeout:45000});
  await row.getByRole('button',{name:tr('Editar Pinturas del Valle','Edit Pinturas del Valle'),exact:true}).click();
  await expect(edit.getByLabel(tr('Notas internas (opcional)','Internal notes (optional)'))).toHaveValue(tr('Trabaja fines de semana','Works on weekends'));
  await edit.getByText(tr('Historial de cambios','Change history'),{exact:true}).click();await expect(edit.getByText(tr('Editado','Edited'),{exact:true})).toBeVisible();await expect(edit.getByText(tr('Creado','Created'),{exact:true})).toBeVisible();
  await edit.getByRole('button',{name:tr('Cancelar','Cancel'),exact:true}).click();await expect(edit).toHaveCount(0);
  await row.getByRole('button',{name:tr('Archivar Pinturas del Valle','Archive Pinturas del Valle'),exact:true}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:tr('Archivar','Archive'),exact:true}).click();
  await expect(page.locator('[data-company-vendors-empty]')).toBeVisible();
  await page.getByRole('button',{name:tr('Archivados (1)','Archived (1)'),exact:true}).click();await expect(row).toHaveCount(1);
  await row.getByRole('button',{name:tr('Restaurar Pinturas del Valle','Restore Pinturas del Valle'),exact:true}).click();await expect(page.locator('[data-company-vendors-empty]')).toBeVisible();
  await page.getByRole('button',{name:tr('Activos (1)','Active (1)'),exact:true}).click();await expect(row).toHaveCount(1);

  // ---- API: auth, origin, actor, validation and limits ----
  anonymous=await browser.newContext();expect((await anonymous.request.get(origin+api+'?view=list')).status()).toBe(401);
  expect((await page.request.get(api+'?view=list',{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(403);
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':owner.id},data:vendor()})).status()).toBe(403);
  expect((await page.request.post(api,{headers:{Origin:'http://evil.test','X-Pro-Expected-Actor':owner.id},data:vendor()})).status()).toBe(403);
  const ineligible=await db.rpc('pro_company_vendors_read',{p_actor:plain.id,p_query:{view:'list'}});expect(ineligible.error?.code).toBe('42501');
  for(const q of <Record<string,string>[]>[{view:'nope'},{view:'list',status:'x'},{view:'list',kind:'x'},{view:'list',extra:'1'},{view:'list',after:'no-uuid'},{view:'list',after:crypto.randomUUID()},{view:'detail'},{view:'list',q:'x'.repeat(101)}])await get(q,400);
  expect((await page.request.get(api+'?view=list&view=list')).status()).toBe(400);
  await get({view:'detail',id:crypto.randomUUID()},404);
  for(const bad of [{...vendor(),extra:1},vendor({name:'  '}),vendor({name:'x'.repeat(161)}),vendor({email:'malo'}),vendor({kind:'other'}),vendor({trade:'x'.repeat(81)}),vendor({notes:'x'.repeat(2001)}),vendor({id:'no-uuid'}),{action:'archive',actionId:crypto.randomUUID(),id:crypto.randomUUID()},{...vendor(),action:'update',revision:-1}])await post(bad,400);
  expect((await page.request.post(api,{headers,data:vendor({notes:'x'.repeat(17000)})})).status()).toBe(413);
  expect((await page.request.post(api,{headers:{...headers,'Content-Type':'text/plain'},data:'{}'})).status()).toBe(400);
  await post({action:'archive',actionId:crypto.randomUUID(),id:crypto.randomUUID(),revision:0},404);

  // ---- Create, idempotent replay, reused identity, duplicate id ----
  const input=vendor();const created=await post(input);
  expect(created).toMatchObject({name:'Ferretería El Roble',kind:'supplier',trade:'Ferretería',contactName:'Laura Mora',archived:false,revision:1,purchaseOrders:{count:0,committedCents:0,paidCents:0},expenses:{count:0,amountCents:0,paidCents:0}});
  expect(await post(input)).toEqual(created);
  await post({...input,name:'Otro nombre'},400);
  await post({...vendor(),id:input.id},409);
  expect((await db.from('pro_expense_suppliers').select('id').eq('user_id',owner.id).eq('id',input.id).throwOnError()).data).toHaveLength(1);
  // Expenses and Purchase orders keep reading the same supplier.
  const expensesPage=await (await page.request.get('/api/pro/expenses?kind=suppliers')).json();expect(expensesPage.items.map((s:{name:string})=>s.name)).toContain('Ferretería El Roble');

  // ---- Update with CAS (409), edits made from Expenses also move the revision ----
  const updated=await post({...vendor({name:'Ferretería El Roble S.A.',kind:'supplier',notes:'Crédito a 30 días'}),action:'update',id:input.id,revision:1});expect(updated).toMatchObject({revision:2,name:'Ferretería El Roble S.A.',notes:'Crédito a 30 días'});
  await post({...vendor({name:'Viejo'}),action:'update',id:input.id,revision:1},409);
  await post({...vendor({name:'Ferretería El Roble S.A.',notes:'Crédito a 30 días'}),action:'update',id:input.id,revision:2},400);
  expect((await page.request.post('/api/pro/expenses',{headers,data:{actionId:crypto.randomUUID(),revision:(await (await page.request.get('/api/pro/expenses?kind=suppliers')).json()).revision,action:'supplier',id:input.id,name:'Ferretería Roble (Gastos)',identification:'3-101-123456',email:'ventas@roble.test',phone:'2222-1111',archived:false}})).status()).toBe(200);
  await post({...vendor({name:'Pisada'}),action:'update',id:input.id,revision:2},409);
  let detail=await get({view:'detail',id:input.id}) as CompanyVendorDetail;expect(detail.vendor).toMatchObject({name:'Ferretería Roble (Gastos)',revision:3,kind:'supplier',trade:'Ferretería'});
  expect(detail.history.map(h=>h.action)).toEqual(['update','create']);
  expect((await db.from('pro_company_vendor_history').update({action:'archive'}).eq('owner_id',owner.id).eq('supplier_id',input.id)).error?.code).toBe('23514');
  expect((await db.from('pro_company_vendor_actions').update({result:{}}).eq('owner_id',owner.id).eq('action_id',input.actionId)).error?.code).toBe('23514');
  // A supplier created only in Expenses (no profile yet) is listed with revision 0 and editable.
  const legacyId=crypto.randomUUID();expect((await page.request.post('/api/pro/expenses',{headers,data:{actionId:crypto.randomUUID(),revision:(await (await page.request.get('/api/pro/expenses?kind=suppliers')).json()).revision,action:'supplier',id:legacyId,name:'Aserradero Antiguo',identification:'',email:'',phone:'',archived:false}})).status()).toBe(200);
  expect((await list({q:'aserradero'})).items).toMatchObject([{id:legacyId,revision:0,kind:'supplier',trade:null}]);
  expect(await post({...vendor({name:'Aserradero Antiguo',kind:'subcontractor',trade:'Madera',contactName:null,email:'',phone:'',identification:''}),action:'update',id:legacyId,revision:0})).toMatchObject({revision:1,kind:'subcontractor',trade:'Madera'});

  // ---- Archive / restore and filters ----
  const archived=await post({action:'archive',actionId:crypto.randomUUID(),id:legacyId,revision:1});expect(archived).toMatchObject({archived:true,revision:2});
  await post({action:'archive',actionId:crypto.randomUUID(),id:legacyId,revision:2},400);
  expect((await list()).items.map(v=>v.id)).not.toContain(legacyId);expect((await list({status:'archived'})).items.map(v=>v.id)).toEqual([legacyId]);
  expect((await list({kind:'subcontractor'})).items.map(v=>v.name)).toEqual(['Pinturas del Valle']);expect((await list({kind:'subcontractor',status:'archived'})).items.map(v=>v.name)).toEqual(['Aserradero Antiguo']);
  expect((await list({q:'MARIO'})).items.map(v=>v.name)).toEqual(['Pinturas del Valle']);
  expect(await post({action:'restore',actionId:crypto.randomUUID(),id:legacyId,revision:2})).toMatchObject({archived:false,revision:3});
  expect((await list()).counts).toEqual({active:3,archived:0});

  // ---- Totals from purchase orders (non-cancelled, with tax) and expenses, net of reversals ----
  const order=async(cents:number)=>{const id=crypto.randomUUID(),r=await db.rpc('pro_purchase_orders_mutate',{p_actor:owner.id,p_input:{action:'create',actionId:crypto.randomUUID(),workId,id,supplierId:input.id,supplierName:null,supplierContact:null,title:'Compra',issueDate:day,expectedDate:null,notes:null,lines:[{id:crypto.randomUUID(),description:'Cemento',quantity:2,unit:'saco',unitCents:cents,taxRate:13,budgetCodeId:null,selectionOptionId:null,allowanceId:null}]}});expect(r.error).toBeNull();return id;};
  const po1=await order(500000),po2=await order(100000);
  expect((await db.rpc('pro_purchase_orders_mutate',{p_actor:owner.id,p_input:{action:'issue',actionId:crypto.randomUUID(),workId,id:po1,revision:1}})).error).toBeNull();
  expect((await db.rpc('pro_purchase_orders_mutate',{p_actor:owner.id,p_input:{action:'pay',actionId:crypto.randomUUID(),workId,id:po1,revision:2,amountCents:300000,paidOn:day,method:'transfer',reference:null,note:null}})).error).toBeNull();
  expect((await db.rpc('pro_purchase_orders_mutate',{p_actor:owner.id,p_input:{action:'cancel',actionId:crypto.randomUUID(),workId,id:po2,revision:1,reason:'Ya no se necesita'}})).error).toBeNull();
  const revisionNow=async()=>(await (await page.request.get('/api/pro/expenses?kind=expenses')).json()).revision as number;
  const expenseId=crypto.randomUUID();
  expect((await page.request.post('/api/pro/expenses',{headers,data:{actionId:crypto.randomUUID(),revision:await revisionNow(),action:'expense',id:expenseId,supplierId:input.id,date:day,dueDate:null,currency:'CRC',concept:'Pintura',amountCents:250000}})).status()).toBe(200);
  expect((await page.request.post('/api/pro/expenses',{headers,data:{actionId:crypto.randomUUID(),revision:await revisionNow(),action:'payment',expenseId,amountCents:100000,date:day,method:'transfer',reference:'',note:''}})).status()).toBe(200);
  const withTotals=(await list({q:'roble'})).items[0];
  // 2 × ₡5 000 = ₡10 000 + 13 % = ₡11 300 (cancelled order excluded).
  expect(withTotals).toMatchObject({purchaseOrders:{count:1,committedCents:1130000,paidCents:300000},expenses:{count:1,amountCents:250000,paidCents:100000}});

  // ---- Pagination by name (20 + rest) through the RPC (same validation, no rate limit) ----
  for(let n=0;n<20;n++){const r=await db.rpc('pro_company_vendors_mutate',{p_actor:owner.id,p_input:vendor({name:'Lote '+String(n).padStart(2,'0'),trade:null,contactName:null,email:'',phone:'',identification:''})});expect(r.error).toBeNull();}
  const first=await list();expect(first.items).toHaveLength(20);expect(first.nextCursor).not.toBeNull();
  const second=await list({after:first.nextCursor!});expect(second.nextCursor).toBeNull();
  const names=[...first.items,...second.items].map(v=>v.name);expect(names).toHaveLength(23);expect(new Set(names).size).toBe(23);expect(names).toEqual([...names].sort((a,b)=>a.toLowerCase()<b.toLowerCase()?-1:1));

  // ---- Isolation with a second Pro account ----
  other=await browser.newContext();await login(other,rival);await warm(other);
  const rivalHeaders={Origin:origin,'X-Pro-Expected-Actor':rival.id};
  const rivalList=await (await other.request.get(origin+api+'?view=list',{headers:{'X-Pro-Expected-Actor':rival.id}})).json();expect(rivalList.items).toEqual([]);expect(rivalList.counts).toEqual({active:0,archived:0});
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({view:'detail',id:input.id}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({view:'list',after:input.id}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(400);
  expect((await other.request.post(origin+api,{headers:rivalHeaders,data:{action:'archive',actionId:crypto.randomUUID(),id:input.id,revision:3}})).status()).toBe(404);
  expect((await other.request.post(origin+api,{headers:rivalHeaders,data:{...vendor({name:'Robo'}),action:'update',id:input.id,revision:3}})).status()).toBe(404);
  // Replaying the owner's payload from another account only creates that account's own row (ids are scoped per owner, as in Expenses).
  const replayed=await other.request.post(origin+api,{headers:rivalHeaders,data:input});expect(replayed.status()).toBe(200);expect((await replayed.json()).vendor).toMatchObject({name:'Ferretería El Roble',revision:1,purchaseOrders:{count:0},expenses:{count:0}});
  expect((await (await other.request.get(origin+api+'?view=list',{headers:{'X-Pro-Expected-Actor':rival.id}})).json()).counts).toEqual({active:1,archived:0});
  detail=await get({view:'detail',id:input.id}) as CompanyVendorDetail;expect(detail.vendor.name).toBe('Ferretería Roble (Gastos)');expect(detail.vendor.archived).toBe(false);

  // ---- Lead import accepts ';' files end to end ----
  const leadPreview=await page.request.post('/api/pro/lead-inboxes',{headers,data:{action:'preview',fileName:'excel.csv',csv:'nombre;correo;telefono;servicio\r\n"Rosa; Díaz";rosa@example.test;;Pintura\r\nLuis;luis@example.test;;Techos'}});
  expect(leadPreview.status()).toBe(200);const previewBody=await leadPreview.json();expect(previewBody.summary).toMatchObject({total:2,new:2,error:0});expect(previewBody.rows[0].name).toBe('Rosa; Díaz');

  // ---- UI: totals in the directory ----
  await openHub(page,language,'proveedores');
  const roble=page.locator('[data-company-vendor]').filter({visible:true}).filter({hasText:'Ferretería Roble (Gastos)'});
  await expect(roble).toContainText(proMoney(11300,en));await expect(roble).toContainText(proMoney(3000,en));await expect(roble).toContainText(proMoney(2500,en));
  // Desktop table: each figure stays on one line (total, then «Paid …»), never split inside the column.
  if((page.viewportSize()?.width??1366)>=1280){const figures=roble.locator('[data-company-vendor-figures="ex"] p');await expect(figures.nth(0)).toHaveText(proMoney(2500,en));await expect(figures.nth(1)).toHaveText(tr('Pagado ','Paid ')+proMoney(1000,en));for(const index of [0,1])expect(await figures.nth(index).evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);return new Set([...range.getClientRects()].map(rect=>Math.round(rect.top))).size;})).toBe(1);}
  await expect(page.getByRole('button',{name:tr('Ver más proveedores','Show more suppliers'),exact:true})).toBeVisible();
  await expectNoHorizontalOverflow(page);await shot(page,info,'vendors-list-'+language);

  // ---- UI: categories (existing manager reused inside the hub) ----
  await goView(page,en,tr('Categorías','Categories'),'categorias');
  const productCard=page.locator('[data-company-categories] section').first();await expect(productCard).toContainText(tr('Todavía no tiene categorías.','You have no categories yet.'));
  await productCard.getByRole('button',{name:tr('Administrar categorías','Manage categories'),exact:true}).click();
  const orgs=page.getByRole('dialog',{name:tr('Administrar categorías','Manage categories')});await expect(orgs).toBeVisible();
  await orgs.getByLabel(tr('Nombre','Name'),{exact:true}).fill(tr('Pisos y enchapes','Flooring and tile'));await orgs.getByRole('button',{name:tr('Crear','Create'),exact:true}).click();
  await expect(orgs.locator('li').filter({hasText:tr('Pisos y enchapes','Flooring and tile')})).toHaveCount(1);
  await orgs.getByRole('button',{name:tr('Cerrar','Close'),exact:true}).first().click();await expect(orgs).toHaveCount(0);
  await expect(productCard).toContainText(tr('Pisos y enchapes','Flooring and tile'));await expect(productCard).toContainText(tr('0 registros','0 records'));
  await page.reload();await expect(page.locator('[data-company-categories] section').first()).toContainText(tr('Pisos y enchapes','Flooring and tile'));
  await expectNoHorizontalOverflow(page);await shot(page,info,'categories-'+language);

  // ---- UI: My items import with a ';' file and decimal comma (existing importer) ----
  await goView(page,en,tr('Catálogos','Catalogs'),'catalogos');await shot(page,info,'catalogs-'+language);
  await page.getByRole('button',{name:tr('Importar productos y servicios','Import products and services'),exact:true}).click();
  const importer=page.getByRole('dialog').filter({hasText:tr('Archivo CSV','CSV file')});await expect(importer).toBeVisible({timeout:45000});
  await expect(page.locator('[data-company-hub="articulos"]')).toBeVisible();
  await importer.getByLabel(tr('Archivo CSV','CSV file')).setInputFiles({name:'excel-es-cr.csv',mimeType:'text/csv',buffer:Buffer.from('﻿sku;name;price;cost;unit;itemType\r\nPVC-1;"Tubo PVC; 1/2";1250,50;900;unidad;product\r\nSRV-1;Instalación;15000;0;servicio;service\r\n')});
  await expect(importer.getByRole('status').filter({hasText:tr('2 registros · 0 errores','2 records · 0 errors')})).toBeVisible();
  await importer.getByRole('button',{name:tr('Importar','Import'),exact:true}).click();await expect(importer).toHaveCount(0,{timeout:45000});
  await expect(page.getByText('Tubo PVC; 1/2 · PVC-1',{exact:true}).filter({visible:true})).toBeVisible();
  const saved=(await db.from('pro_products').select('sku,price').eq('user_id',owner.id).order('sku').throwOnError()).data!;expect(saved.map(p=>[p.sku,Number(p.price)])).toEqual([['PVC-1',1250.5],['SRV-1',15000]]);

  // ---- UI: contacts reuse the customer list (trade name and group visible) ----
  await goView(page,en,tr('Clientes','Customers'),'contactos');
  await expect(page.getByText('Condominio Las Palmas · Condominios',{exact:false}).filter({visible:true})).toBeVisible({timeout:45000});
  await expectNoHorizontalOverflow(page);await shot(page,info,'contacts-'+language);

  // ---- UI: templates and marketing states (nothing is sent) ----
  await goView(page,en,tr('Plantillas','Templates'),'plantillas');
  const templates=page.locator('[data-company-templates]');for(const text of en?['You have no task templates yet.','You have no work plan templates yet.','You have no frequent services yet.','You have no saved discounts yet.']:['Todavía no tiene plantillas de tareas.','Todavía no tiene plantillas de plan de trabajo.','Todavía no tiene servicios frecuentes.','Todavía no tiene descuentos guardados.'])await expect(templates).toContainText(text);
  await expect(templates.locator('[data-task-templates-trigger]')).toBeEnabled({timeout:45000});
  await expectNoHorizontalOverflow(page);await shot(page,info,'templates-'+language);
  await goView(page,en,tr('Correo masivo','Email campaigns'),'correo');
  // Round 6D: email campaigns now exist in simulation mode (nothing is sent; only consenting contacts).
  await expect(page.locator('[data-company-marketing]')).toHaveAttribute('data-company-marketing','mock',{timeout:45000});await expect(page.locator('[data-company-marketing] [data-simulated]').first()).toBeVisible();
  await goView(page,en,tr('Formulario de contacto','Contact form'),'formulario');
  await expect(page.locator('[data-company-contact-form]').getByRole('link',{name:tr('Ver el formulario en mi perfil','See the form on my profile')})).toHaveAttribute('href',(en?'/en':'')+'/profesionales/'+(await db.from('professionals').select('slug').eq('profile_id',owner.id).single().throwOnError()).data!.slug);// assign_business_profile_slug (migration 256) derives the slug from the business name
  await expectNoHorizontalOverflow(page);await shot(page,info,'contact-form-'+language);
  // Overview entry exists in the independent Pro space.
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_tools`);await page.locator('[data-pro-tools]').getByRole('button',{name:tr('Centro de empresa','Company hub'),exact:true}).click();await expect(page.locator('[data-company-hub="contactos"]')).toBeVisible({timeout:45000});
  // An unknown section in the link falls back to Contacts (marked as current), never to an empty view.
  await openHub(page,language,'contactos',{empresa:'no-existe'});
  if(desktop(page))await expect(page.getByRole('navigation',{name:tr('Secciones de Empresa','Company sections'),exact:true}).getByRole('button',{name:tr('Clientes','Customers'),exact:true})).toHaveAttribute('aria-current','page');
  else await expect(page.getByLabel(tr('Sección de Empresa','Company section'),{exact:true})).toHaveValue('contactos');
  // Let the contacts list finish loading before leaving (WebKit reports fetches cut by navigation as page errors).
  await expect(page.getByText('Condominio Las Palmas · Condominios',{exact:false}).filter({visible:true})).toBeVisible({timeout:45000});
  // The hub lives only in the independent Pro space, not in My panel.
  await gotoOK(page,`/${language}/dashboard/profesional?tab=pro_tools`);await expect(page.locator('[data-pro-tools]').filter({visible:true})).toHaveCount(1,{timeout:45000});
  await expect(page.getByRole('button',{name:tr('Centro de empresa','Company hub'),exact:true})).toHaveCount(0);await page.waitForLoadState('networkidle').catch(()=>{});
  await gotoOK(page,`/${language}/dashboard/profesional?tab=pro_company&empresa=proveedores`);await expect(page.locator('main').first()).toBeVisible({timeout:45000});await page.waitForLoadState('networkidle').catch(()=>{});await expect(page.locator('[data-company-hub]')).toHaveCount(0);
  expect(runtime()).toEqual([]);
 }finally{await other?.close();await anonymous?.close();await cleanupDisposableAccount(owner);await cleanupDisposableAccount(rival);await cleanupDisposableAccount(plain);}
});
