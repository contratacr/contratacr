import {test,expect} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {regressionAdminClient} from './seed';

for(const locale of ['es','en'])test(`Public profile routes preserve the profile and query without capturing reserved routes (${locale})`,async({page,request,baseURL},testInfo)=>{
 // WebKit dev HMR full reloads interrupted goto in the 11-nov run (category C).
 await stabilizeLocalProRuntime(page.context(),baseURL!);
 test.setTimeout(120000);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const actor=await createDisposableAccount({prefix:'profile-routes'}),db=regressionAdminClient(),name='Perfil de rutas local '+locale;
 try{
  expect((await db.from('profiles').update({role:'professional',is_provider:true}).eq('id',actor.id)).error).toBeNull();
  // A database trigger derives the public slug from the trade name; read it back instead of assuming the one inserted.
  const created=await db.from('professionals').insert({profile_id:actor.id,category_id:'desarrollo_web',business_name:name,slug:'profile-routes-'+actor.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_available:true,is_banned:false}).select('slug').single();
  expect(created.error).toBeNull();
  const slug=created.data!.slug as string;
  const prefix=locale==='en'?'/en':'';
  for(const path of [`/${locale}/profesionales/${slug}`,`${prefix}/${slug}`,`${prefix}/@${slug}`]){
   await page.goto(path+'?routingProbe=preserved');
   await expect(page.getByTestId('professional-profile-name').filter({visible:true})).toContainText(name);
   await expect(page).toHaveURL(new RegExp(`${prefix}/${slug}\\?routingProbe=preserved$`));
   await page.reload();
   await expect(page.getByTestId('professional-profile-name').filter({visible:true})).toContainText(name);
   expect(new URL(page.url()).searchParams.get('routingProbe')).toBe('preserved');
  }
  // Lookup supports historical links by UUID suffix, so a missing route needs
  // an independent UUID rather than another prefix on this fixture's UUID.
  const missing='profile-missing-'+crypto.randomUUID();
  if(locale==='en')await page.screenshot({path:testInfo.outputPath('public-profile-en.png'),fullPage:true});
  expect((await request.get('/api/professionals/'+missing)).status()).toBe(404);
  await page.goto(`${prefix}/${missing}`);
  await expect(page.getByText(locale==='en'?'Profile not found':'Perfil no encontrado',{exact:true})).toBeVisible();
  // A reserved path must retain its own page, not be rewritten as a profile.
  await page.goto(`/${locale}/login`);
  await expect(page.locator('input[type=email]')).toBeVisible();
  await expect(page.locator('input[type=password]')).toBeVisible();
  await expect(page.getByTestId('professional-profile-name')).toHaveCount(0);
  expect((await request.get('/api/pro/appointment-preferences')).status()).toBe(401);
  expect((await request.get('/api/pro/appointment-requests?view=provider')).status()).toBe(401);
 }finally{await cleanupDisposableAccount(actor);}
});
