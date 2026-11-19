import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,waitForInteractivePage} from './helpers';

for(const language of ['es','en'] as const)test(`notifications match shared controls and preserve data on deletion error [${language}]`,async({page,baseURL},testInfo)=>{
 test.skip((page.viewportSize()?.width ?? 1366)>=1024,'Mobile header contract; desktop brand covered separately.');
 test.setTimeout(150000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'pro-home-summary'}),db=regressionAdminClient();
 try{
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'redes_internet',business_name:'Resumen local',slug:'home-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-al',verification_status:'pending',is_banned:false}).throwOnError();
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true}})).error).toBeNull();
  const day=crTodayISO(),document=emptyBusiness();document.clients=[{id:'home-client',name:'Cliente del resumen',email:'',phone:'',notes:'Conservar',archived:false}];document.work=[{id:'home-work',clientId:'home-client',client:'Cliente del resumen',service:'Servicio de hoy',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T10:00:00-06:00',cancelled:false}];await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await page.context().addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
  const row=await db.from('notifications').insert({user_id:owner.id,type:'new_project',title:'Nuevo proyecto',message:'Aviso local de revisión',data:{push_suppressed:true,project_title:'Aviso local de revisión',category_id:'desarrollo_web',link:'/proyectos'},read:false}).select('id').single();expect(row.error).toBeNull();
  await gotoOK(page,`/${language}/notificaciones`);
  // gotoOK accepts the streamed loading shell; exercise read/delete controls
  // only after the shared client layout has hydrated.
  await waitForInteractivePage(page);
  const list=page.locator('.ccr-notifications-list');
  await expect(list).toContainText('Aviso local de revisión');
  await page.getByRole('button',{name:language==='en'?'Notification options':'Opciones de notificaciones',exact:true}).click();
  await page.getByRole('menuitem',{name:language==='en'?'Delete all':'Eliminar todas',exact:true}).click();
  const dialog=page.getByRole('alertdialog');await expect(dialog).toBeVisible();
  await page.route('**/rest/v1/notifications?**',route=>route.request().method()==='DELETE'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Local simulated failure'})}):route.continue());
  await dialog.getByRole('button',{name:language==='en'?'Delete all':'Eliminar todas',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText(language==='en'?'could not be deleted':'No se pudieron eliminar');
  expect((await db.from('notifications').select('id').eq('id',row.data!.id).single()).data?.id).toBe(row.data!.id);
  await dialog.getByRole('button',{name:language==='en'?'Cancel':'Cancelar',exact:true}).click();
  await expect(list).toContainText('Aviso local de revisión');
  await page.screenshot({path:testInfo.outputPath('notifications-'+language+'.png')});
  expect((await db.from('pro_workspaces').select('document,revision').eq('user_id',owner.id).single().throwOnError()).data).toEqual({document,revision:1});

 }finally{await page.goto('about:blank');await cleanupDisposableAccount(owner);}
});
