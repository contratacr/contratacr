import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {expectHealthyPage,expectNoHorizontalOverflow,onAppPageError} from './helpers';

for(const provider of [false,true])test(`Visible dashboard prefetch and soft navigation preserve a disposable ${provider?'provider without Pro':'client'}`,async({page,baseURL},info)=>{
 test.skip((info.project.use.viewport?.width??1366)<1024,'This focused smoke covers the existing desktop sidebar contract.');
 test.setTimeout(90000);expect(baseURL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):3185\/?$/);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const actor=await createDisposableAccount({prefix:'prefetch-smoke'}),db=regressionAdminClient(),errors:string[]=[],writes:string[]=[];let bodyError:unknown;
 onAppPageError(page,message=>errors.push(message));page.on('request',request=>{const path=new URL(request.url()).pathname;if(['POST','PUT','PATCH','DELETE'].includes(request.method())&&(path.startsWith('/api/pro/')||path==='/api/quotes'||path==='/api/projects'))writes.push(request.method()+' '+path);});
 try{
  let professionalId:string|null=null;
  if(provider){
   const auth=await db.auth.admin.getUserById(actor.id);expect((await db.auth.admin.updateUserById(actor.id,{user_metadata:{...auth.data.user!.user_metadata,role:'professional',is_provider:true}})).error).toBeNull();await db.from('profiles').update({role:'professional',is_provider:true}).eq('id',actor.id).throwOnError();
   professionalId=(await db.from('professionals').insert({profile_id:actor.id,category_id:'desarrollo_web',business_name:'No Pro smoke fixture',slug:'prefetch-'+actor.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false}).select('id').single().throwOnError()).data!.id;
  }
  await db.from('notification_once_receipts').insert({user_id:actor.id,type:'resena_google',status:'historical_unknown',sent_at:null}).throwOnError();
  async function business(){const result:Record<string,unknown>={};for(const table of ['pro_memberships','pro_workspaces','pro_clients','pro_products','pro_work','pro_client_entries','projects','notifications']){const column=table==='projects'?'client_id':'user_id';result[table]=(await db.from(table).select('*').eq(column,actor.id).throwOnError()).data;}if(professionalId)result.quotes=(await db.from('quotes').select('*').eq('professional_id',professionalId).throwOnError()).data;return result;}
  const before=await business();expect(before.pro_memberships).toEqual([]);
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>page.context().addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL!,sameSite:'Lax' as const})))}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();
  // Profile has no project list consumer: the cache must be warmed by optional
  // visible-document prefetch before the user opens My projects.
  await page.goto('/en/dashboard/profesional?tab=profile');await expect(page.getByTestId('panel-tab-sent_projects').filter({visible:true})).toBeVisible();
  const projectsKey='ccr:dashboard-cache:dashboard:client-projects:'+actor.id;
  await expect.poll(()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)||'null')?.data,projectsKey)).toEqual([]);
  if(professionalId){const quotesKey='ccr:dashboard-cache:quotes:'+professionalId;await expect.poll(()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)||'null')?.data,quotesKey)).toEqual([]);}
  await page.evaluate(()=>{(window as Window&{__prefetchSmoke?:string}).__prefetchSmoke='same-document';});
  await page.getByTestId('panel-tab-sent_projects').filter({visible:true}).click();await expect(page).toHaveURL(/tab=sent_projects/);await expect(page.getByText("You haven't posted any requests yet",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as Window&{__prefetchSmoke?:string}).__prefetchSmoke)).toBe('same-document');await expectHealthyPage(page);
  if(provider){// Quotes live under the «Tools» hub (the sidebar has no quotes tab of its own).
   await page.getByTestId('panel-tab-tools').filter({visible:true}).click();
   // Pro on (2026-11-27): Herramientas lists five groups; Cotizaciones is in «Clientes y ventas» and stays a panel section for a professional.
   await expect(page.locator('[data-tools-group-tile="sales"], [data-testid="herramienta-quotes"]').first()).toBeVisible();
   if(await page.locator('[data-tools-group-tile="sales"]').count()){await page.locator('[data-tools-group-tile="sales"]').click();await page.locator('[data-tools-entry="quotes"]').click();}else await page.getByTestId('herramienta-quotes').click();await expect(page).toHaveURL(/tab=quotes/);await expect(page.getByText('No quotes yet',{exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as Window&{__prefetchSmoke?:string}).__prefetchSmoke)).toBe('same-document');await expectHealthyPage(page);}
  expect(writes).toEqual([]);expect(await business()).toEqual(before);await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(provider?'prefetch-non-pro-provider.png':'prefetch-client.png'),fullPage:true});expect(errors).toEqual([]);
 }catch(error){bodyError=error;await page.screenshot({path:info.outputPath('failure-before-cleanup.png'),fullPage:true}).catch(()=>{});throw error;}finally{await page.goto('about:blank').catch(()=>{});try{await cleanupDisposableAccount(actor);}catch(cleanupError){throw new AggregateError(bodyError?[bodyError,cleanupError]:[cleanupError],'Dashboard smoke cleanup failed',{cause:bodyError});}}
});
