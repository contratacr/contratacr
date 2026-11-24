import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {ProjectsPage} from '../../src/lib/pro/projects';

const origin='http://127.0.0.1:3185',api='/api/pro/projects',hubApi='/api/pro/projects-hub';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
async function makePro(db:ReturnType<typeof regressionAdminClient>,owner:DisposableAccount){const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();}

for(const language of ['es','en'] as const)test(`Projects hub: derived status, counts, search, pagination and opening the grouped project menu [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(300000);local(baseURL);const en=language==='en',db=regressionAdminClient();
 const owner=await createDisposableAccount({prefix:'projects-owner'}),other=await createDisposableAccount({prefix:'projects-other'});let otherContext:BrowserContext|undefined;
 try{
  await makePro(db,owner);await makePro(db,other);const day=crTodayISO(),document=emptyBusiness();
  document.clients=[{id:'cli-a',name:'Ana Rojas',email:'',phone:'',notes:'',archived:false},{id:'cli-b',name:'Bruno Mora',email:'',phone:'',notes:'',archived:false}];
  const named=[
   {id:'p-open',clientId:'cli-a',client:'Ana Rojas',service:'Diseño de baño',stage:'new' as const,start:'',end:'',cancelled:false},
   {id:'p-progress',clientId:'cli-b',client:'Bruno Mora',service:'Remodelación de cocina',stage:'scheduled' as const,start:day+'T09:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false},
   {id:'p-done',clientId:'cli-a',client:'Ana Rojas',service:'Pintura exterior',stage:'completed' as const,start:day+'T08:00:00-06:00',end:day+'T10:00:00-06:00',cancelled:false},
   {id:'p-cancel',clientId:'cli-b',client:'Bruno Mora',service:'Techo nuevo',stage:'scheduled' as const,start:day+'T13:00:00-06:00',end:day+'T14:00:00-06:00',cancelled:true},
  ];
  const filler=Array.from({length:19},(_,i)=>({id:'p-fill-'+String(i).padStart(2,'0'),clientId:'cli-a',client:'Ana Rojas',service:'Mantenimiento '+String(i).padStart(2,'0'),stage:'new' as const,start:'',end:'',cancelled:false}));
  document.work=[...filler,...named];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  const otherDoc=emptyBusiness();otherDoc.clients=[{id:'cli-x',name:'Ajeno',email:'',phone:'',notes:'',archived:false}];otherDoc.work=[{id:'x-1',clientId:'cli-x',client:'Ajeno',service:'PROYECTO_AJENO',stage:'new',start:'',end:'',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:other.id,document:otherDoc,revision:1}).throwOnError();
  await login(page.context(),owner);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  // Materialize the normalized rows the same way the panel does.
  for(const work of [...filler,...named])expect((await page.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId:work.id,clientId:work.clientId}),{timeout:45000})).status()).toBe(200);
  const get=async(params:Record<string,string>)=>{const r=await page.request.get(api+'?'+new URLSearchParams(params));expect(r.status()).toBe(200);return await r.json() as ProjectsPage;};
  const all=await get({status:'all'});expect(all.counts).toEqual({open:20,in_progress:1,completed:1,cancelled:1,all:23});expect(all.items).toHaveLength(20);expect(all.nextCursor).not.toBeNull();
  const rest=await get({status:'all',after:String(all.nextCursor)});expect(rest.items).toHaveLength(3);expect(rest.nextCursor).toBeNull();
  const ids=[...all.items,...rest.items].map(item=>item.id);expect(new Set(ids).size).toBe(23);expect(ids).not.toContain('x-1');
  const byId=Object.fromEntries([...all.items,...rest.items].map(item=>[item.id,item]));
  expect(byId['p-open']).toMatchObject({status:'open',start:null,linkedCustomer:false,customView:false});expect(byId['p-progress'].status).toBe('in_progress');expect(byId['p-done'].status).toBe('completed');expect(byId['p-cancel'].status).toBe('cancelled');
  expect((await get({status:'active'})).items.every(item=>['open','in_progress'].includes(item.status))).toBe(true);
  expect((await get({status:'completed'})).items.map(item=>item.id)).toEqual(['p-done']);
  expect((await get({status:'all',q:'bruno'})).items.map(item=>item.id).sort()).toEqual(['p-cancel','p-progress']);
  expect((await get({status:'all',q:'cocina'})).items.map(item=>item.id)).toEqual(['p-progress']);
  const invalid:Array<Record<string,string>>=[{status:'nope'},{after:'0'},{q:'x'.repeat(161)},{extra:'1'}];for(const bad of invalid)expect((await page.request.get(api+'?'+new URLSearchParams(bad))).status()).toBe(400);
  // Repeated keys are ambiguous; a tab that expects another account gets nothing (QA 2026-11-10).
  expect((await page.request.get(api+'?status=all&status=completed')).status()).toBe(400);
  expect((await page.request.get(api+'?status=all',{headers:{'X-Pro-Expected-Actor':crypto.randomUUID()}})).status()).toBe(403);
  expect((await page.request.get(api+'?status=all',{headers:{'X-Pro-Expected-Actor':'not-a-uuid'}})).status()).toBe(403);
  expect((await page.request.get(api+'?status=all',{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(200);
  otherContext=await browser.newContext({baseURL});await login(otherContext,other);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await otherContext.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  expect((await otherContext.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId:'x-1',clientId:'cli-x'}),{timeout:45000})).status()).toBe(200);
  const foreign=await (await otherContext.request.get(origin+api+'?status=all')).json() as ProjectsPage;expect(foreign.items.map(item=>item.id)).toEqual(['x-1']);
  const workBefore=(await db.from('pro_work').select('*').eq('user_id',owner.id).order('id').throwOnError()).data;

  // UI: list, filter, search, open project, grouped project menu.
  const runtime=collectPageErrors(page);
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_projects`);
  const hub=page.locator('[data-projects-workspace]');await expect(hub).toBeVisible({timeout:60000});
  await expect(page.getByRole('heading',{level:1,name:en?'Projects':'Proyectos'})).toBeVisible();
  const mobile=(page.viewportSize()?.width??1366)<1024,entry=(id:string)=>hub.locator(mobile?`[data-project-card="${id}"]`:`[data-project-row="${id}"]`);
  await expect(entry('p-progress')).toBeVisible();await expect(entry('p-done')).toHaveCount(0);await expect(entry('p-cancel')).toHaveCount(0);
  await expect(hub.locator('[data-projects-total]')).toHaveText(en?'23 projects in total':'23 proyectos en total');
  // A filter change keeps the previous rows but announces that it is updating.
  let releaseList:()=>void=()=>{};const listHeld=new Promise<void>(resolve=>{releaseList=resolve;});
  await page.route(url=>url.pathname===hubApi&&url.searchParams.get('statuses')==='open,in_progress,completed,cancelled'&&!url.searchParams.has('after'),async route=>{await listHeld;await route.continue();},{times:1});
  await hub.locator('[data-projects-status-toggle]').click();await hub.locator('[data-projects-status-option="completed"]').check();await hub.locator('[data-projects-status-option="cancelled"]').check();await hub.locator('[data-projects-status-apply]').click();
  await expect(hub.locator('[data-projects-loading]')).toHaveText(en?'Updating projects…':'Actualizando proyectos…');await expect(hub.locator('[aria-busy="true"]')).toHaveCount(1);await expect(entry('p-progress')).toBeVisible();
  releaseList();await expect(entry('p-done')).toBeVisible();await expect(hub.locator('[data-projects-loading]')).toHaveCount(0);await expect(hub.locator('[aria-busy="true"]')).toHaveCount(0);
  // «Show more» fails once: «Retry» asks for the same cursor again and keeps the first page.
  const pageRequests:string[]=[];page.on('request',request=>{const url=new URL(request.url());if(url.pathname===hubApi&&url.searchParams.get('statuses')==='open,in_progress,completed,cancelled')pageRequests.push(url.searchParams.get('after')??'first');});
  await page.route(url=>url.pathname===hubApi&&url.searchParams.has('after'),route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"fixture"}'}),{times:1});
  await hub.getByRole('button',{name:en?'Show more projects':'Ver más proyectos'}).click();
  await expect(hub.locator('[data-projects-error]')).toContainText(en?'Could not load more projects.':'No se pudieron cargar más proyectos.');await expect(hub.locator(mobile?'[data-project-card]':'[data-project-row]')).toHaveCount(20);
  await expect(hub.getByRole('button',{name:en?'Show more projects':'Ver más proyectos'})).toHaveCount(0);
  await hub.locator('[data-projects-retry]').click();await expect(hub.locator(mobile?'[data-project-card]':'[data-project-row]')).toHaveCount(23);await expect(hub.locator('[data-projects-error]')).toHaveCount(0);
  const afterRequests=pageRequests.filter(value=>value!=='first');expect(afterRequests).toHaveLength(2);expect(afterRequests[1]).toBe(afterRequests[0]);expect(pageRequests.filter(value=>value==='first')).toHaveLength(0);
  // Mobile cards: the accessible name keeps the visible content (customer and status), not only the title.
  if(mobile)await expect(entry('p-progress').getByRole('button')).toHaveAccessibleName(new RegExp(`^${en?'Open project':'Abrir proyecto'}: Remodelación de cocina\\s*${en?'In progress':'En curso'}\\s*Bruno Mora`));
  await hub.locator('[data-projects-search]').fill('cocina');await expect(hub.locator(mobile?'[data-project-card]':'[data-project-row]')).toHaveCount(1);
  await expect(hub.locator('[data-projects-total]')).toHaveText(en?'23 projects in total · the search only filters the list':'23 proyectos en total · la búsqueda solo filtra la lista');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`projects-${language}.png`),fullPage:true});
  await hub.locator('[data-projects-search]').fill('zzz-sin-resultados');await expect(hub.locator('[data-projects-empty]')).toHaveText(en?'There are no projects with this filter.':'No hay proyectos con este filtro.');
  await hub.locator('[data-projects-search]').fill('cocina');
  await (mobile?entry('p-progress').getByRole('button'):entry('p-progress').getByRole('button',{name:'Remodelación de cocina',exact:true})).click();
  await expect(page).toHaveURL(/tab=pro_agenda|\/dashboard\/pro\/trabajo\//);expect((new URL(page.url()).searchParams.get('cita')??(decodeURIComponent(new URL(page.url()).pathname.split('/trabajo/')[1]?.split('/')[0]??'')||null))).toBe('p-progress');
  const nav=page.getByRole('navigation',{name:en?'Job workspace':'Gestión del trabajo'});await expect(nav).toBeVisible({timeout:60000});
  // Planning was added after Overview (project-planning-local.md): four groups.
  await expect(nav.locator('[data-job-workspace-group]')).toHaveCount(4);
  await expect(nav.locator(`[data-job-workspace-group="${en?'Planning':'Planificación'}"]`)).toContainText(en?'Quotes':'Cotizaciones');
  await expect(nav.locator(`[data-job-workspace-group="${en?'Finance':'Finanzas'}"]`)).toContainText(en?'Costs & payments':'Costos y pagos');
  await nav.getByRole('button',{name:en?'Customer view':'Vista del cliente'}).click();await expect(page.locator('[data-client-dashboard-editor]')).toBeVisible({timeout:60000});
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`project-menu-${language}.png`),fullPage:false});
  // Read-only hub: job rows are unchanged.
  expect((await db.from('pro_work').select('*').eq('user_id',owner.id).order('id').throwOnError()).data).toEqual(workBefore);
  expect(runtime()).toEqual([]);
 }finally{await otherContext?.close();await cleanupDisposableAccount(owner);await cleanupDisposableAccount(other);}
});
