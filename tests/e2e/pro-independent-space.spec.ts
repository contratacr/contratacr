import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError,proSpaceBack,PRO_SPACE_HOME_URL,proGoToSection} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

for(const language of ['es','en'] as const)test(`Independent Pro entry, draft guard, exit and access [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(180000);expect(baseURL).toBe('http://127.0.0.1:3185');expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 await stabilizeLocalProRuntime(page.context(),baseURL!);
 const owner=await createDisposableAccount({prefix:'pro-space-entry'}),db=regressionAdminClient(),en=language==='en',prefix=en?'/en':'/es';
 const others:BrowserContext[]=[];
 try{
  const account=await db.auth.admin.getUserById(owner.id);
  expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();
  await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Empresa local Pro',slug:'independent-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  await db.from('pro_workspaces').insert({user_id:owner.id,document:emptyBusiness(),revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>page.context().addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})))}});
  expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(endpoint)).status()).toBe(200);
  const writes:string[]=[],errors:string[]=[];
  page.on('request',req=>{const path=new URL(req.url()).pathname;if(req.method()==='POST'&&(path.startsWith('/api/pro/')||path==='/api/quotes'))writes.push(path);});
  onAppPageError(page,message=>errors.push(message));
  await gotoOK(page,prefix+'/dashboard/profesional?tab=home');
  await page.getByTestId('panel-tab-pro_tools').filter({visible:true}).click();
  await expect(page).toHaveURL(/\/dashboard\/pro(?:\?|$)/);
  const space=page.locator('[data-independent-pro]');await expect(space).toBeVisible();
  await expect(page.locator('[data-testid^="panel-tab-"]')).toHaveCount(0);
  await expect(space.locator('header img[src="/brand/wordmark-light.svg"]')).toHaveCount(1);
  await space.locator('[data-pro-tools]').getByRole('button',{name:en?'Customers':'Clientes',exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard\/pro\?tab=pro_clients/);
  await page.getByRole('button',{name:en?'New customer':'Nuevo cliente',exact:true}).click();
  const form=page.getByRole('dialog',{name:en?'New customer':'Nuevo cliente',exact:true});
  await form.getByLabel(en?'Name':'Nombre',{exact:true}).fill('LOCAL UNSAVED PRO DRAFT');
  const path=page.url();
  // Leaving the section with a draft is guarded: Inicio in the Pro tab bar (phones) or the side menu (desktop).
  await proGoToSection(page,'pro_tools',en?'Tools overview':'Herramientas',{en,dispatch:true});
  await expect(page).toHaveURL(path);await expect(form).toBeVisible();await expect(form.getByRole('alert')).toContainText(en?'Save or cancel':'Guarde o cancele');
  await form.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();
  const discard=page.getByRole('dialog').last().getByRole('button',{name:en?'Discard changes':'Descartar cambios',exact:true});await expect(discard).toBeVisible();await discard.click();await expect(form).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({path:info.outputPath('independent-pro-'+language+'.png'),fullPage:false});
  await proSpaceBack(page,en);await expect(page).toHaveURL(PRO_SPACE_HOME_URL);await expect(space.locator('[data-pro-space-back]')).toHaveText(en?'Back to My panel':'Volver a Mi panel');
  await proSpaceBack(page,en);
  await expect(page).toHaveURL(/\/dashboard\/profesional\?tab=home/);await expect(space).toHaveCount(0);
  expect(writes).toEqual([]);expect(errors).toEqual([]);
  // Server-side access, including a preserved post-login destination.
  const anon=await browser.newContext({baseURL});others.push(anon);const anonymousPage=await anon.newPage();
  await anonymousPage.goto(prefix+'/dashboard/pro?tab=pro_clients');await expect(anonymousPage).toHaveURL(/\/login\?redirect=/);
  expect(new URL(anonymousPage.url()).searchParams.get('redirect')).toContain('/dashboard/pro?tab=pro_clients');
  await db.from('pro_memberships').update({status:'inactive'}).eq('user_id',owner.id).throwOnError();
  const denied=await page.request.get(prefix+'/dashboard/pro');expect(await denied.text()).not.toContain('data-independent-pro');await page.goto(prefix+'/dashboard/pro');await expect(page).not.toHaveURL(/\/dashboard\/pro$/);await expect(space).toHaveCount(0);
  await db.from('pro_memberships').update({status:'active'}).eq('user_id',owner.id).throwOnError();
  await db.from('profiles').update({is_disabled:true}).eq('id',owner.id).throwOnError();
  const disabled=await page.request.get(prefix+'/dashboard/pro');expect(await disabled.text()).not.toContain('data-independent-pro');await page.goto(prefix+'/dashboard/pro');await expect(page).not.toHaveURL(/\/dashboard\/pro$/);await expect(space).toHaveCount(0);
 }finally{await page.goto('about:blank').catch(()=>{});await Promise.all(others.map(context=>context.close()));await cleanupDisposableAccount(owner);}
});
