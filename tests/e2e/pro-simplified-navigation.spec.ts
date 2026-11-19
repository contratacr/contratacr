import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {crTodayISO} from '../../src/lib/time-cr';
import {emptyBusiness} from '../../src/lib/pro/business';
import {gotoOK,expectNoHorizontalOverflow,PRO_SPACE_HOME_URL,proSpaceUrl,proSpaceTitle,proHubButton,proSpaceBack} from './helpers';

test('Pro navigation: standard panel plus everyday destinations, optional tools and compatible direct links preserve existing data',async({page,baseURL},testInfo)=>{
 test.setTimeout(180000);
 expect(baseURL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):3185\/?$/);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const actor=await createDisposableAccount({prefix:'pro-simple-nav'}),db=regressionAdminClient();
 const sectionTitle=(title:string)=>page.getByRole('banner').getByRole('paragraph').filter({hasText:new RegExp('^'+title+'$')}).or(page.getByRole('heading',{name:title,exact:true})).filter({visible:true});
 try{
  const account=await db.auth.admin.getUserById(actor.id);expect((await db.auth.admin.updateUserById(actor.id,{user_metadata:{...account.data.user!.user_metadata,role:'professional',is_provider:true}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',actor.id).throwOnError();
  await db.from('professionals').insert({profile_id:actor.id,category_id:'desarrollo_web',business_name:'Navegación Pro local',slug:'simple-'+actor.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  await db.from('pro_memberships').insert({user_id:actor.id,status:'active'}).throwOnError();
  const document=emptyBusiness();document.clients=[{id:'nav-client',name:'Cliente que se conserva',email:'',phone:'',notes:'Conservar',archived:false}];document.products=[{id:'nav-product',name:'Producto que se conserva',sku:'NAV',stock:7,minimum:1,cost:20,price:50,archived:false}];
  const today=crTodayISO();document.work=[{id:'today-visit',clientId:'nav-client',client:'Cliente que se conserva',service:'Visita útil de hoy',stage:'scheduled',start:today+'T10:00:00-06:00',end:today+'T11:00:00-06:00',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:actor.id,document,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await page.context().addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL!,sameSite:'Lax' as const})));}}});
  expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();
  // Compile cold dashboard modules without calling mutation handlers or relaxing session guards.
  for(const [path,method] of [['/api/direct-chat','GET'],['/api/categories/approved','GET'],['/api/analytics/usage','POST'],['/api/attribution/claim','POST'],['/api/auth/registration-state','GET'],['/api/pro/access','GET'],['/api/projects','GET'],['/api/contact/follow-up','GET'],['/api/auth/session-mfa','GET'],['/api/pro/catalog','GET']]){
   const ready=await page.request.fetch(path,{method:'OPTIONS',timeout:30000});expect(ready.status()).toBe(204);expect(ready.headers().allow?.split(/,\s*/)).toContain(method);
  }
  const sessionReady=await page.request.get('/api/auth/session-mfa');expect(sessionReady.status()).toBe(200);expect(await sessionReady.json()).toMatchObject({authenticated:true,userId:actor.id,required:false});
  // Normalize legacy records through the real scoped reads before comparing snapshots.
  for(const kind of ['clients','products'])expect((await page.request.get('/api/pro/catalog?kind='+kind,{timeout:30000})).status()).toBe(200);
  const tables=['pro_workspaces','pro_workspace_core','pro_workspace_legacy_backup','pro_clients','pro_products','pro_work','pro_movements','pro_client_entries','pro_invoice_drafts'];
  const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await db.from(table).select('*').eq('user_id',actor.id).throwOnError()).data?.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))])));
  const before=await snapshot(),writes:string[]=[],fullDownloads:string[]=[];
  page.on('request',request=>{const url=new URL(request.url());if(request.method()!=='GET'&&url.pathname.startsWith('/api/pro/'))writes.push(url.pathname);});
  await page.route('**/api/pro/workspace**',route=>{fullDownloads.push(route.request().url());return route.abort();});
  await gotoOK(page,'/es/dashboard/profesional?tab=home');
  // «Herramientas» is «ContrataCR Pro» once Pro is enabled (opens the independent space).
  for(const [tab,label] of [['pro_agenda','Citas'],['pro_tools','ContrataCR Pro']]){
   const entry=page.getByTestId('panel-tab-'+tab).filter({visible:true});await expect(entry).toHaveCount(1);await expect(entry).toHaveText(label);
  }
  await expect(page.getByTestId('panel-tab-home').filter({visible:true})).toHaveCount((page.viewportSize()?.width??0)<640?0:1);
  for(const tab of ['sent_projects','jobs','offers','profile','saved','soporte'])await expect(page.getByTestId('panel-tab-'+tab).filter({visible:true})).toHaveCount(1);
  for(const tab of ['pro_inventory','pro_expenses','pro_payments','pro_billing'])await expect(page.getByTestId('panel-tab-'+tab)).toHaveCount(0);
  const identity=page.locator('[data-dashboard-identity-card]');await expect(identity).toBeVisible();await expect(identity).toContainText('Navegación Pro local');const mobile=(page.viewportSize()?.width??0)<640;await expect(page.getByTestId(mobile?'dashboard-mobile-view-profile':'panel-ver-perfil')).toBeVisible();await expect(page.getByTestId(mobile?'dashboard-mobile-share-profile':'panel-compartir-perfil')).toBeVisible();
  await expect(page.locator('[data-pro-day]')).toHaveCount(0);await page.getByTestId('panel-tab-pro_agenda').filter({visible:true}).click();await page.getByRole('combobox',{name:'Mostrar citas'}).selectOption('confirmed');const day=page;const homePath=new URL(page.url()).pathname+new URL(page.url()).search;await day.getByRole('button',{name:/Visita útil de hoy/}).and(page.locator('button:not([aria-haspopup])')).click();await expect(page).toHaveURL(/tab=pro_agenda|\/dashboard\/pro\/trabajo\//);const visit=page.getByRole('dialog',{name:'Visita útil de hoy',exact:true});await expect(visit).toContainText('Visita útil de hoy');await page.evaluate(()=>{const state={...window.history.state};delete state.ccrProNavigation;window.history.replaceState(state,'');});await page.reload();await expect(visit).toContainText('Visita útil de hoy');await visit.getByRole('button',{name:'Cerrar',exact:true}).click();await expect.poll(()=>new URL(page.url()).pathname+new URL(page.url()).search).toBe(homePath);await expect(day.getByRole('button',{name:/Visita útil de hoy/}).and(page.locator('button:not([aria-haspopup])'))).toBeVisible();await day.getByRole('button',{name:/Visita útil de hoy/}).and(page.locator('button:not([aria-haspopup])')).click();await expect(visit).toContainText('Visita útil de hoy');await page.goBack();await expect.poll(()=>new URL(page.url()).pathname+new URL(page.url()).search).toBe(homePath);await expect(day.getByRole('button',{name:/Visita útil de hoy/}).and(page.locator('button:not([aria-haspopup])'))).toBeVisible();
  await gotoOK(page,'/es/dashboard/profesional?tab=home');/* Closing round: gotoOK returns at commit; on WebKit a click before hydration is lost, so retry the click until the Pro space opens. */await expect(async()=>{if(PRO_SPACE_HOME_URL.test(page.url()))return;await page.getByTestId('panel-tab-pro_tools').filter({visible:true}).click({timeout:10000});await expect(page).toHaveURL(PRO_SPACE_HOME_URL,{timeout:15000});}).toPass({timeout:90000});
  // Independent Pro space: own header with h1 «Inicio» instead of the navbar section title.
  await expect(page.locator('[data-pro-tools]')).toBeVisible();await expect(proSpaceTitle(page)).toHaveText('Inicio');await expect(proHubButton(page,'Preparar visitas')).toBeVisible();await expect(page.locator('[data-visit-preparation-settings]')).toHaveCount(0);await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('pro-tools.png'),fullPage:true});
  // The Pro space titles «Gastos» as «Gastos» (pro-space.tsx labels).
  for(const [label,tab,title] of [['Productos y servicios','pro_inventory','Productos y servicios'],['Gastos','pro_expenses','Gastos'],['Pagos','pro_payments','Pagos'],['Borradores de facturación','pro_billing','Borradores de facturación']]){
   await proHubButton(page,label).click();await expect(page).toHaveURL(proSpaceUrl(tab));
   await expect(proSpaceTitle(page)).toHaveText(title);await expectNoHorizontalOverflow(page);
   await expect(page.getByRole('button',{name:'Volver a herramientas',exact:true})).toHaveCount(0);await proSpaceBack(page);await expect(page).toHaveURL(PRO_SPACE_HOME_URL);await expect(proSpaceTitle(page)).toHaveText('Inicio');
  }
  await proSpaceBack(page);await expect(page).toHaveURL(/tab=home/);
  await expect(page.getByTestId('panel-tab-quotes').filter({visible:true})).toHaveCount(0);await page.getByTestId('panel-tab-pro_tools').filter({visible:true}).click();await expect(page).toHaveURL(PRO_SPACE_HOME_URL);
  await proHubButton(page,'Cotizaciones').click();await expect(page).toHaveURL(proSpaceUrl('quotes'));await expect(proSpaceTitle(page)).toHaveText('Cotizaciones');
  // Wait for the lazily loaded sales section before a full navigation away (an aborted chunk load triggers the error-boundary reload in WebKit).
  await expect(page.locator('[data-pro-sales-workspace]')).toBeVisible({timeout:30000});await expect(page.getByRole('navigation',{name:'Secciones de ventas y cobros',exact:true})).toHaveCount(0);
  // Mobile section headers omit the bell. Desktop retains the authenticated
  // global navbar bell, matching main's lg:flex NotificationBell contract.
  const sectionBellCount=(page.viewportSize()?.width??0)>=1024?1:0;
  const bell=page.getByRole('banner').getByRole('button',{name:'Notificaciones',exact:true});
  for(const [tab,title] of [['sent_projects','Mis proyectos'],['jobs','Empleos'],['offers','Promociones'],['pro_agenda','Citas'],['pro_clients','Clientes'],['pro_quotes','Cotizaciones'],['pro_inventory','Productos y servicios'],['pro_expenses','Gastos'],['pro_payments','Pagos'],['pro_billing','Borradores de facturación']]){
   await gotoOK(page,'/es/dashboard/profesional?tab='+tab);await expect(sectionTitle(title)).toBeVisible();await expect(bell).toHaveCount(sectionBellCount);
   const primaryLabels:Record<string,string>={pro_agenda:'Nueva cita',pro_clients:'Nuevo cliente',pro_inventory:'Nuevo producto o servicio',pro_quotes:'Nueva cotización',pro_expenses:'Nuevo gasto',pro_billing:'Nuevo borrador'};
   if(primaryLabels[tab])await expect(page.getByRole('button',{name:primaryLabels[tab],exact:true})).toBeEnabled();
   if(tab==='pro_clients')await expect(page.getByRole('heading',{name:'Cliente que se conserva',exact:true})).toBeVisible();
   if(tab==='pro_inventory')await expect(page.getByRole('heading',{name:'Producto que se conserva · NAV',exact:true})).toBeVisible();
   if(tab==='pro_agenda'){await expect(page.locator('[data-appointment-inbox]')).toContainText('No hay citas en esta vista.');await expect(page.locator('[data-reservation-calendar]')).not.toBeVisible();}
   await expect(page.getByText('Comprobando acceso…',{exact:true})).toHaveCount(0);await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('section-'+tab+'.png'),fullPage:true});
   if(tab==='pro_quotes'){await page.getByRole('button',{name:'Opciones de cotizaciones',exact:true}).click();await page.getByRole('menuitem',{name:'Servicios frecuentes',exact:true}).click();await expect(page.getByRole('dialog',{name:'Servicios frecuentes',exact:true})).toBeVisible();await page.getByRole('dialog',{name:'Servicios frecuentes',exact:true}).getByRole('button',{name:'Cerrar',exact:true}).click();}
  }
  await gotoOK(page,'/en/dashboard/profesional?tab=home');for(const [tab,label] of [['pro_agenda','Appointments'],['pro_tools','ContrataCR Pro']])await expect(page.getByTestId('panel-tab-'+tab).filter({visible:true})).toHaveText(label);await expect(page.locator('[data-pro-day]')).toHaveCount(0);await page.getByTestId('panel-tab-pro_tools').filter({visible:true}).click();for(const name of ['Customers','Quotes','Statistics','Products and services','Expenses','Payments'])await expect(page.locator('[data-pro-tools]').getByRole('button',{name,exact:true})).toBeVisible();await expect(page).toHaveURL(PRO_SPACE_HOME_URL);await expect(proSpaceTitle(page)).toHaveText('Overview');await expect(page.locator('[data-pro-tools]').getByText('Invoice drafts',{exact:true})).toBeVisible();await expectNoHorizontalOverflow(page);
  expect(fullDownloads).toEqual([]);expect(writes).toEqual([]);expect(await snapshot()).toEqual(before);
 }catch(error){await page.screenshot({path:testInfo.outputPath('navigation-failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await page.goto('about:blank',{timeout:5000}).catch(()=>{});await page.close().catch(()=>{});await cleanupDisposableAccount(actor);}
});
