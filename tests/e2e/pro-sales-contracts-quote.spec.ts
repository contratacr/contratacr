import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {mkdirSync} from 'node:fs';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {LibraryClauseVersions} from '../../src/lib/pro/contracts';
import type {LeadQuickQuoteContext} from '../../src/lib/pro/lead-quick-quote';

// Ronda F2-B, rows 40 and 35: versions of library clauses (restore = a normal CAS edit), new merge fields rendered in
// the customer's contract view, and the one-click "Cotizar" from a lead (list row, request detail, board card) that
// opens the existing quote editor with the customer and the matched catalogue service already filled in.
const origin=process.env.PRO_LOCAL_ORIGIN??'http://127.0.0.1:3185',api='/api/pro/contracts',quickApi='/api/pro/lead-quick-quote';
const shotsDir=process.env.F2B_SHOTS_DIR?process.env.F2B_SHOTS_DIR+'/r40-r35':null;
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
const uuid=()=>crypto.randomUUID();
async function makePro(db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount,slug:string){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 return (await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Ventas F2B',slug:slug+'-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError()).data!;
}
async function shot(page:Page,name:string){await expectNoHorizontalOverflow(page);if(!shotsDir)return;mkdirSync(shotsDir,{recursive:true});await page.screenshot({path:`${shotsDir}/${name}.png`,fullPage:true,animations:'disabled'});}

async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'f2b-owner'}),db=regressionAdminClient();let client:DisposableAccount|undefined,rival:DisposableAccount|undefined,stranger:DisposableAccount|undefined;
 try{
  client=await createDisposableAccount({prefix:'f2b-client'});rival=await createDisposableAccount({prefix:'f2b-rival'});stranger=await createDisposableAccount({prefix:'f2b-stranger'});
  const professional=await makePro(db,owner,'f2b');await makePro(db,rival,'f2b-rival');
  const workId=uuid(),requestId=uuid(),openRequestId=uuid(),orphanId=uuid(),day=crTodayISO(),linked='reservation-'+client.id,document=emptyBusiness();
  document.clients=[{id:linked,name:'Cliente ventas local',email:'cliente.ventas@example.com',phone:'8888-1234',notes:'',archived:false,address:'San Pedro, Montes de Oca'}];
  document.products=[{id:'svc-kitchen',sku:'SVC-K',name:'Remodelación de cocinas',stock:0,minimum:0,cost:0,price:1250000,archived:false,unit:'servicio',itemType:'service'},
   {id:'svc-paint',sku:'SVC-P',name:'Pintura interior',stock:0,minimum:0,cost:0,price:350000,archived:false,unit:'m²',itemType:'service'}];
  document.work=[{id:workId,clientId:linked,client:'Cliente ventas local',service:'Remodelación de cocina',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false,bookingClientId:client.id}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId,clientId:linked}),{timeout:45000})).status()).toBe(200);
  const base={professional_id:professional.id,owner_id:owner.id,professional_name:'Ventas F2B',professional_slug:'f2b-'+owner.id,duration_minutes:60,location_kind:'customer',location_text:'San Pedro, Montes de Oca',note:'',revision:0};
  await db.from('pro_appointment_requests').insert({...base,id:requestId,client_user_id:client.id,client_name:'Cliente ventas local',service:'Remodelación de cocina',requested_start:day+'T11:00:00-06:00',status:'confirmed',work_id:workId}).throwOnError();
  await db.from('pro_appointment_events').insert({request_id:requestId,actor_id:owner.id,side:'provider',action:'confirm',note:'',status:'confirmed'}).throwOnError();
  await db.from('pro_appointment_requests').insert({...base,id:openRequestId,client_user_id:client.id,client_name:'Cliente ventas local',service:'Pintura',requested_start:day+'T15:00:00-06:00',status:'requested'}).throwOnError();
  await db.from('pro_appointment_requests').insert({...base,id:orphanId,client_user_id:stranger.id,client_name:'Persona sin ficha',service:'Fontanería',requested_start:day+'T16:00:00-06:00',status:'requested'}).throwOnError();
  return {owner,client,rival,stranger,db,workId,requestId,openRequestId,orphanId,linked};
 }catch(error){for(const a of [owner,client,rival,stranger])if(a)await cleanupDisposableAccount(a);throw error;}
}

for(const language of ['es','en'] as const)test(`Sales F2-B: clause versions, new merge fields and one-click quote from a lead [${language}]`,async({page,browser,baseURL})=>{
 test.setTimeout(480000);local(baseURL);const en=language==='en',f=await fixture(page.context()),{owner,client,rival,db,workId,requestId,openRequestId,orphanId,linked}=f;
 const mobile=(page.viewportSize()?.width??1366)<1024,suffix=`${language}${mobile?'-mobile':''}`;
 let customer:BrowserContext|undefined,other:BrowserContext|undefined;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const notices=async()=>{const out:Record<string,unknown>={};for(const table of ['notifications','notification_push_outbox'])out[table]=(await db.from(table).select('*').in('user_id',[owner.id,client.id]).order('id').throwOnError()).data;return out;};const noticesBefore=await notices();
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const post=async(data:Record<string,unknown>,status=200)=>{const r=await page.request.post(api,{headers,data});expect(r.status(),JSON.stringify(data).slice(0,200)).toBe(status);return status===200?await r.json():null;};
  const versions=async(clauseId:string,status=200,actor=owner.id,ctx:Page=page)=>{const r=await ctx.request.get(api+'?'+new URLSearchParams({clauseId}),{headers:{'X-Pro-Expected-Actor':actor}});expect(r.status()).toBe(status);return status===200?await r.json() as LibraryClauseVersions:null;};

  // ---- Row 40 API: versions and restore through the existing writer ----
  const clauseId=uuid(),v1=en?'Twelve months of warranty for {{cliente.nombre}}.':'Doce meses de garantía para {{cliente.nombre}}.',v2=en?'Six months of warranty at {{trabajo.direccion}}.':'Seis meses de garantía en {{trabajo.direccion}}.';
  await post({action:'library_clause_create',actionId:uuid(),id:clauseId,title:en?'Warranty':'Garantía',body:v1});
  await post({action:'library_clause_update',actionId:uuid(),id:clauseId,revision:1,title:en?'Warranty':'Garantía',body:v2});
  let read=(await versions(clauseId))!;expect(read.versions.map(v=>[v.version,v.current])).toEqual([[2,true],[1,false]]);expect(read.versions[1].body).toBe(v1);
  await post({action:'library_clause_update',actionId:uuid(),id:clauseId,revision:1,title:en?'Warranty':'Garantía',body:v1},409);// stale revision: 409, nothing changes
  for(const query of ['?clauseId=nope',`?clauseId=${clauseId}&view=library`])expect((await page.request.get(api+query,{headers:{'X-Pro-Expected-Actor':owner.id}})).status(),query).toBe(400);
  await versions(uuid(),404);
  other=await browser.newContext();await login(other,rival);const otherPage=await other.newPage();
  await versions(clauseId,404,rival.id,otherPage);
  expect((await otherPage.request.get(quickApi+'?'+new URLSearchParams({kind:'request',id:requestId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await page.request.get(api+'?'+new URLSearchParams({clauseId}),{headers:{'X-Pro-Expected-Actor':client.id}})).status()).toBe(403);

  // ---- Row 40 UI: Company > Templates > Clause library ----
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'plantillas'}));
  const hub=page.locator('[data-contract-templates]');await expect(hub).toBeVisible({timeout:60000});
  await hub.locator('[data-contract-templates-tab="library"]').click();
  const row=hub.locator(`[data-contract-library-row="${en?'Warranty':'Garantía'}"]`);await expect(row.locator('[data-contract-library-version="2"]')).toHaveText(en?'Version 2':'Versión 2');
  await row.getByRole('button',{name:en?'Show versions (2)':'Ver versiones (2)'}).click();
  const panel=row.locator('[data-contract-library-versions]');await expect(panel.locator('[data-contract-library-version-item]')).toHaveCount(2);
  await expect(panel.locator('[data-contract-library-version-item="2"]')).toHaveAttribute('data-current','1');
  await shot(page,`r40-versions-${suffix}`);
  await panel.locator('[data-contract-library-restore="1"]').click();
  const dialog=page.getByRole('dialog').last();await expect(dialog).toContainText(en?'Restore version 1?':'¿Restaurar la versión 1?');await dialog.getByRole('button',{name:en?'Restore':'Restaurar',exact:true}).click();
  await expect(hub.getByRole('status').filter({hasText:en?'Version restored.':'Versión restaurada.'})).toBeVisible({timeout:30000});
  await expect(hub.locator(`[data-contract-library-row="${en?'Warranty':'Garantía'}"] [data-contract-library-version="3"]`)).toBeVisible({timeout:30000});
  read=(await versions(clauseId))!;expect(read.versions.map(v=>v.version)).toEqual([3,2,1]);expect(read.versions[0].body).toBe(v1);expect(read.clause.revision).toBe(3);
  await page.reload();await hub.locator('[data-contract-templates-tab="library"]').click();
  await expect(hub.locator(`[data-contract-library-row="${en?'Warranty':'Garantía'}"] [data-contract-library-version="3"]`)).toBeVisible({timeout:60000});

  // ---- Row 40: new merge fields in a shared contract, rendered in the customer's view ----
  const contractId=uuid();let c=(await post({action:'contract_create',actionId:uuid(),workId,id:contractId,templateId:null,title:en?'Kitchen agreement':'Contrato de cocina',language,estimateId:null,depositPercent:null})).contract;
  c=(await post({action:'clause_put',actionId:uuid(),scope:'contract',id:contractId,revision:c.revision,clauseId:uuid(),position:1,title:en?'Parties':'Partes',
   body:'{{cliente.nombre}} · {{cliente.telefono}} · {{cliente.correo}} · {{trabajo.direccion}}'})).contract;
  const detail=await (await page.request.get(api+'?'+new URLSearchParams({workId,contractId}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json();
  expect(detail.preview.missingFields).toEqual([]);expect(detail.preview.fields).toMatchObject({'cliente.telefono':'8888-1234','cliente.correo':'cliente.ventas@example.com','trabajo.direccion':'San Pedro, Montes de Oca','monto.total':null});
  await post({action:'share',actionId:uuid(),id:contractId,revision:c.revision});
  const settings=(await (await page.request.get('/api/pro/client-dashboard?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json()).settings;
  expect((await page.request.post('/api/pro/client-dashboard',{headers,data:{workId,actionId:uuid(),revision:settings.revision,showUpdates:true,showDailyLogs:true,showFiles:true,showContracts:true,welcomeText:null}})).status()).toBe(200);
  customer=await browser.newContext({viewport:page.viewportSize()??undefined,userAgent:await page.evaluate(()=>navigator.userAgent)});await login(customer,client);const customerPage=await customer.newPage();onAppPageError(customerPage,message=>runtime.push(message));
  await gotoOK(customerPage,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`);
  const text=customerPage.locator('[data-client-contracts] [data-client-contract-text]').first();await expect(text).toBeVisible({timeout:60000});
  await expect(text).toContainText('Cliente ventas local · 8888-1234 · cliente.ventas@example.com · San Pedro, Montes de Oca');
  await expect(text).not.toContainText('{{');
  await shot(customerPage,`r40-customer-contract-${suffix}`);

  // ---- Row 35 API: quick-quote context ----
  const quick=async(kind:string,id:string,status=200)=>{const r=await page.request.get(quickApi+'?'+new URLSearchParams({kind,id}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status(),kind+id).toBe(status);return status===200?await r.json() as LeadQuickQuoteContext:null;};
  const withWork=(await quick('request',requestId))!;expect(withWork).toMatchObject({clientId:linked,source:{kind:'work',id:workId},blocked:null,match:{productId:'svc-kitchen',matchedBy:'contains',priceCents:125000000}});
  expect((await quick('request',openRequestId))!).toMatchObject({clientId:linked,source:null,match:{productId:'svc-paint'}});
  expect((await quick('request',orphanId))!).toMatchObject({clientId:null,blocked:'no_client',match:null});
  await quick('request',uuid(),404);await quick('other',requestId,400);
  expect((await page.request.get(quickApi+'?'+new URLSearchParams({kind:'request',id:requestId,extra:'1'}),{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(400);

  // ---- Row 35 UI: list row, board card and request detail ----
  const openLeads=async(extra:Record<string,string>={})=>{await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_leads',...extra}));await expect(page.locator('[data-lead-inbox-layout]')).toBeVisible({timeout:60000});};
  await openLeads();
  const listRow=page.locator(`[data-pro-lead="${requestId}"]`);await expect(listRow).toBeVisible({timeout:60000});
  await expect(listRow.locator(`[data-lead-quick-quote="${requestId}"]`)).toHaveText(en?'Quote':'Cotizar');
  // A request whose account has no private customer record: explained, nothing created.
  await page.locator(`[data-lead-quick-quote="${orphanId}"]`).click();
  await expect(page.locator(`[data-pro-lead="${orphanId}"] [data-lead-quick-quote-problem="no_client"]`)).toContainText(en?'first confirm the appointment':'primero confirme la cita');
  await shot(page,`r35-list-${suffix}`);
  await listRow.locator(`[data-lead-quick-quote="${requestId}"]`).click();
  const editor=page.locator('[data-private-estimate-editor]');await expect(editor).toBeVisible({timeout:60000});
  const line=editor.locator('[data-private-estimate-line]').first();
  await expect(line.getByLabel(en?'Description':'Descripción',{exact:true})).toHaveValue('Remodelación de cocinas',{timeout:30000});
  await expect(editor.locator('[data-private-estimate-line]')).toHaveCount(1);
  await expect(editor).toContainText('Cliente ventas local');
  expect(new URL(page.url()).searchParams.get('lineaCatalogo')).toMatch(/:svc-kitchen$/);
  await shot(page,`r35-editor-prefilled-${suffix}`);
  // Nothing is saved by "Cotizar" alone.
  expect((await db.from('pro_private_estimates').select('id').eq('owner_id',owner.id).throwOnError()).data).toEqual([]);
  // Board card offers the same action.
  await openLeads({tablero:'1'});
  const card=page.locator(`[data-lead-board-card="${openRequestId}"]`);await expect(card).toBeVisible({timeout:60000});
  await card.scrollIntoViewIfNeeded();await expect(card.locator(`[data-lead-quick-quote="${openRequestId}"]`)).toBeVisible();
  await shot(page,`r35-board-${suffix}`);
  await card.locator(`[data-lead-quick-quote="${openRequestId}"]`).click();
  await expect(editor.locator('[data-private-estimate-line]').first().getByLabel(en?'Description':'Descripción',{exact:true})).toHaveValue('Pintura interior',{timeout:60000});
  // Request detail.
  await openLeads({citaSolicitud:requestId});
  const detailButton=page.locator(`[data-lead-detail-stage] [data-lead-quick-quote="${requestId}"]`);await expect(detailButton).toBeVisible({timeout:60000});
  await shot(page,`r35-request-detail-${suffix}`);

  expect(await notices()).toEqual(noticesBefore);
  expect(runtime).toEqual([]);
 }finally{await customer?.close();await other?.close();for(const a of [f.owner,f.client,f.rival,f.stranger])await cleanupDisposableAccount(a);}
});
