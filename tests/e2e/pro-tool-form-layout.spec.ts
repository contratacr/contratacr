import {test,expect,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {expectNoHorizontalOverflow} from './helpers';
import {stableSnapshotRows} from './stable-rows';

// Read-only UI audit after disposable fixture setup: no form is submitted.
for(const language of ['es','en'] as const)test(`Pro form controls and layout across supported widths [${language}]`,async({browser,browserName,baseURL},info)=>{
 test.setTimeout(240000);
 expect(baseURL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):3185\/?$/);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const actor=await createDisposableAccount({prefix:'pro-form-layout'}),db=regressionAdminClient();
 const context=await browser.newContext({baseURL,viewport:{width:390,height:844}}),pages:Page[]=[],posts:string[]=[];
 const sizes=browserName==='webkit'?[390]:[360,768,1440];
 try{
  const account=await db.auth.admin.getUserById(actor.id);
  expect((await db.auth.admin.updateUserById(actor.id,{user_metadata:{...account.data.user!.user_metadata,role:'professional',is_provider:true}})).error).toBeNull();
  await db.from('profiles').update({role:'professional',is_provider:true}).eq('id',actor.id).throwOnError();
  await db.from('pro_memberships').insert({user_id:actor.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:actor.id,category_id:'desarrollo_web',business_name:'Layout fixture',slug:'form-layout-'+actor.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  const document=emptyBusiness();
  document.clients=[{id:'layout-client',name:'Layout customer',email:'',phone:'',notes:'Preserve this note',archived:false}];
  document.products=[{id:'layout-product',name:'Layout product',sku:'LAYOUT',stock:4,minimum:1,cost:10,price:100,archived:false}];
  await db.from('pro_workspaces').insert({user_id:actor.id,document,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL!,sameSite:'Lax' as const})))}});
  expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();
  // Normalize only this fixture before taking a preservation snapshot.
  for(const kind of ['clients','products'])expect((await context.request.get('/api/pro/catalog?kind='+kind)).status()).toBe(200);
  const snapshot=async()=>{
   const value:Record<string,unknown>={};
   for(const table of ['pro_workspaces','pro_clients','pro_products','pro_work','pro_client_entries','pro_quote_links'])value[table]=stableSnapshotRows((await db.from(table).select('*').eq('user_id',actor.id).throwOnError()).data);
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
  // Compile the cold dev API routes the frequent-service list waits on (dev webpack compiles on first hit).
  for(const path of ['/api/pro/service-packages?filter=active','/api/pro/quotes'])expect((await context.request.get(path,{timeout:90000})).status()).toBeLessThan(500);
  const measurements:unknown[]=[];
  for(const form of forms){
   const page=await context.newPage();pages.push(page);
   page.on('request',request=>{const url=new URL(request.url());if(request.method()==='POST'&&(url.pathname.startsWith('/api/pro/')||url.pathname==='/api/quotes'))posts.push(url.pathname);});
   await page.route('**/api/cedula/**',route=>route.fulfill({status:503,json:{error:'No external lookup in layout audit'}}));
   await page.goto((language==='en'?'/en':'')+'/dashboard/profesional?'+form.query);
   if(form.name==='frequent-service'){const create=page.getByRole('button',{name:language==='en'?'New frequent service':'Nuevo servicio frecuente',exact:true});await expect(create).toBeEnabled({timeout:45000});await create.click();}
   const dialog=page.getByRole('dialog').last();
   await expect(dialog.locator('input:not([type="hidden"]):visible').first()).toBeVisible();
   if(form.name.endsWith('client')){await expect(dialog.getByRole('combobox',{name:language==='en'?'Country':'País',exact:true})).toBeVisible();}
   if(form.name==='edit-client')await expect(dialog.getByLabel(language==='en'?'Name':'Nombre',{exact:true})).toHaveValue('Layout customer');
   if(form.name==='edit-product')await expect(dialog.getByLabel(language==='en'?'Name':'Nombre',{exact:true})).toHaveValue('Layout product');
   for(const width of sizes){
    await page.setViewportSize({width,height:900});
    await expectNoHorizontalOverflow(page);
    const measured=await dialog.evaluate(element=>{
     const controls=Array.from(element.querySelectorAll('button,summary,input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),select,textarea')).filter(node=>{const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return rect.width>0&&rect.height>0&&style.visibility!=='hidden'&&!node.closest('[hidden]');});
     return {overflow:element.scrollWidth-element.clientWidth,controls:controls.map(node=>{const rect=node.getBoundingClientRect();return {tag:node.tagName,label:node.getAttribute('aria-label')||node.textContent?.trim().slice(0,80)||node.getAttribute('name'),width:rect.width,height:rect.height};})};
    });
    expect(measured.overflow,form.name+' '+width).toBeLessThanOrEqual(1);
    expect(measured.controls.length).toBeGreaterThan(2);
    expect.soft(measured.controls.filter(control=>control.height<43.5),form.name+' '+width+' short controls').toEqual([]);
    expect.soft(measured.controls.filter(control=>control.tag==='BUTTON'&&control.width<43.5),form.name+' '+width+' narrow buttons').toEqual([]);
    measurements.push({form:form.name,language,width,...measured});
    await page.screenshot({path:info.outputPath(form.name+'-'+language+'-'+width+'.png'),fullPage:true});
   }
   await page.close();
  }
  expect(posts).toEqual([]);expect(await snapshot()).toEqual(before);
  await info.attach('form-layout-measurements',{body:JSON.stringify(measurements,null,2),contentType:'application/json'});
 }finally{
  for(const page of pages)await page.close().catch(()=>{});
  await context.close();await cleanupDisposableAccount(actor);
 }
});
