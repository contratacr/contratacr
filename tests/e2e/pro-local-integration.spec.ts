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
  await page.goto('/admin');await page.getByPlaceholder(/Correo de administrador/i).fill(admin.email);await page.getByPlaceholder(/Contrase.a/i).fill(admin.password);await page.getByRole('button',{name:/Ingresar/i}).click();
  await expect(page.locator('[data-admin-mfa]')).toBeVisible({timeout:30000});
  expect((await page.request.get('/api/admin/pro')).status()).toBe(403);
  await completeAdminMfa(page,admin.email);
  await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible({timeout:30000});
  await page.getByRole('link',{name:'ContrataCR Pro',exact:true}).filter({visible:true}).first().click();await expect(page.getByRole('heading',{name:'Acceso Pro',exact:true})).toBeVisible({timeout:30000});
  await expectNoHorizontalOverflow(page);
  await page.getByLabel('ID de cuenta').fill(owner.id);await page.getByLabel('Motivo',{exact:true}).fill('Prueba local de Pro');await page.getByRole('button',{name:'Guardar acceso',exact:true}).click();await expect(page.getByRole('status')).toContainText('actualizado');
  await page.getByRole('button',{name:'Consultar cuenta'}).click();await expect(page.getByRole('status')).toContainText('Pro activo');
  await page.goto('/dashboard/profesional?tab=pro');await expect(page.getByRole('navigation',{name:'Herramientas Pro'})).toBeVisible();
  await page.getByRole('button',{name:'Clientes',exact:true}).click();await page.getByRole('button',{name:'Nuevo cliente'}).click();await page.getByLabel('Nombre',{exact:true}).fill('Cliente del administrador');await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.getByRole('heading',{name:'Cliente del administrador'})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'Clientes',exact:true}).click();await expect(page.getByRole('heading',{name:'Cliente del administrador'})).toBeVisible();
  await page.getByRole('button',{name:'Cotizaciones',exact:true}).click();await page.getByRole('button',{name:'Nueva cotización'}).click();await page.getByLabel('Cliente',{exact:true}).selectOption({label:'Cliente del administrador'});await page.getByLabel('Título',{exact:true}).fill('Servicio de prueba');await page.getByLabel('Válida hasta').fill('2026-11-30');await page.getByLabel('Descripción',{exact:true}).fill('Reparación');await page.getByLabel('Precio ₡',{exact:true}).fill('1000');await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('button',{name:'Registrar aceptación'}).click();await expect(page.getByText(/Aceptada/)).toBeVisible();
  await page.getByRole('button',{name:'Agenda',exact:true}).click();await page.getByRole('button',{name:'Nueva cita'}).click();await page.getByLabel('Cliente',{exact:true}).selectOption({label:'Cliente del administrador'});await page.getByLabel('Trabajo',{exact:true}).fill('Reparación');await page.getByLabel('Inicio · Costa Rica').fill('2026-11-01T09:00');await page.getByLabel('Final · Costa Rica').fill('2026-11-01T10:00');await page.getByLabel('Cotización aceptada (opcional)').selectOption({label:'Servicio de prueba'});await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.getByRole('heading',{name:'Cliente del administrador · Reparación'})).toBeVisible();
  await page.getByRole('button',{name:'Inventario',exact:true}).click();await page.getByRole('button',{name:'Nuevo producto'}).click();for(const [label,value] of [['Código','A-1'],['Producto','Cable de prueba'],['Existencias iniciales','5'],['Mínimo','2'],['Costo unitario ₡','100'],['Precio unitario ₡','200']])await page.getByLabel(label,{exact:true}).fill(value);await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByLabel('Cantidad del movimiento').fill('-3');await page.getByLabel('Motivo del movimiento').fill('Servicio de prueba');await page.getByRole('button',{name:'Registrar movimiento'}).click();await expect(page.getByText(/2 unidades/)).toBeVisible();await page.reload();await page.getByRole('button',{name:'Inventario',exact:true}).click();await expect(page.getByText(/2 unidades/)).toBeVisible();await expectNoHorizontalOverflow(page);
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
  const id=crypto.randomUUID();const submitted=await a.request.post('/api/pro/social',{headers:{origin:baseURL!},data:{id,title:'Promoción local de prueba',link:'https://contratacr.com/profesionales',description:'Contenido ficticio'}});expect(submitted.status()).toBe(200);
  expect((await a.request.post('/api/pro/social',{headers:{origin:baseURL!},data:{id:crypto.randomUUID(),title:'Duplicada',link:'https://contratacr.com/profesionales',description:'Ficticio'}})).status()).toBe(409);
  await page.goto('/admin/pro');const item=page.locator('article').filter({has:page.getByRole('heading',{name:'Promoción local de prueba',exact:true})});await expect(item).toContainText('Pendiente');await item.getByLabel('Nota de revisión').fill('Aprobación de prueba');await item.getByRole('button',{name:'Guardar revisión'}).click();await expect(item).toContainText('Aprobada');
  const mine=await(await a.request.get('/api/pro/social')).json();expect(mine.requests[0].status).toBe('approved');
  expect((await a.request.post('/api/admin/pro',{headers:{origin:baseURL!},data:{action:'review',id,status:'published',note:'',publishedUrl:'https://example.com'}})).status()).toBe(403);
  const ownerPage=await a.newPage();await ownerPage.goto('/dashboard/pro');await expect(ownerPage.getByRole('navigation',{name:'Herramientas Pro'})).toBeVisible();await ownerPage.getByRole('button',{name:'Clientes',exact:true}).click();await expect(ownerPage.getByRole('heading',{name:'Cliente privado del profesional'})).toBeVisible();await expectNoHorizontalOverflow(ownerPage);await ownerPage.screenshot({path:testInfo.outputPath('pro-owner.png'),fullPage:true});
  const {data:audit,error}=await db.from('pro_audit').select('action,actor').eq('subject',owner.id);expect(error).toBeNull();expect(audit?.some(r=>r.action==='social.approved'&&r.actor===admin.id)).toBe(true);
 }finally{
  for(const context of contexts)await context.close();
  await cleanupDisposableAccount(owner);await cleanupDisposableAccount(other);await cleanupDisposableAccount(admin);
 }
});
