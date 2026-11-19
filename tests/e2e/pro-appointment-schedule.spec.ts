import {test,expect} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {expectNoHorizontalOverflow} from './helpers';
for(const locale of ['es','en'])test(`Weekly schedule saves, reloads and pauses without losing hours (${locale})`,async({page,baseURL},info)=>{
 test.setTimeout(120000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'weekly-owner'}),db=regressionAdminClient(),en=locale==='en';
 try{
  await db.from('profiles').update({is_provider:true}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Horario semanal local',slug:'weekly-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_available:true,is_banned:false}).throwOnError();
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true}})).error).toBeNull();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await page.context().addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:owner.email,password:owner.password})).error).toBeNull();
  await page.goto(`/${locale}/dashboard/profesional?tab=pro_agenda`);const availability=page.locator('[data-availability-secondary]');await expect(availability).not.toHaveAttribute('open');await availability.locator('summary').click();const title=en?'Weekly schedule':'Horario semanal';await page.getByRole('button',{name:title,exact:true}).click();const form=page.getByRole('dialog',{name:title,exact:true});await form.getByLabel(en?'Appointment duration':'Duración de cada cita',{exact:true}).selectOption('120');
  await form.getByRole('button',{name:en?'Add':'Agregar',exact:true}).first().click();await form.getByLabel(en?'Monday from 1':'Lunes desde 1',{exact:true}).fill('08:00');await form.getByLabel(en?'Monday until 1':'Lunes hasta 1',{exact:true}).fill('12:00');
  await form.locator('summary').click();const closed=new Date(Date.now()+5*86400000).toISOString().slice(0,10);await form.getByLabel(en?'Day off':'Fecha sin atención',{exact:true}).fill(closed);await form.getByRole('button',{name:en?'Add date':'Agregar fecha',exact:true}).click();
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath('weekly-'+locale+'.png')});
  const saved=page.waitForResponse(r=>r.url().includes('/api/pro/appointment-schedule')&&r.request().method()==='POST');await form.getByRole('button',{name:en?'Save schedule':'Guardar horario',exact:true}).click();expect((await saved).status()).toBe(200);await expect(form).toBeHidden();
  await page.getByRole('button',{name:title,exact:true}).click();await expect(form.getByLabel(en?'Appointment duration':'Duración de cada cita',{exact:true})).toHaveValue('120');await expect(form.getByLabel(en?'Monday from 1':'Lunes desde 1',{exact:true})).toHaveValue('08:00');await expect(form.getByLabel(en?'Monday until 1':'Lunes hasta 1',{exact:true})).toHaveValue('12:00');await form.locator('summary').click();await expect(form.getByText(closed,{exact:true})).toBeVisible();await form.getByRole('button',{name:en?'Close':'Cerrar',exact:true}).click();
  const toggle=page.getByRole('switch',{name:en?'Accept appointment requests':'Recibir solicitudes de citas',exact:true});await expect(toggle).toHaveAttribute('aria-checked','false');await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','true');await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','false');
  const row=await db.from('pro_appointment_schedules').select('weekly,closed_dates,duration_minutes').eq('owner_id',owner.id).single();expect(row.error).toBeNull();expect(row.data).toEqual({weekly:[{weekday:1,start:'08:00',end:'12:00'}],closed_dates:[closed],duration_minutes:120});
  expect((await page.request.post('/api/pro/appointment-schedule',{headers:{origin:'https://invalid.example'},data:{revision:1,actionId:crypto.randomUUID(),durationMinutes:60,weekly:[],closedDates:[]}})).status()).toBe(403);
 }finally{await cleanupDisposableAccount(owner);}
});
