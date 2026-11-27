import {test,expect} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {expectNoHorizontalOverflow,gotoOK} from './helpers';

// Self-signed certificate belongs only to the explicitly selected local gateway.
test.use({ignoreHTTPSErrors:true});
test('local phone gateway preserves login and booking/contact alternatives',async({page,baseURL},testInfo)=>{
 test.skip(!baseURL?.match(/^https:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+):3443$/),'Requires the explicit local HTTPS gateway; never a deployed environment.');
 test.setTimeout(180000);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 expect(baseURL).toMatch(/^https:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+):3443$/);
 const owner=await createDisposableAccount({prefix:'lan-owner'}),db=regressionAdminClient();
 try {
  const slug='lan-preview-'+owner.id;
  const pro=await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Prueba local de disponibilidad',slug,whatsapp:'50680000000',allow_phone_call:true,call_phone:'50680000001',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_available:true,is_banned:false}).select('id').single();expect(pro.error).toBeNull();
  expect((await db.from('profiles').update({is_provider:true}).eq('id',owner.id)).error).toBeNull();
  expect((await db.from('pro_memberships').insert({user_id:owner.id,status:'active'})).error).toBeNull();
  const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10),document=emptyBusiness();document.availability=[{start:day+'T08:00:00-06:00',end:day+'T16:00:00-06:00'}];
  expect((await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1})).error).toBeNull();
  expect((await db.from('pro_appointment_preferences').insert({owner_id:owner.id,enabled:true,revision:1})).error).toBeNull();
  await page.goto('/profesionales/'+slug);
  await expect(page.getByRole('button',{name:'Agendar',exact:true}).filter({visible:true}).first()).toBeVisible();
  // With booking the contact stays: WhatsApp + «Agendar» share the phone strip (Llamar gives its half); on the desktop card «Agendar» goes under WhatsApp/Llamar.
  await expect(page.getByRole('button',{name:/WhatsApp/i}).filter({visible:true}).first()).toBeVisible();
  if((page.viewportSize()?.width??1280)<640){const strip=page.locator('.ccr-barra-accion').filter({visible:true});await expect(strip).toHaveCount(1);await expect(strip.getByRole('button',{name:/Llamar|Contactar por llamada/i})).toHaveCount(0);await expect(strip.getByRole('button',{name:'Agendar',exact:true})).toBeVisible();}
  await page.getByRole('button',{name:'Agendar',exact:true}).filter({visible:true}).first().click();
  const dialog=page.getByRole('dialog',{name:'Solicitar una cita',exact:true});await expect(dialog).toContainText('Prueba local de disponibilidad');
  await expect(dialog.getByRole('button',{name:day,exact:true})).toBeEnabled();
  await expect(dialog.getByRole('button',{name:day,exact:true})).toHaveAttribute('aria-pressed','true');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('calendar-phone.png')});
  await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
  expect((await db.from('pro_appointment_preferences').update({enabled:false}).eq('owner_id',owner.id)).error).toBeNull();
  await page.reload();
  await expect(page.getByRole('button',{name:/WhatsApp/i}).filter({visible:true}).first()).toBeVisible();
  await expect(page.getByRole('button',{name:/Llamar|Contactar por llamada/i}).filter({visible:true}).first()).toBeVisible();
  await expect(page.getByRole('button',{name:'Agendar',exact:true})).toHaveCount(0);
  // Actual password login through the same endpoint the physical phone uses.
  const authRequests:string[]=[];page.on('request',r=>{if(r.url().includes('/auth/v1/'))authRequests.push(r.url());});
  await gotoOK(page,'/login');await page.locator('input[type=email]').fill(owner.email);await page.locator('input[type=password]').fill(owner.password);
  await page.locator('form').filter({has:page.locator('input[type=password]')}).locator('button[type=submit]').click();
  await expect(page).not.toHaveURL(/\/login/);
  expect(authRequests.some(url=>url.startsWith(baseURL+'/__local_supabase/auth/v1/token'))).toBe(true);
  expect(authRequests.every(url=>url.startsWith(baseURL+'/__local_supabase/'))).toBe(true);
  expect(await page.evaluate(()=>window.isSecureContext&&typeof crypto.randomUUID==='function')).toBe(true);
  const session=await page.request.get('/api/pro/workspace');expect(session.status()).toBe(200);
  for(const tab of ['pro_clients','pro_inventory','pro_agenda','appointments']) {
   await page.goto('/dashboard/profesional?tab='+tab);
   await expect.poll(()=>page.evaluate(()=>(window as unknown as {__ccrSectionPaso?:boolean}).__ccrSectionPaso)).toBe(true);
   await expect(page.locator('header').getByRole('button',{name:/notificaciones|notifications/i}).filter({visible:true})).toHaveCount(0);
   await expectNoHorizontalOverflow(page);
  }
  await expect(page.getByRole('button',{name:'Actualizar',exact:true})).toBeEnabled();
  await page.screenshot({path:testInfo.outputPath('tools-header-phone.png')});
  await gotoOK(page,'/dashboard/profesional?tab=pro_clients');
  await page.getByRole('button',{name:'Nuevo cliente',exact:true}).click();
  await page.getByLabel('Nombre',{exact:true}).fill('Cliente ficticio LAN');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();await expect(page.getByText('Cliente ficticio LAN',{exact:true})).toBeVisible();
  const stored=await db.from('pro_clients').select('name').eq('user_id',owner.id).eq('name','Cliente ficticio LAN');expect(stored.error).toBeNull();expect(stored.data).toHaveLength(1);
  const rejected=await page.request.post('/api/pro/appointment-requests',{headers:{origin:'https://foreign.invalid'},data:{}});expect(rejected.status()).toBe(403);
 }finally{await cleanupDisposableAccount(owner);}
});
