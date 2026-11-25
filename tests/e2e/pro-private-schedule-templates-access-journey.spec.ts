import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {stableSnapshotRows} from './stable-rows';
const origin='http://127.0.0.1:3185',api='/api/pro/work-tasks',core='/api/pro/lead-private-core',workApi='/api/pro/lead-private-work',planApi='/api/pro/work-schedule';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();expect(result.data.session).not.toBeNull();return result.data.session!.access_token;}
async function fixture(context:BrowserContext){await stabilizeLocalProRuntime(context,origin);const owner=await createDisposableAccount({prefix:'private-tools-owner'}),db=regressionAdminClient();try{const user=(await db.auth.admin.getUserById(owner.id)).data.user!;expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...user.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();const document=emptyBusiness(),clientId='private-origin-client',secondClient='private-origin-other',workId=crypto.randomUUID(),completedId=crypto.randomUUID(),today=crTodayISO();document.clients=[{id:clientId,name:'Cliente privado sin cuenta',email:'',phone:'',notes:'Conservar cliente',archived:false},{id:secondClient,name:'Cliente alternativo',email:'',phone:'',notes:'Conservar otro',archived:false}];document.work=[{id:workId,clientId,client:'Cliente privado sin cuenta',service:'Trabajo existente sin programar',stage:'new',start:'',end:'',cancelled:false},{id:completedId,clientId,client:'Cliente privado sin cuenta',service:'Trabajo concluido previo',stage:'completed',start:today+'T09:00:00-06:00',end:today+'T10:00:00-06:00',cancelled:false}];await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();const token=await login(context,owner);for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(endpoint,{timeout:45000})).status()).toBe(200);for(const id of [workId,completedId])expect((await context.request.get('/api/pro/client-operations?'+new URLSearchParams({workId:id,clientId}),{timeout:45000})).status()).toBe(200);expect((await db.from('professionals').select('id').eq('profile_id',owner.id).throwOnError()).data).toEqual([]);return{owner,db,token,clientId,secondClient,workId,completedId};}catch(error){await cleanupDisposableAccount(owner);throw error;}}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function cleanup(f:Fixture){await cleanupDisposableAccount(f.owner);}
function input(f:Fixture,channel:{id:string;revision:number}|null=null){return{action:'create_lead',actionId:crypto.randomUUID(),channel,lead:{action:'create',actionId:crypto.randomUUID(),kind:'manual',id:crypto.randomUUID(),revision:0,catalogRevision:0,clientId:f.clientId,title:'Solicitud privada sin directorio',description:'Descripción privada conservada',address:'Ubicación por definir',sourceLabel:'Referencia manual anterior',forecast:{projectType:'Instalación',expectedStart:'2024-02-29',currency:'USD',revenueCents:125050,budgetCents:null,profitCents:-2575},stageMode:'automatic',stageId:null}};}
async function post(context:BrowserContext,actor:DisposableAccount,body:unknown,path=api){return context.request.post(path,{headers:{Origin:origin,'X-Pro-Expected-Actor':actor.id},data:body});}
async function snapshot(f:Fixture){const result:Record<string,unknown>={};for(const table of ['pro_workspaces','pro_work','pro_clients','pro_quote_links','pro_client_entries','pro_work_cost_entries'])result[table]=stableSnapshotRows((await f.db.from(table).select('*').eq('user_id',f.owner.id).throwOnError()).data);for(const table of ['pro_appointment_requests','pro_request_quotes','pro_request_followups'])result[table]=stableSnapshotRows((await f.db.from(table).select('*').eq('owner_id',f.owner.id).throwOnError()).data);for(const table of ['notifications','notification_push_outbox'])result[table]=stableSnapshotRows((await f.db.from(table).select('*').eq('user_id',f.owner.id).throwOnError()).data);result.directory=stableSnapshotRows((await f.db.from('professionals').select('*').eq('profile_id',f.owner.id).throwOnError()).data);for(const key of Object.keys(result))if(Array.isArray(result[key]))result[key]=(result[key] as unknown[]).toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return result;}
async function state(f:Fixture){const result:Record<string,unknown>={};for(const table of ['pro_lead_center_records','pro_lead_center_actions','pro_lead_center_history','pro_lead_origin_assignments','pro_lead_origin_actions','pro_lead_origin_history','pro_lead_origin_creates','pro_request_pipeline_heads','pro_request_pipeline_stages'])result[table]=stableSnapshotRows((await f.db.from(table).select('*').eq('owner_id',f.owner.id).throwOnError()).data)?.toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return result;}
async function seed(context:BrowserContext,f:Fixture,id=crypto.randomUUID()){const body={...input(f).lead,id},response=await post(context,f.owner,body,core);expect(response.status()).toBe(200);return{body,result:await response.json()};}
function conversion(leadId:string,leadRevision=1,workId=crypto.randomUUID()){return{action:'convert',actionId:crypto.randomUUID(),leadId,leadRevision,workId};}
async function prepare(context:BrowserContext,f:Fixture){const lead=await seed(context,f),command=conversion(lead.body.id),response=await post(context,f.owner,command,workApi);expect(response.status()).toBe(200);const result=await response.json();return{lead,result,workId:result.link.workId as string};}
function taskInput(workId:string){return{action:'create',actionId:crypto.randomUUID(),workId,taskId:crypto.randomUUID(),revision:0,title:'Tarea privada%_literal',details:'Detalles privados conservados',dueDate:'2024-02-29',assignee:'Carlos manual'};}


async function graph(context:BrowserContext,f:Fixture,workId:string) {
 const a=taskInput(workId),b={...taskInput(workId),title:'Preparación privada'};
 for(const task of [a,b]) expect((await post(context,f.owner,task)).status()).toBe(200);
 const phaseId=crypto.randomUUID(),milestoneId=crypto.randomUUID();
 const commands=[
  {action:'phase_save',actionId:crypto.randomUUID(),workId,revision:0,phaseId,title:'Fase privada',position:0},
  {action:'task_plan',actionId:crypto.randomUUID(),workId,revision:1,taskId:b.taskId,phaseId,plannedStart:'2024-02-28',plannedEnd:'2024-02-28',dependsOn:[]},
  {action:'task_plan',actionId:crypto.randomUUID(),workId,revision:2,taskId:a.taskId,phaseId,plannedStart:'2024-02-29',plannedEnd:'2024-03-01',dependsOn:[b.taskId]},
  {action:'milestone_save',actionId:crypto.randomUUID(),workId,revision:3,milestoneId,title:'Entrega privada',date:'2024-03-01',notes:'Nota privada del hito'}
 ];
 for(const command of commands) expect((await post(context,f.owner,command,planApi)).status()).toBe(200);
 return {a,b,phaseId,milestoneId};
}
async function workRows(f:Fixture,workId:string) {
 const result:Record<string,unknown>={};
 for(const table of ['pro_work_tasks','pro_work_task_history','pro_work_schedule_heads','pro_work_schedule_phases','pro_work_schedule_plans','pro_work_schedule_dependencies','pro_work_schedule_milestones']) {
  result[table]=stableSnapshotRows((await f.db.from(table).select('*').eq('owner_id',f.owner.id).eq('work_id',workId).throwOnError()).data)?.toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 }
 return result;
}

for(const language of ['es','en'] as const) {
 test(`Private plan templates journey: capture and recover an exact append without a public profile (${language})`,async({page,baseURL},info)=>{
  test.setTimeout(180000);local(baseURL);const en=language==='en',f=await fixture(page.context());
  const bodies:string[]=[],errors:string[]=[];
  try {
   const source=await prepare(page.context(),f),target=await prepare(page.context(),f),ids=await graph(page.context(),f,source.workId);
   const before=await snapshot(f),privateBefore=await state(f),sourceBefore=await workRows(f,source.workId);
   let lose=true,resolveLost:()=>void=()=>{};
   const lost=new Promise<void>(resolve=>{resolveLost=resolve;});
   onAppPageError(page,message=>errors.push(message));
   await page.route('**/api/pro/schedule-templates**',async route=>{
    if(route.request().method()==='POST'&&route.request().postDataJSON().action==='apply') {
     bodies.push(route.request().postData()!);
     if(lose) {
      lose=false;
      const response=await route.fetch();expect(response.status()).toBe(200);
      await route.fulfill({status:503,json:{error:'LOCAL_PRIVATE_PLAN_ACK_LOST'}});
      resolveLost();return;
     }
    }
    await route.continue();
   });
   const url=(id:string)=>`/${language}/dashboard/pro?tab=pro_agenda&cita=${id}&vistaTrabajo=tasks&vistaTareas=plan`;
   await gotoOK(page,url(source.workId));
   await expect(page.locator('[data-schedule-templates-trigger]')).toBeEnabled();
   await page.locator('[data-schedule-templates-trigger]').click();
   const modal=page.locator('[data-schedule-templates-modal]'),catalogue=modal.locator('[data-schedule-templates-catalogue]');
   await catalogue.getByRole('button',{name:en?'Save this plan as template':'Guardar este plan como plantilla',exact:true}).click();
   const capture=modal.locator('[data-schedule-template-capture]');
   await capture.getByLabel(en?'Name':'Nombre',{exact:true}).fill('Plan privado sin perfil público');
   await expect(capture.getByLabel(en?'Original plan start date':'Inicio del plan original',{exact:true})).toHaveValue('2024-02-28');
   for(const id of [ids.a.taskId,ids.b.taskId]) {
    const checkbox=capture.locator(`[data-schedule-template-source-task="${id}"]`).getByRole('checkbox');
    await expect(checkbox).toBeEnabled();await checkbox.check();
   }
   await capture.locator(`[data-schedule-template-source-milestone="${ids.milestoneId}"]`).getByRole('checkbox').check();
   await capture.getByRole('button',{name:en?'Save plan template':'Guardar plantilla del plan',exact:true}).click();
   const card=catalogue.locator('[data-schedule-template]').filter({hasText:'Plan privado sin perfil público'});
   await expect(card).toBeVisible();
   await page.getByRole('dialog',{name:en?'Plan templates':'Plantillas del plan',exact:true}).getByRole('button',{name:en?'Close':'Cerrar',exact:true}).click();
   await expect(modal).toHaveCount(0);
   await gotoOK(page,url(target.workId));
   await expect(page.locator('[data-schedule-templates-trigger]')).toBeEnabled();
   await page.locator('[data-schedule-templates-trigger]').click();
   await card.getByRole('button',{name:en?'Apply to this job':'Aplicar a este trabajo',exact:true}).click();
   await modal.getByLabel(en?'Start date':'Fecha de inicio',{exact:true}).fill('2025-02-28');
   await modal.getByRole('button',{name:en?'Preview':'Vista previa',exact:true}).click();
   const preview=modal.locator('[data-schedule-template-preview]');
   await expect(preview.locator('[data-schedule-template-preview-task]')).toHaveCount(2);
   await expect(preview).toContainText('Fase privada');await expect(preview).toContainText('Entrega privada');
   await expect(preview).not.toContainText(ids.a.details);await expect(preview).not.toContainText(ids.a.assignee);
   expect(bodies).toEqual([]);
   await expectNoHorizontalOverflow(page);
   await page.screenshot({path:info.outputPath('private-plan-template-preview-'+language+'.png'),animations:'disabled'});
   await preview.getByRole('button',{name:en?'Apply plan template':'Aplicar plantilla del plan',exact:true}).click();
   await page.getByRole('dialog').last().getByRole('button',{name:en?'Apply plan template':'Aplicar plantilla del plan',exact:true}).click();
   await lost;
   const recovery=modal.locator('[data-schedule-template-recovery]');
   await expect(recovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true})).toBeEnabled();
   expect(bodies).toHaveLength(1);
   const exact=bodies[0],operation=JSON.parse(exact),committed=await workRows(f,target.workId);
   expect(operation).toMatchObject({action:'apply',workId:target.workId,workRevision:0,startDate:'2025-02-28'});
   expect((committed.pro_work_tasks as {id:string}[]).map(task=>task.id).toSorted()).toEqual(operation.taskIds.toSorted());
   expect((committed.pro_work_schedule_heads as {revision:number}[])[0].revision).toBe(4);
   const timeOrigin=await page.evaluate(()=>performance.timeOrigin);
   page.once('dialog',async dialog=>{expect(dialog.type()).toBe('beforeunload');await dialog.accept();});
   expect((await page.reload())?.status()).toBe(200);
   expect(await page.evaluate(()=>performance.timeOrigin)).not.toBe(timeOrigin);
   await expect(recovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true})).toBeEnabled({timeout:45000});
   expect(bodies).toEqual([exact]);
   await recovery.getByRole('button',{name:en?'Check saved result':'Comprobar guardado',exact:true}).click();
   await expect(recovery).toHaveCount(0);expect(bodies).toEqual([exact]);
   expect(await workRows(f,target.workId)).toEqual(committed);
   expect(await workRows(f,source.workId)).toEqual(sourceBefore);
   expect(await snapshot(f)).toEqual(before);expect(await state(f)).toEqual(privateBefore);expect(errors).toEqual([]);
  } catch(error) {
   await page.screenshot({path:info.outputPath('private-plan-template-failure.png'),animations:'disabled'}).catch(()=>{});throw error;
  } finally {await page.goto('about:blank').catch(()=>{});await cleanup(f);}
 });
}
