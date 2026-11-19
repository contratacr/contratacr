import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
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
async function task(page:Page,f:Fixture,id:string){const response=await page.request.get(api+'?'+new URLSearchParams({workId:f.workId,taskId:id}),{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(response.status()).toBe(200);return await response.json() as {task:WorkTask;history:{actionId:string;action:string}[]};}
async function preserved(f:Fixture){const result:Record<string,unknown>={};
 for(const table of ['pro_workspaces','pro_work','pro_clients','pro_client_entries'])result[table]=(await f.db.from(table).select('*').eq('user_id',f.owner.id).order(table==='pro_workspaces'?'user_id':'id').throwOnError()).data;
 for(const table of ['pro_work_delivery_drafts','pro_work_delivery_versions','pro_work_delivery_photos','pro_work_updates','pro_work_update_versions','pro_work_files'])result[table]=(await f.db.from(table).select('*').eq('owner_id',f.owner.id).throwOnError()).data;
 for(const table of ['notifications','notification_push_outbox'])result[table]=(await f.db.from(table).select('*').eq('user_id',f.owner.id).order('id').throwOnError()).data;
 return result;
}

async function applyBatch(page:Page,en:boolean,reopen=false){const name=reopen?(en?'Reopen selected':'Reabrir seleccionadas'):(en?'Complete selected':'Completar seleccionadas');await page.locator('[data-task-center]').getByRole('button',{name,exact:true}).click();const dialog=page.getByRole('dialog').last();await expect(dialog).toBeVisible();await dialog.getByRole('button',{name,exact:true}).click();}
for(const language of ['es','en'] as const)test(`Task batch: exact resume, reopen and conflict stop [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(180000);assertLocal(baseURL);const en=language==='en',f=await fixture(page.context());
 try{
  const rows=Array.from({length:3},(_,i)=>({owner_id:f.owner.id,work_id:f.workId,id:crypto.randomUUID(),title:'BATCH_LOCAL_'+i,details:'PRESERVE_PRIVATE_DETAILS',assignee:'José local',due_date:crTodayISO(),status:'open',archived:false,revision:1})).sort((a,b)=>a.id.localeCompare(b.id));
  await f.db.from('pro_work_tasks').insert(rows).throwOnError();const before=await preserved(f),posts:string[]=[],runtime:string[]=[];let lose=true,resolveLost:()=>void=()=>{};const lost=new Promise<void>(resolve=>{resolveLost=resolve;});onAppPageError(page,message=>runtime.push(message));
  await page.route('**/api/pro/work-tasks**',async route=>{if(route.request().method()==='POST'){posts.push(route.request().postData()!);if(lose){lose=false;const response=await route.fetch();expect(response.status()).toBe(200);await route.fulfill({status:503,json:{error:'LOCAL_LOST_AFTER_COMMIT'}});resolveLost();return;}}await route.continue();});
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_tasks`);const center=page.locator('[data-task-center]'),batch=center.locator('[data-task-center-batch]'),visible=center.locator('[data-task-center-item]:visible');await expect(center).toBeVisible({timeout:45000});await expect(visible).toHaveCount(3);
  for(const checkbox of await visible.getByRole('checkbox').all())await checkbox.check();
  await center.getByRole('button',{name:en?'Complete selected':'Completar seleccionadas',exact:true}).click();const confirm=page.getByRole('dialog').last();await expect(confirm).toBeVisible();await confirm.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();expect(posts).toEqual([]);expect(await page.evaluate(actor=>localStorage.getItem('ccr:pro:task-center-batch:v1:'+actor),f.owner.id)).toBeNull();
  await applyBatch(page,en);await lost;await expect(batch).toBeVisible();expect(posts).toHaveLength(1);const exact=posts[0];expect(JSON.parse(exact).taskId).toBe(rows[0].id);expect((await task(page,f,rows[0].id)).task).toMatchObject({status:'done',revision:2});expect((await task(page,f,rows[1].id)).task.revision).toBe(1);
  await page.reload();await expect(batch).toBeVisible({timeout:45000});expect(posts).toEqual([exact]);await batch.getByRole('button',{name:en?'Continue batch':'Continuar lista',exact:true}).click();
  await expect(batch.getByRole('button',{name:en?'Close summary':'Cerrar resumen',exact:true})).toBeVisible();expect(posts).toHaveLength(4);expect(posts[1]).toBe(exact);
  for(const row of rows){const result=await task(page,f,row.id);expect(result.task).toMatchObject({status:'done',revision:2,title:row.title,details:row.details});expect(result.history).toHaveLength(1);}
  await page.screenshot({path:info.outputPath('task-batch-summary-'+language+'.png'),fullPage:false});await batch.getByRole('button',{name:en?'Close summary':'Cerrar resumen',exact:true}).click();await expect(batch).toHaveCount(0);
  await center.getByRole('button',{name:en?'Completed':'Completadas',exact:true}).click();await expect(visible).toHaveCount(3);for(const checkbox of await visible.getByRole('checkbox').all())await checkbox.check();await applyBatch(page,en,true);await expect(batch.getByRole('button',{name:en?'Close summary':'Cerrar resumen',exact:true})).toBeVisible();await batch.getByRole('button',{name:en?'Close summary':'Cerrar resumen',exact:true}).click();
  for(const row of rows){const result=await task(page,f,row.id);expect(result.task).toMatchObject({status:'open',revision:3});expect(result.history).toHaveLength(2);}
  await center.getByRole('button',{name:en?'Pending':'Pendientes',exact:true}).click();await expect(visible).toHaveCount(3);for(const checkbox of await visible.getByRole('checkbox').all())await checkbox.check();
  const original=(await task(page,f,rows[1].id)).task;expect((await page.request.post(api,{headers:{Origin:origin,'X-Pro-Expected-Actor':f.owner.id},data:{action:'update',workId:f.workId,taskId:rows[1].id,actionId:crypto.randomUUID(),revision:3,title:'BATCH_EXTERNAL_CHANGE',details:original.details,dueDate:original.dueDate,assignee:original.assignee}})).status()).toBe(200);
  const prior=posts.length;await applyBatch(page,en);await expect(batch.getByRole('button',{name:en?'Close summary':'Cerrar resumen',exact:true})).toBeVisible();expect(posts).toHaveLength(prior+2);expect((await task(page,f,rows[0].id)).task).toMatchObject({status:'done',revision:4});expect((await task(page,f,rows[1].id)).task).toMatchObject({status:'open',revision:4,title:'BATCH_EXTERNAL_CHANGE'});expect((await task(page,f,rows[2].id)).task).toMatchObject({status:'open',revision:3});
  await page.reload();await expect(batch.getByRole('button',{name:en?'Close summary':'Cerrar resumen',exact:true})).toBeVisible({timeout:45000});expect(posts).toHaveLength(prior+2);await batch.getByRole('button',{name:en?'Close summary':'Cerrar resumen',exact:true}).click();await expect(batch).toHaveCount(0);
  expect(await preserved(f)).toEqual(before);expect(runtime).toEqual([]);await expectNoHorizontalOverflow(page);
 }finally{await page.goto('about:blank').catch(()=>{});await cleanupDisposableAccount(f.owner);}
});

for(const language of ['es','en'] as const)test(`Task batch original editor: blocked draft and preserved recovery [${language}]`,async({page,baseURL})=>{
 test.setTimeout(120000);assertLocal(baseURL);const en=language==='en',f=await fixture(page.context());
 try{
  const rows=Array.from({length:2},(_,i)=>({owner_id:f.owner.id,work_id:f.workId,id:crypto.randomUUID(),title:'BATCH_EDITOR_'+i,details:'PRESERVE_EDITOR_DETAILS',assignee:'José local',due_date:crTodayISO(),status:'open',archived:false,revision:1})).sort((a,b)=>a.id.localeCompare(b.id));await f.db.from('pro_work_tasks').insert(rows).throwOnError();const before=await preserved(f),posts:string[]=[],draftKey='ccr:pro:work-task-draft:v1:'+f.owner.id+':'+encodeURIComponent(f.workId),batchKey='ccr:pro:task-center-batch:v1:'+f.owner.id;let lose=true,resolveLost:()=>void=()=>{};const lost=new Promise<void>(resolve=>{resolveLost=resolve;});
  await page.route('**/api/pro/work-tasks**',async route=>{if(route.request().method()==='POST'){posts.push(route.request().postData()!);if(lose){lose=false;const response=await route.fetch();expect(response.status()).toBe(200);await route.fulfill({status:503,json:{error:'LOCAL_LOST_AFTER_COMMIT'}});resolveLost();return;}}await route.continue();});
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_tasks`);const center=page.locator('[data-task-center]'),batch=center.locator('[data-task-center-batch]'),visible=center.locator('[data-task-center-item]:visible');await expect(center).toBeVisible({timeout:45000});await expect(visible).toHaveCount(2);for(const checkbox of await visible.getByRole('checkbox').all())await checkbox.check();
  await page.evaluate(key=>sessionStorage.setItem(key,'PRESERVE_ORIGINAL_DRAFT'),draftKey);await applyBatch(page,en);await expect(center.getByRole('alert')).toBeVisible();expect(posts).toEqual([]);expect(await page.evaluate(key=>localStorage.getItem(key),batchKey)).toBeNull();expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe('PRESERVE_ORIGINAL_DRAFT');await page.evaluate(key=>sessionStorage.removeItem(key),draftKey);
  await applyBatch(page,en);await expect.poll(()=>posts.length).toBe(1);await lost;await expect(batch).toBeVisible();const exact=posts[0];await page.reload();await expect(batch).toBeVisible({timeout:45000});expect(posts).toEqual([exact]);const retained=await page.evaluate(key=>localStorage.getItem(key),batchKey);expect(retained).not.toBeNull();
  const canonical=(await task(page,f,rows[0].id)).task,draft=JSON.stringify({task:workTaskSchema.parse(canonical),values:{title:'BATCH_RETAINED_EDITOR_DRAFT',dueDate:canonical.dueDate??'',assignee:canonical.assignee,details:canonical.details}});await page.evaluate(({key,value})=>sessionStorage.setItem(key,value),{key:draftKey,value:draft});await batch.getByRole('button',{name:en?'Continue batch':'Continuar lista',exact:true}).click();await expect(center.getByRole('alert')).toBeVisible();expect(posts).toEqual([exact]);
  await batch.getByRole('button',{name:en?'Open original job':'Abrir trabajo original',exact:true}).click();const editor=page.locator('[data-work-task-form]');await expect(editor.getByLabel(en?'Task':'Tarea',{exact:true})).toHaveValue('BATCH_RETAINED_EDITOR_DRAFT',{timeout:45000});expect(await page.evaluate(key=>localStorage.getItem(key),batchKey)).toBe(retained);expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(draft);
  await editor.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();const confirmation=page.getByRole('dialog').last();await confirmation.getByRole('button',{name:en?'Keep editing':'Seguir editando',exact:true}).click();await expect(editor).toBeVisible();expect(await page.evaluate(key=>sessionStorage.getItem(key),draftKey)).toBe(draft);
  await editor.getByRole('button',{name:en?'Cancel':'Cancelar',exact:true}).click();await confirmation.getByRole('button',{name:en?'Discard changes':'Descartar cambios',exact:true}).click();await expect(editor).toHaveCount(0);
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_tasks`);await expect(batch).toBeVisible({timeout:45000});expect(posts).toEqual([exact]);await batch.getByRole('button',{name:en?'Continue batch':'Continuar lista',exact:true}).click();await expect(batch.getByRole('button',{name:en?'Close summary':'Cerrar resumen',exact:true})).toBeVisible();expect(posts).toHaveLength(3);expect(posts[1]).toBe(exact);await batch.getByRole('button',{name:en?'Close summary':'Cerrar resumen',exact:true}).click();await expect(batch).toHaveCount(0);
  for(const row of rows){const result=await task(page,f,row.id);expect(result.task).toMatchObject({title:row.title,status:'done',revision:2});expect(result.history).toHaveLength(1);}expect(await preserved(f)).toEqual(before);await expectNoHorizontalOverflow(page);
 }finally{await page.goto('about:blank').catch(()=>{});await cleanupDisposableAccount(f.owner);}
});
