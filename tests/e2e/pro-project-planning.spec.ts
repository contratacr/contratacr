import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {workFixture,cleanupWorkFixture,acceptedDocument,checkedWork,newIntent,workEndpoint,type WorkFixture} from './private-estimate-work-fixture';
import {json,post,estimateInput,login} from './pro-private-estimate-publications-fixture';
import {publishState} from './private-estimate-commercial-list-fixture';
import {regressionAdminClient} from './seed';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import type {ProjectEstimatesPage} from '../../src/lib/pro/project-planning';

const origin='http://127.0.0.1:3185',api='/api/pro/project-planning';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function draft(context:BrowserContext,f:WorkFixture,query:Record<string,string>,title:string){
 const ctx=await json(context,{view:'context',...query}),input=estimateInput(ctx,{title,validUntil:'2030-12-31',currency:'CRC'}),response=await post(context,f.owner,input);
 expect(response.status()).toBe(200);return(await response.json()).estimate as {id:string;revision:number;totalCents:number};
}
/** Real stored links only: work source, accepted agreement on the job, plus customer-level documents. */
async function seed(context:BrowserContext,f:WorkFixture){
 const projectDraft=await draft(context,f,{sourceKind:'work',sourceId:f.workId},'Cotización del proyecto');
 const clientDraft=await draft(context,f,{clientId:f.clientId},'Borrador del cliente sin proyecto');
 const shared=await draft(context,f,{clientId:f.clientId},'Compartida con el cliente');
 await publishState(context,f,{input:{},estimate:shared} as never,'shared');
 const accepted=await acceptedDocument(context,f,{kind:'work',id:f.workId},{title:'Aceptada desde el proyecto',currency:'USD'});
 const otherWork=await draft(context,f,{sourceKind:'work',sourceId:f.completedId},'Cotización de otro proyecto');
 const otherClient=await draft(context,f,{clientId:f.secondClient},'Cotización de otro cliente');
 const archived=await draft(context,f,{clientId:f.clientId},'Cotización archivada');
 expect((await post(context,f.owner,{action:'archive',actionId:crypto.randomUUID(),estimateId:archived.id,revision:1})).status()).toBe(200);
 // A customer-level accepted estimate continued into this job becomes its agreement.
 const agreementDoc=await acceptedDocument(context,f,undefined,{title:'Acuerdo aceptado del cliente'});
 const candidates=await checkedWork(context,{view:'candidates',publicationId:agreementDoc.publication.publicationId});
 const selected=candidates.items.find((item:{work:{id:string}})=>item.work.id===f.workId);expect(selected).toBeDefined();
 const continued=await post(context,f.owner,{...newIntent(agreementDoc),target:{kind:'existing',workId:f.workId,fingerprint:selected.fingerprint}},workEndpoint);expect(continued.status()).toBe(200);
 return{projectDraft,clientDraft,shared,accepted:accepted.estimate as {id:string},otherWork,otherClient,archived,agreement:agreementDoc.estimate as {id:string}};
}
async function makePro(owner:DisposableAccount){const db=regressionAdminClient(),account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();}
const page_=async(context:BrowserContext,query:Record<string,string>)=>{const response=await context.request.get(api+'?'+new URLSearchParams(query));expect(response.status(),JSON.stringify(query)).toBe(200);return await response.json() as ProjectEstimatesPage;};

test('Project planning API: exact link criterion, statuses, pagination, validation, permissions and isolation',async({page,browser,baseURL})=>{
 test.setTimeout(300000);local(baseURL);await stabilizeLocalProRuntime(page.context(),origin);
 const context=page.context(),f=await workFixture(context,browser);let other:DisposableAccount|undefined,otherContext:BrowserContext|undefined;
 try{
  const s=await seed(context,f);
  const project=await page_(context,{workId:f.workId});
  expect(project.counts).toEqual({project:3,client:2});expect(project.scope).toBe('project');expect(project.clientId).toBe(f.clientId);
  expect(project.items.map(item=>item.id)).toEqual([s.agreement.id,s.accepted.id,s.projectDraft.id]);
  const byId=Object.fromEntries(project.items.map(item=>[item.id,item]));
  expect(byId[s.projectDraft.id]).toMatchObject({relation:'project',status:'draft',publicationStatus:null,currency:'CRC',totalCents:s.projectDraft.totalCents,sourceKind:'work',agreement:false});
  expect(byId[s.accepted.id]).toMatchObject({status:'accepted',publicationStatus:'accepted',currency:'USD',sourceKind:'work',agreement:false});
  expect(byId[s.agreement.id]).toMatchObject({status:'accepted',sourceKind:null,agreement:true});
  const client=await page_(context,{workId:f.workId,scope:'client'});
  expect(client.items.map(item=>item.id)).toEqual([s.shared.id,s.clientDraft.id]);
  expect(client.items[0]).toMatchObject({relation:'client',status:'sent',publicationStatus:'shared'});expect(client.items[1]).toMatchObject({status:'draft'});
  const shown=[...project.items,...client.items].map(item=>item.id);for(const hidden of [s.otherWork.id,s.otherClient.id,s.archived.id])expect(shown).not.toContain(hidden);
  // The other job of the same customer: only its own source estimate, same customer-level list.
  const completed=await page_(context,{workId:f.completedId});expect(completed.items.map(item=>item.id)).toEqual([s.otherWork.id]);
  expect((await page_(context,{workId:f.completedId,scope:'client'})).items.map(item=>item.id)).toEqual([s.shared.id,s.clientDraft.id]);
  // Pagination 20 + rest without duplicates.
  for(let i=0;i<20;i++)await draft(context,f,{clientId:f.clientId},'Lote '+String(i).padStart(2,'0'));
  const first=await page_(context,{workId:f.workId,scope:'client'});expect(first.items).toHaveLength(20);expect(first.counts.client).toBe(22);expect(first.nextCursor).not.toBeNull();
  const rest=await page_(context,{workId:f.workId,scope:'client',after:first.nextCursor!});expect(rest.items).toHaveLength(2);expect(rest.nextCursor).toBeNull();
  expect(new Set([...first.items,...rest.items].map(item=>item.id)).size).toBe(22);
  // Read-only and repeatable: identical answers, no rows written.
  const estimatesBefore=(await f.db.from('pro_private_estimates').select('*').eq('owner_id',f.owner.id).order('id').throwOnError()).data;
  expect(await page_(context,{workId:f.workId})).toEqual(await page_(context,{workId:f.workId}));
  expect((await f.db.from('pro_private_estimates').select('*').eq('owner_id',f.owner.id).order('id').throwOnError()).data).toEqual(estimatesBefore);
  // Validation 400, missing 404, stale cursor 409, actor mismatch 403.
  for(const bad of ['','scope=other&workId=x','workId=x&after=nope','workId=x&extra=1','workId=x&workId=y','workId='+'x'.repeat(161)])expect((await context.request.get(api+'?'+bad)).status(),bad).toBe(400);
  expect((await context.request.get(api+'?'+new URLSearchParams({workId:'no-existe'}))).status()).toBe(404);
  expect((await context.request.get(api+'?'+new URLSearchParams({workId:f.workId,after:crypto.randomUUID()}))).status()).toBe(409);
  expect((await context.request.get(api+'?'+new URLSearchParams({workId:f.workId,scope:'client',after:project.items[0].id}))).status()).toBe(409);
  expect((await context.request.get(api+'?'+new URLSearchParams({workId:f.workId}),{headers:{'X-Pro-Expected-Actor':crypto.randomUUID()}})).status()).toBe(403);
  // A customer account without Pro is refused; another Pro account cannot see this job.
  expect((await f.recipientContext.request.get(origin+api+'?'+new URLSearchParams({workId:f.workId}))).status()).toBe(403);
  other=await createDisposableAccount({prefix:'planning-other'});await makePro(other);otherContext=await browser.newContext({baseURL});await stabilizeLocalProRuntime(otherContext,origin);await login(otherContext,other);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await otherContext.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  expect((await otherContext.request.get(origin+api+'?'+new URLSearchParams({workId:f.workId}))).status()).toBe(404);
 }finally{await otherContext?.close();if(other)await cleanupDisposableAccount(other);await cleanupWorkFixture(f);}
});

/** One explicit recovery click only for the product's temporary Pro access verification error (same as the estimates journey). */
async function ready(page:Page,target:ReturnType<Page['locator']>,en:boolean){
 const temporary=page.locator('main').getByRole('alert').filter({hasText:en?/^Could not verify Pro access\. Your data is preserved\.$/:/^No se pudo comprobar el acceso a Pro\. Sus datos se conservan\.$/});
 await expect.poll(async()=>await target.isVisible().catch(()=>false)||await temporary.isVisible(),{timeout:60000}).toBe(true);
 if(await temporary.isVisible())await page.locator('main').getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
 await expect(target).toBeVisible({timeout:60000});
}
/* Closing round: since Round 9 the job is its own page (/dashboard/pro/trabajo/<id>[/<section>]) with its own Back
 * (data-native-back="page"); the section lives in the path, the legacy query form (vistaTrabajo) is still accepted. */
async function back(page:Page){await page.locator('[data-native-back="page"],[data-native-back="modal"]').last().click();}
function jobView(page:Page){const url=new URL(page.url());return url.searchParams.get('vistaTrabajo')??(url.pathname.split('/trabajo/')[1]?.split('/')[1]||null);}
function onJobPage(page:Page){const url=new URL(page.url());return url.searchParams.get('tab')==='pro_agenda'||url.pathname.includes('/dashboard/pro/trabajo/');}
for(const language of ['es','en'] as const)test(`Project planning UI: create project with conflict and lost answer, planning quotes, new quote for the project and return to Projects [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(360000);local(baseURL);const en=language==='en';await stabilizeLocalProRuntime(page.context(),origin);
 const context=page.context(),f=await workFixture(context,browser);
 try{
  const s=await seed(context,f),runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const mobile=(page.viewportSize()?.width??1366)<1024;
  // 1. Seeded project: Planning group first after Overview, with linked and customer estimates.
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_projects`);
  const hub=page.locator('[data-projects-workspace]');await ready(page,hub,en);
  const entry=(id:string)=>hub.locator(mobile?`[data-project-card="${id}"]`:`[data-project-row="${id}"]`);
  await expect(entry(f.workId)).toBeVisible({timeout:60000});
  await (mobile?entry(f.workId).getByRole('button',{name:/^(Abrir proyecto|Open project):/}):entry(f.workId).getByRole('button',{name:'Trabajo existente sin programar',exact:true})).click();
  await expect.poll(()=>(new URL(page.url()).searchParams.get('cita')??(decodeURIComponent(new URL(page.url()).pathname.split('/trabajo/')[1]?.split('/')[0]??'')||null))).toBe(f.workId);expect(new URL(page.url()).searchParams.get('volverProyectos')).toContain('tab=pro_projects');
  const nav=page.getByRole('navigation',{name:en?'Job workspace':'Gestión del trabajo'});await expect(nav).toBeVisible({timeout:60000});
  await expect(nav.locator('[data-job-workspace-group]')).toHaveCount(4);
  await expect(nav.locator('[data-job-workspace-group]').nth(1)).toHaveAttribute('data-job-workspace-group',en?'Planning':'Planificación');
  await nav.getByRole('button',{name:en?'Quotes':'Cotizaciones',exact:true}).click();
  const planning=page.locator('[data-project-estimates]');await expect(planning).toBeVisible();
  const projectList=planning.locator('[data-project-estimates-scope="project"]'),clientList=planning.locator('[data-project-estimates-scope="client"]');
  await expect(projectList.locator('[data-project-estimate]')).toHaveCount(3);await expect(clientList.locator('[data-project-estimate]')).toHaveCount(2);
  await expect(projectList).toContainText(en?'For this project (3)':'De este proyecto (3)');
  await expect(clientList).toContainText(en?'Customer quotes without a project (2)':'Del cliente, sin proyecto asignado (2)');
  await expect(projectList.locator(`[data-project-estimate="${s.accepted.id}"]`)).toContainText(en?'Accepted':'Aceptada');
  await expect(projectList.locator(`[data-project-estimate="${s.agreement.id}"]`)).toContainText(en?'Agreement for this project':'Acuerdo de este proyecto');
  await expect(projectList.locator(`[data-project-estimate="${s.projectDraft.id}"]`)).toContainText(en?'Draft':'Borrador');
  await expect(clientList.locator(`[data-project-estimate="${s.shared.id}"]`)).toContainText(en?'Shared':'Compartida');
  await expect(projectList.locator(`[data-project-estimate="${s.accepted.id}"] [data-project-estimate-total]`)).toHaveAttribute('data-currency','USD');
  await expect(planning).not.toContainText('Cotización de otro proyecto');await expect(planning).not.toContainText('Cotización de otro cliente');await expect(planning).not.toContainText('Cotización archivada');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`planning-seeded-${language}.png`),fullPage:true});
  await clientList.locator('[data-project-estimate]').last().scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`planning-list-${language}.png`)});
  // Open an existing estimate and come back to the planning view.
  await projectList.locator(`[data-project-estimate="${s.projectDraft.id}"]`).getByRole('button').click();
  await expect.poll(()=>new URL(page.url()).searchParams.get('estimacionPrivada')).toBe(s.projectDraft.id);
  const editor=page.locator('[data-private-estimate-editor]'),form=editor.locator('[data-private-estimate-form]');
  await expect(form.getByLabel(en?'Service or title':'Servicio o título',{exact:true})).toHaveValue('Cotización del proyecto',{timeout:45000});
  await page.locator('[data-private-estimate-actions]').getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();
  await expect.poll(()=>jobView(page),{timeout:45000}).toBe('estimates');await expect(planning).toBeVisible();
  // Back: first to the overview, then to Projects.
  for(let i=0;i<3&&new URL(page.url()).searchParams.get('tab')!=='pro_projects';i++){await back(page);await page.waitForTimeout(400);}
  await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('pro_projects');await expect(hub).toBeVisible();

  // 2. Create project: validation, 409 conflict, lost answer, retry without duplicates.
  await hub.locator('[data-project-create-open]').click();
  const dialog=page.getByRole('dialog',{name:en?'Create project':'Crear proyecto'});await expect(dialog).toBeVisible();
  await dialog.locator('[data-project-create-submit]').click();await expect(dialog.locator('[data-project-create-error]')).toContainText(en?'Choose a customer.':'Seleccione un cliente.');
  await page.getByLabel(en?'Search saved customers':'Buscar clientes guardados',{exact:true}).fill('Cliente privado sin cuenta');
  await dialog.getByRole('combobox',{name:en?'Customer':'Cliente',exact:true}).selectOption(f.clientId);
  const name=en?'Terrace remodel':'Remodelación de terraza';
  await dialog.getByLabel(en?'Project or service name':'Nombre del proyecto o servicio',{exact:true}).fill(name);
  await dialog.getByLabel(en?'Start (optional) · Costa Rica time':'Inicio (opcional) · hora de Costa Rica',{exact:true}).fill('2030-03-04T09:00');
  await dialog.locator('[data-project-create-submit]').click();await expect(dialog.locator('[data-project-create-error]')).toContainText(en?'Enter both the start and end':'Indique el inicio y el final');
  await dialog.getByLabel(en?'Start (optional) · Costa Rica time':'Inicio (opcional) · hora de Costa Rica',{exact:true}).fill('');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`create-project-${language}.png`),fullPage:true});
  let patches=0;
  await page.route('**/api/pro/agenda',async route=>{if(route.request().method()!=='PATCH'){await route.continue();return;}patches++;
   if(patches===1){await route.fulfill({status:409,json:{error:'Los datos cambiaron. Recargue antes de guardar.'}});return;}
   if(patches===2){const real=await route.fetch();expect(real.status()).toBe(200);await route.fulfill({status:503,json:{error:'LOCAL_ACK_LOST'}});return;}
   await route.continue();});
  await dialog.locator('[data-project-create-submit]').click();
  await expect(dialog.locator('[data-project-create-error]')).toContainText(en?'Your Pro data changed while saving':'Sus datos de Pro cambiaron mientras guardaba');
  await dialog.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
  await expect(dialog.locator('[data-project-create-error]')).toContainText(en?'Could not confirm whether the project was created':'No se pudo confirmar si el proyecto se creó');
  await dialog.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
  await expect.poll(()=>onJobPage(page),{timeout:45000}).toBe(true);
  const created=(new URL(page.url()).searchParams.get('cita')??(decodeURIComponent(new URL(page.url()).pathname.split('/trabajo/')[1]?.split('/')[0]??'')||null))!;expect(created).toMatch(/^[0-9a-f-]{36}$/);expect(patches).toBe(2);
  const rows=(await f.db.from('pro_work').select('id,service,stage,start,end,clientId,cancelled').eq('user_id',f.owner.id).eq('service',name).throwOnError()).data;
  expect(rows).toEqual([{id:created,service:name,stage:'new',start:'',end:'',clientId:f.clientId,cancelled:false}]);
  await page.unroute('**/api/pro/agenda');
  await expect(nav).toBeVisible({timeout:60000});await expect(page.locator('[data-work-period]')).toHaveText(en?'Not scheduled':'Sin programar');

  // 3. Planning of the new project: error + retry, empty state, then a new estimate prefilled with customer and project.
  let failed=false;await page.route('**/api/pro/project-planning**',async route=>{if(!failed&&new URL(route.request().url()).searchParams.get('scope')==='project'){failed=true;await route.fulfill({status:503,json:{error:'LOCAL_PLANNING_OFFLINE'}});return;}await route.continue();});
  await nav.getByRole('button',{name:en?'Quotes':'Cotizaciones',exact:true}).click();
  await expect(projectList.getByRole('alert')).toContainText(en?'Could not load the quotes.':'No se pudieron cargar las cotizaciones.');
  await projectList.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
  await expect(projectList.locator('[data-project-estimates-empty]')).toHaveText(en?'This project has no quotes yet. Create one to price the work.':'Este proyecto aún no tiene cotizaciones. Cree una para presupuestar el trabajo.');
  await expect(clientList.locator('[data-project-estimate]')).toHaveCount(2);
  await page.unroute('**/api/pro/project-planning**');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`planning-empty-${language}.png`),fullPage:true});
  await planning.getByRole('button',{name:en?'New quote for this project':'Nueva cotización para este proyecto',exact:true}).click();
  await expect.poll(()=>new URL(page.url()).searchParams.get('nuevaEstimacion'),{timeout:45000}).toMatch(/^[0-9a-f-]{36}$/);
  const estimateId=new URL(page.url()).searchParams.get('nuevaEstimacion')!;
  expect(new URL(page.url()).searchParams.get('origenEstimacion')).toBe('work');expect(new URL(page.url()).searchParams.get('idOrigenEstimacion')).toBe(created);
  await expect(form.getByLabel(en?'Service or title':'Servicio o título',{exact:true})).toHaveValue(name,{timeout:45000});
  await expect(form.getByRole('combobox',{name:en?'Customer':'Cliente',exact:true})).toHaveValue(f.clientId);await expect(form.getByRole('combobox',{name:en?'Customer':'Cliente',exact:true})).toBeDisabled();
  const line=form.locator('[data-private-estimate-line]').first();await line.getByLabel(en?'Description':'Descripción',{exact:true}).fill(en?'Deck boards':'Tablas de terraza');await line.getByLabel(en?'Unit price':'Precio unitario',{exact:true}).fill('150000');
  await page.locator('[data-private-estimate-actions]').getByRole('button',{name:en?'Save draft':'Guardar borrador',exact:true}).click();
  await expect(editor).toHaveCount(0,{timeout:45000});
  await expect.poll(()=>jobView(page),{timeout:45000}).toBe('estimates');expect((new URL(page.url()).searchParams.get('cita')??(decodeURIComponent(new URL(page.url()).pathname.split('/trabajo/')[1]?.split('/')[0]??'')||null))).toBe(created);
  const fresh=projectList.locator(`[data-project-estimate="${estimateId}"]`);await expect(fresh).toBeVisible({timeout:45000});await expect(fresh).toContainText(en?'Draft':'Borrador');
  await expect(fresh.locator('[data-project-estimate-total]')).toHaveText((en?'₡169,500':'₡169.500'));
  const stored=(await f.db.from('pro_private_estimates').select('client_id,source,title').eq('owner_id',f.owner.id).eq('id',estimateId).single().throwOnError()).data!;
  expect(stored).toMatchObject({client_id:f.clientId,title:name,source:{kind:'work',id:created}});
  // Reload keeps the view and the persisted estimate; Back returns to Projects through the stored origin.
  page.once('dialog',dialog=>void dialog.accept());await page.reload();
  await ready(page,projectList.locator(`[data-project-estimate="${estimateId}"]`),en);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`planning-created-${language}.png`),fullPage:true});
  for(let i=0;i<3&&new URL(page.url()).searchParams.get('tab')!=='pro_projects';i++){await back(page);await page.waitForTimeout(400);}
  await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('pro_projects');await expect(hub).toBeVisible();await expect(entry(created)).toBeVisible();
  expect(runtime).toEqual([]);
 }finally{await page.goto('about:blank').catch(()=>{});await cleanupWorkFixture(f);}
});
