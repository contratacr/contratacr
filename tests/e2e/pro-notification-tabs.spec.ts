import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {commentEvents,notificationTabOf,inNotificationTab} from '../../src/lib/pro/notification-tabs';
import {notificationEvents} from '../../src/lib/pro/round9';

const origin='http://127.0.0.1:3185';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}async function makePro(db:ReturnType<typeof regressionAdminClient>,owner:DisposableAccount){const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();}

// Area A: notification tabs (General / Comments) and the Messages flyout of the Pro header.
test('notification tabs: every event belongs to exactly one tab',()=>{
 for(const event of notificationEvents){const tab=notificationTabOf(event);expect(['general','comments']).toContain(tab);expect(inNotificationTab(event,'all')).toBe(true);expect(inNotificationTab(event,tab)).toBe(true);expect(inNotificationTab(event,tab==='general'?'comments':'general')).toBe(false);}
 expect([...commentEvents].sort()).toEqual(['client_message','quote_changes','selection_decided']);
});
for(const language of ['es','en'] as const)test(`Notification tabs and Messages flyout [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(240000);local(baseURL);const en=language==='en',tr=(es:string,english:string)=>en?english:es,db=regressionAdminClient();
 const owner=await createDisposableAccount({prefix:'ntabs-owner'});
 try{
  await makePro(db,owner);await db.from('pro_workspaces').insert({user_id:owner.id,document:emptyBusiness(),revision:1}).throwOnError();
  await login(page.context(),owner);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  const item=(event:string,title:string,read:boolean)=>({id:crypto.randomUUID(),event,title,body:'',link:{tab:'pro_projects'},createdAt:new Date().toISOString(),read,emailDraft:false});
  const items=[item('client_message','Mensaje de Ana',false),item('task_due','Tarea vencida',false),item('quote_changes','Cambios pedidos',true),item('invoice_paid','Factura pagada',false)];
  await page.route(url=>url.pathname==='/api/pro/notifications',route=>{if(route.request().method()!=='GET')return route.continue();const view=new URL(route.request().url()).searchParams.get('view');
   if(view==='count')return route.fulfill({json:{unread:3}});return route.fulfill({json:{items,unread:3,hasMore:false,next:null,settings:{revision:0,dueSoonDays:2,overdueGraceDays:1,prefs:{}}}});});
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_notifications`);
  const center=page.locator('[data-notification-center]');await expect(center).toBeVisible({timeout:60000});
  await expect(center.locator('[data-notification]')).toHaveCount(4);
  await center.locator('[data-notification-tab="comments"]').click();await expect(center.locator('[data-notification]')).toHaveCount(2);await expect(center.locator('[data-notification="task_due"]')).toHaveCount(0);
  await expect(center.locator('[data-notification-tab="comments"] [data-notification-tab-count]')).toHaveText('1');
  await center.locator('[data-notification-tab="general"]').click();await expect(center.locator('[data-notification]')).toHaveCount(2);await expect(center.locator('[data-notification="client_message"]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  // Flyout in the header: only customer messages, with a link to the Comments tab.
  const mobile=(page.viewportSize()?.width??1366)<640;
  await page.locator('[data-pro-quick="messages"]').click();
  const flyout=page.locator('[data-messages-flyout]');await expect(flyout).toBeVisible();
  await expect(flyout.locator('[data-message-item]')).toHaveCount(2);await expect(flyout).toContainText('Mensaje de Ana');await expect(flyout).not.toContainText('Tarea vencida');
  if(!mobile)await expect(page.locator('[data-pro-quick="messages"]')).toContainText(tr('Mensajes','Messages'));
  await flyout.locator('[data-messages-all]').click();
  await expect(page).toHaveURL(/pestana=comments/);await expect(page.locator('[data-notification-tab="comments"]')).toHaveAttribute('aria-pressed','true',{timeout:30000});
  await page.screenshot({path:info.outputPath(`notification-tabs-${language}.png`)});
 }finally{await cleanupDisposableAccount(owner);}
});
