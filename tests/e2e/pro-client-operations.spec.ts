import {test,expect,type BrowserContext,type Page,type Route} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {expectNoHorizontalOverflow} from './helpers';
import {clientOperationRecoveryKey} from '../../src/lib/pro/client-operation-recovery';

test('Pro ficha integrada: trabajo, materiales, abonos, reversión e historial conservado',async({page:initialPage,browser,baseURL},testInfo)=>{
 let page=initialPage;
 test.setTimeout(180000);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'pro-operations-owner'}),other=await createDisposableAccount({prefix:'pro-operations-other'}),db=regressionAdminClient();
 let foreign:BrowserContext|undefined;
 async function login(context:BrowserContext,actor:typeof owner){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();return auth;}
 try{
  for(const actor of [owner,other]){const account=await db.auth.admin.getUserById(actor.id);expect((await db.auth.admin.updateUserById(actor.id,{user_metadata:{...account.data.user!.user_metadata,role:'professional',is_provider:true}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',actor.id).throwOnError();await db.from('pro_memberships').insert({user_id:actor.id,status:'active'}).throwOnError();}
  for(const actor of [owner,other])await db.from('professionals').insert({profile_id:actor.id,category_id:'desarrollo_web',business_name:'Operaciones locales',slug:'operations-'+actor.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  const client={id:'retained-client',name:'Cliente integrado',email:'',phone:'',notes:'Conservar sin cambios',archived:false};
  const document=emptyBusiness();document.clients=[client,{...client,id:'other-client',name:'Otro cliente'}];
  document.products=[{id:'material',name:'Pintura local',sku:'MAT-1',stock:3,minimum:1,cost:125.25,price:200,archived:false}];
  document.quotes=[{id:'quote',clientId:client.id,title:'Presupuesto asociado',status:'accepted',validUntil:'2027-12-01',lines:[{description:'Servicio',quantity:1,price:1000,tax:0}]}];
  document.work=[{id:'work',clientId:client.id,client:client.name,service:'Pintar habitación',stage:'completed',start:'2026-11-15T09:00:00-06:00',end:'2026-11-15T10:00:00-06:00',cancelled:false,quoteId:'quote'},{id:'work2',clientId:client.id,client:client.name,service:'Visita adicional',stage:'new',start:'',end:'',cancelled:false,quoteId:'quote'}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  const auth=await login(page.context(),owner);
  const endpoint='/api/pro/client-operations?'+new URLSearchParams({clientId:client.id,workId:'work'});
  const initial=await page.request.get(endpoint);expect(initial.status()).toBe(200);expect((await initial.json()).summary).toEqual({agreedCents:0,paidCents:0,balanceCents:0,unpriced:2,creditNotesCents:0,customerBalanceCents:0});
  expect((await auth.rpc('pro_client_operations_page',{p_user:owner.id,p_client:client.id})).error).not.toBeNull();
  foreign=await browser.newContext();await login(foreign,other);expect((await foreign.request.get(endpoint)).status()).toBe(404);
  expect((await page.request.post('/api/pro/client-operations',{data:{}})).status()).toBe(403); // Missing same-origin header.
  const forbidden:string[]=[];
  await page.route('**/api/pro/workspace**',route=>{forbidden.push(route.request().url());return route.abort();});
  for(const path of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(path)).status()).toBe(200);
  await page.goto('/en/dashboard/profesional?tab=pro_clients&cliente='+client.id+'&cuenta=work&registro=agreement');const english=page.getByRole('dialog',{name:'Agreed amount',exact:true});await english.getByRole('spinbutton',{name:'Amount in CRC',exact:true}).fill('12.34');await expect(english.getByRole('button',{name:'Save',exact:true})).toHaveAttribute('form','pro-client-operation');await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('client-amount-en.png'),fullPage:true});await english.getByRole('button',{name:'Cancel',exact:true}).click();await expect(english).toHaveCount(0);expect((await(await page.request.get(endpoint)).json()).summary).toEqual({agreedCents:0,paidCents:0,balanceCents:0,unpriced:2,creditNotesCents:0,customerBalanceCents:0});await page.context().addCookies([{name:'NEXT_LOCALE',value:'es',url:baseURL!}]);
  await page.goto('/es/dashboard/profesional?tab=pro_clients&cliente='+client.id);
  const recovery=page.locator('[data-session-recovery]');await expect(page.locator('[data-client-operations], [data-session-recovery]').first()).toBeVisible();
  if(await recovery.isVisible()){await recovery.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(recovery).toHaveCount(0);}
  let operations=page.locator('[data-client-operations]');await expect(operations).toContainText('2 trabajos sin importe acordado');
  await operations.getByRole('button',{name:/Pintar habitación/}).click();
  const account=()=>page.getByRole('dialog',{name:'Gestionar trabajo',exact:true});
  await expect(account()).toContainText('Sin definir');await expect(page).toHaveURL(/cuenta=work/);
  await account().getByRole('button',{name:'Ver cotización asociada'}).click();await expect(page.getByRole('dialog').last()).toContainText('Presupuesto asociado');
  expect(new URL(page.url()).searchParams.get('volverCliente')).toContain('cuenta=work');
  // Native WebView reloads can lose the custom parent entry. The saved origin
  // must still return to the job, rather than just the quotes list.
  await page.evaluate(()=>{const state={...window.history.state};delete state.ccrProNavigation;window.history.replaceState(state,'');});
  await page.reload();await expect(page.getByRole('dialog').last()).toContainText('Presupuesto asociado');
  await page.getByRole('dialog').last().getByRole('button',{name:'Cerrar',exact:true}).click();await expect(account()).toBeVisible();
  await account().getByRole('button',{name:'Definir importe',exact:true}).click();
  await expect(page).toHaveURL(/registro=agreement/);
  await page.getByRole('spinbutton',{name:'Monto en colones'}).fill('1000.01');await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(account()).toContainText('₡1.000,01');await expect(account().getByRole('button',{name:'Registrar abono',exact:true})).toBeVisible();
  await account().getByRole('button',{name:'Registrar material',exact:true}).click();
  await page.getByRole('combobox',{name:'Producto',exact:true}).selectOption('material');await page.getByRole('spinbutton',{name:'Cantidad utilizada'}).fill('1.5');
  // Refuse to risk a write if its recovery bytes cannot be retained locally.
  const materialPosts:string[]=[];page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/pro/client-operations')materialPosts.push(request.postData()!);});
  await page.evaluate(()=>{
   const original=Storage.prototype.setItem;
   (window as Window&{restoreProStorage?:()=>void}).restoreProStorage=()=>{Storage.prototype.setItem=original;};
   Storage.prototype.setItem=function(key,value){if(key.startsWith('ccr:client-operation:v1:'))throw new DOMException('Local storage disabled','QuotaExceededError');return original.call(this,key,value);};
  });
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  const materialForm=page.getByRole('dialog',{name:'Registrar material utilizado',exact:true});
  await expect(materialForm.getByRole('button',{name:'Reintentar la misma acción',exact:true})).toBeVisible();expect(materialPosts).toHaveLength(0);
  expect((await db.from('pro_products').select('stock').eq('user_id',owner.id).eq('id','material').single().throwOnError()).data!.stock).toBe(3);
  await expect(materialForm.getByRole('spinbutton',{name:'Cantidad utilizada'})).toHaveValue('1.5');
  await page.evaluate(()=>{(window as Window&{restoreProStorage?:()=>void}).restoreProStorage?.();});
  await materialForm.getByRole('button',{name:'Reintentar la misma acción',exact:true}).click();await expect(account()).toContainText('Pintura local · 1.5');expect(materialPosts).toHaveLength(1);
  await expect.poll(async()=>{const row=await db.from('pro_products').select('stock').eq('user_id',owner.id).eq('id','material').single();return row.data?.stock;}).toBe(1.5);
  // Commit the payment, then lose its HTTP acknowledgement. The only safe retry
  // must retain the original action id, revision and complete request body.
  const paymentAttempts:string[]=[];let failNextRead=false;
  const paymentRoute=async(route:Route)=>{
   if(route.request().method()==='POST'&&route.request().postDataJSON().kind==='payment'){
    paymentAttempts.push(route.request().postData()!);
    const response=await route.fetch();expect(response.status()).toBe(200);
    if(paymentAttempts.length===1){await route.abort('failed');return;}
    failNextRead=true;await route.fulfill({response});return;
   }
   await route.continue();
  };
  const bindPaymentRoutes=async(target:Page)=>{
   await target.route('**/api/pro/client-operations',paymentRoute);
   await target.route('**/api/pro/client-operations?*',route=>{if(failNextRead){failNextRead=false;return route.abort('failed');}return route.continue();});
  };
  await bindPaymentRoutes(page);
  await account().getByRole('button',{name:'Registrar abono',exact:true}).click();
  const paymentForm=page.getByRole('dialog',{name:'Registrar abono',exact:true});
  await paymentForm.getByRole('spinbutton',{name:'Monto en colones'}).fill('400.01');await paymentForm.getByRole('textbox',{name:'Referencia o nota (opcional)'}).fill('Transferencia recibida');
  const paymentPath=page.url();await paymentForm.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(paymentForm.getByRole('alert')).toContainText('No pudimos confirmar el resultado');
  await expect(paymentForm.getByRole('spinbutton',{name:'Monto en colones'})).toBeDisabled();await expect(paymentForm.getByRole('spinbutton',{name:'Monto en colones'})).toHaveValue('400.01');
  await expect(paymentForm.getByRole('textbox',{name:'Referencia o nota (opcional)'})).toBeDisabled();await expect(paymentForm.getByRole('textbox',{name:'Referencia o nota (opcional)'})).toHaveValue('Transferencia recibida');
  await expect(paymentForm.getByRole('button',{name:'Cancelar',exact:true})).toBeDisabled();await expect(paymentForm.getByRole('button',{name:'Guardar',exact:true})).toHaveCount(0);
  await paymentForm.getByRole('button',{name:'Cerrar',exact:true}).click();await expect(paymentForm).toBeVisible();await expect(page).toHaveURL(paymentPath);
  // A hidden parent can still receive a close callback from native navigation
  // or nested modal listeners. It must not unmount the unresolved payment.
  await page.getByRole('dialog',{name:client.name,exact:true,includeHidden:true}).getByRole('button',{name:'Cerrar',exact:true,includeHidden:true}).dispatchEvent('click');
  await expect(paymentForm).toBeVisible();await expect(page).toHaveURL(paymentPath);
  await page.keyboard.press('Escape');await expect(paymentForm).toBeVisible();await expect(page).toHaveURL(paymentPath);
  await page.goBack();await expect(page).toHaveURL(paymentPath);await expect(paymentForm).toBeVisible();
  expect(paymentAttempts).toHaveLength(1);
  const firstPayment=JSON.parse(paymentAttempts[0]);expect(firstPayment).toMatchObject({clientId:client.id,workId:'work',kind:'payment',amountCents:40001,note:'Transferencia recibida'});expect(firstPayment.actionId).toBeTruthy();expect(firstPayment.revision).toEqual(expect.any(Number));
  const committed=await(await page.request.get(endpoint)).json();expect(committed.summary.paidCents).toBe(40001);expect(committed.entries.filter((entry:{kind:string})=>entry.kind==='payment')).toHaveLength(1);
  const recoveryKey=clientOperationRecoveryKey(owner.id,client.id),recoveryBytes=await page.evaluate(key=>localStorage.getItem(key),recoveryKey);expect(recoveryBytes).toBeTruthy();expect(JSON.parse(recoveryBytes!).body).toBe(paymentAttempts[0]);
  // A different authenticated account in the same browser must not recover or
  // display the previous account's payment, even with identical client/work ids.
  const otherDocument=emptyBusiness();otherDocument.clients=[client];otherDocument.work=document.work;await db.from('pro_workspaces').insert({user_id:other.id,document:otherDocument,revision:1}).throwOnError();
  const foreignRecoveryKey=clientOperationRecoveryKey(other.id,client.id);
  await foreign!.addInitScript(({key,foreignKey,bytes})=>{localStorage.setItem(key,bytes);localStorage.setItem(foreignKey,bytes);},{key:recoveryKey,foreignKey:foreignRecoveryKey,bytes:recoveryBytes!});
  const foreignPage=await foreign!.newPage();await foreignPage.goto('/en/dashboard/profesional?tab=pro_clients&cliente='+client.id+'&cuenta=work&registro=payment');
  const foreignForm=foreignPage.getByRole('dialog',{name:'Record payment',exact:true});await expect(foreignForm.getByRole('spinbutton',{name:'Amount in CRC'})).toHaveValue('');await expect(foreignForm.getByRole('textbox',{name:'Reference or note (optional)'})).toHaveValue('');await expect(foreignForm.getByRole('button',{name:'Retry the same action',exact:true})).toHaveCount(0);await expect(foreignForm.getByRole('button',{name:'Save',exact:true})).toBeDisabled();await expect(foreignForm.getByRole('alert')).toContainText('Local recovery storage is unavailable');expect(await foreignPage.evaluate(key=>localStorage.getItem(key),foreignRecoveryKey)).toBe(recoveryBytes);await foreignPage.close();
  // Closing the tab bypasses beforeunload deliberately. Reopening in English
  // restores the exact action but never sends it without an explicit retry.
  const ownerContext=page.context();await page.close();page=await ownerContext.newPage();await bindPaymentRoutes(page);
  await page.route('**/api/pro/workspace**',route=>{forbidden.push(route.request().url());return route.abort();});
  await page.goto('/en/dashboard/profesional?tab=pro_clients&cliente='+client.id+'&cuenta=work&registro=payment');
  const recoveredForm=page.getByRole('dialog',{name:'Record payment',exact:true});await expect(recoveredForm.getByRole('button',{name:'Retry the same action',exact:true})).toBeVisible();expect(paymentAttempts).toHaveLength(1);
  await expect(recoveredForm.getByRole('spinbutton',{name:'Amount in CRC'})).toHaveValue('400.01');await expect(recoveredForm.getByRole('spinbutton',{name:'Amount in CRC'})).toBeDisabled();await expect(recoveredForm.getByRole('textbox',{name:'Reference or note (optional)'})).toHaveValue('Transferencia recibida');
  await recoveredForm.getByRole('button',{name:'Retry the same action',exact:true}).click();
  await expect(recoveredForm.getByRole('button',{name:'Retry reading',exact:true})).toBeVisible();await expect(recoveredForm.getByRole('alert').first()).toContainText('Could not load jobs');
  expect(paymentAttempts).toHaveLength(2);expect(paymentAttempts[1]).toBe(paymentAttempts[0]);expect(JSON.parse((await page.evaluate(key=>localStorage.getItem(key),recoveryKey))!).phase).toBe('confirmed');
  // A confirmed save followed by a failed read resumes with GET only, also
  // after another tab restart and a switch back to Spanish.
  await page.close();page=await ownerContext.newPage();await bindPaymentRoutes(page);await page.route('**/api/pro/workspace**',route=>{forbidden.push(route.request().url());return route.abort();});
  await ownerContext.addCookies([{name:'NEXT_LOCALE',value:'es',url:baseURL!}]);
  await page.goto('/es/dashboard/profesional?tab=pro_clients&cliente='+client.id+'&cuenta=work&registro=payment');
  operations=page.locator('[data-client-operations]');
  const readForm=page.getByRole('dialog',{name:'Registrar abono',exact:true});await expect(readForm.getByRole('button',{name:'Reintentar lectura',exact:true})).toBeVisible();expect(paymentAttempts).toHaveLength(2);
  await readForm.getByRole('button',{name:'Reintentar lectura',exact:true}).click();await expect(account()).toContainText('₡600');await expect(account()).toContainText('₡400,01');await expect(readForm).toHaveCount(0);
  expect(paymentAttempts).toHaveLength(2);expect(await page.evaluate(key=>localStorage.getItem(key),recoveryKey)).toBeNull();
  const recovered=await(await page.request.get(endpoint)).json();expect(recovered.revision).toBe(committed.revision);expect(recovered.summary.paidCents).toBe(40001);expect(recovered.entries.filter((entry:{kind:string})=>entry.kind==='payment')).toHaveLength(1);
  expect((await db.from('pro_client_entries').select('id').eq('user_id',owner.id).eq('id',firstPayment.actionId).throwOnError()).data).toHaveLength(1);
  await page.reload();await expect(account()).toContainText('₡600');await expect(account()).toContainText('Pintura local');
  await expectNoHorizontalOverflow(page);
  await account().getByRole('button',{name:'Anular abono',exact:true}).click();await page.getByRole('textbox',{name:'Motivo',exact:true}).fill('Se registró por error');await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(account()).toContainText('Abono anulado');await expect(account()).toContainText('₡1.000,01');
  await account().getByRole('button',{name:'Devolver material',exact:true}).click();await page.getByRole('textbox',{name:'Motivo',exact:true}).fill('Material no utilizado');await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(account()).toContainText('Material devuelto');
  await expect.poll(async()=>{const row=await db.from('pro_products').select('stock').eq('user_id',owner.id).eq('id','material').single();return row.data?.stock;}).toBe(3);
  await account().getByRole('button',{name:'Cerrar',exact:true}).click();await expect(page).not.toHaveURL(/cuenta=/);await expect(operations).toContainText('₡1.000,01');await expect(operations).toContainText('Visita adicional');
  const stored=await db.from('pro_workspaces').select('document').eq('user_id',owner.id).single().throwOnError();expect(stored.data!.document.clients).toEqual(document.clients);expect(stored.data!.document.work).toEqual(document.work);expect(stored.data!.document.quotes).toEqual(document.quotes);expect(stored.data!.document.products).toEqual(document.products);expect(stored.data!.document.movements).toHaveLength(2);expect(forbidden).toEqual([]);
  // Competing stock writes share the owner revision; one commits, one conflicts.
  const current=await (await page.request.get(endpoint)).json();
  const post=async(data:Record<string,unknown>)=>page.request.post('/api/pro/client-operations',{headers:{origin:baseURL!},data:{clientId:client.id,workId:'work',actionId:crypto.randomUUID(),revision:current.revision,kind:'material',productId:'material',quantity:2,...data}});
  const attempts=await Promise.all([post({}),post({})]);expect(attempts.map(r=>r.status()).sort()).toEqual([200,409]);
  const entry=await db.from('pro_client_entries').select('id').eq('user_id',owner.id).eq('kind','material').order('position',{ascending:false}).limit(1).single().throwOnError();
  expect(entry.data!.id).toBeTruthy();expect((await db.from('pro_products').select('stock').eq('user_id',owner.id).eq('id','material').single().throwOnError()).data!.stock).toBe(1);
  const now=await (await page.request.get(endpoint)).json();const attemptId=crypto.randomUUID(),payload={clientId:client.id,workId:'work',actionId:attemptId,revision:now.revision,kind:'payment',amountCents:1,note:'Idempotente'};
  const send=()=>page.request.post('/api/pro/client-operations',{headers:{origin:baseURL!},data:payload});expect((await send()).status()).toBe(200);expect((await send()).status()).toBe(200);
  expect((await db.from('pro_client_entries').select('id').eq('user_id',owner.id).eq('id',attemptId).throwOnError()).data).toHaveLength(1);
  expect((await page.request.post('/api/pro/client-operations',{headers:{origin:baseURL!},data:{...payload,amountCents:2}})).status()).toBe(400);
 }finally{await foreign?.close();await cleanupDisposableAccount(owner);await cleanupDisposableAccount(other);}
});
