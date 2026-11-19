import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {expectNoHorizontalOverflow,warmLocalRoutes,retryInterruptedNavigation} from './helpers';

test('Pro usability: stable detail outside first page, recovery, secondary CSV actions and actionable stock filter',async({page,baseURL},testInfo)=>{/* Closing round: WebKit can deliver the previous page's late redirect during goto (same single retry as gotoOK). */retryInterruptedNavigation(page);
 test.setTimeout(120000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const actor=await createDisposableAccount({prefix:'pro-usability'}),db=regressionAdminClient();
 let releaseList=()=>{},releaseDetail=()=>{},releaseConcurrent=()=>{};
 const listGate=new Promise<void>(resolve=>{releaseList=resolve;}),detailGate=new Promise<void>(resolve=>{releaseDetail=resolve;});
 try{
  await db.from('profiles').update({is_provider:true}).eq('id',actor.id).throwOnError();
  await db.from('pro_memberships').insert({user_id:actor.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:actor.id,category_id:'desarrollo_web',business_name:'Usabilidad local',slug:'usability-'+actor.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  const document=emptyBusiness();
  for(let i=0;i<40;i++)document.clients.push({id:'c-'+i,name:'Cliente '+String(i).padStart(2,'0'),email:'',phone:'',notes:'Historial que debe conservarse '+i,archived:false});
  document.products=[{id:'low',sku:'LOW',name:'Cable al mínimo',stock:2,minimum:2,cost:100,price:200,archived:false},{id:'zero',sku:'ZERO',name:'Cinta sin existencias',stock:0,minimum:0,cost:50,price:100,archived:false},{id:'healthy',sku:'OK',name:'Tornillos disponibles',stock:8,minimum:1,cost:10,price:20,archived:false},{id:'archived',sku:'OLD',name:'Material archivado',stock:0,minimum:5,cost:10,price:20,archived:true}];
  await db.from('pro_workspaces').insert({user_id:actor.id,document,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await page.context().addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();
  let failDetail=true,detailAttempts=0,listReturned=false,concurrentListGate:Promise<void>|null=null;
  for(const path of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(path)).status()).toBe(200);
  await page.route('**/api/pro/catalog?*',async route=>{
   const q=new URL(route.request().url()).searchParams;if(q.get('kind')!=='clients'||q.has('history'))return route.continue();
   if(q.get('id')==='c-39'){await detailGate;return route.continue();}
   if(q.get('id')==='c-38'){detailAttempts++;if(failDetail)return route.fulfill({status:503,json:{error:'Temporary detail failure'}});}
   if(!q.has('id')&&!q.get('q')&&!q.get('after')){await listGate;if(concurrentListGate)await concurrentListGate;const response=await route.fetch();await route.fulfill({response});listReturned=true;return;}
   return route.continue();
  });
  // Compile the cold dev API routes first (page.route does not intercept page.request).
  await warmLocalRoutes(page,['/api/pro/catalog?kind=clients','/api/pro/client-pending','/api/pro/client-operations']);
  await page.goto('/es/dashboard/profesional?tab=pro_clients&cliente=c-39');
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('status')).toHaveText('Cargando registro…');await expect(dialog.getByRole('button',{name:'Editar',exact:true})).toBeDisabled();
  releaseDetail();await expect(dialog).toContainText('Historial que debe conservarse 39');await expect(dialog.getByRole('button',{name:'Editar',exact:true})).toBeEnabled();
  releaseList();await expect.poll(()=>listReturned).toBe(true);const cards=page.locator('[data-business-panel] article');await expect(cards).toHaveCount(20);await expect(dialog).toContainText('Historial que debe conservarse 39');await expect(dialog.getByRole('heading',{name:'Cliente 39',exact:true})).toBeVisible();
  await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('preserved-customer-detail.png'),fullPage:true});
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  // A newer page revision cannot certify an older off-page detail for editing.
  concurrentListGate=new Promise<void>(resolve=>{releaseConcurrent=resolve;});
  await page.goto('/es/dashboard/profesional?tab=pro_clients&cliente=c-39');await expect(dialog).toContainText('Historial que debe conservarse 39');
  document.clients[39].notes='Cambio remoto conservado';
  await db.rpc('pro_mutate_catalog',{p_user:actor.id,p_kind:'clients',p_rows:[document.clients[39]],p_revision:1}).throwOnError();
  releaseConcurrent();concurrentListGate=null;await expect(cards).toHaveCount(20);await expect(dialog.getByRole('alert')).toContainText('No se pudo cargar el registro');await expect(dialog.getByRole('button',{name:'Editar',exact:true})).toBeDisabled();await dialog.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(dialog).toContainText('Cambio remoto conservado');await expect(dialog.getByRole('button',{name:'Editar',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  await page.goto('/es/dashboard/profesional?tab=pro_clients&cliente=c-38');await expect(dialog.getByRole('alert')).toContainText('No se pudo cargar el registro');await expect(dialog.getByRole('button',{name:'Editar',exact:true})).toBeDisabled();const failedAttempts=detailAttempts;failDetail=false;await dialog.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(dialog).toContainText('Historial que debe conservarse 38');expect(detailAttempts).toBe(failedAttempts+1);await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  await page.getByRole('button',{name:'Archivados',exact:true}).click();await page.getByLabel('Buscar registros').fill('Cliente');await page.getByRole('button',{name:'Limpiar búsqueda',exact:true}).click();await expect(page.getByLabel('Buscar registros')).toHaveValue('');await expect(page.getByLabel('Buscar registros')).toBeFocused();await expect(page).toHaveURL(/mostrar=archived/);await expect(cards).toHaveCount(0);await page.getByRole('button',{name:'Activos',exact:true}).click();await expect(cards).toHaveCount(20);
  await page.goto('/es/dashboard/profesional?tab=pro_clients&mostrar=low');await expect(cards).toHaveCount(20);await expect(page.locator('[data-business-panel]').getByRole('alert')).toHaveCount(0);
  const actions=page.locator('[data-pro-actions]');await expect(actions.getByRole('button',{name:'Nuevo cliente',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Importar CSV',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Más opciones de la sección',exact:true}).click();await page.getByRole('menuitem',{name:'Importar CSV',exact:true}).click();await expect(dialog).toContainText('Los registros existentes se conservan.');await expect(dialog.getByLabel('Archivo CSV')).toBeVisible();await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  await page.goto('/es/dashboard/profesional?tab=pro_tools');await page.locator('[data-pro-tools]').getByRole('button',{name:'Productos y servicios',exact:true}).click();await expect(page).toHaveURL(/tab=pro_inventory/);const show=page.getByLabel('Mostrar productos y servicios',{exact:true});await expect(show.locator('option')).toHaveCount(5);await expect(cards).toHaveCount(3);await expect(page.getByRole('button',{name:'Limpiar filtros',exact:true})).toHaveCount(0);await page.getByLabel('Buscar registros').fill('   ');await expect(page.getByRole('button',{name:'Limpiar filtros',exact:true})).toHaveCount(0);await page.getByLabel('Buscar registros').fill('');// Round 2: an item without a minimum (stock not tracked) is never «Por reponer».
  await show.selectOption('low');await expect(cards).toHaveCount(1);await expect(cards).toContainText(['Mínimo: 2']);await expect(cards).not.toContainText(['Material archivado','Tornillos disponibles','Cinta sin existencias']);await expect(page.getByText('Productos con existencias iguales o menores al mínimo que definió.',{exact:true})).toBeVisible();
  await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('inventory-replenish.png'),fullPage:true});
  await page.getByLabel('Buscar registros').fill('Cable');await expect(cards).toHaveCount(1);await page.getByRole('button',{name:'Limpiar búsqueda',exact:true}).click();await expect(show).toHaveValue('low');await expect(cards).toHaveCount(1);await expect(page.getByLabel('Buscar registros')).toBeFocused();
  await page.getByLabel('Buscar registros').fill('sin coincidencias');await expect(cards).toHaveCount(0);await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await expect(show).toHaveValue('all');await expect(page.getByLabel('Buscar registros')).toHaveValue('');await expect(cards).toHaveCount(3);
  await page.goto('/es/dashboard/profesional?tab=pro_agenda');await expect(page.locator('[data-appointment-inbox]')).toContainText('No hay citas en esta vista.');await expect(page.locator('[data-reservation-calendar]')).not.toBeVisible();await page.getByRole('combobox',{name:'Mostrar citas'}).selectOption('confirmed');await expect(page.locator('[data-appointment-inbox]')).toContainText('No hay citas en esta vista.');await page.reload();await expect(page).toHaveURL(/estadoCitas=confirmed/);await expect(page.locator('[data-appointment-inbox]')).toContainText('No hay citas en esta vista.');
  await page.goto('/en/dashboard/profesional?tab=pro_inventory');await page.getByLabel('Show products and services',{exact:true}).selectOption('low');await expect(cards).toHaveCount(1);await expect(cards).toContainText(['To replenish']);await expect(cards).not.toContainText(['Minimum: 0']);/* Round 2: no minimum = not tracked */await expectNoHorizontalOverflow(page);
  expect((await db.from('pro_workspaces').select('document,revision').eq('user_id',actor.id).single().throwOnError()).data).toEqual({document,revision:2});
 }finally{releaseList();releaseDetail();releaseConcurrent();await page.goto('about:blank');await cleanupDisposableAccount(actor);}
});
