import {test,expect,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {expectNoHorizontalOverflow,onAppPageError} from './helpers';

// Read-only UI audit after disposable fixture setup: no form is submitted.
for(const language of ['es','en'] as const)test(`Pro form keyboard focus and loaded selectors [${language}]`,async({browser,browserName,baseURL},info)=>{
 test.setTimeout(240000);
 expect(baseURL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):3185\/?$/);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const actor=await createDisposableAccount({prefix:'pro-form-keyboard'}),db=regressionAdminClient();
 const context=await browser.newContext({baseURL,viewport:{width:browserName==='webkit'?390:1440,height:900}}),pages:Page[]=[],posts:string[]=[];

 try{
  const account=await db.auth.admin.getUserById(actor.id);
  expect((await db.auth.admin.updateUserById(actor.id,{user_metadata:{...account.data.user!.user_metadata,role:'professional',is_provider:true}})).error).toBeNull();
  await db.from('profiles').update({role:'professional',is_provider:true}).eq('id',actor.id).throwOnError();
  await db.from('pro_memberships').insert({user_id:actor.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:actor.id,category_id:'desarrollo_web',business_name:'Layout fixture',slug:'form-layout-'+actor.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  const workspaceDocument=emptyBusiness();
  workspaceDocument.clients=[{id:'layout-client',name:'Layout customer',email:'',phone:'',notes:'Preserve this note',archived:false}];
  workspaceDocument.products=[{id:'layout-product',name:'Layout product',sku:'LAYOUT',stock:4,minimum:1,cost:10,price:100,archived:false}];
  await db.from('pro_workspaces').insert({user_id:actor.id,document:workspaceDocument,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL!,sameSite:'Lax' as const})))}});
  expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();
  // Normalize only this fixture before taking a preservation snapshot.
  for(const kind of ['clients','products'])expect((await context.request.get('/api/pro/catalog?kind='+kind)).status()).toBe(200);
  const snapshot=async()=>{
   const value:Record<string,unknown>={};
   for(const table of ['pro_workspaces','pro_clients','pro_products','pro_work','pro_client_entries','pro_quote_links'])value[table]=(await db.from(table).select('*').eq('user_id',actor.id).throwOnError()).data;
   return value;
  };
  const before=await snapshot();
  const forms=[
   {name:'new-client',query:'tab=pro_clients&editar=new'},
   {name:'edit-client',query:'tab=pro_clients&editar=layout-client'},
   {name:'new-product',query:'tab=pro_inventory&editar=new'},
   {name:'edit-product',query:'tab=pro_inventory&editar=layout-product'},
   {name:'appointment',query:'tab=pro_agenda&nueva=1'},
   {name:'quote',query:'tab=quotes&nueva=1&cliente=layout-client'},
   {name:'expense',query:'tab=pro_expenses&gastoNuevo=1'},
   {name:'supplier',query:'tab=pro_expenses&proveedor=nuevo'},
   {name:'frequent-service',query:'tab=quotes&plantillaServicios=1'},
  ];
  const measurements:unknown[]=[];const runtimeErrors:string[]=[];context.on('page',page=>onAppPageError(page,message=>runtimeErrors.push(message)));
  for(const form of forms){
   const page=await context.newPage();pages.push(page);
   page.on('request',request=>{const url=new URL(request.url());if(request.method()==='POST'&&(url.pathname.startsWith('/api/pro/')||url.pathname==='/api/quotes'))posts.push(url.pathname);});
   await page.route('**/api/cedula/**',route=>route.fulfill({status:503,json:{error:'No external lookup in layout audit'}}));
   const prefix=language==='en'?'/en':'';
   if(form.name==='new-client'){await page.goto(prefix+'/dashboard/profesional?tab=pro_clients');const trigger=page.getByRole('button',{name:language==='en'?'New customer':'Nuevo cliente',exact:true});await expect(trigger).toBeEnabled();await trigger.focus();await trigger.press('Enter');}
   else await page.goto(prefix+'/dashboard/profesional?'+form.query);
   if(form.name==='frequent-service'){const trigger=page.getByRole('button',{name:language==='en'?'New frequent service':'Nuevo servicio frecuente',exact:true});await expect(trigger).toBeEnabled();await trigger.focus();await trigger.press('Enter');}
   const dialog=page.getByRole('dialog').last();
   if(form.name==='frequent-service')await expect(dialog.getByLabel(language==='en'?'Frequent service name':'Nombre del servicio frecuente',{exact:true})).toBeVisible();
   await expect(dialog.locator('input:not([type="hidden"]):visible').first()).toBeVisible();
   if(form.name.endsWith('client')){await expect(dialog.getByRole('combobox',{name:language==='en'?'Country':'País',exact:true})).toBeVisible();}
   if(form.name==='edit-client')await expect(dialog.getByLabel(language==='en'?'Name':'Nombre',{exact:true})).toHaveValue('Layout customer');
   if(form.name==='edit-product')await expect(dialog.getByLabel(language==='en'?'Name':'Nombre',{exact:true})).toHaveValue('Layout product');
   // Check final options, not an intermediate loading screenshot.
   if(form.name==='appointment')await expect(dialog.locator('select option').filter({hasText:'Layout customer'})).toHaveCount(1);
   if(form.name==='quote')await expect(dialog.locator('select option').filter({hasText:'Layout product'})).toHaveCount(1);
   await expect(dialog.getByText(/^(?:Cargando opciones|Loading options)/)).toHaveCount(0);
   await expect.poll(()=>dialog.evaluate(element=>({inside:element.contains(document.activeElement),activeTag:document.activeElement?.tagName,activeName:document.activeElement?.getAttribute('aria-label')})),{message:form.name+' initially owns keyboard focus'}).toMatchObject({inside:true});
   const count=await dialog.evaluate(element=>Array.from(element.querySelectorAll('button,input,select,textarea,summary,a[href],[tabindex]')).filter(node=>{
    const item=node as HTMLElement;if(item.tabIndex<0||item.matches(':disabled')||item.getClientRects().length===0)return false;
    for(let parent=item.parentElement;parent&&parent!==element;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement&&!parent.open&&!parent.querySelector(':scope > summary')?.contains(item))return false;
    return getComputedStyle(item).visibility!=='hidden';
   }).length);
   expect(count).toBeGreaterThan(2);
   for(let index=0;index<count+2;index++){
    await page.keyboard.press('Tab');
    const readFocus=()=>dialog.evaluate(element=>{
     const active=document.activeElement as HTMLElement|null;if(!active||!element.contains(active))return {inside:false,visible:false,label:active?.tagName};
     const rect=active.getBoundingClientRect(),hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
     return {inside:true,visible:!!hit&&(hit===active||active.contains(hit)),label:active.getAttribute('aria-label')||active.getAttribute('placeholder')||active.getAttribute('name')||active.textContent?.trim().slice(0,60)||active.tagName,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},hit:hit?.tagName,hitLabel:hit?.getAttribute('aria-label')};
    });
    const focus=await readFocus();expect(focus.inside,form.name+' Tab '+index).toBe(true);
    // WebKit scrolls a newly focused field after the key event. Wait for
    // the same control to be visible, without replacing the hit-test.
    try{await expect.poll(readFocus,{message:form.name+' focused control is visible: '+focus.label}).toMatchObject({inside:true,visible:true,label:focus.label});}
    catch(error){await info.attach(form.name+'-focus-'+index,{body:JSON.stringify(await readFocus()),contentType:'application/json'});await page.screenshot({path:info.outputPath(form.name+'-focus-'+index+'.png')});throw error;}
   }
   for(let index=0;index<count+2;index++){await page.keyboard.press('Shift+Tab');expect(await dialog.evaluate(element=>element.contains(document.activeElement)),form.name+' Shift+Tab '+index).toBe(true);}
   await expectNoHorizontalOverflow(page);
   measurements.push({form:form.name,language,focusableControls:count});
   await page.screenshot({path:info.outputPath(form.name+'-'+language+'-loaded.png'),fullPage:false});
   if(form.name==='new-client'){
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button',{name:language==='en'?'New customer':'Nuevo cliente',exact:true})).toBeFocused();
   }
   if(form.name==='frequent-service'){
    const name=dialog.getByLabel(language==='en'?'Frequent service name':'Nombre del servicio frecuente',{exact:true});
    await name.fill('Keyboard draft');const cancel=dialog.getByRole('button',{name:language==='en'?'Cancel':'Cancelar',exact:true});await cancel.focus();await cancel.press('Enter');
    const confirmation=page.getByRole('dialog',{name:language==='en'?'Leave without saving?':'¿Salir sin guardar?',exact:true});
    await expect(confirmation).toBeVisible();await expect.poll(()=>confirmation.evaluate(element=>element.contains(document.activeElement))).toBe(true);
    for(let index=0;index<5;index++){await page.keyboard.press('Tab');expect(await confirmation.evaluate(element=>element.contains(document.activeElement))).toBe(true);}
    await page.keyboard.press('Escape');await expect(confirmation).toHaveCount(0);await expect(name).toHaveValue('Keyboard draft');await expect(cancel).toBeFocused();
    await cancel.focus();await cancel.press('Enter');await confirmation.getByRole('button',{name:language==='en'?'Discard changes':'Descartar cambios',exact:true}).press('Enter');
    await expect(name).toHaveCount(0);await expect.poll(()=>dialog.evaluate(element=>element.contains(document.activeElement))).toBe(true);
   }
   await page.close();
  }
  expect(posts).toEqual([]);expect(await snapshot()).toEqual(before);expect(runtimeErrors).toEqual([]);
  await info.attach('form-keyboard-measurements',{body:JSON.stringify(measurements,null,2),contentType:'application/json'});
 }finally{
  for(const page of pages)await page.close().catch(()=>{});
  await context.close();await cleanupDisposableAccount(actor);
 }
});
