import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {expectNoHorizontalOverflow,gotoOK} from './helpers';

test('Pro editor: saved identity, account-scoped recovery and confirmed quote verification without duplicates',async({page,baseURL},testInfo)=>{
 test.setTimeout(180000);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'pro-draft-owner'}),other=await createDisposableAccount({prefix:'pro-draft-other'}),db=regressionAdminClient();
 async function login(context:BrowserContext,account:typeof owner){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:account.email,password:account.password})).error).toBeNull();}
 try{
  for(const account of [owner,other]){
   const current=await db.auth.admin.getUserById(account.id);expect(current.error).toBeNull();expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...current.data.user!.user_metadata,role:'professional',is_provider:true}})).error).toBeNull();
   await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();
   await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
   await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Borradores locales',slug:'draft-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  }
  const doc=emptyBusiness();doc.clients=[{id:'identified',name:'Cliente identificación guardada',identification:'101230456',email:'',phone:'',notes:'Preservar',archived:false},{id:'no-id',name:'Cliente sin identificación',email:'',phone:'',notes:'Preservar',archived:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document:doc,revision:1}).throwOnError();
  let identityLookups=0,postQuotes=0;const conventionalWrites:string[]=[];
  await page.route('**/api/cedula/**',route=>{identityLookups++;return route.fulfill({status:503,json:{error:'No external lookup allowed in this test'}});});
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(request.method()!=='POST')return;if(path==='/api/pro/quote-create')postQuotes++;if(path==='/api/quotes'||path==='/api/pro/quote-link')conventionalWrites.push(path);});
  await login(page.context(),owner);
  await gotoOK(page,'/es/dashboard/profesional?tab=quotes&nueva=1&cliente=identified');
  const saved=page.getByLabel('Cliente guardado',{exact:true});await expect(saved).toHaveValue('identified');
  await page.getByText('Identificación y contacto (opcionales)',{exact:true}).click();
  const identification=page.getByRole('textbox',{name:/identificación|cédula/i}).first();
  await expect(identification).toHaveValue('1-0123-0456');
  await page.getByLabel('Buscar clientes guardados').fill('sin identificación');await saved.selectOption('no-id');await expect(identification).toHaveValue('');
  await page.getByLabel('Buscar clientes guardados').fill('identificación guardada');await saved.selectOption('identified');await expect(identification).toHaveValue('1-0123-0456');
  await page.getByPlaceholder('Descripción').fill('Servicio que no debe perderse');
  await page.getByLabel('Precio (₡)',{exact:true}).fill('2000');
  await expect.poll(()=>page.evaluate(id=>JSON.parse(sessionStorage.getItem('ccr:pro:quote-draft:'+id)||'null')?.rows[0].description,owner.id)).toBe('Servicio que no debe perderse');
  await page.reload();await expect(page.getByRole('status').filter({hasText:'Se recuperó su borrador'})).toBeVisible();await expect(saved).toHaveValue('identified');await page.getByText('Identificación y contacto (opcionales)',{exact:true}).click();await expect(identification).toHaveValue('1-0123-0456');await expect(page.getByPlaceholder('Descripción')).toHaveValue('Servicio que no debe perderse');expect(identityLookups).toBe(0);expect(postQuotes).toBe(0);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('quote-recovered-draft.png'),fullPage:true});
  // Atomic creation already owns its private link. Simulate failed canonical
  // verification after a successful ACK instead of a separate linking POST.
  let verifyAttempts=0;const verificationStatuses:number[]=[];
  page.on('response',response=>{const url=new URL(response.url());if(url.pathname==='/api/pro/quotes'&&url.searchParams.has('id')&&response.request().method()==='GET')verificationStatuses.push(response.status());});
  await page.route('**/api/pro/quotes?**',route=>{const url=new URL(route.request().url());if(route.request().method()==='GET'&&url.searchParams.has('id')){verifyAttempts++;if(verifyAttempts===1)return route.fulfill({status:503,json:{error:'Temporary canonical read failure'}});}return route.continue();});
  await page.getByRole('button',{name:'Crear cotización',exact:true}).click();await expect(page.getByRole('button',{name:'Comprobar guardado',exact:true})).toBeEnabled();expect(postQuotes).toBe(1);expect(conventionalWrites).toEqual([]);
  const writeKey='ccr:pro:direct-quote-write:'+owner.id;
  const attempt=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),writeKey);expect(attempt.phase).toBe('confirmed');expect(attempt.quoteId).toMatch(/^[a-f0-9-]{36}$/);expect(JSON.parse(attempt.body).clientCedula).toBe('101230456');expect(verificationStatuses).toEqual([503]);
  await page.reload();await expect(page.getByRole('button',{name:'Comprobar guardado',exact:true})).toBeEnabled();expect(postQuotes).toBe(1);expect(verifyAttempts).toBe(1);await expect(page.getByPlaceholder('Descripción')).toHaveValue('Servicio que no debe perderse');await page.getByText('Identificación y contacto (opcionales)',{exact:true}).click();await expect(identification).toHaveValue('1-0123-0456');await expect(identification).toBeDisabled();
  const verified=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/api/pro/quotes'&&url.searchParams.get('id')===attempt.quoteId&&response.status()===200;});await page.getByRole('button',{name:'Comprobar guardado',exact:true}).click();expect((await verified).status()).toBe(200);await expect(page.getByRole('dialog')).toContainText('Servicio que no debe perderse');expect(postQuotes).toBe(1);expect(conventionalWrites).toEqual([]);expect(verificationStatuses.slice(0,2)).toEqual([503,200]);expect(identityLookups).toBe(0);
  const professional=await db.from('professionals').select('id').eq('profile_id',owner.id).single().throwOnError();
  const quotes=await db.from('quotes').select('id,client_cedula').eq('professional_id',professional.data!.id).throwOnError();expect(quotes.data).toHaveLength(1);expect(quotes.data![0].client_cedula).toBe('101230456');expect(quotes.data![0].id).toBe(attempt.quoteId);expect((await db.from('pro_direct_project_quote_actions').select('action_id').eq('actor_id',owner.id).throwOnError()).data).toHaveLength(1);expect(await page.evaluate(key=>localStorage.getItem(key),writeKey)).toBeNull();expect(await page.evaluate(key=>sessionStorage.getItem(key),writeKey)).toBeNull();
  expect((await db.from('pro_quote_links').select('quoteId,clientId').eq('user_id',owner.id).throwOnError()).data).toEqual([{quoteId:quotes.data![0].id,clientId:'identified'}]);
  expect(await page.evaluate(id=>sessionStorage.getItem('ccr:pro:quote-draft:'+id),owner.id)).toBeNull();
  await gotoOK(page,'/es/dashboard/profesional?tab=quotes&nueva=1');await page.getByPlaceholder('Descripción').fill('Borrador privado de primera cuenta');
  await expect.poll(()=>page.evaluate(id=>JSON.parse(sessionStorage.getItem('ccr:pro:quote-draft:'+id)||'null')?.rows[0].description,owner.id)).toBe('Borrador privado de primera cuenta');
  await page.context().clearCookies();await login(page.context(),other);await gotoOK(page,'/en/dashboard/profesional?tab=quotes&nueva=1');
  await expect(page.getByRole('dialog')).toBeVisible({timeout:60000});await expect(page.getByRole('dialog')).not.toContainText('Borrador privado de primera cuenta');await expect(page.getByPlaceholder('Description')).toHaveValue('');
  await page.getByText('Identification and contact (optional)',{exact:true}).click();
  await page.getByRole('textbox',{name:/^Email/}).fill('draft-only@contratacr.test');
  await page.reload();await page.getByText('Identification and contact (optional)',{exact:true}).click();await expect(page.getByRole('textbox',{name:/^Email/})).toHaveValue('draft-only@contratacr.test');
  await page.getByPlaceholder('Description').fill('Draft to discard');await page.getByRole('button',{name:'Discard draft',exact:true}).click();await expect(page.getByPlaceholder('Description')).toHaveValue('');await page.reload();await expect(page.getByPlaceholder('Description')).toHaveValue('');
  expect((await db.from('pro_clients').select('id,notes,identification').eq('user_id',owner.id).order('id').throwOnError()).data).toEqual([{id:'identified',notes:'Preservar',identification:'101230456'},{id:'no-id',notes:'Preservar',identification:null}]);
 }finally{await page.goto('about:blank');await cleanupDisposableAccount(owner);await cleanupDisposableAccount(other);}
});
