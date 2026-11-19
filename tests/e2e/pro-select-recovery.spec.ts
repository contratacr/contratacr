import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
test('Pro selectors: retry the selected record outside the first page and announce no matches',async({page,baseURL})=>{
 test.setTimeout(90000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'pro-select-recovery'}),db=regressionAdminClient();
 try{
  await db.from('profiles').update({is_provider:true}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  const doc=emptyBusiness();doc.clients=[{id:'customer',name:'Cliente selector',email:'',phone:'',notes:'Conservar',archived:false}];
  for(let i=0;i<25;i++)doc.quotes.push({id:'q-'+String(i).padStart(3,'0'),clientId:'customer',title:'Cotización aceptada '+String(i).padStart(3,'0'),lines:[{description:'Servicio conservado',quantity:1,price:1000,tax:0}],status:'accepted',validUntil:'2027-12-01'});
  await db.from('pro_workspaces').insert({user_id:owner.id,document:doc,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await page.context().addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
  let detailRequests=0,detailAvailable=false;
  await page.route('**/api/pro/quotes?*',route=>{const url=new URL(route.request().url());if(url.searchParams.get('id')==='q-024'){detailRequests++;if(!detailAvailable)return route.fulfill({status:503,json:{error:'Temporary detail failure'}});}return route.continue();});
  await page.goto('/es/dashboard/profesional?tab=pro_agenda&nueva=1&cliente=customer&anterior=q-024');
  const chosen=page.getByLabel('Cotización aceptada (opcional)',{exact:true});await expect(chosen).toHaveValue('q-024');
  await expect(chosen.locator('option')).toHaveCount(22); // Selected fallback plus the first twenty rows and placeholder.

  const failed=page.getByRole('alert').filter({hasText:'El registro seleccionado no está disponible.'});await expect(failed).toBeVisible();const failedRequests=detailRequests;detailAvailable=true;await failed.getByRole('button',{name:'Reintentar',exact:true}).click();
  await expect(chosen.locator('option:checked')).toHaveText('Cotización aceptada 024');expect(detailRequests).toBe(failedRequests+1);await expect(page.getByLabel('Trabajo',{exact:true})).toHaveValue('Cotización aceptada 024');
  await page.getByLabel('Buscar cotizaciones aceptadas',{exact:true}).fill('sin coincidencias 999');await expect(page.getByRole('status').filter({hasText:'No hay opciones que coincidan con la búsqueda.'})).toBeVisible();await expect(chosen).toHaveValue('q-024');
  expect((await db.from('pro_workspaces').select('document,revision').eq('user_id',owner.id).single().throwOnError()).data).toEqual({document:doc,revision:1});
 }finally{await page.goto('about:blank');await cleanupDisposableAccount(owner);}
});
