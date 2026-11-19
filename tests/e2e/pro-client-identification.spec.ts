import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {gotoOK,warmLocalRoutes} from './helpers';

for(const language of ['es','en'] as const)test(`customer ID first: own history, autocomplete, manual fallback and preserved input [${language}]`,async({page,baseURL},testInfo)=>{
 test.setTimeout(180000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'pro-client-id'}),db=regressionAdminClient();
 const doc=emptyBusiness();doc.clients=[{id:'saved-client',name:'Cliente con historial',email:'saved@contratacr.test',phone:'+50688888888',notes:'No perder historial',archived:true,identification:'101230456'}];
 const en=language==='en',prefix=en?'/en':'',label=en?'Identification':'Identificación',create=en?'New customer':'Nuevo cliente';
 const headers={origin:new URL(baseURL!).origin};
 try{
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  const professional=(await db.from('professionals').insert({profile_id:owner.id,category_id:'redes_internet',business_name:'Clientes locales',slug:'client-id-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-al',verification_status:'pending',is_banned:false}).select('id').single().throwOnError()).data!;
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true}})).error).toBeNull();
  await db.from('pro_workspaces').insert({user_id:owner.id,document:doc,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await page.context().addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
  // Cold compile of the lookup route exceeded its 12 s client timeout in WebKit (category C); compile it first.
  await warmLocalRoutes(page,['/api/pro/identity-lookup',(en?'/en':'/es')+'/dashboard/profesional?tab=pro_clients']);
  await gotoOK(page,prefix+'/dashboard/profesional?tab=pro_clients');await page.getByRole('button',{name:create,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:create,exact:true});await expect(dialog.getByRole('button',{name:en?'Fill in details':'Completar datos',exact:true})).toHaveCount(0);const id=dialog.getByLabel(label,{exact:true});
  await id.fill('101230456');await dialog.getByLabel(en?'Name':'Nombre',{exact:true}).focus();
  await dialog.getByRole('button',{name:en?'Open existing customer':'Abrir cliente existente',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName(en?'Edit customer':'Editar cliente');await expect(page.getByLabel(en?'Notes':'Notas',{exact:true})).toHaveValue('No perder historial');
  const saved=(await db.from('pro_clients').select('*').eq('user_id',owner.id).single().throwOnError()).data!;
  await page.getByRole('button',{name:en?'Close':'Cerrar',exact:true}).click();await expect(dialog).toBeVisible();await expect(page).toHaveURL(/editar=new/);
  // Only the identification was typed above, so no discard prompt appeared. Manually typed data stays protected: the same shortcut asks first.
  const nameField=dialog.getByLabel(en?'Name':'Nombre',{exact:true});await nameField.fill('Nombre manual que no se pierde');await id.fill('');await id.fill('101230456');await nameField.focus();
  await dialog.getByRole('button',{name:en?'Open existing customer':'Abrir cliente existente',exact:true}).click();const discard=page.getByRole('dialog',{name:en?'Discard changes?':'¿Descartar cambios?',exact:true});await expect(discard).toBeVisible();
  await discard.getByRole('button',{name:en?'Keep editing':'Seguir editando',exact:true}).click();await expect(discard).toHaveCount(0);await expect(dialog).toBeVisible();await expect(page).toHaveURL(/editar=new/);await expect(nameField).toHaveValue('Nombre manual que no se pierde');await expect(page.getByRole('dialog',{name:en?'Edit customer':'Editar cliente',exact:true})).toHaveCount(0);
  await nameField.fill('');
  // Reuse only contact details already present in this professional's quote.
  const quote=(await db.from('quotes').insert({professional_id:professional.id,client_name:'Cliente compartido',client_email:'shared@contratacr.test',client_phone:'+50687777777',client_cedula:'202340567',public_code:'client-id-'+crypto.randomUUID(),quote_number:1,title:'Datos compartidos',items:[{description:'Servicio',quantity:1,unit_price:100}],tax_mode:'exento',subtotal:100,tax_amount:0,total:100,status:'sent',valid_until:'2099-01-01'}).select('*').single().throwOnError()).data!;
  await id.fill('202340567');await dialog.getByLabel(en?'Name':'Nombre',{exact:true}).focus();
  await expect(dialog.getByLabel(en?'Name':'Nombre',{exact:true})).toHaveValue('Cliente compartido');await expect(dialog.getByLabel(en?'Email':'Correo',{exact:true})).toHaveValue('shared@contratacr.test');
  await expect.poll(()=>dialog.locator('input[type=tel]').inputValue()).toContain('8777');
  await page.reload();await expect(dialog.getByLabel(en?'Name':'Nombre',{exact:true})).toHaveValue('Cliente compartido');
  // Public name lookup is simulated locally; no third-party identification request.
  await page.route('**/api/pro/identity-lookup',route=>{const body=route.request().postDataJSON();return route.fulfill({status:200,json:{found:true,fullName:'Nombre público de prueba',idType:'cedula'}}).then(()=>{expect(body.purpose).toBe('client_contact');});});
  await dialog.getByLabel(en?'Name':'Nombre',{exact:true}).fill('Nombre escrito por mí');const completed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/pro/identity-lookup'&&r.request().method()==='POST');await id.fill('303450678');await dialog.getByLabel(en?'Email':'Correo',{exact:true}).focus();expect((await completed).status()).toBe(200);await expect(dialog.locator('[data-client-identification] [role=status]')).toHaveCount(0);await expect(dialog.getByLabel(en?'Name':'Nombre',{exact:true})).toHaveValue('Nombre escrito por mí');await expect(dialog.getByLabel(en?'Email':'Correo',{exact:true})).toHaveValue('');
  await page.unroute('**/api/pro/identity-lookup');await page.route('**/api/pro/identity-lookup',route=>route.fulfill({status:503,json:{found:false}}));await id.fill('404560789');await dialog.getByLabel(en?'Name':'Nombre',{exact:true}).focus();await expect(dialog.locator('[data-client-identification] [role=status]')).toContainText(en?'Lookup unavailable':'Consulta no disponible');await expect(dialog.getByLabel(en?'Name':'Nombre',{exact:true})).toHaveValue('Nombre escrito por mí');
  await page.screenshot({path:testInfo.outputPath('customer-id-'+language+'.png'),fullPage:true});
  await dialog.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect((await db.from('pro_clients').select('*').eq('user_id',owner.id).eq('id','saved-client').single().throwOnError()).data).toEqual(saved);
  expect((await db.from('quotes').select('*').eq('id',quote.id).single().throwOnError()).data).toEqual(quote);
  const clients=(await db.from('pro_clients').select('name,identification,email').eq('user_id',owner.id).throwOnError()).data!;expect(clients).toHaveLength(2);expect(clients).toContainEqual({name:'Nombre escrito por mí',identification:'404560789',email:''});
  const denied=await page.request.post('/api/pro/identity-lookup',{headers:{origin:'https://untrusted.invalid'},data:{identification:'101230456',purpose:'client_contact'}});expect(denied.status()).toBe(403);
  expect((await page.request.post('/api/pro/identity-lookup',{headers,data:{identification:'101230456',purpose:'client_contact',userId:owner.id}})).status()).toBe(400);
 }finally{await page.goto('about:blank');await cleanupDisposableAccount(owner);}
});
