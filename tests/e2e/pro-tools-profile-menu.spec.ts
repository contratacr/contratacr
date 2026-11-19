import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,PRO_SPACE_HOME_URL,proSpaceUrl,proSpaceBack} from './helpers';

for(const language of ['es','en'] as const)test(`Tools uses profile menu rows and keeps preparation edits and back paths [${language}]`,async({page,baseURL},testInfo)=>{
 test.skip((page.viewportSize()?.width ?? 1366)>=1024,'Mobile header contract; desktop brand covered separately.');
 test.setTimeout(180000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 if(process.env.PRO_TOOLS_NATIVE==='1')await page.addInitScript(()=>{
  localStorage.setItem('ccr:native-first-run-onboarding:v12','1');
  const runtime:Record<string,unknown>={isNativePlatform:()=>true};
  Object.defineProperty(window,'Capacitor',{configurable:true,get:()=>runtime,set:value=>{if(value&&typeof value==='object')Object.assign(runtime,value);runtime.isNativePlatform=()=>true;}});
 });
 const owner=await createDisposableAccount({prefix:'pro-home-summary'}),db=regressionAdminClient();
 try{
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'redes_internet',business_name:'Resumen local',slug:'home-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-al',verification_status:'pending',is_banned:false}).throwOnError();
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true}})).error).toBeNull();
  const day=crTodayISO(),document=emptyBusiness();document.clients=[{id:'home-client',name:'Cliente del resumen',email:'',phone:'',notes:'Conservar',archived:false}];document.work=[{id:'home-work',clientId:'home-client',client:'Cliente del resumen',service:'Servicio de hoy',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T10:00:00-06:00',cancelled:false}];await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await page.context().addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
  await gotoOK(page,`/${language}/dashboard/profesional?tab=home`);await expect(page.getByTestId('panel-tab-quotes').filter({visible:true})).toHaveCount(0);await expect(page.getByTestId('panel-tab-pro_clients').filter({visible:true})).toHaveCount(0);await expect(page.getByTestId('panel-tab-statistics').filter({visible:true})).toHaveCount(0);const profileEntry=page.getByTestId('panel-tab-profile').filter({visible:true}),toolsEntry=page.getByTestId('panel-tab-pro_tools').filter({visible:true});await expect(profileEntry).toBeVisible();expect((await toolsEntry.boundingBox())!.y).toBeLessThan((await profileEntry.boundingBox())!.y);await page.getByTestId('panel-tab-pro_tools').filter({visible:true}).click();await expect(page).toHaveURL(PRO_SPACE_HOME_URL);
  // ContrataCR Pro opens the independent space, whose hub adds the company task center
  // rows (Centro de empresa, Equipo, Archivos de la empresa, Proyectos, Solicitudes, Tareas). Round 2: the cards
  // and the sidebar share one list (lib/pro/hub-sections), adding Citas and Borradores de facturación to Gestión: 4/3/10 = 17.
  // Round 9 (intentional, QA «Ronda 9»): «Horas» (hours of all jobs) joins Gestión → 4/3/11 = 18.
  const tools=page.locator('[data-pro-tools]'),nav=tools.getByRole('navigation');
  await expect(nav.getByRole('button')).toHaveCount(18);
  for(const name of language==='en'?['Company','Library','Management']:['Empresa','Biblioteca','Gestión'])await expect(nav.getByRole('heading',{name,exact:true})).toBeVisible();
  await expect(nav.getByRole('region',{name:language==='en'?'Company':'Empresa',exact:true}).getByRole('button')).toHaveCount(4);
  await expect(nav.getByRole('region',{name:language==='en'?'Library':'Biblioteca',exact:true}).getByRole('button')).toHaveCount(3);
  await expect(nav.getByRole('region',{name:language==='en'?'Management':'Gestión',exact:true}).getByRole('button')).toHaveCount(11);
  await expect(tools.locator('[data-pro-record-card]')).toHaveCount(0);
  await expect(page.locator('[data-visit-preparation-settings]')).toHaveCount(0);
  const preparation=language==='en'?'Visit preparation':'Preparar visitas';
  for(const button of await nav.getByRole('button').all()) {await expect(button).toBeVisible();await expect.poll(async()=>(await button.boundingBox())?.height??0).toBeGreaterThanOrEqual(60);}
  await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('tools-menu-'+language+'.png')});
  await nav.getByRole('button',{name:preparation,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:preparation,exact:true}),back=dialog.getByRole('button',{name:language==='en'?'Back':'Volver',exact:true});
  await expect(dialog).toBeVisible();await expect(page).toHaveURL(/prepararVisita=1/);
  const spacing=dialog.getByLabel(language==='en'?'Time between visits':'Tiempo entre visitas',{exact:true});
  await expect(spacing).toBeEnabled();const original=await spacing.inputValue();const other=original==='30'?'45':'30';await spacing.selectOption(other);
  // N1: the browser back button is guarded too (it keeps the dialog, the edit and the step URL, and warns).
  await expect(dialog.getByRole('alert')).toHaveCount(0);await page.goBack();await expect(dialog).toBeVisible();await expect(page).toHaveURL(/prepararVisita=1/);await expect(spacing).toHaveValue(other);
  await expect(dialog.getByRole('alert')).toContainText(language==='en'?'Save or cancel settings':'Guarde o cancele');await page.screenshot({path:testInfo.outputPath('visit-preparation-browser-back-'+language+'.png')});
  await back.click();await expect(dialog).toBeVisible();await expect(spacing).toHaveValue(other);
  await expect(dialog.getByRole('alert')).toContainText(language==='en'?'Save or cancel settings':'Guarde o cancele');
  await dialog.getByRole('button',{name:language==='en'?'Cancel':'Cancelar',exact:true}).click();await expect(spacing).toHaveValue(original);
  await back.click();await expect(dialog).toHaveCount(0);await expect(page).not.toHaveURL(/prepararVisita/);
  await page.goForward();await expect(dialog).toBeVisible();await expect(spacing).toHaveValue(original);
  await page.reload();await expect(dialog).toBeVisible();await expect(spacing).toHaveValue(original);await back.click();await expect(dialog).toHaveCount(0);
  for(const [label,tab] of [[language==='en'?'Customers':'Clientes','pro_clients'],[language==='en'?'Statistics':'Estadísticas','statistics'],[language==='en'?'Quotes':'Cotizaciones','quotes'],[language==='en'?'Products and services':'Productos y servicios','pro_inventory'],[language==='en'?'Expenses':'Gastos','pro_expenses'],[language==='en'?'Payments':'Pagos','pro_payments']]) {
   await nav.getByRole('button',{name:label,exact:true}).click();await expect(page).toHaveURL(proSpaceUrl(tab));if(tab==='pro_payments'){const totals=page.locator('[data-pro-sales-workspace] details').filter({has:page.getByText(language==='en'?'View totals':'Ver totales',{exact:true})});await expect(totals).toBeVisible();await expect(totals).not.toHaveAttribute('open');await totals.locator(':scope > summary').click();await expect(totals).toHaveAttribute('open');}
   await proSpaceBack(page,language==='en');await expect(tools).toBeVisible();
  }
  await nav.getByRole('button',{name:language==='en'?'Suppliers':'Proveedores',exact:true}).click();
  await expect(page).toHaveURL(/tab=pro_company&empresa=proveedores/);await expect(page.locator('[data-company-hub="proveedores"]')).toBeVisible();
  await proSpaceBack(page,language==='en');await expect(tools).toBeVisible();
  await nav.getByRole('button',{name:language==='en'?'Frequent services':'Servicios frecuentes',exact:true}).click();
  await expect(page).toHaveURL(/tab=quotes&plantillaServicios=1/);const services=page.getByRole('dialog',{name:language==='en'?'Frequent services':'Servicios frecuentes',exact:true});await expect(services).toBeVisible();await services.getByRole('button',{name:language==='en'?'Close':'Cerrar',exact:true}).click();await expect(tools).toBeVisible();
  await tools.getByRole('button',{name:language==='en'?'Invoice drafts':'Borradores de facturación',exact:true}).click();
  await expect(page).toHaveURL(/tab=pro_billing/);await expect(page.getByRole('navigation',{name:language==='en'?'Sales and payments sections':'Secciones de ventas y cobros'}).getByRole('button',{name:language==='en'?'Invoice drafts':'Borradores',exact:true})).toBeVisible();await proSpaceBack(page,language==='en');await expect(tools).toBeVisible();
  if(language==='es') {await gotoOK(page,'/es/dashboard/profesional?tab=profile');await page.getByRole('button',{name:'Servicios',exact:true}).click();await expect(page.getByRole('button',{name:'Agregar servicio',exact:true})).toBeVisible();await page.locator('[data-ccr-section-back]').filter({visible:true}).click();await page.getByRole('button',{name:'Casos de éxito',exact:true}).click();await expect(page.getByRole('button',{name:'Agregar un caso de éxito',exact:true})).toBeVisible();}
  expect((await db.from('pro_workspaces').select('document,revision').eq('user_id',owner.id).single().throwOnError()).data).toEqual({document,revision:1});
  expect((await db.from('notifications').select('id').eq('user_id',owner.id).throwOnError()).data).toEqual([]);
 }finally{await page.goto('about:blank');await cleanupDisposableAccount(owner);}
});
