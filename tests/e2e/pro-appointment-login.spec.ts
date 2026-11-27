import {test,expect} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {appointmentCopy} from '../../src/components/pro/appointment-copy';
import {expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';

for(const locale of ['es','en'] as const)test(`Guest appointment survives real password login (${locale})`,async({page,baseURL},testInfo)=>{
 // WebKit dev HMR full reloads interrupted goto in the 11-nov run (category C).
 await stabilizeLocalProRuntime(page.context(),baseURL!);
 test.setTimeout(120000);
 // Compile the login route (same locale only: a warm-up sets NEXT_LOCALE) before the timed sign-in.
 await warmLocalRoutes(page,[(locale==='en'?'/en':'')+'/login','/api/auth/session-mfa','/api/auth/registration-state']);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'appt-login-owner'}),client=await createDisposableAccount({prefix:'appt-login-client'}),db=regressionAdminClient(),copy=appointmentCopy[locale];
 try{
  let slug='appt-login-'+owner.id;
  const professional=await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Disponibilidad de prueba local',slug,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_available:true,is_banned:false}).select('id,slug').single();expect(professional.error).toBeNull();slug=professional.data!.slug;// the business-name trigger (migration 256) assigns the public slug
  expect((await db.from('profiles').update({is_provider:true}).eq('id',owner.id)).error).toBeNull();
  expect((await db.from('pro_memberships').insert({user_id:owner.id,status:'active'})).error).toBeNull();
  const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10),document=emptyBusiness();document.availability=[{start:day+'T08:00:00-06:00',end:day+'T16:00:00-06:00'}];
  expect((await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1})).error).toBeNull();
  expect((await db.from('pro_appointment_preferences').insert({owner_id:owner.id,enabled:true,revision:1})).error).toBeNull();
  expect((await db.rpc('pro_appointment_schedule_record',{p_actor:owner.id,p_input:{revision:0,actionId:crypto.randomUUID(),durationMinutes:120,weekly:[],closedDates:[]}})).error).toBeNull();
  await page.goto(`/${locale}/profesionales/${slug}`);
  await page.getByRole('button',{name:locale==='en'?'Book':'Agendar',exact:true}).filter({visible:true}).first().click();
  const form=page.getByRole('dialog',{name:copy.requestTitle,exact:true});
  if(day.slice(0,7)!==new Date().toISOString().slice(0,7))await form.getByRole('button',{name:locale==='en'?'Next month':'Mes siguiente',exact:true}).click();
  await form.getByRole('button',{name:day,exact:true}).click();
  const slot=form.getByRole('button',{name:/08:00|8:00/}).first();await slot.click();await expect(slot).toHaveAttribute('aria-pressed','true');await expect(form.getByRole('button',{name:locale==='en'?'Continue':'Continuar',exact:true})).toBeEnabled();await expect(form.getByRole('button',{name:/08:15|8:15/})).toHaveCount(0);await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('calendar-'+locale+'.png')});
  if(locale==='en'){await form.getByRole('button',{name:copy.otherTime,exact:true}).click();await form.getByLabel(copy.preferredDay,{exact:true}).fill(day);await form.getByLabel(copy.preferences,{exact:true}).fill('After midday');}
  await form.getByRole('button',{name:locale==='en'?'Continue':'Continuar',exact:true}).click();
  await form.getByLabel(copy.service,{exact:true}).fill('Servicio conservado de prueba');
  await form.getByLabel(copy.location,{exact:true}).selectOption('customer');await form.getByLabel(copy.locationDetail,{exact:true}).fill('Dirección ficticia conservada');await form.getByLabel(copy.note,{exact:true}).fill('Nota privada de prueba');
  await form.getByRole('button',{name:locale==='es'?'Reservar cita':copy.requestCta,exact:true}).click();await expect(form.getByRole('button',{name:copy.signIn,exact:true})).toBeVisible();
  await form.getByRole('button',{name:copy.signIn,exact:true}).click();await expect(page).toHaveURL(/\/login\?redirect=/);
  expect(page.url()).not.toContain('privada');expect(page.url()).not.toContain('Direcci');
  await page.locator('input[type=email]').fill(client.email);await page.locator('input[type=password]').fill(client.password);await page.locator('form').filter({has:page.locator('input[type=password]')}).locator('button[type=submit]').click();
  await expect(page).toHaveURL(new RegExp((locale==='en'?'/en':'(?:/es)?')+'/(?:profesionales/)?'+slug+'$'));
  await expect(form).toBeVisible();await expect(form.getByLabel(copy.service,{exact:true})).toHaveValue('Servicio conservado de prueba');await expect(form.getByLabel(copy.location,{exact:true})).toHaveValue('customer');await expect(form.getByLabel(copy.locationDetail,{exact:true})).toHaveValue('Dirección ficticia conservada');await expect(form.getByLabel(copy.note,{exact:true})).toHaveValue('Nota privada de prueba');await expect(form).toContainText('120 min');await form.getByRole('button',{name:locale==='en'?'Change time':'Cambiar horario',exact:true}).click();if(locale==='es'){await expect(form.getByRole('button',{name:day,exact:true})).toHaveAttribute('aria-pressed','true');await expect(slot).toHaveAttribute('aria-pressed','true');}else{await expect(form.getByLabel(copy.preferredDay,{exact:true})).toHaveValue(day);await expect(form.getByLabel(copy.preferences,{exact:true})).toHaveValue('After midday');await expect(form.getByRole('button',{name:copy.otherTime,exact:true})).toHaveAttribute('aria-pressed','true');}await form.getByRole('button',{name:locale==='en'?'Continue':'Continuar',exact:true}).click();
  expect(await page.evaluate(()=>sessionStorage.getItem('contratacr:appointment-login-draft'))).toBeNull();
  const before=await db.from('pro_appointment_requests').select('id').eq('owner_id',owner.id);expect(before.error).toBeNull();expect(before.data).toEqual([]);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('restored-'+locale+'.png')});
  const response=page.waitForResponse(r=>r.url().includes('/api/pro/appointment-requests')&&r.request().method()==='POST');await form.getByRole('button',{name:locale==='es'?'Reservar cita':copy.requestCta,exact:true}).click();const result=await response;expect(result.status()).toBe(200);await expect(page.getByText(locale==='es'?'Cita confirmada':copy.sentTitle,{exact:true})).toBeVisible();
  const receipt=await result.json();const detail=await (await page.request.get('/api/pro/appointment-requests?view=detail&id='+receipt.id)).json();expect(detail.request).toMatchObject({service:'Servicio conservado de prueba',durationMinutes:120,locationText:'Dirección ficticia conservada',note:'Nota privada de prueba',status:locale==='es'?'confirmed':'requested'});
 }finally{await cleanupDisposableAccount(client);await cleanupDisposableAccount(owner);}
});

for(const locale of ['es','en'])test(`Login does not expose an active native GET form before hydration (${locale})`,async({browser,baseURL})=>{
 const context=await browser.newContext({javaScriptEnabled:false});try{const page=await context.newPage();await page.goto(baseURL+'/'+locale+'/login');const form=page.locator('form').filter({has:page.locator('input[type=password]')});await expect(form).toHaveAttribute('method','post');await expect(form.locator('input[type=email]')).toBeDisabled();await expect(form.locator('input[type=password]')).toBeDisabled();await expect(form.locator('button[type=submit]')).toBeDisabled();}finally{await context.close();}
});
