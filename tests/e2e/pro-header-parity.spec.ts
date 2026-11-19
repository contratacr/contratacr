import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK} from './helpers';

for(const language of ['es','en'] as const)test(`mobile panel keeps root notifications and internal back navigation [${language}]`,async({page,baseURL},testInfo)=>{
 test.skip((page.viewportSize()?.width ?? 1366)>=1024,'Mobile header contract; desktop brand covered separately.');
 test.setTimeout(150000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'pro-home-summary'}),db=regressionAdminClient();
 try{
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'redes_internet',business_name:'Resumen local',slug:'home-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-al',verification_status:'pending',is_banned:false}).throwOnError();
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  const day=crTodayISO(),document=emptyBusiness();document.clients=[{id:'home-client',name:'Cliente del resumen',email:'',phone:'',notes:'Conservar',archived:false}];document.work=[{id:'home-work',clientId:'home-client',client:'Cliente del resumen',service:'Servicio de hoy',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T10:00:00-06:00',cancelled:false}];await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await page.context().addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
  // Section actions are portaled into the same header slot (data-pro-section-actions-slot);
  // the parity contract is about the bell itself, so match it by name.
  const bell=page.locator('header .ccr-cabecera-acciones-web').getByRole('button',{name:language==='en'?'Notifications':'Notificaciones',exact:true});
  for(const tab of ['home','pro_agenda','quotes','pro_clients','pro_tools','pro_inventory','pro_expenses','pro_payments','statistics','appointments','profile','home']) {
   await gotoOK(page,`/${language}/dashboard/profesional?tab=${tab}${tab==='home'?'&mode=offer':''}`);
   const title=page.locator('[data-ccr-section-title]').filter({visible:true});
   await expect(title).toHaveCount(1);
   await expect(title).toHaveCSS('font-size','19px');
   if(tab==='home') {
    await expect(page.getByTestId('panel-tab-pro_tools').filter({visible:true})).toBeVisible();
    await expect(bell).toHaveCount(1);
    await expect(page.locator('[data-dashboard-identity-card]')).toBeVisible();
    await expect(page.locator('[data-pro-day]')).toHaveCount(0);
    await expect(page.locator('[data-ccr-section-brand]').filter({visible:true})).toHaveCount(1);
   } else {
    await expect(bell).toHaveCount(0);
    await expect(page.locator('[data-ccr-section-back]').filter({visible:true})).toHaveCount(1);
   }
   if(tab==='quotes') await expect(page.locator('[data-pro-sales-workspace]')).toBeVisible();
   if(tab==='pro_agenda') await expect(page.locator('[data-appointment-inbox]')).toBeVisible();
   if(tab==='quotes') await expect(page.getByRole('button',{name:language==='en'?'New quote':'Nueva cotización',exact:true})).toBeEnabled();
   if(tab==='pro_agenda') {
    await expect(page.getByRole('button',{name:language==='en'?'New appointment':'Nueva cita',exact:true})).toBeEnabled();
    await expect(page.locator('[data-appointment-inbox]')).not.toContainText(language==='en'?'Loading appointments':'Cargando citas');
   }
   if(['home','quotes','pro_agenda'].includes(tab)) await page.screenshot({path:testInfo.outputPath(`header-${language}-${tab}.png`)});
  }
  expect((await db.from('pro_workspaces').select('document,revision').eq('user_id',owner.id).single().throwOnError()).data).toEqual({document,revision:1});
  expect((await db.from('notifications').select('id').eq('user_id',owner.id).throwOnError()).data).toEqual([]);
 }finally{await page.goto('about:blank');await cleanupDisposableAccount(owner);}
});
