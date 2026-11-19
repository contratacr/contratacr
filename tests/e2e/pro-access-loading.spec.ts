import {test,expect} from 'playwright/test';
import {writeFile} from 'node:fs/promises';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

for(const locale of ['es','en'] as const)test(`Tools keep their title and localized loading before access resolves [${locale}]`,async({page,baseURL},testInfo)=>{
 test.setTimeout(180000);expect(baseURL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):3185\/?$/);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const diagnostic=process.env.PRO_NAV_DIAGNOSTIC==='1',navigation:unknown[]=[];
 const safeURL=(value:string)=>{try{const url=new URL(value,baseURL);return url.pathname+url.search;}catch{return 'invalid';}};
 if(diagnostic){
  page.on('console',message=>{if(message.text().startsWith('[pro-nav-diagnostic]')){try{navigation.push(JSON.parse(message.text().slice('[pro-nav-diagnostic]'.length)));}catch{navigation.push({kind:'diagnostic-message-unparsed'});}}});
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigation.push({kind:'mainframe',at:Date.now(),url:safeURL(frame.url())});});
  page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())navigation.push({kind:'document-request',at:Date.now(),url:safeURL(request.url()),redirectedFrom:request.redirectedFrom()?safeURL(request.redirectedFrom()!.url()):null});});
  await page.addInitScript(()=>{
   const uri=(value?:string|URL|null)=>{try{const u=new URL(value===undefined||value===null?location.href:String(value),location.href);return u.pathname+u.search;}catch{return 'invalid';}};
   const record=(kind:string,extra:Record<string,unknown>={})=>console.debug('[pro-nav-diagnostic]'+JSON.stringify({kind,at:Date.now(),url:uri(),...extra}));
   for(const method of ['pushState','replaceState'] as const){const original=history[method];history[method]=function(this:History,data:unknown,unused:string,url?:string|URL|null){record('history-'+method,{target:uri(url),stack:new Error('navigation trace').stack});return original.call(this,data,unused,url);};}
   for(const name of ['pageshow','pagehide','beforeunload','popstate','hashchange','load'])window.addEventListener(name,()=>record(name));record('init');
  });
 }
 const owner=await createDisposableAccount({prefix:'pro-loading-review'}),db=regressionAdminClient(),document=emptyBusiness();let release=()=>{};
 try{
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,role:'professional',is_provider:true}})).error).toBeNull();
  await db.from('profiles').update({role:'professional',is_provider:true}).eq('id',owner.id).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Carga local',slug:'loading-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await page.context().addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
  await page.context().addCookies([{name:'NEXT_LOCALE',value:locale,url:baseURL!}]);
  // Dev-only: suppress clean HMR reloads that interrupt page.goto in WebKit.
  await stabilizeLocalProRuntime(page.context(),baseURL!);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(endpoint)).status()).toBe(200);
  let pending=Promise.resolve(),accessRequests=0;await page.route('**/api/pro/access',async route=>{accessRequests++;await pending;await route.continue();});
  const cases=locale==='en'?[['pro_tools','Tools','Customers'],['pro_inventory','Products and services','New product or service'],['pro_clients','Customers','New customer'],['pro_agenda','Appointments','New appointment'],['pro_expenses','Expenses','New expense']]:[['pro_tools','Herramientas','Clientes'],['pro_inventory','Productos y servicios','Nuevo producto o servicio'],['pro_clients','Clientes','Nuevo cliente'],['pro_agenda','Citas','Nueva cita'],['pro_expenses','Gastos','Nuevo gasto']];
  for(const [tab,title,button] of cases){
   pending=new Promise<void>(resolve=>{release=resolve;});
   const before=accessRequests;
   if(diagnostic)navigation.push({kind:'test-goto-start',at:Date.now(),tab});await page.goto('/'+locale+'/dashboard/profesional?tab='+tab);if(diagnostic)navigation.push({kind:'test-goto-end',at:Date.now(),tab,url:safeURL(page.url())});await expect.poll(()=>accessRequests).toBeGreaterThan(before);
   // The navbar section title is lg:hidden; desktop titles the section with the card <h2>.
   const heading=((page.viewportSize()?.width??0)<1024?page.locator('[data-ccr-section-title]'):page.getByRole('heading',{level:2,name:title,exact:true})).filter({visible:true}),placeholder=page.locator('[data-pro-access-placeholder]');
   await expect(heading).toHaveText(title);await expect(placeholder.locator('[data-panel-loading]')).toBeVisible();
   await expect(page.getByRole('button',{name:button,exact:true})).toHaveCount(0);
   await expect(placeholder).not.toContainText('Comprobando acceso');
   await expect(placeholder.locator('[data-panel-loading]')).toHaveCSS('opacity','1');
   await page.screenshot({path:testInfo.outputPath('loading-'+locale+'-'+tab+'.png')});
   // Desktop adds the business side menu (same «Clientes» name) once access resolves: check the hub row itself.
   release();await expect((tab==='pro_tools'?page.locator('[data-pro-tools]'):page).getByRole('button',{name:button,exact:true})).toBeEnabled();if(diagnostic)navigation.push({kind:'test-ui-ready',at:Date.now(),tab,url:safeURL(page.url())});await expect(heading).toHaveText(title);await expect(placeholder).toHaveCount(0);
  }
  await page.unroute('**/api/pro/access');await page.route('**/api/pro/access',route=>route.fulfill({status:403,json:{error:'Se requiere Pro activo'}}));
  await page.goto('/'+locale+'/dashboard/profesional?tab=pro_tools');await expect(page.locator('[data-pro-access-placeholder]')).toHaveText(locale==='en'?"These tools aren't available for this account.":'Estas herramientas no están disponibles para esta cuenta.');await expect(page.locator('[data-pro-tools]')).toHaveCount(0);await expect(page.locator('[data-pro-workspace]')).toHaveCount(0);
  expect((await db.from('pro_workspaces').select('document,revision').eq('user_id',owner.id).single().throwOnError()).data).toEqual({document,revision:1});expect((await db.from('notifications').select('id').eq('user_id',owner.id).throwOnError()).data).toEqual([]);
 }finally{if(diagnostic){const path=testInfo.outputPath('navigation-chronology.json');await writeFile(path,JSON.stringify(navigation));await testInfo.attach('navigation-chronology',{path,contentType:'application/json'});}release();await page.goto('about:blank');await cleanupDisposableAccount(owner);}
});
