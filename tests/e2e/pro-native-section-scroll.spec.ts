import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,PRO_SPACE_HOME_URL,proSpaceUrl,proSpaceBack} from './helpers';

for(const language of ['es','en'] as const)test(`native shell sections open at top and keep app navigation [${language}]`,async({page,baseURL},testInfo)=>{
 test.skip((page.viewportSize()?.width ?? 1366)>=1024,'Mobile header contract; desktop brand covered separately.');
 test.setTimeout(180000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 // A compact phone viewport makes Tools genuinely scrollable before activation.
 await page.setViewportSize({width:page.viewportSize()!.width,height:640});
 await page.addInitScript(()=>{
  localStorage.setItem('ccr:native-first-run-onboarding:v12','1');
  const runtime:Record<string,unknown>={isNativePlatform:()=>true};
  Object.defineProperty(window,'Capacitor',{configurable:true,get:()=>runtime,set:value=>{if(value&&typeof value==='object')Object.assign(runtime,value);runtime.isNativePlatform=()=>true;}});
 });
 const owner=await createDisposableAccount({prefix:'pro-home-summary'}),db=regressionAdminClient();
 try{
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'redes_internet',business_name:'Resumen local',slug:'home-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-al',verification_status:'pending',is_banned:false}).throwOnError();
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  const day=crTodayISO(),workspaceDocument=emptyBusiness();workspaceDocument.clients=[{id:'home-client',name:'Cliente del resumen',email:'',phone:'',notes:'Conservar',archived:false}];workspaceDocument.work=[{id:'home-work',clientId:'home-client',client:'Cliente del resumen',service:'Servicio de hoy',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T10:00:00-06:00',cancelled:false}];await db.from('pro_workspaces').insert({user_id:owner.id,document:workspaceDocument,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await page.context().addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
  for(const tab of ['pro_tools','jobs','offers','profile','sent_projects','pro_agenda','quotes','pro_clients','pro_inventory','pro_expenses','pro_payments','statistics']) {
   await gotoOK(page,`/${language}/dashboard/profesional?tab=home&mode=offer`);
   await expect(page.getByTestId('panel-tab-pro_tools').filter({visible:true})).toBeVisible();
   await expect(page.locator('nav.ccr-native-bottom-nav')).toBeVisible();
   await expect(page.locator('header .ccr-cabecera-acciones-web').getByRole('button').filter({visible:true})).toHaveCount(0);
   const nested=['quotes','pro_clients','pro_inventory','pro_expenses','pro_payments','statistics'].includes(tab);
   if(nested)await page.getByTestId('panel-tab-pro_tools').filter({visible:true}).click();
   const link=nested?page.locator('[data-pro-tools]').getByRole('button',{name:({quotes:language==='en'?'Quotes':'Cotizaciones',pro_clients:language==='en'?'Customers':'Clientes',pro_inventory:language==='en'?'Products and services':'Productos y servicios',pro_expenses:language==='en'?'Expenses':'Gastos',pro_payments:language==='en'?'Payments':'Pagos',statistics:language==='en'?'Statistics':'Estadísticas'} as Record<string,string>)[tab],exact:true}):page.getByTestId('panel-tab-'+tab).filter({visible:true});
   await expect(link).toBeVisible();
   await page.evaluate(()=>{window.dispatchEvent(new Event('touchmove'));window.scrollTo({top:750,behavior:'instant'});document.querySelector('main')?.scrollTo({top:750,behavior:'instant'});});
   await expect.poll(()=>page.evaluate(()=>Math.max(window.scrollY,document.querySelector('main')?.scrollTop??0))).toBeGreaterThan(0);
   // Activate while scrolled; pointer click would first scroll the link into view.
   await link.dispatchEvent('click');
   // ContrataCR Pro opens the independent space (/dashboard/pro, own header): its
   // sections live at /dashboard/pro?tab=… and go back with «Volver»/«Volver a Mi panel».
   // The native bottom bar and empty header actions stay asserted on Mi panel above.
   const independent=tab==='pro_tools'||nested;
   await expect(page).toHaveURL(tab==='pro_tools'?PRO_SPACE_HOME_URL:nested?proSpaceUrl(tab):new RegExp('tab='+tab+'(?:&|$)'));
   await expect.poll(()=>page.evaluate(()=>Math.max(window.scrollY,window.document.querySelector('main')?.scrollTop??0))).toBeLessThanOrEqual(1);
   if(independent)await proSpaceBack(page,language==='en');else{await expect(page.locator('[data-ccr-section-back]').filter({visible:true})).toBeVisible();await page.locator('[data-ccr-section-back]').filter({visible:true}).click();}
   await expect(page).toHaveURL(nested?PRO_SPACE_HOME_URL:/tab=home(?:&|$)/);
   await expect.poll(()=>page.evaluate(()=>Math.max(window.scrollY,document.querySelector('main')?.scrollTop??0))).toBeLessThanOrEqual(1);
  }
  await page.screenshot({path:testInfo.outputPath('panel-after-return-'+language+'.png')});
  expect((await db.from('pro_workspaces').select('document,revision').eq('user_id',owner.id).single().throwOnError()).data).toEqual({document:workspaceDocument,revision:1});
  expect((await db.from('notifications').select('id').eq('user_id',owner.id).throwOnError()).data).toEqual([]);
 }finally{await page.goto('about:blank');await cleanupDisposableAccount(owner);}
});
