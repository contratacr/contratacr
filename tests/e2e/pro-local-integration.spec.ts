import {test,expect,type BrowserContext} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {completeAdminMfa} from './admin-mfa-helper';
import {expectNoHorizontalOverflow} from './helpers';
import {createServerClient} from '@supabase/ssr';
import {emptyBusiness} from '../../src/lib/pro/business';
test('real local Supabase: admin MFA, Pro memberships, account isolation and social approval',async({page,browser,baseURL},testInfo)=>{
 test.setTimeout(240000);
 expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
 const admin=await createDisposableAccount({prefix:'pro-admin',admin:true});
 const owner=await createDisposableAccount({prefix:'pro-owner'});
 const other=await createDisposableAccount({prefix:'pro-other'});
 const db=regressionAdminClient();
 const contexts:BrowserContext[]=[];
 try{
  for(const actor of [admin,owner]){
   const provider=await db.from('professionals').insert({profile_id:actor.id,category_id:'desarrollo_web',business_name:'Profesional local',slug:'pro-local-'+actor.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'});expect(provider.error).toBeNull();
   const profile=await db.from('profiles').update({is_provider:true}).eq('id',actor.id);expect(profile.error).toBeNull();
   const authActor=await db.auth.admin.getUserById(actor.id);await db.auth.admin.updateUserById(actor.id,{user_metadata:{...authActor.data.user!.user_metadata,is_provider:true}});
  }
  await page.goto('/admin');await page.getByPlaceholder(/Correo de administrador/i).fill(admin.email);await page.getByPlaceholder(/Contrase.a/i).fill(admin.password);await page.getByRole('button',{name:/Ingresar/i}).click();
  await expect(page.locator('[data-admin-mfa]')).toBeVisible({timeout:30000});
  expect((await page.request.get('/api/admin/pro')).status()).toBe(403);
  await completeAdminMfa(page,admin.email);
  await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible({timeout:30000});
  await page.getByRole('link',{name:'ContrataCR Pro',exact:true}).filter({visible:true}).first().click();await expect(page.getByRole('heading',{name:'Acceso Pro',exact:true})).toBeVisible({timeout:30000});
  await expectNoHorizontalOverflow(page);
  expect((await page.request.post('/api/admin/pro',{headers:{origin:baseURL!},data:{action:'membership',userId:other.id,status:'active',expiresAt:null,reason:'No profesional'}})).status()).toBe(400);
  await page.getByLabel('ID de cuenta').fill(owner.id);await page.getByLabel('Motivo',{exact:true}).fill('Prueba local de Pro');await page.getByRole('button',{name:'Guardar acceso',exact:true}).click();await expect(page.getByRole('status')).toContainText('actualizado');
  await page.getByRole('button',{name:'Consultar cuenta'}).click();await expect(page.getByRole('status')).toContainText('Pro activo');
  await page.goto('/dashboard/profesional?tab=pro_clients');await expect(page.getByRole('button',{name:'Nuevo cliente'})).toBeVisible();
  await page.getByRole('button',{name:'Nuevo cliente'}).click();await page.getByLabel('Nombre',{exact:true}).fill('Cliente del administrador');await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.getByRole('heading',{name:'Cliente del administrador'})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Cliente del administrador'})).toBeVisible();
  // Keep an earlier Pro quotation: it must remain visible alongside standard quotes.
  const workspace=await(await page.request.get('/api/pro/workspace')).json();
  const legacyQuote={id:'old-pro-quote',clientId:workspace.document.clients[0].id,title:'Servicio de prueba',lines:[{description:'Servicio',quantity:1,price:1000,tax:13}],status:'accepted',validUntil:'2026-11-30'};
  expect((await page.request.put('/api/pro/workspace',{headers:{origin:baseURL!},data:{revision:workspace.revision,document:{...workspace.document,quotes:[legacyQuote],products:[{id:'picker-product',sku:'PICKER',name:'Producto del editor',stock:5,minimum:1,cost:800,price:1000,archived:false}]}}})).status()).toBe(200);
  await page.goto('/dashboard/profesional?tab=quotes');await expect(page.getByRole('heading',{name:'Servicio de prueba',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Nueva cotización',exact:true}).click();
  await page.getByLabel('Cliente guardado',{exact:true}).selectOption({label:'Cliente del administrador'});
  await page.getByLabel('Título',{exact:false}).fill('Cotización unificada nueva');await page.getByLabel('Agregar desde inventario',{exact:true}).selectOption({label:'Producto del editor'});await expect(page.getByPlaceholder('Descripción',{exact:true})).toHaveValue('Producto del editor');await expect(page.getByLabel('Precio (₡)',{exact:true})).toHaveValue('1130');
  await page.getByRole('button',{name:'Crear cotización',exact:true}).click();
  await expect.poll(async()=>{const r=await page.request.get('/api/quotes');return (await r.json()).quotes?.some((q:{title:string})=>q.title==='Cotización unificada nueva');}).toBe(true);
  await page.goto('/dashboard/profesional?tab=quotes');await expect(page.getByRole('heading',{name:'Servicio de prueba',exact:true})).toBeVisible();await expect(page.getByText('Cotización unificada nueva',{exact:true})).toBeVisible();
  await page.goto('/dashboard/profesional?tab=pro_agenda');await page.getByRole('button',{name:'Nueva cita'}).click();await page.getByLabel('Cliente',{exact:true}).selectOption({label:'Cliente del administrador'});await page.getByLabel('Trabajo',{exact:true}).fill('Reparación');await page.getByLabel('Inicio · Costa Rica').fill('2026-11-01T09:00');await page.getByLabel('Final · Costa Rica').fill('2026-11-01T10:00');await page.getByLabel('Cotización aceptada (opcional)').selectOption({label:'Servicio de prueba'});await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.getByRole('heading',{name:'Cliente del administrador · Reparación'})).toBeVisible();
  await page.goto('/dashboard/profesional?tab=pro_inventory');await page.getByRole('button',{name:'Nuevo producto'}).click();for(const [label,value] of [['Código','A-1'],['Producto','Cable de prueba'],['Existencias iniciales','5'],['Mínimo','2'],['Costo unitario ₡','100'],['Precio unitario ₡','200']])await page.getByLabel(label,{exact:true}).fill(value);await page.getByRole('button',{name:'Guardar',exact:true}).click();const inventoryCard=page.locator('article').filter({has:page.getByRole('heading',{name:'Cable de prueba · A-1',exact:true})});await expect(inventoryCard).toBeVisible();await inventoryCard.getByLabel('Cantidad del movimiento').fill('-3');await inventoryCard.getByLabel('Motivo del movimiento').fill('Servicio de prueba');await inventoryCard.getByRole('button',{name:'Registrar movimiento'}).click();await expect(page.getByText(/2 unidades/)).toBeVisible();await page.reload();await expect(page.getByText(/2 unidades/)).toBeVisible();await expectNoHorizontalOverflow(page);
  await page.screenshot({path:testInfo.outputPath('pro-admin.png'),fullPage:true});
  async function userContext(account:typeof owner){
   const context=await browser.newContext({baseURL,viewport:page.viewportSize()!,isMobile:Boolean(testInfo.project.use.isMobile),hasTouch:Boolean(testInfo.project.use.hasTouch),deviceScaleFactor:testInfo.project.use.deviceScaleFactor});contexts.push(context);
   const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,httpOnly:false,sameSite:'Lax' as const})));}}});
   const {error}=await auth.auth.signInWithPassword({email:account.email,password:account.password});expect(error).toBeNull();const foreign=await auth.from('pro_workspaces').select('*').eq('user_id',admin.id);expect(foreign.error).toBeNull();expect(foreign.data).toEqual([]);const denied=await auth.from('pro_workspaces').insert({user_id:account.id,document:{},revision:1});expect(denied.error).not.toBeNull();return context;
  }
  const a=await userContext(owner),b=await userContext(other);
  expect((await b.request.get('/api/pro/workspace')).status()).toBe(403);
  const initial=await a.request.get('/api/pro/workspace');expect(initial.status()).toBe(200);expect((await initial.json()).document.clients).toEqual([]);
  const document=emptyBusiness();document.clients.push({id:'c',name:'Cliente privado del profesional',email:'',phone:'',notes:'',archived:false});
  const saved=await a.request.put('/api/pro/workspace',{headers:{origin:baseURL!},data:{document,revision:0}});expect(saved.status()).toBe(200);
  expect((await a.request.put('/api/pro/workspace',{headers:{origin:baseURL!},data:{document,revision:0}})).status()).toBe(409);
  const ownAdmin=await(await page.request.get('/api/pro/workspace')).json();expect(ownAdmin.document.clients[0].name).toBe('Cliente del administrador');
  const socialTitle='Promoción local de prueba '+owner.id;const id=crypto.randomUUID();const submitted=await a.request.post('/api/pro/social',{headers:{origin:baseURL!},data:{id,title:socialTitle,link:'https://contratacr.com/profesionales',description:'Contenido ficticio'}});expect(submitted.status()).toBe(200);
  expect((await a.request.post('/api/pro/social',{headers:{origin:baseURL!},data:{id:crypto.randomUUID(),title:'Duplicada',link:'https://contratacr.com/profesionales',description:'Ficticio'}})).status()).toBe(409);
  await page.goto('/admin/pro');const item=page.locator('article').filter({has:page.getByRole('heading',{name:socialTitle,exact:true})});await expect(item).toContainText('Pendiente');await item.getByLabel('Nota de revisión').fill('Aprobación de prueba');await item.getByRole('button',{name:'Guardar revisión'}).click();await expect(item).toContainText('Aprobada');
  const mine=await(await a.request.get('/api/pro/social')).json();expect(mine.requests[0].status).toBe('approved');
  expect((await a.request.post('/api/admin/pro',{headers:{origin:baseURL!},data:{action:'review',id,status:'published',note:'',publishedUrl:'https://example.com'}})).status()).toBe(403);
  const ownerPage=await a.newPage();await ownerPage.goto('/dashboard/pro');await expect(ownerPage.locator('[data-pro-workspace]')).toBeVisible();await ownerPage.goto('/dashboard/profesional?tab=pro_clients');await expect(ownerPage.getByRole('heading',{name:'Cliente privado del profesional'})).toBeVisible();await expectNoHorizontalOverflow(ownerPage);await ownerPage.screenshot({path:testInfo.outputPath('pro-owner.png'),fullPage:true});
  const {data:audit,error}=await db.from('pro_audit').select('action,actor').eq('subject',owner.id);expect(error).toBeNull();expect(audit?.some(r=>r.action==='social.approved'&&r.actor===admin.id)).toBe(true);
 }finally{
  for(const context of contexts)await context.close();
  await cleanupDisposableAccount(owner);await cleanupDisposableAccount(other);await cleanupDisposableAccount(admin);
 }
});
