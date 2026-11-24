import {test,expect,type BrowserContext,type Browser,type Page,type TestInfo} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';

const origin='http://127.0.0.1:3185',api='/api/pro/lead-inboxes',leadApi='/api/pro/lead-center';
const plusDays=(iso:string,days:number)=>new Date(Date.parse(iso+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
async function makePro(prefix:string){const db=regressionAdminClient(),owner=await createDisposableAccount({prefix});try{const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();return owner;}catch(error){await cleanupDisposableAccount(owner);throw error;}}
async function warm(context:BrowserContext){for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);}
async function fixture(context:BrowserContext){
 await stabilizeLocalProRuntime(context,origin);
 const db=regressionAdminClient(),owner=await makePro('inbox-owner');let client:DisposableAccount|undefined;
 try{
  client=await createDisposableAccount({prefix:'inbox-client'});
  const professional=(await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Bandejas local',slug:'inbox-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError()).data!;
  const workId=crypto.randomUUID(),requestId=crypto.randomUUID(),day=crTodayISO(),linked='reservation-'+client.id,document=emptyBusiness();
  document.clients=[{id:'cli-ana',name:'Ana Local',email:'ana@example.test',phone:'8888-1111',notes:'',archived:false},{id:'cli-beto',name:'Beto Local',email:'beto@example.test',phone:'',notes:'',archived:false},{id:linked,name:'Cliente vinculado',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId:linked,client:'Cliente vinculado',service:'Electricidad',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false,bookingClientId:client.id}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);await warm(context);
  expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId,clientId:linked}),{timeout:45000})).status()).toBe(200);
  await db.from('pro_appointment_requests').insert({id:requestId,professional_id:professional.id,owner_id:owner.id,client_user_id:client.id,client_name:'Cliente vinculado',professional_name:'Bandejas local',professional_slug:'inbox-'+owner.id,service:'Electricidad',duration_minutes:60,location_kind:'agree',location_text:'',note:'',requested_start:day+'T11:00:00-06:00',status:'confirmed',revision:0,work_id:workId}).throwOnError();
  await db.from('pro_appointment_events').insert({request_id:requestId,actor_id:owner.id,side:'provider',action:'confirm',note:'',status:'confirmed'}).throwOnError();
  const manual=async(clientId:string,title:string,projectType:string)=>{const input={action:'create',actionId:crypto.randomUUID(),kind:'manual',id:crypto.randomUUID(),revision:0,catalogRevision:0,clientId,title,description:'',address:'',sourceLabel:'',forecast:{projectType,expectedStart:null,currency:'CRC',revenueCents:null,budgetCents:null,profitCents:null},stageMode:'automatic',stageId:null},response=await context.request.post(origin+leadApi,{headers:{Origin:origin,'X-Pro-Expected-Actor':owner.id},data:input});expect(response.status()).toBe(200);return input.id;};
  const paint=await manual('cli-ana','Pintura de casa','Pintura'),roof=await manual('cli-beto','Techos','');
  return {owner,client,professional,db,workId,requestId,paint,roof,day};
 }catch(error){await cleanupDisposableAccount(owner);if(client)await cleanupDisposableAccount(client);throw error;}
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function cleanup(f:Fixture){await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.client);}
const csv=(rows:string[][])=>[['nombre','correo','telefono','servicio','tipo_proyecto','canal','direccion','descripcion'],...rows].map(r=>r.map(v=>'"'+v.replace(/"/g,'""')+'"').join(',')).join('\r\n');
const goodRows=[['Carla Nueva','carla@example.test','','Pintura','Interiores','Recomendación','San José','Sala y comedor'],['Ana Repetida','ANA@example.test','','Ventanas','','','',''],['Ana por teléfono','','+506 8888 1111','Pintura de casa','','','','']];
const badRows=[...goodRows,['','x@example.test','','Algo','','','',''],['Malo','no-es-correo','','Techo','','','',''],['Carla bis','carla@example.test','','Otro','','','',''],['Canal raro','raro@example.test','','Jardín','','Canal inexistente','','']];
async function rpcGet(context:BrowserContext,actor:string,params:Record<string,string>){const response=await context.request.get(origin+api+'?'+new URLSearchParams(params),{headers:{'X-Pro-Expected-Actor':actor},timeout:45000});return{status:response.status(),body:await response.json().catch(()=>null)};}
async function rpcPost(context:BrowserContext,actor:string,data:unknown,headers:Record<string,string>={}){const response=await context.request.post(origin+api,{headers:{Origin:origin,'X-Pro-Expected-Actor':actor,...headers},data,timeout:60000});return{status:response.status(),body:await response.json().catch(()=>null)};}
const desktop=(page:Page)=>(page.viewportSize()?.width??0)>=1024;
async function inboxCount(page:Page,value:string){if(desktop(page))return (await page.locator(`[data-lead-inbox="${value}"] [data-lead-inbox-count]`).textContent())?.trim();const text=await page.locator(`select[data-lead-inbox-select] option[value="${value}"]`).textContent();return text?.match(/\((\d+|…)\)$/)?.[1];}
async function expectCount(page:Page,value:string,n:number){await expect.poll(()=>inboxCount(page,value),{timeout:45000}).toBe(String(n));}
async function chooseInbox(page:Page,value:string){if(desktop(page))await page.locator(`[data-lead-inbox="${value}"]`).click();else await page.locator('select[data-lead-inbox-select]').selectOption(value);}
// Environment-only recovery: the product's own Retry for its temporary Pro verification error (at most 3 clicks).
async function openLeads(page:Page,language:'es'|'en'){const en=language==='en';await gotoOK(page,`/${language}/dashboard/pro?tab=pro_leads`);const temporary=page.locator('main').getByRole('alert').filter({hasText:en?/^Could not verify Pro access\. Your data is preserved\.$/:/^No se pudo comprobar el acceso a Pro\. Sus datos se conservan\.$/}),ready=page.locator('[data-lead-inbox-layout]');
 for(let attempt=0;attempt<3;attempt++){await expect.poll(async()=>await ready.isVisible()||await temporary.isVisible(),{timeout:45000}).toBe(true);if(!await temporary.isVisible())break;await page.locator('main').getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();await expect.poll(async()=>await ready.isVisible()||!await temporary.isVisible(),{timeout:20000}).toBe(true).catch(()=>{});}await expect(ready).toBeVisible({timeout:45000});}
async function shot(page:Page,info:TestInfo,name:string){await page.screenshot({path:info.outputPath(name+'.png'),fullPage:true,animations:'disabled'});}

for(const language of ['es','en'] as const){
 test(`${language}: inbox API counts, snooze/expiry/wake, filters, CSV import, duplicates, idempotency, isolation, undo and funnel`,async({page,baseURL,browser}:{page:Page;baseURL:string|undefined;browser:Browser})=>{
  test.setTimeout(240000);local(baseURL);const f=await fixture(page.context()),c=page.context(),today=crTodayISO();let other:DisposableAccount|undefined;const otherContext=await browser.newContext();
  try{
   expect((await f.db.from('pro_clients').select('id').eq('user_id',f.owner.id).in('id',['cli-ana','cli-beto']).throwOnError()).data).toHaveLength(2);
   // Counters: 2 manual + 1 public request, all active.
   let list=await rpcGet(c,f.owner.id,{view:'list'});expect(list.status).toBe(200);expect(list.body.inboxes).toMatchObject({active:3,snoozed:0,archived:0,imports:0});expect(list.body.page.items).toHaveLength(3);expect(list.body.inboxes.stages.find((s:{stageId:string})=>s.stageId==='new').count).toBe(2);expect(list.body.inboxes.stages.reduce((n:number,s:{count:number})=>n+s.count,0)).toBe(3);expect(list.body.services).toEqual(['Electricidad','Pintura','Techos']);
   // Validation 400, auth 401/403.
   for(const params of <Record<string,string>[]>[{view:'list',box:'otra'},{view:'list',from:'2026-02-30'},{view:'list',from:plusDays(today,2),to:today},{view:'funnel',from:today},{view:'list',stageId:'nope nope'}])expect((await rpcGet(c,f.owner.id,params)).status).toBe(400);
   expect((await c.request.get(origin+api+'?view=list',{headers:{'X-Pro-Expected-Actor':crypto.randomUUID()}})).status()).toBe(403);
   expect((await otherContext.request.get(origin+api+'?view=list')).status()).toBe(401);
   expect((await rpcPost(c,f.owner.id,{action:'snooze',actionId:crypto.randomUUID(),kind:'manual',id:f.paint,revision:0,until:plusDays(today,3),note:''},{Origin:'http://evil.test'})).status).toBe(403);
   for(const until of [today,plusDays(today,-1),plusDays(today,400)])expect((await rpcPost(c,f.owner.id,{action:'snooze',actionId:crypto.randomUUID(),kind:'manual',id:f.paint,revision:0,until,note:''})).status).toBe(400);
   expect((await rpcPost(c,f.owner.id,{action:'snooze',actionId:crypto.randomUUID(),kind:'manual',id:crypto.randomUUID(),revision:0,until:plusDays(today,3),note:''})).status).toBe(404);
   // Body limit: 16 KiB for snooze/wake/undo (413); only CSV preview/import may be larger.
   expect((await rpcPost(c,f.owner.id,{action:'snooze',actionId:crypto.randomUUID(),kind:'manual',id:f.paint,revision:0,until:plusDays(today,3),note:'x'.repeat(17000)})).status).toBe(413);
   const large=await rpcPost(c,f.owner.id,{action:'preview',fileName:'grande.csv',csv:csv(Array.from({length:150},(_,n)=>['Persona '+n,'persona'+n+'@example.test','','Servicio '+n,'','','','d'.repeat(150)]))});expect(large.status).toBe(200);expect(large.body.summary).toMatchObject({total:150,new:150,error:0});
   // Snooze, idempotent replay, reuse and stale revision.
   const snooze={action:'snooze',actionId:crypto.randomUUID(),kind:'manual',id:f.paint,revision:0,until:plusDays(today,3),note:'Llamar el lunes'};
   const first=await rpcPost(c,f.owner.id,snooze);expect(first.status).toBe(200);expect(first.body.snooze).toMatchObject({revision:1,active:true,snoozed:true,until:plusDays(today,3),note:'Llamar el lunes'});
   const replay=await rpcPost(c,f.owner.id,snooze);expect(replay.status).toBe(200);expect(replay.body).toEqual(first.body);
   expect((await rpcPost(c,f.owner.id,{...snooze,note:'Otro'})).status).toBe(400);
   expect((await rpcPost(c,f.owner.id,{...snooze,actionId:crypto.randomUUID()})).status).toBe(409);
   expect((await rpcGet(c,f.owner.id,{view:'action',actionId:snooze.actionId})).body.receipt.kind).toBe('snooze');
   list=await rpcGet(c,f.owner.id,{view:'list'});expect(list.body.inboxes).toMatchObject({active:2,snoozed:1});expect(list.body.page.items.map((i:{id:string})=>i.id)).not.toContain(f.paint);
   const snoozed=await rpcGet(c,f.owner.id,{view:'list',box:'snoozed'});expect(snoozed.body.page.items.map((i:{id:string})=>i.id)).toEqual([f.paint]);expect(snoozed.body.snoozes[0].until).toBe(plusDays(today,3));
   // Wake and second wake conflict.
   expect((await rpcPost(c,f.owner.id,{action:'wake',actionId:crypto.randomUUID(),kind:'manual',id:f.paint,revision:1})).status).toBe(200);
   expect((await rpcPost(c,f.owner.id,{action:'wake',actionId:crypto.randomUUID(),kind:'manual',id:f.paint,revision:2})).status).toBe(409);
   // Expiry is computed on read in Costa Rica time (no cron): until = today means active again.
   expect((await rpcPost(c,f.owner.id,{action:'snooze',actionId:crypto.randomUUID(),kind:'request',id:f.requestId,revision:0,until:plusDays(today,1),note:''})).status).toBe(200);
   expect((await rpcGet(c,f.owner.id,{view:'list'})).body.inboxes).toMatchObject({active:2,snoozed:1});
   await f.db.from('pro_lead_snoozes').update({until_date:today}).eq('owner_id',f.owner.id).eq('kind','request').eq('id',f.requestId).throwOnError();
   list=await rpcGet(c,f.owner.id,{view:'list'});expect(list.body.inboxes).toMatchObject({active:3,snoozed:0});
   const history=await rpcGet(c,f.owner.id,{view:'snooze',kind:'manual',id:f.paint});expect(history.body.history.map((h:{action:string})=>h.action)).toEqual(['wake','snooze']);expect(history.body.snooze.active).toBe(false);
   // Archived leads cannot be snoozed until restored.
   const roofItem=(await rpcGet(c,f.owner.id,{view:'list'})).body.page.items.find((i:{id:string})=>i.id===f.roof);
   expect((await c.request.post(origin+leadApi,{headers:{Origin:origin,'X-Pro-Expected-Actor':f.owner.id},data:{action:'archive',actionId:crypto.randomUUID(),kind:'manual',id:f.roof,revision:roofItem.manual.revision}})).status()).toBe(200);
   expect((await rpcPost(c,f.owner.id,{action:'snooze',actionId:crypto.randomUUID(),kind:'manual',id:f.roof,revision:0,until:plusDays(today,3),note:''})).status).toBe(409);
   list=await rpcGet(c,f.owner.id,{view:'list'});expect(list.body.inboxes).toMatchObject({active:2,snoozed:0,archived:1});
   // Filters combine and counters follow them.
   expect((await rpcGet(c,f.owner.id,{view:'list',q:'Pintura'})).body.inboxes).toMatchObject({active:1,archived:0});
   expect((await rpcGet(c,f.owner.id,{view:'list',box:'archived',service:'techos'})).body.page.items.map((i:{id:string})=>i.id)).toEqual([f.roof]);
   expect((await rpcGet(c,f.owner.id,{view:'list',from:plusDays(today,1)})).body.inboxes).toMatchObject({active:0,snoozed:0,archived:0});
   expect((await rpcGet(c,f.owner.id,{view:'list',channelId:'referral'})).body.inboxes.active).toBe(0);
   // CSV import: per-row errors, duplicates, atomic commit.
   const bad=await rpcPost(c,f.owner.id,{action:'preview',fileName:'errores.csv',csv:csv(badRows)});expect(bad.status).toBe(200);
   expect(bad.body.summary).toEqual({total:7,new:1,existingClient:1,duplicate:1,error:4});
   expect(bad.body.rows.map((r:{status:string;errors:string[]})=>[r.status,r.errors])).toEqual([['new',[]],['existing_client',[]],['duplicate',[]],['error',['name_required']],['error',['email_invalid']],['error',['duplicate_in_file']],['error',['channel_unknown']]]);
   expect(bad.body.rows[1].client).toEqual({id:'cli-ana',name:'Ana Local',archived:false});
   expect((await rpcPost(c,f.owner.id,{action:'import',actionId:crypto.randomUUID(),fileName:'errores.csv',csv:csv(badRows)})).status).toBe(400);
   expect((await rpcPost(c,f.owner.id,{action:'preview',fileName:'x.csv',csv:'foo,bar\r\n1,2'})).body).toMatchObject({fileError:'unknown_column',column:'foo'});
   expect((await f.db.from('pro_lead_imports').select('id').eq('owner_id',f.owner.id).throwOnError()).data).toHaveLength(0);
   const importAction={action:'import',actionId:crypto.randomUUID(),fileName:'solicitudes.csv',csv:csv(goodRows)};
   const imported=await rpcPost(c,f.owner.id,importAction);expect(imported.status).toBe(200);expect(imported.body.import).toMatchObject({id:importAction.actionId,totalRows:3,createdLeads:2,createdClients:1,reusedClients:1,skippedDuplicates:1,activeLeads:2,undoneAt:null});
   const leadCount=async()=>(await f.db.from('pro_lead_center_records').select('id').eq('owner_id',f.owner.id).eq('kind','manual').throwOnError()).data!.length;
   const clientCount=async()=>(await f.db.from('pro_clients').select('id').eq('user_id',f.owner.id).throwOnError()).data!.length;
   const [leadsAfter,clientsAfter]=[await leadCount(),await clientCount()];expect(leadsAfter).toBe(4);
   const again=await rpcPost(c,f.owner.id,importAction);expect(again.status).toBe(200);expect(again.body).toEqual(imported.body);expect(await leadCount()).toBe(leadsAfter);expect(await clientCount()).toBe(clientsAfter);
   expect((await rpcPost(c,f.owner.id,{...importAction,csv:csv(goodRows.slice(0,1))})).status).toBe(400);
   const carla=(await f.db.from('pro_clients').select('*').eq('user_id',f.owner.id).eq('email','carla@example.test').throwOnError()).data!;expect(carla).toHaveLength(1);
   const second=await rpcPost(c,f.owner.id,{action:'preview',fileName:'otra.csv',csv:csv(goodRows)});expect(second.body.summary).toEqual({total:3,new:0,existingClient:0,duplicate:3,error:0});
   list=await rpcGet(c,f.owner.id,{view:'list'});expect(list.body.inboxes).toMatchObject({active:4,imports:1});
   expect((await rpcGet(c,f.owner.id,{view:'list',channelId:'referral'})).body.page.items).toHaveLength(1);
   expect((await rpcGet(c,f.owner.id,{view:'list',channelId:'referral',service:'Interiores',q:'Pintura'})).body.inboxes.active).toBe(1);
   // Isolation: another Pro account sees none of these customers, leads or imports.
   other=await makePro('inbox-other');const isolated=await browser.newContext();try{await stabilizeLocalProRuntime(isolated,origin);await f.db.from('pro_workspaces').insert({user_id:other.id,document:emptyBusiness(),revision:1}).throwOnError();await login(isolated,other);await warm(isolated);
    const view=await rpcGet(isolated,other.id,{view:'list'});expect(view.status).toBe(200);expect(view.body.inboxes).toMatchObject({active:0,snoozed:0,archived:0,imports:0});
    const foreign=await rpcPost(isolated,other.id,{action:'preview',fileName:'a.csv',csv:csv(goodRows)});expect(foreign.body.summary).toMatchObject({new:3,existingClient:0,duplicate:0});expect(foreign.body.rows.every((r:{client:unknown})=>r.client===null)).toBe(true);
    expect((await rpcPost(isolated,other.id,{action:'snooze',actionId:crypto.randomUUID(),kind:'manual',id:f.paint,revision:0,until:plusDays(today,3),note:''})).status).toBe(404);
    expect((await rpcPost(isolated,other.id,{action:'undo_import',actionId:crypto.randomUUID(),importId:importAction.actionId,revision:1})).status).toBe(404);
    expect((await rpcGet(isolated,other.id,{view:'action',actionId:importAction.actionId})).body.receipt).toBeNull();
   }finally{await isolated.close();}
   // Funnel checked by hand: received today = paint, roof (archived), request, 2 imported = 5; only the
   // request has a live job -> 1 converted, 20 %; open = 5 - 1 archived = 4.
   const funnel=await rpcGet(c,f.owner.id,{view:'funnel',from:today,to:today});expect(funnel.status).toBe(200);
   expect(funnel.body).toMatchObject({received:5,manual:4,request:1,open:4,archived:1,converted:1,conversionRate:20});
   expect((await rpcGet(c,f.owner.id,{view:'funnel',from:plusDays(today,1),to:plusDays(today,2)})).body).toMatchObject({received:0,converted:0,conversionRate:null});
   // Undo archives only the untouched leads of this import: a lead edited after the import (stage
   // change) is kept. Nothing is deleted; second undo conflicts.
   const imports=await rpcGet(c,f.owner.id,{view:'imports'});expect(imports.body.total).toBe(1);
   const carlaLead=(await f.db.from('pro_lead_import_rows').select('lead_id').eq('owner_id',f.owner.id).eq('import_id',importAction.actionId).eq('row_number',1).single().throwOnError()).data!.lead_id as string;
   const carlaRecord=(await f.db.from('pro_lead_center_records').select('revision').eq('owner_id',f.owner.id).eq('kind','manual').eq('id',carlaLead).single().throwOnError()).data!;
   expect((await c.request.post(origin+leadApi,{headers:{Origin:origin,'X-Pro-Expected-Actor':f.owner.id},data:{action:'set_stage',actionId:crypto.randomUUID(),kind:'manual',id:carlaLead,revision:carlaRecord.revision,catalogRevision:0,stageId:'connected'}})).status()).toBe(200);
   const undo={action:'undo_import',actionId:crypto.randomUUID(),importId:importAction.actionId,revision:1};
   const undone=await rpcPost(c,f.owner.id,undo);expect(undone.status).toBe(200);expect(undone.body).toMatchObject({archived:1,import:{revision:2,activeLeads:1,archivedOnUndo:1}});
   expect((await f.db.from('pro_lead_center_records').select('archived').eq('owner_id',f.owner.id).eq('kind','manual').eq('id',carlaLead).single().throwOnError()).data!.archived).toBe(false);
   expect((await rpcPost(c,f.owner.id,undo)).body).toEqual(undone.body);
   expect((await rpcPost(c,f.owner.id,{...undo,actionId:crypto.randomUUID(),revision:2})).status).toBe(409);
   expect((await rpcPost(c,f.owner.id,{...undo,actionId:crypto.randomUUID(),importId:crypto.randomUUID()})).status).toBe(404);
   expect(await leadCount()).toBe(leadsAfter);expect(await clientCount()).toBe(clientsAfter);
   list=await rpcGet(c,f.owner.id,{view:'list'});expect(list.body.inboxes).toMatchObject({active:3,archived:2,imports:1});
  }finally{await otherContext.close().catch(()=>{});if(other)await cleanupDisposableAccount(other);await cleanup(f);}
 });

 test(`${language}: inbox UI with counters, snooze and reactivate, CR expiry, combined filters and inline stage conflict`,async({page,baseURL},info)=>{
  test.setTimeout(240000);local(baseURL);const f=await fixture(page.context()),en=language==='en',errors:string[]=[];onAppPageError(page,message=>errors.push(message));
  try{
   await openLeads(page,language);const leads=page.locator('[data-pro-leads]');
   await expectCount(page,'active',3);await expectCount(page,'snoozed',0);await expectCount(page,'archived',0);await expectCount(page,'imports',0);await expectCount(page,'stage:new',2);
   await expect(leads.locator('[data-pro-lead]')).toHaveCount(3);
   const paint=leads.locator(`[data-pro-lead="${f.paint}"]`);
   await paint.getByRole('button',{name:en?'Lead actions':'Acciones de solicitud',exact:true}).click();await page.getByRole('menuitem',{name:en?'Snooze lead':'Posponer solicitud',exact:true}).click();
   const dialog=page.locator('[data-lead-snooze-dialog]'),until=plusDays(f.day,5);await expect(dialog).toBeVisible();
   await dialog.getByLabel(en?'Snooze until':'Posponer hasta',{exact:true}).fill(until);await dialog.getByLabel(en?'Private note (optional)':'Nota privada (opcional)',{exact:true}).fill(en?'Call after the quote':'Llamar después de la cotización');
   await shot(page,info,'snooze-dialog');
   await page.getByRole('button',{name:en?'Snooze':'Posponer',exact:true}).click();
   const day=new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(until+'T12:00:00Z'));
   await expect(dialog.getByRole('status')).toContainText(day);await page.getByRole('button',{name:en?'Done':'Listo',exact:true}).click();await expect(dialog).toHaveCount(0);
   await expectCount(page,'active',2);await expectCount(page,'snoozed',1);await expect(paint).toHaveCount(0);
   await chooseInbox(page,'snoozed');await expect(leads.locator('[data-pro-lead]')).toHaveCount(1);await expect(paint.locator('[data-lead-snoozed-until]')).toContainText(day);
   await shot(page,info,'snoozed-inbox');await expectNoHorizontalOverflow(page);
   await page.reload();await chooseInbox(page,'snoozed');await expect(paint.locator('[data-lead-snoozed-until]')).toContainText(day);
   await paint.getByRole('button',{name:en?'Lead actions':'Acciones de solicitud',exact:true}).click();await page.getByRole('menuitem',{name:en?'Reactivate lead':'Reactivar solicitud',exact:true}).click();
   await expect(page.locator('[data-lead-inbox-notice]')).toContainText(en?'Lead reactivated':'Solicitud reactivada');await expectCount(page,'snoozed',0);await expectCount(page,'active',3);
   // Expiry without cron: the stored date reaches today in Costa Rica and the lead is active on the next read.
   const snoozeRow=(await f.db.from('pro_lead_snoozes').select('revision').eq('owner_id',f.owner.id).eq('kind','manual').eq('id',f.paint).single().throwOnError()).data!;
   expect((await page.context().request.post(origin+api,{headers:{Origin:origin,'X-Pro-Expected-Actor':f.owner.id},data:{action:'snooze',actionId:crypto.randomUUID(),kind:'manual',id:f.paint,revision:snoozeRow.revision,until:plusDays(f.day,2),note:''}})).status()).toBe(200);
   await page.reload();await expectCount(page,'snoozed',1);
   await f.db.from('pro_lead_snoozes').update({until_date:f.day}).eq('owner_id',f.owner.id).eq('kind','manual').eq('id',f.paint).throwOnError();
   await page.reload();await expectCount(page,'snoozed',0);await expectCount(page,'active',3);await expect(paint).toHaveCount(1);
   // Combined filters: search + service + period; counters follow.
   await leads.getByLabel(en?'Search leads':'Buscar solicitudes',{exact:true}).fill('Pintura');await expect(leads.locator('[data-pro-lead]')).toHaveCount(1);await expectCount(page,'active',1);
   await leads.getByLabel(en?'Search leads':'Buscar solicitudes',{exact:true}).fill('');await leads.getByLabel(en?'Service type':'Tipo de servicio',{exact:true}).selectOption('Techos');await expect(leads.locator('[data-pro-lead]')).toHaveCount(1);await expect(leads.locator(`[data-pro-lead="${f.roof}"]`)).toHaveCount(1);await expectCount(page,'active',1);
   await leads.getByLabel(en?'Received from':'Recibidas desde',{exact:true}).fill(plusDays(f.day,1));await expect(leads.getByText(en?'No leads in this view.':'No hay solicitudes en esta vista.',{exact:true})).toBeVisible();await expectCount(page,'active',0);
   await shot(page,info,'filters-empty');
   await leads.getByRole('button',{name:en?'Clear filters':'Quitar filtros',exact:true}).click();await expectCount(page,'active',3);await expect(leads.locator('[data-pro-lead]')).toHaveCount(3);
   // Inline stage change from the list with an optimistic conflict (409), then a clean save.
   const roof=leads.locator(`[data-pro-lead="${f.roof}"]`),select=roof.getByLabel(en?'Lead stage':'Etapa de la solicitud',{exact:true});
   await select.selectOption('connected');
   const record=(await f.db.from('pro_lead_center_records').select('revision').eq('owner_id',f.owner.id).eq('kind','manual').eq('id',f.roof).single().throwOnError()).data!;
   expect((await page.context().request.post(origin+leadApi,{headers:{Origin:origin,'X-Pro-Expected-Actor':f.owner.id},data:{action:'set_stage',actionId:crypto.randomUUID(),kind:'manual',id:f.roof,revision:record.revision,catalogRevision:0,stageId:'followed_up'}})).status()).toBe(200);
   await roof.getByRole('button',{name:en?'Save stage':'Guardar etapa',exact:true}).click();
   await expect(leads.getByRole('alert').filter({hasText:en?'The lead changed. Keep your draft, refresh and review it.':'La solicitud cambió. Conserve el borrador, actualice y revíselo.'}).first()).toBeVisible({timeout:60000});
   await leads.getByRole('button',{name:en?'Review draft':'Revisar borrador',exact:true}).click();await expect(leads.locator('[data-lead-center-recovery]')).toHaveCount(0);
   await page.reload();await expect(select).toHaveValue('followed_up');await expectCount(page,'stage:followed_up',1);
   await select.selectOption('connected');await roof.getByRole('button',{name:en?'Save stage':'Guardar etapa',exact:true}).click();await expect(roof.getByRole('button',{name:en?'Save stage':'Guardar etapa',exact:true})).toHaveCount(0,{timeout:45000});await expect(leads.locator('[data-lead-center-recovery]')).toHaveCount(0);await expect(select).toBeEnabled();await expect(select).toHaveValue('connected');
   await page.reload();await expect(select).toHaveValue('connected');await expectCount(page,'stage:connected',1);await expectCount(page,'stage:followed_up',0);
   await chooseInbox(page,'stage:connected');await expect(leads.locator('[data-pro-lead]')).toHaveCount(1);
   await shot(page,info,'stage-inbox');await expectNoHorizontalOverflow(page);
   expect(errors).toEqual([]);
  }finally{await page.goto('about:blank').catch(()=>{});await cleanup(f);}
 });

 test(`${language}: import UI with row errors, duplicates, history and undo; insights numbers and contact form`,async({page,baseURL},info)=>{
  test.setTimeout(240000);local(baseURL);const f=await fixture(page.context()),en=language==='en',errors:string[]=[];onAppPageError(page,message=>errors.push(message));
  try{
   await openLeads(page,language);const leads=page.locator('[data-pro-leads]');await expectCount(page,'active',3);
   // Empty import history state.
   await chooseInbox(page,'imports');await expect(leads.locator('[data-lead-import-history]')).toContainText(en?'No imports yet':'Todavía no hay importaciones');await chooseInbox(page,'active');
   await leads.getByRole('button',{name:en?'Import from file':'Importar archivo',exact:true}).click();
   const dialog=page.locator('[data-lead-import-dialog]'),file=dialog.getByLabel(en?'CSV file':'Archivo CSV',{exact:true}),commit=page.getByRole('button',{name:en?/^Import \d+ leads?$/:/^Importar \d+ solicitud(es)?$/});
   await file.setInputFiles({name:'errores.csv',mimeType:'text/csv',buffer:Buffer.from(csv(badRows))});
   await expect(dialog.locator('[data-lead-import-summary]')).toHaveText(en?'7 rows · 1 new customer · 1 existing customer · 1 duplicate · 4 with errors':'7 filas · 1 cliente nuevo · 1 cliente existente · 1 duplicada · 4 con errores');
   await expect(dialog.locator('[data-lead-import-row="4"]')).toContainText(en?'Name is required':'Falta el nombre');await expect(dialog.locator('[data-lead-import-row="5"]')).toContainText(en?'Invalid email':'Correo inválido');
   await expect(dialog.locator('[data-lead-import-row="6"]')).toContainText(en?'Repeated contact in this file':'Contacto repetido en el archivo');await expect(dialog.locator('[data-lead-import-row="7"]')).toContainText(en?'Channel not found among your active channels':'El canal no está entre sus canales activos');
   await expect(dialog.locator('[data-lead-import-row="2"]')).toContainText('Ana Local');await expect(dialog.locator('[data-lead-import-row="3"]')).toContainText(en?'Already exists · skipped':'Ya existe · se omite');
   await expect(commit).toBeDisabled();await shot(page,info,'import-errors');
   await file.setInputFiles({name:'unknown.csv',mimeType:'text/csv',buffer:Buffer.from('foo,bar\r\n1,2')});await expect(dialog.locator('[data-lead-import-mapping]')).toBeVisible();await expect(dialog.locator('[data-lead-import-map-missing]')).toBeVisible();await expect(dialog.locator('[data-lead-import-map-apply]')).toBeDisabled();
   await file.setInputFiles({name:'solicitudes.csv',mimeType:'text/csv',buffer:Buffer.from(csv(goodRows))});
   await expect(dialog.locator('[data-lead-import-summary]')).toHaveText(en?'3 rows · 1 new customer · 1 existing customer · 1 duplicate · 0 with errors':'3 filas · 1 cliente nuevo · 1 cliente existente · 1 duplicada · 0 con errores');
   await expect(commit).toHaveText(en?'Import 2 leads':'Importar 2 solicitudes');await commit.click();
   await expect(dialog.locator('[data-lead-import-result]')).toContainText(en?'2 leads created (1 new customer, 1 existing) · 1 duplicate skipped.':'2 solicitudes creadas (1 cliente nuevo, 1 existente) · 1 duplicada omitida.');
   await shot(page,info,'import-result');await page.getByRole('button',{name:en?'Done':'Listo',exact:true}).click();await expect(dialog).toHaveCount(0);
   await expectCount(page,'active',5);await expectCount(page,'imports',1);
   expect((await f.db.from('pro_lead_imports').select('id').eq('owner_id',f.owner.id).throwOnError()).data).toHaveLength(1);
   await chooseInbox(page,'imports');const history=leads.locator('[data-lead-import-history] [data-lead-import]');await expect(history).toHaveCount(1);await expect(history).toContainText('solicitudes.csv');
   const counts=history.locator('[data-lead-import-counts] dd');await expect(counts).toHaveText(['3','2','1','2']);await shot(page,info,'import-history');await expectNoHorizontalOverflow(page);
   await history.getByRole('button',{name:en?'Undo import':'Deshacer importación',exact:true}).click();await page.getByRole('dialog').last().getByRole('button',{name:en?'Undo import':'Deshacer importación',exact:true}).click();
   await expect(leads.locator('[data-lead-import-history]').getByRole('status')).toHaveText(en?'2 leads archived.':'2 solicitudes archivadas.');await expect(history).toContainText(en?'Undone':'Deshecha');await expect(counts.last()).toHaveText('0');
   await expectCount(page,'archived',2);await expectCount(page,'active',3);
   await page.reload();await chooseInbox(page,'imports');await expect(history).toContainText(en?'Undone':'Deshecha');await expect(history).toContainText(en?'2 archived when undone':'2 archivadas al deshacer');
   // Insights, numbers checked by hand: 3 seeded + 2 imported received today; only the request has a live job.
   await chooseInbox(page,'active');await leads.getByRole('button',{name:en?'Insights':'Métricas',exact:true}).click();const insights=page.locator('[data-lead-insights]');
   await expect(insights.locator('[data-lead-funnel-tile="received"] strong')).toHaveText('5');await expect(insights.locator('[data-lead-funnel-tile="open"] strong')).toHaveText('3');
   await expect(insights.locator('[data-lead-funnel-tile="converted"] strong')).toHaveText('1');await expect(insights.locator('[data-lead-funnel-tile="rate"] strong')).toHaveText(en?'20%':'20 %');
   await expect(insights.locator('[data-lead-funnel-stage="new"] [data-lead-funnel-count]')).toHaveText('2');await expect(insights.locator('[data-lead-origin-metrics]')).toBeVisible();
   await shot(page,info,'insights');await page.getByRole('button',{name:en?'Close':'Cerrar',exact:true}).last().click();await expect(insights).toHaveCount(0);
   await leads.getByRole('button',{name:en?'Contact form':'Formulario de contacto',exact:true}).click();const contact=page.locator('[data-lead-contact-form]');
   await expect(contact.getByRole('link',{name:en?'Open my public profile':'Abrir mi perfil público',exact:true})).toHaveAttribute('href',(en?'/en':'')+'/profesionales/'+(await f.db.from('professionals').select('slug').eq('id',f.professional.id).single().throwOnError()).data!.slug);
   await shot(page,info,'contact-form');await expectNoHorizontalOverflow(page);
   expect(errors).toEqual([]);
  }finally{await page.goto('about:blank').catch(()=>{});await cleanup(f);}
 });
}
