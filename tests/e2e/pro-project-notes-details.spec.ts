import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

// «Notas y llamadas del proyecto» + «Detalles del proyecto» (project-notes-details-local.md).
// Local types on purpose: the spec does not depend on the phase 2 src/lib files.
type Note={id:string;workId:string;kind:'note'|'call';body:string|null;occurredLocal:string;durationMinutes:number|null;direction:'inbound'|'outbound'|null;contact:string|null;pinned:boolean;archived:boolean;revision:number;edited:boolean};
type NotePage={items:Note[];pinned:Note[];nextCursor:string|null;counts:{all:number;note:number;call:number;archived:number}};
type Catalog={revision:number;types:Array<{id:string;systemKey:string|null;name:string|null;archived:boolean}>;tags:Array<{id:string;name:string}>};
type Details={workId:string;color:string|null;typeId:string|null;code:string|null;budgetCents:number|null;address:string|null;billingSameAsAddress:boolean;tags:Array<{id:string;name:string}>;revision:number;defaultVatCode:string|null};
type HubPage={items:Array<{id:string;code:string|null;color:string|null;type:{systemKey:string|null}|null;tags:Array<{name:string}>}>;counts:Record<string,number>};

const origin='http://127.0.0.1:3185',notesApi='/api/pro/project-notes',detailsApi='/api/pro/project-details',projectsApi='/api/pro/projects';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
async function makePro(db:ReturnType<typeof regressionAdminClient>,owner:DisposableAccount){const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();}
const note=(workId:string,body:string,extra:Record<string,unknown>={})=>({action:'create',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),kind:'note',body,occurredAt:null,durationMinutes:null,direction:null,contact:null,...extra});

for(const language of ['es','en'] as const)test(`Project notes and details: API contract, hub v2 and UI [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(300000);local(baseURL);const en=language==='en',db=regressionAdminClient();
 const owner=await createDisposableAccount({prefix:'notes-owner'}),other=await createDisposableAccount({prefix:'notes-other'});let otherContext:BrowserContext|undefined;
 try{
  await makePro(db,owner);await makePro(db,other);
  const document=emptyBusiness();document.clients=[{id:'cli-a',name:'Ana Rojas',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:'p-one',clientId:'cli-a',client:'Ana Rojas',service:'Remodelación de cocina',stage:'new',start:'',end:'',cancelled:false},{id:'p-two',clientId:'cli-a',client:'Ana Rojas',service:'Pintura exterior',stage:'new',start:'',end:'',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  const otherDoc=emptyBusiness();otherDoc.clients=[{id:'cli-x',name:'Ajeno',email:'',phone:'',notes:'',archived:false}];otherDoc.work=[{id:'x-1',clientId:'cli-x',client:'Ajeno',service:'PROYECTO_AJENO',stage:'new',start:'',end:'',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:other.id,document:otherDoc,revision:1}).throwOnError();
  await login(page.context(),owner);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  for(const workId of ['p-one','p-two'])expect((await page.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId,clientId:'cli-a'}),{timeout:45000})).status()).toBe(200);
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const post=async(api:string,data:unknown)=>page.request.post(origin+api,{headers,data});
  const list=async(params:Record<string,string>)=>{const r=await page.request.get(origin+notesApi+'?'+new URLSearchParams({view:'list',workId:'p-one',...params}),{headers});expect(r.status()).toBe(200);return await r.json() as NotePage;};

  // ---- Notes API: validation (400), idempotent replay, CAS (409), permissions (403/404), isolation.
  for(const bad of [note('p-one',''),note('p-one','x'.repeat(4001)),note('p-one','x',{durationMinutes:5}),note('p-one','x',{occurredAt:'2999-01-01T10:00'}),{...note('p-one','x'),kind:'call'},{...note('p-one','x'),extra:true}])
   expect((await post(notesApi,bad)).status()).toBe(400);
  const first=note('p-one','Acordamos el color del enchape');
  const created=await post(notesApi,first);expect(created.status()).toBe(200);const firstNote=(await created.json()).note as Note;
  expect(firstNote).toMatchObject({kind:'note',body:'Acordamos el color del enchape',revision:1,pinned:false,archived:false});
  const replay=await post(notesApi,first);expect(replay.status()).toBe(200);expect((await replay.json()).note.id).toBe(firstNote.id);
  expect((await post(notesApi,{...first,body:'otro texto'})).status()).toBe(400);
  const call=note('p-one','Confirmó la visita del jueves',{kind:'call',occurredAt:'2026-01-15T09:30',durationMinutes:12,direction:'outbound',contact:'Ana Rojas'});
  const callNote=(await (await post(notesApi,call)).json()).note as Note;expect(callNote.occurredLocal).toBe('2026-01-15T09:30');
  const update={action:'update',actionId:crypto.randomUUID(),workId:'p-one',id:firstNote.id,revision:1,body:'Acordamos enchape gris',occurredAt:null,durationMinutes:null,direction:null,contact:null};
  expect((await post(notesApi,update)).status()).toBe(200);
  expect((await post(notesApi,{...update,actionId:crypto.randomUUID(),body:'tarde'})).status()).toBe(409);
  expect((await page.request.post(origin+notesApi,{headers:{...headers,Origin:'http://evil.example'},data:note('p-one','x')})).status()).toBe(403);
  expect((await page.request.post(origin+notesApi,{headers:{...headers,'X-Pro-Expected-Actor':crypto.randomUUID()},data:note('p-one','x')})).status()).toBe(403);
  expect((await post(notesApi,note('x-1','ajeno'))).status()).toBe(403);
  expect((await page.request.get(origin+notesApi+'?'+new URLSearchParams({view:'list',workId:'x-1'}),{headers})).status()).toBe(404);
  expect((await page.request.post(origin+notesApi,{headers:{...headers,'Content-Type':'application/json'},data:JSON.stringify({...note('p-one','x'),body:'x'.repeat(17000)})})).status()).toBe(413);
  expect((await post(notesApi,{action:'pin',actionId:crypto.randomUUID(),workId:'p-one',id:callNote.id,revision:1})).status()).toBe(200);
  let notes=await list({});expect(notes.pinned.map(item=>item.id)).toEqual([callNote.id]);expect(notes.items.map(item=>item.id)).toEqual([firstNote.id]);expect(notes.counts).toEqual({all:2,note:1,call:1,archived:0});
  expect((await list({kind:'call',q:'ana'})).pinned).toHaveLength(1);
  const history=await (await page.request.get(origin+notesApi+'?'+new URLSearchParams({view:'history',workId:'p-one',id:firstNote.id}),{headers})).json();expect(history.versions.map((v:{action:string})=>v.action)).toEqual(['update','create']);
  // Pages of 20 with a cursor (pinned entries are never repeated in the stream).
  for(let i=0;i<21;i++)expect((await post(notesApi,note('p-one','Lote '+i,{occurredAt:'2026-01-0'+(1+i%9)+'T08:00'}))).status()).toBe(200);
  notes=await list({});expect(notes.items).toHaveLength(20);expect(notes.nextCursor).not.toBeNull();
  const rest=await list({after:notes.nextCursor!});expect(rest.items).toHaveLength(2);expect(rest.nextCursor).toBeNull();expect(rest.pinned).toEqual([]);
  expect(new Set([...notes.items,...rest.items].map(item=>item.id)).size).toBe(22);

  // ---- Details API.
  const read=async(workId:string)=>{const r=await page.request.get(origin+detailsApi+'?'+new URLSearchParams({view:'detail',workId}),{headers});expect(r.status()).toBe(200);return await r.json() as {details:Details;catalog:Catalog};};
  const initial=await read('p-one');expect(initial.details.revision).toBe(0);expect(initial.catalog.types.map(type=>type.systemKey)).toContain('remodel');
  const remodel=initial.catalog.types.find(type=>type.systemKey==='remodel')!.id;
  const save={action:'save',actionId:crypto.randomUUID(),workId:'p-one',revision:0,color:'teal',typeId:remodel,code:'COC-01',budgetCents:250000000,address:'San Pedro, 200 m norte del parque',billingAddress:null,shippingAddress:null,defaultVatCode:'08',tags:['Cocina','Urgente']};
  for(const bad of [{...save,color:'#00ff00'},{...save,defaultVatCode:'05'},{...save,tags:Array.from({length:11},(_,i)=>'t'+i)},{...save,tags:['A','a']},{...save,code:'con espacio'},{...save,typeId:crypto.randomUUID(),actionId:crypto.randomUUID()}])
   expect((await post(detailsApi,bad)).status()).toBe(400);
  expect((await post(detailsApi,save)).status()).toBe(200);expect((await post(detailsApi,save)).status()).toBe(200);
  expect((await post(detailsApi,{...save,actionId:crypto.randomUUID()})).status()).toBe(409);
  const taken=await post(detailsApi,{...save,actionId:crypto.randomUUID(),workId:'p-two',code:'coc-01',tags:['cocina']});expect(taken.status()).toBe(409);expect((await taken.json()).field).toBe('code');
  expect((await post(detailsApi,{...save,actionId:crypto.randomUUID(),workId:'p-two',code:null,color:'red',typeId:null,tags:['cocina']})).status()).toBe(200);
  const saved=await read('p-one');expect(saved.details).toMatchObject({color:'teal',code:'COC-01',budgetCents:250000000,billingSameAsAddress:true,defaultVatCode:'08',revision:1});
  expect(saved.details.tags.map(tag=>tag.name)).toEqual(['Cocina','Urgente']);expect((await read('p-two')).details.tags[0].id).toBe(saved.details.tags[0].id);
  expect((await post(detailsApi,{...save,actionId:crypto.randomUUID(),workId:'x-1'})).status()).toBe(403);

  // ---- Hub: v1 unchanged, v2 adds the new columns and filters.
  const v1=await (await page.request.get(origin+projectsApi+'?status=all',{headers})).json();expect(Object.keys(v1.items[0]).sort()).not.toContain('code');
  const hub=async(params:Record<string,string>)=>{const r=await page.request.get(origin+projectsApi+'?'+new URLSearchParams({v:'2',status:'all',...params}),{headers});expect(r.status()).toBe(200);return await r.json() as HubPage;};
  const all=await hub({});expect(all.counts).toEqual(v1.counts);expect(all.items.find(item=>item.id==='p-one')).toMatchObject({code:'COC-01',color:'teal',type:{systemKey:'remodel'}});
  expect((await hub({q:'coc-0'})).items.map(item=>item.id)).toEqual(['p-one']);
  expect((await hub({tag:saved.details.tags[1].id})).items.map(item=>item.id)).toEqual(['p-one']);
  expect((await hub({type:remodel})).items.map(item=>item.id)).toEqual(['p-one']);
  expect((await page.request.get(origin+projectsApi+'?v=2&status=all&tag=nope',{headers})).status()).toBe(400);

  // ---- Isolation: the other account sees nothing of this account.
  otherContext=await browser.newContext({baseURL});await login(otherContext,other);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await otherContext.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  expect((await otherContext.request.get(origin+notesApi+'?'+new URLSearchParams({view:'list',workId:'p-one'}))).status()).toBe(404);
  expect((await otherContext.request.get(origin+detailsApi+'?'+new URLSearchParams({view:'detail',workId:'p-one'}))).status()).toBe(404);
  expect((await otherContext.request.post(origin+notesApi,{headers:{Origin:origin},data:{action:'archive',actionId:crypto.randomUUID(),workId:'p-one',id:firstNote.id,revision:2}})).status()).toBe(403);

  // ---- UI: notes and calls from the job header.
  const runtime=collectPageErrors(page);
  let failNotes=true;
  await page.route(url=>url.pathname===notesApi&&url.searchParams.get('view')==='list',async route=>{if(failNotes){failNotes=false;return route.fulfill({status:503,json:{error:'fixture'}});}return route.continue();});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:'p-two'}));
  const workspace=page.locator('[data-job-workspace]');await expect(workspace).toBeVisible({timeout:60000});
  const header=workspace.locator('[data-job-workspace-header]');
  await header.getByRole('button',{name:en?'Notes and calls':'Notas y llamadas',exact:true}).click();
  const panel=workspace.locator('[data-project-notes]');
  await expect(panel.getByRole('alert')).toContainText(en?'Could not load the notes.':'No se pudieron cargar las notas.');
  await panel.getByRole('button',{name:en?'Retry':'Reintentar'}).click();
  await expect(panel.locator('[data-project-notes-empty]')).toContainText(en?'No notes or calls yet.':'Todavía no hay notas ni llamadas.');
  await panel.locator('[data-project-note-new="note"]').click();
  await panel.locator('[data-project-note-form]').getByLabel(en?'Note':'Nota',{exact:true}).fill(en?'Customer prefers matte paint':'El cliente prefiere pintura mate');
  await panel.getByRole('button',{name:en?'Save note':'Guardar nota'}).click();
  await expect(panel.getByText(en?'Note saved.':'Nota guardada.',{exact:true})).toBeVisible();
  await panel.locator('[data-project-note-new="call"]').click();
  await panel.getByLabel(en?'Date and time · Costa Rica':'Fecha y hora · Costa Rica',{exact:true}).fill('2026-01-20T10:15');
  await panel.getByLabel(en?'Duration (minutes)':'Duración (minutos)').fill('7');
  await panel.getByLabel(en?'Incoming':'Entrante').check();
  await panel.getByRole('button',{name:en?'Save call':'Guardar llamada'}).click();
  await expect(panel.locator('[data-project-note-kind="call"]')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`notes-${language}.png`),fullPage:true});
  await page.reload();await expect(workspace.locator('[data-project-notes]')).toBeVisible({timeout:60000});
  await expect(panel.locator('[data-project-note]')).toHaveCount(2);
  await panel.getByRole('button',{name:en?'Calls':'Llamadas'}).click();await expect(panel.locator('[data-project-note]')).toHaveCount(1);
  await expect(panel.locator('[data-project-note]').first()).toContainText(en?'Incoming':'Entrante');

  // ---- UI: project details.
  await header.getByRole('button',{name:en?'Project details':'Detalles del proyecto',exact:true}).click();
  const details=workspace.locator('[data-project-details]');await expect(details.locator('[data-project-details-form]')).toBeVisible({timeout:60000});
  await details.getByText(en?'Purple':'Morado',{exact:true}).click();
  await details.getByLabel(en?'Project type':'Tipo de proyecto').selectOption({label:en?'Repair':'Reparación'});
  await details.getByLabel(en?'Project code (optional)':'Código del proyecto (opcional)',{exact:true}).fill('PIN-7');
  await details.getByPlaceholder(en?'New tag':'Nueva etiqueta').fill(en?'Exterior':'Exterior');await details.getByRole('button',{name:en?'Add':'Agregar',exact:true}).click();
  await details.getByRole('button',{name:en?'Save details':'Guardar detalles'}).click();
  await expect(details.getByText(en?'Details saved.':'Detalles guardados.',{exact:true})).toBeVisible();
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`details-${language}.png`),fullPage:true});
  await page.reload();await expect(details.locator('[data-project-details-form]')).toBeVisible({timeout:60000});
  await expect(details.getByLabel(en?'Project code (optional)':'Código del proyecto (opcional)',{exact:true})).toHaveValue('PIN-7');
  await expect(details.locator('[data-project-detail-tags]')).toContainText('Exterior');

  // ---- UI: hub shows code, type and tags and filters by tag.
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_projects`);
  const projects=page.locator('[data-projects-workspace]');await expect(projects).toBeVisible({timeout:60000});
  const mobile=(page.viewportSize()?.width??1366)<1024,entry=(id:string)=>projects.locator(mobile?`[data-project-card="${id}"]`:`[data-project-row="${id}"]`);
  await expect(entry('p-two')).toContainText('PIN-7');await expect(entry('p-two')).toContainText(en?'Repair':'Reparación');await expect(entry('p-one')).toContainText('Urgente');
  await projects.locator('[data-projects-tag]').selectOption({label:'Urgente'});await expect(entry('p-one')).toBeVisible();await expect(entry('p-two')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`hub-${language}.png`),fullPage:true});
  expect(runtime()).toEqual([]);
 }finally{await otherContext?.close();await cleanupDisposableAccount(owner);await cleanupDisposableAccount(other);}
});
