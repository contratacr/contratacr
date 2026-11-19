import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {blankInvoiceLine} from '../../src/lib/pro/invoice-detail';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';

test('Pro saved discounts: independent catalog, exact copies, dirty overlay navigation and unchanged saved invoices',async({page,browser,baseURL})=>{
 test.setTimeout(200000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'pro-discounts'}),other=await createDisposableAccount({prefix:'pro-discounts-other'}),db=regressionAdminClient();let foreign:BrowserContext|undefined;
 async function login(context:BrowserContext,actor:typeof owner){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();return auth;}
 try{
  for(const actor of [owner,other]){await db.from('profiles').update({is_provider:true}).eq('id',actor.id).throwOnError();await db.from('pro_memberships').insert({user_id:actor.id,status:'active'}).throwOnError();}
  const document=emptyBusiness();document.clients=[{id:'discount-client',name:'Cliente descuentos',email:'',phone:'',notes:'Conservar',archived:false}];await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  const before=(await db.from('pro_workspaces').select('document,revision').eq('user_id',owner.id).single().throwOnError()).data;
  const auth=await login(page.context(),owner);foreign=await browser.newContext();await login(foreign,other);const headers={origin:new URL(baseURL!).origin};
  const readPage=async(extra:Record<string,string>={})=>{const response=await page.request.get('/api/pro/discount-presets?'+new URLSearchParams(extra));expect(response.status()).toBe(200);return response.json();};
  let revision=0;for(let i=0;i<45;i++){const response=await page.request.post('/api/pro/discount-presets',{headers,data:{action:'save',id:crypto.randomUUID(),revision,preset:{name:'Beneficio '+String(i).padStart(3,'0'),reason:'Promoción comercial',method:'percent',value:'5'}}});expect(response.status()).toBe(200);revision=(await response.json()).revision;}
  const target=crypto.randomUUID(),body={name:'Beneficio Álvarez',reason:'Cliente frecuente original',method:'percent',value:'7.50001'};const created=await page.request.post('/api/pro/discount-presets',{headers,data:{action:'save',id:target,revision,preset:body}});expect(created.status()).toBe(200);revision=(await created.json()).revision;
  const first=await readPage(),second=await readPage({after:first.nextCursor}),third=await readPage({after:second.nextCursor});expect(first.items).toHaveLength(20);expect(second.items).toHaveLength(20);expect(third.items).toHaveLength(6);expect(third.nextCursor).toBeNull();expect(third.items.some((row:{id:string})=>row.id===target)).toBe(true);
  expect((await readPage({q:'alvarez'})).items[0].id).toBe(target);expect((await readPage({q:'%'})).items).toEqual([]);
  const foreignMutation=await foreign.request.post('/api/pro/discount-presets',{headers,data:{action:'archive',id:target,revision:0}});expect(foreignMutation.status()).toBe(400);expect((await (await foreign.request.get('/api/pro/discount-presets')).json()).items).toEqual([]);
  expect((await auth.from('pro_discount_presets').update({value:'99'}).eq('user_id',owner.id)).error).not.toBeNull();expect((await auth.rpc('pro_discount_preset_page',{p_user:other.id})).error).not.toBeNull();
  const line={...blankInvoiceLine(),description:'Servicio para descuento',quantity:'3',unitPrice:'33.33333',discountType:'amount',discount:'1',discountReason:'Motivo manual conservado'};const invoice=await page.request.post('/api/pro/invoice-drafts',{headers,data:{action:'create_direct',requestId:crypto.randomUUID(),clientId:'discount-client',title:'Factura con descuento',notes:'',lines:[line],charges:[]}});expect(invoice.status()).toBe(200);const invoiceId=(await invoice.json()).id;
  const readInvoice=async()=>(await (await page.request.get('/api/pro/invoice-drafts?id='+invoiceId)).json()).draft;const originalInvoice=await readInvoice();
  await gotoOK(page,'/es/dashboard/profesional?tab=pro_billing&factura='+invoiceId+'&detalleFactura=1');const editor=page.getByRole('dialog',{name:'Detalle de factura',exact:true});await expect(editor).toBeVisible();await editor.getByText('Descuento, impuestos y CABYS',{exact:true}).click();await expect(editor.getByLabel('Motivo del descuento',{exact:true})).toHaveValue(line.discountReason);
  await editor.locator('[data-discount-preset-picker] summary').click();await editor.getByLabel('Buscar descuentos',{exact:true}).fill('alvarez');const picker=editor.getByLabel('Aplicar descuento guardado',{exact:true});await expect(picker.locator('option').filter({hasText:body.name})).toHaveCount(1);await picker.selectOption(target);await expect(editor.getByLabel('Descuento %',{exact:true})).toHaveValue(body.value);await expect(editor.getByLabel('Motivo del descuento',{exact:true})).toHaveValue(body.reason);
  await editor.getByRole('button',{name:'Administrar descuentos',exact:true}).click();const manager=page.getByRole('dialog',{name:'Descuentos guardados',exact:true});await expect(manager).toBeVisible();await expect(page).toHaveURL(/descuentoCatalogo=1/);await manager.getByLabel('Nombre',{exact:true}).fill('Borrador de preajuste sin guardar');
  await page.goBack();const confirm=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'¿Salir sin guardar?',exact:true})});await expect(confirm).toBeVisible();await confirm.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(manager.getByLabel('Nombre',{exact:true})).toHaveValue('Borrador de preajuste sin guardar');
  await manager.getByRole('button',{name:'Cerrar diálogo',exact:true}).click();await page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'¿Salir sin guardar?',exact:true})}).getByRole('button',{name:'Salir sin guardar',exact:true}).click();await expect(manager).toHaveCount(0);await expect(page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'¿Descartar cambios del detalle?',exact:true})})).toHaveCount(0);await expect(editor.getByLabel('Descuento %',{exact:true})).toHaveValue(body.value);expect(await readInvoice()).toEqual(originalInvoice);
  await editor.getByRole('button',{name:'Guardar detalle',exact:true}).click();await expect.poll(async()=>(await readInvoice()).editedDetail.lines[0].discount).toBe(body.value);const saved=await readInvoice();
  const updated=await page.request.post('/api/pro/discount-presets',{headers,data:{action:'save',id:target,revision,preset:{...body,value:'10',reason:'Motivo posterior'}}});expect(updated.status()).toBe(200);revision=(await updated.json()).revision;expect(await readInvoice()).toEqual(saved);
  const stale=await page.request.post('/api/pro/discount-presets',{headers,data:{action:'archive',id:target,revision:0}});expect(stale.status()).toBe(409);expect((await readPage()).revision).toBe(revision);
  const archived=await page.request.post('/api/pro/discount-presets',{headers,data:{action:'archive',id:target,revision}});expect(archived.status()).toBe(200);revision=(await archived.json()).revision;expect((await readPage({q:'alvarez'})).items).toEqual([]);expect((await readPage({filter:'archived'})).items[0].id).toBe(target);expect(await readInvoice()).toEqual(saved);
  const restored=await page.request.post('/api/pro/discount-presets',{headers,data:{action:'restore',id:target,revision}});expect(restored.status()).toBe(200);expect((await readPage({q:'alvarez'})).items[0].value).toBe('10');expect((await db.from('pro_workspaces').select('document,revision').eq('user_id',owner.id).single().throwOnError()).data).toEqual(before);await expectNoHorizontalOverflow(page);
 }finally{
  await page.goto('about:blank',{timeout:5000}).catch(()=>{});
  await page.close().catch(()=>{});
  await foreign?.close().catch(()=>{});
  const cleanup=await Promise.allSettled([cleanupDisposableAccount(owner),cleanupDisposableAccount(other)]);
  const failures=cleanup.filter((result):result is PromiseRejectedResult=>result.status==='rejected');
  if(failures.length)throw new AggregateError(failures.map(result=>result.reason),'Disposable account cleanup failed.');
 }
});
