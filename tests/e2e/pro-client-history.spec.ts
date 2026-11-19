import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness,quoteTotal} from '../../src/lib/pro/business';
import {expectNoHorizontalOverflow} from './helpers';

test('Pro customer history: paged mixed history, deep quote, owner isolation and conservative revisions',async({page,browser,baseURL})=>{
 test.setTimeout(150000);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'pro-history-owner'}),other=await createDisposableAccount({prefix:'pro-history-other'}),db=regressionAdminClient();
 let foreign:BrowserContext|undefined;
 async function login(context:BrowserContext,actor:typeof owner){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();return auth;}
 try{
  for(const actor of [owner,other]){const account=await db.auth.admin.getUserById(actor.id);expect((await db.auth.admin.updateUserById(actor.id,{user_metadata:{...account.data.user!.user_metadata,role:'professional',is_provider:true}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',actor.id).throwOnError();await db.from('pro_memberships').insert({user_id:actor.id,status:'active'}).throwOnError();}
  const professional=await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Historial local',slug:'history-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).select('id').single().throwOnError();
  const document=emptyBusiness(),client={id:'retained-client',name:'Cliente historial',email:'',phone:'',notes:'Datos originales',archived:false};document.clients=[client,{...client,id:'other-client',name:'Otro cliente'}];
  for(let i=0;i<25;i++){
   const n=String(i).padStart(3,'0');
   document.quotes.push({id:'legacy-'+n,clientId:client.id,title:'Presupuesto anterior '+n,lines:[{description:'Conservar detalle',quantity:1,price:i===0?1.005:1000,tax:0}],status:'accepted',validUntil:'2027-12-01'});
   document.work.push({id:'work-'+n,clientId:client.id,client:client.name,service:'Cita conservada '+n,stage:'completed',start:`2026-11-${String(i+1).padStart(2,'0')}T10:00:00-06:00`,end:`2026-11-${String(i+1).padStart(2,'0')}T11:00:00-06:00`,cancelled:i===0});
  }
  const quotes=Array.from({length:106},(_,i)=>({id:crypto.randomUUID(),professional_id:professional.data!.id,client_id:null,client_name:client.name,client_phone:'',public_code:'history-'+owner.id+'-'+i,quote_number:i+1,title:i===105?'Cotización fuera de cien':'Cotización '+String(i).padStart(3,'0'),items:[{description:'Detalle privado',quantity:1,unit_price:1000}],tax_mode:'exento',subtotal:1000,tax_amount:0,total:1000,status:'accepted',created_at:i===105?'2026-01-01T12:00:00Z':'2026-10-26T12:00:00.123456Z'}));
  await db.from('quotes').insert(quotes).throwOnError();document.quoteLinks=quotes.map(q=>({quoteId:q.id,clientId:client.id}));
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  const auth=await login(page.context(),owner);
  const endpoint='/api/pro/catalog?'+new URLSearchParams({kind:'clients',id:client.id,history:'1'});
  const summaries:Array<{id:string;key:string;kind:string;legacy:boolean;total:number}>=[];let after='';
  do{const response=await page.request.get(endpoint+'&'+new URLSearchParams({after}));expect(response.status()).toBe(200);const body=await response.json();expect(body.items.length).toBeLessThanOrEqual(20);expect(body.revision).toBe(1);expect(body.document).toBeUndefined();for(const row of body.items){expect(row.items).toBeUndefined();expect(row.lines).toBeUndefined();summaries.push(row);}after=body.nextCursor??'';}while(after);
  expect(summaries).toHaveLength(156);expect(new Set(summaries.map(row=>row.key)).size).toBe(156);expect(summaries.some(row=>row.id===quotes[105].id)).toBe(true);expect(summaries.find(row=>row.id==='legacy-000')!.total).toBe(quoteTotal(document.quotes[0].lines));
  const point=await page.request.get('/api/pro/catalog?'+new URLSearchParams({kind:'clients',id:client.id,option:'1'}));expect(point.status()).toBe(200);const pointBody=await point.json();expect(pointBody.document.clients).toEqual([client]);expect(pointBody.document.work).toEqual([]);expect(pointBody.document.quotes).toEqual([]);expect(pointBody.document.quoteLinks).toEqual([]);
  const unrelated=await page.request.get('/api/pro/catalog?'+new URLSearchParams({kind:'clients',id:'other-client',history:'1'}));expect(unrelated.status()).toBe(200);expect((await unrelated.json()).items).toEqual([]);
  expect((await page.request.get(endpoint+'&after=garbage')).status()).toBe(400);
  expect((await page.request.get('/api/pro/catalog?kind=clients&history=1')).status()).toBe(400);
  expect((await auth.rpc('pro_client_history_page',{p_user:owner.id,p_client:client.id})).error).not.toBeNull();
  foreign=await browser.newContext();await login(foreign,other);expect((await foreign.request.get(endpoint)).status()).toBe(404);expect((await foreign.request.get('/api/pro/quotes?id='+quotes[105].id)).status()).toBe(404);expect((await foreign.request.get('/api/pro/agenda?id=work-000')).status()).toBe(404);
  const forbidden:string[]=[];
  await page.route('**/api/quotes',route=>{if(route.request().method()==='GET'){forbidden.push(route.request().url());return route.abort();}return route.continue();});
  await page.route('**/api/pro/workspace**',route=>{forbidden.push(route.request().url());return route.abort();});
  // Compile the real security routes before the cold dashboard fans out requests.
  // This verifies the session; it does not stub or bypass the authentication gate.
  for(const path of ['/api/auth/session-mfa','/api/auth/registration-state'])expect((await page.request.get(path)).status()).toBe(200);
  await page.goto('/es/dashboard/profesional?tab=pro_clients&cliente='+client.id);
  const historyOrRecovery=page.locator('[data-client-history], [data-session-recovery]');
  await expect(historyOrRecovery.first()).toBeVisible();
  const recovery=page.locator('[data-session-recovery]');
  if(await recovery.isVisible()){
   // Next dev can still exceed the gate's eight-second timeout during cold compilation.
   // Exercise its user-facing recovery once, then require the original history assertions.
   const verified=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/session-mfa'&&response.request().method()==='GET');
   await recovery.getByRole('button',{name:'Reintentar',exact:true}).click();
   expect((await verified).status()).toBe(200);await expect(recovery).toHaveCount(0);
  }

  const history=page.locator('[data-client-history]');await expect(history).toBeVisible();await expect(history.locator('button').filter({hasText:'Cita conservada'})).toHaveCount(20);
  await history.getByRole('button',{name:'Ver más historial',exact:true}).click();await expect(history.getByRole('button',{name:/Cita conservada 000/})).toBeVisible();
  await history.getByRole('button',{name:/Cita conservada 000/}).click();await expect(page.getByRole('dialog').last()).toContainText('Cancelada');await page.getByRole('dialog').last().getByRole('button',{name:'Cerrar',exact:true}).click();
  // Returning from Agenda remounts the customer history. Require its first page
  // before the concurrent write so the check still compares two revisions.
  await expect(history.locator('button').filter({hasText:'Cita conservada'})).toHaveCount(20);
  // A write between pages must require a refresh instead of combining revisions.
  await db.rpc('pro_mutate_catalog',{p_user:owner.id,p_kind:'clients',p_rows:[{...client,notes:'Cambio concurrente'}],p_revision:1}).throwOnError();
  await history.getByRole('button',{name:'Ver más historial',exact:true}).click();await expect(history.getByRole('status')).toContainText('El historial cambió');await expect(history.getByRole('button',{name:/Cita conservada/}).first()).toBeDisabled();await history.getByRole('button',{name:'Actualizar historial'}).click();await expect(history.getByRole('status')).toHaveCount(0);
  while(await history.getByRole('button',{name:'Ver más historial',exact:true}).count()){const before=await history.locator('button').count();await history.getByRole('button',{name:'Ver más historial',exact:true}).click();await expect.poll(()=>history.locator('button').count()).not.toBe(before);}
  await expect(history.getByRole('button',{name:/Cotización fuera de cien/})).toBeVisible();await expectNoHorizontalOverflow(page);
  await history.getByRole('button',{name:/Cotización fuera de cien/}).click();await expect(page.getByRole('dialog')).toContainText('Cotización fuera de cien');expect(forbidden).toEqual([]);
  await page.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).click();
  await expect(page).toHaveURL(/tab=pro_clients/);await expect(history).toBeVisible();
  await page.context().addCookies([{name:'NEXT_LOCALE',value:'en',url:baseURL!}]);await page.goto('/en/dashboard/profesional?tab=pro_clients&cliente='+client.id);await expect(history.getByRole('heading',{name:'Appointment and quote history',exact:true})).toBeVisible();await expect(history.getByRole('button',{name:/Cita conservada/}).first()).toBeEnabled();await history.getByRole('button',{name:/Cita conservada/}).first().click();await expect(page.getByRole('dialog').last()).toContainText('Cliente historial');await page.getByRole('dialog').last().getByRole('button',{name:'Close',exact:true}).click();await expect(history).toBeVisible();await expectNoHorizontalOverflow(page);
  const preserved=await db.from('pro_workspaces').select('document').eq('user_id',owner.id).single().throwOnError();expect(preserved.data!.document.work).toEqual(document.work);expect(preserved.data!.document.quotes).toEqual(document.quotes);expect(preserved.data!.document.quoteLinks).toEqual(document.quoteLinks);
 }finally{await foreign?.close();await cleanupDisposableAccount(owner);await cleanupDisposableAccount(other);}
});
