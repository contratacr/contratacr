import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {agendaDay,agendaWallTime} from '../../src/lib/pro/agenda-time';
import {expectNoHorizontalOverflow} from './helpers';

test('Pro agenda operations: Day/Upcoming, CR midnight marks, scoped search, stable pages and rescheduling',async({page,browser,baseURL})=>{
 test.setTimeout(150000);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'pro-agenda-owner'}),other=await createDisposableAccount({prefix:'pro-agenda-other'}),db=regressionAdminClient();let foreign:BrowserContext|undefined;
 async function login(context:BrowserContext,actor:typeof owner){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();return auth;}
 try{
  for(const actor of [owner,other]){await db.from('profiles').update({is_provider:true}).eq('id',actor.id).throwOnError();await db.from('pro_memberships').insert({user_id:actor.id,status:'active'}).throwOnError();}
  const document=emptyBusiness(),client={id:'agenda-client',name:'Cliente Álvarez',email:'',phone:'',notes:'Conservar',archived:false};document.clients=[client];
  const now=Date.now(),future=new Date(now+3*86400000),futureDay=agendaDay(future.toISOString()),first=new Date(Date.UTC(future.getUTCFullYear(),future.getUTCMonth()+3,1)),month=first.toISOString().slice(0,7),firstDay=first.toISOString().slice(0,10),previousDay=new Date(first.getTime()-86400000).toISOString().slice(0,10);
  const work=(id:string,start:string,end:string,service=id)=>({id,clientId:client.id,client:client.name,service,stage:'scheduled' as const,start,end,cancelled:false});
  for(let i=0;i<25;i++){const minutes=8*60+i*10;document.work.push(work('future-'+String(i).padStart(3,'0'),`${futureDay}T${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}:00-06:00`,`${futureDay}T${String(Math.floor((minutes+5)/60)).padStart(2,'0')}:${String((minutes+5)%60).padStart(2,'0')}:00-06:00`,'Mantenimiento '+String(i).padStart(3,'0')));}
  const midnight=work('cross-month',previousDay+'T23:30:00-06:00',firstDay+'T00:30:00-06:00','Trabajo cruza medianoche');
  const utc=work('utc-offset',firstDay+'T02:00:00Z',firstDay+'T03:00:00Z','Fecha UTC conservada');
  const ongoing=work('ongoing',new Date(now-5*60000).toISOString(),new Date(now+15*60000).toISOString(),'Trabajo en curso');
  document.work.push(midnight,utc,ongoing,{...work('completed',firstDay+'T10:00:00-06:00',firstDay+'T11:00:00-06:00'),stage:'completed'},{...work('cancelled',firstDay+'T12:00:00-06:00',firstDay+'T13:00:00-06:00'),cancelled:true},work('past','2020-01-01T10:00:00-06:00','2020-01-01T11:00:00-06:00'));
  document.availability=[{start:previousDay+'T23:40:00-06:00',end:firstDay+'T00:20:00-06:00'}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();const auth=await login(page.context(),owner);
  async function get(params:Record<string,string>){const response=await page.request.get('/api/pro/agenda?'+new URLSearchParams({day:futureDay,month:futureDay.slice(0,7),...params}));expect(response.status()).toBe(200);return response.json();}
  const day=await get({day:firstDay,month});expect(day.work.map((w:{id:string})=>w.id)).toEqual(['cross-month','completed','cancelled']);expect(day.work.find((w:{id:string})=>w.id==='cross-month')).toEqual(midnight);expect(day.availability).toEqual(document.availability);expect(day.marks).toEqual([firstDay]);
  const previous=await get({day:previousDay,month:previousDay.slice(0,7)});expect(previous.work.map((w:{id:string})=>w.id)).toEqual(['utc-offset','cross-month']);expect(previous.work.find((w:{id:string})=>w.id==='utc-offset')).toEqual(utc);expect(previous.marks).toEqual([previousDay]);expect(day.marks.length).toBeLessThanOrEqual(31);
  // Month marks must contain the carry-over day even though neither original start uses it.
  expect(midnight.start.startsWith(firstDay)).toBe(false);expect(agendaDay(utc.start)).toBe(previousDay);
  const rows=[];let after='';do{const result=await get({mode:'upcoming',after});expect(result.work.length).toBeLessThanOrEqual(20);expect(result.marks).toEqual([]);expect(result.availability).toEqual([]);expect(result.document).toBeUndefined();rows.push(...result.work);after=result.nextCursor??'';}while(after);
  expect(rows).toHaveLength(28);expect(new Set(rows.map(w=>w.id)).size).toBe(28);expect(rows[0].id).toBe('ongoing');expect(rows.every(w=>!w.cancelled&&w.stage!=='completed')).toBe(true);expect(rows.map(w=>w.id)).not.toContain('past');
  const searched=await get({mode:'upcoming',q:'alvarez'});expect(searched.work).toHaveLength(20);expect((await get({mode:'upcoming',q:'Mantenimiento 024'})).work.map((w:{id:string})=>w.id)).toEqual(['future-024']);expect((await get({mode:'upcoming',q:'%,stage.eq.completed'})).work).toEqual([]);
  expect((await page.request.get('/api/pro/agenda?day='+futureDay+'&mode=invalid')).status()).toBe(400);expect((await page.request.get('/api/pro/agenda?day='+futureDay+'&mode=upcoming&after=garbage')).status()).toBe(400);expect((await auth.rpc('pro_agenda_page',{p_user:owner.id,p_day:futureDay,p_month:month,p_mode:'upcoming'})).error).not.toBeNull();
  foreign=await browser.newContext();await login(foreign,other);expect((await foreign.request.get('/api/pro/agenda?day='+futureDay+'&mode=upcoming')).status()).toBe(200);expect((await (await foreign.request.get('/api/pro/agenda?day='+futureDay+'&mode=upcoming')).json()).work).toEqual([]);expect((await foreign.request.get('/api/pro/agenda?id='+midnight.id)).status()).toBe(404);
  const forbidden:string[]=[];await page.route('**/api/pro/workspace**',route=>{forbidden.push(route.request().url());return route.abort();});await page.route('**/api/quotes',route=>{if(route.request().method()==='GET'){forbidden.push(route.request().url());return route.abort();}return route.continue();});
  for(const path of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(path)).status()).toBe(200);
  await page.goto('/es/dashboard/profesional?tab=pro_agenda&estadoCitas=all&cita=future-024');
  const detail=page.getByRole('dialog');await expect(detail).toContainText('Mantenimiento 024');await detail.getByRole('button',{name:'Editar trabajo',exact:true}).click();await expect(page.getByLabel('Inicio · Costa Rica')).toHaveValue(agendaWallTime(document.work[24].start));await page.getByLabel('Inicio · Costa Rica').fill(futureDay+'T16:00');await page.getByLabel('Final · Costa Rica').fill(futureDay+'T17:00');const savedResponse=page.waitForResponse(r=>r.url().includes('/api/pro/agenda')&&r.request().method()==='PATCH');await page.getByRole('dialog').getByRole('button',{name:'Guardar',exact:true}).click();expect((await savedResponse).status()).toBe(200);await expect(page.getByRole('dialog').getByRole('button',{name:'Guardar',exact:true})).toHaveCount(0);
  // Closing the editor traverses browser history asynchronously. Wait for the
  // detail URL before starting a separate full-page navigation.
  await expect.poll(()=>new URL(page.url()).searchParams.get('editar')).toBeNull();await expect(page.getByRole('dialog').getByRole('button',{name:'Editar trabajo',exact:true})).toBeEnabled();
  const saved=await db.from('pro_work').select('*').eq('user_id',owner.id).eq('id','future-024').single().throwOnError();expect(saved.data!.id).toBe(document.work[24].id);expect(saved.data!.start).toBe(futureDay+'T16:00:00-06:00');expect(saved.data!.clientId).toBe(client.id);
  const retained=await db.from('pro_work').select('start,end').eq('user_id',owner.id).eq('id',utc.id).single().throwOnError();expect(retained.data).toEqual({start:utc.start,end:utc.end});expect(forbidden).toEqual([]);
  await page.goto('/es/dashboard/profesional?tab=pro_agenda&dia='+firstDay);await expect(page.locator('[data-reservation-calendar]')).not.toBeVisible();await page.locator('[data-availability-secondary] summary').click();await expect(page.locator('[data-reservation-calendar]')).toBeVisible();
  await page.getByRole('button',{name:'Editar disponibilidad del día',exact:true}).click();await expect(page.getByRole('dialog',{name:'Disponibilidad del día',exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toContainText(previousDay+' · 23:40–00:20');await page.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).click();
  await page.goto('/en/dashboard/profesional?tab=pro_agenda');await expect(page.getByRole('combobox',{name:'Show appointments',exact:true})).toBeVisible();await expectNoHorizontalOverflow(page);
 }finally{await page.goto('about:blank');await foreign?.close();await cleanupDisposableAccount(owner);await cleanupDisposableAccount(other);}
});
