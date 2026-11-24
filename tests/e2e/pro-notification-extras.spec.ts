import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

const origin='http://127.0.0.1:3185';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}async function makePro(db:ReturnType<typeof regressionAdminClient>,owner:DisposableAccount){const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();}

// Area A: daily digest and push columns of the per-event notification matrix.
const api='/api/pro/notification-extras';
for(const language of ['es','en'] as const)test(`Notification matrix: digest and push per event [${language}]`,async({page,baseURL,browser},info)=>{
 test.setTimeout(240000);local(baseURL);const en=language==='en',tr=(es:string,english:string)=>en?english:es,db=regressionAdminClient();
 const owner=await createDisposableAccount({prefix:'nmatrix-owner'});
 try{
  await makePro(db,owner);await db.from('pro_workspaces').insert({user_id:owner.id,document:emptyBusiness(),revision:1}).throwOnError();
  await login(page.context(),owner);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  const post=(data:Record<string,unknown>)=>page.request.post(origin+api,{headers:{Origin:origin},data});
  const first=await page.request.get(origin+api);expect(first.status(),await first.text()).toBe(200);
  const initial=await first.json();expect(initial).toMatchObject({revision:0,delivery:'stored_not_sent'});expect(initial.digest.task_due).toBe(false);expect(initial.push.client_message).toBe(false);
  expect((await post({revision:0,digest:{task_due:true},push:{client_message:true}})).status()).toBe(200);
  const saved=await (await page.request.get(origin+api)).json();expect(saved).toMatchObject({revision:1,digest:{task_due:true,quote_accepted:false},push:{client_message:true,task_due:false}});
  expect((await post({revision:0,digest:{},push:{}})).status()).toBe(409);
  expect((await post({revision:1,digest:{no_existe:true},push:{}})).status()).toBe(400);
  expect((await post({revision:1,digest:{task_due:'si'},push:{}})).status()).toBe(400);
  expect((await post({revision:1,digest:{},push:{},extra:1})).status()).toBe(400);
  expect((await page.request.get(origin+api+'?x=1')).status()).toBe(400);
  const anonymous=await browser.newContext({baseURL:origin});expect((await anonymous.request.get(origin+api)).status()).toBe(401);await anonymous.close();
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_notifications`);
  const prefs=page.locator('[data-notification-settings]');await expect(prefs).toBeVisible({timeout:60000});
  await expect(prefs.locator('[data-notification-digest="task_due"]')).toBeChecked();await expect(prefs.locator('[data-notification-push="client_message"]')).toBeChecked();await expect(prefs.locator('[data-notification-digest="client_message"]')).not.toBeChecked();
  await expect(prefs).toContainText(tr('Resumen diario','Daily digest'));
  await prefs.locator('[data-notification-digest="client_message"]').check();await prefs.locator('[data-notification-push="task_due"]').check();
  await prefs.getByRole('button',{name:tr('Guardar preferencias','Save preferences')}).click();
  await expect(prefs.getByText(tr('Preferencias guardadas.','Preferences saved.'))).toBeVisible({timeout:60000});
  const after=await (await page.request.get(origin+api)).json();expect(after).toMatchObject({revision:2,digest:{client_message:true,task_due:true},push:{task_due:true,client_message:true}});
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`notification-matrix-${language}.png`),fullPage:true});
 }finally{await cleanupDisposableAccount(owner);}
});
