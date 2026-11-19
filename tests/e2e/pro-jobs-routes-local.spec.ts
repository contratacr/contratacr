import {randomUUID} from 'node:crypto';
import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {expectNoHorizontalOverflow} from './helpers';
import {rutaEmpleo} from '../../src/lib/marketplace-url';

test('Pro local jobs routes: published and closed detail preserve search origin, unknown jobs stay 404 and outsiders cannot edit',async({page,browser,baseURL,isMobile},testInfo)=>{
 test.setTimeout(120000);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 expect(new URL(baseURL!).hostname).toMatch(/^(?:127\.0\.0\.1|localhost)$/);
 const owner=await createDisposableAccount({prefix:'pro-jobs-owner'}),outsider=await createDisposableAccount({prefix:'pro-jobs-other'}),db=regressionAdminClient();
 const id=randomUUID(),title='Empleo local '+id.slice(0,8),description='Descripción local conservada de la vacante; este contenido solo existe durante la prueba.';
 let foreign:BrowserContext|undefined;
 const listPath='/empleos?'+new URLSearchParams({q:title,workplace:'remote',employment:'contract'}),detailPath=rutaEmpleo({id,title})+'?'+new URLSearchParams({from:listPath});
 const currentPath=()=>new URL(page.url()).pathname+new URL(page.url()).search;
 const returnToList=async(selector:string)=>{const back=page.locator(selector);await expect(back).toHaveAttribute('href',listPath);if(isMobile)await back.click();else await page.goBack();await expect.poll(currentPath).toBe(listPath);await expect(page.getByPlaceholder('¿Qué empleo busca?',{exact:true}).filter({visible:true})).toHaveValue(title);};
 try{
  await db.from('profiles').update({is_provider:true}).eq('id',owner.id).throwOnError();
  const provider=await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Empleador local conservado',slug:'jobs-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError();owner.professionalId=provider.data!.id;
  await db.from('job_posts').insert({id,employer_id:provider.data!.id,title,description,employment_type:'contract',workplace_type:'remote',location_label:null,show_salary:false,openings:1,status:'published',responsibilities:['Comunicar avances'],requirements:['Experiencia demostrable'],benefits:[]}).throwOnError();
  const original=(await db.from('job_posts').select('*').eq('id',id).single().throwOnError()).data;
  foreign=await browser.newContext();const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await foreign!.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL!,sameSite:'Lax' as const})));}}});
  expect((await auth.auth.signInWithPassword({email:outsider.email,password:outsider.password})).error).toBeNull();
  expect((await foreign.request.patch('/api/jobs/posts',{headers:{origin:new URL(baseURL!).origin},data:{id,status:'closed'}})).status()).toBe(403);
  expect((await db.from('job_posts').select('*').eq('id',id).single().throwOnError()).data).toEqual(original);

  // Compile both Next dev routes before the browser connects to HMR. A cold
  // route rebuild can otherwise reload the old document during the real click.
  expect((await page.request.get(listPath)).status()).toBe(200);expect((await page.request.get(detailPath)).status()).toBe(200);
  const listResponse=await page.goto(listPath);expect(listResponse?.status()).toBe(200);await expect(page.locator('main')).toContainText(title);await expect(page.getByPlaceholder('¿Qué empleo busca?',{exact:true}).filter({visible:true})).toHaveValue(title);
  const card=page.locator('[data-marketplace-row=empleos]').filter({has:page.getByRole('heading',{name:title,exact:true})});
  if(isMobile){await card.getByRole('link',{name:title,exact:true}).click();await expect.poll(()=>new URL(page.url()).pathname).toBe(rutaEmpleo({id,title}));await expect(page.locator('main')).toContainText(description);}else{await card.getByRole('button',{name:'Ver '+title,exact:true}).click();await expect(page.locator('main')).toContainText(description);}
  const response=await page.goto(detailPath);expect(response?.status()).toBe(200);await page.reload();await expect(page.locator('main')).toContainText(description);await expect(page.locator('article h2').filter({hasText:title}).filter({visible:true})).toHaveCount(1);
  const html=await(await page.request.get(detailPath)).text();expect(html).not.toContain('name="robots" content="noindex');expect(html).toContain('JobPosting');await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('pro-jobs-published-detail.png'),fullPage:true});await returnToList('[data-native-back="job-detail"]');

  await db.from('job_posts').update({status:'closed'}).eq('id',id).throwOnError();
  const closedResponse=await page.goto(detailPath);expect(closedResponse?.status()).toBe(200);await page.reload();await expect(page.getByText('Este empleo ya no recibe postulaciones.',{exact:true}).filter({visible:true})).toBeVisible();await expect(page.locator('main')).toContainText(title);await expect(page.locator('main')).not.toContainText(description);await expect(page.locator('main').getByRole('button',{name:/WhatsApp/i})).toHaveCount(0);
  const closedHtml=await(await page.request.get(detailPath)).text();expect(closedHtml).toContain('name="robots" content="noindex');
  const anonymous=await page.request.get(process.env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/job_posts?'+new URLSearchParams({id:'eq.'+id,select:'id,status'}),{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,Authorization:'Bearer '+process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}});expect(anonymous.status()).toBe(200);expect(await anonymous.json()).toEqual([]);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('pro-jobs-closed-detail.png'),fullPage:true});await returnToList('[data-native-back="closed-job"]');
  await expect(page.locator('main')).not.toContainText(title);

  const missing='/empleos/'+randomUUID();expect((await page.request.get(missing)).status()).toBe(404);expect((await page.goto(missing))?.status()).toBe(404);await expect(page.locator('.ccr-error-screen').getByRole('heading',{name:/no encontrada|not found/i})).toBeVisible();await expect(page.locator('main')).not.toContainText(title);
  const final=(await db.from('job_posts').select('*').eq('id',id).single().throwOnError()).data;expect(final).toEqual({...original,status:'closed',updated_at:final.updated_at});
 }finally{await foreign?.close();await page.goto('about:blank');await db.from('job_posts').delete().eq('id',id).throwOnError();await cleanupDisposableAccount(owner);await cleanupDisposableAccount(outsider);}
});
