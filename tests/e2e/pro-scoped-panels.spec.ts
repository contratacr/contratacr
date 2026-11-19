import { test,expect,type BrowserContext } from 'playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createDisposableAccount,cleanupDisposableAccount } from './disposable-account';
import { regressionAdminClient } from './seed';
import { emptyBusiness,quoteTotal } from '../../src/lib/pro/business';
import { expectNoHorizontalOverflow, retryInterruptedNavigation } from './helpers';
test('scoped Pro panels: day/month projections, 150 quotes, paged selectors, preserved records and CAS',async({page,browser,baseURL},testInfo)=>{/* Closing round: WebKit can deliver the previous page's late redirect during goto (same single retry as gotoOK). */retryInterruptedNavigation(page);
 test.setTimeout(180000);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'pro-scoped-owner'}),other=await createDisposableAccount({prefix:'pro-scoped-other'}),db=regressionAdminClient();let foreign:BrowserContext|undefined;
 async function login(context:BrowserContext,actor:typeof owner){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();return auth;}
 try{
 for(const actor of [owner,other]){await db.from('profiles').update({is_provider:true}).eq('id',actor.id).throwOnError();await db.from('pro_memberships').insert({user_id:actor.id,status:'active'}).throwOnError();}
 const professional=await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Negocio de prueba',slug:'scoped-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).select('id').single().throwOnError();
 const doc=emptyBusiness();
 for(let i=0;i<45;i++){const n=String(i).padStart(3,'0');doc.clients.push({id:'c-'+n,name:'Cliente Álvarez '+n,email:'',phone:'',notes:'Conservar',archived:false});doc.products.push({id:'p-'+n,sku:'SKU-'+n,name:'Material '+n,stock:5,minimum:1,cost:10,price:1000,archived:false});doc.quotes.push({id:'legacy-'+n,clientId:'c-044',title:'Presupuesto antiguo '+n,lines:[{description:'Servicio conservado',quantity:1,price:i===0?1.005:1000,tax:0}],status:i===0?'draft':'accepted',validUntil:'2026-12-01'});}
 for(let i=0;i<42;i++){const n=String(i).padStart(3,'0'),minutes=8*60+i*3;doc.work.push({id:'work-'+n,client:'Cliente Álvarez 044',clientId:'c-044',service:'Cita '+n,stage:'scheduled',start:`2026-11-15T${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}:00-06:00`,end:`2026-11-15T${String(Math.floor((minutes+1)/60)).padStart(2,'0')}:${String((minutes+1)%60).padStart(2,'0')}:00-06:00`,cancelled:false});}
 doc.work.push({id:'cross-midnight',client:'Cliente Álvarez 044',clientId:'c-044',service:'Cruce de día',stage:'scheduled',start:'2026-11-14T23:30:00-06:00',end:'2026-11-15T00:30:00-06:00',cancelled:false});
 doc.availability=[{start:'2026-11-15T16:00:00-06:00',end:'2026-11-15T17:00:00-06:00'},{start:'2026-12-01T16:00:00-06:00',end:'2026-12-01T17:00:00-06:00'}];
 const standards=Array.from({length:105},(_,i)=>({id:crypto.randomUUID(),professional_id:professional.data!.id,client_id:null,client_name:'Cliente estándar',client_phone:'',public_code:'scoped-'+owner.id+'-'+i,quote_number:i+1,title:'Cotización reciente '+String(i).padStart(3,'0'),items:[{description:'Servicio',quantity:1,unit_price:1000}],tax_mode:'exento',subtotal:1000,tax_amount:0,total:1000,status:i===104?'accepted':'sent',created_at:'2026-10-26T12:00:00.123456Z'}));
 await db.from('quotes').insert(standards).throwOnError();doc.quoteLinks=[{quoteId:standards[104].id,clientId:'c-044'}];
 await db.from('pro_workspaces').insert({user_id:owner.id,document:doc,revision:1}).throwOnError();
 const core=await db.from('pro_workspace_core').select('document').eq('user_id',owner.id).single().throwOnError();
 for(const key of ['work','availability','quotes','quoteLinks','clients','products','movements'])expect(core.data!.document[key]).toBeUndefined();
 for(const [table,count] of [['pro_work',43],['pro_availability',2],['pro_legacy_quotes',45],['pro_legacy_quote_lines',45],['pro_quote_links',1]] as const){
   const rows=await db.from(table).select('*',{count:'exact',head:true}).eq('user_id',owner.id).throwOnError();expect(rows.count).toBe(count);
 }
 expect((await db.from('pro_workspaces').select('document').eq('user_id',owner.id).single().throwOnError()).data!.document).toEqual(doc);
 expect((await page.request.get('/api/pro/agenda?day=2026-11-15')).status()).toBe(401);expect((await page.request.get('/api/pro/quotes')).status()).toBe(401);
 const auth=await login(page.context(),owner);
 for(const table of ['pro_work','pro_availability','pro_legacy_quotes','pro_legacy_quote_lines','pro_quote_links']){
   expect((await auth.from(table).select('user_id').eq('user_id',owner.id).throwOnError()).data.length).toBeGreaterThan(0);
   expect((await auth.from(table).insert({user_id:owner.id})).error).not.toBeNull();
 }
 expect((await auth.from('pro_panel_legacy_backup').select('*')).error).not.toBeNull();
 async function get(path:string){const r=await page.request.get(path);expect(r.status()).toBe(200);return r.json();}
 const agendaUrl='/api/pro/agenda?day=2026-11-15&month=2026-11';
 const first=await get(agendaUrl);expect(first.work).toHaveLength(20);expect(first.marks).toEqual(['2026-11-14','2026-11-15']);expect(first.availability).toHaveLength(1);expect(first.document).toBeUndefined();expect(first.clients).toBeUndefined();
 const second=await get(agendaUrl+'&after='+first.nextCursor),last=await get(agendaUrl+'&after='+second.nextCursor);expect(second.work).toHaveLength(20);expect(last.work).toHaveLength(3);expect(last.nextCursor).toBeNull();expect(new Set([...first.work,...second.work,...last.work].map(w=>w.id)).size).toBe(43);expect([...first.work,...second.work,...last.work].find(w=>w.id==='cross-midnight')).toEqual(doc.work.find(w=>w.id==='cross-midnight'));
 expect((await get('/api/pro/agenda?day=2026-11-15&month=2026-12')).marks).toEqual(['2026-12-01']);
 expect((await page.request.get('/api/pro/agenda?day=2026-02-30')).status()).toBe(400);expect((await page.request.get(agendaUrl+'&after=garbage')).status()).toBe(400);
 const summaries=[];let after='';do{const b=await get('/api/pro/quotes?'+new URLSearchParams({after}));expect(b.items.length).toBeLessThanOrEqual(20);for(const row of b.items){expect(row.items).toBeUndefined();expect(row.lines).toBeUndefined();summaries.push(row);}after=b.nextCursor||'';}while(after);
 expect(summaries).toHaveLength(150);expect(new Set(summaries.map(q=>q.key)).size).toBe(150);expect(summaries.some(q=>q.id===standards[104].id)).toBe(true);
 expect(summaries.find(q=>q.id==='legacy-000').total).toBe(quoteTotal(doc.quotes[0].lines));
 const searched=await get('/api/pro/quotes?'+new URLSearchParams({q:'alvarez 044'}));expect(searched.items).toHaveLength(20);expect(searched.items.every((q:{legacy:boolean})=>q.legacy)).toBe(true);
 expect((await get('/api/pro/quotes?'+new URLSearchParams({q:'%,status.eq.accepted'}))).items).toEqual([]);
 const detail=await get('/api/pro/quotes?id='+standards[104].id);expect(detail.quote.id).toBe(standards[104].id);expect(detail.link).toEqual(doc.quoteLinks[0]);expect(detail.document).toBeUndefined();
 const legacy=await get('/api/pro/quotes?id=legacy-000&legacy=1');expect(legacy.document.quotes).toEqual([doc.quotes[0]]);expect(legacy.document.clients).toHaveLength(1);expect(legacy.document.products).toEqual([]);expect(legacy.document.work).toEqual([]);
 const option=await get('/api/pro/catalog?kind=clients&id=c-044&option=1');expect(option.document.clients[0].id).toBe('c-044');expect(option.document.work).toEqual([]);expect(option.document.quotes).toEqual([]);
 foreign=await browser.newContext();const foreignAuth=await login(foreign,other);
 for(const table of ['pro_work','pro_availability','pro_legacy_quotes','pro_legacy_quote_lines','pro_quote_links'])expect((await foreignAuth.from(table).select('*').eq('user_id',owner.id).throwOnError()).data).toEqual([]);
 expect((await foreignAuth.rpc('pro_legacy_quote_record',{p_user:owner.id,p_id:'legacy-000'}).throwOnError()).data).toBeNull();
 expect((await foreign.request.get('/api/pro/quotes?id='+standards[104].id)).status()).toBe(404);expect((await foreign.request.get('/api/pro/quotes?id=legacy-000&legacy=1')).status()).toBe(404);expect((await foreign.request.get('/api/pro/agenda?id=work-000')).status()).toBe(404);
 for(const [name,args] of [['pro_agenda_page',{p_user:other.id,p_day:'2026-11-15',p_month:'2026-11'}],['pro_quotes_page',{p_user:other.id}],['pro_booking_context',{p_user:owner.id}],['pro_client_history',{p_user:owner.id,p_client:'c-044'}],['pro_patch_core',{p_user:owner.id,p_section:'work',p_row:doc.work[0],p_revision:1}],['pro_reserve_core',{p_user:owner.id,p_client:doc.clients[0],p_work:doc.work[0],p_revision:1}]] as const)expect((await auth.rpc(name,args)).error).not.toBeNull();
 const patch=(data:unknown)=>page.request.patch('/api/pro/agenda',{headers:{origin:baseURL!},data});
 expect((await patch({revision:1,work:{...doc.work[0],id:'overlap',start:'2026-11-15T00:15:00-06:00',end:'2026-11-15T00:20:00-06:00'}})).status()).toBe(400);
 expect((await patch({revision:1,work:{...doc.work[0],id:'fake-booking',bookingClientId:other.id}})).status()).toBe(400);
 const race=await Promise.all([/* Closing round: an available slot must be in the future; the fixed 2026-11-15 date became past. */patch({revision:1,add:{start:'2030-11-15T18:00:00-06:00',end:'2030-11-15T19:00:00-06:00'}}),page.request.patch('/api/pro/catalog',{headers:{origin:baseURL!},data:{kind:'clients',revision:1,rows:[{...doc.clients[0],name:'Cliente actualizado'}]}})]);expect(race.map(r=>r.status()).sort()).toEqual([200,409]);
 expect((await page.request.patch('/api/pro/quotes',{headers:{origin:baseURL!},data:{revision:2,quote:{...doc.quotes[1],title:'No permitido'}}})).status()).toBe(400);
 expect((await page.request.patch('/api/pro/quotes',{headers:{origin:baseURL!},data:{revision:2,quote:{...doc.quotes[0],title:'Presupuesto editado'}}})).status()).toBe(200);
 const stored=await db.from('pro_workspaces').select('document').eq('user_id',owner.id).single().throwOnError();expect(stored.data!.document.products).toEqual(doc.products);expect(stored.data!.document.work).toEqual(doc.work);expect(stored.data!.document.quotes.slice(1)).toEqual(doc.quotes.slice(1));expect(stored.data!.document.quoteLinks).toEqual(doc.quoteLinks);
 const fullRequests:string[]=[];await page.route('**/api/quotes',async route=>{if(route.request().method()==='GET'){fullRequests.push('unscoped quotes');await route.fulfill({status:418,json:{error:'Unscoped quote prefetch forbidden'}});}else await route.continue();});await page.route('**/api/pro/workspace',async r=>{fullRequests.push(r.request().method());await r.fulfill({status:418,json:{error:'Full document forbidden in scoped UI'}});});
 await page.goto('/es/dashboard/profesional?tab=quotes');// ProRecordCard: the quote title is the heading and the customer is its subtitle (connected-quotes.tsx).
 await expect(page.getByRole('heading',{name:/^Cotización reciente \d{3}$/})).toHaveCount(20);await expect(page.locator('[data-pro-record-card]').filter({hasText:'Cliente estándar'})).toHaveCount(20);
 await page.getByLabel('Buscar cotizaciones').fill('Presupuesto antiguo 044');await expect(page.getByText('Presupuesto antiguo 044',{exact:true})).toBeVisible();await page.getByText('Presupuesto antiguo 044',{exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Servicio conservado');await page.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.getByRole('button',{name:'Nueva cotización',exact:true}).click();/* Closing round: the form remounts when its address (nueva=1) commits; search after that, not before. */await expect(page).toHaveURL(/[?&]nueva=1/);await expect(page.getByLabel('Buscar clientes guardados')).toBeEditable();await page.getByLabel('Buscar clientes guardados').fill('alvarez 044');await expect(page.getByLabel('Cliente guardado',{exact:true}).locator('option')).toHaveCount(2);await page.getByLabel('Cliente guardado',{exact:true}).selectOption('c-044');await page.getByLabel('Buscar en catálogo').fill('Material 044');await expect(page.getByLabel('Agregar producto o servicio',{exact:true}).locator('option')).toHaveCount(2);await page.getByLabel('Agregar producto o servicio',{exact:true}).selectOption('p-044');await expect(page.getByLabel('Precio (₡)',{exact:true})).toHaveValue('1130');await expectNoHorizontalOverflow(page);await page.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.goto('/es/dashboard/profesional?tab=pro_agenda&nueva=1&cliente=c-044&cotizacion='+standards[104].id);await expect(page.getByLabel('Cliente',{exact:true})).toHaveValue('c-044');await expect(page.getByLabel('Cotización aceptada (opcional)',{exact:true})).toHaveValue('quote:'+standards[104].id);await page.getByLabel('Trabajo',{exact:true}).fill('Borrador aislado');await page.getByLabel('Inicio · Costa Rica').fill('2026-11-20T09:00');await page.getByLabel('Final · Costa Rica').fill('2026-11-20T10:00');
 await page.reload();await expect(page.getByLabel('Trabajo',{exact:true})).toHaveValue('Borrador aislado');await expect(page.getByLabel('Cotización aceptada (opcional)',{exact:true})).toHaveValue('quote:'+standards[104].id);
 await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('scoped-agenda-draft.png'),fullPage:true});
 // Concurrent changes retain the draft; reloading fetches only the scoped day and permits retry.
 await db.rpc('pro_patch_core',{p_user:owner.id,p_section:'availability',p_row:{start:'2026-12-03T09:00:00-06:00',end:'2026-12-03T10:00:00-06:00'},p_revision:3}).throwOnError();
 await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Recargue');await expect(page.getByLabel('Trabajo',{exact:true})).toHaveValue('Borrador aislado');
 await page.reload();await expect(page.getByLabel('Trabajo',{exact:true})).toHaveValue('Borrador aislado');await page.getByRole('button',{name:'Guardar',exact:true}).click();// The saved appointment opens its detail dialog, titled by the job, with the customer inside (unified appointments).
 await expect(page.getByRole('dialog',{name:'Borrador aislado',exact:true})).toContainText('Cliente Álvarez 044');
 const afterSave=await db.from('pro_workspaces').select('document').eq('user_id',owner.id).single().throwOnError();expect(afterSave.data!.document.work).toHaveLength(doc.work.length+1);expect(afterSave.data!.document.work.find((w:{service:string})=>w.service==='Borrador aislado')).toMatchObject({clientId:'c-044',externalQuoteId:standards[104].id});expect(afterSave.data!.document.products).toEqual(doc.products);
 // The public-availability calendar lives in a collapsed <details> (agenda-workspace.tsx); open it explicitly.
 await page.goto('/es/dashboard/profesional?tab=pro');await page.locator('[data-availability-secondary] summary').click();await expect(page.locator('[data-reservation-calendar]')).toBeVisible();
 expect(fullRequests).toEqual([]);
 await db.from('pro_memberships').update({status:'inactive'}).eq('user_id',owner.id).throwOnError();expect((await page.request.get('/api/pro/agenda?day=2026-11-15')).status()).toBe(403);expect((await page.request.get('/api/pro/quotes')).status()).toBe(403);
 }finally{await page.goto('about:blank');await foreign?.close();await cleanupDisposableAccount(owner);await cleanupDisposableAccount(other);}
});
