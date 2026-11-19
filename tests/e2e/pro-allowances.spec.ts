import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {AllowanceDetail,AllowanceItem,ClientAllowances} from '../../src/lib/pro/allowances';

// Family 75: montos previstos para materiales por elegir (allowances).
const origin='http://127.0.0.1:3185',api='/api/pro/allowances';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
const shiftDay=(iso:string,days:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};

async function makePro(db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount,slug:string){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 return (await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Montos previstos local',slug:slug+'-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError()).data!;
}

async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'allow-owner'}),db=regressionAdminClient();let client:DisposableAccount|undefined,rival:DisposableAccount|undefined;
 try{
  client=await createDisposableAccount({prefix:'allow-client'});rival=await createDisposableAccount({prefix:'allow-rival'});
  const professional=await makePro(db,owner,'allow');await makePro(db,rival,'allow-rival');
  const workId=crypto.randomUUID(),uiWorkId=crypto.randomUUID(),requestId=crypto.randomUUID(),day=crTodayISO(),linkedClient='reservation-'+client.id,document=emptyBusiness();
  document.clients=[{id:linkedClient,name:'Cliente montos local',email:'',phone:'',notes:'',archived:false}];
  document.work=[
   {id:workId,clientId:linkedClient,client:'Cliente montos local',service:'Remodelación de cocina',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false,bookingClientId:client.id},
   {id:uiWorkId,clientId:linkedClient,client:'Cliente montos local',service:'Baño principal',stage:'scheduled',start:day+'T14:00:00-06:00',end:day+'T15:00:00-06:00',cancelled:false},
  ];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  for(const id of [workId,uiWorkId])expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId:id,clientId:linkedClient}),{timeout:45000})).status()).toBe(200);
  await db.from('pro_appointment_requests').insert({id:requestId,professional_id:professional.id,owner_id:owner.id,client_user_id:client.id,client_name:'Cliente montos local',professional_name:'Montos previstos local',professional_slug:'allow-'+owner.id,service:'Remodelación de cocina',duration_minutes:60,location_kind:'agree',location_text:'',note:'',requested_start:day+'T11:00:00-06:00',status:'confirmed',revision:0,work_id:workId}).throwOnError();
  await db.from('pro_appointment_events').insert({request_id:requestId,actor_id:owner.id,side:'provider',action:'confirm',note:'',status:'confirmed'}).throwOnError();
  // An agreed amount on the UI project so the optional extra can be proposed.
  const revision=(await db.from('pro_workspace_core').select('revision').eq('user_id',owner.id).single().throwOnError()).data!.revision;
  expect((await context.request.post(origin+'/api/pro/client-operations',{headers:{Origin:origin},data:{kind:'agreement',clientId:linkedClient,workId:uiWorkId,actionId:crypto.randomUUID(),revision,amountCents:100000000}})).status()).toBe(200);
  return {owner,client,rival,db,workId,uiWorkId,requestId,linkedClient};
 }catch(error){await cleanupDisposableAccount(owner);if(client)await cleanupDisposableAccount(client);if(rival)await cleanupDisposableAccount(rival);throw error;}
}

for(const language of ['es','en'] as const)test(`Allowances: planned vs. chosen, history, extra proposal and opt-in customer view [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(360000);local(baseURL);const en=language==='en',f=await fixture(page.context()),{owner,client,rival,db,workId,uiWorkId,requestId}=f;let customer:BrowserContext|undefined,other:BrowserContext|undefined;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const notices=async()=>{const out:Record<string,unknown>={};for(const table of ['notifications','notification_push_outbox'])out[table]=(await db.from(table).select('*').in('user_id',[owner.id,client.id]).order('id').throwOnError()).data;return out;};const noticesBefore=await notices();
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const read=async(id=workId)=>{const r=await page.request.get(api+'?'+new URLSearchParams({workId:id}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as AllowanceDetail;};
  const post=async(data:Record<string,unknown>,status=200)=>{const r=await page.request.post(api,{headers,data});expect(r.status(),JSON.stringify(data)).toBe(status);return status===200?(await r.json()).item as AllowanceItem:null;};
  const today=crTodayISO(),yesterday=shiftDay(today,-1);

  // ---- API ----
  const initial=await read();expect(initial).toMatchObject({workId,today,items:[],history:[],totals:{count:0,plannedCents:0,actualCents:0,differenceCents:0,pendingCount:0,overdueCount:0}});
  // Query validation.
  expect((await page.request.get(api,{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(400);
  expect((await page.request.get(api+'?workId='+workId+'&workId='+workId,{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(400);
  expect((await page.request.get(api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':client.id}})).status()).toBe(403);
  const faucet={action:'create',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),name:'Grifería de cocina',category:'Cocina',plannedCents:15000000,dueDate:yesterday,notes:'NOTA_INTERNA_PRIVADA'};
  // Body validation (400): extra key, negative amount, impossible date, empty name, fractional céntimos.
  await post({...faucet,extra:true},400);await post({...faucet,plannedCents:-1},400);await post({...faucet,dueDate:'2026-02-30'},400);await post({...faucet,name:'  '},400);await post({...faucet,plannedCents:10.5},400);
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':owner.id},data:faucet})).status()).toBe(403);
  const created=await post(faucet);expect(created).toMatchObject({name:'Grifería de cocina',category:'Cocina',plannedCents:15000000,dueDate:yesterday,status:'open',overdue:true,revision:1,choice:null,differenceCents:null});
  // Idempotent replay returns the same receipt; reused identity with other data → 400; reused allowance id → 409.
  const replay=await page.request.post(api,{headers,data:faucet});expect(replay.status()).toBe(200);expect((await replay.json()).item).toEqual(created);
  await post({...faucet,name:'Otro nombre'},400);await post({...faucet,actionId:crypto.randomUUID()},409);
  const tile=await post({action:'create',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),name:'Cerámica de piso',category:null,plannedCents:40000000,dueDate:today,notes:null});
  const lamp=await post({action:'create',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),name:'Lámpara colgante',category:'Sala',plannedCents:5000000,dueDate:null,notes:null});
  // Overdue uses the Costa Rica calendar day: yesterday is overdue, today is not.
  let detail=await read();expect(detail.totals).toMatchObject({count:3,plannedCents:60000000,pendingCount:3,decidedCount:0,overdueCount:1,projectedCents:60000000});
  expect(detail.items.find(item=>item.id===tile!.id)!.overdue).toBe(false);
  // Optimistic revision: stale edit → 409; current edit → 200.
  const edit={action:'update',actionId:crypto.randomUUID(),workId,id:created!.id,revision:2,name:'Grifería de cocina',category:'Cocina',plannedCents:16000000,dueDate:yesterday,notes:'NOTA_INTERNA_PRIVADA'};
  await post(edit,409);const edited=await post({...edit,actionId:crypto.randomUUID(),revision:1});expect(edited).toMatchObject({plannedCents:16000000,revision:2});
  await post({...edit,actionId:crypto.randomUUID(),revision:2},400);// no changes
  // Define the three: above, below and equal to the allowance.
  await post({action:'decide',actionId:crypto.randomUUID(),workId,id:created!.id,revision:2,choiceDescription:'Grifo',supplier:null,quantity:0,actualCents:1},400);
  const over=await post({action:'decide',actionId:crypto.randomUUID(),workId,id:created!.id,revision:2,choiceDescription:'Grifo monomando acero',supplier:'Ferretería Central',quantity:1,actualCents:18500000});
  expect(over).toMatchObject({status:'decided',differenceCents:2500000,variance:'over',overdue:false,choice:{description:'Grifo monomando acero',supplier:'Ferretería Central',quantity:1,actualCents:18500000}});
  const under=await post({action:'decide',actionId:crypto.randomUUID(),workId,id:tile!.id,revision:1,choiceDescription:'Porcelanato 60x60',supplier:null,quantity:42.5,actualCents:35000000});
  expect(under).toMatchObject({differenceCents:-5000000,variance:'under',choice:{quantity:42.5}});
  const equal=await post({action:'decide',actionId:crypto.randomUUID(),workId,id:lamp!.id,revision:1,choiceDescription:'Lámpara de ratán',supplier:null,quantity:2,actualCents:5000000});
  expect(equal).toMatchObject({differenceCents:0,variance:'equal'});
  detail=await read();expect(detail.totals).toMatchObject({count:3,plannedCents:61000000,decidedPlannedCents:61000000,actualCents:58500000,differenceCents:-2500000,projectedCents:58500000,pendingCount:0,decidedCount:3,overdueCount:0});
  // A defined allowance is locked: reopen first.
  await post({...edit,actionId:crypto.randomUUID(),revision:3,plannedCents:1},400);
  await post({action:'decide',actionId:crypto.randomUUID(),workId,id:created!.id,revision:3,choiceDescription:'Otro',supplier:null,quantity:1,actualCents:1},400);
  // A change link needs a real proposal of this job for exactly this difference.
  await post({action:'link_change',actionId:crypto.randomUUID(),workId,id:created!.id,revision:3,changeId:crypto.randomUUID()},400);
  // Reopen keeps the previous choice in the immutable history.
  const reopened=await post({action:'reopen',actionId:crypto.randomUUID(),workId,id:created!.id,revision:3});expect(reopened).toMatchObject({status:'reopened',choice:null,differenceCents:null,overdue:true,revision:4});
  await post({action:'reopen',actionId:crypto.randomUUID(),workId,id:created!.id,revision:4},400);
  detail=await read();expect(detail.totals).toMatchObject({pendingCount:1,decidedCount:2,overdueCount:1,actualCents:40000000,differenceCents:-5000000,projectedCents:56000000});
  const reopenEntry=detail.history.find(entry=>entry.action==='reopen')!;expect(reopenEntry.before!.choice).toMatchObject({description:'Grifo monomando acero',actualCents:18500000});expect(reopenEntry.after.choice).toBeNull();
  expect(detail.history.filter(entry=>entry.allowanceId===created!.id).map(entry=>entry.action).sort()).toEqual(['create','decide','reopen','update']);
  const rewrite=await db.from('pro_work_allowance_history').update({action:'create'}).eq('owner_id',owner.id).eq('action_id',reopenEntry.actionId);expect(rewrite.error?.message).toContain('immutable');
  // Archive removes it from totals; restore brings it back.
  await post({action:'archive',actionId:crypto.randomUUID(),workId,id:lamp!.id,revision:2});
  detail=await read();expect(detail.totals).toMatchObject({count:2,plannedCents:56000000,decidedCount:1});expect(detail.items.at(-1)).toMatchObject({id:lamp!.id,archived:true});
  await post({action:'archive',actionId:crypto.randomUUID(),workId,id:lamp!.id,revision:3},400);
  // Isolation: another Pro account cannot read (404) or write (403); the customer cannot write.
  other=await browser.newContext({baseURL});await login(other,rival);
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await other.request.post(origin+api,{headers:{Origin:origin,'X-Pro-Expected-Actor':rival.id},data:{action:'restore',actionId:crypto.randomUUID(),workId,id:lamp!.id,revision:3}})).status()).toBe(403);
  customer=await browser.newContext({baseURL});await login(customer,client);
  expect((await customer.request.post(origin+api,{headers:{Origin:origin,'X-Pro-Expected-Actor':client.id},data:{action:'restore',actionId:crypto.randomUUID(),workId,id:lamp!.id,revision:3}})).status()).toBe(403);
  expect((await customer.request.get(origin+api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':client.id}})).status()).toBe(403);
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  await post({action:'restore',actionId:crypto.randomUUID(),workId,id:lamp!.id,revision:3});
  // Customer read: off by default.
  const clientRead=async()=>{const r=await customer!.request.get(origin+api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':client.id}});expect(r.status()).toBe(200);return await r.json() as ClientAllowances;};
  expect(await clientRead()).toEqual({visible:false});
  const dashboard=await page.request.get('/api/pro/client-dashboard?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect((await dashboard.json()).settings).toMatchObject({showAllowances:false,revision:0});

  // ---- Owner UI on a second, empty project ----
  const mobile=(page.viewportSize()?.width??1366)<1024;
  let failFirst=true;
  await page.route('**/api/pro/allowances?**',async route=>{if(failFirst&&route.request().method()==='GET'){failFirst=false;return route.fulfill({status:503,json:{error:'LOCAL failure'}});}return route.continue();});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:uiWorkId,vistaTrabajo:'allowances'}));
  const nav=page.getByRole('navigation',{name:en?'Job workspace':'Gestión del trabajo'});await expect(nav).toBeVisible({timeout:60000});
  const planningGroup=nav.locator('[data-job-workspace-group]').nth(1);await expect(planningGroup).toHaveAttribute('data-job-workspace-group',en?'Planning':'Planificación');
  await expect(planningGroup.getByRole('button',{name:en?'Allowances':'Montos previstos',exact:true})).toHaveAttribute('aria-current','page');
  const loadError=page.locator('[data-allowances-load-error]');await expect(loadError).toBeVisible({timeout:60000});
  await loadError.getByRole('button',{name:en?'Retry':'Reintentar'}).click();
  const view=page.locator('[data-allowances]');await expect(view.locator('[data-allowances-empty]')).toBeVisible();
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`allowances-empty-${language}.png`),fullPage:true});
  // Create.
  await view.getByRole('button',{name:en?'New allowance':'Nuevo monto previsto'}).click();
  const form=view.locator('[data-allowance-form="create"]');
  await form.locator('[data-allowance-field="planned"]').fill('abc');await form.locator('[data-allowance-field="name"]').fill(en?'Vanity':'Mueble de baño');
  await form.getByRole('button',{name:en?'Save allowance':'Guardar monto previsto'}).click();
  await expect(view.locator('[data-allowance-error]')).toContainText(en?'valid amount':'monto válido');
  // The dirty form blocks the job menu.
  await expect(nav.getByRole('button',{name:en?'Overview':'Resumen',exact:true})).toBeDisabled();
  await form.locator('[data-allowance-field="planned"]').fill('250.000');await form.locator('[data-allowance-field="category"]').fill(en?'Bathroom':'Baño');
  await form.locator('[data-allowance-field="due"]').fill(yesterday);await form.locator('[data-allowance-field="notes"]').fill('UI_NOTA_INTERNA');
  await form.getByRole('button',{name:en?'Save allowance':'Guardar monto previsto'}).click();
  await expect(view.getByRole('status').filter({hasText:en?'Allowance saved.':'Monto previsto guardado.'})).toBeVisible();
  const card=view.locator('[data-allowance-item]').first();
  await expect(card).toContainText(en?'Vanity':'Mueble de baño');await expect(card.locator('[data-allowance-overdue]')).toBeVisible();await expect(card.locator('[data-allowance-status]')).toHaveAttribute('data-allowance-status','open');
  await expect(view.locator('[data-allowance-total="planned"]')).toContainText('250');await expect(view.locator('[data-allowance-total="overdue"]')).toContainText('1');
  await expect(nav.getByRole('button',{name:en?'Overview':'Resumen',exact:true})).toBeEnabled();
  // Edit.
  await card.getByRole('button',{name:en?'Edit':'Editar',exact:true}).click();
  const editForm=view.locator('[data-allowance-form="edit"]');await expect(editForm.locator('[data-allowance-field="planned"]')).toHaveValue('250000');
  await editForm.locator('[data-allowance-field="planned"]').fill('300000');await editForm.getByRole('button',{name:en?'Save changes':'Guardar cambios'}).click();
  await expect(view.locator('[data-allowance-total="planned"]')).toContainText('300');
  // Define above the allowance, with a live preview of the difference.
  await card.getByRole('button',{name:en?'Define choice':'Definir elección'}).click();
  const decide=view.locator('[data-allowance-form="decide"]');
  await decide.locator('[data-allowance-field="choice"]').fill(en?'Floating oak vanity':'Mueble flotante de roble');await decide.locator('[data-allowance-field="supplier"]').fill('Maderas del Valle');
  await decide.locator('[data-allowance-field="actual"]').fill('345000');await expect(decide.locator('[data-allowance-preview]')).toContainText(en?'Above the allowance by':'Por encima de lo previsto en');
  await decide.getByRole('button',{name:en?'Save choice':'Guardar elección'}).click();
  await expect(card.locator('[data-allowance-variance]')).toHaveAttribute('data-allowance-variance','over');
  await expect(card.locator('[data-allowance-variance]')).toContainText('45');
  await expect(view.locator('[data-allowance-total="difference"]')).toContainText('+');await expect(view.locator('[data-allowance-total="pending"]')).toContainText('0');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`allowances-decided-${language}.png`),fullPage:true});
  // Optional extra for the positive difference, through the existing extras/changes API.
  await card.getByRole('button',{name:en?'Propose extra for the difference':'Proponer extra por la diferencia'}).click();
  const confirmDialog=page.getByRole('dialog').last();await expect(confirmDialog).toContainText(en?'no charge or invoice is created':'no se crea ningún cobro ni factura');
  await confirmDialog.getByRole('button',{name:en?'Propose extra for the difference':'Proponer extra por la diferencia'}).click();
  await expect(view.getByRole('status').filter({hasText:en?'Extra proposed':'Extra propuesto'})).toBeVisible();
  await expect(card.locator('[data-allowance-linked-change]')).toBeVisible();
  await expect(card.getByRole('button',{name:en?'Propose extra for the difference':'Proponer extra por la diferencia'})).toHaveCount(0);
  const changes=(await db.from('pro_work_changes').select('status,delta_cents,base_cents').eq('owner_id',owner.id).eq('work_id',uiWorkId).throwOnError()).data!;
  expect(changes).toEqual([{status:'proposed',delta_cents:4500000,base_cents:100000000}]);
  // Nothing became debt: the agreement entries are unchanged (only the original one).
  expect((await db.from('pro_client_entries').select('id').eq('user_id',owner.id).eq('work_id',uiWorkId).eq('kind','agreement').throwOnError()).data).toHaveLength(1);
  // QA: the card follows the real status of the linked extra, and reopening warns that a pending extra stays pending.
  await expect(card.locator('[data-allowance-linked-change]')).toHaveAttribute('data-allowance-linked-change','proposed');
  await card.getByRole('button',{name:en?'Reopen':'Reabrir',exact:true}).click();
  const pendingDialog=page.getByRole('dialog').last();await expect(pendingDialog).toContainText(en?'The proposed extra stays pending in Extras and changes.':'El extra propuesto sigue pendiente en Extras y cambios.');
  await pendingDialog.getByRole('button',{name:en?'Back':'Volver',exact:true}).click();await expect(card.locator('[data-allowance-status]')).toHaveAttribute('data-allowance-status','decided');
  // Archiving gives the same warning (the extra is not withdrawn by archiving). Cancelled, so the history order is unchanged.
  await card.getByRole('button',{name:en?'Archive':'Archivar',exact:true}).click();const archiveDialog=page.getByRole('dialog').last();await expect(archiveDialog).toContainText(en?'The proposed extra stays pending in Extras and changes.':'El extra propuesto sigue pendiente en Extras y cambios.');
  await archiveDialog.getByRole('button',{name:en?'Back':'Volver',exact:true}).click();await expect(card.locator('[data-allowance-status]')).toHaveAttribute('data-allowance-status','decided');
  const linkedChange=(await db.from('pro_work_changes').select('id,revision').eq('owner_id',owner.id).eq('work_id',uiWorkId).single().throwOnError()).data!;
  expect((await page.request.post('/api/pro/work-changes',{headers,data:{action:'withdraw',id:linkedChange.id,actionId:crypto.randomUUID(),revision:linkedChange.revision}})).status()).toBe(200);
  expect((await read(uiWorkId)).changeStatuses).toEqual({[linkedChange.id]:'withdrawn'});
  await page.reload();await expect(card.locator('[data-allowance-linked-change]')).toHaveAttribute('data-allowance-linked-change','withdrawn',{timeout:60000});
  await expect(card.locator('[data-allowance-linked-change]')).toContainText(en?'was withdrawn':'se retiró');await expect(card.locator('[data-allowance-linked-change]')).not.toContainText(en?'Waiting for your customer':'Espera la respuesta');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`allowances-withdrawn-${language}${mobile?'-mobile':''}.png`),fullPage:true});
  await card.getByRole('button',{name:en?'Reopen':'Reabrir',exact:true}).click();await expect(page.getByRole('dialog').last()).not.toContainText(en?'stays pending':'sigue pendiente');await page.getByRole('dialog').last().getByRole('button',{name:en?'Back':'Volver',exact:true}).click();
  // Reopen, then archive; reload shows it persisted.
  await card.getByRole('button',{name:en?'Reopen':'Reabrir',exact:true}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:en?'Reopen':'Reabrir',exact:true}).click();
  await expect(card.locator('[data-allowance-status]')).toHaveAttribute('data-allowance-status','reopened');
  await expect(view.locator('[data-allowance-total="pending"]')).toContainText('1');
  await view.locator('[data-allowance-history] summary').click();
  await expect(view.locator('[data-allowance-history]')).toContainText(en?'Previous choice: Floating oak vanity':'Elección anterior: Mueble flotante de roble');
  await card.getByRole('button',{name:en?'Archive':'Archivar',exact:true}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:en?'Archive':'Archivar',exact:true}).click();
  await expect(view.locator('[data-allowances-empty]')).toBeVisible();
  await page.reload();
  const reloaded=page.locator('[data-allowances]');await expect(reloaded.locator('[data-allowances-empty]')).toBeVisible({timeout:60000});
  await reloaded.getByRole('button',{name:en?'Show archived (1)':'Mostrar archivadas (1)'}).click();
  await expect(reloaded.locator('[data-allowances-archived]')).toContainText(en?'Vanity':'Mueble de baño');
  await reloaded.locator('[data-allowances-archived]').getByRole('button',{name:en?'Restore':'Restaurar'}).click();
  await expect(reloaded.locator('[data-allowance-item] [data-allowance-status]')).toHaveAttribute('data-allowance-status','reopened');
  const uiDetail=await read(uiWorkId);expect(uiDetail.history.map(entry=>entry.action)).toEqual(['restore','archive','reopen','link_change','decide','update','create']);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`allowances-restored-${language}${mobile?'-mobile':''}.png`),fullPage:true});

  // ---- Customer view: owner turns the section on in the editor ----
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'client'}));
  const editor=page.locator('[data-client-dashboard-editor]');await expect(editor).toBeVisible({timeout:60000});
  const allowSwitch=editor.locator('[data-client-dashboard-section="showAllowances"]');await expect(allowSwitch).not.toBeChecked();
  await allowSwitch.check();await editor.getByRole('button',{name:en?'Save customer view':'Guardar vista del cliente'}).click();
  await expect(editor.getByRole('status').filter({hasText:en?'Customer view saved.':'Vista del cliente guardada.'})).toBeVisible();
  await expect(editor.locator('ol li')).toContainText(en?'Allowances: Visible':'Montos previstos: Visible');
  await page.screenshot({path:info.outputPath(`owner-editor-${language}.png`),fullPage:true});
  const shared=await clientRead();expect(shared.visible).toBe(true);
  if(shared.visible){expect(shared.items.map(item=>item.name)).toEqual(['Grifería de cocina','Cerámica de piso','Lámpara colgante']);expect(shared.totals).toMatchObject({plannedCents:61000000,actualCents:40000000,differenceCents:-5000000,pendingCount:1});}
  expect(JSON.stringify(shared)).not.toContain('NOTA_INTERNA');expect(JSON.stringify(shared)).not.toContain('revision');
  const customerPage=await customer.newPage();onAppPageError(customerPage,message=>runtime.push(message));
  // QA: a failed customer read shows an error with a retry instead of hiding the section.
  let failCustomer=true;await customerPage.route('**/api/pro/allowances?**',async route=>{if(failCustomer&&route.request().method()==='GET'){failCustomer=false;return route.fulfill({status:503,json:{error:'LOCAL failure'}});}return route.continue();});
  await gotoOK(customerPage,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`);
  const customerError=customerPage.locator('[data-client-allowances-error]');await expect(customerError).toBeVisible({timeout:60000});await expect(customerError).toContainText(en?'Could not load the allowances.':'No se pudieron cargar los montos previstos.');
  await customerError.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
  const section=customerPage.locator('[data-client-allowances]');await expect(section).toBeVisible({timeout:60000});await expect(customerError).toHaveCount(0);
  await expect(section).toContainText('Cerámica de piso');await expect(section).toContainText('Porcelanato 60x60');await expect(section).toContainText(en?'Below the allowance':'Por debajo de lo previsto');
  await expect(section).not.toContainText('NOTA_INTERNA');
  await expectNoHorizontalOverflow(customerPage);await customerPage.screenshot({path:info.outputPath(`customer-on-${language}.png`),fullPage:true});
  // Off again via the existing API (older callers without showAllowances keep the stored value).
  const settings=(await (await page.request.get('/api/pro/client-dashboard?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json()).settings;
  expect((await page.request.post('/api/pro/client-dashboard',{headers,data:{workId,actionId:crypto.randomUUID(),revision:settings.revision,showUpdates:true,showDailyLogs:true,showFiles:false,welcomeText:null}})).status()).toBe(200);
  expect((await clientRead()).visible).toBe(true);
  expect((await page.request.post('/api/pro/client-dashboard',{headers,data:{workId,actionId:crypto.randomUUID(),revision:settings.revision+1,showUpdates:true,showDailyLogs:true,showFiles:false,showAllowances:false,welcomeText:null}})).status()).toBe(200);
  expect(await clientRead()).toEqual({visible:false});
  await customerPage.reload();await expect(customerPage.locator('[data-client-dashboard-error], [data-client-journal], [data-work-changes]').first()).toBeVisible({timeout:60000});
  await expect(customerPage.locator('[data-client-allowances]')).toHaveCount(0);
  await customerPage.screenshot({path:info.outputPath(`customer-off-${language}.png`),fullPage:true});
  // A cancelled request never receives the section, even when it is on.
  expect((await page.request.post('/api/pro/client-dashboard',{headers,data:{workId,actionId:crypto.randomUUID(),revision:settings.revision+2,showUpdates:true,showDailyLogs:true,showFiles:false,showAllowances:true,welcomeText:null}})).status()).toBe(200);
  expect((await clientRead()).visible).toBe(true);
  await db.from('pro_appointment_requests').update({status:'cancelled'}).eq('id',requestId).throwOnError();
  expect(await clientRead()).toEqual({visible:false});
  expect(await notices()).toEqual(noticesBefore);
  expect(runtime).toEqual([]);
 }finally{await customer?.close();await other?.close();await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.client);await cleanupDisposableAccount(f.rival);}
});
