import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {readFileSync} from 'node:fs';

// Row 73 (web/PWA only): installable Pro space, offline fallback and responsive shell. Store apps (iOS/Android binaries,
// native push, device capabilities) are excluded from this row.
test('Pro web app: manifest, service worker, offline fallback and responsive shell',async({page,baseURL})=>{
 test.setTimeout(240000);expect(baseURL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):3185\/?$/);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 // Manifest (public, no account data), both languages.
 for(const lang of ['es','en']){
  const r=await page.request.get('/api/pro/app-manifest?lang='+lang);expect(r.status()).toBe(200);expect(r.headers()['content-type']).toContain('application/manifest+json');
  const m=await r.json();expect(m).toMatchObject({name:'ContrataCR Pro',display:'standalone',scope:'/',lang:lang==='en'?'en':'es-CR'});
  expect(m.start_url).toBe((lang==='en'?'/en':'')+'/dashboard/pro');expect(m.icons.length).toBeGreaterThanOrEqual(2);
  expect(m.shortcuts.map((s:{url:string})=>new URL(s.url,'http://x').searchParams.get('tab'))).toEqual(['pro_projects','pro_tasks','pro_agenda','pro_clients']);
  expect(JSON.stringify(m)).not.toMatch(/user|email|token/i);
 }
 // Static pieces: the worker caches only the offline page, never API data.
 const sw=readFileSync('public/pro-sw.js','utf8');expect(sw).toContain('/pro-offline.html');expect(sw).not.toMatch(/\/api\//);
 const offline=await page.request.get('/pro-offline.html');expect(offline.status()).toBe(200);const text=await offline.text();expect(text).toContain('Sin conexión');expect(text).toContain('You are offline');
 expect((await page.request.get('/pro-sw.js')).headers()['content-type']).toMatch(/javascript/);

 const actor=await createDisposableAccount({prefix:'pro-web-app'}),db=regressionAdminClient();
 try{
  const account=await db.auth.admin.getUserById(actor.id);expect((await db.auth.admin.updateUserById(actor.id,{user_metadata:{...account.data.user!.user_metadata,role:'professional',is_provider:true}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',actor.id).throwOnError();
  await db.from('professionals').insert({profile_id:actor.id,category_id:'desarrollo_web',business_name:'App web Pro local',slug:'webapp-'+actor.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  await db.from('pro_memberships').insert({user_id:actor.id,status:'active'}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await page.context().addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL!,sameSite:'Lax' as const})));}}});
  expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  for(const language of ['es','en']){
   // Responsive: phone, small phone, tablet, desktop. No horizontal scroll, header and section picker usable.
   for(const size of [{width:320,height:640},{width:390,height:844},{width:768,height:1024},{width:1366,height:900}]){
    await page.setViewportSize(size);
    await gotoOK(page,(language==='en'?'/en':'')+'/dashboard/pro?tab=pro_tasks');
    await expect(page.locator('[data-independent-pro]')).toBeVisible({timeout:60000});
    await expectNoHorizontalOverflow(page);
    if(size.width<1024)await expect(page.getByLabel(language==='en'?'Pro section':'Sección de Pro')).toBeVisible();
    const box=await page.locator('[data-independent-pro] header').boundingBox();expect(box!.width).toBeLessThanOrEqual(size.width+1);
   }
  }
  // Manifest link is switched to the Pro manifest while the space is open, and the worker registers.
  await page.setViewportSize({width:390,height:844});await gotoOK(page,'/dashboard/pro?tab=pro_agenda');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href',/\/api\/pro\/app-manifest\?lang=es/,{timeout:30000});
  const registered=await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration('/');return !!reg;});
  expect(registered).toBe(true);
  // Offline: the notice appears, reading what is open keeps working, and it disappears when the signal returns.
  await page.context().setOffline(true);await expect(page.locator('[data-pro-offline]')).toBeVisible({timeout:15000});await expectNoHorizontalOverflow(page);
  await page.context().setOffline(false);await expect(page.locator('[data-pro-offline]')).toHaveCount(0,{timeout:15000});
  // English copy of the notice.
  await gotoOK(page,'/en/dashboard/pro?tab=pro_agenda');await page.context().setOffline(true);await expect(page.locator('[data-pro-offline]')).toContainText('You are offline',{timeout:15000});await page.context().setOffline(false);
  expect(runtime.filter(m=>!/Failed to fetch|NetworkError|Load failed/i.test(m))).toEqual([]);
 }finally{await cleanupDisposableAccount(actor);}
});
