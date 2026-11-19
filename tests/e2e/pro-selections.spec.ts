import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import sharp from 'sharp';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {ClientSelections,SelectionArea,SelectionDetail,SelectionItem} from '../../src/lib/pro/selections';

// Family 62: selecciones por área con aprobación del cliente (selection boards + tracker).
const origin='http://127.0.0.1:3185',api='/api/pro/selections';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
const shiftDay=(iso:string,days:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const uuid=()=>crypto.randomUUID();

async function makePro(db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount,slug:string){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 return (await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Selecciones local',slug:slug+'-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError()).data!;
}

async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'sel-owner'}),db=regressionAdminClient();let client:DisposableAccount|undefined,rival:DisposableAccount|undefined;
 try{
  client=await createDisposableAccount({prefix:'sel-client'});rival=await createDisposableAccount({prefix:'sel-rival'});
  const professional=await makePro(db,owner,'sel');await makePro(db,rival,'sel-rival');
  const workId=uuid(),uiWorkId=uuid(),requestId=uuid(),uiRequestId=uuid(),day=crTodayISO(),linkedClient='reservation-'+client.id,document=emptyBusiness();
  document.clients=[{id:linkedClient,name:'Cliente selecciones local',email:'',phone:'',notes:'',archived:false}];
  document.work=[
   {id:workId,clientId:linkedClient,client:'Cliente selecciones local',service:'Remodelación de cocina',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false,bookingClientId:client.id},
   {id:uiWorkId,clientId:linkedClient,client:'Cliente selecciones local',service:'Baño principal',stage:'scheduled',start:day+'T14:00:00-06:00',end:day+'T15:00:00-06:00',cancelled:false,bookingClientId:client.id},
  ];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  for(const id of [workId,uiWorkId])expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId:id,clientId:linkedClient}),{timeout:45000})).status()).toBe(200);
  for(const [id,work,service,start] of [[requestId,workId,'Remodelación de cocina','T11:00:00-06:00'],[uiRequestId,uiWorkId,'Baño principal','T14:00:00-06:00']] as const){
   await db.from('pro_appointment_requests').insert({id,professional_id:professional.id,owner_id:owner.id,client_user_id:client.id,client_name:'Cliente selecciones local',professional_name:'Selecciones local',professional_slug:'sel-'+owner.id,service,duration_minutes:60,location_kind:'agree',location_text:'',note:'',requested_start:day+start,status:'confirmed',revision:0,work_id:work}).throwOnError();
   await db.from('pro_appointment_events').insert({request_id:id,actor_id:owner.id,side:'provider',action:'confirm',note:'',status:'confirmed'}).throwOnError();
  }
  return {owner,client,rival,db,workId,uiWorkId,requestId,uiRequestId};
 }catch(error){await cleanupDisposableAccount(owner);if(client)await cleanupDisposableAccount(client);if(rival)await cleanupDisposableAccount(rival);throw error;}
}

// A real job file (reused mechanism): PNG uploaded through the existing work-files API, stored as JPEG.
async function uploadPhoto(page:Page,owner:DisposableAccount,workId:string,name:string,color:string){
 const png=await sharp({create:{width:64,height:48,channels:3,background:color}}).png().toBuffer();const fileId=uuid();
 const r=await page.request.post('/api/pro/work-files',{headers:{Origin:origin,'X-Pro-Expected-Actor':owner.id},data:{action:'upload',workId,fileId,name,data:png.toString('base64')}});
 expect(r.status(),await r.text()).toBe(200);return fileId;
}

for(const language of ['es','en'] as const)test(`Selections: board, publication, customer approval, tracker and allowance link [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(420000);local(baseURL);const en=language==='en',f=await fixture(page.context()),{owner,client,rival,db,workId,uiWorkId,requestId,uiRequestId}=f;let customer:BrowserContext|undefined,other:BrowserContext|undefined;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const notices=async()=>{const out:Record<string,unknown>={};for(const table of ['notifications','notification_push_outbox'])out[table]=(await db.from(table).select('*').in('user_id',[owner.id,client.id]).order('id').throwOnError()).data;return out;};const noticesBefore=await notices();
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const read=async(id=workId)=>{const r=await page.request.get(api+'?'+new URLSearchParams({workId:id}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as SelectionDetail;};
  const post=async(data:Record<string,unknown>,status=200)=>{const r=await page.request.post(api,{headers,data});expect(r.status(),JSON.stringify(data)).toBe(status);return status===200?await r.json() as {item?:SelectionItem;area?:SelectionArea}:null;};
  const today=crTodayISO(),yesterday=shiftDay(today,-1);
  const setSection=async(work:string,on:boolean,extra:Record<string,unknown>={})=>{const settings=(await (await page.request.get('/api/pro/client-dashboard?'+new URLSearchParams({workId:work}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json()).settings;
   const r=await page.request.post('/api/pro/client-dashboard',{headers,data:{workId:work,actionId:uuid(),revision:settings.revision,showUpdates:true,showDailyLogs:true,showFiles:true,showSelections:on,welcomeText:null,...extra}});expect(r.status()).toBe(200);return (await r.json()).settings;};

  // ---- API: owner ----
  expect(await read()).toMatchObject({workId,today,clientVisible:false,areas:[],items:[],history:[]});
  expect((await page.request.get(api,{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(400);
  expect((await page.request.get(api+'?workId='+workId+'&workId='+workId,{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(400);
  expect((await page.request.get(api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':client.id}})).status()).toBe(403);
  const kitchenInput={action:'area_create',actionId:uuid(),workId,id:uuid(),name:'Cocina'};
  await post({...kitchenInput,extra:1},400);await post({...kitchenInput,name:'  '},400);
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':owner.id},data:kitchenInput})).status()).toBe(403);
  const kitchen=(await post(kitchenInput))!.area!;expect(kitchen).toMatchObject({name:'Cocina',archived:false,revision:1});
  // Idempotent replay; same identity with other data → 400; same area id → 409.
  expect((await post(kitchenInput))!.area).toEqual(kitchen);await post({...kitchenInput,name:'Otra'},400);await post({...kitchenInput,actionId:uuid()},409);
  const bath=(await post({action:'area_create',actionId:uuid(),workId,id:uuid(),name:'Baño principal'}))!.area!;
  // Allowance of the same job to link (reusing the allowances API).
  const allowanceId=uuid();expect((await page.request.post('/api/pro/allowances',{headers,data:{action:'create',actionId:uuid(),workId,id:allowanceId,name:'Grifería prevista',category:'Cocina',plannedCents:20000000,dueDate:null,notes:null}})).status()).toBe(200);
  const faucetInput={action:'item_create',actionId:uuid(),workId,id:uuid(),areaId:kitchen.id,name:'Grifería',dueDate:yesterday,notes:'NOTA_INTERNA_SEL',allowanceId};
  await post({...faucetInput,areaId:uuid()},400);await post({...faucetInput,allowanceId:uuid()},400);await post({...faucetInput,dueDate:'2026-02-30'},400);
  let faucet=(await post(faucetInput))!.item!;expect(faucet).toMatchObject({state:'no_options',status:'open',published:false,overdue:true,allowanceId,options:[],revision:1});
  const floor=(await post({action:'item_create',actionId:uuid(),workId,id:uuid(),areaId:bath.id,name:'Piso',dueDate:today,notes:null,allowanceId:null}))!.item!;
  expect(floor.overdue).toBe(false);// Costa Rica day: today is not overdue, yesterday is.
  // Options: validation of link, quantity, price and image of another job.
  const photo=await uploadPhoto(page,owner,workId,'grifo.png','#0089bb'),otherPhoto=await uploadPhoto(page,owner,uiWorkId,'otro.png','#ff7c0a');
  const optionA={action:'option_add',actionId:uuid(),workId,id:faucet.id,revision:1,optionId:uuid(),name:'Grifo monomando acero',brand:'Ferretería Central',url:null,quantity:2,unitCents:12500000,clientNotes:'Acabado cepillado',imageFileId:photo};
  await post({...optionA,url:'http://ejemplo.cr/grifo'},400);await post({...optionA,url:'javascript:alert(1)'},400);await post({...optionA,quantity:0},400);
  await post({...optionA,unitCents:-1},400);await post({...optionA,unitCents:1.5},400);await post({...optionA,imageFileId:otherPhoto},400);await post({...optionA,revision:2},409);
  faucet=(await post(optionA))!.item!;expect(faucet).toMatchObject({state:'draft',revision:2,options:[{name:'Grifo monomando acero',quantity:2,unitCents:12500000,totalCents:25000000,imageFileId:photo}]});
  const optionB={action:'option_add',actionId:uuid(),workId,id:faucet.id,revision:2,optionId:uuid(),name:'Grifo extraíble negro',brand:null,url:'https://ejemplo.cr/grifo-negro?color=1',quantity:1,unitCents:18000000,clientNotes:null,imageFileId:null};
  faucet=(await post(optionB))!.item!;faucet=(await post({action:'recommend',actionId:uuid(),workId,id:faucet.id,revision:3,optionId:optionB.optionId}))!.item!;
  expect(faucet).toMatchObject({recommendedOptionId:optionB.optionId,revision:4});
  await post({action:'publish',actionId:uuid(),workId,id:floor.id,revision:1},400);// no options
  faucet=(await post({action:'publish',actionId:uuid(),workId,id:faucet.id,revision:4}))!.item!;expect(faucet).toMatchObject({state:'pending_client',published:true});
  await post({action:'publish',actionId:uuid(),workId,id:faucet.id,revision:5},400);
  // Unpublished option with an image (on the floor item) for the image access checks.
  const floorTile=(await post({...optionA,actionId:uuid(),id:floor.id,revision:1,optionId:uuid(),name:'Porcelanato 60x60',brand:null,quantity:42.5,unitCents:1500000,clientNotes:null}))!.item!;
  expect(floorTile.options[0].totalCents).toBe(63750000);

  // ---- Customer ----
  customer=await browser.newContext({baseURL});await login(customer,client);
  const cHeaders={Origin:origin,'X-Pro-Expected-Actor':client.id};
  const clientRead=async(id=requestId)=>{const r=await customer!.request.get(origin+api+'?'+new URLSearchParams({requestId:id}),{headers:{'X-Pro-Expected-Actor':client.id}});expect(r.status()).toBe(200);return await r.json() as ClientSelections;};
  const clientPost=async(data:Record<string,unknown>,status=200)=>{const r=await customer!.request.post(origin+api,{headers:cHeaders,data});expect(r.status(),JSON.stringify(data)).toBe(status);return status===200?(await r.json()).item:null;};
  // Off by default (compatible with existing customer views).
  expect(await clientRead()).toEqual({visible:false});
  await clientPost({action:'approve',actionId:uuid(),requestId,id:faucet.id,revision:5,optionId:optionB.optionId},403);
  const turnedOn=await setSection(workId,true);expect(turnedOn).toMatchObject({showSelections:true,showAllowances:false});
  // An older caller without showSelections keeps the stored value.
  const legacy=await page.request.post('/api/pro/client-dashboard',{headers,data:{workId,actionId:uuid(),revision:turnedOn.revision,showUpdates:true,showDailyLogs:false,showFiles:true,welcomeText:null}});
  expect(legacy.status()).toBe(200);expect((await legacy.json()).settings.showSelections).toBe(true);expect((await read()).clientVisible).toBe(true);
  let shared=await clientRead();expect(shared.visible).toBe(true);
  if(!shared.visible)throw Error('not visible');
  // Only published items; never internal notes, allowance link or file ids.
  expect(shared.areas.map(area=>[area.name,area.items.map(item=>item.name)])).toEqual([['Cocina',['Grifería']]]);
  const text=JSON.stringify(shared);for(const hidden of ['NOTA_INTERNA_SEL','allowanceId','imageFileId','notes',photo,'Porcelanato'])expect(text).not.toContain(hidden);
  expect(shared.areas[0].items[0]).toMatchObject({state:'pending_client',recommendedOptionId:optionB.optionId,options:[{name:'Grifo monomando acero',hasImage:true,totalCents:25000000},{name:'Grifo extraíble negro',hasImage:false}]});
  // Images: reauthorized per request; the unpublished item's image is not served to the customer.
  const optionAId=optionA.optionId,floorOptionId=floorTile.options[0].id;
  const img=await customer.request.get(origin+api+'?'+new URLSearchParams({image:optionAId}));expect(img.status()).toBe(200);expect(img.headers()).toMatchObject({'content-type':'image/jpeg','cache-control':'no-store, private','x-content-type-options':'nosniff'});expect((await img.body()).subarray(0,2).toString('hex')).toBe('ffd8');
  expect((await customer.request.get(origin+api+'?'+new URLSearchParams({image:floorOptionId}))).status()).toBe(404);
  expect((await page.request.get(api+'?'+new URLSearchParams({image:floorOptionId}))).status()).toBe(200);
  expect((await page.request.get(api+'?image='+optionAId+'&workId='+workId)).status()).toBe(400);
  // The customer cannot edit (owner actions) nor decide on an unpublished item.
  await clientPost({action:'option_remove',actionId:uuid(),workId,id:faucet.id,revision:5,optionId:optionAId},403);
  await clientPost({action:'approve',actionId:uuid(),requestId,id:floor.id,revision:2,optionId:floorOptionId},403);
  await clientPost({action:'approve',actionId:uuid(),requestId,id:faucet.id,revision:5,optionId:floorOptionId},400);// option of another item
  await clientPost({action:'approve',actionId:uuid(),requestId,id:faucet.id,revision:4,optionId:optionAId},409);// stale
  await clientPost({action:'request_changes',actionId:uuid(),requestId,id:faucet.id,revision:5,comment:'   '},400);
  await clientPost({action:'approve',actionId:uuid(),requestId:uiRequestId,id:faucet.id,revision:5,optionId:optionAId},403);// other request (section off there)
  const changeInput={action:'request_changes',actionId:uuid(),requestId,id:faucet.id,revision:5,comment:'¿Lo hay en dorado?'};
  const changed=await clientPost(changeInput);expect(changed).toMatchObject({state:'changes_requested',clientComment:'¿Lo hay en dorado?',revision:6});
  expect(await clientPost(changeInput)).toEqual(changed);await clientPost({...changeInput,comment:'Otro'},400);
  await clientPost({...changeInput,actionId:uuid(),revision:6},400);// only on a pending item
  faucet=(await read()).items.find(item=>item.id===faucet.id)!;expect(faucet).toMatchObject({state:'changes_requested',clientComment:'¿Lo hay en dorado?'});
  // Approving after asking for changes is allowed; the decision is idempotent.
  const approveInput={action:'approve',actionId:uuid(),requestId,id:faucet.id,revision:6,optionId:optionB.optionId};
  const approved=await clientPost(approveInput);expect(approved).toMatchObject({state:'approved',approvedOptionId:optionB.optionId,clientComment:null});
  expect(await clientPost(approveInput)).toEqual(approved);await clientPost({...approveInput,actionId:uuid(),revision:7},400);
  // Approved item is locked for option changes until the owner reopens it.
  await post({...optionB,action:'option_update',actionId:uuid(),revision:7,name:'Cambio'},400);
  faucet=(await post({action:'reopen',actionId:uuid(),workId,id:faucet.id,revision:7}))!.item!;expect(faucet).toMatchObject({state:'pending_client',approvedOptionId:null});
  await clientPost({action:'approve',actionId:uuid(),requestId,id:faucet.id,revision:8,optionId:optionAId});
  const detail=await read();faucet=detail.items.find(item=>item.id===faucet.id)!;expect(faucet).toMatchObject({state:'approved',approvedOptionId:optionAId,overdue:false});
  expect(detail.allowances).toEqual([expect.objectContaining({id:allowanceId,status:'open'})]);
  // QA: turning the section off hides the published photo too; turning it on again restores it.
  await setSection(workId,false);expect(await clientRead()).toEqual({visible:false});
  expect((await customer.request.get(origin+api+'?'+new URLSearchParams({image:optionAId}))).status()).toBe(404);
  await setSection(workId,true);expect((await customer.request.get(origin+api+'?'+new URLSearchParams({image:optionAId}))).status()).toBe(200);
  expect(detail.history.filter(entry=>entry.side==='client').map(entry=>entry.action)).toEqual(['approve','approve','request_changes']);
  const entry=detail.history.find(row=>row.action==='request_changes')!;
  expect((await db.from('pro_work_selection_history').update({action:'publish'}).eq('owner_id',owner.id).eq('action_id',entry.actionId)).error?.message).toContain('immutable');
  // Unpublishing hides it from the customer and blocks decisions.
  faucet=(await post({action:'unpublish',actionId:uuid(),workId,id:faucet.id,revision:9}))!.item!;
  shared=await clientRead();expect(shared.visible&&shared.areas).toEqual([]);
  expect((await customer.request.get(origin+api+'?'+new URLSearchParams({image:optionAId}))).status()).toBe(404);
  await clientPost({action:'request_changes',actionId:uuid(),requestId,id:faucet.id,revision:10,comment:'x'},403);
  // Archive rules: an area with active items cannot be archived; restore needs the area.
  await post({action:'area_archive',actionId:uuid(),workId,id:bath.id,revision:1},400);
  await post({action:'archive',actionId:uuid(),workId,id:floor.id,revision:2});
  await post({action:'area_archive',actionId:uuid(),workId,id:bath.id,revision:1});
  await post({action:'restore',actionId:uuid(),workId,id:floor.id,revision:3},400);
  await post({action:'area_restore',actionId:uuid(),workId,id:bath.id,revision:2});await post({action:'restore',actionId:uuid(),workId,id:floor.id,revision:3});
  // Isolation: another Pro account cannot read (404) or write (403).
  other=await browser.newContext({baseURL});await login(other,rival);
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({image:floorOptionId}))).status()).toBe(404);
  expect((await other.request.post(origin+api,{headers:{Origin:origin,'X-Pro-Expected-Actor':rival.id},data:{action:'archive',actionId:uuid(),workId,id:floor.id,revision:5}})).status()).toBe(403);
  expect((await other.request.post(origin+api,{headers:{Origin:origin,'X-Pro-Expected-Actor':rival.id},data:{action:'area_create',actionId:uuid(),workId:uiWorkId,id:uuid(),name:'Intruso'}})).status()).toBe(403);
  // A cancelled request never receives the section.
  await db.from('pro_appointment_requests').update({status:'cancelled'}).eq('id',requestId).throwOnError();
  expect(await clientRead()).toEqual({visible:false});

  // ---- Owner UI on the second project ----
  const mobile=(page.viewportSize()?.width??1366)<1024,suffix=`${language}${mobile?'-mobile':''}`;
  const uiAllowance=uuid();expect((await page.request.post('/api/pro/allowances',{headers,data:{action:'create',actionId:uuid(),workId:uiWorkId,id:uiAllowance,name:en?'Faucet allowance':'Grifería prevista',category:null,plannedCents:30000000,dueDate:null,notes:null}})).status()).toBe(200);
  const uiPhoto=await uploadPhoto(page,owner,uiWorkId,'lavamanos.png','#008bb5');
  let failFirst=true;
  await page.route('**/api/pro/selections?**',async route=>{const url=new URL(route.request().url());if(failFirst&&route.request().method()==='GET'&&url.searchParams.has('workId')){failFirst=false;return route.fulfill({status:503,json:{error:'LOCAL failure'}});}return route.continue();});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:uiWorkId,vistaTrabajo:'selections'}));
  const nav=page.getByRole('navigation',{name:en?'Job workspace':'Gestión del trabajo'});await expect(nav).toBeVisible({timeout:60000});
  const planning=nav.locator('[data-job-workspace-group]').nth(1);await expect(planning).toHaveAttribute('data-job-workspace-group',en?'Planning':'Planificación');
  await expect(planning.getByRole('button',{name:en?'Selections':'Selecciones',exact:true})).toHaveAttribute('aria-current','page');
  const loadError=page.locator('[data-selections-load-error]');await expect(loadError).toBeVisible({timeout:60000});
  await loadError.getByRole('button',{name:en?'Retry':'Reintentar'}).click();
  const view=page.locator('[data-selections]');await expect(view.locator('[data-selections-empty]')).toBeVisible();
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`selections-empty-${suffix}.png`),fullPage:true});
  // Area.
  await view.getByRole('button',{name:en?'New area':'Nueva área'}).click();
  await expect(nav.getByRole('button',{name:en?'Overview':'Resumen',exact:true})).toBeEnabled();// untouched form is not dirty
  await view.locator('[data-selection-field="areaName"]').fill(en?'Main bathroom':'Baño principal');
  await expect(nav.getByRole('button',{name:en?'Overview':'Resumen',exact:true})).toBeDisabled();// dirty form blocks the job menu
  await view.getByRole('button',{name:en?'Save area':'Guardar área'}).click();
  const area=view.locator('[data-selection-area]').first();await expect(area).toContainText(en?'Main bathroom':'Baño principal');
  await expect(nav.getByRole('button',{name:en?'Overview':'Resumen',exact:true})).toBeEnabled();
  // Item with deadline, internal notes and linked allowance.
  await area.getByRole('button',{name:en?'New item':'Nuevo ítem'}).click();
  const itemForm=view.locator('[data-selection-form="item"]');
  await itemForm.getByRole('button',{name:en?'Save item':'Guardar ítem'}).click();await expect(itemForm).toBeVisible();// required name
  await itemForm.locator('[data-selection-field="itemName"]').fill(en?'Sink faucet':'Grifería del lavamanos');await itemForm.locator('[data-selection-field="due"]').fill(yesterday);
  await itemForm.locator('[data-selection-field="notes"]').fill('UI_NOTA_INTERNA');await itemForm.locator('[data-selection-field="allowance"]').selectOption(uiAllowance);
  await itemForm.getByRole('button',{name:en?'Save item':'Guardar ítem'}).click();
  const card=view.locator('[data-selection-item]').first();await expect(card.locator('[data-selection-state]')).toHaveAttribute('data-selection-state','no_options');
  await expect(card.locator('[data-selection-overdue]')).toBeVisible();await expect(card.locator('[data-selection-allowance]')).toContainText(en?'Faucet allowance':'Grifería prevista');
  await expect(card.getByRole('button',{name:en?'Publish to customer':'Publicar al cliente'})).toBeDisabled();
  // Options: invalid link, then valid with a job photo; second option with link.
  await card.getByRole('button',{name:en?'Add option':'Agregar opción'}).click();
  let optionForm=view.locator('[data-selection-form="option"]');
  await optionForm.locator('[data-selection-field="optionName"]').fill(en?'Brushed steel faucet':'Grifo acero cepillado');await optionForm.locator('[data-selection-field="url"]').fill('http://ejemplo.cr');
  await optionForm.locator('[data-selection-field="quantity"]').fill('2');await optionForm.locator('[data-selection-field="unit"]').fill('45.000');
  await expect(optionForm.locator('[data-selection-option-preview]')).toContainText('90');
  await optionForm.getByRole('button',{name:en?'Save option':'Guardar opción'}).click();
  await expect(view.locator('[data-selection-error]')).toContainText('https://');
  await optionForm.locator('[data-selection-field="url"]').fill('');await expect(optionForm.locator(`[data-selection-field="image"] option[value="${uiPhoto}"]`)).toHaveCount(1);
  await optionForm.locator('[data-selection-field="image"]').selectOption(uiPhoto);await expect(optionForm.locator('[data-selection-image-preview]')).toBeVisible();
  await optionForm.locator('[data-selection-field="clientNotes"]').fill(en?'Matches the mirror frame':'Combina con el marco del espejo');
  await optionForm.getByRole('button',{name:en?'Save option':'Guardar opción'}).click();
  await expect(card.locator('[data-selection-option]')).toHaveCount(1);
  const firstImage=card.locator('[data-selection-option] [data-selection-image]').first();await expect(firstImage).toBeVisible();
  await expect.poll(()=>firstImage.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await card.getByRole('button',{name:en?'Add option':'Agregar opción'}).click();optionForm=view.locator('[data-selection-form="option"]');
  await optionForm.locator('[data-selection-field="optionName"]').fill(en?'Matte black faucet':'Grifo negro mate');await optionForm.locator('[data-selection-field="brand"]').fill('Casa Grifos');
  await optionForm.locator('[data-selection-field="url"]').fill('https://ejemplo.cr/negro');await optionForm.locator('[data-selection-field="unit"]').fill('120000');
  await optionForm.getByRole('button',{name:en?'Save option':'Guardar opción'}).click();await expect(card.locator('[data-selection-option]')).toHaveCount(2);
  const second=card.locator('[data-selection-option]').nth(1);
  await second.getByRole('button',{name:en?'Mark as recommended':'Marcar como recomendada'}).click();await expect(second.locator('[data-selection-recommended]')).toBeVisible();
  await expect(card.locator('[data-selection-state]')).toHaveAttribute('data-selection-state','draft');
  // Explicit publication with confirmation.
  await card.getByRole('button',{name:en?'Publish to customer':'Publicar al cliente'}).click();
  const publishDialog=page.getByRole('dialog').last();await expect(publishDialog).toContainText(en?'No notification is sent.':'No se envía ninguna notificación.');
  // QA: publishing serves the option photos to the customer without Share with customer, so the dialog says it.
  await expect(publishDialog).toContainText(en?'even if you have not shared them in Job files':'aunque no las haya compartido en Archivos del trabajo');
  await publishDialog.getByRole('button',{name:en?'Publish to customer':'Publicar al cliente'}).click();
  await expect(card.locator('[data-selection-state]')).toHaveAttribute('data-selection-state','pending_client');
  await expect(view.locator('[data-selections-client-off]')).toBeVisible();// section still off in the customer view
  await card.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`selections-board-${suffix}.png`),fullPage:true});
  // Tracker with filters.
  await view.locator('[data-selections-mode="tracker"]').click();await expect(view.locator('[data-selections-mode="tracker"]')).toHaveAttribute('aria-pressed','true');await expect(view.locator('[data-selections-mode="board"]')).toHaveAttribute('aria-pressed','false');await expect(view.getByRole('tablist')).toHaveCount(0);const tracker=view.locator('[data-selections-tracker]');
  const rowSel=mobile?'[data-tracker-card]':'[data-tracker-row]';
  await expect(tracker.locator(rowSel)).toHaveCount(1);await expect(tracker.locator(rowSel).first()).toContainText(en?'Waiting for customer':'Pendiente del cliente');
  await expect(tracker.locator(`${rowSel} [data-tracker-overdue]`)).toBeVisible();
  await tracker.locator('[data-tracker-filter="state"]').selectOption('approved');await expect(tracker.locator('[data-tracker-empty]')).toBeVisible();
  await tracker.locator('[data-tracker-filter="state"]').selectOption('all');await tracker.locator('[data-tracker-filter="overdue"]').check();await expect(tracker.locator(rowSel)).toHaveCount(1);
  await tracker.locator(rowSel).first().scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`selections-tracker-${suffix}.png`),fullPage:true});
  // Reload keeps everything.
  await page.reload();await expect(page.locator('[data-selection-item] [data-selection-state]')).toHaveAttribute('data-selection-state','pending_client',{timeout:60000});
  await expect(page.locator('[data-selection-item] [data-selection-option]')).toHaveCount(2);
  // Turn the section on in the customer view editor.
  await nav.getByRole('button',{name:en?'Customer view':'Vista del cliente',exact:true}).click();
  const editor=page.locator('[data-client-dashboard-editor]');await expect(editor).toBeVisible({timeout:60000});
  const toggle=editor.locator('[data-client-dashboard-section="showSelections"]');await expect(toggle).not.toBeChecked();await toggle.check();
  await editor.getByRole('button',{name:en?'Save customer view':'Guardar vista del cliente'}).click();
  await expect(editor.getByRole('status').filter({hasText:en?'Customer view saved.':'Vista del cliente guardada.'})).toBeVisible();
  await expect(editor.locator('ol li').first()).toContainText(en?'Selections: Visible':'Selecciones: Visible');

  // ---- Customer UI ----
  const customerPage=await customer.newPage();onAppPageError(customerPage,message=>runtime.push(message));
  await gotoOK(customerPage,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${uiRequestId}`);
  const section=customerPage.locator('[data-client-selections]');await expect(section).toBeVisible({timeout:60000});
  await expect(section).toContainText(en?'Sink faucet':'Grifería del lavamanos');await expect(section).not.toContainText('UI_NOTA_INTERNA');await expect(section).toContainText(en?'Recommended by your professional':'Recomendada por su profesional');
  const cImage=section.locator('[data-selection-image]').first();await expect(cImage).toBeVisible();await expect.poll(()=>cImage.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  // QA: the professional unpublishes while the customer is answering → 403 reloads the view (no stale item, no generic error).
  let uiItem=(await read(uiWorkId)).items[0];await post({action:'unpublish',actionId:uuid(),workId:uiWorkId,id:uiItem.id,revision:uiItem.revision});
  await section.locator('[data-client-selection-item] [data-selection-option]').first().getByRole('button',{name:en?'Approve this option':'Aprobar esta opción'}).click();
  await customerPage.getByRole('dialog').last().getByRole('button',{name:en?'Approve this option':'Aprobar esta opción'}).click();
  await expect(section.locator('[data-client-selection-error]')).toContainText(en?'This item changed':'Este ítem cambió');
  await expect(section.locator('[data-client-selection-item]')).toHaveCount(0);await expect(section).toContainText(en?'There are no selections to review yet.':'Todavía no hay selecciones para revisar.');
  uiItem=(await read(uiWorkId)).items[0];expect(uiItem).toMatchObject({state:'draft',approvedOptionId:null});
  await post({action:'publish',actionId:uuid(),workId:uiWorkId,id:uiItem.id,revision:uiItem.revision});
  await customerPage.reload();await expect(section.locator('[data-client-selection-item]')).toHaveCount(1,{timeout:60000});
  const cItem=section.locator('[data-client-selection-item]').first();
  await cItem.getByRole('button',{name:en?'Ask for changes':'Pedir cambios'}).click();
  await cItem.getByRole('button',{name:en?'Send comment':'Enviar comentario'}).click();await expect(section.locator('[data-client-selection-error]')).toContainText(en?'Write a comment.':'Escriba un comentario.');
  await cItem.locator('[data-client-selection-field="comment"]').fill(en?'Is there a gold finish?':'¿Hay acabado dorado?');
  await cItem.getByRole('button',{name:en?'Send comment':'Enviar comentario'}).click();
  await expect(section.getByRole('status').filter({hasText:en?'Comment sent':'Comentario enviado'})).toBeVisible();
  await expect(cItem.locator('[data-selection-state]')).toHaveAttribute('data-selection-state','changes_requested');
  await cItem.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(customerPage);await customerPage.screenshot({path:info.outputPath(`customer-changes-${suffix}.png`),fullPage:true});
  await cItem.locator('[data-selection-option]').nth(1).getByRole('button',{name:en?'Approve this option':'Aprobar esta opción'}).click();
  const approveDialog=customerPage.getByRole('dialog').last();await approveDialog.getByRole('button',{name:en?'Approve this option':'Aprobar esta opción'}).click();
  await expect(cItem.locator('[data-client-selection-approved]')).toContainText(en?'Matte black faucet':'Grifo negro mate');
  await customerPage.reload();await expect(customerPage.locator('[data-client-selection-approved]')).toContainText(en?'Matte black faucet':'Grifo negro mate',{timeout:60000});
  await expect(customerPage.locator('[data-client-selections]').getByRole('button',{name:en?'Approve this option':'Aprobar esta opción'})).toHaveCount(0);
  await customerPage.locator('[data-client-selection-item] [data-selection-option]').first().scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(customerPage);await customerPage.screenshot({path:info.outputPath(`customer-approved-${suffix}.png`),fullPage:true});

  // ---- Owner sees the approval and applies it to the allowance (explicit) ----
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:uiWorkId,vistaTrabajo:'selections'}));
  const ownerCard=page.locator('[data-selection-item]').first();await expect(ownerCard.locator('[data-selection-state]')).toHaveAttribute('data-selection-state','approved',{timeout:60000});
  await expect(ownerCard.locator('[data-selection-approved]')).toContainText(en?'Matte black faucet':'Grifo negro mate');
  await ownerCard.getByRole('button',{name:en?'Use this total in the allowance':'Usar este total en el monto previsto'}).click();
  const applyDialog=page.getByRole('dialog').last();await expect(applyDialog).toContainText(en?'Nothing is charged or invoiced':'No se cobra ni se factura nada');
  await applyDialog.getByRole('button',{name:en?'Use this total in the allowance':'Usar este total en el monto previsto'}).click();
  await expect(ownerCard.locator('[data-selection-allowance-decided]')).toBeVisible();
  const allowances=await (await page.request.get('/api/pro/allowances?'+new URLSearchParams({workId:uiWorkId}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json();
  expect(allowances.items[0]).toMatchObject({id:uiAllowance,status:'decided',choice:{description:en?'Matte black faucet':'Grifo negro mate',supplier:'Casa Grifos',quantity:1,actualCents:12000000},variance:'under'});
  await ownerCard.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`selections-approved-board-${suffix}.png`),fullPage:true});
  await page.locator('[data-selections-mode="tracker"]').click();
  await expect(page.locator(`[data-selections-tracker] ${rowSel}`).first()).toContainText(en?'Matte black faucet':'Grifo negro mate');
  await expect(page.locator(`[data-selections-tracker] ${rowSel} [data-tracker-overdue]`)).toHaveCount(0);// approved is never overdue
  await page.locator('[data-selection-history] summary').click();
  await expect(page.locator('[data-selection-history-entry="approve"]')).toContainText(en?'Customer':'Cliente');
  await page.locator('[data-selections-tracker]').scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`selections-approved-tracker-${suffix}.png`),fullPage:true});
  const ui=await read(uiWorkId);expect(ui.items[0]).toMatchObject({state:'approved',notes:'UI_NOTA_INTERNA',allowanceId:uiAllowance});
  expect(ui.history.map(row=>row.action)).toEqual(['approve','request_changes','publish','unpublish','publish','recommend','option_add','option_add','item_create','area_create']);
  expect(await notices()).toEqual(noticesBefore);
  expect(runtime).toEqual([]);
 }finally{await customer?.close();await other?.close();await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.client);await cleanupDisposableAccount(f.rival);}
});
