import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
test('ordinary professional keeps one quotes section and standard creation without Pro controls',async({page,baseURL})=>{
 test.setTimeout(90000);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const actor=await createDisposableAccount({prefix:'quotes-basic'});const db=regressionAdminClient();
 try{
  const p=await db.from('professionals').insert({profile_id:actor.id,category_id:'desarrollo_web',business_name:'Profesional sin Pro',slug:'quotes-basic-'+actor.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'});expect(p.error).toBeNull();
  const profile=await db.from('profiles').update({is_provider:true}).eq('id',actor.id);expect(profile.error).toBeNull();
  const account=await db.auth.admin.getUserById(actor.id);await db.auth.admin.updateUserById(actor.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true}});
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await page.context().addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});
  expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();
  expect((await page.request.get('/api/pro/access')).status()).toBe(403);
  await page.goto('/dashboard/profesional?tab=quotes');await page.getByRole('button',{name:'Crear cotización',exact:true}).click();
  await expect(page.getByLabel('Cliente guardado',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Agregar desde inventario',{exact:true})).toHaveCount(0);
  await page.getByRole('textbox',{name:'Nombre',exact:true}).fill('Cliente sin Pro');await page.getByLabel('Título',{exact:false}).fill('Cotización básica conservada');await page.getByPlaceholder('Descripción',{exact:true}).fill('Servicio básico');await page.getByLabel('Precio (₡)',{exact:true}).fill('1000');await page.getByRole('dialog').getByRole('button',{name:'Crear cotización',exact:true}).click();
  await expect.poll(async()=>{const r=await page.request.get('/api/quotes');const b=await r.json();return b.quotes?.find((q:{title:string})=>q.title==='Cotización básica conservada')?.total;}).toBe(1000);
  await page.goto('/dashboard/profesional?tab=quotes');await expect(page.getByText('Cotización básica conservada',{exact:true})).toBeVisible();
  await expect(page.getByText('Cotizaciones del negocio',{exact:true})).toHaveCount(0);
 }finally{await page.goto('about:blank');await cleanupDisposableAccount(actor);}
});
