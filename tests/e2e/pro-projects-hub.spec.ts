import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {HubPage} from '../../src/lib/pro/projects-hub';

const origin='http://127.0.0.1:3185',hubApi='/api/pro/projects-hub';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}async function makePro(db:ReturnType<typeof regressionAdminClient>,owner:DisposableAccount){const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();}

// Area A (Projects list v3): multi-status filter, sortable columns, pin, viewed, managers, custom Kanban statuses.
for(const language of ['es','en'] as const)test(`Projects hub v3: filters, sort, pin, managers and custom statuses [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(300000);local(baseURL);const en=language==='en',tr=(es:string,english:string)=>en?english:es,db=regressionAdminClient();
 const owner=await createDisposableAccount({prefix:'hub3-owner'}),other=await createDisposableAccount({prefix:'hub3-other'});let anonymous:BrowserContext|undefined;
 try{
  await makePro(db,owner);await makePro(db,other);const day=crTodayISO(),document=emptyBusiness();
  document.clients=[{id:'cli-a',name:'Ana Rojas',email:'',phone:'',notes:'',archived:false}];
  const mk=(id:string,service:string,stage:'new'|'scheduled'|'completed')=>({id,clientId:'cli-a',client:'Ana Rojas',service,stage,start:stage==='new'?'':day+'T09:00:00-06:00',end:stage==='new'?'':day+'T12:00:00-06:00',cancelled:false});
  document.work=[mk('h-a','Alfa','new'),mk('h-b','Beta','scheduled'),mk('h-c','Gamma','completed')];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  await db.from('pro_workspaces').insert({user_id:other.id,document:emptyBusiness(),revision:1}).throwOnError();
  await login(page.context(),owner);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  for(const id of ['h-a','h-b','h-c'])expect((await page.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId:id,clientId:'cli-a'}),{timeout:45000})).status()).toBe(200);
  const get=async(params:Record<string,string>)=>{const r=await page.request.get(hubApi+'?'+new URLSearchParams(params));expect(r.status(),await r.text()).toBe(200);return await r.json() as HubPage;};
  const post=(data:Record<string,unknown>)=>page.request.post(origin+hubApi,{headers:{Origin:origin},data});
  const ids=(p:HubPage)=>p.items.map(item=>item.id);
  // Multi-status filter, validation and sorting.
  expect(ids(await get({statuses:''})).sort()).toEqual(['h-a','h-b','h-c']);
  expect(ids(await get({statuses:'completed'}))).toEqual(['h-c']);expect(ids(await get({statuses:'open,completed'})).sort()).toEqual(['h-a','h-c']);
  for(const bad of ([{statuses:'nope'},{sort:'bogus'},{dir:'up'},{after:'0'},{extra:'1'}] as Record<string,string>[]))expect((await page.request.get(hubApi+'?'+new URLSearchParams(bad))).status()).toBe(400);
  expect((await page.request.get(hubApi+'?sort=name&sort=client')).status()).toBe(400);
  expect(ids(await get({sort:'name',dir:'asc'}))).toEqual(['h-a','h-b','h-c']);expect(ids(await get({sort:'name',dir:'desc'}))).toEqual(['h-c','h-b','h-a']);
  // Created is stamped for projects created after this feature; nothing is invented otherwise.
  for(const item of (await get({statuses:''})).items)expect(item.created).not.toBeNull();
  // Pin moves a project to the top and keeps it there whatever the sort; unpin restores the order.
  expect((await post({action:'pin',workId:'h-b',pinned:true})).status()).toBe(200);
  const pinned=await get({sort:'name',dir:'asc'});expect(ids(pinned)[0]).toBe('h-b');expect(pinned.items[0].pinned).toBe(true);
  expect((await post({action:'pin',workId:'h-b',pinned:false})).status()).toBe(200);expect(ids(await get({sort:'name',dir:'asc'}))[0]).toBe('h-a');
  // Viewed is recorded when a project is opened.
  expect((await get({statuses:''})).items.every(item=>item.viewed===null)).toBe(true);
  expect((await post({action:'viewed',workId:'h-c'})).status()).toBe(200);
  const viewed=await get({sort:'viewed',dir:'desc'});expect(ids(viewed)[0]).toBe('h-c');expect(viewed.items[0].viewed).not.toBeNull();
  // Location comes from the project details address.
  const detail=await page.request.post(origin+'/api/pro/project-details',{headers:{Origin:origin},data:{action:'save',actionId:crypto.randomUUID(),workId:'h-a',revision:0,color:null,typeId:null,code:null,budgetCents:null,address:'Escazú, San José',billingAddress:null,shippingAddress:null,defaultVatCode:null,tags:[]}});expect(detail.status(),await detail.text()).toBe(200);
  expect((await get({statuses:'open'})).items[0].location).toBe('Escazú, San José');expect(ids(await get({sort:'location',dir:'desc'}))[0]).toBe('h-a');
  // Managers: only active collaborators of the owner.
  await db.from('pro_team_grants').insert({id:crypto.randomUUID(),owner_id:owner.id,work_id:'h-a',member_user_id:other.id,member_name:'Carla Mora',role:'viewer',active:true,source_invite_id:crypto.randomUUID()}).throwOnError();
  const pool=await get({statuses:''});expect(pool.filters.managers).toEqual([{id:other.id,name:'Carla Mora'}]);
  expect((await post({action:'managers',workId:'h-a',memberIds:[crypto.randomUUID()]})).status()).toBe(400);
  expect((await post({action:'managers',workId:'h-a',memberIds:[other.id]})).status()).toBe(200);
  expect(ids(await get({manager:other.id}))).toEqual(['h-a']);expect((await get({statuses:'open'})).items[0].managers).toEqual([{id:other.id,name:'Carla Mora'}]);
  expect((await post({action:'managers',workId:'h-a',memberIds:[]})).status()).toBe(200);expect(ids(await get({manager:other.id}))).toEqual([]);
  // Custom statuses: create, duplicate, assign, rename, reorder, delete (assignments are cleared).
  const s1=crypto.randomUUID(),s2=crypto.randomUUID();
  expect((await post({action:'status_create',id:s1,name:'En diseño',color:'blue'})).status()).toBe(200);
  expect((await post({action:'status_create',id:crypto.randomUUID(),name:' en diseño ',color:'red'})).status()).toBe(409);
  expect((await post({action:'status_create',id:s2,name:'Listo',color:'green'})).status()).toBe(200);
  expect((await post({action:'status_set',workId:'h-b',statusId:s1})).status()).toBe(200);
  expect((await post({action:'status_set',workId:'h-b',statusId:crypto.randomUUID()})).status()).toBe(404);
  expect((await post({action:'status_rename',id:s1,name:'Diseño aprobado',color:'teal'})).status()).toBe(200);
  expect((await post({action:'status_reorder',ids:[s2,s1]})).status()).toBe(200);
  const withStatuses=await get({statuses:''});expect(withStatuses.filters.statuses.map(status=>status.id)).toEqual([s2,s1]);expect(withStatuses.filters.statuses[1]).toMatchObject({name:'Diseño aprobado',color:'teal'});expect(withStatuses.items.find(item=>item.id==='h-b')?.customStatusId).toBe(s1);
  expect((await post({action:'status_delete',id:s1})).status()).toBe(200);expect((await get({statuses:''})).items.find(item=>item.id==='h-b')?.customStatusId).toBeNull();
  expect((await post({action:'status_set',workId:'h-b',statusId:s2})).status()).toBe(200);
  expect((await post({action:'bogus'})).status()).toBe(400);
  // Another account cannot read or touch these rows; anonymous callers are refused.
  const otherContext=await browser.newContext({baseURL:origin});await login(otherContext,other);
  expect((await otherContext.request.post(origin+hubApi,{headers:{Origin:origin},data:{action:'pin',workId:'h-a',pinned:true}})).status()).toBe(404);
  expect((await otherContext.request.post(origin+hubApi,{headers:{Origin:origin},data:{action:'status_set',workId:'h-a',statusId:s2}})).status()).toBe(404);
  await otherContext.close();
  anonymous=await browser.newContext({baseURL:origin});expect((await anonymous.request.get(origin+hubApi)).status()).toBe(401);expect((await anonymous.request.post(origin+hubApi,{headers:{Origin:origin},data:{action:'viewed',workId:'h-a'}})).status()).toBe(401);

  // UI: status checkboxes with Apply, sortable headers, pin, board with custom statuses.
  const runtime=collectPageErrors(page);
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_projects`);
  const hub=page.locator('[data-projects-workspace]');await expect(hub).toBeVisible({timeout:60000});
  const mobile=(page.viewportSize()?.width??1366)<1024,entry=(id:string)=>hub.locator(mobile?`[data-project-card="${id}"]`:`[data-project-row="${id}"]`);
  await expect(entry('h-a')).toBeVisible();await expect(entry('h-b')).toBeVisible();await expect(entry('h-c')).toHaveCount(0);
  await hub.locator('[data-projects-status-toggle]').click();
  await expect(hub.locator('[data-projects-status-option]')).toHaveCount(4);await expect(hub.locator('[data-projects-status-option="open"]')).toBeChecked();await expect(hub.locator('[data-projects-status-option="completed"]')).not.toBeChecked();
  await hub.locator('[data-projects-status-option="open"]').uncheck();await hub.locator('[data-projects-status-option="completed"]').check();await hub.locator('[data-projects-status-apply]').click();
  await expect(entry('h-c')).toBeVisible();await expect(entry('h-a')).toHaveCount(0);await expect(hub.locator('[data-projects-status-toggle]')).toContainText(tr('En curso, Terminado','In progress, Completed'));
  await hub.locator('[data-projects-status-toggle]').click();await hub.locator('[data-projects-status-option="open"]').check();await hub.locator('[data-projects-status-apply]').click();await expect(entry('h-a')).toBeVisible();
  if(!mobile){
   await hub.locator('[data-projects-sort="name"]').click();await expect(hub.locator('th[aria-sort="ascending"]')).toHaveCount(1);
   await expect(hub.locator('[data-project-row]').first()).toHaveAttribute('data-project-row','h-a');
   await hub.locator('[data-projects-sort="name"]').click();await expect(hub.locator('[data-project-row]').first()).toHaveAttribute('data-project-row','h-c');
   await hub.locator('[data-projects-sort="name"]').click();await expect(hub.locator('th[aria-sort="ascending"],th[aria-sort="descending"]')).toHaveCount(0);
  }
  await entry('h-c').locator('[data-project-pin]').click();await expect(entry('h-c').locator('[data-project-pin="on"]')).toBeVisible();
  await expect(hub.locator(mobile?'[data-project-card]':'[data-project-row]').first()).toHaveAttribute(mobile?'data-project-card':'data-project-row','h-c');
  await entry('h-c').locator('[data-project-pin]').click();await expect(entry('h-c').locator('[data-project-pin="off"]')).toBeVisible();
  await entry('h-a').locator('[data-project-select]').check();await expect(hub.locator('[data-projects-selected]')).toContainText(tr('1 seleccionado','1 selected'));
  await hub.locator('[data-projects-bulk-pin]').click();await expect(entry('h-a').locator('[data-project-pin="on"]')).toBeVisible();await expect(hub.locator('[data-projects-bulk]')).toHaveCount(0);
  await hub.locator('[data-projects-view="board"]').click();
  await expect(hub.locator('[data-projects-column="none"]')).toBeVisible();await expect(hub.locator(`[data-projects-column="${s2}"] [data-project-board-card="h-b"]`)).toBeVisible();
  await hub.locator('[data-projects-customize]').click();await hub.locator('[data-status-new-name]').fill('Revisión final');await hub.locator('[data-status-add]').click();
  await expect(hub.locator('[data-status-row]')).toHaveCount(2,{timeout:30000});
  await hub.locator('[data-project-move="h-a"]').selectOption({label:'Revisión final'});await expect(hub.locator('[data-projects-column] [data-project-board-card="h-a"]')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`projects-hub-${language}.png`),fullPage:true});
  expect(runtime()).toEqual([]);
 }finally{await anonymous?.close();await cleanupDisposableAccount(owner);await cleanupDisposableAccount(other);}
});
