import {test,expect,type Route} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import type {ServicePackageInput,ServicePackagePage} from '../../src/lib/pro/service-packages';
import {expectNoHorizontalOverflow,warmLocalRoutes,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

const api='/api/pro/service-packages';
const copy={
 es:{actions:'Acciones del servicio frecuente',edit:'Editar servicio frecuente',taxReference:'Referencia fiscal',cabysLabel:'Código CABYS',title:'Servicios frecuentes',add:'Nuevo servicio frecuente',name:'Nombre del servicio frecuente',description:'Descripción de línea 1',price:'Precio de línea 1',save:'Guardar',cancel:'Cancelar',close:'Cerrar',retry:'Reintentar guardado',archive:'Archivar',restore:'Restaurar',active:'Activos',archived:'Archivados',uncertain:'No pudimos confirmar el guardado.',recovered:'Hay un guardado pendiente de comprobar.',saved:'Servicio frecuente guardado.',current:'Guardado comprobado. Se muestran los datos actuales.'},
 en:{actions:'Frequent service actions',edit:'Edit frequent service',taxReference:'Tax reference',cabysLabel:'CABYS code',title:'Frequent services',add:'New frequent service',name:'Frequent service name',description:'Line description 1',price:'Line price 1',save:'Save',cancel:'Cancel',close:'Close',retry:'Retry save',archive:'Archive',restore:'Restore',active:'Active',archived:'Archived',uncertain:'We could not confirm the save.',recovered:'A save needs to be checked.',saved:'Frequent service saved.',current:'Save verified. Current details are shown.'},
};

for(const language of ['es','en'] as const)test(`Frequent services keep exact writes and verify confirmed recovery across reloads [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(180000);
 expect(baseURL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):3185\/?$/);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'package-write-recovery'}),db=regressionAdminClient(),text=copy[language];
 const key='contratacr:service-package-attempt:'+owner.id,headers={origin:new URL(baseURL!).origin};
 const posts:string[]=[],errors:string[]=[];let mode:'ordinary'|'lost'|'401'|'403'|'ack-failed-read'='ordinary',failedRead=false,bodyError:unknown;
 onAppPageError(page,message=>errors.push(message));
 async function read(){const response=await page.request.get(api+'?filter=active');expect(response.status()).toBe(200);return response.json() as Promise<ServicePackagePage>;}
 async function stored(){return page.evaluate(storageKey=>localStorage.getItem(storageKey),key);}
 async function requests(){return (await db.from('pro_service_package_requests').select('request_id,input,result').eq('user_id',owner.id).order('request_id').throwOnError()).data!;}
 async function packageRows(){return (await db.from('pro_service_packages').select('*').eq('user_id',owner.id).order('id').throwOnError()).data!;}
 async function preserved(){
  const result:Record<string,unknown>={};
  for(const table of ['pro_workspaces','pro_clients','pro_products','pro_work','pro_client_entries','pro_legacy_quotes','pro_invoice_drafts']){
   result[table]=(await db.from(table).select('*').eq('user_id',owner.id).throwOnError()).data;
  }
  return result;
 }
 async function mutate(action:'save'|'archive'|'restore',id:string,value?:ServicePackageInput){
  const revision=(await read()).revision,input={action,id,revision,requestId:crypto.randomUUID(),...(value?{package:value}:{})};
  const response=await page.request.post(api,{headers,data:input});expect(response.status()).toBe(200);return input;
 }
 const manager=page.getByRole('dialog',{name:text.title,exact:true});
 const retry=()=>manager.getByRole('button',{name:text.retry,exact:true});
 const card=(name:string)=>manager.locator('article').filter({has:page.getByRole('heading',{name,exact:true})});
 async function cardAction(name:string,action:string){
  const row=card(name),trigger=row.getByRole('button',{name:text.actions,exact:true});
  await expect(row.getByRole('button',{name:text.edit,exact:true})).toBeEnabled();
  await expect(page.getByRole('menuitem',{name:action,exact:true})).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-haspopup','menu');await expect(trigger).toHaveAttribute('aria-expanded','false');
  expect(await trigger.evaluate(element=>['Top','Right','Bottom','Left'].every(side=>getComputedStyle(element).getPropertyValue('border-'+side.toLowerCase()+'-width')==='0px'))).toBe(true);
  const triggerBox=await trigger.boundingBox();expect(triggerBox!.width).toBeGreaterThanOrEqual(44);expect(triggerBox!.height).toBeGreaterThanOrEqual(44);
  await trigger.focus();await expect(trigger).toBeFocused();await page.keyboard.press('Enter');await expect(trigger).toHaveAttribute('aria-expanded','true');
  const item=page.getByRole('menuitem',{name:action,exact:true});await expect(item).toBeVisible();await expect(item).toBeFocused();
  const controlledMenu=await trigger.getAttribute('aria-controls');expect(controlledMenu).toBeTruthy();await expect(page.getByRole('menu')).toHaveAttribute('id',controlledMenu!);
  await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);await expect(trigger).toBeFocused();await expect(manager).toBeVisible();
  await page.keyboard.press('Enter');await expect(item).toBeFocused();const itemBox=await item.boundingBox();expect(itemBox!.height).toBeGreaterThanOrEqual(44);expect(itemBox!.width).toBeGreaterThanOrEqual(44);
  await page.screenshot({path:info.outputPath('frequent-service-menu-'+action+'-'+language+'.png'),fullPage:true});
  await page.keyboard.press('Enter');await expect(page.getByRole('menu')).toHaveCount(0);await expect(manager).toBeVisible();
 }
 async function newService(name:string){
  await manager.getByRole('button',{name:text.add,exact:true}).click();
  await manager.getByLabel(text.name,{exact:true}).fill(name);
  await manager.getByLabel(text.description,{exact:true}).fill('Reusable service scope');
  await manager.getByLabel(text.price,{exact:true}).fill('1250');
 }
 async function blocked(){
  await expect(manager.getByLabel(text.name,{exact:true})).toBeDisabled();
  await expect(manager.getByRole('button',{name:text.save,exact:true})).toBeDisabled();
  await expect(manager.getByRole('button',{name:text.cancel,exact:true})).toBeDisabled();
  await manager.getByRole('button',{name:text.close,exact:true}).click();await expect(manager).toBeVisible();
  await page.keyboard.press('Escape');await expect(manager).toBeVisible();
 }
 async function rejectOrForward(route:Route){
  if(route.request().method()==='GET'){
   if(failedRead&&new URL(route.request().url()).searchParams.has('id'))return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fixture verification unavailable'})});
   return route.continue();
  }
  if(route.request().method()!=='POST')return route.continue();
  posts.push(route.request().postData()!);
  if(mode==='401'||mode==='403')return route.fulfill({status:Number(mode),contentType:'application/json',body:JSON.stringify({error:'Fixture session unavailable'})});
  if(mode==='lost'){const response=await route.fetch();expect(response.status()).toBe(200);return route.abort();}
  if(mode==='ack-failed-read'){const response=await route.fetch();expect(response.status()).toBe(200);failedRead=true;return route.fulfill({response});}
  return route.continue();
 }
 try{
  const account=await db.auth.admin.getUserById(owner.id);
  expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,role:'professional',is_provider:true}})).error).toBeNull();
  await db.from('profiles').update({role:'professional',is_provider:true}).eq('id',owner.id).throwOnError();
  await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  const professional=(await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Recovery fixture',slug:'package-recovery-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false}).select('id').single().throwOnError()).data!;
  await db.from('notification_once_receipts').insert({user_id:owner.id,type:'resena_google',status:'historical_unknown',sent_at:null}).throwOnError();
  const workspaceDocument=emptyBusiness();workspaceDocument.clients=[{id:'preserved-client',name:'Preserved customer',email:'',phone:'',notes:'Keep existing data',archived:false}];
  workspaceDocument.products=[{id:'preserved-product',name:'Preserved stock',sku:'KEEP',stock:8,minimum:1,cost:10,price:100,category:'Preserved category',unit:'Sp',cabys:'1234567890123',archived:false},{id:'preserved-no-tax',name:'Preserved without fiscal reference',sku:'NO-TAX',stock:2,minimum:0,cost:5,price:50,archived:false}];
  workspaceDocument.work=[{id:'preserved-work',clientId:'preserved-client',client:'Preserved customer',service:'Existing work',stage:'completed',start:'2026-01-01T10:00:00-06:00',end:'2026-01-01T11:00:00-06:00',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document:workspaceDocument,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>page.context().addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL!,sameSite:'Lax' as const})))}});
  expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
  // Normalize only these disposable legacy rows before taking the preservation baseline.
  const initialCatalog=await page.request.get('/api/pro/catalog?kind=products');expect(initialCatalog.status()).toBe(200);expect((await initialCatalog.json()).items).toEqual(expect.arrayContaining(workspaceDocument.products));
  const baseline=await preserved(),quoteBaseline=(await db.from('quotes').select('*').eq('professional_id',professional.id).throwOnError()).data;
  // Cold dev compilation of these routes exceeded 12 s in the 11-nov run (category C); compile them before the timed UI.
  await stabilizeLocalProRuntime(page.context(),baseURL!);await warmLocalRoutes(page,['/api/pro/service-packages?filter=active','/api/pro/quotes','/api/pro/catalog?kind=clients',(language==='en'?'/en':'/es')+'/dashboard/profesional?tab=quotes']);
  await page.route('**/api/pro/service-packages**',rejectOrForward);
  await page.goto((language==='en'?'/en':'')+'/dashboard/profesional?tab=quotes&plantillaServicios=1');
  await expect(manager.getByRole('button',{name:text.add,exact:true})).toBeEnabled();expect(await stored()).toBeNull();

  // Lost POST acknowledgement: both authentication errors must keep one exact action.
  await newService('Exact recovery '+language);mode='lost';await manager.getByRole('button',{name:text.save,exact:true}).click();
  await expect(manager.getByRole('alert')).toContainText(text.uncertain);await blocked();
  const initial=JSON.parse((await stored())!),firstInput=JSON.parse(initial.body);
  expect(initial).toMatchObject({version:2,editing:null,ack:null});expect(posts).toEqual([initial.body]);expect(await requests()).toHaveLength(1);expect(await packageRows()).toHaveLength(1);
  for(const status of ['401','403'] as const){mode=status;const rejected=page.waitForResponse(response=>new URL(response.url()).pathname===api&&response.request().method()==='POST'&&response.status()===Number(status));await retry().click();await rejected;await expect(retry()).toBeEnabled();await expect(manager.getByRole('alert')).toContainText(text.uncertain);expect(await stored()).toBe(JSON.stringify(initial));await blocked();}
  const beforeReload=posts.length;await page.reload();await expect(manager.getByRole('alert')).toContainText(text.recovered);await blocked();expect(posts).toHaveLength(beforeReload);expect(await stored()).toBe(JSON.stringify(initial));
  mode='ordinary';await retry().click();await expect(manager).toContainText(text.saved);await expect.poll(stored).toBeNull();
  expect(posts).toHaveLength(4);expect(posts.every(body=>body===initial.body)).toBe(true);expect(await requests()).toHaveLength(1);expect(await packageRows()).toHaveLength(1);
  expect((await requests())[0].input).toEqual(firstInput);

  // A received ACK is persisted even when its canonical GET fails. Reload/retry
  // must use reads only, never send a second POST with an already confirmed action.
  await newService('Confirmed recovery '+language);mode='ack-failed-read';await manager.getByRole('button',{name:text.save,exact:true}).click();
  await expect(manager.getByRole('alert')).toContainText(text.uncertain);const confirmed=JSON.parse((await stored())!);
  expect(confirmed.ack).toEqual({id:JSON.parse(confirmed.body).id,revision:JSON.parse(confirmed.body).revision+1});await blocked();
  const confirmedPosts=posts.length;const unavailable=page.waitForResponse(response=>new URL(response.url()).pathname===api&&response.request().method()==='GET'&&response.status()===503);await retry().click();await unavailable;await expect(retry()).toBeEnabled();expect(posts).toHaveLength(confirmedPosts);expect(await stored()).toBe(JSON.stringify(confirmed));
  await page.reload();await expect(manager.getByRole('alert')).toContainText(text.recovered);await blocked();expect(posts).toHaveLength(confirmedPosts);
  mode='ordinary';failedRead=false;await retry().click();await expect(manager).toContainText(text.saved);await expect.poll(stored).toBeNull();expect(posts).toHaveLength(confirmedPosts);expect(await requests()).toHaveLength(2);expect(await packageRows()).toHaveLength(2);

  // Archive ACK and a newer change in another tab: accept current canonical
  // state without replaying the archive or forcing the old filter's state.
  mode='ack-failed-read';await cardAction('Exact recovery '+language,text.archive);await expect(manager.getByRole('alert')).toContainText(text.uncertain);
  await expect(manager.getByRole('button',{name:text.actions,exact:true})).toHaveCount(0);
  const archivedAttempt=JSON.parse((await stored())!);expect(JSON.parse(archivedAttempt.body)).toMatchObject({action:'archive',id:firstInput.id});expect(archivedAttempt.ack).not.toBeNull();
  const archivePosts=posts.length;await mutate('restore',firstInput.id);await page.reload();await expect(manager.getByRole('alert')).toContainText(text.recovered);expect(posts).toHaveLength(archivePosts);
  mode='ordinary';failedRead=false;await retry().click();await expect(manager).toContainText(text.current);await expect.poll(stored).toBeNull();await expect(card('Exact recovery '+language)).toBeVisible();expect(posts).toHaveLength(archivePosts);

  // Restore ACK with a newer edit+archive must find the canonical archived row,
  // preserve its new content, and leave all previous document/stock data intact.
  await mutate('archive',firstInput.id);await manager.getByRole('button',{name:text.archived,exact:true}).click();
  await expect(card('Exact recovery '+language)).toBeVisible();mode='ack-failed-read';await cardAction('Exact recovery '+language,text.restore);await expect(manager.getByRole('alert')).toContainText(text.uncertain);
  await expect(manager.getByRole('button',{name:text.actions,exact:true})).toHaveCount(0);
  const restoreAttempt=JSON.parse((await stored())!);expect(JSON.parse(restoreAttempt.body)).toMatchObject({action:'restore',id:firstInput.id});expect(restoreAttempt.ack).not.toBeNull();const restorePosts=posts.length;
  const newerValue:ServicePackageInput={...firstInput.package,name:'Newer canonical '+language,notes:'Edited in another tab; preserve this.',lines:[{...firstInput.package.lines[0],unitPrice:'1750'}]};
  await mutate('save',firstInput.id,newerValue);await mutate('archive',firstInput.id);
  await page.reload();await expect(manager.getByRole('alert')).toContainText(text.recovered);expect(posts).toHaveLength(restorePosts);mode='ordinary';failedRead=false;await retry().click();await expect(manager).toContainText(text.current);await expect.poll(stored).toBeNull();expect(posts).toHaveLength(restorePosts);
  await manager.getByRole('button',{name:text.archived,exact:true}).click();await expect(card(newerValue.name)).toBeVisible();await expect(card('Exact recovery '+language)).toHaveCount(0);
  const latest=(await page.request.get(api+'?'+new URLSearchParams({id:firstInput.id,filter:'archived'})));expect(latest.status()).toBe(200);expect((await latest.json()).items).toEqual([expect.objectContaining({...newerValue,id:firstInput.id,archived:true})]);
  expect(await packageRows()).toHaveLength(2);expect(await requests()).toHaveLength(8);expect(await preserved()).toEqual(baseline);expect((await db.from('quotes').select('*').eq('professional_id',professional.id).throwOnError()).data).toEqual(quoteBaseline);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath('frequent-service-recovery-'+language+'.png'),fullPage:true});
  // Fiscal metadata stays out of the main product information, without deleting it.
  await manager.getByRole('button',{name:text.close,exact:true}).click();
  await page.goto((language==='en'?'/en':'')+'/dashboard/profesional?tab=pro_inventory&producto=preserved-product');
  const productDetail=page.getByRole('dialog');await expect(productDetail).toContainText('Preserved stock');
  await expect(productDetail.getByText('Preserved category · Sp',{exact:true})).toBeVisible();
  const fiscal=productDetail.locator('[data-product-detail-fiscal-reference]');await expect(fiscal).toHaveCount(1);await expect(fiscal).not.toHaveAttribute('open');
  const cabys=productDetail.getByText(text.cabysLabel+': 1234567890123',{exact:true});await expect(cabys).toBeHidden();
  await fiscal.getByText(text.taxReference,{exact:true}).click();await expect(fiscal).toHaveAttribute('open','');await expect(cabys).toBeVisible();
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath('product-fiscal-expanded-'+language+'.png'),fullPage:true});
  await fiscal.getByText(text.taxReference,{exact:true}).click();await expect(cabys).toBeHidden();
  await productDetail.getByRole('button',{name:text.close,exact:true}).click();
  await page.goto((language==='en'?'/en':'')+'/dashboard/profesional?tab=pro_inventory&producto=preserved-no-tax');
  await expect(productDetail).toContainText('Preserved without fiscal reference');await expect(productDetail.locator('[data-product-detail-fiscal-reference]')).toHaveCount(0);
  const finalCatalog=await page.request.get('/api/pro/catalog?kind=products');expect(finalCatalog.status()).toBe(200);expect((await finalCatalog.json()).items).toEqual(expect.arrayContaining(workspaceDocument.products));expect(await preserved()).toEqual(baseline);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath('product-without-fiscal-reference-'+language+'.png'),fullPage:true});expect(errors).toEqual([]);
 }catch(error){bodyError=error;throw error;}finally{
  await page.goto('about:blank').catch(()=>{});
  try{await cleanupDisposableAccount(owner);}catch(cleanupError){throw new AggregateError(bodyError?[bodyError,cleanupError]:[cleanupError],'Frequent service fixture cleanup failed',{cause:bodyError});}
 }
});
