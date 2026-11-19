import {test,expect,type Request} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {regressionAdminClient} from './seed';
import {collectPageErrors,expectNoHorizontalOverflow} from './helpers';

for(const language of ['es','en'] as const)test(`Project deep links expand cached requests and preserve manual collapse [${language}]`,async({page,baseURL},info)=>{
 // WebKit dev HMR full reloads interrupted goto in the 11-nov run (category C).
 await stabilizeLocalProRuntime(page.context(),baseURL!);
 test.setTimeout(120000);expect(baseURL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):3185\/?$/);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const actor=await createDisposableAccount({prefix:'project-deeplink'}),db=regressionAdminClient(),prefix=language==='en'?'/en':'',ids:string[]=[],writes:string[]=[];let bodyError:unknown;
 const projectReads=new Set<Request>();page.on('request',request=>{if(request.method()==='GET'&&new URL(request.url()).pathname==='/api/projects')projectReads.add(request);});page.on('requestfinished',request=>projectReads.delete(request));page.on('requestfailed',request=>projectReads.delete(request));
 const pageErrors=collectPageErrors(page);page.on('request',request=>{const path=new URL(request.url()).pathname;if(['POST','PUT','PATCH','DELETE'].includes(request.method())&&(path==='/api/projects'||path==='/api/quotes'||path.startsWith('/api/pro/')))writes.push(request.method()+' '+path);});
 const card=(id:string)=>page.locator('#project-'+id),header=(id:string)=>card(id).locator(':scope > button[aria-expanded]');
 async function preserved(){const result:Record<string,unknown>={};for(const [table,column] of [['projects','client_id'],['pro_workspaces','user_id'],['pro_work','user_id'],['pro_client_entries','user_id'],['notifications','user_id']])result[table]=(await db.from(table).select('*').eq(column,actor.id).order(table==='pro_workspaces'?'user_id':'id').throwOnError()).data;return result;}
 try{
  for(const status of ['open','completed']){const project=(await db.from('projects').insert({client_id:actor.id,title:'Deep link '+status,description:'Preserve this request and its history.',category_id:'redes_internet',provincia_id:'al',canton_id:'al-al',status,allow_direct_contact:true,allow_phone_contact:false}).select('id').single().throwOnError()).data!;ids.push(project.id);}
  await db.from('notification_once_receipts').insert({user_id:actor.id,type:'resena_google',status:'historical_unknown',sent_at:null}).throwOnError();
  const baseline=await preserved(),auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>page.context().addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL!,sameSite:'Lax' as const})))}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();
  // Warm through the real list: the deep link must work even when data is
  // already available at mount, not only after a delayed network response.
  await page.goto(prefix+'/dashboard/profesional?tab=sent_projects');await expect(header(ids[0])).toHaveAttribute('aria-expanded','false');
  const key='ccr:dashboard-cache:dashboard:client-projects:'+actor.id;
  await expect.poll(()=>page.evaluate(storageKey=>JSON.parse(sessionStorage.getItem(storageKey)||'null')?.data?.map((row:{id:string})=>row.id).sort(),key)).toEqual([...ids].sort());
  const revalidated=page.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname==='/api/projects');
  await page.goto(prefix+'/dashboard/profesional?tab=sent_projects&project='+ids[1]);
  await expect(header(ids[1])).toHaveAttribute('aria-expanded','true');await expect(card(ids[0])).toHaveCount(0);await expect(card(ids[1])).toContainText('Preserve this request and its history.');
  // Finish arrival revalidation before a deliberate full reload; request
  // cancellation during navigation is a separate lifecycle contract.
  const arrival=await revalidated;expect(arrival.status()).toBe(200);await arrival.finished();await expect.poll(()=>projectReads.size).toBe(0);
  const reloadRead=page.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname==='/api/projects');
  await page.reload();await expect(header(ids[1])).toHaveAttribute('aria-expanded','true');
  const reloadResult=await reloadRead;expect(reloadResult.status()).toBe(200);await reloadResult.finished();await expect.poll(()=>projectReads.size).toBe(0);
  // A handled link must not undo the person's deliberate collapse on refresh.
  await header(ids[1]).click();await expect(header(ids[1])).toHaveAttribute('aria-expanded','false');
  const refreshed=page.waitForResponse(response=>{const url=new URL(response.url());return response.request().method()==='GET'&&url.pathname==='/api/projects'&&url.searchParams.get('role')==='client';});
  await page.evaluate(()=>window.dispatchEvent(new Event('notificationsChanged')));const refreshResult=await refreshed;expect(refreshResult.status()).toBe(200);await refreshResult.finished();await expect.poll(()=>projectReads.size).toBe(0);await expect(header(ids[1])).toHaveAttribute('aria-expanded','false');
  const finalRead=page.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname==='/api/projects');
  await page.goto(prefix+'/dashboard/profesional?tab=sent_projects&project='+ids[0]);await expect(header(ids[0])).toHaveAttribute('aria-expanded','true');await expect(card(ids[1])).toHaveCount(0);
  const finalResult=await finalRead;expect(finalResult.status()).toBe(200);await finalResult.finished();await expect.poll(()=>projectReads.size).toBe(0);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath('project-deeplink-'+language+'.png'),fullPage:true});expect(writes).toEqual([]);expect(pageErrors()).toEqual([]);expect(await preserved()).toEqual(baseline);
 }catch(error){bodyError=error;await page.screenshot({path:info.outputPath('failure-before-cleanup.png'),fullPage:true}).catch(()=>{});throw error;}finally{
  await page.goto('about:blank').catch(()=>{});try{for(const id of ids)await db.from('projects').delete().eq('id',id).throwOnError();await cleanupDisposableAccount(actor);}catch(cleanupError){throw new AggregateError(bodyError?[bodyError,cleanupError]:[cleanupError],'Deep-link fixture cleanup failed',{cause:bodyError});}
 }
});
