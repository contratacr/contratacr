import { test, expect, chromium } from 'playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createDisposableAccount, cleanupDisposableAccount } from '../e2e/disposable-account';
import { regressionAdminClient } from '../e2e/seed';
import { getFirebaseMessaging } from '@/lib/push/firebase-admin';
import { buildFcmMulticastPayload } from '@/lib/push/payload';
import { NATIVE_ONBOARDING_COMPLETED_KEY } from '@/lib/mobile-onboarding';
const adb=process.env.E2E_ADB_PATH ?? `${process.env.ANDROID_HOME}/platform-tools/adb`;
test('native Android FCM foreground, background and closed task',async()=>{
 test.setTimeout(180000);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const account=await createDisposableAccount({prefix:'android-push-audit'});
 const db=regressionAdminClient();
 const browser=await chromium.connectOverCDP(process.env.E2E_ANDROID_CDP_URL ?? 'http://127.0.0.1:9224');
 const page=browser.contexts()[0].pages()[0];
 const results:unknown[]=[];
 try{
  await page.addInitScript(key=>localStorage.setItem(key,'1'),NATIVE_ONBOARDING_COMPLETED_KEY);
  await page.context().clearCookies();
  await page.goto(`${process.env.E2E_ANDROID_APP_URL ?? 'http://localhost:3000'}/login`);
  const portada=page.locator('.ccr-login-portada');
  if(await portada.isVisible())await portada.getByRole('button',{name:/Inicia sesión|Log in/i}).first().click();
  await page.locator('main input[type=email]').fill(account.email);
  await page.locator('main input[type=password]').fill(account.password);
  await page.locator('main').getByRole('button',{name:/Ingresar|Sign in/i}).first().click();
  await page.waitForURL(/dashboard\/profesional/);
  let token='';
  await expect.poll(async()=>{const r=await db.from('user_push_tokens').select('token').eq('user_id',account.id).eq('platform','android').eq('is_active',true).order('last_seen_at',{ascending:false}).limit(1);token=r.data?.[0]?.token??'';return !!token;},{timeout:30000}).toBe(true);
  for(const phase of ['foreground','background','closed']){
   if(phase==='background')execFileSync(adb,['shell','input','keyevent','KEYCODE_HOME']);
   if(phase==='closed') {
    const stacks=execFileSync(adb,['shell','am','stack','list'],{encoding:'utf8'}).split(/\n\n/);
    const appStack=stacks.find(stack=>stack.includes('com.contratacr.app/.MainActivity')||stack.includes('com.contratacr.app/com.contratacr.app.MainActivity'));
    const taskId=appStack?.match(/RootTask id=(\d+)/)?.[1];
    expect(taskId).toBeTruthy();
    execFileSync(adb,['shell','am','stack','remove',taskId!]);
    await expect.poll(()=>execFileSync(adb,['shell','am','stack','list'],{encoding:'utf8'}).includes('com.contratacr.app'),{timeout:10000}).toBe(false);
   }
   const title=`ContrataCR QA ${account.id.slice(0,8)} ${phase}`;
   const r=await getFirebaseMessaging().sendEachForMulticast(buildFcmMulticastPayload({tokens:[token],title,body:'Prueba local de entrega',data:{link:'/notificaciones'},notificationId:`local-qa-${account.id}-${phase}`}));
   expect(r.successCount).toBe(1);
   await expect.poll(()=>execFileSync(adb,['shell','dumpsys','notification','--noredact'],{encoding:'utf8'}).includes(title),{timeout:30000}).toBe(true);
   results.push({phase,firebaseAccepted:true,androidNotificationPosted:true});
  }
  writeFileSync(process.env.E2E_ANDROID_PUSH_RESULTS ?? '/tmp/push-android-results.json',JSON.stringify(results,null,2));
 }finally{await cleanupDisposableAccount(account);await browser.close().catch(()=>{});}
});
