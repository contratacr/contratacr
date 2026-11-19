import {test,expect,type Request} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {collectPageErrors} from './helpers';

for(const language of ['es','en'] as const)test(`Project reads cancel safely on navigation and retain real failures [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(120000);expect(baseURL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):3185\/?$/);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const actor=await createDisposableAccount({prefix:'project-read-lifecycle'}),db=regressionAdminClient(),prefix=language==='en'?'/en':'',cacheErrors:string[]=[],writes:string[]=[],pending=new Set<Request>();const releases:Array<()=>void>=[],release=()=>{for(const finish of releases.splice(0))finish();};let projectId='',bodyError:unknown,mode:'normal'|'hold'|'fail'='normal',held=0,aborted=0;
 const isProjects=(request:Request)=>request.method()==='GET'&&new URL(request.url()).pathname==='/api/projects'&&new URL(request.url()).searchParams.get('role')==='client';
 const pageErrors=collectPageErrors(page);page.on('console',message=>{if(message.type()==='error'&&message.text().startsWith('[cached-resource]'))cacheErrors.push(message.text());});
 page.on('request',request=>{if(isProjects(request))pending.add(request);if(['POST','PUT','PATCH','DELETE'].includes(request.method())&&new URL(request.url()).pathname==='/api/projects')writes.push(request.method());});page.on('requestfinished',request=>pending.delete(request));page.on('requestfailed',request=>{pending.delete(request);if(isProjects(request))aborted++;});
 const key='ccr:dashboard-cache:dashboard:client-projects:'+actor.id;
 const cached=()=>page.evaluate(storageKey=>JSON.parse(sessionStorage.getItem(storageKey)||'null')?.data,key);
 try{
  const project=(await db.from('projects').insert({client_id:actor.id,title:'Preserved pending read',description:'Navigation must not change this project.',category_id:'redes_internet',provincia_id:'al',canton_id:'al-al',status:'open',allow_direct_contact:true,allow_phone_contact:false}).select('*').single().throwOnError()).data!;projectId=project.id;
  await db.from('notification_once_receipts').insert({user_id:actor.id,type:'resena_google',status:'historical_unknown',sent_at:null}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>page.context().addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL!,sameSite:'Lax' as const})))}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();
  await page.route('**/api/projects?role=client',async route=>{
   if(mode==='fail')return route.abort('failed');if(mode!=='hold')return route.continue();
   const response=await route.fetch();expect(response.status()).toBe(200);held++;const blocked=new Promise<void>(resolve=>{releases.push(resolve);});await blocked;
   if(route.request().failure())return;await route.fulfill({response});
  });
  await page.goto(prefix+'/dashboard/profesional?tab=sent_projects');await expect(page.getByRole('heading',{name:project.title,exact:true})).toBeVisible();await expect.poll(()=>pending.size).toBe(0);const baseline=await cached();expect(baseline).toEqual([expect.objectContaining({id:projectId})]);
  mode='hold';await page.evaluate(()=>window.dispatchEvent(new Event('notificationsChanged')));await expect.poll(()=>held).toBeGreaterThan(0);expect(pending.size).toBeGreaterThan(0);
  // Full navigation cancels the browser request while its server result is held.
  mode='normal';await page.goto(prefix+'/dashboard/profesional?tab=profile');release();await expect(page).toHaveURL(/tab=profile/);await expect.poll(()=>pending.size).toBe(0);await expect.poll(()=>aborted).toBeGreaterThan(0);
  expect(await cached()).toEqual(baseline);expect(cacheErrors).toEqual([]);expect(pageErrors()).toEqual([]);
  // Reload is another document departure and must preserve the same cache.
  await page.goto(prefix+'/dashboard/profesional?tab=sent_projects');await expect(page.getByRole('heading',{name:project.title,exact:true})).toBeVisible();await expect.poll(()=>pending.size).toBe(0);
  const heldBeforeReload=held,abortedBeforeReload=aborted;mode='hold';await page.evaluate(()=>window.dispatchEvent(new Event('notificationsChanged')));await expect.poll(()=>held).toBeGreaterThan(heldBeforeReload);mode='normal';await page.reload();release();await expect(page.getByRole('heading',{name:project.title,exact:true})).toBeVisible();await expect.poll(()=>pending.size).toBe(0);await expect.poll(()=>aborted).toBeGreaterThan(abortedBeforeReload);expect(await cached()).toEqual(baseline);expect(cacheErrors).toEqual([]);expect(pageErrors()).toEqual([]);
  // A cancelled browser departure leaves this same document usable. No
  // persistent leaving flag may block the next deliberate refresh.
  const heldBeforeCancelledLeave=held;mode='hold';await page.evaluate(()=>window.dispatchEvent(new Event('notificationsChanged')));await expect.poll(()=>held).toBeGreaterThan(heldBeforeCancelledLeave);mode='normal';await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload')));release();await expect.poll(()=>pending.size).toBe(0);await expect(page).toHaveURL(/tab=sent_projects/);expect(cacheErrors).toEqual([]);expect(pageErrors()).toEqual([]);
  const resumed=page.waitForResponse(response=>isProjects(response.request())&&response.status()===200);await page.evaluate(()=>window.dispatchEvent(new Event('notificationsChanged')));const resumedResponse=await resumed;await resumedResponse.finished();await expect.poll(()=>pending.size).toBe(0);expect(await cached()).toEqual(baseline);
  // Returning can fetch normally. A true failure while the page is active
  // must still be reported and must preserve the previous cached data.
  await page.goto(prefix+'/dashboard/profesional?tab=sent_projects');await expect(page.getByRole('heading',{name:project.title,exact:true})).toBeVisible();await expect.poll(()=>pending.size).toBe(0);mode='fail';await page.evaluate(()=>window.dispatchEvent(new Event('notificationsChanged')));await expect.poll(()=>cacheErrors.length).toBeGreaterThan(0);expect(await cached()).toEqual(baseline);expect(pageErrors()).toEqual([]);mode='normal';
  expect((await db.from('projects').select('*').eq('id',projectId).single().throwOnError()).data).toEqual(project);expect(writes).toEqual([]);await page.screenshot({path:info.outputPath('project-read-lifecycle-'+language+'.png'),fullPage:true});
 }catch(error){bodyError=error;await page.screenshot({path:info.outputPath('failure-before-cleanup.png'),fullPage:true}).catch(()=>{});throw error;}finally{release();await page.goto('about:blank').catch(()=>{});try{if(projectId)await db.from('projects').delete().eq('id',projectId).throwOnError();await cleanupDisposableAccount(actor);}catch(cleanupError){throw new AggregateError(bodyError?[bodyError,cleanupError]:[cleanupError],'Project read fixture cleanup failed',{cause:bodyError});}}
});
