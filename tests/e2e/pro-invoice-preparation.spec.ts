import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {expectNoHorizontalOverflow,gotoOK} from './helpers';

test('Pro draft preparation: issuer and credit terms, leap dates, snapshots, validation and no settlement',async({page,browser,baseURL})=>{
 test.setTimeout(180000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'pro-preparation'}),other=await createDisposableAccount({prefix:'pro-preparation-other'}),db=regressionAdminClient();let foreign:BrowserContext|undefined;
 async function login(context:BrowserContext,actor:typeof owner){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();return auth;}
 try{
  for(const actor of [owner,other]){await db.from('profiles').update({is_provider:true}).eq('id',actor.id).throwOnError();await db.from('pro_memberships').insert({user_id:actor.id,status:'active'}).throwOnError();}
  const document=emptyBusiness();document.clients=[{id:'client',name:'Cliente de preparación',email:'client@example.com',phone:'',notes:'No cambiar',archived:false}];document.quotes=[{id:'quote',clientId:'client',title:'Servicio original',lines:[{description:'Servicio original',quantity:1,price:100,tax:13}],status:'accepted',validUntil:'2029-12-31'}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  const snapshot=async()=>(await db.from('pro_workspaces').select('document,revision').eq('user_id',owner.id).single().throwOnError()).data;
  const before=await snapshot(),auth=await login(page.context(),owner),headers={origin:new URL(baseURL!).origin};
  const source=(await (await page.request.get('/api/pro/invoice-drafts?kind=legacy_quote&sourceId=quote')).json()).source;
  const initial={action:'create',kind:'legacy_quote',sourceId:'quote',clientId:'client',fingerprint:source.fingerprint,title:'Preparación de factura',notes:'Nota original',receiver:source.receiver};
  const created=await page.request.post('/api/pro/invoice-drafts',{headers,data:initial});expect(created.status()).toBe(200);const id=(await created.json()).id;
  const read=async()=>(await (await page.request.get('/api/pro/invoice-drafts?id='+id)).json()).draft;
  /* Closing round: since Round 7A a new draft without saved issuer data starts with the company (or account) name as issuer; nothing else is prefilled. */{const prefilled=(await read()).preparation;expect(prefilled).toMatchObject({issuerId:'',issuerEmail:'',issuerPhone:'',orderReference:'',paymentMethod:'',creditDays:0});expect(prefilled.issuerName.length).toBeGreaterThan(0);}expect((await auth.rpc('pro_invoice_full_read',{p_user:owner.id,p_id:id})).error).not.toBeNull();
  foreign=await browser.newContext();await login(foreign,other);expect((await foreign.request.get('/api/pro/invoice-drafts?id='+id)).status()).toBe(404);
  const full:string[]=[];await page.route('**/api/pro/workspace**',route=>{full.push(route.request().url());return route.abort();});
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(endpoint)).status()).toBe(200);
  await gotoOK(page,'/es/dashboard/profesional?tab=pro_billing&factura='+id);
  const editor=()=>page.getByRole('dialog',{name:'Borrador de factura',exact:true}),recovery=page.locator('[data-session-recovery]');await expect(editor().or(recovery)).toBeVisible();if(await recovery.isVisible()){await recovery.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(recovery).toHaveCount(0);}
  await editor().getByText('Condiciones de venta',{exact:true}).click();await editor().getByLabel('Fecha prevista del documento',{exact:true}).fill('2028-02-28');await editor().getByLabel('Condición de venta',{exact:true}).selectOption('credit');
  await editor().getByLabel('Plazo de crédito (días)',{exact:true}).fill('1');await expect(editor()).toContainText('29 de febrero de 2028');await editor().getByLabel('Plazo de crédito (días)',{exact:true}).fill('2');await expect(editor()).toContainText('1 de marzo de 2028');
  const dateBox=await editor().getByLabel('Fecha prevista del documento',{exact:true}).boundingBox(),saleBox=await editor().locator('[data-invoice-preparation] details').first().boundingBox();expect(dateBox!.x+dateBox!.width).toBeLessThanOrEqual(saleBox!.x+saleBox!.width);
  await editor().getByLabel('Medio de pago previsto',{exact:true}).selectOption('transfer');await editor().getByLabel('Orden o referencia comercial (opcional)',{exact:true}).fill('OC-LOCAL');
  await editor().getByText('Datos del emisor',{exact:true}).click();
  await editor().getByLabel('Nombre o razón social del emisor',{exact:true}).fill('Emisor ficticio');await editor().getByLabel('Tipo de identificación del emisor',{exact:true}).selectOption('company');await editor().getByLabel('Identificación del emisor',{exact:true}).fill('3101000000');await editor().getByLabel('Correo del emisor',{exact:true}).fill('issuer@example.com');await editor().getByLabel('Dirección del emisor',{exact:true}).fill('Dirección de prueba');await editor().getByLabel('Código de actividad económica',{exact:true}).fill('620100');
  await editor().getByRole('button',{name:'Guardar borrador',exact:true}).click();await expect(editor()).toContainText('Borrador guardado');let saved=await read();expect(saved.preparation).toMatchObject({issuerName:'Emisor ficticio',plannedDate:'2028-02-28',saleCondition:'credit',creditDays:2,paymentMethod:'transfer',orderReference:'OC-LOCAL'});expect(saved.totalCents).toBe(11300);expect(await snapshot()).toEqual(before);
  await page.reload();await expect(editor()).toBeVisible();await editor().getByText('Condiciones de venta',{exact:true}).click();await expect(editor().getByLabel('Plazo de crédito (días)',{exact:true})).toHaveValue('2');await expect(editor()).toContainText('1 de marzo de 2028');await editor().getByText('Datos del emisor',{exact:true}).click();await expect(editor().getByLabel('Nombre o razón social del emisor',{exact:true})).toHaveValue('Emisor ficticio');
  await editor().getByText('Revisar datos pendientes',{exact:false}).click();await expect(editor()).toContainText('Identificación del receptor');await expect(editor()).toContainText('no habilita la emisión');
  // Switching to cash drops obsolete credit days; switching back requires a new term.
  await editor().getByLabel('Condición de venta',{exact:true}).selectOption('cash');await expect(editor().getByLabel('Plazo de crédito (días)',{exact:true})).toHaveCount(0);await editor().getByLabel('Condición de venta',{exact:true}).selectOption('credit');await expect(editor().getByLabel('Plazo de crédito (días)',{exact:true})).toHaveValue('');await editor().getByRole('button',{name:'Guardar borrador',exact:true}).click();await expect(editor().getByRole('alert')).toContainText('Revise las condiciones');expect((await read()).revision).toBe(saved.revision);
  await editor().getByLabel('Condición de venta',{exact:true}).selectOption('cash');await editor().getByRole('button',{name:'Guardar borrador',exact:true}).click();await expect.poll(async()=> (await read()).revision).toBe(saved.revision+1);saved=await read();expect(saved.preparation.creditDays).toBe(0);expect(saved.preparation.saleCondition).toBe('cash');expect(saved.totalCents).toBe(11300);expect(await snapshot()).toEqual(before);
  const update={action:'update',id,revision:saved.revision,title:saved.title,notes:saved.notes,receiver:saved.receiver,preparation:saved.preparation};
  expect((await page.request.post('/api/pro/invoice-drafts',{headers,data:{...update,revision:1}})).status()).toBe(409);
  expect((await page.request.post('/api/pro/invoice-drafts',{headers,data:{...update,preparation:{...saved.preparation,plannedDate:'2028-02-31'}}})).status()).toBe(400);
  expect((await page.request.post('/api/pro/invoice-drafts',{headers,data:{...update,preparation:{...saved.preparation,saleCondition:'credit',creditDays:0}}})).status()).toBe(400);
  expect((await foreign.request.post('/api/pro/invoice-drafts',{headers,data:update})).status()).toBe(400);
  expect((await page.request.post('/api/pro/invoice-drafts',{headers,data:{action:'emit',id}})).status()).toBe(400);
  const repeated=await page.request.post('/api/pro/invoice-drafts',{headers,data:{...initial,preparation:{...saved.preparation,issuerName:'Do not overwrite'}}});expect(repeated.status()).toBe(200);expect((await repeated.json()).id).toBe(id);expect((await read()).preparation).toEqual(saved.preparation);
  // An older editor which omits the new field must not erase the preparation.
  const {preparation,...oldUpdate}=update;expect(preparation.issuerName).toBe('Emisor ficticio');expect((await page.request.post('/api/pro/invoice-drafts',{headers,data:{...oldUpdate,notes:'Nota compatible'}})).status()).toBe(200);expect((await read()).preparation).toEqual(saved.preparation);
  await expectNoHorizontalOverflow(page);expect(full).toEqual([]);expect(await snapshot()).toEqual(before);
  expect((await db.from('pro_client_entries').select('id').eq('user_id',owner.id).throwOnError()).data).toEqual([]);
 }finally{await foreign?.close();await cleanupDisposableAccount(owner);await cleanupDisposableAccount(other);}
});
