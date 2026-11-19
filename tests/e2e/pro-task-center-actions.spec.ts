import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {createWorkTaskWrite,workTaskWriteKey} from '../../src/lib/pro/work-task-recovery';
import {workTaskSchema,type WorkTask} from '../../src/lib/pro/work-tasks';
const origin='http://127.0.0.1:3185',api='/api/pro/work-tasks';
function assertLocal(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'pro-task-actions'}),db=regressionAdminClient();
 try{
  const account=await db.auth.admin.getUserById(owner.id);
  expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();
  await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Tareas locales',slug:'tasks-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  const document=emptyBusiness(),workId=crypto.randomUUID(),otherWorkId=crypto.randomUUID(),day=crTodayISO(),clientId='tasks-local-customer';
  document.clients=[{id:clientId,name:'Cliente local tareas',email:'',phone:'',notes:'No modificar',archived:false}];
  document.work=[workId,otherWorkId].map((id,index)=>({id,clientId,client:'Cliente local tareas',service:index?'Segundo trabajo local':'Trabajo local tareas',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T11:00:00-06:00',cancelled:false}));
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:origin,sameSite:'Lax' as const})))}});
  const signed=await auth.auth.signInWithPassword({email:owner.email,password:owner.password});expect(signed.error).toBeNull();expect(signed.data.session).not.toBeNull();
  // Compile/warm the real local auth/access handlers before the UI's bounded
  // access probe starts. This setup budget does not alter product timeouts.
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  for(const id of [workId,otherWorkId])expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({clientId,workId:id}),{timeout:45000})).status()).toBe(200);
  return {owner,workId,otherWorkId,db,token:signed.data.session!.access_token};
 }catch(error){await cleanupDisposableAccount(owner);throw error;}
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function seed(f:Fixture){
 await f.db.from('pro_work').update({service:('Revisión eléctrica – mantenimiento de instalación y protección '.repeat(3)).slice(0,160),client:('José Muñoz y María Núñez – cliente local '.repeat(4)).slice(0,160)}).eq('user_id',f.owner.id).eq('id',f.workId).throwOnError();
 await f.db.from('pro_work').update({service:('Segundo servicio – revisión de conexiones y continuidad '.repeat(3)).slice(0,160)}).eq('user_id',f.owner.id).eq('id',f.otherWorkId).throwOnError();
 const rows=Array.from({length:35},(_,index)=>({owner_id:f.owner.id,work_id:index%2?f.otherWorkId:f.workId,id:crypto.randomUUID(),title:`PDF ${String(index).padStart(2,'0')} – Revisión eléctrica, conexión y protección ${'del servicio '.repeat(5)}`.slice(0,160),details:'PRIVATE_NOTE_NOT_FOR_PDF',assignee:'José Muñoz – Técnica responsable de revisión y mantenimiento',due_date:crTodayISO(),status:'open',archived:false,revision:1}));
 rows.push({owner_id:f.owner.id,work_id:f.workId,id:crypto.randomUUID(),title:'ACTION_TARGET_LOCAL',details:'PRIVATE_ACTION_DETAILS',assignee:'María local',due_date:'2020-01-01',status:'open',archived:false,revision:1});
 await f.db.from('pro_work_tasks').insert(rows).throwOnError();
 return {rows,target:rows.at(-1)!};
}
async function task(page:Page,f:Fixture,id:string){const response=await page.request.get(api+'?'+new URLSearchParams({workId:f.workId,taskId:id}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(response.status()).toBe(200);return await response.json() as {task:WorkTask;history:{actionId:string;action:string}[]};}
async function preserved(f:Fixture){const result:Record<string,unknown>={};
 for(const table of ['pro_workspaces','pro_work','pro_clients','pro_client_entries'])result[table]=(await f.db.from(table).select('*').eq('user_id',f.owner.id).order(table==='pro_workspaces'?'user_id':'id').throwOnError()).data;
 for(const table of ['pro_work_delivery_drafts','pro_work_delivery_versions','pro_work_delivery_photos','pro_work_updates','pro_work_update_versions','pro_work_files'])result[table]=(await f.db.from(table).select('*').eq('owner_id',f.owner.id).throwOnError()).data;
 for(const table of ['notifications','notification_push_outbox'])result[table]=(await f.db.from(table).select('*').eq('user_id',f.owner.id).order('id').throwOnError()).data;
 return result;
}

for(const language of ['es','en'] as const)test(`Task center direct actions: exact recovery, preserved editor and selected Unicode PDF [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(240000);// Dev-server isolation (triage C): HMR reloads and cold compiles hung the first requests.
 await stabilizeLocalProRuntime(page.context(),baseURL!);await warmLocalRoutes(page,['/api/pro/task-center','/api/pro/work-tasks','/'+language+'/dashboard/pro?tab=pro_tasks']);
 assertLocal(baseURL);const en=language==='en',f=await fixture(page.context());
 try{
  const data=await seed(f),before=await preserved(f),original=await task(page,f,data.target.id),bodies:string[]=[],runtime:string[]=[],unexpected:string[]=[],exportWrites:string[]=[];let exporting=false,lose=false,resolveLost:()=>void=()=>{};
  const lost=new Promise<void>(resolve=>{resolveLost=resolve;});onAppPageError(page,message=>runtime.push(message));
  page.on('request',request=>{const url=new URL(request.url());if(exporting&&!(url.protocol==='blob:'&&url.origin===origin)&&!['127.0.0.1','localhost'].includes(url.hostname))unexpected.push(url.origin);if(exporting&&!['GET','HEAD'].includes(request.method()))exportWrites.push(request.method()+' '+url.pathname);});
  await page.route('**/api/pro/work-tasks**',async route=>{if(route.request().method()==='POST'){bodies.push(route.request().postData()!);if(lose){lose=false;const response=await route.fetch();expect(response.status()).toBe(200);await route.fulfill({status:503,json:{error:'LOCAL_LOST_AFTER_COMMIT'}});resolveLost();return;}}await route.continue();});
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_tasks`);const center=page.locator('[data-task-center]'),search=center.getByLabel(en?'Search tasks':'Buscar tareas',{exact:true}),row=()=>center.locator(`[data-task-center-item="${data.target.id}"]:visible`);
  await expect(center).toBeVisible({timeout:45000});await search.fill('ACTION_TARGET_LOCAL');await expect(row()).toBeVisible();
  const complete=()=>row().getByRole('button',{name:en?'Complete':'Completar',exact:true});
  // A retained editor draft and either journal are never silently overwritten
  // by a status shortcut from a different screen.
  const draftKey='ccr:pro:work-task-draft:v1:'+f.owner.id+':'+encodeURIComponent(f.workId),draft='LOCAL_EXISTING_EDITOR_DRAFT';
  await page.evaluate(({key,value})=>sessionStorage.setItem(key,value),{key:draftKey,value:draft});await complete().click();await expect(center.getByRole('alert')).toBeVisible();expect(bodies).toEqual([]);expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(draft);await page.evaluate(key=>sessionStorage.removeItem(key),draftKey);
  const journal=createWorkTaskWrite(f.owner.id,{action:'complete',workId:f.workId,taskId:data.target.id,actionId:crypto.randomUUID(),revision:1},original.task),journalKey=workTaskWriteKey(f.owner.id,f.workId);
  for(const area of ['localStorage','sessionStorage'] as const){await page.evaluate(({area,key,value})=>window[area].setItem(key,value),{area,key:journalKey,value:JSON.stringify(journal)});await complete().click();await expect(center.getByRole('alert')).toBeVisible();expect(bodies).toEqual([]);expect(await page.evaluate(({area,key})=>window[area].getItem(key),{area,key:journalKey})).toBe(JSON.stringify(journal));await page.evaluate(({area,key})=>window[area].removeItem(key),{area,key:journalKey});}
  lose=true;await complete().click();await lost;const recovery=center.locator('[data-task-center-recovery]');await expect(recovery).toBeVisible();expect(bodies).toHaveLength(1);const exact=bodies[0];
  let stored=await task(page,f,data.target.id);expect(stored.task).toMatchObject({status:'done',revision:2,title:'ACTION_TARGET_LOCAL'});expect(stored.history).toHaveLength(1);
  await expect(search).toBeDisabled();await page.reload();await expect(recovery).toBeVisible({timeout:45000});expect(bodies).toEqual([exact]);
  const globalKey='ccr:pro:task-center-write:v1:'+f.owner.id,retainedGlobal=await page.evaluate(key=>localStorage.getItem(key),globalKey);expect(retainedGlobal).not.toBeNull();
  const editorDraft=JSON.stringify({task:workTaskSchema.parse(stored.task),values:{title:'EDITOR_DRAFT_AFTER_UNCERTAIN',dueDate:stored.task.dueDate??'',assignee:stored.task.assignee,details:stored.task.details}});await page.evaluate(({key,value})=>sessionStorage.setItem(key,value),{key:draftKey,value:editorDraft});
  await recovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true}).click();await expect(center.getByRole('alert')).toBeVisible();expect(bodies).toEqual([exact]);
  await recovery.getByRole('button',{name:en?'Open original job':'Abrir trabajo original',exact:true}).click();const editor=page.locator('[data-work-task-form]');await expect(editor.getByLabel(en?'Task':'Tarea',{exact:true})).toHaveValue('EDITOR_DRAFT_AFTER_UNCERTAIN',{timeout:45000});await expect(page).toHaveURL(new RegExp('(?:cita=|/trabajo/)'+f.workId));
  expect(await page.evaluate(key=>localStorage.getItem(key),globalKey)).toBe(retainedGlobal);expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(editorDraft);expect(bodies).toEqual([exact]);
  await editor.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();const confirmation=page.getByRole('dialog').last();await confirmation.getByRole('button',{name:en?'Keep editing':'Seguir editando',exact:true}).click();await expect(editor).toBeVisible();expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(editorDraft);
  await editor.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();await confirmation.getByRole('button',{name:en?'Discard changes':'Descartar cambios',exact:true}).click();await expect(editor).toHaveCount(0);expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBeNull();
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_tasks&taskSearch=ACTION_TARGET_LOCAL`);await expect(recovery).toBeVisible({timeout:45000});expect(bodies).toEqual([exact]);expect(await page.evaluate(key=>localStorage.getItem(key),globalKey)).toBe(retainedGlobal);
  await recovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true}).click();await expect(recovery).toHaveCount(0);expect(bodies).toEqual([exact,exact]);stored=await task(page,f,data.target.id);expect(stored.task.revision).toBe(2);expect(stored.history).toHaveLength(1);expect(stored.history[0].actionId).toBe(JSON.parse(exact).actionId);
  await center.getByRole('button',{name:en?'Completed':'Completadas',exact:true}).click();await expect(row()).toBeVisible();await row().getByRole('button',{name:en?'Reopen':'Reabrir',exact:true}).click();await expect(row()).toHaveCount(0);stored=await task(page,f,data.target.id);expect(stored.task).toMatchObject({status:'open',revision:3});expect(stored.history.map(item=>item.action)).toEqual(['reopen','complete']);
  await center.getByRole('button',{name:en?'Pending':'Pendientes',exact:true}).click();await expect(row()).toBeVisible();
  const external={action:'update',workId:f.workId,taskId:data.target.id,actionId:crypto.randomUUID(),revision:3,title:'ACTION_TARGET_UPDATED_EXTERNALLY',details:stored.task.details,dueDate:stored.task.dueDate,assignee:stored.task.assignee};const updated=await page.request.post(api,{headers:{Origin:origin,'X-Pro-Expected-Actor':f.owner.id},data:external});expect(updated.status()).toBe(200);
  await complete().click();await expect(center.getByRole('alert')).toBeVisible();stored=await task(page,f,data.target.id);expect(stored.task).toMatchObject({status:'open',revision:4,title:external.title});expect(stored.history).toHaveLength(3);expect(stored.history.filter(item=>item.action==='complete')).toHaveLength(1);
  await page.reload();await expect(center).toBeVisible({timeout:45000});await search.fill('PDF ');await expect(center.locator('[data-task-center-item]:visible')).toHaveCount(20);
  const select=(id:string)=>center.locator(`[data-task-center-item="${id}"]:visible`).getByRole('checkbox');
  const firstId=await center.locator('[data-task-center-item]:visible').first().getAttribute('data-task-center-item');await select(firstId!).check();const exportButton=center.getByRole('button',{name:en?'Export PDF':'Exportar PDF',exact:true});await expect(exportButton).toBeEnabled();
  await search.fill('ACTION_TARGET_');await expect(center.locator('[data-task-center-item]:visible')).toHaveCount(1);await expect(exportButton).toHaveCount(0);
  await search.fill('PDF ');await expect(center.locator('[data-task-center-item]:visible')).toHaveCount(20);await center.getByRole('button',{name:en?'Show more tasks':'Ver más tareas',exact:true}).click();await expect(center.locator('[data-task-center-item]:visible')).toHaveCount(35);
  for(const checkbox of await center.locator('[data-task-center-item]:visible').getByRole('checkbox').all())await checkbox.check();
  await exportButton.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('task-center-selected-'+language+'.png'),fullPage:false});
  exporting=true;const writesBeforeExport=bodies.length,downloadPromise=page.waitForEvent('download');await exportButton.click();const download=await downloadPromise;expect(download.suggestedFilename()).toMatch(/\.pdf$/i);const pdfPath=info.outputPath('task-center-selected-'+language+'.pdf');await download.saveAs(pdfPath);const stream=await download.createReadStream();expect(stream).not.toBeNull();const parts:Buffer[]=[];for await(const part of stream!)parts.push(Buffer.from(part));const bytes=Buffer.concat(parts);expect(bytes.subarray(0,5).toString()).toBe('%PDF-');expect(bytes.length).toBeGreaterThan(1000);expect([...bytes.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length).toBeGreaterThan(1);expect(bodies).toHaveLength(writesBeforeExport);
  expect((await f.db.from('pro_work_tasks').select('*').eq('owner_id',f.owner.id).neq('id',data.target.id).order('id').throwOnError()).data).toEqual(data.rows.filter(item=>item.id!==data.target.id).sort((a,b)=>a.id.localeCompare(b.id)).map(item=>expect.objectContaining(item)));
  expect(await preserved(f)).toEqual(before);await expectNoHorizontalOverflow(page);expect(runtime).toEqual([]);expect(unexpected).toEqual([]);expect(exportWrites).toEqual([]);
 }finally{await page.goto('about:blank').catch(()=>{});await cleanupDisposableAccount(f.owner);}
});
