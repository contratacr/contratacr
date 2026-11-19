import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,waitForInteractivePage} from './helpers';

for(const language of ['es','en'] as const)test(`new sections share project card hierarchy and keep detail and edit actions [${language}]`,async({page,baseURL},testInfo)=>{
 test.skip((page.viewportSize()?.width ?? 1366)>=1024,'Mobile header contract; desktop brand covered separately.');
 test.setTimeout(180000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 if(process.env.PRO_STYLE_NATIVE==='1') await page.addInitScript(()=>{
  localStorage.setItem('ccr:native-first-run-onboarding:v12','1');
  const runtime:Record<string,unknown>={isNativePlatform:()=>true};
  Object.defineProperty(window,'Capacitor',{configurable:true,get:()=>runtime,set:value=>{if(value&&typeof value==='object')Object.assign(runtime,value);runtime.isNativePlatform=()=>true;}});
 });
 const owner=await createDisposableAccount({prefix:'pro-home-summary'}),db=regressionAdminClient();
 try{
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'redes_internet',business_name:'Resumen local',slug:'home-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-al',verification_status:'pending',is_banned:false}).throwOnError();
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  const day=crTodayISO(),document=emptyBusiness();document.clients=[{id:'home-client',name:'Cliente del resumen',email:'',phone:'',notes:'Conservar',archived:false}];document.work=[{id:'home-work',clientId:'home-client',client:'Cliente del resumen',service:'Servicio de hoy',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T10:00:00-06:00',cancelled:false}];document.products=[{id:'test-product',name:'Cable de prueba',sku:'QA-01',stock:2,minimum:3,cost:100,price:150,unit:'m',archived:false}];document.quotes=[{id:'test-quote',clientId:'home-client',title:'Revisión eléctrica',status:'draft',validUntil:day,lines:[{description:'Revisión',quantity:1,price:5000,tax:0}]}];await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await page.context().addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
  const discard=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:language==='en'?'Discard changes?':'¿Descartar cambios?',exact:true})});
  async function confirmDiscard(){await expect(discard).toBeVisible();await discard.getByRole('button',{name:language==='en'?'Discard changes':'Descartar cambios',exact:true}).click();}
  const detail=page.getByRole('dialog');
  const clear=page.getByRole('button',{name:language==='en'?'Clear filters':'Limpiar filtros',exact:true});
  const records=page.locator('[data-pro-record-card]');
  for(const [tab,label,view] of [
   ['pro_clients','Cliente del resumen',language==='en'?'View customer':'Ver cliente'],
   ['pro_inventory','Cable de prueba · QA-01',language==='en'?'View product':'Ver producto'],
   ['quotes','Revisión eléctrica',language==='en'?'View quote':'Ver cotización'],
   ['pro_agenda','Servicio de hoy',language==='en'?'View appointment':'Ver cita']
  ]) {
   await gotoOK(page,`/${language}/dashboard/profesional?tab=${tab}`);
   await waitForInteractivePage(page);
   if(tab==='pro_agenda') await page.getByRole('combobox').selectOption('confirmed');
   await expect(records).toHaveCount(1);await expect(records).toContainText(label);
   await expect(records.getByRole('button',{name:view,exact:true})).toBeEnabled();
   if(tab==='pro_clients'||tab==='pro_inventory') {
    const create=page.getByRole('button',{name:tab==='pro_clients'?(language==='en'?'New customer':'Nuevo cliente'):(language==='en'?'New product or service':'Nuevo producto o servicio'),exact:true});
    const actions=page.getByRole('button',{name:language==='en'?'More section options':'Más opciones de la sección',exact:true});
    await expect(actions).toBeVisible();
    const titleBox=await page.locator('[data-ccr-section-title]').filter({visible:true}).boundingBox(),actionsBox=await actions.boundingBox();
    expect(titleBox).not.toBeNull();expect(actionsBox).not.toBeNull();
    expect(Math.abs(titleBox!.y+titleBox!.height/2-actionsBox!.y-actionsBox!.height/2)).toBeLessThan(8);
    await expect(page.locator('[data-pro-actions]').getByRole('button',{name:language==='en'?'More section options':'Más opciones de la sección',exact:true})).toHaveCount(0);
    await expect(clear).toHaveCount(0);
    const search=page.getByLabel(language==='en'?'Search records':'Buscar registros',{exact:true});
    if(tab==='pro_clients')await page.getByRole('button',{name:language==='en'?'Archived':'Archivados',exact:true}).click();
    else await page.getByLabel(language==='en'?'Show products and services':'Mostrar productos y servicios',{exact:true}).selectOption('archived');
    await expect(clear).toHaveCount(0);
    await search.fill('prueba');await expect(clear).toBeVisible();await clear.click();await expect(search).toHaveValue('');await expect(clear).toHaveCount(0);
    if(tab==='pro_clients'){await expect(page.getByRole('button',{name:language==='en'?'Archived':'Archivados',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:language==='en'?'Active':'Activos',exact:true}).click();}
    else {await expect(page.getByLabel(language==='en'?'Show products and services':'Mostrar productos y servicios',{exact:true})).toHaveValue('archived');await page.getByLabel(language==='en'?'Show products and services':'Mostrar productos y servicios',{exact:true}).selectOption('all');}
    await expect(records).toHaveCount(1);

    if(tab==='pro_clients') {
     await expect(create).toBeVisible();
     const createBox=await create.boundingBox(),cardBox=await records.boundingBox();
     expect(Math.abs(createBox!.width-cardBox!.width)).toBeLessThan(2);
     await records.getByRole('button',{name:language==='en'?'Edit':'Editar',exact:true}).click();
     await expect(page.getByLabel(language==='en'?'Name':'Nombre',{exact:true})).toHaveValue('Cliente del resumen');
     await page.getByLabel(language==='en'?'Name':'Nombre',{exact:true}).fill('Cambio temporal conservado');await detail.getByRole('button',{name:language==='en'?'Close':'Cerrar',exact:true}).first().click();await expect(discard).toBeVisible();await discard.getByRole('button',{name:language==='en'?'Keep editing':'Seguir editando',exact:true}).click();await page.reload();await expect(page.getByLabel(language==='en'?'Name':'Nombre',{exact:true})).toHaveValue('Cambio temporal conservado');await detail.getByRole('button',{name:language==='en'?'Cancel':'Cancelar',exact:true}).click();await confirmDiscard();await expect(detail).toHaveCount(0);
    }
   }
   if(tab==='pro_inventory'){
    await records.getByRole('button',{name:language==='en'?'Edit':'Editar',exact:true}).click();
    const form=page.getByRole('dialog');await expect(form.getByLabel(language==='en'?'Code':'Código',{exact:true})).toBeHidden();await form.getByText(language==='en'?'Catalog details (optional)':'Datos del catálogo (opcionales)',{exact:true}).click();await expect(form.getByLabel(language==='en'?'Code':'Código',{exact:true})).toHaveValue('QA-01');const names=language==='en'?['Name','Unit price ₡','Code']:['Nombre','Precio unitario ₡','Código'];const boxes=await Promise.all(names.map(name=>form.getByLabel(name,{exact:true}).boundingBox()));expect(boxes.every(Boolean)).toBe(true);expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);
    await expect(form.getByLabel(language==='en'?'CABYS code':'Código CABYS',{exact:true})).toBeHidden();await form.getByLabel(language==='en'?'Unit price ₡':'Precio unitario ₡',{exact:true}).fill('999');await expect(form.getByRole('button',{name:language==='en'?'Save':'Guardar',exact:true})).toHaveAttribute('form','pro-business-form');await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('product-form-'+language+'.png'),fullPage:true});await form.getByRole('button',{name:language==='en'?'Cancel':'Cancelar',exact:true}).click();await confirmDiscard();await expect(form).toHaveCount(0);
   }
   await records.getByRole('button',{name:view,exact:true}).click();await expect(detail).toBeVisible();
   if(tab==='pro_inventory'){
    await detail.getByRole('button',{name:language==='en'?'Record stock movement':'Registrar movimiento',exact:true}).click();const movement=page.getByRole('dialog',{name:language==='en'?'Record stock movement':'Registrar movimiento',exact:true});await movement.getByLabel(language==='en'?'Quantity':'Cantidad',{exact:true}).fill('2');await movement.getByLabel(language==='en'?'Movement reason':'Motivo del movimiento',{exact:true}).fill('No guardar este movimiento');await expect(movement.getByRole('button',{name:language==='en'?'Save':'Guardar',exact:true})).toHaveAttribute('form','pro-stock-form');await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('stock-form-'+language+'.png'),fullPage:true});await movement.getByLabel(language==='en'?'Movement type':'Tipo de movimiento',{exact:true}).selectOption('out');await movement.getByLabel(language==='en'?'Quantity':'Cantidad',{exact:true}).fill('999');await movement.getByRole('button',{name:language==='en'?'Save':'Guardar',exact:true}).click();await expect(movement.getByRole('alert')).toContainText(language==='en'?'Stock cannot be negative.':'No se permiten existencias negativas.');await movement.getByRole('button',{name:language==='en'?'Cancel':'Cancelar',exact:true}).click();await confirmDiscard();await expect(movement).toHaveCount(0);await detail.getByRole('button',{name:language==='en'?'Record stock movement':'Registrar movimiento',exact:true}).click();await expect(movement).toBeVisible();await expect(movement.getByRole('alert')).toHaveCount(0);await movement.getByRole('button',{name:language==='en'?'Cancel':'Cancelar',exact:true}).click();await expect(movement).toHaveCount(0);
   }
   await detail.getByRole('button',{name:language==='en'?'Close':'Cerrar',exact:true}).first().click();await expect(detail).toHaveCount(0);
   await expectNoHorizontalOverflow(page);
   await page.screenshot({path:testInfo.outputPath(`project-style-${language}-${tab}.png`)});
  }
  await gotoOK(page,`/${language}/dashboard/profesional?tab=pro_clients`);
  const options=page.getByRole('button',{name:language==='en'?'More section options':'Más opciones de la sección',exact:true});
  await expect(options).toBeVisible();if(process.env.PRO_STYLE_NATIVE!=='1') {await page.setViewportSize({width:1366,height:900});
  await expect(options.filter({visible:true})).toHaveCount(1);await expect(options.locator('xpath=ancestor::*[@data-pro-section-actions-slot]')).toBeVisible();
  await page.setViewportSize({width:390,height:844});await expect(options.filter({visible:true})).toHaveCount(1);}
  await page.setViewportSize({width:320,height:720});
  await expectNoHorizontalOverflow(page);
  const actionButtons=records.first().locator('article > div').getByRole('button');
  await expect.poll(()=>actionButtons.evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1))).toBe(true);
  expect((await db.from('pro_workspaces').select('document,revision').eq('user_id',owner.id).single().throwOnError()).data).toEqual({document,revision:1});
  expect((await db.from('notifications').select('id').eq('user_id',owner.id).throwOnError()).data).toEqual([]);
 }finally{await page.goto('about:blank');await cleanupDisposableAccount(owner);}
});
